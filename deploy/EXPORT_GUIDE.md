# 数据库导出指南

由于本地 PostgreSQL 客户端版本可能与服务器版本不匹配，以下是几种导出数据库的方法。

## 方法 1: 使用 Postgres.app 自带的工具（推荐 macOS 用户）

```bash
# 找到 Postgres.app 的 pg_dump
/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump \
    -h localhost \
    -p 5432 \
    -U scubiry \
    -d author \
    --schema-only \
    --no-owner \
    --no-privileges \
    > deploy/backup/author_schema.sql

# 导出数据
/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump \
    -h localhost \
    -p 5432 \
    -U scubiry \
    -d author \
    --data-only \
    --no-owner \
    --no-privileges \
    > deploy/backup/author_data.sql
```

## 方法 2: 使用 psql 直接导出

```bash
# 导出表结构
psql -h localhost -U scubiry -d author -c "
SELECT 'CREATE TABLE ' || tablename || ' (' || 
       string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position) || 
       ');'
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY tablename;
" > deploy/backup/tables.sql
```

## 方法 3: 使用数据库管理工具

### TablePlus
1. 连接数据库
2. 选择 File > Export
3. 选择 SQL 格式
4. 勾选 Structure + Data

### DBeaver
1. 右键点击数据库
2. 选择 "Backup"
3. 选择格式为 "Plain"
4. 导出到文件

### pgAdmin
1. 右键点击数据库
2. 选择 "Backup..."
3. 选择格式为 "Plain"
4. 勾选 "Blobs" 和 "Pre-data" + "Data" + "Post-data"

## 方法 4: 使用 Docker

```bash
# 运行相同版本的 PostgreSQL 容器
docker run --rm -v $(pwd)/deploy/backup:/backup postgres:14-alpine \
    pg_dump \
    -h host.docker.internal \
    -p 5432 \
    -U scubiry \
    -d author \
    --no-owner \
    --no-privileges \
    > deploy/backup/author_full.sql
```

## 方法 5: 使用 Node.js 脚本

创建一个简单的导出脚本：

```javascript
// deploy/export-simple.js
const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'author',
  user: 'scubiry',
  password: '' // 如果需要
});

async function exportTables() {
  await client.connect();
  
  // 获取所有表
  const tables = await client.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  `);
  
  let output = '';
  
  for (const table of tables.rows) {
    const tableName = table.tablename;
    console.log(`Exporting ${tableName}...`);
    
    // 导出表结构
    const structure = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    
    output += `\n-- Table: ${tableName}\n`;
    output += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    
    const columns = structure.rows.map(col => {
      let type = col.data_type;
      if (col.character_maximum_length) {
        type += `(${col.character_maximum_length})`;
      }
      return `  ${col.column_name} ${type}`;
    });
    
    output += columns.join(',\n');
    output += '\n);\n';
    
    // 导出数据
    try {
      const data = await client.query(`SELECT * FROM ${tableName}`);
      if (data.rows.length > 0) {
        output += `\n-- Data for ${tableName}\n`;
        for (const row of data.rows) {
          const keys = Object.keys(row).join(', ');
          const values = Object.values(row).map(v => {
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            return v;
          }).join(', ');
          
          output += `INSERT INTO ${tableName} (${keys}) VALUES (${values});\n`;
        }
      }
    } catch (e) {
      console.warn(`Could not export data for ${tableName}: ${e.message}`);
    }
  }
  
  fs.writeFileSync('deploy/backup/author_export.sql', output);
  console.log('Export complete: deploy/backup/author_export.sql');
  
  await client.end();
}

exportTables().catch(console.error);
```

运行：
```bash
cd /Users/scubiry/Documents/Scubiry/lab/pipeline
node deploy/export-simple.js
```

## 推荐的导出策略

对于生产部署，推荐以下流程：

1. **开发环境**（本地）：
   ```bash
   # 使用本机工具导出
   pg_dump -h localhost -U scubiry -d author > backup.sql
   ```

2. **传输到生产服务器**：
   ```bash
   scp backup.sql user@production-server:/tmp/
   ```

3. **生产服务器导入**：
   ```bash
   # 使用服务器上的 psql 导入
   psql -U postgres -d author < /tmp/backup.sql
   ```

## 注意事项

1. **版本兼容性**：导出的 SQL 文件通常是向后兼容的，高版本导出的 SQL 可以在低版本 PostgreSQL 上运行

2. **pgvector 扩展**：如果使用了向量数据库，确保目标服务器安装了 pgvector 扩展：
   ```sql
   CREATE EXTENSION IF NOT EXISTS "vector";
   ```

3. **权限**：导入时可能需要调整表的所有者：
   ```sql
   ALTER TABLE tasks OWNER TO new_user;
   ```

4. **大数据量**：对于大数据库，建议使用压缩：
   ```bash
   pg_dump -h localhost -U scubiry -d author | gzip > backup.sql.gz
   gunzip < backup.sql.gz | psql -U postgres -d author
   ```
