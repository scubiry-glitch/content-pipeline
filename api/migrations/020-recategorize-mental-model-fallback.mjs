#!/usr/bin/env node
// Migration 020 · 重新分类 concepts/mental-model/ 兜底里 381 个文件
//
// 背景: migration 017 把所有 entityType='concept' 的旧 entities/*.md 都倒入
//   concepts/mental-model/ 作为兜底, 但实际上里面混杂 person/org/product/event/真概念.
//
// 修复: 用 content_entities.entity_type 重新路由:
//   person → entities/person/
//   company / organization / 政府/机构 等 → entities/org/
//   product / 金融产品 / 服务提供商 等 → entities/product/
//   event / 政策计划 等 → entities/event/
//   项目 → entities/project/
//   其余 (concept / metric / location / technology / 抽象类) → 留 concepts/mental-model/
//
// 用法:
//   node api/migrations/020-recategorize-mental-model-fallback.mjs              # dry-run
//   node api/migrations/020-recategorize-mental-model-fallback.mjs --apply

import { readFileSync, existsSync } from 'node:fs';
import { readdir, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
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

// content_entities.entity_type → wiki 路径
function mapEntityTypeToTarget(entityType) {
  const t = String(entityType ?? '').toLowerCase();

  // person
  if (t === 'person' || t === '人物') return { type: 'entity', subtype: 'person' };

  // org / company / 机构 等
  if (
    t === 'company' || t === 'organization' ||
    t === '机构' || t === '研究机构' || t === '行业协会' ||
    t === '公司类型' || t === '企业群体' || t === '企业类型' ||
    t === '政府' || t === '政府部门' || t === '政府机构' ||
    t === '金融机构' || t === '金融机构部门' ||
    t === '服务提供商类型' || t === '平台类型' ||
    t === '市场参与者'
  ) return { type: 'entity', subtype: 'org' };

  // product / 金融产品 / 服务
  if (
    t === 'product' ||
    t === '金融产品' || t === '金融产品类别' || t === '金融服务' ||
    t === '户型' || t === '房产类型' || t === '土地类型' || t === '房源获取方式' ||
    t === '住房供应类型' || t === '门店类型'
  ) return { type: 'entity', subtype: 'product' };

  // event
  if (t === 'event' || t === '政策' || t === '政策计划' || t === '政策试点范围' || t === '法律') {
    return { type: 'entity', subtype: 'event' };
  }

  // project
  if (t === '项目' || t === 'project') return { type: 'entity', subtype: 'project' };

  // 其余: concept / metric / index / location / technology / 各种细分 → 留 concepts/mental-model/
  return null;
}

function slugify(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function main() {
  console.log(bold('Migration 020 · concepts/mental-model/ 兜底重分类'));
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

  // 一次性拉所有 content_entities (避免 381 次 SQL)
  const er = await pool.query(`
    SELECT canonical_name, aliases, entity_type
    FROM content_entities
    ORDER BY canonical_name
  `);
  const byName = new Map();
  for (const row of er.rows) {
    byName.set(String(row.canonical_name).toLowerCase(), { name: row.canonical_name, type: row.entity_type, aliases: row.aliases ?? [] });
    for (const alias of row.aliases ?? []) {
      const k = String(alias).toLowerCase();
      if (!byName.has(k)) byName.set(k, { name: row.canonical_name, type: row.entity_type, aliases: row.aliases });
    }
  }
  console.log(`  content_entities 索引: ${byName.size} 条 (含 aliases)`);
  console.log();

  // 逐文件分类
  const moves = [];
  const stats = {
    matched_routed: 0,         // 命中 + 有路由 → 移走
    matched_concept: 0,        // 命中但 entity_type='concept' / 抽象 → 留
    no_match: 0,               // 没命中 content_entities → 留 (可能是真 concept 或 unknown)
  };
  const targetCounts = {};

  for (const f of files) {
    const baseName = f.replace(/\.md$/, '');
    const lookup = byName.get(baseName.toLowerCase());
    if (!lookup) {
      stats.no_match++;
      continue;
    }
    const target = mapEntityTypeToTarget(lookup.type);
    if (!target) {
      stats.matched_concept++;
      continue;
    }
    stats.matched_routed++;
    const targetKey = `${target.type}/${target.subtype}`;
    targetCounts[targetKey] = (targetCounts[targetKey] ?? 0) + 1;
    moves.push({
      oldPath: join(dir, f),
      newPath: join(wikiRoot, target.type === 'entity' ? `entities/${target.subtype}` : `concepts/${target.subtype}`, f),
      from: 'concepts/mental-model',
      to: targetKey,
      entityType: lookup.type,
      name: baseName,
    });
  }

  console.log(bold('§1. 分类汇总'));
  console.log(`  命中且需移动:   ${stats.matched_routed}`);
  console.log(`  命中但留原地:   ${stats.matched_concept} (entity_type=concept/metric/location/technology 等抽象类)`);
  console.log(`  未命中 (留):    ${stats.no_match}`);
  console.log();
  console.log(bold('§2. 移动目标分布'));
  for (const [k, n] of Object.entries(targetCounts).sort()) {
    console.log(`  ${k.padEnd(20)} ${n} files`);
  }
  console.log();
  console.log(bold('§3. 移动样本 (前 10)'));
  for (const m of moves.slice(0, 10)) {
    console.log(`  ${dim(m.entityType.padEnd(15))} ${m.name.slice(0, 30).padEnd(30)} → ${m.to}`);
  }
  if (moves.length > 10) console.log(dim(`  ... +${moves.length - 10}`));

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
    if (existsSync(m.newPath)) {
      console.log(yel(`  SKIP (target exists): ${m.name}`));
      skipped++;
      continue;
    }
    await mkdir(dirname(m.newPath), { recursive: true });
    await rename(m.oldPath, m.newPath);
    moved++;
  }
  console.log(`  ✓ moved: ${moved}, skipped: ${skipped}`);

  await pool.end();
}

main().catch((e) => { console.error(e); pool.end(); process.exit(1); });
