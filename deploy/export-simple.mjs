#!/usr/bin/env node
/**
 * Simple Database Export Script
 * Uses Node.js pg driver to export database without pg_dump version issues
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const outputDir = args[0] || path.join(__dirname, 'backup');

// Database configuration (match api/.env)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'author',
  user: process.env.DB_USER || 'scubiry',
  password: process.env.DB_PASSWORD || '',
};

console.log('========================================');
console.log('  Content Pipeline Database Export');
console.log('========================================');
console.log('');
console.log('Database:', dbConfig.database);
console.log('Host:', dbConfig.host);
console.log('User:', dbConfig.user);
console.log('Output:', outputDir);
console.log('');

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const outputFile = path.join(outputDir, `author_export_${timestamp}.sql`);

const client = new Client(dbConfig);

async function exportDatabase() {
  try {
    await client.connect();
    console.log('✓ Connected to database');
    
    let output = `-- Content Pipeline Database Export\n`;
    output += `-- Generated: ${new Date().toISOString()}\n`;
    output += `-- Database: ${dbConfig.database}\n`;
    output += `-- Host: ${dbConfig.host}\n`;
    output += `\n`;
    
    // Add extensions
    output += `-- Enable required extensions\n`;
    output += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n`;
    output += `CREATE EXTENSION IF NOT EXISTS "pg_trgm";\n`;
    output += `\n`;
    
    // Get all tables
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows;
    console.log(`Found ${tables.length} tables`);
    
    for (const table of tables) {
      const tableName = table.tablename;
      process.stdout.write(`Exporting ${tableName}... `);
      
      // Get table structure
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
        console.log('skipped (no columns)');
        continue;
      }
      
      // Create table statement
      output += `\n-- Table: ${tableName}\n`;
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
      
      // Get primary key
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
      
      // Get indexes
      const indexResult = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1 AND schemaname = 'public'
      `, [tableName]);
      
      for (const idx of indexResult.rows) {
        // Skip primary key indexes (already created)
        if (!idx.indexname.includes('pkey')) {
          output += `${idx.indexdef};\n`;
        }
      }
      
      // Export data
      try {
        const dataResult = await client.query(`SELECT * FROM ${tableName}`);
        if (dataResult.rows.length > 0) {
          output += `\n-- Data for ${tableName} (${dataResult.rows.length} rows)\n`;
          
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
        }
        console.log(`✓ (${dataResult.rows.length} rows)`);
      } catch (e) {
        console.log(`✓ (structure only: ${e.message})`);
      }
    }
    
    // Write output file
    fs.writeFileSync(outputFile, output);
    console.log('');
    console.log('========================================');
    console.log('Export Complete!');
    console.log('========================================');
    console.log('');
    console.log('Output file:', outputFile);
    console.log('File size:', (fs.statSync(outputFile).size / 1024).toFixed(2), 'KB');
    console.log('');
    console.log('To import on server:');
    console.log(`  psql -U postgres -d author < ${path.basename(outputFile)}`);
    
  } catch (error) {
    console.error('\n✗ Export failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

exportDatabase();
