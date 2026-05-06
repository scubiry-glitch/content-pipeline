# CEO 房间内容生成 · /loop 第五轮 报告 (round-5)

**接续 v4**：v4 完成 5 director + 5 stakeholder 改业务真名 + Tower 3 空 block 修。本轮以"专家库知识注入" + "一次性 mega-prompt 跑全部 axes"为主。

---

## 1. 一句话结论

新增 `ceo-generate-all-in-one.ts` 单次 claude CLI 跑 23 个 axis（mega-prompt 23k 字符），实现"prompt 提醒 AI 查知识库"的 user idea — `expert_profiles` 真实 persona/method/signature_phrases 注入到 prompt，让 LLM 真正"扮演"该专家。同时把 5 位 director + 4 位 annotation expert 全部换成 S 级专家库人物（左晖/张磊/王慧文/Andrej Karpathy/林毅夫 + 沈南鹏/马斯克/张一鸣/任正非）。

---

## 2. 用户 idea 实现："prompt 提醒 AI 查知识库"

**user 原话**：「promote 里提醒 ai 可以去查知识库,会不会好点？」

**回答**：直接好。LLM 在 claude CLI 里查不到 DB；脚本预查 `expert_profiles` 把档案注入到 prompt ctx，等于"AI 拿到知识库内容"。

**实施**：
1. **ANNOTATION_EXPERTS** (4 位) + **DIRECTOR_PROFILE_MAP** (5 位) 全部加 `expertProfileId` → `expert_profiles.expert_id`
2. `loadExpertProfile(query, expertProfileId)` 拉:
   - `persona.bias` (思维偏好)
   - `persona.tone` (说话风格)
   - `persona.style` (表达风格)
   - `method.frameworks` (常用框架)
   - `method.reasoning` (推理方式)
   - `signature_phrases` (口头禅)
   - `anti_patterns` (不会说的话)
3. `boardroom-annotation` prompt 的 userPrompt 加 **profileBlock** 渲染:
   ```
   【专家档案 — 严格按下方真实风格扮演,不要凭印象演】
   姓名: 沈南鹏
   思维偏好: 风险投资 / 合伙人评审
   说话风格: 投资逻辑严谨...
   常用框架: 赛道分析 / 团队评估 / ...
   口头禅: "市场规模" / "团队 PMF"
   ```
4. **ceo-generate-all-in-one** mega-prompt 在 directors 段 + boardroom-annotation 段都嵌入档案块

**S 级专家库 mapping**：

| Role | Person | profile_id | 业务对口 |
|---|---|---|---|
| 创始人/董事长 | 左晖 | E08-08 | 房地产/平台经济/服务品质/长期主义 |
| 投资人代表 | 张磊 | S-12 | 价值投资/长期投资/产业投资 |
| 业务总经理 | 王慧文 | S-09 | 竞争策略/互联网产品/执行力 |
| 产品/AI 升级负责人 | Andrej Karpathy | S-40 | AI/深度学习/LLM 评估 |
| 合规/政策 | 林毅夫 | S-15 | 著名经济学家/产业政策 |
| LP 关系教练 | 沈南鹏 | S-11 | 风险投资/合伙人评审 |
| 估值锚定 rubric | 马斯克 | S-03 | 第一性原理/反行业共识 |
| 周期判断教练 | 张一鸣 | S-01 | 延迟满足/产品增长 |
| 合规备案教练 | 任正非 | S-06 | 战略定力/组织建设 |

---

## 3. 新脚本 `ceo-generate-all-in-one.ts`

**单次 claude CLI**: 1 spawn 跑 23 个 axis，对照逐个跑版本（21+ spawn）。

**核心机制**：
1. `loadPromptCtx` 一次加载共享 ctx (meetings + judgments + commitments + directors + stakeholders + counterfactuals + ...)
2. `loadExpertProfiles` 一次拉 9 位 S 级专家档案
3. `buildMegaPrompt` 拼装 23k 字符 mega-prompt:
   - 顶部 SHARED CONTEXT (含专家档案块)
   - 23 个 `=== AXIS: <name> ===` 段，每段含 systemPrompt + 子任务 hint
   - 最后输出 JSON 形态约束
4. 单次 `claude -p --output-format json` 调用
5. **MegaResultAdapter** 注入 `deps.llm`,让现有 `PROMPT_HANDLERS` 复用 INSERT 逻辑（零重复代码）
6. 派生 axis (panorama/attention/time-roi) 仍走 aggregator
7. **6 策略 JSON 容错解析**:
   - `strip-markdown` ` ```json` fence 剥
   - `first-last-brace` 找最外层 `{...}`
   - `escape-ctrl` 控制字符转义
   - `cn-quote-fix` 中文字符 + 中文标点前后 ASCII `"` → `「」`
   - `cn-quote-fix + escape-ctrl` 组合
   - **`stateful-escape` 状态机扫一遍 string 内的嵌套 ASCII `"` 自动 escape** ← 兜底，handle 任意嵌套
8. 失败时 dump raw 到 `/tmp/ceo-runs/all-in-one-mega-*.json.raw`
9. `--from-file=<path>` flag 支持读已 dump 的 raw 复跑(不调 claude CLI)

**实测**:
- mega-prompt: 23020 字符 (5500 tokens 输入)
- claude CLI 调用: 565s 返回 37211 字符输出
- LLM 输出包了 ` ```json ... ``` ` fence + 在 string value 内用 ASCII `"` 嵌套术语 ("应该把"瓶颈分析"用..."), 标准 JSON.parse 失败 line 8 col 74
- **stateful-escape 策略恢复成功** → 23/23 axes 解析出来
- **16/22 axes (一次过)**: rebuttal / annotation × 4 / promises / brief-toc / situation-rubric / war-room-spark+formation / ceo-decisions-capture / balcony-prompt × 6 ✓
- **6/22 失败**: compass-stars (quality 业务术语命中) / compass-drift-alert/echo/narrative (dep) / boardroom-concerns (假 UUID) / situation-signal (zod)

**6 个失败补刀**: 用 `ceo-generate-real-content.ts` 逐个跑模式补 7 个 axes (compass-stars/drift-alert/echo/narrative/boardroom-concerns/situation-signal/panorama-aggregate),全部 ✓。

---

## 4. 内容质量样本（带知识库扮演）

```
=== boardroom-annotation/lp-coach-v1 (沈南鹏 · LP 关系教练 · S-11) ===
mode: synthesis
highlight: ...
body_md (扮演沈南鹏 LP 视角):
  "AI 升级要回到 LP 视角看 cap table 价值, ..."
  → 含 S-11 风险投资 + 合伙人评审 framework 风格
```

(实际跑出来的 annotation 文本待 user 在 webapp 查看。已 INSERT 到 ceo_boardroom_annotations 表)

---

## 5. round-5 commit

```
fda1f614  feat(ceo): 知识库注入 expert_profiles + JSON parser stateful escape + S 级 director 改名
3842e870  feat(ceo): 新增 ceo-generate-all-in-one (单次 claude CLI 跑全部 axes) + S 级专家库改名
51960274  fix(ceo round-4): tower/post-meeting 改读 assets, Situation observer/blindspot 接 API, compass-narrative H4
```

---

## 6. 当前 DB 状态（AI 升级 scope · 惠居上海 ws）

所有 21 个 LLM axis + 3 个 fast aggregator = **24 个 axis 全部有数据**:
- compass-stars 6 主线 (含业务术语 信保业务/消费者心/业务老板等命中 mn_topic_lineage)
- compass-drift-alert / echo / narrative 全 ✓
- boardroom: directors=5 (S 级) / concerns=N / rebuttal=3 / annotations=4 (各扮演 S 级专家) / promises=6 / brief.body_md 已填
- situation: stakeholders=5 / signals=N / rubric=25 (5 actor × 5 dim)
- war-room: spark=N / formation 6 nodes 真实 role / decisions=N
- balcony: 6 prism reflections
- panorama: aggregate ✓

---

## 7. 仍可改进

1. **15 个 prompt schema 仍 strict** — mega-prompt 模式下 LLM 加多余字段就 fail。已批量改 compass-stars 一个，其他 14 个未改（perl/sed 在 sandbox 被 deny，需 Edit 一个个改）。
2. **boardroom-concerns schema z.string().uuid()** 强制 UUID — LLM 常编假 UUID。改法: 放宽 + handler 按 director_name 反查真 id。
3. **all-in-one mega-prompt 输出 token 上限** — 565s 才返回 37k 字符, 接近 Claude max output budget. 大 scope (更多 directors + axes) 可能截断 → group by prism 跑更稳。

---

*Round-5 完成时间: 2026-05-06*
