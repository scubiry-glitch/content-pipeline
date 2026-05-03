# Phase 3 · model_hitrate 后端查表修复

## 背景

前端 `AxisKnowledge.tsx` mental_models tab 标题写"6 个月命中率校准"，调 `meetingNotesApi.getScopeMentalModelHitRate(scopeId)`，命中后端路由 `GET /scopes/:id/mental-models/hit-rate`。

后端现行 SQL（router.ts:2397-2407）读 `mn_mental_model_hit_stats` —— 该表由 `MentalModelHitRate.recomputeForScope` 写入，**是全时段聚合 + 30d 趋势**，不是 6m 滚窗。

而真正的 6m 滚窗数据在 `mn_model_hitrates` 表（migration 023），由 knowledge axis 子维度 `model_hitrate` 计算器（`computeModelHitrate`）写入，字段 `window_label='6m'`、`total_invocations`、`correct_count`、`hit_rate`、`computed_at`。

结论：**前端标签和后端数据源不一致** —— 这是一个数据正确性 bug。

## 改动

### `api/src/modules/meeting-notes/router.ts` 修 1 个路由

把 `/scopes/:id/mental-models/hit-rate` 的 SQL 改为读 `mn_model_hitrates`（window='6m'），并在 SELECT 里把字段映射到前端期望的 shape：

```sql
SELECT id, model_name,
       total_invocations AS invocations,
       correct_count    AS hits,
       hit_rate,
       NULL::numeric    AS trend_30d,    -- 6m 表无 30d 趋势字段
       computed_at
  FROM mn_model_hitrates
 WHERE COALESCE(scope_id::text,'') = COALESCE($1::text,'')
   AND window_label = '6m'
 ORDER BY hit_rate DESC, total_invocations DESC
```

外层 map：在路由 handler 里给每行加 `flag` 字段，根据 `hit_rate` 推：
- `hit_rate >= 0.8` → `'priority'`
- `hit_rate < 0.65 AND invocations > 0` → `'downweight'`
- `invocations === 0` → `'unused'`
- else → `'neutral'`

返回结构 `{ items: rows }` 与前端契约一致；前端展示文案 `命中率 X% · hits/invocations · flag=Y` 不变。

### `MentalModelHitRate.listForScope` 同步对齐（可选清理）

旧方法继续保留兼容（被 wiki generator 等其他路径调用），但加注释说明"all-time，非 6m 滚窗，前端 GET 路由不再走此方法"。

## 不动

- `mn_mental_model_hit_stats` 表 schema 与 `recomputeForScope` 写入逻辑（保留 trend_30d 用于其他场景）
- `computeModelHitrate` axis 子维度计算（写入 mn_model_hitrates）
- 前端代码（map 到 invocations/hits/hit_rate/flag 不变）

## AxisRegeneratePanel 同步

- `SUB_META.model_hitrate`：保持 `cost: medium` / `depsOn: ['mental_models']` ✓
- `TAB_TO_SUBS.knowledge.mental_models`：保持 `subs: ['mental_models', 'model_hitrate']` ✓
- 用户从 mental_models tab 点 ↻ 重算时仍会勾选 mental_models + model_hitrate 两个 subdim → 触发 `computeModelHitrate` 写入 `mn_model_hitrates` → 修复后的 GET 路由正确返回 6m 数据

无需改动 AxisRegeneratePanel。

## 回归验证

1. `cd api && npx tsc --noEmit` exit 0
2. 直接 SQL 验证：
   ```sql
   -- Scope B（装修信托）已经跑过 axis=all standard
   SELECT model_name, total_invocations, correct_count, hit_rate
     FROM mn_model_hitrates
    WHERE scope_id = '9e92d4c2-add3-4099-bc53-7a17f9f8a204'::uuid
      AND window_label = '6m'
    ORDER BY hit_rate DESC LIMIT 10;
   -- 期望：返回 N 行（已确认表内有 103 行）
   ```
3. （可选）API 拨测：起 dev API 进程后 `curl GET /api/v1/meeting-notes/scopes/9e92d4c2…/mental-models/hit-rate`

## 提交

只动 `router.ts` + 本文件：

```
git add api/src/modules/meeting-notes/router.ts docs/质量v2/phase-3-model-hitrate-fix.md
git commit -m "fix(api/mn): mental-models/hit-rate 改读 mn_model_hitrates(6m)"
```

## 质量提升效果

- 修一个数据正确性 bug：前端"6 个月命中率"展示从错配（all-time）→ 真实 6m 滚窗
- mental_models tab 看到的命中率反映"近期表现"，不受历史长尾稀释
- AxisRegeneratePanel 重算 mental_models 子维度后，前端**当场可见 6m 校准结果**
