#!/bin/bash
# Content Pipeline 快速部署脚本
# 适用于新服务器的一键部署

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Content Pipeline Quick Deploy${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# 获取用户输入
echo -e "${YELLOW}Please provide the following information:${NC}"
read -p "Domain name (e.g., pipeline.example.com): " DOMAIN
read -p "Database password: " DB_PASSWORD
read -p "Admin API key: " ADMIN_API_KEY
read -p "Kimi API key (optional): " KIMI_API_KEY
read -p "Tavily API key (optional): " TAVILY_API_KEY

echo ""
echo -e "${BLUE}Starting deployment...${NC}"

# 1. 更新系统
echo -e "${YELLOW}[1/8] Updating system packages...${NC}"
apt-get update && apt-get upgrade -y

# 2. 安装依赖
echo -e "${YELLOW}[2/8] Installing dependencies...${NC}"
apt-get install -y curl wget git nginx postgresql postgresql-contrib nodejs npm

# 3. 安装 PM2
echo -e "${YELLOW}[3/8] Installing PM2...${NC}"
npm install -g pm2

# 4. 配置 PostgreSQL
echo -e "${YELLOW}[4/8] Configuring PostgreSQL...${NC}"
systemctl start postgresql
systemctl enable postgresql

# 创建数据库
sudo -u postgres psql << EOF
CREATE DATABASE author;
CREATE USER pipeline WITH PASSWORD '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE author TO pipeline;
\c author
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF

# 5. 克隆代码
echo -e "${YELLOW}[5/8] Cloning repository...${NC}"
cd /opt
git clone https://github.com/your-org/content-pipeline.git 2>/dev/null || echo "Repository already exists"
cd content-pipeline

# 6. 配置环境变量
echo -e "${YELLOW}[6/8] Configuring environment...${NC}"
cat > api/.env << EOF
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=author
DB_USER=pipeline
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://pipeline:${DB_PASSWORD}@localhost:5432/author

# Auth
ADMIN_API_KEY=${ADMIN_API_KEY}

# LLM
KIMI_API_KEY=${KIMI_API_KEY}

# Search
TAVILY_API_KEY=${TAVILY_API_KEY}

# Server
PORT=3000
NODE_ENV=production
EOF

# 7. 构建和启动 API
echo -e "${YELLOW}[7/8] Building and starting API server...${NC}"
cd api
npm install --production
npm run build
pm2 start dist/index.js --name "content-pipeline-api"
pm2 save
pm2 startup

# 8. 配置 Nginx
echo -e "${YELLOW}[8/8] Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/content-pipeline << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/content-pipeline /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# 配置防火墙
echo -e "${YELLOW}Configuring firewall...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Your application is now running at:${NC}"
echo "  http://${DOMAIN}"
echo ""
echo -e "${YELLOW}To import your database:${NC}"
echo "  ./deploy/import-db.sh -c -f your-backup-file.sql"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  pm2 status              - Check API status"
echo "  pm2 logs                - View API logs"
echo "  nginx -t                - Test Nginx config"
echo "  systemctl status nginx  - Check Nginx status"
echo ""
