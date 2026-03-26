#!/usr/bin/env node
// ============================================
// v6.2 Assets AI 批量处理 - 数据库迁移脚本
// ============================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  console.log('🚀 Starting v6.2 Assets AI migration...\n');

  try {
    // 读取 schema.sql 文件
    const schemaPath = join(__dirname, '../services/assets-ai/schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');

    // 使用正则表达式分割 SQL 语句
    // 匹配 CREATE TABLE, CREATE INDEX, ALTER TABLE, DROP INDEX 等语句
    const statementRegex = /(?:CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP INDEX)[\s\S]*?;/gi;
    const statements = schemaSql.match(statementRegex) || [];

    // 额外处理：获取函数定义（如果有）
    const functionRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?LANGUAGE\s+\w+\s*;/gi;
    const functions = schemaSql.match(functionRegex) || [];
    
    const allStatements = [...statements, ...functions];

    console.log(`Found ${allStatements.length} SQL statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allStatements.length; i++) {
      const statement = allStatements[i].trim();
      const firstLine = statement.split('\n')[0].trim();
      
      try {
        await query(statement);
        successCount++;
        console.log(`✅ [${i + 1}/${allStatements.length}] ${firstLine.slice(0, 60)}...`);
      } catch (error: any) {
        // 忽略 "已存在" 错误
        if (error.message?.includes('already exists') || 
            error.message?.includes('duplicate') ||
            error.code === '42701' || // column already exists
            error.code === '42P07' || // relation already exists
            error.code === '42P16') { // index already exists
          skipCount++;
          console.log(`⏭️  [${i + 1}/${allStatements.length}] ${firstLine.slice(0, 60)}... (already exists)`);
        } else {
          errorCount++;
          console.error(`❌ [${i + 1}/${allStatements.length}] ${firstLine.slice(0, 60)}...`);
          console.error(`   Error: ${error.message}`);
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log('='.repeat(50));

    if (errorCount === 0) {
      console.log('\n✨ Migration completed successfully!');
      
      // 显示创建的表
      console.log('\n📋 Created/Updated tables:');
      const tables = [
        'asset_ai_analysis',
        'asset_content_chunks', 
        'asset_embeddings',
        'asset_similarity_groups',
      ];
      for (const table of tables) {
        console.log(`   - ${table}`);
      }
      
      console.log('\n📋 Extended tables:');
      console.log('   - assets (added ai_* columns)');
      console.log('   - ai_task_recommendations (added source_type, source_asset_id)');
      
      process.exit(0);
    } else {
      console.error(`\n⚠️  Migration completed with ${errorCount} errors`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// 运行迁移
runMigration();
