# Content Pipeline 部署包

此目录包含将 Content Pipeline 部署到生产服务器所需的所有脚本和配置。

## 目录结构

```
deploy/
├── README.md                    # 详细部署文档
├── PACKAGE.md                   # 本文件 - 包说明
├── .env.example                 # 生产环境变量模板
├── export-db.sh                 # 数据库导出脚本
├── import-db.sh                 # 数据库导入脚本
├── quick-deploy.sh              # 一键部署脚本（新服务器）
├── docker-compose.prod.yml      # Docker Compose 生产配置
└── nginx/                       # Nginx 配置（可选）
    └── nginx.conf
```

## 快速开始

### 方案 1: 手动部署（推荐用于生产）

1. **开发环境导出数据**
   ```bash
   cd deploy
   export DB_PASSWORD=your_dev_password
   ./export-db.sh ./backup
   ```

2. **传输到服务器**
   ```bash
   scp backup/author_backup_*.tar.gz user@server:/tmp/
   scp deploy/import-db.sh user@server:/tmp/
   ```

3. **服务器上导入数据**
   ```bash
   ssh user@server
   export DB_PASSWORD=your_prod_password
   ./import-db.sh -c -f /tmp/author_backup_*.tar.gz
   ```

4. **部署 API 和前端**
   ```bash
   # 按照 deploy/README.md 中的详细步骤
   ```

### 方案 2: Docker 部署

```bash
cd deploy

# 配置环境变量
cp .env.example .env
nano .env  # 编辑配置

# 启动服务
docker-compose -f docker-compose.prod.yml up -d
```

### 方案 3: 一键部署（新服务器）

```bash
# 在新服务器上执行
wget https://your-domain.com/deploy/quick-deploy.sh
sudo chmod +x quick-deploy.sh
sudo ./quick-deploy.sh
```

## 文件说明

### export-db.sh

导出 PostgreSQL 数据库的脚本。

**用法:**
```bash
./export-db.sh <输出目录> [数据库名] [主机] [端口] [用户名]
```

**环境变量:**
- `DB_HOST` - 数据库主机 (默认: localhost)
- `DB_PORT` - 数据库端口 (默认: 5432)
- `DB_NAME` - 数据库名 (默认: author)
- `DB_USER` - 用户名 (默认: scubiry)
- `DB_PASSWORD` - 密码

**示例:**
```bash
export DB_PASSWORD=mypassword
./export-db.sh ./backup
```

### import-db.sh

导入 PostgreSQL 数据库的脚本。

**用法:**
```bash
./import-db.sh [选项] <备份文件>
```

**选项:**
- `-h, --help` - 显示帮助
- `-s, --schema-only` - 仅导入结构
- `-d, --data-only` - 仅导入数据
- `-c, --create-db` - 如果不存在则创建数据库
- `-f, --force` - 跳过确认提示

**示例:**
```bash
export DB_PASSWORD=mypassword
./import-db.sh -c -f author_full_20240324_120000.sql
```

### docker-compose.prod.yml

Docker Compose 生产配置，包含：
- PostgreSQL (with pgvector)
- API Server (Node.js)
- Web Frontend (Nginx)

## 数据迁移清单

迁移前检查：

- [ ] 导出开发数据库
- [ ] 备份文件已传输到服务器
- [ ] 服务器 PostgreSQL 已安装
- [ ] 生产环境变量已配置
- [ ] API 密钥已更新为生产值

迁移后检查：

- [ ] 数据库导入成功
- [ ] 表数量和记录数正确
- [ ] API 服务启动成功
- [ ] 健康检查通过 (`/health`)
- [ ] 前端页面正常访问
- [ ] 登录/认证功能正常

## 环境变量说明

| 变量 | 必需 | 说明 |
|------|------|------|
| `DB_HOST` | 是 | 数据库主机 |
| `DB_PORT` | 是 | 数据库端口 |
| `DB_NAME` | 是 | 数据库名 |
| `DB_USER` | 是 | 数据库用户 |
| `DB_PASSWORD` | 是 | 数据库密码 |
| `ADMIN_API_KEY` | 是 | API 认证密钥 |
| `KIMI_API_KEY` | 否 | Kimi API 密钥 |
| `CLAUDE_API_KEY` | 否 | Claude API 密钥 |
| `OPENAI_API_KEY` | 否 | OpenAI API 密钥 |
| `TAVILY_API_KEY` | 否 | Tavily 搜索 API |
| `SERPER_API_KEY` | 否 | Serper 搜索 API |

## 故障排除

### 数据库连接失败
```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql

# 检查连接
psql -U postgres -d author -c "SELECT 1;"
```

### 权限错误
```bash
# 修复脚本权限
chmod +x deploy/*.sh

# 修复数据库权限
sudo chown -R postgres:postgres /var/lib/postgresql
```

### 端口冲突
```bash
# 检查端口占用
sudo lsof -i :3000
sudo lsof -i :5432

# 修改端口
export PORT=3001
```

## 支持

- 文档: [deploy/README.md](./README.md)
- 问题: 提交到 GitHub Issues
- 邮件: support@your-domain.com
