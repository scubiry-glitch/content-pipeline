# Phase 5 · 高危假设 mock → 真实数据

## 现状勘察

`webapp/src/prototype/meeting/AxisProjects.tsx`：

- `AssumptionLedger` 主列表（每条假设的卡片）：✅ 已 API 化（`listScopeAssumptions`），mock fallback 只在 forceMock / 非 UUID scope 时触发
- 底部 3 张 CalloutCard：
  - **"高危假设 · 未验证"** ❌ 硬编码 `<b>AS-04</b> (LP 反弹) 和 <b>AS-02</b> (配额) ...` —— 这就是 mock
  - "证据分布" ❌ 硬编码 `A 级 1 · B 级 2 · C 级 2 · D 级 1` —— **留给 Phase 6**
  - "机制价值" ❌ 产品文案 commentary —— **留给 Phase 9 i18n**

Phase 5 只动第 1 张 callout。

## 改动

### `AxisProjects.tsx` 派生 `highRiskAssumptions`

在 `AssumptionLedger` 内 `rows` 变化时计算：

```ts
const highRisk = rows
  .filter((r) => r.verificationState.startsWith('未验证'))
  .filter((r) => r.evidenceGrade === 'C' || r.evidenceGrade === 'D')
  .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
  .slice(0, 3);
```

### 替换 CalloutCard 内容

- ≥ 2 条高危：列出 top 2 的 `id` + 简短 text 摘要 + 共同支撑（如有 underpins 重叠）；提示"安排 verifier"
- 1 条高危：单条 callout + 提示
- 0 条高危：弱化 tone，写"暂无高危未验证假设"
- 主列表 mock 时（fallback）：保留原硬编码文案，避免 mock 数据上跑 dynamic 让人看不懂

### 不动

- `listScopeAssumptions` 路由（已 wired）
- "证据分布" / "机制价值" 两张 callout（Phase 6 / 9）
- AssumptionLedger 主列表

## AxisRegeneratePanel 同步

- `TAB_TO_SUBS.projects.assumptions`：仍 `subs: ['assumptions']` ✓
- 用户从 assumptions tab 点 ↻ → 触发 `assumptions` 子维度 → 写入 mn_assumptions（带 evidence_grade / verification_state / confidence）→ 主表 + 高危卡都自动刷新

无需改 panel。

## 回归

1. `cd webapp && npx tsc --noEmit` exit 0
2. dev：scope=9e92d4c2 装修信托（已 414 条 open_questions + 256 假设）→ 高危卡片显示真实 ID (e.g. AS-XYZA7B 等) 与 text 摘要
3. forceMock 模式 → 高危卡保持原 hardcoded "AS-04/AS-02"

## 提交

```
git add webapp/src/prototype/meeting/AxisProjects.tsx \
        docs/质量v2/phase-5-mock-assumptions.md
git commit -m "feat(web/mn): 高危假设 callout 改派生自真实 mn_assumptions"
```

## 质量提升效果

- "高危假设 · 未验证" callout 从硬编码 demo 文案 → scope 真实数据派生
- 用户在 projects/assumptions tab 同时看到完整列表 + 自动汇总的 top-N 高危
- mock 模式（forceMock / 测试态）保留可读文案，不破坏 demo 演示
