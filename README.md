# 内容生产流水线 (Content Pipeline)

基于Multi-Agent的自动化研究报告生产系统，支持Blue Team多轮审核机制。

## 核心特性

- **三层穿透架构**: 宏观视野 → 中观解剖 → 微观行动
- **Blue Team审核**: 3专家×5问题×3轮批判性审核
- **智能资产库**: 自动标签、质量评分、向量检索
- **多模型底座**: Claude + OpenAI 智能路由

## 项目结构

```
content-pipeline/
├── api/                     # Fastify API服务
│   └── src/
│       ├── providers/       # LLM Provider抽象层
│       │   ├── base.ts      # 抽象基类
│       │   ├── claude.ts    # Claude API实现
│       │   ├── claudeCode.ts # Claude Code环境支持
│       │   ├── openai.ts    # OpenAI实现
│       │   └── index.ts     # LLM Router
│       ├── agents/          # Agent系统
│       │   ├── base.ts      # Agent基类
│       │   ├── planner.ts   # 选题规划Agent
│       │   ├── researcher.ts # 数据研究Agent
│       │   └── writer.ts    # 写作Agent (含Blue Team)
│       ├── services/        # 业务服务
│       │   └── assetLibrary.ts # 智能资产库
│       ├── pipeline/        # Pipeline编排
│       │   └── orchestrator.ts
│       ├── db/              # 数据库层
│       │   └── connection.ts
│       ├── server.ts        # API入口
│       └── demo.ts          # Demo脚本
├── shared/                  # 共享类型
│   └── src/types/
│       └── index.ts         # 核心类型定义
└── web/                     # Next.js前端 (待实现)
```

## 快速开始

### 1. 安装依赖

```bash
cd content-pipeline/api
npm install
```

### 2. 配置方式（三选一）

#### 方式A: 使用Claude Code环境（推荐）
在Claude Code中运行时，系统会自动检测并使用配置的模型：
```bash
# 无需额外配置，自动检测以下环境变量
# - ANTHROPIC_MODEL (Claude Code使用的模型)
# - CLAUDE_CODE_ENV
```

#### 方式B: 使用API Key
```bash
export ANTHROPIC_API_KEY="your-claude-api-key"
export OPENAI_API_KEY="your-openai-api-key"  # 可选，用于Embedding

# 可选: PostgreSQL配置
export DB_HOST="localhost"
export DB_PORT="5432"
export DB_NAME="content_pipeline"
export DB_USER="postgres"
export DB_PASSWORD="password"
```

#### 方式C: API初始化时配置
```bash
POST /init
{
  "useClaudeCode": true,  // 强制使用Claude Code环境
  "openaiApiKey": "..."   // 可选，用于Embedding
}
```

### 3. 运行Demo

```bash
npx ts-node src/demo.ts
```

### 4. 启动API服务

```bash
npx ts-node src/server.ts
```

API服务将在 http://localhost:3000 启动

## API端点

### 系统初始化
```bash
POST /init
{
  "claudeApiKey": "...",
  "openaiApiKey": "...",
  "dbConfig": { ... }
}
```

### 运行Pipeline
```bash
POST /pipeline/run
{
  "topic": "保租房REITs市场分析",
  "context": "研究背景...",
  "desiredDepth": "comprehensive"
}
```

### 导入历史文档
```bash
POST /assets/import
{
  "documents": [
    {"content": "...", "source": "file.md"}
  ]
}
```

### 查询结果
```bash
GET /topics/:id              # 获取选题详情
GET /reports/:id             # 获取研究报告
GET /documents/:id           # 获取最终文档
GET /topics/:id/blue-team    # 获取Blue Team审核记录
```

## Blue Team专家配置

系统内置4位专家视角:

| 专家 | 视角 | 关注重点 |
|------|------|----------|
| 张其光 | 政策实操派 | 政策依据、数据支撑 |
| 陆铭 | 市场机制派 | 理论依据、国际比较 |
| 刘元春 | 风险平衡派 | 风险点、宏观传导 |
| 看空派 | 市场skeptic | 最坏情况、反例 |

## 7天开发里程碑

- [x] Day 1-2: 项目架构 + LLM底座
- [x] Day 3: PlannerAgent + ResearchAgent + Asset Library
- [x] Day 4-5: WriterAgent + Blue Team审核机制
- [x] Day 6: Pipeline编排 + API接口
- [x] Day 7: Demo演示 + 系统集成测试

## 技术栈

- **Runtime**: Node.js 20+, TypeScript 5+
- **API框架**: Fastify 4
- **Database**: PostgreSQL 15+ (pgvector扩展)
- **LLM**: Claude 3/4 (Opus/Sonnet/Haiku), GPT-4, GPT-3.5, Claude Code环境
- **Deployment**: Docker (可选)

## Claude Code环境支持

系统支持在Claude Code环境中直接运行，无需额外配置API Key：

```typescript
import { isClaudeCodeEnvironment, getClaudeCodeModel, initLLMRouter } from './providers';

// 检测是否在Claude Code中
if (isClaudeCodeEnvironment()) {
  console.log('当前模型:', getClaudeCodeModel()); // e.g., claude-sonnet-4-5-20250929
}

// 自动检测并使用Claude Code配置的模型
const router = initLLMRouter(); // 无需参数，自动检测环境
```

### Provider优先级

1. `claude-code` - Claude Code环境配置的模型（如果在Claude Code中运行）
2. `claude` - 使用ANTHROPIC_API_KEY的标准API调用
3. `openai` - 使用OPENAI_API_KEY（主要用于Embedding）

### 模型路由规则

| 任务类型 | 首选Provider | 备选Provider | 说明 |
|----------|--------------|--------------|------|
| planning | claude-code | claude | 选题规划 |
| analysis | claude-code | claude | 数据分析 |
| blue_team_review | claude-code | claude | Blue Team审核 |
| writing | claude-code | claude | 报告写作 |
| embedding | openai | - | 文本向量化 |

## License

MIT
