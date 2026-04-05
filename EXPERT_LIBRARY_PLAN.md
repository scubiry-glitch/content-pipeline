# Expert Library 独立模块 — 实施计划 v3 + 当前进度

> 更新时间: 2026-04-05

---

## 核心目标

**本质**：让 AI "稳定地像某一个人思考"——不是更聪明，而是更像真人专家。

基于认知数字孪生(Cognitive Digital Twin)理论和 EMM(Expert Mental Model)框架，构建独立可调用的专家库模块。当前 132 位专家数据人格太薄，无法产出稳定、有人味的专业判断。

**落地策略**：先做「一个专家 + 一个场景」做到极致，再扩展。

---

## 当前进度总览

### ✅ 已完成（Phase 1 — 核心模块）

| 文件 | 状态 | 职责 |
|------|------|------|
| `api/src/modules/expert-library/types.ts` | ✅ | 核心类型 + Adapter 接口（零外部依赖） |
| `api/src/modules/expert-library/adapters/pipeline.ts` | ✅ | 桥接 pipeline 的 DB/LLM |
| `api/src/modules/expert-library/ExpertEngine.ts` | ✅ | 核心调度: 加载→输入增强→知识检索→LLM→EMM门控→格式化 |
| `api/src/modules/expert-library/promptBuilder.ts` | ✅ | 10段式 prompt 组装（自动简洁/丰富模式切换） |
| `api/src/modules/expert-library/emmGate.ts` | ✅ | EMM 门控: 因子识别→层级评分→veto规则→违规成本聚合 |
| `api/src/modules/expert-library/inputProcessor.ts` | ✅ | 输入增强: 多格式处理→语义切分→结构化抽取 |
| `api/src/modules/expert-library/outputFormatter.ts` | ✅ | 多轮 JSON 验证 + anti_patterns 检查 + 重试 |
| `api/src/modules/expert-library/analyzeThenJudge.ts` | ✅ | Analyze-then-Judge: 提取→忠实度/事实性双轴比对→裁决 |
| `api/src/modules/expert-library/router.ts` | ✅ | Fastify 插件（/invoke, /experts, /feedback） |
| `api/src/modules/expert-library/index.ts` | ✅ | `createExpertEngine()` 工厂 + 统一导出 |
| `api/src/modules/expert-library/data/musk.ts` | ✅ | 马斯克完整 profile（投资/战略分析） |
| `api/src/modules/expert-library/data/xiaohongshu.ts` | ✅ | 小红书操盘手完整 profile（内容评估+生成） |
| `api/src/modules/expert-library/migrations/001-expert-library.sql` | ✅ | 4张表: profiles, knowledge_sources, invocations, feedback |
| `webapp/src/pages/ExpertLibrary.tsx` | ✅ | 修复硬编码 "75位专家" → 动态 `{stats.total}位专家`（现显示132） |

**编译状态**: API ✅ 零错误 | Webapp ✅ 零错误

---

### ⬜ 待完成（Phase 2 — 集成与扩展）

| 任务 | 优先级 | 描述 |
|------|--------|------|
| 挂载路由到 server.ts | P0 | `fastify.register(createRouter(engine), { prefix: '/api/v1/expert-library' })` |
| 运行 DB migration | P0 | 执行 `migrations/001-expert-library.sql` |
| 注入 pipeline Adapters | P0 | 用 `createPipelineDeps()` 创建 engine 实例 |
| `knowledgeService.ts` | P1 | 知识源管理: 上传/解析/向量化/检索 |
| `feedbackLoop.ts` | P1 | 反馈闭环: 人工打分 + 实际结果 → 参数校准 |
| 接入 `blueTeam.ts` | P2 | 用 `ExpertEngine.invoke()` 替代硬编码 prompt |
| 接入 `sequentialReview.ts` | P2 | 同上 |
| `webapp/src/types/index.ts` | P2 | Expert 类型增加 persona/method/emm/output_schema |
| 补充 10 位特级专家深度 profile | P2 | S-01 到 S-10 的 cognition/values/taste/voice/blindSpots |

---

## 架构设计

### 部署模式

```
模式 A: 嵌入式（当前 pipeline 内）
  pipeline/api/src/modules/expert-library/
  共享 pipeline 的 DB 连接、LLM 服务、文件存储

模式 B: 独立部署
  expert-library/
  ├── src/          ← 同一份代码
  ├── package.json  ← 独立依赖
  ├── Dockerfile
  └── .env          ← 独立配置（DB_URL, LLM_API_KEY, PORT）
```

### 可迁移性关键设计

1. **零直接 import 外部服务** — 模块内不 import pipeline 的 db/llm/fileParser
2. **Adapter 接口注入** — 所有外部依赖通过接口传入
3. **独立 migration** — `migrations/` 下管理自己的 schema
4. **独立路由挂载** — `createRouter(engine)` 任何 Fastify app 可注册

### 调用流程

```
invoke(request)
  1. loadExpert(expert_id)              ← 加载专家 profile（内存缓存 + DB fallback）
  2. processInput(input_data, type)     ← 输入增强 → InputAnalysis
  3. retrieveKnowledge(expert_id)       ← 检索知识源
  4a. [evaluation] analyzeThenJudge()  ← 提取 → 比对 → 裁决
  4b. [analysis/generation] buildPrompt + LLM
  5. emmGateCheck(response, emm)        ← 门控验证（最多2次重试）
  6. formatOutput(response, schema)     ← 结构化 + 风格漂移检测
  7. recordInvocation()                 ← 异步记录（不阻塞返回）
  → ExpertResponse
```

### API 端点

```
POST /api/v1/expert-library/invoke          ← 调用专家（核心）
GET  /api/v1/expert-library/experts         ← 列表
GET  /api/v1/expert-library/experts/:id     ← 详情
POST /api/v1/expert-library/feedback        ← 提交反馈
```

---

## 两个落地专家

### S-03 马斯克（投资/战略分析）

- **风格**: 极度犀利，只认物理定律和工程数据
- **方法**: 第一性原理成本拆解 + 技术S曲线
- **EMM权重**: 物理可行性(35%) > 成本下降路径(30%) > 技术壁垒(20%) > 市场时机(15%)
- **一票否决**: 违反物理定律 / 成本无BOM拆解 / 数据全来自二手
- **验证场景**: 新能源公司财报 + CEO访谈 → 投资分析

### XHS-01 小红书爆款操盘手（内容评估+生成）

- **风格**: 敏锐接地气，数据直觉并重
- **方法**: AIDA + 小红书3秒法则 + 互动率拆解
- **EMM权重**: 封面吸引力(30%) > 标题钩子(25%) > 信息增量(20%) > 互动设计(15%) > 发布时间(10%)
- **一票否决**: 封面与内容不符 / 无用户价值主张 / 前3秒无钩子
- **验证场景**: 输入帖子 → 诊断报告 + 修改建议

---

## Phase 2 集成步骤（下一步）

### Step 1: 挂载路由

```typescript
// api/src/server.ts
import { createExpertEngine, createRouter } from './modules/expert-library/index.js';
import { createPipelineDeps } from './modules/expert-library/adapters/pipeline.js';
import { query } from './db/connection.js';
import { generate } from './services/llm.js';

const expertEngine = createExpertEngine(
  createPipelineDeps(query, generate)
);

fastify.register(createRouter(expertEngine), { prefix: '/api/v1/expert-library' });
```

### Step 2: 运行 DB Migration

```bash
psql $DATABASE_URL -f api/src/modules/expert-library/migrations/001-expert-library.sql
```

### Step 3: 验证两个场景

```bash
# 马斯克分析财报
curl -X POST /api/v1/expert-library/invoke \
  -d '{"expert_id":"S-03","task_type":"analysis","input_type":"text","input_data":"..."}'

# 小红书内容评估
curl -X POST /api/v1/expert-library/invoke \
  -d '{"expert_id":"XHS-01","task_type":"evaluation","input_type":"text","input_data":"..."}'
```

---

## KPI 目标

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 输出一致性 | ≥ 80% | 同专家对同类内容调用5次，对比风格一致性 |
| "像某个人" | ≥ 4/5 | 用户主观评分 |
| EMM 门控拦截率 | 监控 | LLM 随机性输出被门控过滤的比例 |
| 反馈闭环可用 | Phase 2 | feedbackLoop.ts 上线后开始收集 |
