# SOP · 处理 VM-0-11-opencloudos 上的 mn-worker

> 适用人：运维 / 工程值班
> 预计耗时：5 - 30 分钟（取决于走 A 还是 B 路径）
> 前置：本仓库已合并 `5d24678 (worker host 自检防双胞胎)` 及之后的 commits

## 背景一句话

`124.156.192.230/author` 同时被两台 VM 上的 mn-worker 连，且都设了 `WORKER_ID=prod-TencentOpenClaw`，导致抢任务 race。本 SOP 解决这一问题。

| host | 公网 IP | hostname | 现状 |
|---|---|---|---|
| 主 worker（本仓库 deploy 端） | 43.156.49.59 | VM-4-6-opencloudos | 已修复并独占 `prod-TencentOpenClaw` |
| 另一台 | 221.195.29.81 | VM-0-11-opencloudos | 仍冒名 `prod-TencentOpenClaw`，本 SOP 处理之 |

## 决策树

```
对方 VM 还需要跑 mn-worker 吗？
├── 否 → 走 路径 A（停 + 卸 pm2，最干净）
└── 是 → 走 路径 B（重命名 WORKER_ID + 注册到 run-routing.json）
```

如果你不确定对方机器上是否有专属任务依赖那台 worker，先走路径 A，监控 7 天没人投诉再删干净。

---

## 路径 A · 彻底下线（推荐，若对方机器不需要跑 mn）

### A.1 SSH 进对方 VM

```bash
ssh root@221.195.29.81
```

### A.2 停 + 删 + 持久化

```bash
pm2 stop mn-worker
pm2 delete mn-worker
pm2 save                              # 防开机自启时被恢复
pm2 startup -u root --hp /root        # 如未启用 systemd 自启脚本，跳过此行
```

### A.3 验证（在对方机器上）

```bash
ps -ef | grep mn-worker | grep -v grep        # 应无输出
pm2 list | grep mn-worker                     # 应无输出
```

### A.4 验证（在主仓库 deploy 端）

```bash
psql -h 124.156.192.230 -U pipeline_app -d author -c \
  "SELECT DISTINCT client_addr FROM pg_stat_activity WHERE datname='author';"
```

期望：只剩 `43.156.49.59`，不再看到 `221.195.29.81`。

### A.5 回滚（如发现误删）

```bash
ssh root@221.195.29.81
cd /path/to/pipeline    # 替换成对方机器的 repo 路径
pm2 start mn-worker.config.cjs
pm2 save
```

---

## 路径 B · 保留并重命名（对方机器仍要承担 mn 任务）

### B.1 SSH 进对方 VM 拉最新代码

```bash
ssh root@221.195.29.81
cd /path/to/pipeline    # 替换成对方机器的 repo 路径
git fetch && git pull
git log --oneline | grep 5d24678   # 确认 host 自检 commit 已在分支
```

> 没拉新代码就跳过自检逻辑。**必须**先拉。

### B.2 改对方 .env 的 WORKER_ID 唯一化

```bash
cd api
cp .env .env.bak.before-rename
sed -i 's/^WORKER_ID=prod-TencentOpenClaw$/WORKER_ID=prod-vm-0-11/' .env
grep WORKER_ID .env
```

期望：`WORKER_ID=prod-vm-0-11`。

### B.3 在主仓库 (43.156.49.59) 上的 run-routing.json 加注册

> 这一步在**主仓库 deploy 端**做，不是对方 VM。改完后两边都 `git pull` + 重启。

打开 `api/config/run-routing.json`，在 `"workers": {}` 段追加：

```json
"prod-vm-0-11": {
  "enabled": true,
  "tags": ["self-hosted-node", "mn"],
  "host": "221.195.29.81",
  "host_aliases": ["VM-0-11-opencloudos", "<对方内网 IP>"],
  "ssh": { "user": "root", "port": 22 },
  "deploy": {
    "repo": "/path/to/pipeline",
    "api_dir": "/path/to/pipeline/api",
    "worker_log": "/tmp/mn-worker-out.log"
  },
  "runtime": {
    "concurrency": 1,
    "accept_modules": ["mn"],
    "env_extra": { "WORKER_ID": "prod-vm-0-11" }
  },
  "health": { "url": null },
  "notes": "VM-0-11-opencloudos · mn 副线 worker"
}
```

> ⚠️ `host_aliases` 必须包含**对方机器的 hostname** 和**对方机器的内网 IP**，否则 host 自检会失败 fallback。
> 内网 IP 用 `ssh root@221.195.29.81 'ip -4 addr show | grep "inet "'` 拿。

### B.4 决定哪些 run 路由到它（可选）

如果只想兜底（target_worker=NULL 的不再被它拿，target_worker=prod-vm-0-11 的才拿），跳过本步。

如果要分流（比如让它专跑 knowledge axis），在 `"rules"` 段加：

```json
{
  "module": "mn",
  "axis_pattern": "knowledge",
  "worker_id": "prod-vm-0-11",
  "priority": 9,
  "notes": "knowledge axis 跑 VM-0-11"
}
```

> priority 必须 < 现有 mn 兜底（998），否则永远不命中。

### B.5 提交 + push

```bash
cd /proweb/run/pipeline    # 主仓库
git add api/config/run-routing.json
git commit -m "feat(routing): 注册 prod-vm-0-11 (VM-0-11-opencloudos) worker"
git push
```

### B.6 对方 VM 拉新配置 + 重启

```bash
ssh root@221.195.29.81
cd /path/to/pipeline
git pull
pm2 restart mn-worker --update-env
```

### B.7 主 VM 拉新配置 + 重启

```bash
# 在 43.156.49.59
cd /proweb/run/pipeline
git pull   # 不需要重启，但保持仓库同步
pm2 restart mn-worker --update-env
```

### B.8 验证（两边）

**对方 VM 启动 self-check：**

```bash
ssh root@221.195.29.81 'tail -50 /tmp/mn-worker-out.log | grep run-routing'
```

期望：`[run-routing] loaded N rules from .../run-routing.json`，**不**出现 `twin-worker race` warning。

**主 VM 启动 self-check：**

```bash
tail -50 /tmp/mn-worker-out.log | grep run-routing
```

同样要求。

**DB 维度看抢拿分布：**

```sql
SELECT DISTINCT worker_id, COUNT(*)::int AS n
  FROM mn_runs
 WHERE created_at > NOW() - INTERVAL '30 minutes'
 GROUP BY worker_id
 ORDER BY n DESC;
```

期望：

- 不再看到陈年 `VM-0-11-opencloudos:390917:1777744136668`
- 出现新 stamp `host:<新 pid>:<新 epoch>` 各自唯一
- `target_worker IS NULL` 的 run 由两台中**先 poll 到的那台**拿（可接受）；专属 axis 的 run 按 rule 路由

### B.9 回滚（如出问题）

```bash
ssh root@221.195.29.81
cd /path/to/pipeline/api
cp .env.bak.before-rename .env
pm2 restart mn-worker --update-env
# 主仓库
git revert <run-routing.json 的注册 commit>
git push
```

---

## 完成判定

不论 A 还是 B：

1. ✅ 对方 VM 上没有 `prod-TencentOpenClaw` 在跑（要么完全没 worker，要么 WORKER_ID 已改）
2. ✅ DB 30 分钟内没有 `VM-0-11-opencloudos:390917:` 这种陈年 stamp 新增
3. ✅ 两台 worker 启动日志都没 `twin-worker race` warning
4. ✅ 跑一条 smoke run（任意 axis）能正常 succeeded，不被错误的 worker 抢

---

## 这次发生了什么 · 一句话复盘

`prod-TencentOpenClaw` 这个 WORKER_ID 被两台 VM 同时使用 7 天，期间所有 scope-level run 一半概率落在 VM-0-11 的旧代码上 → Phase 0/8 修了又"看不到生效" → 直到加了 host 自检（commit `5d24678`）才能强制阻止冒名。后续多 worker 接入流程见 [`multi-worker-design.md`](./multi-worker-design.md)。
