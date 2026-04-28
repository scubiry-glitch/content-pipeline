#!/usr/bin/env node
// Migration 017 · Content Wiki Restructure (Phase H)
//
// 把现有 data/content-wiki/default/ 从扁平布局升级到分级布局:
//   entities/*.md         → entities/<subtype>/<slug>.md  (按 frontmatter.entityType)
//   concepts/*.md         → domains/<L1-code>-<L1-name>/<L2-code>-<L2-name>.md (按 free-text → taxonomy_code 映射)
//   content_facts.context → 加 taxonomy_code 字段 (按 free-text mapping backfill)
//   frontmatter 全量注入  → app/generatedBy/taxonomy_code (若无)
//
// 用法:
//   node api/migrations/017-content-wiki-restructure.mjs              # dry-run, 默认
//   node api/migrations/017-content-wiki-restructure.mjs --apply      # 真做 (会先 cp -r 备份)
//   node api/migrations/017-content-wiki-restructure.mjs --apply --skip-fs    # 只动 DB 不动 FS
//   node api/migrations/017-content-wiki-restructure.mjs --apply --skip-db    # 只动 FS 不动 DB
//
// dry-run 输出格式:
//   [dry-run] entities/张三.md → entities/person/张三.md
//   [dry-run] concepts/AI.md → domains/E07-人工智能/E07.LLM-大模型.md (mapped: AI→E07.LLM)
//   [dry-run] concepts/foo.md → domains/E99-其他/E99.OTHER.md (no mapping, fallback)
//   [dry-run] content_facts: 1234 rows missing taxonomy_code, would backfill
//   [SUMMARY] ...

import { readFileSync, existsSync, statSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, rename, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const wikiRoot = resolve(repoRoot, 'data', 'content-wiki', 'default');

// ── argv ──
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const SKIP_FS = argv.includes('--skip-fs');
const SKIP_DB = argv.includes('--skip-db');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const yel = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const grn = (s) => `\x1b[32m${s}\x1b[0m`;

// ── load env ──
const envPath = resolve(repoRoot, 'api/.env');
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

// ── load TAXONOMY + SYNONYMS ──
// 直接读 src/config/taxonomyData.ts 解析 TAXONOMY 树和 SYNONYMS 字典
// (避免 esm import 跨 .ts/.mjs 边界的麻烦)
const taxonomyPath = resolve(repoRoot, 'api/src/config/taxonomyData.ts');
const taxonomySrc = readFileSync(taxonomyPath, 'utf8');
const TAXONOMY = parseTaxonomyFile(taxonomySrc);
const SYNONYMS = parseSynonymsFromFile(taxonomySrc);

function parseTaxonomyFile(src) {
  const out = [];
  // 锚定到 export const TAXONOMY 块, 避免跟下面 SYNONYMS 混
  const taxStart = src.indexOf('export const TAXONOMY');
  const synStart = src.indexOf('export const SYNONYMS');
  const region = src.slice(taxStart, synStart > 0 ? synStart : src.length);
  const l1Re = /\{\s*code:\s*'([^']+)',\s*name:\s*'([^']+)'(?:[\s\S]*?children:\s*\[([\s\S]*?)\][\s\S]*?)?\}/g;
  let m;
  while ((m = l1Re.exec(region)) !== null) {
    const code = m[1], name = m[2];
    const childrenSrc = m[3] ?? '';
    if (!/^E\d+$/.test(code)) continue;
    const children = [];
    const cRe = /\{\s*code:\s*'([^']+)',\s*name:\s*'([^']+)'\s*\}/g;
    let cm;
    while ((cm = cRe.exec(childrenSrc)) !== null) {
      children.push({ code: cm[1], name: cm[2] });
    }
    out.push({ code, name, children });
  }
  return out;
}

function parseSynonymsFromFile(src) {
  // 抓 SYNONYMS 数组里每条 { tokens: [...], code: 'E0X.YYY' } 形态
  const synStart = src.indexOf('export const SYNONYMS');
  if (synStart < 0) return [];
  const region = src.slice(synStart);
  const out = [];
  const re = /\{\s*tokens:\s*\[([^\]]+)\]\s*,\s*code:\s*'([^']+)'\s*\}/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    const tokensSrc = m[1];
    const code = m[2];
    const tokens = [];
    const tRe = /'([^']+)'/g;
    let tm;
    while ((tm = tRe.exec(tokensSrc)) !== null) tokens.push(tm[1]);
    if (tokens.length > 0) out.push({ tokens, code });
  }
  return out;
}

const taxFlat = [];
for (const l1 of TAXONOMY) {
  taxFlat.push({ code: l1.code, name: l1.name, level: 1 });
  for (const c of l1.children ?? []) {
    taxFlat.push({ code: c.code, name: c.name, level: 2, parentCode: l1.code, parentName: l1.name });
  }
}
const taxByCode = new Map(taxFlat.map((n) => [n.code, n]));

// ── free-text domain → taxonomy_code 映射 ──
// 优先级:
//   1. SYNONYMS (token 包含匹配, 顺序靠前的子域优先于 parent)
//   2. L2 name 精确匹配
//   3. L2 name 部分匹配
//   4. L1 name 精确匹配 → 取该 L1 第一个子
//   返回 null = 走兜底 E99.OTHER
function mapDomainToCode(freeText) {
  if (!freeText) return null;
  const raw = String(freeText).trim();
  if (!raw) return null;
  const norm = raw.toLowerCase();

  // 1. SYNONYMS — 因为 SYNONYMS 在 taxonomyData.ts 里是按"具体子域优先于 L1"的顺序写的,
  //    遍历时第一条命中即返回。token 大小写敏感 (中文不影响), 英文统一比 lower。
  for (const entry of SYNONYMS) {
    for (const token of entry.tokens) {
      const tokenNorm = token.toLowerCase();
      if (norm === tokenNorm || norm.includes(tokenNorm) || tokenNorm.includes(norm)) {
        // 如果命中的是 L1 (E07 而非 E07.LLM), 直接返回 L1 code (不展开到 L2,
        // 让上游决定。当前 dry-run 下 L1 code 也会落到 domains/ 但归到 _index.md 那级)
        return entry.code;
      }
    }
  }

  // 2. L2 name 精确匹配
  for (const n of taxFlat) {
    if (n.level === 2 && n.name.toLowerCase() === norm) return n.code;
  }

  // 3. L2 name 部分匹配
  for (const n of taxFlat) {
    if (n.level === 2) {
      const nm = n.name.toLowerCase();
      if (norm.includes(nm) || nm.includes(norm)) return n.code;
    }
  }

  // 4. L1 name 精确匹配 → 取第一个 L2 子
  for (const l1 of TAXONOMY) {
    if (l1.name.toLowerCase() === norm) return l1.children?.[0]?.code ?? null;
  }

  return null;
}

function slugify(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// ── frontmatter parse (微型) ──
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: {}, body: md };
  const body = md.slice(m[0].length);
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) { i++; continue; }
    const km = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!km) { i++; continue; }
    const key = km[1];
    const rest = km[2];
    if (rest === '') {
      const arr = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        arr.push(lines[i].replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
        i++;
      }
      fm[key] = arr;
    } else {
      const v = rest.trim().replace(/^["']|["']$/g, '');
      fm[key] = v === 'true' ? true : v === 'false' ? false : v === 'null' ? null
              : /^-?\d+$/.test(v) ? Number(v)
              : v;
      i++;
    }
  }
  return { frontmatter: fm, body };
}

// ============================================================
// Phase 1 · entities/*.md 平铺 → entities/<subtype>/
// ============================================================

const ENTITY_SUBTYPES = ['person', 'org', 'product', 'project', 'event'];

async function planEntityMoves() {
  const moves = [];
  const conflicts = new Map(); // newPath → originalPath[]
  const flatDir = join(wikiRoot, 'entities');
  let files;
  try {
    files = (await readdir(flatDir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name);
  } catch { files = []; }

  for (const f of files) {
    const oldPath = join(flatDir, f);
    let entityType = 'concept';
    try {
      const md = await readFile(oldPath, 'utf8');
      const { frontmatter } = parseFrontmatter(md);
      entityType = String(frontmatter.entityType ?? frontmatter.subtype ?? 'concept').toLowerCase();
    } catch {/* */}

    let subtype, type;
    if (ENTITY_SUBTYPES.includes(entityType)) {
      type = 'entity';
      subtype = entityType;
    } else {
      // 'concept' 等 → concepts/mental-model/ (兜底，无法细分)
      type = 'concept';
      subtype = 'mental-model';
    }

    const newPath = join(wikiRoot, type === 'entity' ? `entities/${subtype}` : `concepts/${subtype}`, f);
    moves.push({ oldPath, newPath, entityType, type, subtype });

    if (!conflicts.has(newPath)) conflicts.set(newPath, []);
    conflicts.get(newPath).push(oldPath);
  }

  const dups = Array.from(conflicts.entries()).filter(([_, list]) => list.length > 1);
  return { moves, conflicts: dups };
}

// ============================================================
// Phase 2 · concepts/*.md → domains/<L1>/<L2>.md
// ============================================================

async function planConceptToDomainMoves() {
  const moves = [];
  const unmapped = [];
  const flatDir = join(wikiRoot, 'concepts');
  let files;
  try {
    files = (await readdir(flatDir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name);
  } catch { files = []; }

  for (const f of files) {
    const oldPath = join(flatDir, f);
    let domain = '';
    try {
      const md = await readFile(oldPath, 'utf8');
      const { frontmatter } = parseFrontmatter(md);
      domain = String(frontmatter.domain ?? f.replace(/\.md$/, ''));
    } catch {/* */}

    let code = mapDomainToCode(domain);
    if (!code) {
      unmapped.push({ oldPath, domain });
      const fallbackName = `E99.OTHER-${slugify(domain || 'unknown')}.md`;
      moves.push({
        oldPath,
        newPath: join(wikiRoot, 'domains', 'E99-其他', fallbackName),
        domain,
        code: 'E99.OTHER',
        mapped: false,
      });
      continue;
    }

    let node = taxByCode.get(code);
    // 命中 L1 code (E07 / E12 / E08): 落到该 L1 目录的 _<domain>.md (作为 L1 杂项,
    // 不强行插一个 L2). 这样 `平台经济` `宏观经济` 这种顶级词不会被错塞进 L2 节点
    if (node && node.level === 1) {
      const l1Dir = `${node.code}-${slugify(node.name)}`;
      const fileSlug = `_${slugify(domain || node.name)}`;
      moves.push({
        oldPath,
        newPath: join(wikiRoot, 'domains', l1Dir, `${fileSlug}.md`),
        domain,
        code: node.code,            // 仍记 L1 code (没具体 L2)
        mapped: true,
      });
      continue;
    }

    const parent = node?.level === 2 ? taxByCode.get(node.parentCode) : null;
    if (!node || !parent) {
      // 真的找不到 (mapper 返回了无效 code) → 兜底到 E99
      unmapped.push({ oldPath, domain });
      const fallbackName = `E99.OTHER-${slugify(domain || 'unknown')}.md`;
      moves.push({
        oldPath,
        newPath: join(wikiRoot, 'domains', 'E99-其他', fallbackName),
        domain,
        code: 'E99.OTHER',
        mapped: false,
      });
      continue;
    }

    const l1Dir = `${parent.code}-${slugify(parent.name)}`;
    const l2File = `${node.code}-${slugify(node.name)}.md`;
    moves.push({
      oldPath,
      newPath: join(wikiRoot, 'domains', l1Dir, l2File),
      domain,
      code,
      mapped: true,
    });
  }

  return { moves, unmapped };
}

// ============================================================
// Phase 3 · content_facts.context.taxonomy_code backfill
// ============================================================

async function planFactBackfill(pool) {
  const r = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE context ? 'taxonomy_code')::int AS has_code,
      COUNT(*) FILTER (WHERE NOT (context ? 'taxonomy_code'))::int AS missing,
      COUNT(*) FILTER (WHERE context ? 'domain' AND NOT (context ? 'taxonomy_code'))::int AS has_domain_only
    FROM content_facts
    WHERE is_current = true
  `);
  const stats = r.rows[0];

  // 抽样: 抽 200 条 missing taxonomy_code 但有 domain 的, 看 mapping 命中率
  const sample = await pool.query(`
    SELECT id, context->>'domain' AS domain
      FROM content_facts
     WHERE is_current = true
       AND NOT (context ? 'taxonomy_code')
       AND context ? 'domain'
     ORDER BY created_at DESC LIMIT 200
  `);
  let mappable = 0;
  let unmappableSamples = [];
  for (const row of sample.rows) {
    const code = mapDomainToCode(row.domain);
    if (code) mappable++;
    else if (unmappableSamples.length < 10) unmappableSamples.push(row.domain);
  }

  return {
    total: stats.total,
    hasCode: stats.has_code,
    missing: stats.missing,
    hasDomainOnly: stats.has_domain_only,
    sampleSize: sample.rows.length,
    sampleMappable: mappable,
    sampleMappableRate: sample.rows.length ? (mappable / sample.rows.length) : 0,
    unmappableSamples,
  };
}

async function applyFactBackfill(pool) {
  const r = await pool.query(`
    SELECT id, context->>'domain' AS domain
      FROM content_facts
     WHERE is_current = true
       AND NOT (context ? 'taxonomy_code')
       AND context ? 'domain'
  `);
  let updated = 0, unmapped = 0;
  for (const row of r.rows) {
    const code = mapDomainToCode(row.domain) ?? 'E99.OTHER';
    await pool.query(
      `UPDATE content_facts
          SET context = context || jsonb_build_object('taxonomy_code', $1::text)
        WHERE id = $2`,
      [code, row.id],
    );
    if (code === 'E99.OTHER' && !mapDomainToCode(row.domain)) unmapped++;
    updated++;
  }
  // 没 domain 的也写 E99.OTHER 兜底
  const r2 = await pool.query(`
    UPDATE content_facts
       SET context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('taxonomy_code', 'E99.OTHER'::text)
     WHERE is_current = true
       AND NOT (context ? 'taxonomy_code')
       AND NOT (context ? 'domain')
    RETURNING id`);
  return { updated, unmapped, fallbackOnly: r2.rowCount ?? 0 };
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(bold('Migration 017 · Content Wiki Restructure (Phase H)'));
  console.log(dim(`  wikiRoot: ${wikiRoot}`));
  console.log(dim(`  apply: ${APPLY ? grn('YES (will modify)') : yel('NO (dry-run)')}`));
  console.log(dim(`  skip-fs: ${SKIP_FS} · skip-db: ${SKIP_DB}`));
  console.log();

  // ── Phase 1: entity moves ──
  console.log(bold('§1. entities/*.md → entities/<subtype>/'));
  const { moves: entityMoves, conflicts: entityConflicts } = await planEntityMoves();
  const subtypeCounts = entityMoves.reduce((acc, m) => {
    const k = `${m.type}/${m.subtype}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  for (const [k, n] of Object.entries(subtypeCounts).sort()) {
    console.log(`  ${k.padEnd(28)} ${n} files`);
  }
  if (entityConflicts.length > 0) {
    console.log(red(`  ⚠ ${entityConflicts.length} 个目标路径有 slug 冲突 (多文件指向同一目标), apply 前请人工解决:`));
    for (const [target, list] of entityConflicts.slice(0, 10)) {
      console.log(red(`    ${target} ← ${list.map((p) => basename(p)).join(', ')}`));
    }
  }

  // ── Phase 2: concept → domain moves ──
  console.log();
  console.log(bold('§2. concepts/*.md → domains/<L1>/<L2>.md'));
  const { moves: conceptMoves, unmapped } = await planConceptToDomainMoves();
  const codeCounts = conceptMoves.reduce((acc, m) => {
    acc[m.code] = (acc[m.code] || 0) + 1;
    return acc;
  }, {});
  for (const [code, n] of Object.entries(codeCounts).sort()) {
    const node = taxByCode.get(code);
    const label = node ? `${code} (${node.name})` : code;
    console.log(`  ${label.padEnd(40)} ${n} files`);
  }
  console.log(`  ${dim(`mapped: ${conceptMoves.filter((m) => m.mapped).length} · unmapped→E99: ${unmapped.length}`)}`);
  if (unmapped.length > 0) {
    console.log(yel(`  unmapped 样本 (前 10): ${unmapped.slice(0, 10).map((x) => x.domain).join(', ')}`));
  }

  // ── Phase 3: content_facts backfill ──
  console.log();
  console.log(bold('§3. content_facts.context.taxonomy_code backfill'));
  let pool;
  if (!SKIP_DB) {
    pool = new pg.Pool({
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT ?? '5432', 10),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    });
    const stats = await planFactBackfill(pool);
    console.log(`  total facts (is_current=true):  ${stats.total}`);
    console.log(`  已有 taxonomy_code:               ${stats.hasCode}`);
    console.log(`  缺 taxonomy_code:                ${stats.missing}`);
    console.log(`    其中有 domain 字段可映射:      ${stats.hasDomainOnly}`);
    console.log(`  sample 200 条 mapping 命中率:    ${(stats.sampleMappableRate * 100).toFixed(1)}% (${stats.sampleMappable}/${stats.sampleSize})`);
    if (stats.unmappableSamples.length > 0) {
      console.log(yel(`  unmappable domain 样本: ${stats.unmappableSamples.join(' / ')}`));
    }
  } else {
    console.log(dim('  (--skip-db, skip)'));
  }

  // ── Apply ──
  if (!APPLY) {
    console.log();
    console.log(bold(yel('Dry-run 完成。如确认，加 --apply 真做。')));
    console.log(dim('  apply 时第一步会 cp -r 备份 wikiRoot 到 default.bak.<timestamp>'));
    if (pool) await pool.end();
    return;
  }

  // ──── Real apply path ────
  console.log();
  console.log(bold(grn('▶ 进入 APPLY 模式')));

  // 0. backup
  if (!SKIP_FS) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = wikiRoot + `.bak.${ts}`;
    console.log(`  备份: ${wikiRoot}  →  ${backupDir}`);
    await cp(wikiRoot, backupDir, { recursive: true });
  }

  // 1. entity moves
  if (!SKIP_FS) {
    let moved = 0, skipped = 0;
    for (const m of entityMoves) {
      const targetExists = existsSync(m.newPath);
      if (targetExists) {
        skipped++;
        console.log(yel(`  SKIP (target exists): ${m.oldPath} → ${m.newPath}`));
        continue;
      }
      await mkdir(dirname(m.newPath), { recursive: true });
      await rename(m.oldPath, m.newPath);
      moved++;
    }
    console.log(`  entities moved: ${moved}, skipped: ${skipped}`);
  }

  // 2. concept → domain moves
  if (!SKIP_FS) {
    let moved = 0, skipped = 0;
    for (const m of conceptMoves) {
      if (existsSync(m.newPath)) { skipped++; continue; }
      await mkdir(dirname(m.newPath), { recursive: true });
      await rename(m.oldPath, m.newPath);
      moved++;
    }
    console.log(`  concept→domain moved: ${moved}, skipped: ${skipped}`);
  }

  // 3. content_facts backfill
  if (!SKIP_DB) {
    const result = await applyFactBackfill(pool);
    console.log(`  content_facts backfilled: ${result.updated} (mapped from domain), ${result.fallbackOnly} fallback to E99.OTHER`);
  }

  console.log();
  console.log(bold(grn('✓ Migration 017 apply 完成')));
  console.log(dim('  下一步: 重启 api (tsx watch 自动 reload), 然后跑一次 claude-cli run 验证'));
  if (pool) await pool.end();
}

main().catch((e) => {
  console.error(red('fatal:'), e);
  process.exit(1);
});
