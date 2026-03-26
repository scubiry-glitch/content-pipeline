# v6.2 Assets AI 批量处理 - 实现文档

**版本**: v6.2  
**日期**: 2026-03-27  
**状态**: ✅ 已完成开发  

---

## 1. 已完成功能

### 1.1 数据库 Schema

创建了以下表结构：

| 表名 | 说明 |
|------|------|
| `asset_ai_analysis` | Asset AI 分析结果主表 |
| `asset_content_chunks` | 文档内容分块表 |
| `asset_embeddings` | 分块向量表 (pgvector) |
| `asset_similarity_groups` | 相似内容分组表 |

扩展了以下表：
- `assets` - 添加 AI 相关字段
- `ai_task_recommendations` - 添加 `source_type` 和 `source_asset_id` 字段

### 1.2 核心服务

| 服务 | 文件路径 | 说明 |
|------|----------|------|
| AssetsAIBatchProcessor | `services/assets-ai/batchProcessor.ts` | 批处理主控 |
| AssetQualityProcessor | `services/assets-ai/processors.ts` | 质量评估 Processor |
| AssetClassificationProcessor | `services/assets-ai/processors.ts` | 主题分类 Processor |
| AssetTaskRecommendationProcessor | `services/assets-ai/processors.ts` | 任务推荐 Processor |
| AssetDuplicateDetectionProcessor | `services/assets-ai/processors.ts` | 去重检测 Processor |
| DocumentChunkingService | `services/assets-ai/chunking.ts` | 文档分块服务 |
| EmbeddingService | `services/assets-ai/embedding.ts` | 向量化服务 |
| PersistenceService | `services/assets-ai/persistence.ts` | 数据持久化服务 |
| **FileParserService** | `services/assets-ai/fileParser.ts` | **文件解析服务** |

### 1.3 文件解析服务

支持格式：
- **PDF** - 使用 `pdf-parse` 库解析
- **DOCX** - 使用 `mammoth` 库解析
- **TXT/MD** - 直接读取文本
- **图片** - 使用 `tesseract.js` OCR 识别

特性：
- 自动检测文件类型
- 提取文档结构（摘要、章节、结论）
- 支持 URL 下载和本地文件解析
- OCR 支持中文和英文

### 1.4 API 接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 批量处理 | POST | `/api/v1/ai/assets/batch-process` | 触发 Assets 批量处理 |
| 获取分析结果 | GET | `/api/v1/ai/assets/assets/:id/ai-analysis` | 获取指定 Asset 的 AI 分析 |
| 语义检索 | POST | `/api/v1/ai/assets/semantic-search` | 向量语义搜索 |
| 相似素材 | GET | `/api/v1/ai/assets/assets/:id/similar` | 查找相似 Assets |
| 去重检测 | GET | `/api/v1/ai/assets/assets/:id/duplicates` | 获取去重结果 |
| 分析结果列表 | GET | `/api/v1/ai/assets/analysis-results` | 查询分析结果列表 |
| 任务推荐 | GET | `/api/v1/ai/assets/task-recommendations` | 获取任务推荐（含 RSS/Assets）|
| 统计信息 | GET | `/api/v1/ai/assets/stats` | 获取处理统计 |
| 主题分布 | GET | `/api/v1/ai/assets/stats/themes` | 获取主题分布统计 |
| 质量分布 | GET | `/api/v1/ai/assets/stats/quality` | 获取质量分布统计 |

---

## 2. 项目结构

```
api/src/services/assets-ai/
├── schema.sql          # 数据库 Schema
├── types.ts            # TypeScript 类型定义
├── prompts.ts          # Prompt 模板
├── processors.ts       # AI Processors
├── chunking.ts         # 文档分块服务
├── embedding.ts        # 向量化服务
├── batchProcessor.ts   # 批处理器主服务
├── persistence.ts      # 数据持久化服务
├── fileParser.ts       # 文件解析服务 (PDF/DOCX/OCR)
├── index.ts            # 模块导出

api/src/routes/
└── assets-ai-processing.ts  # API 路由

api/src/scripts/
├── migrate-v6.2-assets-ai.ts  # 数据库迁移脚本
└── test-file-parser.ts        # 文件解析测试脚本
```

---

## 3. 核心功能说明

### 3.1 文档质量打分 (6维度)

```typescript
interface AssetQualityDimensions {
  completeness: number;       // 完整性 25%
  dataQuality: number;        // 数据质量 25%
  sourceAuthority: number;    // 来源权威性 20%
  timeliness: number;         // 时效性 15%
  readability: number;        // 可读性 10%
  practicality: number;       // 实用性 5%
}
```

### 3.2 主题分类

- 匹配 themes 表中的主题
- 映射到 expert-library 领域
- 提取标签和实体

### 3.3 向量化 (多提供商支持)

支持四种 Embedding 提供商，自动检测优先级：

| 优先级 | 提供商 | 环境变量 | 维度 | 速度 | 中文效果 |
|--------|--------|----------|------|------|----------|
| 1 | **SiliconFlow** ⭐ | `SILICONFLOW_API_KEY` + `embedding_model` | 768 | 62ms/文本 | ⭐⭐⭐ 优秀 |
| 2 | OpenAI | `OPENAI_API_KEY` | 1536 | ~100ms | ⭐⭐⭐ 优秀 |
| 3 | Dashboard LLM | `DASHBOARD_LLM_MODEL` + `LLM_API_TOKEN` | 768 | 788ms/文本 | ⭐⭐ 一般 |
| 4 | 本地 Fallback | 无 | 768 | <10ms | ⭐ 基础 |

#### SiliconFlow 实测效果

```
语义相似度测试（余弦相似度）:
✅ 人工智能 ↔ AI 深度学习: 0.7562 （高度相关）
✅ 房地产 ↔ 楼市趋势: 0.7706 （高度相关）
✅ 新能源 ↔ 电动汽车: 0.7637 （高度相关）
✅ 人工智能 ↔ 房地产: 0.3217 （明显不同）
✅ 新能源 ↔ 医药生物: 0.4204 （明显不同）

性能表现:
- 单文本: 270-360ms
- 批量: 5文本/308ms，平均 62ms/文本
```

```typescript
// 自动检测最佳提供商
const embeddingService = new EmbeddingService();
// 或使用指定提供商
const embeddingService = new EmbeddingService({
  provider: 'openai',
  model: 'text-embedding-3-large'
});
```

- 支持文档分块 (chunking)
- 使用 pgvector 存储
- HNSW 索引加速相似度搜索

### 3.4 去重检测

- 基于向量相似度
- 相似度阈值：
  - exact: >0.95
  - high: >0.80
  - medium: >0.60
  - low: >0.40

### 3.5 文件解析

```typescript
// 支持的文件类型
const SUPPORTED_TYPES = [
  '.pdf', '.docx', '.doc',  // 文档
  '.txt', '.md',            // 文本
  '.png', '.jpg', '.jpeg',  // 图片 (OCR)
  '.webp', '.gif'
];

// 使用示例
const parser = new FileParserService();
const result = await parser.parseFile('/path/to/document.pdf');
// 或从 URL 解析
const result = await parser.parseFromUrl('https://example.com/doc.pdf');
```

### 3.6 任务推荐

复用 v6.1 的 `ai_task_recommendations` 表，扩展支持：
- `source_type`: 'rss' | 'asset'
- `source_asset_id`: Asset ID

---

## 4. 使用方式

### 触发时机

Assets AI 分析支持 **3 种触发方式**：

| 触发方式 | 说明 | 推荐场景 |
|----------|------|----------|
| **🕐 定时自动** | 每30分钟自动扫描未处理素材 | 日常运营 |
| **🔧 手动 API** | 按需触发，支持批量指定 | 即时处理 |
| **🎬 上传自动** | Asset 上传后自动触发 | 高实时性场景 |

详细触发文档: [TRIGGER-GUIDE-v6.2.md](./TRIGGER-GUIDE-v6.2.md)

#### 定时任务配置

```typescript
// 默认配置
{
  processingIntervalMinutes: 30,  // 每30分钟
  batchSize: 10,                  // 每批10个
  enableVectorization: true,
  qualityThreshold: 70,
  retryIntervalMinutes: 60,       // 失败重试间隔
}
```

服务启动时自动启动：
```bash
npm run dev
# 输出: 📄 Assets AI 批量处理定时任务已启动（每30分钟）
```

### 4.2 生产环境配置检查

```bash
# 运行生产环境配置检查
cd api
npm run setup:production
```

该脚本会自动：
1. 检测可用的 Embedding 提供商
2. 推荐最佳配置
3. 测试 API 连接
4. 生成 .env 配置模板

### 4.2 配置 SiliconFlow (推荐)

**步骤1: 申请 API Key**
- 访问 https://siliconflow.cn/
- 注册并获取 API Key

**步骤2: 配置环境变量**

```bash
# 方法1: 直接编辑 .env 文件
cp .env.embedding.example .env
# 然后编辑 .env，填入你的 API Key

# 方法2: 导出环境变量
export SILICONFLOW_API_KEY=sk-your-api-key
export embedding_model=netease-youdao/bce-embedding-base_v1
```

**步骤3: 验证配置**

```bash
npm run test:siliconflow
```

预期输出：
```
✅ Provider correctly detected as 'siliconflow'
✅ Connection successful!
📊 Dimensions: 768
⏱️  Time: ~300ms
🔗 Similarity: 0.75-0.77 (similar texts)
```

### 4.3 初始化数据库

```bash
# 执行 Schema 迁移
cd api
npm run db:migrate:v6.2
```

迁移输出示例：
```
🚀 Starting v6.2 Assets AI migration...
Found 33 SQL statements to execute
✅ [1/33] CREATE TABLE IF NOT EXISTS asset_ai_analysis (...)
...
✨ Migration completed successfully!
```

### 4.2 安装依赖

```bash
cd api
npm install mammoth tesseract.js
```

### 4.3 触发批量处理

```bash
# 处理所有未处理的 Assets
curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json"

# 处理指定 Assets
curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["asset_001", "asset_002"],
    "includeEmbedding": true
  }'
```

### 4.4 语义搜索

```bash
curl -X POST http://localhost:3006/api/v1/ai/assets/semantic-search \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "人工智能市场规模",
    "minQualityScore": 70,
    "limit": 10
  }'
```

### 4.5 测试文件解析

```bash
cd api
npm run test:file-parser -- /path/to/test.pdf
```

---

## 5. 与 v6.1 的协同

```
v6.1 (RSS AI 处理)          v6.2 (Assets AI 处理)
     │                              │
     │  ┌────────────────────────┐  │
     └──┤  Unified AI Pipeline   ├──┘
        │  - 质量评估            │
        │  - 领域分类            │
        │  - 任务推荐            │
        └────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │  ai_task_recommendations │
        │  source_type: 'rss'/'asset' │
        └───────────────────────────┘
                    │
              创作工作台
```

---

## 6. 环境变量配置

Embedding 服务会自动检测并使用以下配置（按优先级）：

```bash
# 方式1: SiliconFlow (推荐，中文优化最佳) ⭐
SILICONFLOW_API_KEY=sk-xxx
embedding_model=netease-youdao/bce-embedding-base_v1

# 方式2: OpenAI
OPENAI_API_KEY=sk-...

# 方式3: 复用 Dashboard LLM 配置
DASHBOARD_LLM_MODEL=k2p5
LLM_API_TOKEN=your_token
LLM_API_BASE_URL=http://127.0.0.1:3004  # 可选

# 方式4: 本地 Fallback (无需配置，离线可用)
# 无环境变量时自动使用本地算法
```

### 配置优先级
1. **SiliconFlow** ⭐ - 如果有 `SILICONFLOW_API_KEY` + `embedding_model`，优先使用 SiliconFlow Embedding API（**中文优化最佳**）
2. **OpenAI** - 如果有 `OPENAI_API_KEY`，使用 OpenAI Embedding API
3. **Dashboard LLM** - 如果有 `LLM_API_TOKEN` + `DASHBOARD_LLM_MODEL`，复用现有配置
4. **本地 Fallback** - 无外部 API 时，使用本地词频/N-gram/哈希算法生成向量

### SiliconFlow 推荐模型

| 模型 | 实际维度 | 说明 | 实测相似度 |
|------|----------|------|------------|
| `netease-youdao/bce-embedding-base_v1` | 768 | 有道 BCE，中文场景优秀 | AI↔深度学习: **0.76** |
| `BAAI/bge-large-zh-v1.5` | 1024 | BGE large，通用中文 | - |
| `BAAI/bge-m3` | 1024 | BGE-M3，多语言支持 | - |

### 测试脚本

```bash
# 测试 SiliconFlow Embedding
cd api && npm run test:siliconflow

# 测试 Dashboard LLM Embedding
cd api && npm run test:dashboard-llm
```

---

## 7. 后续优化建议

1. **Embedding 服务优化**: 
   - 使用本地 Embedding 模型减少延迟
   - 批量 Embedding 优化
   
2. **定时任务**: 
   - 集成 node-cron 自动处理新上传素材
   - 每小时处理队列中的素材
   
3. **监控告警**: 
   - 添加处理延迟、失败率监控
   - 异常任务自动重试
   
4. **前端集成**: 
   - Assets 列表展示 AI 分数和分析结果
   - 语义搜索界面
   - 相似素材推荐组件

5. **OCR 优化**:
   - 支持更多语言
   - 表格结构识别
   - 手写体识别

---

## 8. 文件清单

### 新建文件
1. `/api/src/services/assets-ai/schema.sql`
2. `/api/src/services/assets-ai/types.ts`
3. `/api/src/services/assets-ai/prompts.ts`
4. `/api/src/services/assets-ai/processors.ts`
5. `/api/src/services/assets-ai/chunking.ts`
6. `/api/src/services/assets-ai/embedding.ts`
7. `/api/src/services/assets-ai/batchProcessor.ts`
8. `/api/src/services/assets-ai/persistence.ts`
9. `/api/src/services/assets-ai/fileParser.ts` ⭐
10. `/api/src/services/assets-ai/scheduler.ts` ⭐
11. `/api/src/services/assets-ai/index.ts`
12. `/api/src/routes/assets-ai-processing.ts`
13. `/api/src/scripts/migrate-v6.2-assets-ai.ts`
14. `/api/src/scripts/test-file-parser.ts`
15. `/api/src/scripts/test-siliconflow-embedding.ts` ⭐
16. `/api/src/scripts/test-dashboard-llm-embedding.ts`
17. `/api/src/scripts/setup-production.ts` ⭐
18. `/api/.env.embedding.example` ⭐
19. `/01-product/TRIGGER-GUIDE-v6.2.md` ⭐

### 修改文件
1. `/api/src/server.ts` - 添加路由注册、启动定时调度器
2. `/api/src/services/ai/llmClient.ts` - 添加 responseFormat 支持
3. `/api/package.json` - 添加依赖和脚本
