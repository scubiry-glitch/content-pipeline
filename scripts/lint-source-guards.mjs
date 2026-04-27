#!/usr/bin/env node
// scripts/lint-source-guards.mjs
//
// P0 后续守护：扫所有 axis computer 的 mn_* SQL，确保 DELETE / UPDATE / UPSERT
// 都带 source 守护（不会破坏 manual_import / human_edit / restored 的人工数据）。
//
// 触发：CI / pre-commit / 本地手跑 `node scripts/lint-source-guards.mjs`
//
// 检查规则（每个 axis computer 文件）：
//   1. 每个 `DELETE FROM mn_*` 同语句必须含 source 字符串（'llm_extracted' / 'manual_import'
//      / `source IN (...)` / `source NOT IN (...)` / `source =` / `source !=`）
//   2. 每个 `UPDATE mn_* SET` 同语句必须含 source 字符串（同上），允许 ON CONFLICT 写法的
//      `WHERE table.source NOT IN (...)` 守护，也允许 SELECT existing 时已 source 守护过
//   3. `INSERT INTO mn_* ... ON CONFLICT (...) DO UPDATE` 必须有 `WHERE ... source` 守护
//
// 退化：computer 完全不写 mn_* 的不检查；ingest/router 不在 axes/ 路径下，不在范围。
//
// 退出码：发现违规非 0；全过为 0。

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const AXES_DIR = join(REPO_ROOT, 'api/src/modules/meeting-notes/axes');
const AXIS_FOLDERS = ['people', 'projects', 'knowledge', 'meta'];

// SQL block 抓取：``` ` ``` 模板字符串里第一个动词到下一个 `` ` `` 之间。
// 简化处理：按行扫，identify SQL 起始行（含 DELETE FROM mn_ / UPDATE mn_ / INSERT INTO mn_ ...
// ON CONFLICT），把后续 N 行（直到分号或反引号）当一个 SQL 单元。
const SOURCE_RE = /\bsource\s*(=|!=|IN|NOT\s+IN|SET\s+source)/i;

function* extractSqlBlocks(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/(DELETE\s+FROM\s+mn_\w+|UPDATE\s+mn_\w+\s+SET|INSERT\s+INTO\s+mn_\w+)/i);
    if (!m) continue;
    // 收集这行 + 后续行直到见到反引号（模板字符串结束）或 SQL 终结符
    let block = line;
    let endIdx = i;
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      block += '\n' + lines[j];
      endIdx = j;
      if (lines[j].includes('`')) break;
      if (/^\s*\)\s*$/.test(lines[j])) break;
    }
    yield {
      verb: m[1].split(/\s+/)[0].toUpperCase(),
      table: (block.match(/mn_\w+/) ?? [''])[0],
      block,
      lineNo: i + 1,
      endLineNo: endIdx + 1,
    };
    i = endIdx;
  }
}

function findViolations(content, fileName) {
  const violations = [];
  for (const sql of extractSqlBlocks(content)) {
    // 1. DELETE：必须 block 里出现 source
    if (sql.verb === 'DELETE') {
      if (!SOURCE_RE.test(sql.block)) {
        violations.push({
          ...sql,
          rule: 'DELETE_WITHOUT_SOURCE_GUARD',
          hint: `DELETE FROM ${sql.table} 缺 source 守护，会删 manual_import 行。建议加 AND source = 'llm_extracted'`,
        });
      }
      continue;
    }

    // 2. UPDATE：必须 block 里出现 source（包括纯 UPDATE 和 ON CONFLICT DO UPDATE）
    if (sql.verb === 'UPDATE') {
      if (!SOURCE_RE.test(sql.block)) {
        violations.push({
          ...sql,
          rule: 'UPDATE_WITHOUT_SOURCE_GUARD',
          hint: `UPDATE ${sql.table} 缺 source 守护。建议在 SELECT existing 时加 AND source = 'llm_extracted'，或 UPDATE WHERE ... source != 'manual_import'`,
        });
      }
      continue;
    }

    // 3. INSERT ... ON CONFLICT DO UPDATE：必须有 source 守护
    if (sql.verb === 'INSERT') {
      const hasOnConflictUpdate = /ON\s+CONFLICT\b[\s\S]*?DO\s+UPDATE\s+SET/i.test(sql.block);
      if (hasOnConflictUpdate && !SOURCE_RE.test(sql.block)) {
        violations.push({
          ...sql,
          rule: 'UPSERT_WITHOUT_SOURCE_GUARD',
          hint: `UPSERT ${sql.table} 缺 source 守护，会覆盖 manual_import 单例行。建议加 WHERE ${sql.table}.source NOT IN ('manual_import','human_edit')`,
        });
      }
    }
  }
  return violations;
}

async function main() {
  let totalFiles = 0;
  const allViolations = [];

  for (const folder of AXIS_FOLDERS) {
    const dir = join(AXES_DIR, folder);
    const entries = await readdir(dir);
    for (const ent of entries) {
      if (!ent.endsWith('Computer.ts')) continue;
      const file = join(dir, ent);
      const content = await readFile(file, 'utf8');
      totalFiles += 1;
      const v = findViolations(content, ent);
      for (const item of v) {
        allViolations.push({ file: `${folder}/${ent}`, ...item });
      }
    }
  }

  console.log(`扫描了 ${totalFiles} 个 computer 文件`);
  if (allViolations.length === 0) {
    console.log('✓ 所有 mn_* DELETE / UPDATE / UPSERT 都带 source 守护');
    process.exit(0);
  }

  console.error(`✗ 发现 ${allViolations.length} 处 source 守护缺失：\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.lineNo}  [${v.rule}]`);
    console.error(`    ${v.hint}`);
    console.error(`    SQL block (lines ${v.lineNo}-${v.endLineNo}):`);
    for (const ln of v.block.split('\n').slice(0, 5)) {
      console.error(`      ${ln.trim()}`);
    }
    console.error('');
  }
  process.exit(1);
}

main().catch((e) => {
  console.error('lint failed:', e);
  process.exit(2);
});
