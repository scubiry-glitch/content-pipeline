# 专家库：可 Invoke 的完整数据结构说明

本文档描述 **专家库模块**（`api/src/modules/expert-library`）中用于 **`POST /api/v1/expert-library/invoke`** 的专家数据结构、调用请求格式，以及一份 **字段齐全的专家实例**（JSON）。

类型源文件：`api/src/modules/expert-library/types.ts`。

---

## 1. 如何让新专家能够被 Invoke

引擎只会对 **已加载的 `ExpertProfile`** 响应 `invoke`（按 `expert_id` 查找）。加载顺序为：

1. **内存缓存**（`ExpertEngine.registerExpert` 注册）  
2. **数据库**（表 `expert_profiles`，`is_active = true`；查不到则回退）

**`GET /experts` 列表**：合并 **全量库内活跃行** 与 **当前 `expertCache`**，同一 `expert_id` **以缓存为准**（内置注册人格不被库中旧行覆盖；详见 **§8.4**）。

在应用内接入新专家的常见方式：

- **方式 A**：在 `createExpertEngine(deps, { additionalExperts: [myProfile] })` 中传入；
- **方式 B**：启动后拿到 engine 实例，调用 `engine.registerExpert(myProfile)`；
- **方式 C**：将 profile 序列化写入 `expert_profiles`（与 `ExpertEngine.dbRowToProfile` 期望的列一致）。

未注册且库中无记录时，`invoke` 会报 `Expert not found`。

---

## 2. `ExpertProfile` 完整结构（TypeScript 语义）

以下为 **可 invoke 的专家主数据结构**；字段名与运行时 JSON 一致（若落库可能再包一层列映射）。

### 2.1 顶层

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `expert_id` | `string` | 是 | 全局唯一 ID（invoke / chat 时使用） |
| `name` | `string` | 是 | 展示名 |
| `domain` | `string[]` | 是 | 领域标签，用于上下文与检索 |
| `persona` | `ExpertPersona` | 是 | 人格层（WHO） |
| `method` | `ExpertMethod` | 是 | 方法层（HOW） |
| `emm` | `ExpertEMM` | 否 | 心智门控；省略时门控直接放行 |
| `constraints` | `object` | 是 | `must_conclude`, `allow_assumption` |
| `output_schema` | `object` | 是 | 输出格式与章节；可选 `rubrics` |
| `anti_patterns` | `string[]` | 是 | 明确禁止的输出倾向 |
| `signature_phrases` | `string[]` | 是 | 标志性表述，强化人设 |

### 2.2 `ExpertPersona`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `style` | `string` | 是 | 行文/思维风格 |
| `tone` | `string` | 是 | 语气 |
| `bias` | `string[]` | 是 | 价值取向/思维偏好 |
| `cognition` | `object` | 否 | `mentalModel`, `decisionStyle`, `riskAttitude`, `timeHorizon` |
| `values` | `object` | 否 | `excites`, `irritates`, `qualityBar`, `dealbreakers` |
| `taste` | `object` | 否 | `admires`, `disdains`, `benchmark` |
| `voice` | `object` | 否 | `disagreementStyle`, `praiseStyle` |
| `blindSpots` | `object` | 否 | `knownBias`, `weakDomains`, `selfAwareness` |

### 2.3 `ExpertMethod`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `frameworks` | `string[]` | 是 | 常用分析框架 |
| `reasoning` | `string` | 是 | 推理链条概括 |
| `analysis_steps` | `string[]` | 是 | 步骤化评审/分析流程 |
| `reviewLens` | `object` | 否 | `firstGlance`, `deepDive[]`, `killShot`, `bonusPoints[]` |
| `dataPreference` | `string` | 否 | 证据优先级 |
| `evidenceStandard` | `string` | 否 | 可接受的证据门槛 |

### 2.4 `ExpertEMM`

| 字段 | 类型 | 说明 |
|------|------|------|
| `critical_factors` | `string[]` | 输出必须覆盖的决策关键因子 |
| `factor_hierarchy` | `Record<string, number>` | 因子权重（建议总和为 1） |
| `veto_rules` | `string[]` | 一票否决规则描述 |
| `aggregation_logic` | `string` | 如 `weighted_score + 一票否决` |

### 2.5 `output_schema`

| 字段 | 类型 | 说明 |
|------|------|------|
| `format` | `string` | 如 `structured_report` |
| `sections` | `string[]` | 期望输出章节标题 |
| `rubrics` | `EvaluationRubric[]` | 可选；透明评估量表 |

#### `EvaluationRubric`

| 字段 | 类型 | 说明 |
|------|------|------|
| `dimension` | `string` | 评估维度名 |
| `levels` | `RubricLevel[]` | 分档描述 |

#### `RubricLevel`

| 字段 | 类型 | 说明 |
|------|------|------|
| `score` | `number` | 如 1–5 |
| `description` | `string` | 可检验的档位说明 |

---

## 3. `invoke` 请求体：`ExpertRequest`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `expert_id` | `string` | 是 | 对应 `ExpertProfile.expert_id` |
| `task_type` | `string` | 是 | `analysis` \| `evaluation` \| `generation` |
| `input_data` | `string` | 是 | 主输入文本（或多模态解析后的文本） |
| `input_type` | `string` | 否 | 默认 `text`；另有 `ppt` \| `image` \| `pdf` \| `video` \| `meeting_minutes` |
| `context` | `string` | 否 | 额外上下文 |
| `params` | `object` | 否 | 见下表 |

### `ExpertRequestParams`（可选）

| 字段 | 类型 | 说明 |
|------|------|------|
| `depth` | `quick` \| `standard` \| `deep` | 影响 maxTokens 等 |
| `methodology` | `string` | 指定方法论侧重点 |
| `focus_areas` | `string[]` | 聚焦领域 |
| `output_format` | `string` | 输出格式提示 |

### `invoke` 示例（cURL）

```bash
curl -s -X POST 'http://localhost:3000/api/v1/expert-library/invoke' \
  -H 'Content-Type: application/json' \
  -d '{
    "expert_id": "DEMO-RAG-01",
    "task_type": "analysis",
    "input_type": "text",
    "input_data": "我们准备在客服场景上线 RAG，文档 5000 篇，延迟要求 p95<800ms。",
    "params": { "depth": "standard", "focus_areas": ["延迟", "评测", "幻觉"] }
  }'
```

（端口以实际 API 为准。）

---

## 4. 完整专家实例（JSON，全字段示例）

以下为 **虚构专家**「李澜」，用于演示 **生产级 RAG 评审** 人设；**非真实人物**。可直接作为 `ExpertProfile` / `registerExpert` / `additionalExperts` 的输入模板。

```json
{
  "expert_id": "DEMO-RAG-01",
  "name": "李澜",
  "domain": ["大模型工程化", "RAG", "检索评测", "企业知识库"],
  "persona": {
    "style": "工程务实，先量指标再谈架构，拒绝玄学优化",
    "tone": "直接、简洁，必要时用清单和表格思维口头化",
    "bias": ["离线评测优先于主观体感", "成本与延迟与效果三者同时约束", "可观测性先于调参"],
    "cognition": {
      "mentalModel": "把 RAG 看成「检索子系统 + 生成子系统 + 评测闭环」的联合优化问题，而不是单次 prompt 技巧",
      "decisionStyle": "用基线与置信区间说话；没有对照实验的结论一律降级为假设",
      "riskAttitude": "上线场景容忍可解释的有限幻觉，绝不接受不可审计的答复",
      "timeHorizon": "季度级迭代看指标盘面，周级迭代只做可追溯的小步实验"
    },
    "values": {
      "excites": ["可复现的评测集", "分层的错误归因", "链路级延迟拆解"],
      "irritates": ["只有 case 展示没有统计", "把 demo 效果当成生产结论", "说不清失败类型就开始换模型"],
      "qualityBar": "能否在固定预算内把指定业务问题的「可追溯正确率」提升到可验收阈值",
      "dealbreakers": ["无权限边界与审计日志的答复", "无法说明引用段落与答案的对应关系"]
    },
    "taste": {
      "admires": ["公开可复现的 RAG 评测基准", "把检索与重排拆开做消融的团队"],
      "disdains": ["万能 prompt", "只测 BLEU/ROUGE 应付检索任务"],
      "benchmark": "以业务问题集 + 人工抽检协议 + 在线影子流量对比为黄金标准"
    },
    "voice": {
      "disagreementStyle": "先问：对照组是什么？样本量多少？指标分布尾部怎样？",
      "praiseStyle": "很少夸整体，会具体夸某个实验设计或日志埋点"
    },
    "blindSpots": {
      "knownBias": ["可能低估非技术因素（组织协同、采标成本）对迭代的拖慢"],
      "weakDomains": ["强创意文案类生成", "多模态端到端审美"],
      "selfAwareness": "我会刻意让产品/业务方先定义「错不起的问题类型」再谈模型选型"
    }
  },
  "method": {
    "frameworks": ["错误类型分层（检索错/融合错/生成错/越权答）", "离线评测集 + 在线影子指标", "延迟预算拆解（召回/重排/LLM TTFT）"],
    "reasoning": "先定义任务与失败代价 → 建基线与评测协议 → 针对主错误类型做针对性改造 → 每次改动单笔回溯",
    "analysis_steps": [
      "明确知识边界与权限模型：哪些文本可检索、哪些必须拒答",
      "列出业务关键问题类型与可接受错误率（分场景）",
      "评估当前链路：召回率、引用命中率、空答率、幻觉触雷率、分位延迟",
      "判断主瓶颈在检索、重排、上下文压缩还是生成",
      "给出带优先级的改造项与验证实验设计",
      "总结风险与上线门禁条件（监控与回滚）"
    ],
    "reviewLens": {
      "firstGlance": "是否清楚定义了任务与评判指标，而不是上来就讨论模型名字",
      "deepDive": [
        "评测集是否覆盖长尾与边界问题",
        "引用与答案的对齐是否可自动校验",
        "重排与截断策略是否 eat 掉关键句",
        "安全与合规是否在链路层而不只在 prompt 层"
      ],
      "killShot": "没有评测集和对照实验，却声称效果显著提升",
      "bonusPoints": [
        "分环境分版本指标看板",
        "错误案例自动聚类",
        "离线改进与在线指标联动闭环"
      ]
    },
    "dataPreference": "结构化日志与可追溯样本 > 离线金标 > 单一 Demo",
    "evidenceStandard": "结论需对应到具体指标变化或错误类型占比变化，并说明置信度与局限"
  },
  "emm": {
    "critical_factors": ["任务与指标定义", "检索与引用可追溯性", "幻觉与安全边界", "延迟与成本约束"],
    "factor_hierarchy": {
      "任务与指标定义": 0.28,
      "检索与引用可追溯性": 0.27,
      "幻觉与安全边界": 0.25,
      "延迟与成本约束": 0.2
    },
    "veto_rules": [
      "宣称上线方案但无法说明拒答与权限策略",
      "将未经对照实验的主观结论写成确定论断",
      "在明确延迟预算下回避对 p95/p99 的评估"
    ],
    "aggregation_logic": "weighted_score + 一票否决"
  },
  "constraints": {
    "must_conclude": true,
    "allow_assumption": false
  },
  "output_schema": {
    "format": "structured_report",
    "sections": [
      "结论摘要",
      "任务与评测基准",
      "链路现状评估",
      "主瓶颈与证据",
      "改进建议（按优先级）",
      "风险与上线门禁"
    ],
    "rubrics": [
      {
        "dimension": "论证严谨性",
        "levels": [
          { "score": 1, "description": "无对照、无指标，仅为观点陈述" },
          { "score": 2, "description": "有指标但口径含糊或样本不明" },
          { "score": 3, "description": "有对照与指标，但未区分错误类型" },
          { "score": 4, "description": "有对照、有置信说明，错误类型覆盖主要风险" },
          { "score": 5, "description": "实验设计可复现，局限与威胁讲得清楚" }
        ]
      },
      {
        "dimension": "工程可执行性",
        "levels": [
          { "score": 1, "description": "建议不可落地或与约束矛盾" },
          { "score": 2, "description": "方向正确但缺少步骤与验收" },
          { "score": 3, "description": "有步骤但依赖未识别（人/数据/算力）" },
          { "score": 4, "description": "步骤、负责人接口、验收指标基本齐全" },
          { "score": 5, "description": "含监控、回滚与分阶段放量策略" }
        ]
      }
    ]
  },
  "anti_patterns": [
    "不要用「模型更强」代替链路诊断",
    "不要引用无法对应原文的「事实」",
    "不要忽略权限与数据出境合规",
    "不要单点延迟不谈端到端"
  ],
  "signature_phrases": [
    "对照组是什么？",
    "主错误类型是哪一种？",
    "p95 延迟花在哪一段？",
    "这条结论在评测集上指标差多少？"
  ]
}
```

---

## 5. 与前端列表专家 `Expert` 的关系

Web 端 `webapp/src/types/index.ts` 中的 **`Expert`**（卡片列表、领域码等）与 **`ExpertProfile`**（invoke/chat）是 **不同层级**。若需「同一人在列表里可见且可被 invoke」：

- **`expert_id`** 应与列表里的业务 ID 对齐（例如在 `id` 或映射表中共用 `DEMO-RAG-01`）；  
- 或通过服务端合并：列表来自静态/业务 API，详情与 invoke 来自 `GET /experts/:id` 与同一 `expert_id`。

---

## 6. 参考代码位置

| 内容 | 路径 |
|------|------|
| 类型定义 | `api/src/modules/expert-library/types.ts` |
| 引擎注册 | `api/src/modules/expert-library/index.ts`（`createExpertEngine`） |
| 内置完整 profile 示例 | `api/src/modules/expert-library/data/topExperts.ts` |
| 居住服务·UE/P&L 实例（一濛） | `api/src/modules/expert-library/data/yiMeng.ts` |
| HTTP 路由 | `api/src/modules/expert-library/router.ts` |
| 内置 expert_id 清单（合并/批处理跳过） | `api/src/modules/expert-library/builtinExpertIds.ts`（`CODEBASE_EXPERT_IDS` / `SKIP_GENERATE_IDS`） |
| Profile ↔ DB 行校验与序列化 | `api/src/modules/expert-library/expertProfileDb.ts` |

---

## 7. 生产实例：一濛（`E04-05`，居住服务 · 惠居美租）

**定位**：产业战略与经营分析视角，侧重 **非标→标、局装→整装、全款→分期** 等可验证假设，**UE（单位经济）与 P&L** 同轨，以及 **L3 战略层 / L2 假设验证 / L1 工具赋能** 分层治理；材料来自《2026年3月北京团队述职模板-惠居》等业务叙述的 **公开提炼**（不含个人隐私字段）。

**与前端对齐**：`expert_id` 与 `webapp` 专家表 **`id` / `code` = `E04-05`** 一致，invoke / chat 均使用该 ID。

**完整 `ExpertProfile`**：以仓库 **`api/src/modules/expert-library/data/yiMeng.ts`** 为准（与 **§2** 字段一一对应，含 `persona` 深度层、`emm`、`output_schema.rubrics`）。该 profile 已通过 `topExpertProfiles` 在 **`createExpertEngine`** 中 **自动注册**。

### 7.1 `invoke` 示例（cURL）

```bash
curl -s -X POST 'http://localhost:3006/api/v1/expert-library/invoke' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: dev-api-key' \
  -d '{
    "expert_id": "E04-05",
    "task_type": "evaluation",
    "input_type": "text",
    "input_data": "美租北上双城月签 220 套目标下，标品 GTV 占比要从 20% 拉到 80%，请从 L3/L2/L1 与 U×E 弹性评估该路径的关键风险与应有硬账。",
    "params": { "depth": "standard", "focus_areas": ["UE与P&L", "标品占比", "准实验设计"] }
  }'
```

（端口、鉴权头以实际部署为准。）

---

## 8. 批量生成、入库与 `listExperts` 合并规则

### 8.1 勿重复生成（与 `data/*.ts` 对齐）

- `SKIP_GENERATE_IDS`（同 `CODEBASE_EXPERT_IDS`）由 **`musk.ts`、`xiaohongshu.ts`、`topExpertProfiles`（含 `yiMeng` 等）** 的 `expert_id` 汇总得到。  
- 批处理：**不**对这些 id 调用 LLM，避免与仓库内已有 `ExpertProfile` 重复。

### 8.2 批处理生成（至多 34 人）

- **命令**（在仓库 `api/` 目录）：`npm run expert:gen-batch`（即 `tsx src/scripts/batch-generate-expert-profiles.ts`）。  
- **顺序**：与 `webapp` 的 `loadExpertsData()` 一致，跳过 `SKIP_GENERATE_IDS` 后 `slice(0, 34)`。  
- **输出**：`api/src/modules/expert-library/data/generated/pending-review/{expert_id}.json` 与 `manifest.json`；校验失败写 `{id}.error.json`。已存在文件默认跳过，可用 `--force` 覆盖。  
- **环境**：依赖 `api/.env` 中可用的 Kimi/Claude/OpenAI（与 `generate()` 一致）。

### 8.3 审查后 UPSERT

- 将人工通过的文件放入 **`data/generated/approved/`**。  
- **命令**：`npm run expert:upsert-approved`；`--dry-run` 仅打印 id；`--dir=相对api根的路径` 可指定目录。

### 8.4 `GET /experts` 列表合并（引擎行为）

- `listExperts`：**先**查询 `expert_profiles` 中 `is_active = true` 的全部行，**再**用当前内存 `expertCache` 按 `expert_id` **覆盖**同 id。  
- 效果：**仅存在库中的**扩展专家会出现在列表；**已 `registerExpert` 的内置专家**若与库同 id，以**内存（代码注册）**为准；`lazy load` 写入 cache 的会覆盖先前的 DB 视图直至进程重启。

---

*文档版本：与仓库 `types.ts` 字段对齐；若类型变更请同步更新本文档。*
