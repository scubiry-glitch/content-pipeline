# 内容生产流水线 - 系统设计文档

## 1. 系统架构概览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   客户端层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│  │ Web 前端      │ │ CLI 工具      │ │ API 调用      │ │ 内容运营后台        │ │
│  │ (Vanilla JS) │ │ (Node.js)    │ │ (REST)       │ │ (Dashboard)        │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   网关层                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Nginx (反向代理、SSL终止、静态文件服务、负载均衡)                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   API 层                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Fastify + TypeScript                                                    ││
│  │ - 路由管理 (/api/v1/production, /api/v1/assets, /api/v1/outputs)        ││
│  │ - 中间件 (认证、限流、日志、错误处理)                                     ││
│  │ - 插件系统 (CORS、Multipart、Swagger)                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   业务层                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Pipeline    │  │ Asset       │  │ Output      │  │ Directory           │ │
│  │ Service     │  │ Library     │  │ Service     │  │ Watcher             │ │
│  │ 流水线编排   │  │ 素材管理     │  │ 输出管理     │  │ 目录监听            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Topic       │  │ Research    │  │ BlueTeam    │  │ Production          │ │
│  │ Evaluation  │  │ Service     │  │ Service     │  │ Service             │ │
│  │ 选题评估     │  │ 研究服务     │  │ 评审服务     │  │ 生产服务            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   Agent 层                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Planner     │  │ Researcher  │  │ Writer      │  │ BlueTeam            │ │
│  │ Agent       │  │ Agent       │  │ Agent       │  │ Agent               │ │
│  │ 选题规划     │  │ 研究执行     │  │ 内容写作     │  │ 质量评审            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   引擎层                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ LLM Router (多模型路由)                                                  ││
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      ││
│  │ │ Kimi     │ │ Claude   │ │ OpenAI   │ │ Claude   │ │ Mock     │      ││
│  │ │ Provider │ │ Provider │ │ Provider │ │ Code     │ │ Provider │      ││
│  │ │ (Primary)│ │ (Fallback│ │ (Embed)  │ │ Provider │ │ (Test)   │      ││
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Embedding   │  │ Vector      │  │ Web Search  │  │ Document            │ │
│  │ Service     │  │ Search      │  │ Service     │  │ Parser              │ │
│  │ (向量化)     │  │ (向量检索)   │  │ (网络搜索)   │  │ (文档解析)           │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   数据层                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ PostgreSQL + pgvector                                                   ││
│  │ - 业务数据存储 (tasks, assets, experts, reviews)                         ││
│  │ - 向量数据存储 (embeddings)                                              ││
│  │ - JSONB 半结构化数据                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Redis       │  │ MinIO       │  │ BullMQ      │  │ File System         │ │
│  │ (Cache)     │  │ (Object     │  │ (Queue)     │  │ (Watch)             │ │
│  │             │  │  Storage)   │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心流程图

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  用户输入 │───▶│ PlannerAgent│───▶│ LLM Router  │───▶│ Kimi Code   │
│  话题    │    │ 选题规划     │    │ (Kimi主模型)│    │ 生成大纲JSON│
└─────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                             │
                                                             ▼
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 确认通过 │◀───│  用户确认   │◀───│ 大纲展示    │◀───│  大纲解析   │
│         │    │ 修改/确认   │    │ (前端展示)  │    │             │
└────┬────┘    └─────────────┘    └─────────────┘    └─────────────┘
     │
     ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ ResearchAgent│───▶│ Web Search  │───▶│ 数据清洗    │───▶│ 数据分析    │
│  深度研究    │    │  网络搜索   │    │             │    │             │
└──────┬──────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ WriterAgent │───▶│ LLM Router  │───▶│ 章节生成    │───▶│ 引用标注    │
│  智能写作   │    │ (逐章节调用)│    │             │    │             │
└──────┬──────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ BlueTeam    │───▶│ 4位专家评审 │───▶│ 问题汇总    │───▶│ 修改建议    │
│ Agent       │    │ (并行评审)  │    │             │    │             │
└──────┬──────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   人工确认   │───▶│  多格式输出  │───▶│  发布/导出   │
│  终稿审核   │    │ PDF/Word/MD │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
```

## 2. 核心组件设计

### 2.1 LLM Router 架构

```typescript
// 路由规则配置
interface ModelRoutingRule {
  taskType: string;
  priority: 'quality' | 'speed' | 'cost';
  preferredProvider: string;
  fallbackProvider?: string;
}

// 当前路由配置
const routingRules: ModelRoutingRule[] = [
  { taskType: 'planning', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'analysis', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'blue_team_review', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'writing', priority: 'quality', preferredProvider: 'kimi', fallbackProvider: 'claude' },
  { taskType: 'summarization', priority: 'speed', preferredProvider: 'kimi', fallbackProvider: 'openai' },
  { taskType: 'tagging', priority: 'speed', preferredProvider: 'kimi', fallbackProvider: 'openai' },
  { taskType: 'embedding', priority: 'cost', preferredProvider: 'openai' },
];

// Provider 抽象接口
abstract class LLMProvider {
  protected name: string;
  protected apiKey: string;
  protected baseUrl?: string;

  abstract generate(prompt: string, params?: GenerationParams): Promise<GenerationResult>;
  abstract embed(text: string): Promise<number[]>;
  abstract checkHealth(): Promise<boolean>;
  abstract getAvailableModels(): string[];
}
```

### 2.2 Pipeline 状态机

```
状态流转:

created ──▶ outline_pending ──▶ outline_confirmed ──▶ researching
  │              │                      │                    │
  │              │                      │                    ▼
  │              │                      │              writing
  │              │                      │                    │
  │              │                      │                    ▼
  │              │                      │              reviewing
  │              │                      │                    │
  │              │                      │                    ▼
  │              │                      └───────────────▶ completed
  │              │
  │              └──▶ (redo/planning) ───────────────────────┘
  │
  └──▶ failed/cancelled

状态说明:
- created: 任务创建
- outline_pending: AI 生成大纲，等待用户确认
- outline_confirmed: 用户确认大纲
- researching: 执行深度研究
- writing: 生成文稿
- reviewing: BlueTeam 评审
- completed: 任务完成
- failed: 执行失败
- cancelled: 用户取消
```

### 2.3 Agent 设计模式

```typescript
// Agent 基类
abstract class BaseAgent {
  protected name: string;
  protected llmRouter: LLMRouter;
  protected logs: AgentLog[] = [];

  abstract execute(payload: any, context?: AgentContext): Promise<AgentResult>;

  // 日志记录
  protected log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const entry: AgentLog = {
      timestamp: new Date(),
      level,
      message,
      metadata,
    };
    this.logs.push(entry);
    console.log(`[${this.name}] ${level}: ${message}`, metadata || '');
  }

  // 任务持久化
  protected async saveTask(type: string, status: string, payload: any): Promise<string> {
    const res = await query(
      `INSERT INTO pipeline_tasks (type, status, payload) VALUES ($1, $2, $3) RETURNING id`,
      [type, status, JSON.stringify(payload)]
    );
    return res.rows[0].id;
  }
}

// 具体 Agent 实现
class PlannerAgent extends BaseAgent {
  async execute(input: PlannerInput): Promise<AgentResult<PlannerOutput>> {
    // 1. 话题质量评估
    // 2. 大纲生成 (调用 LLM)
    // 3. 数据需求分析
    // 4. 新角度挖掘
  }
}

class BlueTeamAgent extends BaseAgent {
  async execute(input: BlueTeamInput): Promise<AgentResult<BlueTeamOutput>> {
    // 并行调用 4 位专家评审
    const experts = [
      { name: '事实核查员', focus: 'accuracy' },
      { name: '逻辑检察官', focus: 'logic' },
      { name: '行业专家', focus: 'professionalism' },
      { name: '读者代表', focus: 'readability' },
    ];
    // 汇总评审意见
  }
}
```

## 3. 关键技术决策 (ADR)

### ADR-001: Kimi Code 作为主要 LLM Provider

**决策**: 使用 Kimi Code 作为主要模型，Claude/OpenAI 作为 fallback

**背景**:
- 需要支持长文本理解和高质量中文生成
- 成本效益比是关键考量

**决策原因**:
- Kimi Code 在中文财经内容生成方面表现优异
- 256K 上下文窗口支持长报告生成
- 成本低于 Claude API

**风险与缓解**:
| 风险 | 缓解措施 |
|-----|---------|
| API 稳定性 | Provider 自动降级机制 |
| 网络连接问题 | 原生 https 模块 + IPv4 强制 |
| 访问权限限制 | User-Agent 伪装 |

### ADR-002: Node.js 原生 https 模块替换 fetch

**决策**: 使用原生 https 模块替代 Node.js fetch 调用 Kimi API

**背景**:
- Node.js fetch 优先尝试 IPv6，导致连接 api.kimi.com 超时
- 需要更细粒度的网络控制

**实现方案**:
```typescript
const options = {
  hostname: 'api.kimi.com',
  path: '/coding/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'User-Agent': 'claude-cli/2.1.76 (external, cli)',
    'X-Client-Name': 'claude-code',
    'X-Client-Version': '2.1.76',
  },
  family: 4, // 强制 IPv4
  timeout: 60000,
};
```

### ADR-003: PostgreSQL + pgvector 作为向量数据库

**决策**: 使用 PostgreSQL + pgvector 扩展存储向量数据

**对比方案**:
| 方案 | 优点 | 缺点 |
|-----|------|------|
| PostgreSQL + pgvector | 统一技术栈、ACID 支持 | 性能不如专用向量库 |
| Pinecone | 托管服务、高性能 | 成本高、数据外泄风险 |
| Milvus | 开源、高性能 | 需额外运维 |

**选择理由**: 当前数据量 (< 100万条) 下 pgvector 性能足够，简化技术栈。

## 4. 数据库设计

### 4.1 核心表结构

```sql
-- 任务表
create table tasks (
  id varchar(32) primary key,
  topic text not null,
  outline jsonb,
  research_data jsonb,
  status varchar(32) not null default 'created',
  progress int default 0,
  current_stage varchar(64),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- BlueTeam 评审表
create table blue_team_reviews (
  id serial primary key,
  task_id varchar(32) references tasks(id),
  expert_id varchar(32),
  expert_name varchar(128),
  question text,
  category varchar(32), -- evidence/logic/structure/readability
  severity varchar(16), -- high/medium/low
  suggested_improvement text,
  round int default 1,
  created_at timestamptz default now()
);

-- 素材库表
create table asset_library (
  id varchar(32) primary key,
  content text not null,
  content_type varchar(32), -- text/image/pdf/url
  tags jsonb,
  embedding vector(1536),
  quality_score float,
  source varchar(256),
  source_url text,
  created_at timestamptz default now()
);

-- 专家库表
create table expert_profiles (
  id varchar(32) primary key,
  name varchar(128) not null,
  title varchar(256),
  domains jsonb, -- 擅长领域
  authority_score float default 0.5,
  credentials jsonb,
  core_viewpoints jsonb,
  created_at timestamptz default now()
);
```

### 4.2 索引设计

```sql
-- B-tree 索引
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_reviews_task_id ON blue_team_reviews(task_id);

-- GIN 索引 (JSONB)
CREATE INDEX idx_tasks_outline ON tasks USING GIN (outline);
CREATE INDEX idx_assets_tags ON asset_library USING GIN (tags);

-- 向量索引 (IVFFlat)
CREATE INDEX idx_assets_embedding ON asset_library
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## 5. API 规范

### 5.1 RESTful 接口

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

Response 201:
{
  "id": "task_xxx",
  "status": "outline_pending",
  "topic": "新能源汽车电池技术发展趋势",
  "outline": {
    "title": "...",
    "sections": [...]
  },
  "progress": 10,
  "message": "大纲已生成，请确认后继续"
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

Response 200:
{
  "id": "task_xxx",
  "status": "researching",
  "message": "大纲已确认，开始深度研究"
}
```

#### 重做环节
```http
POST /api/v1/production/:taskId/redo/:stage
Content-Type: application/json

# stage: planning/research/writing/review

Body (planning):
{
  "topic": "新主题",
  "context": "补充背景"
}

Response 200:
{
  "id": "task_xxx",
  "status": "planning_completed",
  "outline": { ... }
}
```

#### 获取评审列表
```http
GET /api/v1/production/:taskId/reviews

Response 200:
{
  "reviews": [
    {
      "id": 1,
      "expertName": "事实核查员",
      "category": "evidence",
      "severity": "high",
      "question": "数据来源缺失",
      "suggestedImprovement": "补充引用来源"
    }
  ]
}
```

### 5.2 错误码规范

| 状态码 | 错误码 | 说明 |
|-------|-------|------|
| 400 | VALIDATION_ERROR | 请求参数校验失败 |
| 401 | UNAUTHORIZED | API Key 无效或缺失 |
| 404 | TASK_NOT_FOUND | 任务不存在 |
| 409 | TASK_STATE_INVALID | 任务状态不允许当前操作 |
| 422 | LLM_GENERATION_FAILED | AI 生成失败 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

## 6. 性能优化

### 6.1 LLM 调用优化
- **流式输出**: 使用 SSE 实现实时内容展示
- **缓存机制**: 相同 prompt 缓存 1 小时
- **超时控制**: 60s 超时 + 3 次指数退避重试
- **降级策略**: Provider 失败自动切换到 fallback

### 6.2 数据库优化
- **连接池**: 10-20 连接，支持并发
- **查询优化**: 使用 EXPLAIN ANALYZE 定期检查慢查询
- **分区策略**: 任务表按 created_at 月分区 (数据量大时)

### 6.3 前端优化
- **懒加载**: 大纲分章节加载
- **增量更新**: WebSocket 实时推送进度
- **本地缓存**: LocalStorage 保存用户编辑状态

## 7. 安全设计

### 7.1 认证授权
```
认证方式: API Key (Header: X-API-Key)

角色权限:
- admin: 全部权限 (任务管理、系统配置、用户管理)
- editor: 创建、编辑、发布
- analyst: 创建、编辑 (不可发布)
- viewer: 只读
```

### 7.2 数据安全
- 敏感字段加密存储 (AES-256)
- API Key 定期轮换机制
- 操作日志完整记录
- SQL 注入防护 (参数化查询)

### 7.3 网络安全
- HTTPS 强制传输
- CORS 白名单限制
- 请求限流 (Rate Limiting: 100 req/min per IP)
- DDoS 防护 (Nginx layer)

## 8. 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx                              │
│         (SSL终止、反向代理、静态文件、限流)               │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ API Server  │ │ API Server  │ │ Webapp      │
    │ Instance 1  │ │ Instance 2  │ │ (Nginx)     │
    │ Port: 3000  │ │ Port: 3000  │ │ Port: 80    │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
           └───────┬───────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│PostgreSQL│ │  Redis   │ │  MinIO   │
│+pgvector│ │ (Cache/  │ │(Object   │
│         │ │  Queue)  │ │ Storage) │
└─────────┘ └──────────┘ └──────────┘
```

## 9. 监控与运维

### 9.1 监控指标

| 指标 | 类型 | 告警阈值 |
|-----|------|----------|
| API 响应时间 | Histogram | P99 > 2s |
| 错误率 | Counter | > 1% |
| LLM 调用成功率 | Counter | < 95% |
| 任务处理时长 | Histogram | > 10min |
| 数据库连接数 | Gauge | > 80% |

### 9.2 日志规范

```json
{
  "timestamp": "2026-03-16T10:30:00.000Z",
  "level": "info",
  "service": "content-pipeline",
  "traceId": "trace_xxx",
  "spanId": "span_xxx",
  "message": "Task completed",
  "metadata": {
    "taskId": "task_xxx",
    "duration": 125000,
    "llmCalls": 5,
    "llmProvider": "kimi"
  }
}
```

## 附录

### A. 技术栈清单

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 20.x |
| 框架 | Fastify | 4.x |
| 语言 | TypeScript | 5.x |
| 数据库 | PostgreSQL | 15+ |
| 向量扩展 | pgvector | 0.5+ |
| 缓存 | Redis | 7.x |
| 队列 | BullMQ | 4.x |
| 对象存储 | MinIO | latest |
| 容器 | Docker | 24+ |

### B. 相关文档

- [产品需求文档](../01-product/Product-Spec-v2.0.md)
- [API 接口文档](./API-Spec.yaml) (待补充)
- [部署文档](../DEPLOY.md)
- [Kimi Code 集成指南](../api/KIMI_CODE_INTEGRATION.md)
