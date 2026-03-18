# 内容生产流水线 - Agent 协作指南

## 项目概述

**内容生产流水线** 是一套 TS/Node 驱动的自动化内容生产系统，实现从选题到发布的全流程自动化。

---

## Agent 架构

### 核心 Agent 列表

| Agent | 职责 | 输入 | 输出 |
|-------|------|------|------|
| **PlannerAgent** | 选题规划、大纲生成 | 选题主题 | 三层结构大纲、数据需求 |
| **ResearchAgent** | 素材检索、数据分析 | 大纲、关键词 | 研究数据包、洞察 |
| **WriterAgent** | 初稿生成 | 大纲、研究数据 | 初稿内容 |
| **BlueTeamAgent** | 蓝军评审（3×3×2） | 初稿 | 评审意见、修订稿 |

### BlueTeam 专家配置

```typescript
const experts = [
  {
    name: '批判者',
    angle: 'challenger',  // 挑战角度
    focus: ['逻辑漏洞', '论证跳跃', '数据可靠性', '隐含假设']
  },
  {
    name: '拓展者',
    angle: 'expander',    // 扩展角度
    focus: ['关联因素', '国际对比', '交叉学科', '长尾效应']
  },
  {
    name: '提炼者',
    angle: 'synthesizer', // 归纳角度
    focus: ['核心论点', '结构优化', '金句提炼', '消除冗余']
  }
];
```

**评审流程**: 3专家并行 → 每人3个角度 → 每角度1个问题 → 2轮迭代 → 人工确认

---

## 数据流

```
选题(topic) → Planner → 大纲(outline)
                         ↓
大纲 → ResearchAgent → 研究数据(research_data)
                         ↓
研究数据 → WriterAgent → 初稿(draft_v1)
                         ↓
初稿 → BlueTeam(2轮) → 终稿(final_draft)
                         ↓
人工确认 → Publisher → Markdown输出
```

---

## 数据库表结构

### tasks - 生产任务
```sql
id VARCHAR(50) PK
topic VARCHAR(500)
status: pending/researching/writing/reviewing/awaiting_approval/completed/failed
progress INTEGER (0-100)
current_stage VARCHAR(100)
outline JSONB
research_data JSONB
output_ids JSONB
created_at/updated_at
```

### blue_team_reviews - 评审记录
```sql
id UUID PK
task_id VARCHAR(50) FK
round INTEGER (1-2)
expert_role VARCHAR(50) -- challenger/expander/synthesizer
questions JSONB
```

### draft_versions - 稿件版本
```sql
id UUID PK
task_id VARCHAR(50) FK
version INTEGER
content TEXT
```

### assets - 素材库
```sql
id VARCHAR(50) PK
title VARCHAR(500)
content TEXT
embedding VECTOR(1536) -- pgvector
tags JSONB
quality_score DECIMAL
```

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/production | 创建生产任务 |
| GET | /api/v1/production/:id | 查询任务详情 |
| POST | /api/v1/production/:id/approve | 人工确认 |
| POST | /api/v1/assets | 上传素材 |
| GET | /api/v1/assets?q= | 搜索素材 |
| GET | /api/v1/outputs/:id/download | 下载产出物 |

---

## 环境变量

### 必需配置

```bash
# LLM API (至少配置一个，推荐使用 Kimi)
KIMI_API_KEY=sk-xxx              # 推荐，获取地址: https://platform.moonshot.cn/
CLAUDE_API_KEY=sk-xxx            # 备用，获取地址: https://console.anthropic.com/
OPENAI_API_KEY=sk-xxx            # 用于 Embedding，获取地址: https://platform.openai.com/

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=author
DB_USER=postgres
DB_PASSWORD=xxx
DATABASE_URL=postgresql://...

# Auth
ADMIN_API_KEY=dev-api-key

# Server
PORT=3000
NODE_ENV=development
```

### 可选配置

```bash
# Web Search API (用于深度研究，推荐配置)
TAVILY_API_KEY=tvly-xxx          # 获取地址: https://tavily.com/
SERPER_API_KEY=xxx               # 获取地址: https://serper.dev/

# LLM 模型选择
USE_KIMI=false                   # 强制禁用 Kimi（即使配置了 KIMI_API_KEY）
```

### API 配置检查

系统启动时会自动检查 API 配置，如果没有配置任何 LLM API，系统将**拒绝启动**并显示错误信息。

可用的配置组合：
- ✅ **仅 KIMI_API_KEY** - 推荐配置，所有功能正常工作
- ✅ **仅 CLAUDE_API_KEY** - 可用，但 Embedding 会使用随机向量
- ✅ **仅 OPENAI_API_KEY** - 可用，但规划和蓝军评审质量可能不如 Kimi
- ✅ **组合配置** - 系统会自动选择最佳模型
```

---

## 启动命令

```bash
# 安装依赖
npm install

# 初始化数据库
npx tsx src/scripts/init-db.ts

# 启动API服务
npm run dev

# 启动Worker（另开终端）
npm run worker
```

---

## MVP 范围

**包含**:
- ✅ 选题 → 大纲 → 研究 → 写作 → BlueTeam(3×3×2) → 人工确认 → Markdown输出
- ✅ 素材上传和向量检索
- ✅ API Key认证

**不包含** (MVP后):
- ❌ 自动发布到平台
- ❌ 视频/音频生成
- ❌ 知识图谱(Neo4j)
- ❌ 242份研报批量导入

---

## 关键指标

| 指标 | 目标 |
|------|------|
| 蓝军评审通过率 | 人工100%确认 |
| 单期生产时间 | < 2天 |
| 自动化比例 | > 70% |
| 内容质量 | 专家评审通过 |

---

## 文件位置

- API 服务: `/api/src/server.ts`
- BlueTeam Agent: `/api/src/agents/blueTeam.ts`
- 数据库连接: `/api/src/db/connection.ts`
- API 规范: `/api/openapi.yaml`
- 环境变量: `/api/.env`
