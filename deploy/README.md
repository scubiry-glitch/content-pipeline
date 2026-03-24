# Content Pipeline 部署指南

本文档介绍如何将 Content Pipeline 部署到生产服务器。

## 目录

1. [环境要求](#环境要求)
2. [数据库迁移](#数据库迁移)
3. [API 服务部署](#api-服务部署)
4. [前端部署](#前端部署)
5. [Docker 部署](#docker-部署)

---

## 环境要求

### 服务器配置

- **OS**: Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **CPU**: 2+ cores
- **RAM**: 4GB+ (推荐 8GB)
- **Disk**: 20GB+ SSD
- **Node.js**: 18.x+
- **PostgreSQL**: 14+ (with pgvector extension)
- **Nginx**: (用于反向代理)

### 必需软件

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm postgresql-14 nginx git

# CentOS/RHEL
sudo yum install -y nodejs npm postgresql14-server nginx git
```

---

## 数据库迁移

### 1. 导出开发环境数据库

在开发机器上运行：

```bash
# 进入部署目录
cd deploy

# 设置数据库密码
export DB_PASSWORD=your_password

# 执行导出脚本
./export-db.sh ./backup

# 或使用自定义参数
./export-db.sh ./backup author localhost 5432 scubiry
```

导出完成后，会在 `backup/` 目录生成：
- `author_schema_YYYYMMDD_HHMMSS.sql` - 数据库结构
- `author_data_YYYYMMDD_HHMMSS.sql` - 数据
- `author_full_YYYYMMDD_HHMMSS.sql` - 完整备份
- `author_backup_YYYYMMDD_HHMMSS.tar.gz` - 压缩包

### 2. 传输到服务器

```bash
# 使用 scp 传输到服务器
scp backup/author_backup_*.tar.gz user@your-server:/home/user/

# 或使用 rsync
rsync -avz backup/author_backup_*.tar.gz user@your-server:/home/user/
```

### 3. 在服务器上导入数据库

```bash
# SSH 登录服务器
ssh user@your-server

# 解压备份文件
tar -xzf author_backup_*.tar.gz

# 设置环境变量并执行导入
export DB_PASSWORD=your_production_password
./import-db.sh -c -f author_full_YYYYMMDD_HHMMSS.sql

# 或使用自定义参数
DB_HOST=localhost DB_PORT=5432 DB_NAME=author DB_USER=postgres DB_PASSWORD=mypassword ./import-db.sh -c author_full_YYYYMMDD_HHMMSS.sql
```

### 4. 验证数据库

```bash
# 连接数据库
psql -U postgres -d author

# 检查表
\dt

# 检查任务数量
SELECT COUNT(*) FROM tasks;

# 检查素材数量
SELECT COUNT(*) FROM assets;

# 退出
\q
```

---

## API 服务部署

### 1. 克隆代码

```bash
cd /opt
sudo git clone https://github.com/your-org/content-pipeline.git
sudo chown -R $USER:$USER content-pipeline
cd content-pipeline/api
```

### 2. 安装依赖

```bash
npm install --production
```

### 3. 配置环境变量

```bash
cp .env.example .env
nano .env
```

编辑 `.env` 文件：

```bash
# 数据库配置 (使用生产数据库)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=author
DB_USER=postgres
DB_PASSWORD=your_strong_password
DATABASE_URL=postgresql://postgres:your_strong_password@localhost:5432/author

# API 认证
ADMIN_API_KEY=your_secure_random_key_here

# LLM API (至少配置一个)
KIMI_API_KEY=sk-xxx
CLAUDE_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx

# Web Search (可选但推荐)
TAVILY_API_KEY=tvly-xxx
SERPER_API_KEY=xxx

# 服务器配置
PORT=3000
NODE_ENV=production
```

### 4. 使用 PM2 启动服务

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/index.js --name "content-pipeline-api"

# 保存 PM2 配置
pm2 save
pm2 startup

# 查看状态
pm2 status
pm2 logs content-pipeline-api
```

### 5. 配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/content-pipeline
```

添加配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/content-pipeline /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 前端部署

### 1. 构建前端

```bash
cd /opt/content-pipeline/webapp

# 安装依赖
npm install

# 配置生产环境 API
export VITE_API_URL=https://your-api-domain.com/api/v1
export VITE_API_KEY=your_secure_random_key_here

# 构建
npm run build
```

### 2. 部署到 Nginx

```bash
# 复制构建文件
sudo cp -r dist/* /var/www/content-pipeline/

# 设置权限
sudo chown -R www-data:www-data /var/www/content-pipeline
```

### 3. 配置 Nginx 静态站点

```bash
sudo nano /etc/nginx/sites-available/content-pipeline-web
```

添加配置：

```nginx
server {
    listen 80;
    server_name your-frontend-domain.com;
    root /var/www/content-pipeline;
    index index.html;

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 前端路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Docker 部署

### 使用 Docker Compose（推荐）

```bash
cd /opt/content-pipeline
docker-compose -f docker-compose.prod.yml up -d
```

查看 [docker-compose.prod.yml](#docker-compose) 配置。

---

## 健康检查

### API 健康检查

```bash
# 本地检查
curl http://localhost:3000/health

# 远程检查
curl https://your-api-domain.com/health
```

### 数据库健康检查

```bash
# 检查连接
psql -U postgres -d author -c "SELECT 1;"

# 检查表大小
psql -U postgres -d author -c "SELECT schemaname || '.' || tablename as table, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

---

## 备份策略

### 自动备份脚本

创建 `/opt/backup/backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/opt/backup/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# 数据库备份
pg_dump -U postgres -d author | gzip > "$BACKUP_DIR/author.sql.gz"

# 保留最近 7 天的备份
find /opt/backup -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
```

添加到 crontab：

```bash
# 每天凌晨 3 点备份
0 3 * * * /opt/backup/backup.sh >> /var/log/backup.log 2>&1
```

---

## 故障排除

### 数据库连接失败

```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql

# 检查监听端口
sudo netstat -tlnp | grep 5432

# 检查防火墙
sudo ufw allow 5432/tcp
```

### API 启动失败

```bash
# 查看日志
pm2 logs content-pipeline-api

# 检查端口占用
sudo lsof -i :3000

# 测试数据库连接
node -e "require('./dist/db/connection.js').query('SELECT 1').then(() => console.log('OK')).catch(e => console.error(e))"
```

### 前端 404 错误

```bash
# 检查 Nginx 配置
sudo nginx -t

# 检查文件权限
ls -la /var/www/content-pipeline/

# 重启 Nginx
sudo systemctl restart nginx
```

---

## 安全建议

1. **使用 HTTPS**: 配置 SSL 证书
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

2. **防火墙配置**:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw allow http
   sudo ufw allow https
   sudo ufw enable
   ```

3. **数据库安全**:
   - 使用强密码
   - 限制远程访问
   - 定期备份

4. **API 密钥**: 定期更换 `ADMIN_API_KEY`

---

## 更新部署

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 备份数据库
./deploy/export-db.sh ./backup-before-update

# 3. 安装依赖
npm install --production

# 4. 重启服务
pm2 restart content-pipeline-api

# 5. 验证
pm2 logs content-pipeline-api --lines 20
```
