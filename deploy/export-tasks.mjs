#!/usr/bin/env node
/**
 * 任务中心数据单独导出脚本
 * 导出任务相关的核心表
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 任务中心相关表
const TASK_TABLES = [
  'tasks',
  'pipeline_tasks',
  'production_tasks',
  'task_logs',
  'task_queue',
  'task_archives',
  'task_review_progress',
  'draft_versions',
  'draft_generation_progress',
  'draft_revision_progress',
  'draft_revisions',
  'draft_edits',
  'outline_versions',
  'outline_generation_progress',
  'outline_comments',
  'research_annotations',
  'research_reports',
  'blue_team_reviews',
  'expert_reviews',
  'review_chains',
  'review_reports',
  'question_decisions',
  'outputs'
];

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'author',
  user: process.env.DB_USER || 'scubiry',
  password: process.env.DB_PASSWORD || '',
};

const outputDir = process.argv[2] || path.join(__dirname, 'backup');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const outputFile = path.join(outputDir, `tasks_export_${timestamp}.sql`);

const client = new Client(dbConfig);

async function exportTasks() {
  try {
    await client.connect();
    console.log('========================================');
    console.log('  Task Center Export');
    console.log('========================================');
    console.log('');
    
    let output = `-- Content Pipeline - Task Center Export\n`;
    output += `-- Generated: ${new Date().toISOString()}\n`;
    output += `-- Tables: ${TASK_TABLES.join(', ')}\n`;
    output += `\n`;
    
    let totalRows = 0;
    let exportedTables = 0;
    
    for (const tableName of TASK_TABLES) {
      try {
        // 检查表是否存在
        const tableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )
        `, [tableName]);
        
        if (!tableCheck.rows[0].exists) {
          console.log(`⚠ Table ${tableName} does not exist, skipping`);
          continue;
        }
        
        // 获取表结构
        const structureResult = await client.query(`
          SELECT 
            column_name, 
            data_type, 
            character_maximum_length,
            column_default,
            is_nullable
          FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [tableName]);
        
        if (structureResult.rows.length === 0) {
          continue;
        }
        
        output += `\n-- ========================================\n`;
        output += `-- Table: ${tableName}\n`;
        output += `-- ========================================\n`;
        output += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n`;
        output += `CREATE TABLE ${tableName} (\n`;
        
        const columns = structureResult.rows.map(col => {
          let type = col.data_type;
          if (col.character_maximum_length) {
            type += `(${col.character_maximum_length})`;
          }
          let def = `  ${col.column_name} ${type}`;
          if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`;
          }
          if (col.is_nullable === 'NO') {
            def += ' NOT NULL';
          }
          return def;
        });
        
        output += columns.join(',\n');
        output += '\n);\n';
        
        // 获取主键
        const pkResult = await client.query(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = $1
            AND tc.constraint_type = 'PRIMARY KEY'
        `, [tableName]);
        
        if (pkResult.rows.length > 0) {
          const pkColumns = pkResult.rows.map(r => r.column_name).join(', ');
          output += `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkColumns});\n`;
        }
        
        // 导出数据
        const dataResult = await client.query(`SELECT * FROM ${tableName}`);
        if (dataResult.rows.length > 0) {
          output += `\n-- Data: ${dataResult.rows.length} rows\n`;
          
          for (const row of dataResult.rows) {
            const keys = Object.keys(row).join(', ');
            const values = Object.values(row).map(v => {
              if (v === null) return 'NULL';
              if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
              if (v instanceof Date) return `'${v.toISOString()}'`;
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
              return v;
            }).join(', ');
            
            output += `INSERT INTO ${tableName} (${keys}) VALUES (${values});\n`;
          }
          
          totalRows += dataResult.rows.length;
          console.log(`✓ ${tableName}: ${dataResult.rows.length} rows`);
        } else {
          console.log(`✓ ${tableName}: empty`);
        }
        
        exportedTables++;
        
      } catch (error) {
        console.error(`✗ ${tableName}: ${error.message}`);
      }
    }
    
    // 写入文件
    fs.writeFileSync(outputFile, output);
    
    console.log('');
    console.log('========================================');
    console.log('Export Complete!');
    console.log('========================================');
    console.log('');
    console.log(`Exported tables: ${exportedTables}`);
    console.log(`Total rows: ${totalRows}`);
    console.log(`Output file: ${outputFile}`);
    console.log(`File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
    console.log('');
    
  } catch (error) {
    console.error('Export failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

exportTasks();
