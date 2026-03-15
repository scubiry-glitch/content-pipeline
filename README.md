# 内容生产流水线 (Content Pipeline)

AI 驱动的产业研究报告生产系统。从选题到成稿，全流程自动化，支持专家级 BlueTeam 评审。

## 核心流程

```
选题 → 大纲生成 → 素材研究 → 初稿写作 → BlueTeam 评审 → 人工确认 → 终稿输出
```

## 特性

- **BlueTeam 评审**: 3 位领域专家（挑战/扩展/归纳）× 2 轮深度评审
- **专家库**: 根据主题自动匹配领域专家（房地产金融、FinTech 等）
- **素材库**: PDF 解析 + 语义搜索（pgvector）
- **多 LLM 支持**: Kimi / Claude / OpenAI 自动降级
- **Web 管理界面**: 任务管理、素材上传、进度追踪

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/YOUR_USERNAME/content-pipeline.git
cd content-pipeline

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 KIMI_API_KEY

# 3. 启动服务
docker-compose up -d

# 4. 访问
# API: http://localhost:3000
# Web: http://localhost:8080
```

### 手动部署

```bash
cd api
npm install
npm run dev
```

## 环境变量

| 变量 | 必需 | 说明 |
|-----|------|------|
| `KIMI_API_KEY` | 是 | Kimi API 密钥 |
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `ADMIN_API_KEY` | 是 | API 认证密钥 |

详见 [DEPLOY.md](DEPLOY.md)

## API 示例

```bash
# 创建研究任务
curl -X POST http://localhost:3000/api/v1/production \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"topic":"保租房REITs市场分析"}'

# 上传素材
curl -X POST http://localhost:3000/api/v1/assets \
  -H "X-API-Key: your-api-key" \
  -F "file=@report.pdf" \
  -F "title=行业研报"
```

## 技术栈

- **后端**: TypeScript + Node.js + Fastify
- **数据库**: PostgreSQL + pgvector
- **AI**: Kimi / Claude / OpenAI
- **部署**: Docker + Docker Compose

## 文档

- [部署指南](DEPLOY.md)
- [API 文档](api/openapi.yaml)
- [架构设计](Agents.md)

## License

MIT
