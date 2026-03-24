# Content Pipeline 生产部署指南

本文档提供将 Content Pipeline 部署到生产服务器的完整步骤。

## 部署包内容

位于 `deploy/` 目录：

| 文件 | 说明 |
|------|------|
| `export-db.sh` | 数据库导出脚本（pg_dump 方式） |
| `export-simple.mjs` | 数据库导出脚本（Node.js 方式，解决版本问题） |
| `import-db.sh` | 数据库导入脚本 |
| `quick-deploy.sh` | 一键部署脚本 |
| `docker-compose.prod.yml` | Docker 生产配置 |
| `.env.example` | 生产环境变量模板 |
| `README.md` | 详细部署文档 |
| `EXPORT_GUIDE.md` | 数据库导出方法汇总 |

## 快速部署步骤

### 1. 导出开发数据库

由于本地 pg_dump 版本可能与服务器不匹配，使用 Node.js 脚本导出：

```bash
cd deploy

# 设置数据库密码（如果需要）
export DB_PASSWORD=your_password

# 使用 Node.js 导出
node export-simple.mjs ./backup

# 或使用交互式导出脚本
./export-db.sh ./backup
```

### 2. 传输到服务器

```bash
# 压缩备份文件
cd backup
tar -czf author_backup_$(date +%Y%m%d).tar.gz author_export_*.sql

# 传输到服务器
scp author_backup_*.tar.gz user@your-server:/tmp/
scp ../import-db.sh user@your-server:/tmp/
```

### 3. 服务器端导入

```bash
ssh user@your-server
cd /tmp
tar -xzf author_backup_*.tar.gz

# 设置生产数据库密码并导入
export DB_PASSWORD=your_production_password
./import-db.sh -c -f author_export_*.sql
```

### 4. 部署应用

选择以下方式之一：

#### 方式 A: 手动部署

```bash
# 安装依赖
sudo apt update
sudo apt install -y nodejs npm postgresql nginx

# 配置数据库（已导入数据）
sudo systemctl enable postgresql

# 部署 API
cd /opt/content-pipeline/api
npm install --production
cp deploy/.env.example .env
# 编辑 .env 配置
npm run build
pm2 start dist/index.js --name "content-pipeline-api"

# 部署前端
cd /opt/content-pipeline/webapp
npm install
npm run build
sudo cp -r dist/* /var/www/html/

# 配置 Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/content-pipeline
sudo ln -s /etc/nginx/sites-available/content-pipeline /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 方式 B: Docker 部署

```bash
cd /opt/content-pipeline/deploy

# 配置环境
cp .env.example .env
nano .env  # 编辑配置

# 启动服务
docker-compose -f docker-compose.prod.yml up -d

# 导入数据到容器
docker cp author_export_*.sql content-pipeline-db:/tmp/
docker exec -i content-pipeline-db psql -U postgres -d author < /tmp/author_export_*.sql
```

#### 方式 C: 一键部署（新服务器）

```bash
# 在全新服务器上执行
wget https://your-domain.com/deploy/quick-deploy.sh
chmod +x quick-deploy.sh
sudo ./quick-deploy.sh
```

## 环境变量配置

复制 `deploy/.env.example` 到 `api/.env` 并配置：

```bash
# 数据库（使用生产数据库）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=author
DB_USER=postgres
DB_PASSWORD=your_strong_password

# 认证（生产环境使用强密钥）
ADMIN_API_KEY=your_secure_random_key_min_32_chars

# LLM API（至少配置一个）
KIMI_API_KEY=sk-xxx
CLAUDE_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx

# Web Search（可选但推荐）
TAVILY_API_KEY=tvly-xxx

# 服务器
PORT=3000
NODE_ENV=production
```

## 验证部署

```bash
# 1. 检查 API 健康
curl http://your-server:3000/health

# 2. 检查数据库连接
psql -U postgres -d author -c "SELECT COUNT(*) FROM tasks;"

# 3. 检查服务状态
pm2 status
systemctl status nginx

# 4. 查看日志
pm2 logs
tail -f /var/log/nginx/error.log
```

## 常见问题

### pg_dump 版本不匹配

**错误**: `pg_dump: server version mismatch`

**解决**: 使用 Node.js 导出脚本：
```bash
node deploy/export-simple.mjs ./backup
```

### 数据库连接失败

**检查**:
```bash
# PostgreSQL 是否运行
sudo systemctl status postgresql

# 监听配置
grep listen_addresses /etc/postgresql/*/main/postgresql.conf

# 防火墙
sudo ufw allow 5432/tcp
```

### 权限错误

**修复**:
```bash
# 修复数据库权限
sudo chown -R postgres:postgres /var/lib/postgresql

# 修复脚本权限
chmod +x deploy/*.sh
```

## 生产检查清单

- [ ] 数据库已导入生产服务器
- [ ] 环境变量已配置（特别是 ADMIN_API_KEY）
- [ ] API 密钥已更换为生产值
- [ ] Nginx 配置正确
- [ ] HTTPS 已启用（SSL 证书）
- [ ] 防火墙已配置
- [ ] 自动备份已设置
- [ ] 监控和日志已配置

## 回滚方案

如果部署失败：

```bash
# 1. 停止服务
pm2 stop content-pipeline-api

# 2. 恢复数据库
psql -U postgres -d author < backup-before-deploy.sql

# 3. 重启服务
pm2 start content-pipeline-api

# 4. 检查状态
pm2 logs
```

## 支持

- 详细文档: `deploy/README.md`
- 导出指南: `deploy/EXPORT_GUIDE.md`
- 部署包说明: `deploy/PACKAGE.md`
