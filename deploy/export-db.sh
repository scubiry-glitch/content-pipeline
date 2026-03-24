#!/bin/bash
# 数据库导出脚本
# 用于导出生产环境 PostgreSQL 数据库

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Content Pipeline Database Export Tool${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查参数
if [ "$#" -lt 1 ]; then
    echo -e "${YELLOW}Usage: $0 <output_directory> [database_name] [host] [port] [username]${NC}"
    echo ""
    echo "Example:"
    echo "  $0 ./backup"
    echo "  $0 ./backup author localhost 5432 postgres"
    echo ""
    echo "Environment variables (optional):"
    echo "  DB_HOST       - Database host (default: localhost)"
    echo "  DB_PORT       - Database port (default: 5432)"
    echo "  DB_NAME       - Database name (default: author)"
    echo "  DB_USER       - Database username (default: scubiry)"
    echo "  DB_PASSWORD   - Database password"
    exit 1
fi

OUTPUT_DIR="$1"
DB_NAME="${2:-${DB_NAME:-author}}"
DB_HOST="${3:-${DB_HOST:-localhost}}"
DB_PORT="${4:-${DB_PORT:-5432}}"
DB_USER="${5:-${DB_USER:-scubiry}}"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 设置导出文件名
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCHEMA_FILE="$OUTPUT_DIR/author_schema_${TIMESTAMP}.sql"
DATA_FILE="$OUTPUT_DIR/author_data_${TIMESTAMP}.sql"
FULL_FILE="$OUTPUT_DIR/author_full_${TIMESTAMP}.sql"
METADATA_FILE="$OUTPUT_DIR/export_metadata_${TIMESTAMP}.txt"

echo -e "${YELLOW}Export Configuration:${NC}"
echo "  Database: $DB_NAME"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Output Directory: $OUTPUT_DIR"
echo ""

# 检查 pg_dump 是否可用
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}Error: pg_dump not found. Please install PostgreSQL client tools.${NC}"
    exit 1
fi

# 检查数据库连接
echo -e "${YELLOW}Testing database connection...${NC}"
if ! PGPASSWORD="${DB_PASSWORD}" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to database. Please check:${NC}"
    echo "  - Database server is running"
    echo "  - Connection parameters are correct"
    echo "  - Password is set (DB_PASSWORD environment variable)"
    exit 1
fi
echo -e "${GREEN}Database connection successful!${NC}"
echo ""

# 导出数据库结构
echo -e "${YELLOW}Exporting database schema...${NC}"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    > "$SCHEMA_FILE"

echo -e "${GREEN}Schema exported to: $SCHEMA_FILE${NC}"

# 导出数据（排除大表和日志表）
echo -e "${YELLOW}Exporting database data...${NC}"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --data-only \
    --no-owner \
    --no-privileges \
    --disable-triggers \
    --exclude-table='audit_logs' \
    --exclude-table='pg_stat_*' \
    > "$DATA_FILE"

echo -e "${GREEN}Data exported to: $DATA_FILE${NC}"

# 导出完整数据库（结构和数据）
echo -e "${YELLOW}Exporting full database backup...${NC}"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --exclude-table='audit_logs' \
    > "$FULL_FILE"

echo -e "${GREEN}Full backup exported to: $FULL_FILE${NC}"

# 生成元数据
echo -e "${YELLOW}Generating metadata...${NC}"
cat > "$METADATA_FILE" << EOF
Content Pipeline Database Export
================================
Export Date: $(date)
Timestamp: $TIMESTAMP

Database Information:
  - Database Name: $DB_NAME
  - Host: $DB_HOST
  - Port: $DB_PORT
  - Username: $DB_USER

Exported Files:
  1. Schema Only: $(basename "$SCHEMA_FILE") ($(stat -f%z "$SCHEMA_FILE" 2>/dev/null || stat -c%s "$SCHEMA_FILE" 2>/dev/null) bytes)
  2. Data Only: $(basename "$DATA_FILE") ($(stat -f%z "$DATA_FILE" 2>/dev/null || stat -c%s "$DATA_FILE" 2>/dev/null) bytes)
  3. Full Backup: $(basename "$FULL_FILE") ($(stat -f%z "$FULL_FILE" 2>/dev/null || stat -c%s "$FULL_FILE" 2>/dev/null) bytes)

Tables:
EOF

# 获取表列表
PGPASSWORD="${DB_PASSWORD}" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT schemaname || '.' || tablename || ' (' || pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) || ')' FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;" \
    >> "$METADATA_FILE" 2>/dev/null || echo "  (Table list unavailable)" >> "$METADATA_FILE"

echo -e "${GREEN}Metadata saved to: $METADATA_FILE${NC}"
echo ""

# 创建压缩包
echo -e "${YELLOW}Creating compressed archive...${NC}"
cd "$OUTPUT_DIR"
tar -czf "author_backup_${TIMESTAMP}.tar.gz" "$(basename "$SCHEMA_FILE")" "$(basename "$DATA_FILE")" "$(basename "$FULL_FILE")" "$(basename "$METADATA_FILE")"
echo -e "${GREEN}Archive created: author_backup_${TIMESTAMP}.tar.gz${NC}"
echo ""

# 输出摘要
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Export Completed Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Files created in: $OUTPUT_DIR"
echo "  - author_schema_${TIMESTAMP}.sql     (Structure only)"
echo "  - author_data_${TIMESTAMP}.sql       (Data only)"
echo "  - author_full_${TIMESTAMP}.sql       (Structure + Data)"
echo "  - author_backup_${TIMESTAMP}.tar.gz  (Compressed archive)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Copy the backup files to your server"
echo "  2. Use import-db.sh to restore the database"
echo "  3. Update your production .env file"
echo ""
