#!/bin/bash
# 数据库导入脚本
# 用于在生产服务器上恢复 PostgreSQL 数据库

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Content Pipeline Database Import Tool${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 显示帮助
show_help() {
    echo -e "${YELLOW}Usage: $0 [options] <backup_file>${NC}"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -s, --schema-only       Import only schema (no data)"
    echo "  -d, --data-only         Import only data (existing schema)"
    echo "  -c, --create-db         Create database if not exists"
    echo "  -f, --force             Skip confirmation prompts"
    echo ""
    echo "Environment variables:"
    echo "  DB_HOST       - Database host (default: localhost)"
    echo "  DB_PORT       - Database port (default: 5432)"
    echo "  DB_NAME       - Database name (default: author)"
    echo "  DB_USER       - Database username (default: postgres)"
    echo "  DB_PASSWORD   - Database password"
    echo ""
    echo "Examples:"
    echo "  $0 ./author_full_20240324_120000.sql"
    echo "  $0 -c ./author_schema_20240324_120000.sql"
    echo "  DB_PASSWORD=mypassword $0 -f ./author_backup.tar.gz"
}

# 默认参数
SCHEMA_ONLY=false
DATA_ONLY=false
CREATE_DB=false
FORCE=false
BACKUP_FILE=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -s|--schema-only)
            SCHEMA_ONLY=true
            shift
            ;;
        -d|--data-only)
            DATA_ONLY=true
            shift
            ;;
        -c|--create-db)
            CREATE_DB=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# 检查备份文件
if [ -z "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: No backup file specified${NC}"
    show_help
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

# 数据库连接参数
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-author}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo -e "${YELLOW}Import Configuration:${NC}"
echo "  Database: $DB_NAME"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Backup File: $BACKUP_FILE"
echo "  Schema Only: $SCHEMA_ONLY"
echo "  Data Only: $DATA_ONLY"
echo "  Create DB: $CREATE_DB"
echo ""

# 确认提示
if [ "$FORCE" = false ]; then
    echo -e "${RED}WARNING: This will overwrite existing data in database '$DB_NAME'${NC}"
    echo -e "${YELLOW}Are you sure you want to continue? (yes/no)${NC}"
    read -r confirmation
    if [ "$confirmation" != "yes" ]; then
        echo "Import cancelled."
        exit 0
    fi
    echo ""
fi

# 检查必要的命令
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql not found. Please install PostgreSQL client tools.${NC}"
    exit 1
fi

# 处理压缩文件
SQL_FILE="$BACKUP_FILE"
CLEANUP=false

if [[ "$BACKUP_FILE" == *.tar.gz ]]; then
    echo -e "${YELLOW}Extracting compressed archive...${NC}"
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
    
    # 查找 SQL 文件（优先使用 full，然后是 schema+data）
    if [ "$SCHEMA_ONLY" = true ]; then
        SQL_FILE=$(find "$TEMP_DIR" -name "*schema*.sql" | head -1)
    elif [ "$DATA_ONLY" = true ]; then
        SQL_FILE=$(find "$TEMP_DIR" -name "*data*.sql" | head -1)
    else
        SQL_FILE=$(find "$TEMP_DIR" -name "*full*.sql" | head -1)
        if [ -z "$SQL_FILE" ]; then
            SQL_FILE=$(find "$TEMP_DIR" -name "*.sql" | head -1)
        fi
    fi
    
    if [ -z "$SQL_FILE" ]; then
        echo -e "${RED}Error: No SQL file found in archive${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
    
    CLEANUP=true
    echo -e "${GREEN}Extracted: $(basename "$SQL_FILE")${NC}"
    echo ""
fi

# 创建数据库
if [ "$CREATE_DB" = true ]; then
    echo -e "${YELLOW}Creating database if not exists...${NC}"
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d postgres \
        -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo -e "${YELLOW}Database already exists or creation skipped${NC}"
    echo ""
fi

# 启用必要的扩展
echo -e "${YELLOW}Enabling PostgreSQL extensions...${NC}"
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>/dev/null || echo -e "${YELLOW}Extension may already exist${NC}"

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";" 2>/dev/null || true

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "CREATE EXTENSION IF NOT EXISTS \"vector\";" 2>/dev/null || echo -e "${YELLOW}pgvector extension not available (optional)${NC}"

echo ""

# 导入数据
echo -e "${YELLOW}Starting database import...${NC}"
echo -e "${BLUE}This may take a few minutes depending on the database size.${NC}"
echo ""

# 设置导入选项
IMPORT_OPTS=""
if [ "$SCHEMA_ONLY" = true ]; then
    IMPORT_OPTS="--schema-only"i

# 执行导入
if PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 \
    -f "$SQL_FILE"; then
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Import Completed Successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Database: $DB_NAME"
    echo "Imported from: $BACKUP_FILE"
    echo ""
    
    # 显示表统计
    echo -e "${YELLOW}Table Statistics:${NC}"
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -c "SELECT schemaname || '.' || tablename as table, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;" 2>/dev/null || echo "  (Statistics unavailable)"
    echo ""
    
    # 验证关键表
    echo -e "${YELLOW}Verifying key tables...${NC}"
    KEY_TABLES=("tasks" "assets" "experts" "blue_team_reviews")
    for table in "${KEY_TABLES[@]}"; do
        count=$(PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
        echo "  $table: $(echo $count | xargs) rows"
    done
    echo ""
    
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Update your API server .env file with production database credentials"
    echo "  2. Restart the API server"
    echo "  3. Run health check: curl http://your-server:3000/health"
    echo ""
    
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  Import Failed!${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Please check:"
    echo "  - Database connection parameters"
    echo "  - Password is correct"
    echo "  - Database user has sufficient privileges"
    echo "  - SQL file is not corrupted"
    exit 1
fi

# 清理临时文件
if [ "$CLEANUP" = true ]; then
    rm -rf "$TEMP_DIR"
fi

echo -e "${GREEN}Done!${NC}"
