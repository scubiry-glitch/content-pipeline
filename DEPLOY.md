# 内容生产流水线 - 部署指南

## 方式一：Docker Compose 一键部署（推荐）

### 1. 环境准备

```bash
# 安装 Docker 和 Docker Compose
curl -fsSL https://get.docker.com | sh

# 验证安装
docker --version
docker-compose --version
```

### 2. 下载项目

```bash
git clone <your-repo-url> content-pipeline
cd content-pipeline
```

### 3. 配置环境变量

```bash
# 复制示例配置文件
cp .env.example .env

# 编辑 .env 文件，填入你的 API Keys
vim .env
```

**必需配置：**

```env
# 数据库配置
DB_USER=author
DB_PASSWORD=your_secure_password
DB_NAME=author

# LLM API Keys（至少配置一个）
KIMI_API_KEY=sk-kimi-xxx
KIMI_BASE_URL=https://api.kimi.com/coding

# 可选：Claude/OpenAI 作为备选
CLAUDE_API_KEY=sk-ant-api03-xxx
OPENAI_API_KEY=sk-proj-xxx

# API 认证密钥
ADMIN_API_KEY=your-secure-api-key
```

### 4. 启动服务

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f api

# 检查健康状态
curl http://localhost:3000/api/v1/health
```

### 5. 验证部署

```bash
# 测试 API
curl -X POST http://localhost:3000/api/v1/production \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"topic":"保租房REITs市场分析"}'

# 打开前端界面
open http://localhost:8080
```

---

## 方式二：服务器手动部署

### 1. 系统要求

- Ubuntu 22.04 LTS / CentOS 8+
- Node.js 20+
- PostgreSQL 14+ with pgvector
- 2GB+ RAM
- 10GB+ 磁盘空间

### 2. 安装 PostgreSQL 和 pgvector

```bash
# Ubuntu
sudo apt update
sudo apt install postgresql postgresql-contrib

# 安装 pgvector
sudo apt install postgresql-14-pgvector

# 启用扩展
sudo -u postgres psql -c "CREATE DATABASE author;"
sudo -u postgres psql -d author -c "CREATE EXTENSION vector;"
```

### 3. 部署 API

```bash
# 创建应用目录
mkdir -p /opt/content-pipeline
cd /opt/content-pipeline

# 复制文件
cp -r /path/to/api ./api
cp -r /path/to/webapp ./webapp
cp .env .env

# 安装依赖
cd api
npm ci --only=production

# 构建
npm run build

# 启动服务（使用 PM2）
npm install -g pm2
pm2 start dist/server.js --name content-pipeline-api
pm2 startup
pm2 save
```

### 4. 配置 Nginx 反向代理

```bash
# 安装 Nginx
sudo apt install nginx

# 创建配置文件
sudo tee /etc/nginx/sites-available/content-pipeline << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /opt/content-pipeline/webapp;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/content-pipeline /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 配置 HTTPS（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo systemctl enable certbot.timer
```

---

## 环境变量说明

| 变量 | 必需 | 说明 |
|-----|------|------|
| `KIMI_API_KEY` | 是 | Kimi API 密钥 |
| `KIMI_BASE_URL` | 否 | Kimi API 地址，默认 `https://api.kimi.com/coding` |
| `CLAUDE_API_KEY` | 否 | Claude API 密钥（备选） |
| `OPENAI_API_KEY` | 否 | OpenAI API 密钥（备选） |
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `ADMIN_API_KEY` | 是 | API 认证密钥 |
| `PORT` | 否 | 服务端口，默认 3000 |

---

## 监控与维护

### 查看日志

```bash
# Docker 方式
docker-compose logs -f api

# PM2 方式
pm2 logs content-pipeline-api
```

### 备份数据库

```bash
# Docker 方式
docker exec content-pipeline-db pg_dump -U author author > backup.sql

# 手动方式
pg_dump -U author -h localhost author > backup.sql
```

### 更新部署

```bash
# Docker 方式
docker-compose pull
docker-compose up -d

# 手动方式
cd /opt/content-pipeline/api
git pull
npm ci
pm2 restart content-pipeline-api
```

---

## 故障排查

### 问题1：数据库连接失败

```bash
# 检查 PostgreSQL 状态
docker-compose ps postgres
docker-compose logs postgres

# 检查网络连接
docker exec content-pipeline-api nc -zv postgres 5432
```

### 问题2：LLM API 调用失败

```bash
# 测试 Kimi 连接
docker exec content-pipeline-api curl -I https://api.kimi.com/coding/v1/models

# 查看 API 日志
docker-compose logs api | grep -i "kimi\|llm"
```

### 问题3：前端无法访问 API

```bash
# 检查 CORS 配置
curl -X OPTIONS http://localhost:3000/api/v1/production -v

# 检查 Nginx 配置
sudo nginx -t
```

---

## 生产环境建议

1. **数据库**：使用托管 PostgreSQL（如 AWS RDS、阿里云 RDS）
2. **LLM API**：配置多个 Key 实现负载均衡
3. **监控**：集成 Sentry、Datadog 等监控服务
4. **备份**：每日自动备份数据库
5. **CDN**：前端资源使用 CDN 加速

---

## 一键部署脚本

```bash
#!/bin/bash
# deploy.sh - 一键部署脚本

set -e

echo "=== Content Pipeline 部署 ==="

# 检查环境
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
fi

# 创建目录
mkdir -p /opt/content-pipeline
cd /opt/content-pipeline

# 下载配置
curl -O https://raw.githubusercontent.com/your-repo/content-pipeline/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/your-repo/content-pipeline/main/Dockerfile
curl -O https://raw.githubusercontent.com/your-repo/content-pipeline/main/nginx.conf

# 创建 .env
cat > .env << 'EOF'
DB_PASSWORD=$(openssl rand -base64 32)
ADMIN_API_KEY=$(openssl rand -base64 32)
KIMI_API_KEY=your-kimi-api-key
EOF

echo "请编辑 .env 文件配置 API Keys"
echo "运行: vim /opt/content-pipeline/.env"
echo "然后执行: docker-compose up -d"
```

---

## 联系方式

如有问题，请联系技术支持。
