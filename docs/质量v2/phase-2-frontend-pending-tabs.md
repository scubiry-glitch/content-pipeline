# Phase 2 · 4 个 PendingSubdimTab → 真实 API

## 背景

Phase 1 在后端补齐 4 条 GET 路由，本阶段把前端 4 个 `<PendingSubdimTab>` 占位（AxisKnowledge.tsx 中的 consensus / concept / lineage / external 四个 tab）改成"数据可用时显示真实数据；为空时仍走原占位 UI"。

## 改动

### 1. `webapp/src/api/meetingNotes.ts` 加 4 个 GET 方法

紧跟 `getScopeMentalModelHitRate` 后（Phase 15.10 区块）追加：

```ts
// 质量v2 Phase 2 · 4 个 sub-dim list 方法
listScopeConsensusTracks: (scopeId: string) =>
  jget<{ items: Array<{ id: string; topic: string; meeting_id: string; consensus_score: number; divergence_persons: unknown; dominant_view: string; evidence_refs: unknown; created_at: string }> }>(
    `/scopes/${scopeId}/consensus-tracks`,
  ),
listScopeConceptDrifts: (scopeId: string) =>
  jget<{ items: Array<{ id: string; term: string; definition_at_meeting: unknown; drift_severity: string; first_observed_at: string; last_observed_at: string; updated_at: string }> }>(
    `/scopes/${scopeId}/concept-drifts`,
  ),
listScopeTopicLineage: (scopeId: string) =>
  jget<{ items: Array<{ id: string; topic: string; birth_meeting_id: string; health_state: string; last_active_at: string; lineage_chain: unknown; mention_count: number; updated_at: string }> }>(
    `/scopes/${scopeId}/topic-lineage`,
  ),
listScopeExternalExperts: (scopeId: string) =>
  jget<{ items: Array<{ id: string; name: string; domain: string; cited_in_meetings: Array<{ meeting_id: string; by_person_id?: string; citation_text?: string }>; cite_count: number; accuracy_score: number; expert_source_url?: string; updated_at: string }> }>(
    `/scopes/${scopeId}/external-experts`,
  ),
```

### 2. `webapp/src/prototype/meeting/AxisKnowledge.tsx` 替换 4 个 tab

把现有 `<PendingSubdimTab>` 调用替换为新的 live 组件：

- `<ConsensusTracksTab scopeId={scopeId} />`
- `<ConceptDriftsTab scopeId={scopeId} />`
- `<TopicLineageTab scopeId={scopeId} />`
- `<ExternalExpertsTab scopeId={scopeId} />`

每个 live 组件：
1. `useEffect(() => meetingNotesApi.listX(scopeId).then(...))`
2. `loading` → `<AxisLoadingSkeleton />`
3. `items.length === 0` → 复用 `PendingSubdimTab` 的"数据待生成"占位（仍提示用户跑生成中心）
4. `items.length > 0` → 渲染列表

为减少 noise 不引入新的 design system —— 列表用 `Judgments` 同款 `paper-2 + accent border` 卡片样式即可。

### 3. PendingSubdimTab 保留

它仍被 fallback 路径用作"empty state"组件，不删除。

## 不动

- 后端
- 其他 axis 的 tab
- mock fixture（不引入新 mock）

## 回归

1. `cd webapp && npx tsc --noEmit` exit 0
2. `cd webapp && npm run build` 不报错（验证打包）
3. （可选）dev server 起来后 URL 带 `?scopeId=9e92d4c2-add3-4099-bc53-7a17f9f8a204`：
   - knowledge axis 的 consensus / lineage / external 三个 tab 应显示数据列表
   - concept tab 仍显示"数据待生成"（Scope B concept_drift 物理表 0 行）
   - 给一个空 scope（无数据），4 个 tab 都显示"数据待生成"占位

## 提交

`git add webapp/src/api/meetingNotes.ts webapp/src/prototype/meeting/AxisKnowledge.tsx docs/质量v2/phase-2-frontend-pending-tabs.md`
`git commit -m "feat(web/mn): 4 个 sub-dim tab 接真实 API（consensus/concept/lineage/external）"`
