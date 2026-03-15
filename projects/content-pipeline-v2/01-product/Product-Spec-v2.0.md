# 内容生产流水线系统 PRD v2.0

## 1. 项目概述

### 1.1 产品定位
内容生产流水线系统是一个 AI 驱动的研究报告生成平台，通过流水线方式自动化完成从选题策划到多格式输出的全流程。

### 1.2 核心价值
- **效率提升**: 将传统需要数天的研究报告生成流程缩短至数小时
- **质量保障**: 通过 BlueTeam 多轮评审机制确保输出质量
- **知识沉淀**: 专家知识库和素材库的持续积累

### 1.3 目标用户
- 产业研究分析师
- 投资研究人员
- 市场咨询顾问
- 内容运营团队

---

## 2. 功能需求

### 2.1 核心流水线 (MVP 已实现)

```
选题策划 → 深度研究 → 智能写作 → BlueTeam评审 → 人工确认 → 多格式输出
```

#### 2.1.1 选题策划模块
| 功能点 | 描述 | 状态 |
|--------|------|------|
| 话题输入 | 支持主题文本和背景资料输入 | ✅ |
| AI 大纲生成 | 使用 Kimi Code 生成结构化大纲 | ✅ |
| 大纲确认 | 用户可编辑和确认大纲 | ✅ |
| 数据需求分析 | 自动分析所需数据来源 | ✅ |
| 重做机制 | 支持重新生成选题 | ✅ |

**接口清单:**
- `POST /api/v1/production` - 创建任务
- `POST /api/v1/production/:taskId/confirm-outline` - 确认大纲
- `POST /api/v1/production/:taskId/redo/planning` - 重做选题

#### 2.1.2 深度研究模块
| 功能点 | 描述 | 状态 |
|--------|------|------|
| 数据自动采集 | 支持配置搜索源和采集规则 | ✅ |
| 数据清洗 | 自动清洗和结构化原始数据 | ✅ |
| 数据分析 | 统计分析和趋势识别 | ✅ |
| 洞察生成 | 基于数据的观点提炼 | ✅ |
| 素材库管理 | 素材的导入、标签、检索 | 🔄 |

**接口清单:**
- `POST /api/v1/production/:taskId/redo/research` - 重做研究

#### 2.1.3 智能写作模块
| 功能点 | 描述 | 状态 |
|--------|------|------|
| 章节生成 | 按大纲生成各章节内容 | ✅ |
| 引用管理 | 自动标注数据来源 | 🔄 |
| 风格适配 | 根据目标读者调整文风 | ✅ |
| 版本管理 | 支持多版本稿件 | ✅ |

**接口清单:**
- `POST /api/v1/production/:taskId/redo/writing` - 重做写作

#### 2.1.4 BlueTeam 评审模块
| 功能点 | 描述 | 状态 |
|--------|------|------|
| 多专家模拟 | 模拟不同领域专家评审 | ✅ |
| 问题识别 | 证据、逻辑、结构问题识别 | ✅ |
| 改进建议 | 生成具体修改建议 | ✅ |
| 评审展示 | 可视化展示评审结果 | ✅ |

**接口清单:**
- `POST /api/v1/production/:taskId/redo/review` - 重做评审
- `GET /api/v1/production/:taskId/reviews` - 获取评审列表

#### 2.1.5 人工确认模块
| 功能点 | 描述 | 状态 |
|--------|------|------|
| 大纲确认 | 用户确认或修改大纲 | ✅ |
| 稿件审批 | 人工审批和修改 | 🔄 |
| 发布审批 | 最终发布前确认 | 🔄 |

#### 2.1.6 多格式输出模块
| 功能点 | 描述 | 状态 |
|--------|------|------|
| Markdown | 标准 Markdown 格式 | ✅ |
| PDF | PDF 文档生成 | 🔄 |
| Word | Word 文档导出 | 🔄 |
| 在线发布 | 在线 HTML 版本 | 🔄 |

### 2.2 内容运营平台 (待完善)

#### 2.2.1 发布管理
- 发布计划制定
- 多渠道分发 (微信公众号、知乎、网站等)
- 发布历史追踪

#### 2.2.2 数据监控
- 阅读量统计
- 用户反馈收集
- 内容效果分析

#### 2.2.3 用户权限
- 角色管理 (管理员、编辑、分析师、访客)
- 权限矩阵
- 操作审计

### 2.3 知识库系统 (待完善)

#### 2.3.1 专家知识库
- 专家档案管理
- 专家观点引用
- 专家模型调优

#### 2.3.2 素材库
- 素材自动标签
- 向量检索
- 质量评分

---

## 3. 技术方案

### 3.1 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 选题策划页   │  │ 大纲确认页   │  │ 运营平台 Dashboard   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        API 层                               │
│  Fastify + TypeScript + JWT 认证                            │
│  /api/v1/production  /api/v1/assets  /api/v1/outputs       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       服务层                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Pipeline    │  │ AssetLibrary│  │ OutputService       │ │
│  │ Service     │  │ Service     │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       引擎层                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ LLM Router  │  │ 向量检索    │  │ 搜索服务            │ │
│  │ (Kimi/     │  │ (Embedding) │  │ (Tavily/Serper)    │ │
│  │  Claude)   │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       数据层                                 │
│  PostgreSQL  +  pgvector  +  Redis  +  MinIO (对象存储)      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 LLM 路由设计

```typescript
// LLM 路由规则
const routingRules = [
  { taskType: 'planning', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'analysis', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'blue_team_review', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'writing', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'summarization', priority: 'speed', preferredProvider: 'kimi', fallbackProvider: 'openai' },
  { taskType: 'tagging', priority: 'speed', preferredProvider: 'kimi', fallbackProvider: 'openai' },
  { taskType: 'embedding', priority: 'cost', preferredProvider: 'openai' },
];
```

### 3.3 Kimi Code 集成方案

#### 3.3.1 网络层解决方案
```typescript
// 使用原生 https 模块替代 fetch
// 原因: Node.js fetch 优先 IPv6 导致超时
const options = {
  hostname: 'api.kimi.com',
  family: 4, // 强制 IPv4
  timeout: 60000,
};
```

#### 3.3.2 身份验证方案
```typescript
// Kimi Code 需要特定的 User-Agent
headers: {
  'User-Agent': 'claude-cli/2.1.76 (external, cli)',
  'X-Client-Name': 'claude-code',
  'X-Client-Version': '2.1.76',
}
```

#### 3.3.3 API 配置
```
Endpoint: https://api.kimi.com/coding/v1
Model: kimi-for-coding
Format: OpenAI Compatible API
```

### 3.4 数据库设计

#### 3.4.1 核心表结构
```sql
-- 任务表
tasks:
  - id (PK)
  - topic
  - outline (JSON)
  - research_data (JSON)
  - status (planning/researching/writing/reviewing/completed)
  - progress (0-100)
  - current_stage
  - created_at/updated_at

-- BlueTeam 评审表
blue_team_reviews:
  - id (PK)
  - task_id (FK)
  - expert_id
  - question
  - category (evidence/logic/structure)
  - severity (high/medium/low)
  - suggested_improvement
  - round

-- 素材库表
asset_library:
  - id (PK)
  - content
  - content_type
  - tags (JSON)
  - embedding (vector)
  - quality_score
  - source

-- 专家库表
expert_profiles:
  - id (PK)
  - name
  - title
  - domains (JSON)
  - authority_score
  - credentials (JSON)
```

### 3.5 部署架构

```
┌─────────────────────────────────────────────┐
│                  Nginx                      │
│         (反向代理 + 静态文件)                │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  API Server   │       │  Webapp       │
│  (Docker)     │       │  (Nginx)      │
│  Port: 3000   │       │  Port: 80     │
└───────┬───────┘       └───────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│              PostgreSQL + pgvector          │
│              Redis (Queue/Cache)            │
│              MinIO (Object Storage)         │
└─────────────────────────────────────────────┘
```

---

## 4. API 规范

### 4.1 生产任务 API

#### 创建任务
```http
POST /api/v1/production
Content-Type: application/json
X-API-Key: {api_key}

{
  "topic": "新能源汽车电池技术发展趋势",
  "sourceMaterials": [],
  "targetFormats": ["markdown", "pdf"]
}

Response: {
  "id": "task_xxx",
  "status": "outline_pending",
  "outline": { ... }
}
```

#### 确认大纲
```http
POST /api/v1/production/:taskId/confirm-outline
Content-Type: application/json

{
  "outline": { ... },
  "approved": true
}

Response: {
  "id": "task_xxx",
  "status": "researching",
  "message": "大纲已确认，开始深度研究"
}
```

#### 重做环节
```http
POST /api/v1/production/:taskId/redo/:stage
Content-Type: application/json

Body (planning): {
  "topic": "新主题",
  "context": "补充背景"
}

Response: {
  "id": "task_xxx",
  "status": "planning_completed",
  "outline": { ... }
}
```

---

## 5. 非功能需求

### 5.1 性能指标
- 大纲生成: < 30s
- 研究阶段: < 3min
- 写作阶段: < 2min/章节
- API 响应: P99 < 500ms

### 5.2 可靠性
- 服务可用性: 99.5%
- 任务失败自动重试: 3次
- 数据备份: 每日全量 + 实时增量

### 5.3 安全
- API Key 认证
- SQL 注入防护
- XSS 防护
- 敏感数据加密存储

---

## 6. 开发路线图

### Phase 1: MVP (已完成)
- [x] 核心流水线实现
- [x] Kimi Code 集成
- [x] 基础 API 接口
- [x] 前端 UI 雏形

### Phase 2: 质量提升 (进行中)
- [ ] BlueTeam 评审优化
- [ ] 大纲交互式编辑
- [ ] 人工审核工作台
- [ ] 输出格式完善

### Phase 3: 运营平台 (待开始)
- [ ] 发布管理系统
- [ ] 数据监控看板
- [ ] 用户权限系统
- [ ] 专家知识库管理

### Phase 4: 智能化升级 (待规划)
- [ ] 多 Agent 协作优化
- [ ] 个性化推荐
- [ ] A/B 测试框架
- [ ] 自动化运营

---

## 7. 附录

### 7.1 环境变量配置
```bash
# LLM API Keys
ANTHROPIC_API_KEY=sk-kimi-xxx  # Kimi Code Key
OPENAI_API_KEY=sk-xxx

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/content_pipeline

# Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=xxx
MINIO_SECRET_KEY=xxx

# Search
TAVILY_API_KEY=tvly-xxx
SERPER_API_KEY=xxx

# App
ADMIN_API_KEY=dev-api-key-change-in-production
```

### 7.2 相关文档
- [Kimi Code 集成指南](../../api/KIMI_CODE_INTEGRATION.md)
- [API 接口文档](./API-Spec.md) (待补充)
- [部署文档](../../DEPLOY.md)
