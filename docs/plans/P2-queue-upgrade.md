# P2 · 运行队列升级（持久化 + 修并发 bug）

## Why

当前 `runEngine` 用 `RunQueue` 进程内 in-memory FIFO。已观察到的具体问题：
1. **PM2 重启 = 队列全丢**：`mn_runs` 还标 running/queued，但 in-memory tracking 清零，run 永远停在那个状态等 zombie cleanup（30 分钟后才标 failed）。
2. **drain 并发 bug**：`runQueue.drain()` 用 while 循环一次性把 `items` 全部取完成 promise 数组，再 `await Promise.all`。期间新 enqueue 的 item 不会被同一批 drain 看到；`drainSoon()` 被 `draining=true` 锁住不再触发新 drain → 新 run 必须等当前批次跑完才能 picked up。
3. **观测点缺失**：`mn_runs.metadata` 里没有 worker_id / pid / heartbeat，故障后没线索。

P0/P1 修了「数据安全」和「不让脏运行起跑」，P2 修「干净的 run 也跑不顺」。优先级低于 P0/P1 但高于不修。

## What

两个独立 work items（可分两个 commit）：

### A. 修 in-memory 队列的并发 bug（小改，~50 行）

`runQueue.ts` `drain()` 改为 worker pool 模式：
- 启动 `concurrency` 个 worker promises
- 每个 worker 循环 `next()` 拉一个跑一个，直到队列空
- enqueue 时 `drainSoon()` 让 idle worker 唤醒（补一个新 worker promise）

### B. 切到 pg-boss 持久化队列（大改）

`pg-boss` 已是 npm 流行选择，复用现有 PostgreSQL，不引入 Redis。

依赖：`pnpm add pg-boss --filter api`

`runEngine.ts` 改造：
- 替换 `RunQueue` 为 `PgBoss.Worker` 实例
- enqueue → `boss.send('mn-runs', payload)`
- worker handler = 现有 `execute(payload)`
- `mn_runs` 表保留作为审计/查询入口，但实际队列 backed by pg-boss 自己的 `pgboss.job` 表
- 启动时 `boss.start()`、shutdown 时 `boss.stop()`

## Files

- 改：`api/src/modules/meeting-notes/runs/runQueue.ts`（A：并发修复）
- 改：`api/src/modules/meeting-notes/runs/runEngine.ts`（A：drainSoon 改写；B：替换 queue impl）
- 改：`api/package.json`（B：加 pg-boss 依赖）
- 新：`api/src/modules/meeting-notes/runs/runQueueAdapter.ts`（B：抽象层，便于切回）

## A. 并发修复细节

**新 RunQueue**：

```ts
export class RunQueue<T = any> {
  private items: QueueItem<T>[] = [];
  private active = 0;
  private handler: ((item: QueueItem<T>) => Promise<void>) | null = null;

  constructor(private readonly concurrency: number = 2) {}

  enqueue(item: QueueItem<T>): void {
    this.items.push(item);
    this.tick();
  }

  start(handler: (item: QueueItem<T>) => Promise<void>): void {
    this.handler = handler;
    this.tick();
  }

  private tick(): void {
    while (this.active < this.concurrency && this.items.length > 0 && this.handler) {
      const item = this.items.shift()!;
      this.active++;
      this.handler(item)
        .catch((e) => console.error('[RunQueue] handler error:', e))
        .finally(() => {
          this.active--;
          this.tick();   // ← 关键：每次完成都触发再 tick，新 item 立刻 picked up
        });
    }
  }

  stats() { return { pending: this.items.length, running: this.active, concurrency: this.concurrency }; }
}
```

`runEngine` 启动时 `this.queue.start((item) => this.execute(item.payload))`。enqueue 不用再调 drainSoon，自动 tick。

## B. pg-boss 切换

加抽象：

```ts
// runs/runQueueAdapter.ts
export interface RunQueueAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueue(payload: QueuePayload): Promise<void>;
  on(handler: (payload: QueuePayload) => Promise<void>): void;
}

// in-memory 实现（A 修复后的 RunQueue 包一层）
// pg-boss 实现（boss.send / boss.work）
```

`runEngine` 通过 adapter 调，env `MN_QUEUE_DRIVER=memory|pgboss` 切换。

## 验证

### A. 并发修复

```bash
# 模拟并发：同时入队 3 个 run，concurrency=2 应 2 跑 1 等，等的那个在前 2 完成时立刻 picked up
node scripts/_test-queue-concurrency.mjs  # 新增测试脚本
# 期望：第 3 个 run state=running 时间应在前 2 个 finished_at 之后 < 100ms
```

### B. pg-boss

```bash
# 1. 进程重启不丢
pm2 restart content-pipeline-api  # 当时有 5 个 queued run
# expect: 重启后 5 个 run 仍 picked up，不需要 zombie cleanup

# 2. 队列表存在
psql -c "\dt pgboss.*"
# expect: pgboss.job, pgboss.archive, pgboss.subscription, ...

# 3. 横向扩展（未来）：开 2 个 API 进程都消费同一队列，run 不会重复跑
```

## 顺序与回滚

- A 是低风险修复，先做
- B 是引入新依赖，需测试覆盖 + 灰度
- A 做完不做 B 也可接受（修了 bug 但仍 in-memory）
- B 回滚：`MN_QUEUE_DRIVER=memory` 切回

## 估算

- A: ~半天
- B: ~1-2 天（含测试 + 回滚开关）

---

## 精修 · 范围聚焦

本 iteration **只做 A + recovery**，不做 B（pg-boss 引入 + adapter 层）。

理由：
1. A 修了已观察到的真实卡死（964f2cb3 例）
2. recovery 让 PM2 重启不再丢 queued runs（见过 zombie cleanup 1h 才 mark cancelled 的现象）
3. B 引入新依赖 + 跨进程并发的新风险，留给独立 PR

### A 实现细节锁定

`RunQueue` 替换 drain() 为 worker-pool 模式：

```ts
export class RunQueue<T = any> {
  private items: QueueItem<T>[] = [];
  private active = 0;
  private handler: ((item: QueueItem<T>) => Promise<void>) | null = null;

  constructor(private readonly concurrency = 2) {}

  start(handler: (item: QueueItem<T>) => Promise<void>): void {
    this.handler = handler;
    this.tick();
  }

  enqueue(item: QueueItem<T>): void {
    this.items.push(item);
    this.tick();
  }

  private tick(): void {
    while (this.active < this.concurrency && this.items.length > 0 && this.handler) {
      const item = this.items.shift()!;
      this.active++;
      this.handler(item)
        .catch((e) => console.error('[RunQueue] handler error:', e))
        .finally(() => {
          this.active--;
          this.tick();   // 完成后再 tick → 新入队的会被立刻 picked up
        });
    }
  }

  stats() { return { pending: this.items.length, running: this.active, concurrency: this.concurrency }; }

  // 保留 drain() 别名作为向后兼容（标 deprecated）—— 现有 runEngine 的 drainSoon
  // 替换后将不再调用 drain()
}
```

`RunEngine`：
- 构造里 `this.queue.start((item) => this.execute(item.payload))`
- 删 `drainSoon` 私有方法
- `enqueue` / `resume` 不再调 drainSoon（queue 自驱）

### Recovery 实现细节锁定

新增 `RunEngine.recoverQueuedRuns()`：

```ts
async recoverQueuedRuns(): Promise<{ recovered: number }> {
  const r = await this.deps.db.query(
    `SELECT id, scope_kind, scope_id::text, axis, sub_dims, preset, strategy_spec,
            triggered_by, parent_run_id, metadata
       FROM mn_runs
      WHERE state = 'queued'
      ORDER BY created_at ASC`,
  );
  for (const row of r.rows) {
    this.queue.enqueue({
      id: row.id,
      payload: {
        runId: row.id,
        scope: { kind: row.scope_kind, id: row.scope_id ?? undefined },
        axis: row.axis,
        subDims: row.sub_dims ?? [],
        preset: row.preset,
        strategySpec: row.strategy_spec ?? null,
        triggeredBy: row.triggered_by,
        parentRunId: row.parent_run_id,
        meetingId: row.scope_kind === 'meeting' ? row.scope_id : undefined,
        expertRoles: undefined,  // not stored in mn_runs; recovered runs lose 角色定向
      },
      enqueuedAt: Date.now(),
    });
  }
  if (r.rows.length > 0) console.log(`[RunEngine] recovered ${r.rows.length} queued runs from DB`);
  return { recovered: r.rows.length };
}
```

构造里 `setImmediate(() => this.recoverQueuedRuns())` 与 zombie cleanup 并行启动。

### 验证

1. **drain 并发 bug fixed**：开 2 个 long-running run 占满 concurrency，第 3 个入队 → DB 见 created_at 早 1s 但仍 queued；前 2 个完成时第 3 个应立刻 state=running（之前要等到 drain 整批完成才 picked up）
2. **recovery on restart**：手工 INSERT mn_runs(state='queued') → PM2 restart → 重启后 5s 内 state 应转为 running 或 succeeded（recover → execute 正常路径）
3. **回归**：先入队的还按 FIFO 跑

### 不在本次

- pg-boss 持久化（B）
- 横向扩展（多 API 进程消费同一队列，需要 worker fence）
- worker-id / heartbeat 字段（mn_runs 加列）
