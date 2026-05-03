# Phase 4 · Cognition 摘要 + Evidence 分布前端接入

## 现状勘察

诊断 `webapp/src/prototype/meeting/AxisKnowledge.tsx`：

| 段 | 状态 |
|---|---|
| `<Judgments scopeId={scopeId} />`（cognition tab 主体） | ✅ 已 API 化 (`listScopeJudgments`)，按 reuse_count + generality_score 排序 |
| **本场新认知摘要** placeholder（cognition tab 下方） | ❌ 静态占位文案"待 LLM 抽取；v1 暂沿用上方 Judgments 的高 generality 子集" |
| `<EvidenceLive data={aggregatedEvidence ?? knowledgeData?.evidence_grades} />` | ✅ 已 API 化：scope 级聚合（遍历 scope 下 N 场 meetings → sum dist_a/b/c/d → 重算 weighted_score）+ per-meeting fallback |
| `<Evidence />` fallback（硬编码 `EVIDENCE_GRADES`） | ⚠️ 仅在 forceMock 或 scope 不是 UUID 时回退；正常使用路径已绕过 |

结论：**Phase 4 真正需要做的只有"本场新认知摘要"落地**，Evidence 已闭环。

## 改动

### `AxisKnowledge.tsx` 新增 `<NewCognitionSummary meetingId={meetingId} />`

放在 cognition tab，替换静态占位 div。组件行为：

1. `useEffect` 调 `meetingNotesApi.getMeetingAxes(meetingId)`（已存在）拿 `knowledge.judgments` 数组
2. 按 `generality_score >= 0.7` 过滤；不足 3 条则降到 0.5
3. 按 `generality_score DESC, reuse_count DESC` 取 top 3
4. 列出每条：`text` + `domain` chip + `generality_score` 进度条
5. 空数据 → 保留原占位 UI（dashed border + "本场尚未提炼出可复用新认知"）
6. 不传 meetingId（forceMock / 非 UUID）→ 占位 UI

视觉：复用 Judgments 同款 paper-2 + accent-left-border 卡片，标题"本场新认知摘要"，副标"≥0.7 generality_score 子集"。

### 不动

- `<Judgments>`（已就绪）
- `<EvidenceLive>` / `aggregatedEvidence`（已就绪）
- 后端 `/meetings/:id/axes` 路由
- `<Evidence />` fallback

## AxisRegeneratePanel 同步

- `TAB_TO_SUBS.knowledge.cognition`：仍 `subs: ['reusable_judgments']` ✓
- 用户从 cognition tab 点 ↻ 重算 → 触发 reusable_judgments 子维度 → 写入 mn_judgments → 既驱动 Judgments 列表，也驱动新加的 NewCognitionSummary

无需改动 AxisRegeneratePanel。

## 回归

1. `cd webapp && npx tsc --noEmit` exit 0
2. `cd webapp && npx eslint src/prototype/meeting/AxisKnowledge.tsx` 无新错
3. （可选 dev）打开 `?scopeId=9e92d4c2…&meetingId=8226c3bb-…` cognition tab：
   - 上半 Judgments 按 reuse 排序 ✓
   - 下半新摘要列出 1-3 条最高 generality 的本场判断 ✓
4. （可选 dev）切到不同 meeting 看摘要是否随 meetingId 变化

## 提交

```
git add webapp/src/prototype/meeting/AxisKnowledge.tsx \
        docs/质量v2/phase-4-cognition-evidence.md
git commit -m "feat(web/mn): cognition tab 加「本场新认知摘要」live 组件"
```

## 质量提升效果

- "本场新认知摘要"从静态占位 → 真实数据：列出本场会议提炼的 1-3 条最具复用性的新判断（generality_score ≥ 0.7）
- 用户在 cognition tab 一眼区分 "scope 级历史沉淀"（上方 Judgments）vs "本场新增"（下方摘要）
- Evidence 分布维持不变（已闭环），无回归风险
