# Phase 1 · 4 条 sub-dim GET 路由

## 背景

物理表 `mn_consensus_tracks` / `mn_concept_drifts` / `mn_topic_lineage` / `mn_external_experts` 已有数据（见 sub-dim audit），但 `api/src/modules/meeting-notes/router.ts` 没有对应的 GET 路由，前端只能 `<PendingSubdimTab>` 占位。本阶段补齐 4 条只读路由。

## 表结构

```
mn_consensus_tracks: id, scope_id, topic, meeting_id, consensus_score, divergence_persons, dominant_view, evidence_refs, created_at
mn_concept_drifts:   id, scope_id, term, definition_at_meeting, drift_severity, first_observed_at, last_observed_at, created_at, updated_at
mn_topic_lineage:    id, scope_id, topic, birth_meeting_id, health_state, last_active_at, lineage_chain, mention_count, created_at, updated_at
mn_external_experts: id, name, domain, cited_in_meetings(jsonb), cite_count, accuracy_score, expert_source_url, metadata, created_at, updated_at
```

`mn_external_experts` **无 scope_id 字段**——是库级 registry，按 `cited_in_meetings` 数组与 scope 的 meetings 交集筛选。

## 改动

文件：`api/src/modules/meeting-notes/router.ts`

位置：紧跟 `/scopes/:id/mental-models/hit-rate` 路由之后（约 2410 行处），继续 AxisKnowledge 区域。

新增 4 条 GET：

```ts
// 共识轨迹 (knowledge/consensus_track)
fastify.get('/scopes/:id/consensus-tracks', { preHandler: authenticate }, async (request) => {
  const { id } = request.params as { id: string };
  const uuid = await resolveScopeUuid(engine.deps.db, id);
  if (!uuid) return { items: [] };
  const r = await engine.deps.db.query(
    `SELECT id, topic, meeting_id, consensus_score, divergence_persons,
            dominant_view, evidence_refs, created_at
       FROM mn_consensus_tracks
      WHERE scope_id = $1
      ORDER BY created_at DESC, consensus_score DESC NULLS LAST
      LIMIT 200`,
    [uuid],
  );
  return { items: r.rows };
});

// 概念漂移 (knowledge/concept_drift)
fastify.get('/scopes/:id/concept-drifts', { preHandler: authenticate }, async (request) => {
  const { id } = request.params as { id: string };
  const uuid = await resolveScopeUuid(engine.deps.db, id);
  if (!uuid) return { items: [] };
  const r = await engine.deps.db.query(
    `SELECT id, term, definition_at_meeting, drift_severity,
            first_observed_at, last_observed_at, updated_at
       FROM mn_concept_drifts
      WHERE scope_id = $1
      ORDER BY last_observed_at DESC NULLS LAST`,
    [uuid],
  );
  return { items: r.rows };
});

// 议题谱系 (knowledge/topic_lineage)
fastify.get('/scopes/:id/topic-lineage', { preHandler: authenticate }, async (request) => {
  const { id } = request.params as { id: string };
  const uuid = await resolveScopeUuid(engine.deps.db, id);
  if (!uuid) return { items: [] };
  const r = await engine.deps.db.query(
    `SELECT id, topic, birth_meeting_id, health_state, last_active_at,
            lineage_chain, mention_count, updated_at
       FROM mn_topic_lineage
      WHERE scope_id = $1
      ORDER BY last_active_at DESC NULLS LAST, mention_count DESC`,
    [uuid],
  );
  return { items: r.rows };
});

// 外脑批注 (knowledge/external_experts) —— 库级表，按 scope 的 meetings 交集筛
// 注意：cited_in_meetings 是对象数组（含 meeting_id/by_person_id/citation_text），
// 用 jsonb_array_elements 取每个 obj 然后 ->>'meeting_id' 提取键
fastify.get('/scopes/:id/external-experts', { preHandler: authenticate }, async (request) => {
  const { id } = request.params as { id: string };
  const uuid = await resolveScopeUuid(engine.deps.db, id);
  if (!uuid) return { items: [] };
  const r = await engine.deps.db.query(
    `SELECT ee.id, ee.name, ee.domain, ee.cited_in_meetings,
            ee.cite_count, ee.accuracy_score, ee.expert_source_url, ee.updated_at
       FROM mn_external_experts ee
      WHERE EXISTS (
        SELECT 1
          FROM jsonb_array_elements(ee.cited_in_meetings) AS x(elem)
          JOIN mn_scope_members sm ON sm.meeting_id::text = (x.elem->>'meeting_id')
         WHERE sm.scope_id = $1
      )
      ORDER BY ee.cite_count DESC NULLS LAST, ee.accuracy_score DESC NULLS LAST`,
    [uuid],
  );
  return { items: r.rows };
});
```

返回 shape 与 `/scopes/:id/judgments` 一致：`{ items: Array<{...}> }`，前端组件统一按 `data.items` 取数。

## 不动

- 物理表 schema
- 计算器（concept_drift 0 行问题已在独立工单跟进）
- 前端（Phase 2 切换）

## 回归

1. `cd api && npx tsc --noEmit` exit 0
2. pm2 restart mn-worker（worker 进程才有路由 server？— 否，worker 没 HTTP server，本次只重启即可让 tsx 重新加载源码；但这些是路由代码，需要 API server 进程才生效）

> 备注：当前主机（mn-worker only）上 API server 没有跑。新路由的可达性测试需要在 API server 部署后才能 curl 验证。本阶段验收口径：
> 1. tsc 通过
> 2. router.ts 改动 review 一致 — 4 个 handler 与 mental-models/hit-rate 同模式
> 3. SQL dry run（直接对 DB 跑 SELECT，验证语法与字段）
4. 直接 SQL 验证（用 psql / node-pg）4 条查询返回非空结构（按 Scope B `9e92d4c2…`）

## 提交

`git add api/src/modules/meeting-notes/router.ts docs/质量v2/phase-1-subdim-routes.md`
`git commit -m "feat(api/mn): 4 条 sub-dim GET 路由 - consensus-tracks/concept-drifts/topic-lineage/external-experts"`
