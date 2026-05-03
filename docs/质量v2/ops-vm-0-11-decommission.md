# 操作清单 · 处理 VM-0-11-opencloudos 双胞胎 worker

## 背景

实测发现 PG 库 `124.156.192.230/author` 同时被两个 mn-worker 进程连：

| host | IP | hostname | WORKER_ID |
|---|---|---|---|
| **本机** | 43.156.49.59 | VM-4-6-opencloudos | `prod-TencentOpenClaw` |
| **另一台** | 221.195.29.81 | VM-0-11-opencloudos | `prod-TencentOpenClaw` |

两台都在 60s 周期 poll `mn_runs` 抢 queued run，且远端 VM-0-11 的进程 (pid 390917) 自 May 2 22:08 起一直没重启 → **跑在它本地的旧代码上**。任何在本机改的 fix（Phase 0 F-snap、Phase 8 longitudinal）会被它一半概率抢走，验证不到。

## 三种处理方式（按推荐排序）

### 方式 A · 下线 VM-0-11 上的 mn-worker（最干净，推荐）

如果 VM-0-11 不需要承担 mn 任务（仅是历史遗留启动）：

```bash
# 1. SSH 进 VM-0-11
ssh root@221.195.29.81

# 2. 停 pm2 worker
pm2 stop mn-worker
pm2 delete mn-worker
pm2 save

# 3. 防开机自启
pm2 unstartup
# 或保留 startup 但不要 mn-worker 的 dump

# 4. 验证已下线（远端机执行）
ps -ef | grep mn-worker | grep -v grep    # 应无输出
```

回到本机验证只剩一台：

```bash
# 在 PG 上看 client_addr
SELECT DISTINCT client_addr FROM pg_stat_activity
 WHERE application_name LIKE '%pipeline%' OR datname='author';
# 期望只有 43.156.49.59（本机）
```

---

### 方式 B · 让 VM-0-11 改 WORKER_ID（如果还要它跑别的任务）

VM-0-11 上：

```bash
# 1. SSH 进
ssh root@221.195.29.81

# 2. 改 .env
cd /path/to/pipeline/api
sed -i 's/^WORKER_ID=prod-TencentOpenClaw$/WORKER_ID=prod-vm-0-11/' .env
grep WORKER_ID .env  # 验证

# 3. pm2 重启拉新 env
pm2 restart mn-worker --update-env
pm2 logs mn-worker --lines 20 | grep WORKER_ID  # 期望日志里显示新 id
```

回到本机的 `api/config/run-routing.json`，原本路由到 `prod-TencentOpenClaw` 的规则（claude-cli rule, priority 10）现在只匹配本机 worker；要让 VM-0-11 仍能接 claude-cli 任务，加并列规则：

```json
{
  "module": "mn",
  "model_pattern": "claude-cli*",
  "worker_id": "prod-vm-0-11",
  "priority": 11,
  "notes": "claude-cli 备用 worker (VM-0-11)"
}
```

或保持只走主 worker，让 VM-0-11 只跑特定 axis（按 axis_pattern 区分）。

---

### 方式 C · 临时手动 pin（短期开发）

不动 VM-0-11，手动给 smoke run 加 pin（已在 Phase 8 验证步骤里使用过）：

```bash
# 本机 .env 临时改
sed -i 's/^WORKER_ID=prod-TencentOpenClaw/WORKER_ID=tencent-vm-4-6-test/' /proweb/run/pipeline/api/.env
pm2 restart mn-worker --update-env

# INSERT smoke run with target_worker='tencent-vm-4-6-test' 强制本机独占

# 验证完恢复
sed -i 's/^WORKER_ID=tencent-vm-4-6-test/WORKER_ID=prod-TencentOpenClaw/' /proweb/run/pipeline/api/.env
pm2 restart mn-worker --update-env
```

适合一次性验证，不适合常态。

---

## 推荐落地

1. **先确认 VM-0-11 是否还要跑 mn**：
   - 若否 → **方式 A**（停 + 删 pm2 entry）
   - 若是 → **方式 B**（改它的 WORKER_ID 为唯一）
2. 长期来看，加一个不变量：**全局 WORKER_ID 唯一**。可以在 run-routing.json `workers.{}` 注册表里把每个 host 列清楚（已部分有 `huoshanpro` / `prod-TencentOpenClaw` / `TencentNodeDB`），每条 host 一行，不允许重名。
3. 落地后跑一次 Scope B (装修信托 6 场) 的 axis=all run，应该能稳定全程在本机执行；mn_axis_versions 自动 +N 行，`mn_decision_tree_snapshots` / `mn_belief_drift_series` 自动 +N 行。

## 当前已做的"软防御"

Fix A + Fix B（commit `759ee00`）只解决 pm2 restart 期间的瞬时 race，无法解决双胞胎问题。所以本 doc 是必须配套执行的运维步骤。
