# 内容生产流水线 - 系统设计文档

## 1. 系统架构概览

### 1.1 架构图

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

## 2. 核心组件设计

### 2.1 LLM Router 架构

```typescript
// 组件结构
class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private routingRules: ModelRoutingRule[];
  private modelConfigs: Record<string, Record<string, string>>;

  // 核心方法
  registerProvider(provider: LLMProvider): void;
  generate(prompt: string, taskType: string, params?: GenerationParams): Promise<GenerationResult>;
  embed(text: string, providerName?: string): Promise<number[]>;
  checkHealth(): Promise<Record<string, boolean>>;
}

// 路由规则
interface ModelRoutingRule {
  taskType: string;
  priority: 'quality' | 'speed' | 'cost';
  preferredProvider: string;
  fallbackProvider?: string;
}

// 当前路由配置
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

### 2.2 Pipeline 状态机

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  created │────▶│outline_pending│────▶│outline_      │
│  (创建)   │     │(大纲待确认)   │     │confirmed     │
└──────────┘     └──────────────┘     │(大纲已确认)   │
                                      └──────┬───────┘
                                             │
                                             ▼
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│completed │◀────│reviewing     │◀────│writing       │
│(已完成)  │     │(评审中)      │     │(写作中)      │
└──────────┘     └──────────────┘     └──────┬───────┘
                                             │
                              ┌──────────────┘
                              ▼
                       ┌──────────────┐
                       │researching   │
                       │(研究中)      │
                       └──────────────┘

状态说明:
- created: 任务创建
- outline_pending: 大纲生成完成，等待用户确认
- outline_confirmed: 用户确认大纲
- researching: 执行深度研究
- writing: 生成文稿
- reviewing: BlueTeam 评审
- completed: 任务完成

异常状态:
- failed: 执行失败
- cancelled: 用户取消
```

### 2.3 Agent 设计模式

```typescript
// Base Agent
abstract class BaseAgent {
  protected name: string;
  protected llmRouter: LLMRouter;
  protected logs: AgentLog[] = [];

  abstract execute(payload: any, context?: AgentContext): Promise<AgentResult>;

  // 通用方法
  protected log(level: LogLevel, message: string, metadata?: any): void;
  protected saveTask(type: string, status: string, payload: any): Promise<string>;
  protected updateTask(taskId: string, updates: TaskUpdate): Promise<void>;
}

// 具体 Agent 实现
class PlannerAgent extends BaseAgent {
  async execute(input: PlannerInput, context?: AgentContext): Promise<AgentResult<PlannerOutput>> {
    // 1. 话题质量评估
    // 2. 大纲生成
    // 3. 数据需求分析
    // 4. 新角度挖掘
  }
}

class ResearchAgent extends BaseAgent {
  async execute(input: ResearchInput, context?: AgentContext): Promise<AgentResult<ResearchOutput>> {
    // 1. 数据源采集
    // 2. 数据清洗
    // 3. 数据分析
    // 4. 洞察生成
  }
}

class WriterAgent extends BaseAgent {
  async execute(input: WriterInput, context?: AgentContext): Promise<AgentResult<WriterOutput>> {
    // 1. 章节规划
    // 2. 内容生成
    // 3. 引用标注
    // 4. 风格调整
  }
}

class BlueTeamAgent extends BaseAgent {
  async execute(input: BlueTeamInput, context?: AgentContext): Promise<AgentResult<BlueTeamOutput>> {
    // 1. 多专家模拟
    // 2. 问题识别
    // 3. 建议生成
  }
}
```

### 2.4 数据流设计

```
用户输入话题
    │
    ▼
┌─────────────────┐
│ PlannerAgent    │──▶ LLM Router (Kimi) ──▶ 大纲 JSON
│ 选题规划         │
└─────────────────┘
    │
    ▼
用户确认大纲
    │
    ▼
┌─────────────────┐
│ ResearchAgent   │──▶ Web Search ──▶ 数据采集
│ 深度研究         │──▶ LLM Router ──▶ 数据分析
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ WriterAgent     │──▶ LLM Router (Kimi) ──▶ 章节内容
│ 智能写作         │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ BlueTeamAgent   │──▶ LLM Router ──▶ 评审意见
│ 质量评审         │
└─────────────────┘
    │
    ▼
人工确认
    │
    ▼
┌─────────────────┐
│ OutputService   │──▶ PDF/Word/Markdown
│ 多格式输出       │
└─────────────────┘
```

## 3. 关键技术决策

### 3.1 ADR-001: LLM 提供商选择

**决策**: 使用 Kimi Code 作为主要模型，Claude/OpenAI 作为 fallback

**原因**:
- Kimi Code 在长文本理解和中文生成方面表现优异
- 成本效益比高于 Claude
- 支持 256K 上下文窗口

**风险**:
- API 稳定性较 Claude 稍差
- 需要特殊处理网络连接 (IPv4 强制)

**缓解措施**:
- 实现 Provider 自动降级机制
- 添加重试逻辑
- 保留 Mock Provider 用于降级

### 3.2 ADR-002: Node.js https 模块替换 fetch

**决策**: 使用原生 https 模块替代 Node.js fetch 调用 Kimi API

**原因**:
- Node.js fetch 优先尝试 IPv6，导致连接超时
- 原生 https 模块支持 `family: 4` 强制 IPv4
- 更细粒度的超时控制

**代码示例**:
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

### 3.3 ADR-003: PostgreSQL + pgvector 作为向量数据库

**决策**: 使用 PostgreSQL + pgvector 扩展存储向量数据

**原因**:
- 减少技术栈复杂度
- 支持 ACID 事务
- 向量检索性能满足当前需求 (< 100ms @ 10万条)

**替代方案**:
- Pinecone: 托管服务，成本较高
- Milvus: 需要额外运维
- Weaviate: 学习曲线较陡

## 4. 性能优化策略

### 4.1 LLM 调用优化
- **流式输出**: 使用 SSE 实现实时内容展示
- **缓存机制**: 相同 prompt 缓存 1 小时
- **批量处理**: 章节并行生成
- **超时控制**: 60s 超时 + 3 次重试

### 4.2 数据库优化
- **索引策略**:
  - B-tree: task_id, status, created_at
  - GIN: outline (JSONB), tags (JSONB)
  - IVFFlat: embedding (vector)
- **连接池**: 10-20 连接
- **查询优化**: 使用 EXPLAIN ANALYZE 定期检查

### 4.3 前端优化
- **懒加载**: 大纲分章节加载
- **增量更新**: WebSocket 实时推送进度
- **本地缓存**: LocalStorage 保存用户编辑

## 5. 安全设计

### 5.1 认证授权
```
┌────────────────────────────────────────┐
│ 认证方式: API Key                      │
│ Header: X-API-Key                      │
│                                        │
│ 角色权限:                              │
│ - admin: 全部权限                      │
│ - editor: 创建、编辑、发布             │
│ - analyst: 创建、编辑 (不可发布)       │
│ - viewer: 只读                         │
└────────────────────────────────────────┘
```

### 5.2 数据安全
- 敏感字段加密存储 (AES-256)
- API Key 定期轮换
- 操作日志审计
- SQL 注入防护 (参数化查询)

### 5.3 网络安全
- HTTPS 强制
- CORS 白名单
- 请求限流 (100 req/min per IP)
- DDoS 防护 (Nginx layer)

## 6. 监控与运维

### 6.1 监控指标
| 指标 | 类型 | 告警阈值 |
|------|------|----------|
| API 响应时间 | Histogram | P99 > 2s |
| 错误率 | Counter | > 1% |
| LLM 调用成功率 | Counter | < 95% |
| 任务处理时长 | Histogram | > 10min |
| 数据库连接数 | Gauge | > 80% |

### 6.2 日志规范
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
    "llmCalls": 5
  }
}
```

### 6.3 部署流程
```bash
# 1. 构建
docker build -t content-pipeline:version .

# 2. 测试
docker run --rm content-pipeline:version npm test

# 3. 部署
docker-compose up -d

# 4. 健康检查
curl http://localhost:3000/health

# 5. 回滚 (如需要)
docker-compose down
docker-compose up -d content-pipeline:previous-version
```

## 7. 扩展性设计

### 7.1 水平扩展
- 无状态 API 设计，支持多实例部署
- 使用 Redis 共享会话和缓存
- 数据库读写分离

### 7.2 功能扩展
- 插件化 Agent 设计，支持自定义 Agent
- Webhook 机制，支持外部系统集成
- 配置化流水线，支持自定义流程

### 7.3 模型扩展
```typescript
// 新增 Provider 只需实现接口
interface LLMProvider {
  getName(): string;
  generate(prompt: string, params?: GenerationParams): Promise<GenerationResult>;
  embed(text: string): Promise<number[]>;
  checkHealth(): Promise<boolean>;
  getAvailableModels(): string[];
}
```

---

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
| 编排 | Docker Compose | 2+ |

### B. 相关文档
- [API 规范](../01-product/Product-Spec-v2.0.md)
- [Kimi Code 集成指南](../../api/KIMI_CODE_INTEGRATION.md)
- [部署文档](../../DEPLOY.md)
- [测试报告](../../TEST_STATUS.md)
