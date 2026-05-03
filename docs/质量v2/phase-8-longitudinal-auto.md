# Phase 8 · longitudinal 自动联动

## 现状勘察

### 设计意图（已有代码）

`MeetingNotesEngine` 构造函数内（line 65-78）已订阅事件 `mn.run.completed`：

```ts
deps.eventBus.subscribe('mn.run.completed', async (payload) => {
  const run = await this.runEngine.get(payload?.runId);
  await this.crossLinks.recomputeForScope(run.scope.kind, run.scope.id ?? null, run.id);
  if (run.scope.kind !== 'meeting' && run.scope.id) {
    await this.longitudinal.recomputeAll(run.scope.id, run.id);
  } else if (run.scope.kind === 'library') {
    await this.longitudinal.recomputeAll(null, run.id);
  }
});
```

理论上：scope-level run finalize → emit event → longitudinal 重算 → 写 `mn_decision_tree_snapshots` / `mn_belief_drift_series` / `mn_mental_model_hit_stats`。

### 实测

两个 scope（已多次跑过 axis=all 与 axis=knowledge）：

| 表 | Scope A | Scope B |
|---|---|---|
| `mn_decision_tree_snapshots` | 0 | 0 |
| `mn_belief_drift_series` | 0 | 0 |
| `mn_mental_model_hit_stats` (all-time) | 0 | 0 |
| `mn_model_hitrates` (6m, axis 子维度直写) | 5 | 103 |

事件总线那条路径**事实上没跑出数据**。原因可能是 worker 进程内 `eventBus.subscribe` 时机 / engine singleton 加载顺序 / `runEngine.get` 在 worker 内拿不到等其它 race。无论根因，前端"决策树 / 信念轨迹"两个 tab 永远空。

## 改动

### 在 `runEngine.ts` multi-meeting finalize 里**显式内联调用** longitudinal recompute

紧接刚加的 F-snap snapshot 块之后（同一 `if (allMeetingIds.length > 0)` 内），追加：

```ts
// 质量v2 Phase 8 · longitudinal 自动联动：直接在 multi-meeting finalize 内调用，
// 不依赖 mn.run.completed event bus（事件路径在 worker 内未稳定派发，
// 实测 scope=project/topic run 完成后 mn_decision_tree_snapshots /
// mn_belief_drift_series / mn_mental_model_hit_stats 一直 0 行）。
if (payload.scope.kind !== 'meeting' && payload.scope.id) {
  await writeStep('render', 0.99, '更新 longitudinal（决策树 / 信念漂移 / 命中统计）…');
  try {
    const ls = await import('../longitudinal/index.js').then(m => new m.LongitudinalService(this.deps));
    const out = await ls.recomputeAll(payload.scope.id, payload.runId);
    console.log(`[runEngine] multi-meeting longitudinal · scope=${payload.scope.id.slice(0,8)} · ` +
      `belief=${(out as any)?.beliefDrift?.rows ?? '?'}, ` +
      `decTree=${(out as any)?.decisionTree?.rows ?? '?'}, ` +
      `hitStats=${(out as any)?.modelHitRate?.rows ?? '?'}`);
  } catch (e) {
    console.warn('[runEngine] multi-meeting longitudinal failed:', (e as Error).message);
  }
}
```

外层 try/catch 捕获，failure 不阻塞 run finalize。

### 不动事件总线订阅

保留 `MeetingNotesEngine` 内 `eventBus.subscribe`（仍能为 library scope / API 进程触发的 run 兜底）。Phase 8 是显式补一刀，不是 deprecate 事件路径。

## AxisRegeneratePanel 同步

longitudinal 不是 axis 子维度，不在面板可勾选范围。无需改 panel。

## 回归

1. `cd api && npx tsc --noEmit` exit 0
2. `pm2 restart mn-worker`
3. queue 一条 axis=knowledge / scope=project (Scope A) smoke run
4. succeeded 后查：
   ```sql
   SELECT
     (SELECT COUNT(*) FROM mn_decision_tree_snapshots WHERE scope_id='f8fe9833…') AS dt,
     (SELECT COUNT(*) FROM mn_belief_drift_series   WHERE scope_id='f8fe9833…') AS bd,
     (SELECT COUNT(*) FROM mn_mental_model_hit_stats WHERE scope_id='f8fe9833…') AS hs;
   ```
   期望：均 ≥ 1（Scope A 单场 belief_drift 可能仍 0，但 decisionTree / hitStats 应 > 0）。
5. 如还是 0 行，看 worker 日志 `[runEngine] multi-meeting longitudinal · scope=...` 行的输出 / 错误。

## 提交

```
git add api/src/modules/meeting-notes/runs/runEngine.ts \
        docs/质量v2/phase-8-longitudinal-auto.md
git commit -m "feat(api/mn): scope-level run 完成后内联触发 longitudinal recompute（Phase 8）"
```

## 质量提升效果

- 前端"决策树" / "信念轨迹" tab 不再永远 empty —— 跑一次 axis=any (project/topic/client scope) 后自动有数据
- 不依赖事件总线时序，路径可观测（worker 日志里能看到 longitudinal recompute 的产出计数）
- 6m mental-model hit-rate（Phase 3 修过的）继续走 axis 子维度路径写 mn_model_hitrates；新加的 longitudinal recompute 同时把 all-time hit_stats 也填上
