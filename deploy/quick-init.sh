#!/bin/bash
# ==========================================
# Content Pipeline - Quick Database Init
# ==========================================
# 快速初始化脚本 - 适用于首次部署
# 自动完成：创建用户 → 创建数据库 → 导入数据

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Content Pipeline - Quick Init${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查参数
if [ "$#" -lt 1 ]; then
    echo -e "${YELLOW}Usage: $0 <sql_file> [database_name] [username]${NC}"
    echo ""
    echo "Examples:"
    echo "  $0 ./backup/author_export.sql"
    echo "  $0 ./backup/author_export.sql mydb myuser"
    echo ""
    echo "Environment variables:"
    echo "  DB_PASSWORD         - Database user password"
    echo "  POSTGRES_PASSWORD   - PostgreSQL superuser password"
    exit 1
fi

SQL_FILE="$1"
DB_NAME="${2:-author}"
DB_USER="${3:-pipeline}"
DB_PASSWORD="${DB_PASSWORD:-pipeline123}"

# 检查文件
if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}Error: SQL file not found: $SQL_FILE${NC}"
    exit 1
fi

# 如果没有设置 postgres 密码，提示输入
if [ -z "$POSTGRES_PASSWORD" ]; then
    echo -e "${YELLOW}Enter PostgreSQL superuser (postgres) password:${NC}"
    read -s POSTGRES_PASSWORD
    echo ""
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

echo -e "${YELLOW}Initializing database...${NC}"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo "  File:     $SQL_FILE"
echo ""

# 1. 创建用户
echo -e "${YELLOW}[1/4] Creating user...${NC}"
psql -U postgres -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true
psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
psql -U postgres -c "ALTER USER $DB_USER WITH SUPERUSER;"
echo -e "${GREEN}✓ User created${NC}"

# 2. 创建数据库
echo -e "${YELLOW}[2/4] Creating database...${NC}"
psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
echo -e "${GREEN}✓ Database created${NC}"

# 3. 启用扩展
echo -e "${YELLOW}[3/4] Enabling extensions...${NC}"
psql -U postgres -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql -U postgres -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";"
psql -U postgres -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"vector\";" 2>/dev/null || true
echo -e "${GREEN}✓ Extensions enabled${NC}"

# 4. 导入数据
echo -e "${YELLOW}[4/4] Importing data...${NC}"
psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo -e "${GREEN}✓ Data imported${NC}"

# 验证
echo ""
echo -e "${YELLOW}Verifying...${NC}"
TABLES=$(psql -U postgres -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
TASKS=$(psql -U postgres -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM tasks;" 2>/dev/null || echo "0")

echo -e "${GREEN}✓ Tables: $TABLES, Tasks: $TASKS${NC}"

# 完成
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Initialization Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Database URL:${NC}"
echo "  postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo -e "${YELLOW}Update your .env file:${NC}"
echo "  DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
