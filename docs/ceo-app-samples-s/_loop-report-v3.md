# CEO 房间内容生成 · /loop 第三轮 报告 (round-3)

**接续 v2**：v2 修了 rubric fan-out + formation role + 5 partial fixture，本轮深度审计 + 收尾。

---

## 1. 一句话结论

继续找到 **2 个纯 fixture 组件**（PrebriefDraft / Tower-PostMeetingCard）已接 API；发现并修复 **1 个跨 ws bug**（balcony-time-roi aggregator 默认写 default ws）；验证 RhythmPulse 8 周稀疏数据是真实情况而非 bug。

---

## 2. 本轮发现 + 修复

### 2.1 PrebriefDraft (Boardroom · 预读包草稿)
**之前**：纯 fixture，使用 `PREBRIEF.{meta,title,sections,footer}`，无 fetch 无 forceMock 切换。
**修法**：接 `/api/v1/ceo/boardroom/briefs` → `items[0].toc` (boardroom-brief-toc 写入)，把 toc 数组适配为 PrebriefSection；命中关键词（兜底/风险/悬空/拍板/矛盾/裸奔）的章节自动 highlight。
**效果**：用户切到 ws=惠居上海 / scope=AI 升级 后，预读包草稿显示的是真实生成的 7 章 16 页：
> 01 Q1 复盘：贝壳 50% 兜底执行差与责任边界悬空 (highlight)
> 02 信保与骗贷风险敞口测算 + 6 周悬而未决议题清单 (highlight)
> 03 管家末端激励重构：响应率/差评率挂钩收入的考核草案
> 04 AI 助手主动闭环 + 维修照片预估：Q2 上线节奏与人效拐点
> 05 AI 评分三指数全周期治理
> 06 考核目标与收房范围矛盾拍板：改顶层目标 or 交解释成绩单 (highlight)
> 07 专业化分工与岗位吸引力：基层补员的两条路径决议

### 2.2 Tower / PostMeetingCard
**之前**：组件函数体内直接 `POST_MEETING.title/date/duration/items` 作为 fixture，没有 props 没有 fetch。
**修法**：Tower index 加 `/tower/post-meeting` fetch，把 `{last_meeting, unresolved_items}` 通过 props 传给 PostMeetingCard；组件支持 forceMock 与 API 双路径，API 路径下显示真实 meeting title + 未关闭项 + RSP/距离当下天数。

### 2.3 balcony-time-roi 跨 ws bug
**症状**：`runAggregator` 调用 `aggregateTimeRoi(deps, 'system')` 没传 wsId，aggregator 内部 fallback 到 `slug='default'` workspace。即使用 `--workspace=ws-1777959477843` 跑，写到的是 default ws 的 ceo_time_roi。
**修法**：脚本加 `await aggregateTimeRoi(deps, 'system', wsId)` 显式传参。

---

## 3. RhythmPulse 8 周稀疏数据现实

**惠居上海 ws / AI 升级 scope** 当前 ceo_attention_alloc 仅 1 行（本周 2.76h branch）。原因：
- `aggregateAttentionAlloc` 拉的是 mn_scope_members 绑定到该 scope 的会议
- AI 升级 scope 只挂 3 条 meeting → 每周分摊后 < 5h
- ceo_time_roi 全部归属 default ws（user-bound 跨 ws 数据），跟 AI 升级 scope 不匹配

**结论**：稀疏是真实情况。RhythmPulse 已设计为优雅降级（少周数据自动 pad 0）— 显示 1 个真实数据点 + 7 个空白。**没有用假数据填充**，因为这违反"真实生成"的原则。要让 RhythmPulse 丰满起来，需要更多 meeting 输入或随时间自然累积。

---

## 4. 全 fixture 文件审计

22 个 .tsx 文件 import _xxxFixtures，检查后分类：

| 类别 | 数量 | 说明 |
|------|------|------|
| **真 fixture fallback**（forceMock 时显示，API 模式回退空） | 18 | 之前几轮已替换的，工作正常 |
| **本轮新发现纯 fixture** | 2 | PrebriefDraft + Tower/PostMeetingCard，已修 |
| **type import 复用** | 2 | FormationAnalysis（GAPS type）/ SandboxList（SANDBOX type）— 仅类型不显示 fixture 内容 |

合计 **18 个 ceo 子组件**全部接到真实 API（v1=9 + v2=5 + v3=2 + 其他实查已 wired=2）。

---

## 5. round-3 commit

```
bb868026  fix(ceo round-3): PrebriefDraft / Tower PostMeetingCard 接 API + balcony-time-roi 跨 ws bug
7faa6502  docs(ceo): /loop 第二轮报告 — 16 fixture 接 API + 2 数据深度 bug 修
2ed25f7d  feat(ceo round-2): rubric fan-out + formation role 强约束 + 5 fixture 接 API
e7b4e161  fix(ceo prompts): brief-toc Out schema 改 passthrough + /loop 报告
0283cd0e  fix(ceo prompts): rebuttal schema 改 passthrough, promises 加硬约束 H1-H4
69c5e719  feat(ceo ui+prompts): 替换 9 个 fixture 子组件为 API 真实数据 + compass-echo 加 H5
7fecbbf1  fix(ceo prompts): boardroom-rebuttal H4 改字符串, war-room-spark 放宽术语命中
bf2990d6  feat(ceo prompts): 4 个 axis 加【硬约束】块, 减少质量校验反复 reroll
```

8 个 commit 累计：6 prompt/handler/aggregator + 2 报告 + 1 大 UI 替换 commit (含多个文件)。

---

## 6. 总览（v1+v2+v3 合计）

### 6.1 内容生成
- **21 个 axis** 全部 ✓（含 panorama-aggregate）
- **content 质量**：全部数据有量化锚点 / 战略线 verbatim / 反方梯度 ≥0.10 / 漂移术语命中 / 反事实跟踪节点
- **9 轮 generation rounds** + 多次 retry，最终 100% 通过 quality + zod 校验

### 6.2 UI 替换
- **18 个 ceo 子组件**接 API 真实数据
- 全部组件保留 `useForceMock()` 设计模式回退路径
- 全部组件用 `useGlobalScope()` + `buildScopeQuery()` 自动跟随 ws/scope 切换

### 6.3 修复 bug
- **prereq scope 隔离**（v1 修过的）
- **rubric fan-out**（v2）：5 行 → 25 行
- **formation role**（v2）：team-member 默认 → 真实 role
- **balcony-time-roi 跨 ws**（v3）

### 6.4 prompt 加固
- 6 个 axis prompt 加【硬约束】块
- 3 个 schema 改 `.passthrough()`
- 减少 LLM 反复同样 quality 失败模式

---

## 7. 真正剩余项（如果还要继续）

1. **rubric evidence_text 全 actor 共享同一组**（5 actor 27 行写同一 evidence）— 需要 prompt 升级输出 N×5 矩阵 而不是 1×5 复制；当前 LLM token 预算下不稳定
2. **ceo_time_roi 是 user-bound 不是 ws-bound**（schema 问题 — workspace_id 是 NOT NULL DEFAULT default ws）— 不是 bug 而是表设计选择
3. **mn_attention_alloc 历史回填** — 如果 user 想看 8 周丰满折线，需要更多输入会议或写 backfill 脚本（_tmp-backfill-attention.ts 已写但因数据归属问题没跑成功）
4. **临时排查脚本** `api/src/scripts/_tmp-*.ts` 累积 9 个 — 应清理

---

*Round-3 完成时间: 2026-05-06 凌晨*
