# Worker 路由规则诊断 + 改进建议

## 现象

Phase 8 验证时连续两次 smoke run 出问题：

| run | worker_id 戳记 | pm2 当时 worker pid | 现象 |
|---|---|---|---|
| `108b2809` | `host:390917:1777744136668` | `1108891`（restart 前 1m 起来） | 旧 pid 390917 (已 SIGKILL 不在 ps 中) 仍处理了这条 run |
| `b62a1091` | `host:1108909:1777795403922` | `1108891 / 1108909` (新 worker) | 跑在新 worker，但 multi-meeting finalize 段没触发 |

第一条说明 **pm2 restart 与 worker pickup 存在竞态**：旧进程在 SIGKILL 之前仍能 claim 新 queued run，结果新代码不生效。

第二条另有原因（finalize 段判定异常），归到 Phase 8 调查。

## 现有路由规则

来自 `api/config/run-routing.json` + `runEngine.ts`：

| 阶段 | 规则 |
|---|---|
| **入队** (`enqueueRun`) | 按 `run-routing.json` 解析 `target_worker`：claude-cli → `prod-TencentOpenClaw`；其它 (multi-axis / api-oneshot) → `null` |
| **拣选** (`recoverQueuedRuns`，60s 轮询) | `WHERE state='queued' AND module='mn' AND (target_worker IS NULL OR target_worker = $WORKER_ID)` |
| **claim** (`execute` 内) | atomic `UPDATE ... WHERE state='queued' RETURNING id`，写入 `worker_id = host:pid:start-epoch` |

`WORKER_ID` 来自 `.env`，本机是 `prod-TencentOpenClaw`。

## 4 个潜在 race / 漏洞

### 1. pm2 restart 期间「旧进程抢拿」

**触发条件**：`pm2 restart` 时旧进程默认有 1.6s `kill_timeout` 才被 SIGKILL。在这段窗口内：

- 老进程 in-memory queue 还在 tick；其 60s reaper 也仍在跑
- 用户/前端新 INSERT 一条 `state='queued'` 的 run
- 老进程的 reaper 或 in-memory queue 优先抢到 → atomic UPDATE 命中 → 老进程 execute()
- 老进程的 worker_id 已是 stale pid，但 mn_runs.worker_id 字段被写成它的 stale 值
- 老进程跑的是**未更新的源代码**，新加的 fix 不生效（这次 Phase 0 的 F-snap / Phase 8 的 longitudinal 都中招）

**实测证据**：run 108b2809 worker_id `host:390917:...`，pid 390917 当前 `ps` 不存在，说明它在跑完后才被 SIGKILL；新代码完全没跑。

### 2. `target_worker IS NULL` → 任意 worker 抢

兜底规则把 multi-axis run 的 `target_worker` 留成 `NULL`，导致：

- recoverQueuedRuns 的 `WHERE target_worker IS NULL OR ...` 让**任何 module='mn' 的 worker** 都能拿
- 当前部署只有 1 个 worker（`prod-TencentOpenClaw`），表面看不到问题；但 pm2 restart 时的双进程过渡期 = 短暂 2 worker → 触发上面 race 1
- 未来如果加 2nd worker（哪怕只是为容灾），这条规则会让两 worker 抢

### 3. claim 阶段 worker_id stamp 不验生命周期

`UPDATE ... worker_id = $this.workerId` 直接写入。没有检查"该 workerId 关联的 process 是否还活着"。reaper 后台清扫只看 heartbeat 超时（`MN_HEARTBEAT_STALE_MIN=45` 分钟）—— 远比 pm2 restart 间隔长，覆盖不到这种短暂 race。

### 4. 入队 / 拣选 / 执行不保证同进程

- 老进程的 in-memory `queue` 装着一份 payload
- 新进程启动后 reaper 把同一 run 重新拉到自己的 in-memory queue（`recoverQueuedRuns` 不去重 in-memory；它假设进程独占）
- 两边都尝试 claim → atomic UPDATE 让一边赢；但赢的可能是老进程

## 改进建议（按收益 / 改动量排序）

### A · 入队时把 `target_worker` 钉到具体 WORKER_ID（小改动、立即收益）

修改 `run-routing.json` 兜底规则：把 `worker_id: null` 改成 `worker_id: "${WORKER_ID}"`，让 resolver 在解析时读环境变量 fallback：

```json
{ "priority": 999, "worker_id": "${WORKER_ID}", "notes": "兜底 - 钉到当前 host 的 WORKER_ID" }
```

**效果**：所有新入队 run 都有具体 target_worker，老进程的 reaper 拿到的 run target_worker 是它自己的 WORKER_ID（同 env），但 atomic claim 仍可能被它抢 —— 这条单独不能解决 race 1，需配合 B/C。

### B · `recoverQueuedRuns` 加 min-age filter（安全垫，10s）

```sql
WHERE state='queued' AND module='mn'
  AND (target_worker IS NULL OR target_worker = $1)
  AND created_at < NOW() - INTERVAL '10 seconds'
```

**效果**：新 INSERT 的 run 至少要存在 10s 才被拉。pm2 restart 通常在 1-2s 内完成 SIGTERM → SIGKILL → 新进程启动；新 run 在 10s 后被新进程的第一轮 reaper 拣选。代价：每条 run 多 ≤10s 入队延迟。

### C · pm2 kill_timeout + worker 优雅停机（最强防线）

修改 `mn-worker.config.cjs`：

```js
kill_timeout: 30000,  // 30s 给老进程优雅停机时间
listen_timeout: 10000,
shutdown_with_message: true,  // pm2 发 'shutdown' 消息而不是 SIGINT
```

worker 内 hook SIGTERM / `process.on('message', ...)`：

```ts
process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received - stop polling, drain in-flight');
  runEngine.stopRecover();   // 停 60s 周期 reaper
  await runEngine.drain();   // 等当前 in-flight 跑完
  process.exit(0);
});
```

**效果**：pm2 restart 时老进程**主动停止 claim 新 run**，把所有新 run 留给新进程；in-flight 跑完才退出。彻底消除 race 1。

### D · run claim 时校验进程仍活（防御性）

execute 开头：

```ts
if (process.pid !== ENGINE_PID_AT_BOOT) { /* never happens unless eval */ }
```

不需要做（pid 在 process 生命周期内不变）。但可以记录"claim 时 pid 与 enqueue 时 routing 的 worker hint 是否一致"。改动复杂、收益小，不做。

## 推荐落地

- **立即做（小改）**：A + B（已 commit `759ee00`）
- **真正彻底**：C（需要测试 pm2 优雅停机 + drain 实现）

A + B 加起来 < 30 行代码 + 1 个 SQL 加 INTERVAL filter。C 是基础设施级别改动，单独排期。

## 后续发现 · "双胞胎 WORKER_ID" 才是真正的 race 来源

实施 A+B 后跑 smoke 仍然命中老 worker。深挖 `pg_stat_activity` 发现：

- `client_addr=43.156.49.59` (本机 VM-4-6-opencloudos)
- `client_addr=221.195.29.81` (另一台 VM-0-11-opencloudos)

两台都连同一个 PG 库 `124.156.192.230/author`，**两台都设了 `WORKER_ID=prod-TencentOpenClaw`**：

- 本机 pid 1139386，刚 restart
- 远程 VM-0-11 pid 390917，从 May 2 22:08 持续运行

worker_id stamp（mn_runs.worker_id）显示最近 2 小时的 stamp：

| worker_id | 来源 | 次数 |
|---|---|---|
| `VM-0-11-opencloudos:390917:1777744136668` | 另一台 VM 老进程 | 2 |
| `host:1108909:1777795403922` | 本机 1108909（早一轮 pm2 restart） | 1 |
| `host:938926:1777791265240` | 本机 938926（更早 pm2 restart） | 1 |
| `host:97720:1777793042401` | 本机 97720（更早） | 1 |
| `null` | 老 ceo run 残留 | 1 |

→ 我的 smoke run 大多数被**另一台 VM** 的老进程抢去用旧代码跑。这不是 pm2 restart race（A+B 修的那个），是**两台真实 worker 双开**。

### 这条 race 的解法（C++）

1. **强制 WORKER_ID 唯一**：每台机器一个不同的 ID（如 `prod-tencent-A` / `prod-tencent-B`），`run-routing.json` 显式列出每条规则路由到哪台。本机 `.env` 改成 `WORKER_ID=tencent-vm-4-6` 之类。
2. **入队时校验**：resolveTargetWorker 必须返回非 null（或 sentinel），不允许任何规则保持"任意 worker 都能拿"的 NULL 兜底；本次 Fix A 的 `${WORKER_ID}` sentinel 已实现。
3. **claim 时校验 hostname**：`UPDATE ... WHERE state='queued' AND (target_worker IS NULL OR target_worker = $1) AND <hostname check>` —— 防御性，不必。
4. **下线另一台 VM 上的老 worker**（最直接，但需要远程操作 VM-0-11，不在本会话能做）。

**当前状态**：A+B 仅消除 pm2 restart 的瞬时 race；双开 race 需要协调两台机器的 env / config。Phase 8 的代码本身可能没问题，但因为大多数 smoke run 跑到了远端旧代码上，所以验证结果一直是"没生效"假象。

### 验证 Phase 8 的临时手段

将本机 `.env` 临时改 `WORKER_ID=tencent-vm-4-6-test`，pm2 restart，INSERT smoke run 时显式 `target_worker='tencent-vm-4-6-test'` —— 远端老 worker 不会拣选（其 WORKER_ID 是 `prod-TencentOpenClaw`），新代码独占该 run。验证完恢复 `.env`。

## 相关：第二个问题（finalize 段不进）

run b62a1091 跑在新 worker 但 multi-meeting finalize 没 fire（axis_versions 没新 row）。
和 worker 路由无关 —— 是 runEngine.execute() 内某个分支条件异常。Phase 8 调查另起。

可能方向：
- `if (!payload.meetingId)` 路径里 `allMeetingIds = collectMeetingIdsForScope(payload)` 抛异常被 catch 吞了
- 或 collectMeetingIdsForScope 对 scope_id 已是 UUID 的 project scope 返回 0
- 或 payload.scope.id 为 undefined（INSERT 时填的 scope_id 没传到 queue payload）
- 需要在 worker 加诊断 log 重跑一次确定
