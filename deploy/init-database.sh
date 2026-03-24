#!/bin/bash
# ==========================================
# Content Pipeline - Database Initialization
# ==========================================
# 用途：在新服务器上初始化数据库并导入数据
# 功能：
#   1. 创建 PostgreSQL 用户
#   2. 创建数据库
#   3. 启用扩展
#   4. 导入数据
#   5. 设置权限
#
# 用法：
#   ./init-database.sh [选项] <sql_file>
#
# 示例：
#   # 使用环境变量
#   export DB_PASSWORD=mypassword
#   ./init-database.sh ./backup/author_export_*.sql
#
#   # 使用命令行参数
#   ./init-database.sh -u pipeline -p mypassword -d author ./backup/author_export_*.sql

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 默认配置
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-author}"
DB_USER="${DB_USER:-pipeline}"
DB_PASSWORD="${DB_PASSWORD:-}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
SQL_FILE=""
FORCE=false
VERBOSE=false

# 显示帮助
show_help() {
    echo -e "${GREEN}Content Pipeline - Database Initialization${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC} $0 [options] <sql_file>"
    echo ""
    echo "Options:"
    echo "  -h, --help              显示帮助信息"
    echo "  -H, --host HOST         数据库主机 (默认: localhost)"
    echo "  -P, --port PORT         数据库端口 (默认: 5432)"
    echo "  -d, --database NAME     数据库名 (默认: author)"
    echo "  -u, --user USERNAME     应用用户名 (默认: pipeline)"
    echo "  -p, --password PASS     应用用户密码"
    echo "  -s, --superuser USER    PostgreSQL 超级用户 (默认: postgres)"
    echo "  -S, --superpass PASS    PostgreSQL 超级用户密码"
    echo "  -f, --force             强制重新创建（删除已有数据库）"
    echo "  -v, --verbose           显示详细输出"
    echo ""
    echo "Environment Variables:"
    echo "  DB_HOST                 数据库主机"
    echo "  DB_PORT                 数据库端口"
    echo "  DB_NAME                 数据库名"
    echo "  DB_USER                 应用用户名"
    echo "  DB_PASSWORD             应用用户密码"
    echo "  POSTGRES_USER           PostgreSQL 超级用户"
    echo "  POSTGRES_PASSWORD       PostgreSQL 超级用户密码"
    echo ""
    echo "Examples:"
    echo "  $0 ./backup/author_export.sql"
    echo "  $0 -u myuser -p mypass -d mydb ./backup/author_export.sql"
    echo "  $0 -f -v ./backup/author_export.sql"
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -H|--host)
            DB_HOST="$2"
            shift 2
            ;;
        -P|--port)
            DB_PORT="$2"
            shift 2
            ;;
        -d|--database)
            DB_NAME="$2"
            shift 2
            ;;
        -u|--user)
            DB_USER="$2"
            shift 2
            ;;
        -p|--password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        -s|--superuser)
            POSTGRES_USER="$2"
            shift 2
            ;;
        -S|--superpass)
            POSTGRES_PASSWORD="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_help
            exit 1
            ;;
        *)
            SQL_FILE="$1"
            shift
            ;;
    esac
done

# 检查 SQL 文件
if [ -z "$SQL_FILE" ]; then
    echo -e "${RED}Error: No SQL file specified${NC}"
    show_help
    exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}Error: SQL file not found: $SQL_FILE${NC}"
    exit 1
fi

# 如果没有设置密码，提示输入
if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Enter password for database user '${DB_USER}':${NC}"
    read -s DB_PASSWORD
    echo ""
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
    echo -e "${YELLOW}Enter password for PostgreSQL superuser '${POSTGRES_USER}':${NC}"
    read -s POSTGRES_PASSWORD
    echo ""
fi

# PostgreSQL 连接字符串
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $POSTGRES_USER"

# 输出配置
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Database Initialization${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Database Host: $DB_HOST"
echo "  Database Port: $DB_PORT"
echo "  Database Name: $DB_NAME"
echo "  App User:      $DB_USER"
echo "  Superuser:     $POSTGRES_USER"
echo "  SQL File:      $SQL_FILE"
echo "  Force Mode:    $FORCE"
echo ""

# 检查 PostgreSQL 连接
echo -e "${YELLOW}[1/6] Checking PostgreSQL connection...${NC}"
if ! $PSQL -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to PostgreSQL${NC}"
    echo "Please check:"
    echo "  - PostgreSQL is running: sudo systemctl status postgresql"
    echo "  - Connection parameters are correct"
    echo "  - Password is correct"
    exit 1
fi
echo -e "${GREEN}✓ Connected to PostgreSQL${NC}"
echo ""

# 检查数据库是否存在
echo -e "${YELLOW}[2/6] Checking database...${NC}"
DB_EXISTS=$($PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    if [ "$FORCE" = true ]; then
        echo -e "${YELLOW}Database '$DB_NAME' exists, dropping...${NC}"
        $PSQL -c "DROP DATABASE IF EXISTS $DB_NAME;"
        echo -e "${GREEN}✓ Database dropped${NC}"
    else
        echo -e "${YELLOW}Database '$DB_NAME' already exists.${NC}"
        echo -e "${YELLOW}Use -f or --force to recreate, or choose a different name.${NC}"
        exit 1
    fi
fi
echo ""

# 创建用户
echo -e "${YELLOW}[3/6] Creating database user...${NC}"
USER_EXISTS=$($PSQL -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null || echo "0")

if [ "$USER_EXISTS" = "1" ]; then
    echo -e "${YELLOW}User '$DB_USER' already exists, updating password...${NC}"
    $PSQL -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
else
    echo -e "${YELLOW}Creating user '$DB_USER'...${NC}"
    $PSQL -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
fi

# 授予用户权限
$PSQL -c "ALTER USER $DB_USER WITH SUPERUSER;" 2>/dev/null || \
$PSQL -c "ALTER USER $DB_USER WITH CREATEDB CREATEROLE;"

echo -e "${GREEN}✓ User '$DB_USER' ready${NC}"
echo ""

# 创建数据库
echo -e "${YELLOW}[4/6] Creating database...${NC}"
$PSQL -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
echo -e "${GREEN}✓ Database '$DB_NAME' created${NC}"
echo ""

# 启用扩展
echo -e "${YELLOW}[5/6] Enabling extensions...${NC}"
$PSQL -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
$PSQL -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";"

# 尝试启用 pgvector（可选）
$PSQL -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"vector\";" 2>/dev/null || \
    echo -e "${YELLOW}⚠ pgvector extension not available (optional)${NC}"

echo -e "${GREEN}✓ Extensions enabled${NC}"
echo ""

# 导入数据
echo -e "${YELLOW}[6/6] Importing data...${NC}"
echo -e "${BLUE}This may take a few minutes depending on the database size.${NC}"
echo ""

if [ "$VERBOSE" = true ]; then
    # 详细模式
    $PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
else
    # 静默模式，显示进度
    $PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SQL_FILE" 2>&1 | \
        while read line; do
            if [[ $line == *"INSERT"* ]] || [[ $line == *"CREATE"* ]] || [[ $line == *"ALTER"* ]]; then
                echo -n "."
            fi
        done
    echo ""
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Data imported successfully${NC}"
else
    echo -e "${RED}✗ Data import failed${NC}"
    exit 1
fi
echo ""

# 验证导入
echo -e "${YELLOW}Verifying import...${NC}"
TABLE_COUNT=$($PSQL -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
TASK_COUNT=$($PSQL -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM tasks;" 2>/dev/null || echo "0")
ASSET_COUNT=$($PSQL -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM assets;" 2>/dev/null || echo "0")

echo -e "${GREEN}✓ Import verified:${NC}"
echo "  Tables:     $TABLE_COUNT"
echo "  Tasks:      $TASK_COUNT"
echo "  Assets:     $ASSET_COUNT"
echo ""

# 设置权限
echo -e "${YELLOW}Setting permissions...${NC}"
$PSQL -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;"
$PSQL -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;"
$PSQL -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;"
$PSQL -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;"
echo -e "${GREEN}✓ Permissions granted to '$DB_USER'${NC}"
echo ""

# 清理
echo -e "${YELLOW}Cleaning up...${NC}"
# 移除超级用户权限（安全考虑）
$PSQL -c "ALTER USER $DB_USER WITH NOSUPERUSER;" 2>/dev/null || true

echo -e "${GREEN}✓ Cleanup completed${NC}"
echo ""

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Database Initialization Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Database Information:${NC}"
echo "  Host:     $DB_HOST"
echo "  Port:     $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USER"
echo "  Password: $(echo $DB_PASSWORD | cut -c1-3)***"
echo ""
echo -e "${YELLOW}Connection String:${NC}"
echo "  postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Update api/.env with the database credentials"
echo "  2. Start the API server: npm run start"
echo "  3. Verify: curl http://localhost:3000/health"
echo ""
echo -e "${YELLOW}Backup created at:${NC}"
echo "  $SQL_FILE"
echo ""
