# 数据库初始化导入脚本

本文档说明如何使用数据库初始化脚本在新服务器上部署 Content Pipeline。

## 脚本列表

| 脚本 | 用途 | 适用场景 |
|------|------|----------|
| `init-database.sh` | 完整的初始化脚本 | 生产环境，需要精细控制 |
| `quick-init.sh` | 快速初始化 | 开发/测试环境，快速部署 |
| `import-db.sh` | 仅导入数据 | 数据库已存在，只需导入 |

---

## 快速开始（推荐）

### 1. 传输备份文件到服务器

```bash
# 从开发机传输到服务器
scp deploy/backup/author_backup_*.tar.gz user@server:/tmp/
scp deploy/init-database.sh user@server:/tmp/

# SSH 登录服务器
ssh user@server
cd /tmp
tar -xzf author_backup_*.tar.gz
```

### 2. 运行初始化脚本

#### 方式 A：快速初始化（推荐测试环境）

```bash
cd /tmp
chmod +x quick-init.sh

# 使用默认配置（数据库: author, 用户: pipeline）
export POSTGRES_PASSWORD=your_postgres_password
./quick-init.sh author_export_*.sql

# 或自定义数据库名和用户名
./quick-init.sh author_export_*.sql mydb myuser
```

#### 方式 B：完整初始化（推荐生产环境）

```bash
cd /tmp
chmod +x init-database.sh

# 基本用法
export DB_PASSWORD=myapp_password
export POSTGRES_PASSWORD=postgres_password
./init-database.sh ./author_export_*.sql

# 自定义所有参数
./init-database.sh \
    -H localhost \
    -P 5432 \
    -d author \
    -u pipeline \
    -p mypassword \
    -s postgres \
    -S postgres_password \
    ./author_export_*.sql
```

#### 方式 C：仅导入数据（数据库已存在）

```bash
export DB_PASSWORD=mypassword
./import-db.sh -f ./author_export_*.sql
```

---

## 脚本详细说明

### init-database.sh

功能最完整的初始化脚本，支持：

- ✅ 自动创建数据库用户
- ✅ 创建数据库并设置所有者
- ✅ 启用必需扩展（uuid-ossp, pg_trgm, vector）
- ✅ 导入 SQL 数据
- ✅ 设置权限
- ✅ 验证导入结果
- ✅ 支持强制重建（-f）

**参数说明：**

```bash
./init-database.sh [选项] <sql_file>

选项：
  -h, --help              显示帮助
  -H, --host HOST         数据库主机 (默认: localhost)
  -P, --port PORT         数据库端口 (默认: 5432)
  -d, --database NAME     数据库名 (默认: author)
  -u, --user USERNAME     应用用户名 (默认: pipeline)
  -p, --password PASS     应用用户密码
  -s, --superuser USER    PostgreSQL 超级用户 (默认: postgres)
  -S, --superpass PASS    PostgreSQL 超级用户密码
  -f, --force             强制重新创建（删除已有数据库）
  -v, --verbose           显示详细输出
```

**环境变量：**

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=author
export DB_USER=pipeline
export DB_PASSWORD=mypassword
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres_password
```

**示例：**

```bash
# 基础用法
./init-database.sh ./backup/author_export.sql

# 生产环境推荐
./init-database.sh \
    -d production_db \
    -u app_user \
    -p 'StrongP@ssw0rd!' \
    -f \
    -v \
    ./backup/author_export.sql
```

---

### quick-init.sh

最简单的初始化脚本，适合快速部署。

**特点：**
- 使用 postgres 用户执行
- 自动删除并重建数据库
- 默认密码：`pipeline123`

**用法：**

```bash
# 默认配置
./quick-init.sh ./backup/author_export.sql

# 自定义数据库名和用户名
./quick-init.sh ./backup/author_export.sql mydb myuser
```

**修改默认密码：**

```bash
export DB_PASSWORD=my_password
export POSTGRES_PASSWORD=postgres_password
./quick-init.sh ./backup/author_export.sql
```

---

### import-db.sh

仅导入数据到已有数据库。

**适用场景：**
- 数据库已创建，只需要导入数据
- 更新现有数据库

**用法：**

```bash
# 基础导入
./import-db.sh ./backup/author_export.sql

# 强制导入（跳过确认）
./import-db.sh -f ./backup/author_export.sql

# 仅导入结构
./import-db.sh -s ./backup/author_schema.sql

# 仅导入数据
./import-db.sh -d ./backup/author_data.sql
```

---

## 完整部署流程

### 步骤 1：准备服务器

```bash
# 安装 PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# 启动 PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 设置 postgres 密码
sudo -u postgres psql -c "\password postgres"
```

### 步骤 2：上传并解压备份

```bash
# 在开发机
scp deploy/backup/author_backup_*.tar.gz server:/tmp/
scp deploy/init-database.sh server:/tmp/

# 在服务器
cd /tmp
tar -xzf author_backup_*.tar.gz
```

### 步骤 3：初始化数据库

```bash
cd /tmp
chmod +x init-database.sh

export POSTGRES_PASSWORD=your_postgres_password
export DB_PASSWORD=your_app_password

./init-database.sh -v author_export_*.sql
```

### 步骤 4：验证

```bash
# 连接数据库
psql -U pipeline -d author -c "\dt"

# 检查任务数量
psql -U pipeline -d author -c "SELECT COUNT(*) FROM tasks;"

# 检查资产数量
psql -U pipeline -d author -c "SELECT COUNT(*) FROM assets;"
```

### 步骤 5：配置 API

```bash
cd /opt/content-pipeline/api

# 创建 .env 文件
cat > .env << EOF
# Database
DATABASE_URL=postgresql://pipeline:your_password@localhost:5432/author

# Auth
ADMIN_API_KEY=your_secure_random_key

# Server
PORT=3000
NODE_ENV=production
EOF

# 启动服务
npm install --production
npm run build
pm2 start dist/index.js --name "content-pipeline-api"
```

---

## 常见问题

### 1. 密码错误

```bash
# 重置 postgres 密码
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'newpassword';"
```

### 2. 权限 denied

```bash
# 修改 pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf

# 修改这一行
local   all             all                                     peer
# 改为
local   all             all                                     md5

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

### 3. 数据库已存在

```bash
# 使用 -f 强制重建
./init-database.sh -f ./backup/author_export.sql

# 或手动删除
sudo -u postgres psql -c "DROP DATABASE author;"
```

### 4. 导入失败

```bash
# 检查 SQL 文件完整性
head -20 ./backup/author_export.sql

# 单独导入结构
./init-database.sh -s ./backup/author_schema.sql

# 然后导入数据
./import-db.sh -d ./backup/author_data.sql
```

---

## 安全建议

1. **修改默认密码**
   ```bash
   # 生产环境务必修改
   export DB_PASSWORD='Your-Strong-P@ssw0rd-Here'
   ```

2. **移除超级用户权限**
   ```bash
   sudo -u postgres psql -c "ALTER USER pipeline WITH NOSUPERUSER;"
   ```

3. **限制数据库访问**
   ```bash
   # 修改 pg_hba.conf，只允许本地访问
   local   author          pipeline                                md5
   host    author          pipeline        127.0.0.1/32            md5
   ```

---

## 验证清单

初始化完成后，检查以下项目：

- [ ] 数据库可以连接：`psql -U pipeline -d author -c "SELECT 1;"`
- [ ] 表数量正确：`\dt` 显示预期表数
- [ ] 任务数据完整：`SELECT COUNT(*) FROM tasks;`
- [ ] 资产数据完整：`SELECT COUNT(*) FROM assets;`
- [ ] API 可以连接：`curl http://localhost:3000/health`
