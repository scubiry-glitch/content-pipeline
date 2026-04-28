#!/usr/bin/env node
// Migration 021 · concepts/mental-model/ 继续细分 (243 → 158 真概念)
//
// 在 020 之后, mental-model/ 还剩 243 个文件, 大致是:
//   concept       158  → 留 (真抽象 mental model)
//   metric         58  → concepts/metric/  (新 subtype)
//   technology     11  → concepts/technology/  (新 subtype)
//   location       10  → entities/location/  (新 subtype)
//   国家            2   → entities/location/
//   经济部门         1   → entities/location/
//   经济指标         2   → concepts/metric/
//   index           1   → concepts/metric/
//   人群分类         2   → 留 (社会学抽象)
//   人口统计         1   → 留
//
// 用法:
//   node api/migrations/021-split-mental-model-further.mjs              # dry-run
//   node api/migrations/021-split-mental-model-further.mjs --apply

import { readFileSync, existsSync } from 'node:fs';
import { readdir, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const wikiRoot = resolve(repoRoot, 'data', 'content-wiki', 'default');
const APPLY = process.argv.includes('--apply');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const grn = (s) => `\x1b[32m${s}\x1b[0m`;
const yel = (s) => `\x1b[33m${s}\x1b[0m`;

const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const pool = new pg.Pool({
  host: env.DB_HOST, port: parseInt(env.DB_PORT ?? '5432', 10),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});

function mapToTarget(entityType) {
  const t = String(entityType ?? '').toLowerCase();
  // 地理位置
  if (t === 'location' || t === '城市' || t === '城市类别' || t === '城市集合' ||
      t === '城市群' || t === '区域' || t === '国家' || t === '国家类别' ||
      t === '经济部门') {
    return { type: 'entity', subtype: 'location' };
  }
  // 指标 / 度量
  if (t === 'metric' || t === 'index' || t === '市场指标' || t === '经济指标' ||
      t === '市场模式' || t === '市场类别') {
    return { type: 'concept', subtype: 'metric' };
  }
  // 技术 / 产业链
  if (t === 'technology' || t === '技术' || t === '产业链' || t === '产业链环节' ||
      t === '行业' || t === '行业领域') {
    return { type: 'concept', subtype: 'technology' };
  }
  // 真概念 / 社会学等抽象 → 留 mental-model
  return null;
}

async function main() {
  console.log(bold('Migration 021 · concepts/mental-model/ 继续细分'));
  console.log(dim(`  apply: ${APPLY ? grn('YES') : yel('NO (dry-run)')}`));
  console.log();

  const dir = join(wikiRoot, 'concepts/mental-model');
  if (!existsSync(dir)) {
    console.log(yel('  concepts/mental-model/ 不存在, 跳过'));
    await pool.end();
    return;
  }
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name);
  console.log(`  待处理文件数: ${files.length}`);

  // 一次性拉 content_entities
  const er = await pool.query(`
    SELECT canonical_name, aliases, entity_type FROM content_entities
  `);
  const byName = new Map();
  for (const row of er.rows) {
    byName.set(String(row.canonical_name).toLowerCase(), row);
    for (const alias of row.aliases ?? []) {
      const k = String(alias).toLowerCase();
      if (!byName.has(k)) byName.set(k, row);
    }
  }

  const moves = [];
  const targetCounts = {};
  let kept = 0, no_match = 0;
  for (const f of files) {
    const baseName = f.replace(/\.md$/, '');
    const lookup = byName.get(baseName.toLowerCase());
    if (!lookup) { no_match++; continue; }
    const target = mapToTarget(lookup.entity_type);
    if (!target) { kept++; continue; }
    const targetKey = `${target.type}/${target.subtype}`;
    targetCounts[targetKey] = (targetCounts[targetKey] ?? 0) + 1;
    moves.push({
      oldPath: join(dir, f),
      newPath: join(wikiRoot, target.type === 'entity' ? `entities/${target.subtype}` : `concepts/${target.subtype}`, f),
      to: targetKey,
      entityType: lookup.entity_type,
      name: baseName,
    });
  }

  console.log();
  console.log(bold('§1. 汇总'));
  console.log(`  需移动:        ${moves.length}`);
  console.log(`  留 (真概念):   ${kept}`);
  console.log(`  未命中 (留):   ${no_match}`);
  console.log();
  console.log(bold('§2. 目标分布'));
  for (const [k, n] of Object.entries(targetCounts).sort()) {
    console.log(`  ${k.padEnd(25)} ${n} files`);
  }
  console.log();
  console.log(bold('§3. 抽样 (前 12)'));
  for (const m of moves.slice(0, 12)) {
    console.log(`  ${dim((m.entityType ?? '').padEnd(15))} ${m.name.slice(0, 30).padEnd(30)} → ${m.to}`);
  }
  if (moves.length > 12) console.log(dim(`  ... +${moves.length - 12}`));

  if (!APPLY) {
    console.log();
    console.log(bold(yel('Dry-run 完成. 加 --apply 真做.')));
    await pool.end();
    return;
  }

  console.log();
  console.log(bold(grn('▶ APPLY')));
  let moved = 0, skipped = 0;
  for (const m of moves) {
    if (existsSync(m.newPath)) { skipped++; continue; }
    await mkdir(dirname(m.newPath), { recursive: true });
    await rename(m.oldPath, m.newPath);
    moved++;
  }
  console.log(`  ✓ moved: ${moved}, skipped: ${skipped}`);
  await pool.end();
}

main().catch((e) => { console.error(e); pool.end(); process.exit(1); });
