#!/usr/bin/env node
// Migration 019 · 把 sources/meeting/<uuid>/ 重命名为 <title-slug>-<id8>/
//
// 原因: UUID 目录名在 obsidian 文件树里不可读, 改成中文标题更直观.
// 唯一性: title 可能重名, 加 -<id 前 8 位> 后缀保证唯一.
//
// 用法:
//   node api/migrations/019-meeting-dirs-by-title.mjs              # dry-run
//   node api/migrations/019-meeting-dirs-by-title.mjs --apply

import { readFileSync, existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
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

function slugify(s) {
  return String(s)
    .replace(/[\\/:*?"<>|]/g, '_')   // 文件系统非法字符
    .replace(/\s+/g, ' ')             // 折叠空格
    .replace(/\.docx?$|\.txt$/i, '')  // 去后缀
    .trim()
    .slice(0, 60);                    // 60 字符上限
}

function buildDirSlug(id, title) {
  const titleSlug = slugify(title || 'untitled');
  const idShort = id.slice(0, 8);
  return `${titleSlug}-${idShort}`;
}

async function main() {
  console.log(bold('Migration 019 · sources/meeting/<uuid>/ → <title-slug>-<id8>/'));
  console.log(dim(`  apply: ${APPLY ? grn('YES') : yel('NO (dry-run)')}`));
  console.log();

  // 1. 拉所有 meeting + title
  const r = await pool.query(`
    SELECT id::text AS id,
           COALESCE(title, metadata->>'title', 'Untitled') AS title
    FROM assets
    WHERE type IN ('meeting_note','meeting_minutes','transcript')
       OR (metadata ? 'meeting_kind')
  `);
  const titleById = new Map();
  for (const row of r.rows) titleById.set(row.id, row.title);

  // 2. 看现有 sources/meeting/ 下哪些 dir 是 UUID 形态
  const meetingDir = join(wikiRoot, 'sources/meeting');
  if (!existsSync(meetingDir)) {
    console.log(yel('  sources/meeting/ 不存在, 跳过'));
    await pool.end();
    return;
  }
  const { readdir } = await import('node:fs/promises');
  const items = await readdir(meetingDir, { withFileTypes: true });
  const uuidDirs = items
    .filter((d) => d.isDirectory() && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(d.name))
    .map((d) => d.name);

  console.log(`  发现 UUID 命名子目录: ${uuidDirs.length}`);
  console.log();

  const moves = [];
  for (const dirName of uuidDirs) {
    const id = dirName;  // 整个 dir name 就是 UUID
    const title = titleById.get(id) ?? `unknown-${id.slice(0, 8)}`;
    const newSlug = buildDirSlug(id, title);
    if (newSlug === id) continue;  // 没必要重命名
    moves.push({ id, title, oldDir: dirName, newDir: newSlug });
  }

  // 检测目标冲突
  const slugCount = {};
  for (const m of moves) slugCount[m.newDir] = (slugCount[m.newDir] ?? 0) + 1;
  const conflicts = Object.entries(slugCount).filter(([, n]) => n > 1);

  console.log(bold('§1. 重命名计划'));
  for (const m of moves) {
    console.log(`  ${dim(m.id.slice(0, 8) + '…')} ${m.title.slice(0, 30).padEnd(30)} → ${m.newDir}`);
  }

  if (conflicts.length > 0) {
    console.log();
    console.log(bold(yel('§2. ⚠ 检测到 slug 冲突 (同 title 多场会议):')));
    for (const [slug, n] of conflicts) {
      console.log(yel(`  ${slug} × ${n}`));
    }
    console.log(dim('  这些会因 buildDirSlug 已加 -<id8> 后缀而避免冲突, 但请检查上方列表'));
  }

  if (!APPLY) {
    console.log();
    console.log(bold(yel('Dry-run 完成. 加 --apply 真做.')));
    await pool.end();
    return;
  }

  console.log();
  console.log(bold(grn('▶ APPLY')));

  let renamed = 0, skipped = 0;
  for (const m of moves) {
    const oldPath = join(meetingDir, m.oldDir);
    const newPath = join(meetingDir, m.newDir);
    if (existsSync(newPath)) {
      console.log(yel(`  SKIP (target exists): ${m.oldDir} → ${m.newDir}`));
      skipped++;
      continue;
    }
    await rename(oldPath, newPath);
    renamed++;
  }
  console.log(`  ✓ renamed: ${renamed}, skipped: ${skipped}`);

  await pool.end();
}

main().catch((e) => { console.error(e); pool.end(); process.exit(1); });
