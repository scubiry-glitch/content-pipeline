#!/usr/bin/env node
// Migration 018 · 把 data/content-wiki/default/sources/<id>.md 按 source kind 重新路由
//
// 旧扁平: sources/<id>.md
// 新分级:
//   sources/meeting/<id>/_index.md            (kind=meeting · UUID 形态 · 来自 assets.type=meeting_note)
//   sources/research-report/<id>.md           (kind=research-report · 来自 assets.type=report 或 asset_library)
//   sources/rss/<id>.md                       (kind=rss)
//   sources/document/<id>.md                  (kind=document · 兜底)
//
// kind 来源:
//   - 先查 assets.type (UUID id 形态)
//   - 再查 asset_library.content_type (asset_xxx 形态)
//   - 都未命中 → document
//
// 用法:
//   node api/migrations/018-sources-by-kind.mjs              # dry-run
//   node api/migrations/018-sources-by-kind.mjs --apply

import { readFileSync, existsSync } from 'node:fs';
import { readdir, mkdir, rename, cp } from 'node:fs/promises';
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

// load env
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const pool = new pg.Pool({
  host: env.DB_HOST, port: parseInt(env.DB_PORT ?? '5432', 10),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});

function mapAssetTypeToKind(type) {
  const t = String(type ?? '').toLowerCase();
  if (t === 'meeting_note' || t === 'meeting_minutes' || t === 'transcript') return 'meeting';
  if (t === 'report') return 'research-report';
  if (t === 'rss' || t === 'rss_item') return 'rss';
  return 'document';
}
function mapContentTypeToKind(ct) {
  const t = String(ct ?? '').toLowerCase();
  if (t.includes('meeting')) return 'meeting';
  if (t.includes('rss')) return 'rss';
  if (t.includes('report')) return 'research-report';
  return 'document';
}

async function resolveAssetKind(assetId) {
  // 1. assets 表 (UUID)
  if (/^[0-9a-f]{8}-/i.test(assetId)) {
    try {
      const r = await pool.query(`SELECT type FROM assets WHERE id::text = $1 LIMIT 1`, [assetId]);
      if (r.rows[0]) return { kind: mapAssetTypeToKind(r.rows[0].type), source: 'assets' };
    } catch {/**/}
  }
  // 2. asset_library 表 (varchar)
  try {
    const r = await pool.query(`SELECT content_type FROM asset_library WHERE id = $1 LIMIT 1`, [assetId]);
    if (r.rows[0]) return { kind: mapContentTypeToKind(r.rows[0].content_type), source: 'asset_library' };
  } catch {/**/}
  // 3. 未命中 → document
  return { kind: 'document', source: 'fallback' };
}

async function main() {
  console.log(bold('Migration 018 · sources/<id>.md → sources/<kind>/<id>'));
  console.log(dim(`  apply: ${APPLY ? grn('YES') : yel('NO (dry-run)')}`));
  console.log();

  const sourcesDir = join(wikiRoot, 'sources');
  const items = await readdir(sourcesDir, { withFileTypes: true });
  const flatFiles = items.filter((d) => d.isFile() && d.name.endsWith('.md')).map((d) => d.name);

  console.log(`  待处理 sources/<id>.md 数: ${flatFiles.length}`);

  const moves = [];
  const kindCounts = { meeting: 0, 'research-report': 0, rss: 0, document: 0 };
  const sourceTraceCounts = { assets: 0, asset_library: 0, fallback: 0 };

  for (const f of flatFiles) {
    const id = f.replace(/\.md$/, '');
    const { kind, source } = await resolveAssetKind(id);
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
    sourceTraceCounts[source] = (sourceTraceCounts[source] ?? 0) + 1;

    const oldPath = join(sourcesDir, f);
    let newPath;
    if (kind === 'meeting') {
      newPath = join(sourcesDir, 'meeting', id, '_index.md');
    } else {
      newPath = join(sourcesDir, kind, f);
    }
    moves.push({ id, kind, source, oldPath, newPath });
  }

  // 打印汇总
  console.log();
  console.log(bold('§1. 按 kind 分布'));
  for (const [k, n] of Object.entries(kindCounts)) {
    console.log(`  ${k.padEnd(20)} ${n} files`);
  }
  console.log();
  console.log(bold('§2. kind 来源 (DB 路径)'));
  for (const [s, n] of Object.entries(sourceTraceCounts)) {
    console.log(`  ${s.padEnd(20)} ${n} files`);
  }

  // 抽样
  console.log();
  console.log(bold('§3. 路由抽样'));
  for (const m of moves.slice(0, 8)) {
    console.log(`  ${dim(m.id.slice(0, 12) + '…')} → ${m.kind.padEnd(16)} (via ${m.source}) → ${m.newPath.replace(wikiRoot + '/', '')}`);
  }
  if (moves.length > 8) console.log(dim(`  ... and ${moves.length - 8} more`));

  if (!APPLY) {
    console.log();
    console.log(bold(yel('Dry-run 完成。加 --apply 真做。')));
    console.log(dim('  apply 时第一步会 cp -r 备份 wikiRoot 到 .bak.<timestamp>'));
    await pool.end();
    return;
  }

  console.log();
  console.log(bold(grn('▶ APPLY')));

  // backup
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = wikiRoot + `.bak-018.${ts}`;
  console.log(`  备份: ${wikiRoot}  →  ${backupDir}`);
  await cp(wikiRoot, backupDir, { recursive: true });

  let moved = 0, skipped = 0;
  for (const m of moves) {
    if (existsSync(m.newPath)) {
      skipped++;
      console.log(yel(`  SKIP (target exists): ${m.id} → ${m.newPath.replace(wikiRoot + '/', '')}`));
      continue;
    }
    await mkdir(dirname(m.newPath), { recursive: true });
    await rename(m.oldPath, m.newPath);
    moved++;
  }
  console.log(`  ✓ moved: ${moved}, skipped: ${skipped}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
