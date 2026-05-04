# 多 Worker 注册 / 路由设计

> 适用：未来 1-N 台 mn-worker / ceo-worker / expert-worker 接入流水线
> 配套运行时：`api/src/modules/run-routing/service.ts`（host 自检）、`api/config/run-routing.json`（注册表）。本文与一键脚本同在仓库 **`onekeydeploy/`**；在仓库根执行 **`bash onekeydeploy/remote-pipeline-sync.sh`**。
> 前置：commit `5d24678 (worker host 自检防双胞胎)`

## 1. 设计目标

| 目标 | 实现机制 |
|---|---|
| **WORKER_ID 全局唯一** | 启动 host 自检：env WORKER_ID 必须命中 `workers.{ID}.host` 或 `host_aliases`，否则 fallback 到 `host-<hostname>` |
| **新 worker 一处注册即可被路由** | `run-routing.json` 是单一来源（rules + workers 注册表），主仓库 push 后所有节点 git pull 同步 |
| **支持灵活路由策略** | rules 按 `module / axis_pattern / model_pattern / scope_id` glob 匹配；priority 升序，第一条命中胜出 |
| **支持工作负载隔离** | `runtime.accept_modules` / `reject_modules` 白/黑名单；`runtime.concurrency` 控并发 |
| **支持容灾 / 临时下线** | `enabled: false` 即可让某 worker 不参与路由（保留配置便于复活） |

## 1.5 唯一性是怎么保证的（git 同步 + 一处注册）

`run-routing.json` 是 **git 共享的全局拓扑表**，每台机器看到一样的 workers 注册表 + rules。但每台机器的 `WORKER_ID` 不一样。两者怎么对齐？

```
                    ┌───────────────────────────────────────────┐
git 同步            │  run-routing.json · workers 注册表        │
                    │  prod-cli-tencent → host_aliases          │
                    │    ["VM-4-6-opencloudos","10.3.4.6"]      │
                    │  prod-vm-0-11 → host_aliases              │
                    │    ["VM-0-11-opencloudos","172.x.y.z"]    │
                    └─────────────────┬─────────────────────────┘
                                      │
                                      │ 启动时拉同一份配置
                ┌─────────────────────┴────────────────────┐
                │                                          │
            ┌───▼─────────────────┐               ┌────────▼──────────┐
            │ Host A · VM-4-6     │               │ Host B · VM-0-11  │
            │ os.hostname()       │               │ os.hostname()     │
            │   = VM-4-6...       │               │   = VM-0-11...    │
            │ interfaces:         │               │ interfaces:       │
            │   10.3.4.6          │               │   172.x.y.z       │
            └───────┬─────────────┘               └────────┬──────────┘
                    │                                      │
            getWorkerId() 反查 ↓                getWorkerId() 反查 ↓
            匹配 prod-cli-tencent                匹配 prod-vm-0-11
            的 host_aliases ✓                    的 host_aliases ✓
                    │                                      │
            WORKER_ID = prod-cli-tencent          WORKER_ID = prod-vm-0-11
```

`getWorkerId()` 三档解析（按优先级）：

1. **env WORKER_ID 已设** → 校验 env 声明的 ID 在注册表里 host_aliases 是否包含本机标识。**命中保留**，**不命中 fallback**（防冒名）
2. **env 未设** → 用 `os.hostname()` + 所有非 loopback IPv4 反查注册表，找唯一 host_aliases 命中的 `<id>`，命中即用之（**自动注册**）
3. **都未命中** → `host-<hostname>` fallback（仅消费 target_worker = NULL 或 = 该 host 自己生成的 id 的 run）

启动日志里能看到结果：

```
[run-routing] WORKER_ID resolved: "prod-TencentOpenClaw" (env, registry-validated)
[run-routing] WORKER_ID resolved: "prod-vm-0-11" (auto-detected from workers registry)
[run-routing] WORKER_ID resolved: "host-some-vm" (fallback, no env + no registry match)
```

**注册表一致性审计**：启动时也会扫一遍 `workers.{}`，如果同一 alias 出现在 2+ worker 里，打 WARN 并让 auto-detect 拒绝猜测：

```
[run-routing] registry audit · alias "VM-4-6-opencloudos" is registered to BOTH
  workers.prod-TencentOpenClaw and workers.huoshanpro; auto-detect cannot disambiguate.
```

**结论**：

- **正确做法**：所有机器都不在 `.env` 设 `WORKER_ID`，让 auto-detect 从注册表反查（注册表是唯一来源，单一改动点）
- **过渡做法**：保留 `.env WORKER_ID`，启动时校验"声明 ID 是否真属于本机"
- **错误做法**：两台机器 `.env` 设同一个 `WORKER_ID` → host 自检会拦下来（fallback），不会冒名抢任务

## 2. WORKER_ID 命名规范

格式：`<env>-<role>-<host-tag>` 或更简短的 `<env>-<host-tag>`

| 示例 | 含义 |
|---|---|
| `prod-TencentOpenClaw` | 老格式，保留兼容；新接入避免再用容易撞名的 |
| `prod-vm-0-11` | 推荐：`prod` 环境 + 主机短标识 |
| `prod-cli-tencent-vm-4-6` | 强可读：环境 + 角色（claude-cli）+ 主机 |
| `prod-mn-vm-0-11` | 环境 + 模块限定 + 主机（限定 `accept_modules: ["mn"]` 时） |
| `dev-yz` / `local-mac` | 开发机用环境前缀 |
| `host-<hostname>` | **保留给 fallback**，不要手动用 |

约束：

- 全小写 + 连字符（`a-z0-9-`）
- 不含 `.` 或 `:`（避免与 internal stamp `host:pid:epoch` 混淆）
- 不超过 32 字符（mn_runs.target_worker 字段是 text，无硬上限，但 < 32 字便于看）
- 全局唯一（所有节点拼起来不重复）

## 3. 添加新 Worker 的标准流程

### 3.1 准备阶段（在主仓库）

1. 决定 `WORKER_ID`（参考 §2 命名规范）
2. 拿到目标机器的：
   - 公网 IP（如有）
   - 内网 IP（`ip -4 addr show | grep inet`）
   - hostname（`hostname`）
   - 或在目标机执行 `bash onekeydeploy/worker-host-info.sh` 一键收集（输出可贴进 `host_aliases`）
3. 确认能 SSH 登录
4. 确认仓库已 deploy 在目标机

### 3.2 在 `api/config/run-routing.json` 注册

在 `"workers": {}` 加一条：

```json
"<WORKER_ID>": {
  "enabled": true,
  "tags": ["<role-tags>"],
  "host": "<公网 IP>",
  "host_aliases": ["<hostname>", "<内网 IP>"],
  "ssh": { "user": "root", "port": 22 },
  "deploy": {
    "repo": "<目标机器仓库路径>",
    "api_dir": "<api 目录>",
    "worker_log": "/tmp/mn-worker-out.log",
    "pm2_app": "mn-worker",
    "sync_mode": "git",
    "rebuild_dist": ["api"]
  },
  "runtime": {
    "concurrency": 1,
    "accept_modules": ["mn"],
    "env_extra": { "WORKER_ID": "<WORKER_ID>" }
  },
  "health": { "url": null },
  "notes": "<一句话说明这台机器干嘛的>"
}
```

> **`host_aliases` 必填**当 `host` 是公网 IP 时（NAT 场景）。包含 hostname + 内网 IP 才能让自检通过。

### 3.3 决定路由规则

不加规则：该 worker 仅消费 `target_worker = <WORKER_ID>` 或 `target_worker IS NULL` 的 run（兜底模式）。

加规则（在 `"rules": []` 中）举例：

```json
{
  "module": "mn",
  "axis_pattern": "knowledge",
  "worker_id": "<WORKER_ID>",
  "priority": 9,
  "notes": "knowledge axis 优先这台"
}
```

priority 设计建议：

| 范围 | 用途 |
|---|---|
| 1-9 | 强制 pin（特殊 axis / scope 必走某 worker） |
| 10-49 | 模型匹配（claude-cli / api-oneshot 等） |
| 50-99 | module 级默认 |
| 100-499 | 一般兜底 |
| 998 | mn 兜底（`${WORKER_ID}` sentinel，commit `759ee00`） |
| 999 | 最终兜底（`worker_id: null`） |

### 3.4 部署到目标机

```bash
# 在目标机
ssh root@<host>
cd /path/to/pipeline
git pull                                           # 拉到含 5d24678 的代码
cd api
echo "WORKER_ID=<WORKER_ID>" >> .env               # 或 sed -i 替换原值
pm2 start mn-worker.config.cjs                     # 第一次起；已存在则 restart
pm2 save
pm2 startup -u root --hp /root                     # 自启（首次）
```

### 3.4.1 开发机一键同步（`onekeydeploy/remote-pipeline-sync.sh`）

在**已能 SSH 各节点**的前提下，可在主仓库根目录执行：

```bash
bash onekeydeploy/remote-pipeline-sync.sh              # 按 run-routing 里所有可 SSH 的 worker 依次执行
bash onekeydeploy/remote-pipeline-sync.sh --only huoshanpro
bash onekeydeploy/remote-pipeline-sync.sh --dry-run   # 只打印将执行的 ssh/scp
bash onekeydeploy/remote-pipeline-sync.sh --skip-config   # 不下发 run-routing.json，仍做代码同步 + dist 构建 + pm2（按配置）
bash onekeydeploy/remote-pipeline-sync.sh --skip-build    # 跳过远端 npm run build（不刷新 dist）
bash onekeydeploy/remote-pipeline-sync.sh --force    # 不做「版本已一致则跳过」短路（仍执行 git pull / rsync）
RUN_ROUTING_JSON=/abs/path/run-routing.json bash onekeydeploy/remote-pipeline-sync.sh
```

**入选条件**（由 `onekeydeploy/parse-run-routing-remote-hosts.mjs` 解析）：`workers.{id}` 同时满足 `enabled !== false`、存在 `ssh` 与 `deploy.repo`、`host` 存在且**不是** `localhost`。

**`deploy.sync_mode`（每台独立，缺省 `git`）**

| 值 | 代码同步 | 版本比较（未加 `--force` 时） |
|---|---|---|
| `git` | 远端 `cd repo && git pull` | 本机 `git rev-parse HEAD` 与远端同路径 `git rev-parse HEAD` 一致则 **跳过 pull** |
| `scp` | 本机 `rsync` 仓库根 → 远端 `repo/`（排除见 `onekeydeploy/rsync-remote-code-excludes.txt`） | 本机 HEAD 与远端 `{repo}/.pipeline-deploy-rev` 一致则 **跳过 rsync**；成功后脚本写入该文件 |

`scp` 模式用于远端访问 GitHub 不稳、或希望**以本机工作区为真源**推代码的场景；本机应先自行 `git pull` / `commit` 保持预期 HEAD。配置里含任一台 `sync_mode=scp` 时，本机需安装 **rsync**；若工作区有未提交变更会 **WARN**（仍会同步磁盘文件）。

**`deploy.rebuild_dist`（可选）**：字符串数组，元素只能是 `api`、`webapp`。一键脚本在 **pm2 restart 之前** 于远端依次执行 `cd {repo}/api|webapp && npm run build`（生成/更新 **dist**，与仓库根 `npm run build:api` / `build:webapp` 一致）。未配置则跳过构建；应急可用 **`--skip-build`** 跳过整步。

**每台顺序**：① 按 `sync_mode` 同步代码 → ② **scp** 本机 `api/config/run-routing.json` → 远端 `{deploy.repo}/api/config/`（可用 `--skip-config` 跳过）→ ③ 按 `rebuild_dist` 远端 **`npm run build`** → ④ 若配置了 `deploy.pm2_app` 则 **`pm2 restart`** + 可选 `worker_log` grep。

**与 §3.6 的关系**：各节点仅 `git pull` 时，路由会在后续 `loadConfig` 路径读到磁盘新文件；但进程内仍有 **in-process 缓存**（见 §3.6 块引用 / `cachedConfig`）。本脚本在配置了 `deploy.pm2_app` 时会 **restart**，保证立刻读新 JSON。未配置 `pm2_app` 的条目（例如 **nohup** 跑的 `prod-TencentOpenClaw`）脚本**不会**替你做 pm2，需仍按该机 SOP 手动停启。下发 `run-routing.json` 的 **scp** 适合「工作区已改路由尚未 `git push`」仍要让远端与当前文件一致；若规范是「先 push 再各机 pull」，可用 `--skip-config` 只做代码同步与 pm2。

### 3.5 验证

```bash
# 目标机自检通过
tail -100 /tmp/mn-worker-out.log | grep -E "run-routing|twin-worker"
# 期望: [run-routing] loaded N rules ...
#      不出现 twin-worker race warning

# DB 维度看 stamp
psql -h 124.156.192.230 -U pipeline_app -d author -c \
  "SELECT DISTINCT worker_id, COUNT(*) FROM mn_runs
     WHERE created_at > NOW()-INTERVAL '30 min'
     GROUP BY worker_id ORDER BY 2 DESC;"
```

期望：30 分钟内出现新 worker 的 stamp（格式 `host:<pid>:<epoch>`），不再有冒名 stamp。

### 3.6 提交配置变更

```bash
cd /path/to/pipeline   # 主仓库（哪台机器都行，配置是共享的）
git add api/config/run-routing.json
git commit -m "feat(routing): 注册 <WORKER_ID> (<host>) worker"
git push
# 通知所有现有 worker 节点 git pull 拉新配置（不需要重启，配置在轮询时重新加载）
# 或：在开发机 bash onekeydeploy/remote-pipeline-sync.sh（见 §3.4.1；含 pm2_app 的节点会 restart）
```

> 路由配置**有 in-process 缓存**（`cachedConfig`）。如果你想"立即生效"而不等下次进程启动，调一次 `reloadRoutingConfig()` 或重启该 worker。

## 4. 常见路由模式

### 4.1 模式：按模型分流

```json
{ "module": "mn", "model_pattern": "claude-cli*", "worker_id": "prod-cli-tencent",  "priority": 10 },
{ "module": "mn", "model_pattern": "api-oneshot*", "worker_id": "prod-api-huoshan", "priority": 20 }
```

claude-cli 任务必须有凭据 → 钉到有凭据那台；api-oneshot 用 HTTP，钉到出公网快的那台。

### 4.2 模式：按 axis / sub_dim 分流

```json
{ "module": "mn", "axis_pattern": "knowledge", "worker_id": "prod-mn-vm-0-11", "priority": 9, "notes": "knowledge axis 多内存，跑专机" },
{ "module": "mn", "axis_pattern": "people",    "worker_id": "prod-mn-vm-4-6",  "priority": 9 }
```

适合：某些 axis 计算量大需要资源隔离；A/B 测试新 axis computer 在副线 worker 上跑。

### 4.3 模式：按 scope 分流

```json
{ "module": "mn", "scope_id": "<某重要 scope UUID>", "worker_id": "prod-priority", "priority": 1, "notes": "VIP scope 跑独占" }
```

适合：重要客户 scope 独占资源、避免被其他 scope 拖慢。

### 4.4 模式：水平扩容（同 module 多 worker 兜底）

不写专属规则，让多台 worker 各自启动后都进入兜底池：

```json
// rules 里只保留:
{ "module": "mn", "worker_id": "${WORKER_ID}", "priority": 998 }   // Fix A
```

入队的 run 会被 resolveTargetWorker 钉到**入队那台机器自己**的 WORKER_ID。如果入队是从前端 API 来的，钉到 API 进程所在 worker；如果是 schedule 触发，钉到 schedule 所在 worker。要做真水平扩容（任意 worker 都能拿），改回 priority 998 的 worker_id 为 null + 让多 worker 共享负载。但当前没有 leasing 机制，单调地 atomic claim 谁先抢谁拿，可能不均衡。

> **未来增强**：tag-based routing —— rules 加 `worker_tags: ["mn", "high-mem"]` 字段，atomic claim 时 worker 比对自己 spec 的 tags。这样"任意带 mn tag 的 worker 都能拿"成为可能。当前未实现，需要时单独 PR。

## 5. 容灾 / 临时下线 / 滚动升级

### 临时下线

```json
"prod-vm-0-11": { "enabled": false, ... }
```

`workerAcceptsModule()` 现已检查 `enabled: false` 跳过本 worker。重启该 worker 后立即失效（不再 poll DB），但其他 worker 不受影响。

### 滚动升级

1. 一台一台 pm2 restart：因为 Fix A (`${WORKER_ID}` sentinel) + Fix B (10s min-age) 已防 pm2 restart 期间瞬时 race
2. 升级前 push 新 commit；升级后立即 `git log --oneline | head` 确认对方拉到了

### 容灾切换

主 worker 挂了（health check 不通 / heartbeat 超 45 min）：

- `MN_HEARTBEAT_STALE_MIN=45` 环境变量控制 zombie 阈值
- 任何活 worker 启动 `cleanupZombieRuns` 时会把超时的 running run 标 failed
- 新 worker 接管：靠运维改 routing rule 把流量切过去（手动）

> **未来增强**：active health check + 自动 failover（轮询 `health.url` 判定 worker 死活，自动 disable + reroute）。当前未实现。

## 6. 监控 / 可观测

### worker stamp 分布（日常巡检）

```sql
SELECT worker_id, COUNT(*) AS n,
       MIN(started_at) AS first, MAX(started_at) AS last
  FROM mn_runs
 WHERE state IN ('succeeded', 'failed')
   AND created_at > NOW() - INTERVAL '24 hours'
 GROUP BY worker_id
 ORDER BY n DESC;
```

异常信号：

- 出现陈年 stamp（epoch 超过 7 天前）→ 进程从来没重启，pull 不到代码
- 同一 hostname 多个 pid 同时被 stamp → 双开（不是 pm2 内的 fork，是两个独立 pm2）
- 某 worker stamp 数量长期为 0 → 该 worker 已死或路由不到

### 日志关键字

| 关键字 | 含义 |
|---|---|
| `[run-routing] loaded N rules` | 启动正常加载配置 |
| `twin-worker race` | host 自检失败 → 已 fallback，看 WARN 详情 |
| `recoverQueuedRuns` | 60s 周期 reaper 拣选 |
| `multi-meeting longitudinal` | scope-level run 完成后 longitudinal 自动联动 |
| `[runEngine] skip stale enqueue` | 抢到的 run 已不是 queued（被另一 worker 抢先 / 已 succeeded） |

## 7. 当前已部署 worker 一览（2026-05-03）

| WORKER_ID | host | 内网 IP | accept_modules | tags | 备注 |
|---|---|---|---|---|---|
| `local-mac` | localhost | - | （全部） | dev, fallback | 开发机 |
| `prod-TencentOpenClaw` | 43.156.49.59 | 10.3.4.6 | `["mn"]`（`MN_WORKER_ONLY`） | claude-cli | 主 Claude CLI worker（多为 nohup；无 `pm2_app` 时一键脚本仍 **pull/scp + `rebuild_dist` api**；不替你做 pm2） |
| `huoshanpro` | 115.190.221.164 | - | `["ceo","mn"]` | llm-api | `pm2_app` `content-pipeline-api`；`sync_mode` **`scp`**；`rebuild_dist` **`api`+`webapp`** |
| `TencentNodeDB` | 124.156.192.230 | - | `[]`（拒绝） | db-host | `pipeline-api`；`rebuild_dist` **`api`**；不接全局 mn/ceo 调度 |

VM-0-11-opencloudos (221.195.29.81) 的处理见 [`ops-vm-0-11-decommission.md`](./ops-vm-0-11-decommission.md)。处理完后回来更新这张表。

## 8. 演进路线（按需实现）

| 增强点 | 触发条件 | 复杂度 |
|---|---|---|
| 已实现：host 自检防冒名 | commit `5d24678` | ✓ |
| 已实现：mn 兜底钉 `${WORKER_ID}` | commit `759ee00` | ✓ |
| 已实现：reaper 10s min-age | commit `759ee00` | ✓ |
| 已实现：开发机一键同步 `onekeydeploy/remote-pipeline-sync.sh` | §3.4.1、`pm2_app`、`sync_mode`、`rebuild_dist` + `--skip-build` | ✓ |
| Tag-based routing（rules 按 tag 匹配多 worker） | 真要做水平扩容时 | 中 |
| Active health check + 自动 failover | 当前 1 台主 worker 不冗余还能扛；上 3+ 台后做 | 中 |
| pm2 优雅停机 + drain（kill_timeout=30s + SIGTERM hook） | 升级频率上来后做 | 中 |
| run-routing 热重载（SIGHUP） | 改 rule 不想重启时做 | 小 |
| Worker capacity dashboard | 多 worker 后做监控 | 大 |
