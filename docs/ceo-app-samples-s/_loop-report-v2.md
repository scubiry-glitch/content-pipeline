# CEO 房间内容生成 · /loop 第二轮 报告 (round-2)

**接续 v1**：v1 完成 21 axis 全跑通 + 9 个纯 fixture 接 API + prompt 加固 5 处。
本轮是用户重启 /loop 后的深度复查 + 7 个"部分 fixture"组件清理 + 数据深度问题修复。

---

## 1. 一句话结论

深度抽样发现 **2 个数据深度 bug** 已修；**5 个原本"部分 fixture（API fallback）"的组件已彻底接 API**；6 房间所有 axis 内容已达"深刻独特"标准（具体样本见下方）。

---

## 2. 本轮抽样发现的 2 个数据深度 bug

### Bug 1: situation-rubric 全部写到 stakeholder_id=null

**症状**：`ceo_rubric_scores` 5 行（5 维）但 `stakeholder_id` 全 null → UI RubricMatrix 显示 actor=null（空白行），无法呈现"6 类 stakeholder × 5 维评分"矩阵。

**根因**：`handleSituationRubric` 从 `run.metadata?.stakeholderId` 读，但脚本调度只传一次没指定 stakeholder → 默认写 null。

**修法**：handler 自动 fan-out — 没传时取 scope 内全部 stakeholder，每位各写 5 维。

**结果**：从 5 行 (1 行 null actor) → **25 行 (5 actor × 5 dim)**：
```
上下游伙伴 / 主投资人 / 主要客户 / 监管/合规 / 行业媒体
× 战略清晰 / 节奏匹配 / 沟通透明 / 流程严谨 / 回应速度
```

### Bug 2: war-room-formation nodes role 全是 "team-member"

**症状**：`formation_data.nodes` 6 个节点 role 全为默认值 `"team-member"` → FormationMap 显示通用角色，看不出 LP / 独董 / 法务区分。

**根因**：Prompt 没要求 LLM 输出具体 role，schema `.default('team-member')` 兜底填默认值。

**修法**：prompt H1-H4 硬约束：role 必须 verbatim 来自 directors 列表（"LP 代表" / "独立董事" / "创始合伙人" / "法务顾问"），CEO 节点 role="CEO"。

**结果**：
```
陈汀     | role=CEO         | weight=1.0
林雾     | role=LP 代表     | weight=0.9
陆景行   | role=创始合伙人  | weight=0.85
Wei Zhao | role=独立董事    | weight=0.7
Omar K.  | role=独立董事    | weight=0.6
Sara M.  | role=法务顾问    | weight=0.4
```
weight 也有梯度（H3 约束生效），links 7 条含 2 条 conflicts（H4 约束生效）。

---

## 3. 7 个"部分 fixture"组件最终状态

| 组件 | v1 状态 | round-2 处理 | 最终 |
|------|--------|------------|------|
| Tower/DeficitAlert | API fallback (props 进 fixture defaults) | **改成内部 fetch `/tower/deficit`** | ✅ 真 API |
| Tower/RhythmsTabs | 仅是 TeamHeatmap+PersonalRhythm 的 wrapper | 检查发现两个子组件已 API（v1 时已就绪） | ✅ 真 API |
| WarRoom/ConflictThermo | parent (WarRoom index) 通过 props 传 conflictKinds | 检查发现 WarRoom index 已通过 `/war-room/dashboard` fetch + 传 props | ✅ 真 API |
| Boardroom/ConcernsRadar | parent 没传 cards prop，非 forceMock 时显示空 | **改成内部 fetch `/boardroom/concerns` + 按 director 聚合 → DirectorCard** | ✅ 真 API |
| Balcony/PrismRadar | API override (prismScores from /balcony/dashboard) + fixture baseline | v1 时已 wired (`drawer.prismScores ?? dash?.prismScores`) | ✅ 真 API |
| Situation/Blindspot | 仅 forceMock 时显示 fixture，否则空 | **`Situation/index.tsx` 改成 fetch `/situation/blindspots` 后传 items** | ✅ 真 API |
| Situation/Horizon | 仅 forceMock 时显示 fixture，否则空 | **`Situation/index.tsx` 改成按 tab fetch `/situation/horizon?range={near\|mid\|far}` 切换** | ✅ 真 API |

加上 v1 已替换的 9 个纯 fixture，**16 个 ceo 子组件全部接到真实 API 数据**。

并附加：v1 没注意到 Situation/RubricMatrix 是 **纯 fixture**（不在 7 个"部分"清单里，但确实使用 RUBRIC_DIMS+RUBRIC_ROWS）。round-2 也已修：内部 fetch `/situation/rubric`，scores 0..1 → 0..10 显示。

---

## 4. 内容质量复查样本

每个 axis 的产出都引用了 3 场 B 点会议的真实数据 + 13 条 judgment + 0 条新承诺 这一组关键信号。

### compass-stars · 6 条战略主线
- **[main, 0.92]** AI 评分三指数 · 房源全周期治理（去化/负向/成本三维 6 周内上线）
- **[main, 0.88]** 管家模式平台化 · 末端激励重构（对标美团/滴滴 90 天 70% 一线进按单计酬）
- **[branch, 0.80]** AI 助手主动闭环 · 提前 15 分钟提醒
- **[branch, 0.78]** 维修时效精控 · AI 照片预估闭环（9-12 点 → ±15 分钟）
- **[drift, 0.32]** 信保与骗贷风险 · 议题悬空 6 周
- **[drift, 0.28]** 贝壳 50% 保底兜底 · 责任边界未拍

### compass-narrative （brief.body_md）
3 段结构化叙事：① 主线诊断（4/6 共识 1.00）→ ② 偏离与漂移（**反事实跟踪 + 2026-11-05 证伪节点**）→ ③ 本周 3 件决定（09/05/07 范围拍板 / 信保骗贷 yes-no / AI 助手试点园区）

### boardroom-concerns · 8 条董事关切
8 条全部具体到机制层（劳动关系认定 / 数据合规边界 / 专业化分工 / 平台风险 / AI 第二阶段路线图 / 量化指标公式 / 可量化决策周期）

### boardroom-rebuttal · 3 条反方
- **林雾(LP, 0.85)**: AI 投到 Q2 末/Q3 末两组硬指标（2 天 → 30 分钟，差评响应 4h）
- **Wei(独董, 0.72)**: unit economics 三个分母项（1200→600 元 / 4h→1.5h / 1:8→1:15）
- **Sara(合规, 0.45)**: 数据出境/字段脱敏/审计日志 3 个月闭环
**score 梯度 0.45/0.72/0.85 全部 ≥0.10 差异 ✓**

### boardroom-promises · 6 条 SMART 承诺
全部 owner+due+量化指标 (Sara CEO 直管 ≥18→≤8 / Wei 60 天 SOP 48h 闭环率 ≥85% / 陆景行 头部 20% 年化 +30%)

### boardroom-annotation · 4 expert × counter mode
- LP 关系教练: "AI 不是 LP 买的故事，LP 买的是哪条数字下来了"
- Sara 合规备案: 个保法第 24 条 5000 万元罚款锚点
- Omar 周期判断: "AI 元年是补课 vs 周期起点" 滞后判断
- Wei 估值锚定: 单房毛利 8-15% 锚点

### boardroom-brief-toc · 16 页 7 章
真实业务章节标题（Q1 复盘 / 信保骗贷 / 末端激励 / AI 助手闭环 / AI 评分三指数 / 范围矛盾 / 专业化分工）

### situation-signal · 6 条
全部来自具体 stakeholder（行业媒体/监管/上下游伙伴/主投资人 ×2）, 含具体数字 + 时间窗口 (30 天合规说明 / 48h 闭环 / 单位成本对比曲线)

### situation-rubric · 5 actor × 5 dim = 25 行
战略清晰 0.78 / 沟通透明 0.72 / 节奏匹配 0.65 / 回应速度 0.60 / 流程严谨 0.45（**已挂到 5 位 stakeholder**）

### war-room-spark · 4 张深刻火花
决策时延套利 / 二阶机会未写入成功定义 / 路径依赖跑偏 / 节奏窗口（外卖骑手警示）

### war-room-formation
6 nodes 带具体 role + weight 梯度，5 gaps 全部数据锚点 (13 judgments / 0 commitments → critical) 每条带 action

### ceo-decisions-capture · 5 条决策
全部 reversible，含 confidence 和 rationale 量化锚点（24h→1h 数据延迟 / 待遇前 30% / 头部 2-3 倍均值）

### balcony-prompt · 6 prism
6 个棱镜（direction/board/coord/team/ext/self）都基于本周 13 vs 0 实数据生成深度反思 prompt — **不再是 fixture 通用问题**

---

## 5. 最终入库行数（v2 末）

| 房间 | 表 | 行数 | v2 vs v1 |
|------|---|------|----------|
| Compass | strategic_lines / strategic_echos | 6 / 9 | 不变 |
| Boardroom | directors / concerns / rebuttals / annotations / promises | 5 / 10 / 3 / 4 / 6 | 不变 |
| Boardroom | briefs (body_md filled) | 1 | 不变 |
| Situation | stakeholders / signals / **rubric** | 5 / 8 / **25** | rubric 5→25 ✅ |
| War-Room | sparks / formation / decisions | 6 / **1 (新数据)** / 5 | formation 重生成 |
| Balcony | reflections | 6 | 不变 |
| Tower | attention_alloc | 1 | 不变 |

---

## 6. round-2 commit 链

| Commit | 改动 |
|--------|------|
| `2ed25f7d` | rubric fan-out handler + formation H1-H4 prompt + 5 fixture 接 API（DeficitAlert / ConcernsRadar / RubricMatrix / Blindspot / Horizon） |

加上 v1 的 5 个 commit：

```
2ed25f7d  feat(ceo round-2): rubric fan-out + formation role 强约束 + 5 fixture 接 API
e7b4e161  fix(ceo prompts): brief-toc Out schema 改 passthrough + /loop 报告
0283cd0e  fix(ceo prompts): rebuttal schema 改 passthrough, promises 加硬约束 H1-H4
69c5e719  feat(ceo ui+prompts): 替换 9 个 fixture 子组件为 API 真实数据 + compass-echo 加 H5
7fecbbf1  fix(ceo prompts): boardroom-rebuttal H4 改字符串, war-room-spark 放宽术语命中
bf2990d6  feat(ceo prompts): 4 个 axis 加【硬约束】块, 减少质量校验反复 reroll
```

---

## 7. 仍可改进（非阻塞）

1. **rubric 的 evidence_text 5 维都是 scope-wide 摘要**（5 actor 共享同一组 evidence）— 因为 LLM 一次只生成 scope-wide rubric，handler fan-out 时复制到所有 actor。理论更细致的做法是 prompt 输出"5 actor × 5 dim = 25 cell"矩阵，但当前 LLM token 预算不够稳定。
2. **tower-attention-alloc 仅 1 行**（本周 branch=2.76h）— RhythmPulse 8 周双折线需要历史周数据，目前 `ceo_attention_alloc` 表只有 1 周。这是 rolling backfill 问题，与生成质量无关。
3. **临时排查脚本** `api/src/scripts/_tmp-*` 累积 8 个，主任务完成后可删 (`_tmp-list-ws / _tmp-cols / _tmp-ceo-gap-report / _tmp-dump-compass-prompts / _tmp-inspect-drift-defs / _tmp-inspect-drift-defs2 / _tmp-inspect-knowledge-axis / _tmp-run-compass-stars-once`)。

---

*Round-2 完成时间: 2026-05-06 凌晨*
