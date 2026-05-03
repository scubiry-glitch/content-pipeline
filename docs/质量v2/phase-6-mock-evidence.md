# Phase 6 · 证据分布 mock → 真实派生

## 现状勘察

`webapp/src/prototype/meeting/AxisProjects.tsx`：底部第二张 CalloutCard "证据分布" body 仍硬编码：

```jsx
<CalloutCard title="证据分布">
  A 级 1 · B 级 2 · C 级 2 · D 级 1。
  <b>D 级假设不该出现在 current 决议的支撑链里</b> —— 它是噪音级别的。
</CalloutCard>
```

数字与"D 级提示"全是 demo 文案。同时 `webapp/src/prototype/meeting/AxisKnowledge.tsx` 顶部的 `EVIDENCE_GRADES`（53-62 行）仍是硬编码数组，但它只在 `<Evidence />` fallback（`EvidenceLive` 失败 / forceMock 时）被消费 —— Phase 4 已经把活跃路径切到 `<EvidenceLive>`，本次不再清。

## 改动

### `AxisProjects.tsx · AssumptionLedger`

派生 `evidenceDist`：

```ts
const evidenceDist = isMock
  ? null
  : rows.reduce(
      (acc, r) => { acc[r.evidenceGrade] = (acc[r.evidenceGrade] ?? 0) + 1; return acc; },
      { A: 0, B: 0, C: 0, D: 0 } as Record<'A'|'B'|'C'|'D', number>,
    );
```

CalloutCard body 渲染：

- `isMock` → 保留原 hardcoded 文案
- `evidenceDist` 计算后：`A 级 {dist.A} · B 级 {dist.B} · C 级 {dist.C} · D 级 {dist.D}`，再跟一句简短点评：
  - 有 D 级 → "D 级假设不应支撑当前决议"
  - 有 C 级且 ≥ A+B → "证据弱项偏多"
  - 多数 ≥ B 且 D=0 → "整体证据扎实"
  - 其他 → 不带评语

### 不动

- `<EvidenceLive>` / `aggregatedEvidence`（Phase 4 已就绪）
- `<Evidence />` fallback（仅 forceMock 路径）
- `EVIDENCE_GRADES` 顶部数组（保留作 fallback；不引入循环依赖到 rows）

## AxisRegeneratePanel 同步

证据分布是 assumptions 数据的派生维度，不是独立 sub-dim。`SUB_META.assumptions` 已包含；`TAB_TO_SUBS.projects.assumptions: ['assumptions']` ✓。

无需改 panel。

## 回归

1. `cd webapp && npx tsc --noEmit` exit 0
2. dev：scope=9e92d4c2 → callout 显示真实 4 类 grade 计数（约 A 1 · B 14 · C 132 · D 109，按目前 mn_assumptions 分布）
3. forceMock → callout 保持原硬编码 "A 级 1 · B 级 2 · C 级 2 · D 级 1"
4. 空 scope 或 0 假设 → callout 显示 "A 级 0 · B 级 0 · C 级 0 · D 级 0" 不带评语

## 提交

```
git add webapp/src/prototype/meeting/AxisProjects.tsx \
        docs/质量v2/phase-6-mock-evidence.md
git commit -m "feat(web/mn): 证据分布 callout 改派生自真实 mn_assumptions（Phase 6）"
```

## 质量提升效果

- "证据分布" callout 从硬编码 demo "1/2/2/1" → 当前 scope 真实计数
- 用户看到的 D 级提醒（"D 级假设不应支撑..."）只在真有 D 级时出现，避免误报
- 与上方 Phase 5 的"高危假设"卡片数据源同步（同一个 rows），不会出现"主表已变 callout 还是去年数字"
