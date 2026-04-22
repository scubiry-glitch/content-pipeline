// Backfill /assets 素材的领域（级联 taxonomy_code）与一级领域展示名 domain、内容分类 type。
//
// taxonomy_code（仍为 NULL 的行）解析策略（first match wins）：
//   1. Exact level-1 name   ("人工智能" -> E07)
//   2. Exact level-2 name   ("大模型"   -> E07.LLM)
//   3. Synonym dictionary   (see config/taxonomyData.ts)
//   4. Fallback to E99.USER
//
// 在 taxonomy_code 已有值后（含本次解析结果）：
//   - 将 asset_themes.domain / assets.domain 规范为 taxonomy_domains 上一级（level-1）中文名，
//     与前端「领域级联」展示一致（二级码取其 parent 的名称）。
//   - 将 assets.type（分类）为空的行按 content_type 推断：pdf -> report，其余 -> file；
//     并将非法 type 值归一为 file。
//
// Usage: npm run taxonomy:backfill

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { query, ensureDbPoolConnected, closePool } from '../db/connection.js';
import { ensureTaxonomySchema, sync, resolve } from '../services/taxonomyService.js';

const VALID_ASSET_TYPES = [
  'file',
  'report',
  'quote',
  'data',
  'rss_item',
  'chart',
  'insight',
  'meeting_minutes',
  'briefing',
  'interview',
  'transcript',
] as const;

interface Counter {
  total: number;
  matched_l1: number;
  matched_l2: number;
  fallback_e99: number;
  samples: Array<{ from: string; to: string; via: string }>;
}

function bump(c: Counter, from: string, to: string) {
  c.total++;
  if (/^E\d{2}\.[A-Z]/.test(to)) c.matched_l2++;
  else if (/^E\d{2}$/.test(to) && to !== 'E99') c.matched_l1++;
  else if (to === 'E99.USER') c.fallback_e99++;
  if (c.samples.length < 20) c.samples.push({ from, to, via: inferVia(to) });
}

function inferVia(code: string): string {
  if (code === 'E99.USER') return 'fallback';
  if (/^E\d{2}\.[A-Z]/.test(code)) return 'sub';
  return 'parent';
}

function toCode(raw: string | null | undefined): string {
  const code = resolve(raw || '');
  return code || 'E99.USER';
}

async function backfillAssetThemes(c: Counter) {
  const res = await query(
    `SELECT id, name, domain FROM asset_themes
      WHERE taxonomy_code IS NULL`,
  );
  for (const row of res.rows) {
    const src = (row.domain as string) || (row.name as string);
    const code = toCode(src);
    await query(`UPDATE asset_themes SET taxonomy_code = $1 WHERE id = $2`, [code, row.id]);
    bump(c, src, code);
  }
  console.log(`[backfill] asset_themes: updated ${res.rowCount}`);
}

async function backfillAssets(c: Counter) {
  // Assets inherit from their theme first; if no theme or still null, resolve from domain field.
  await query(`
    UPDATE assets a
       SET taxonomy_code = t.taxonomy_code
      FROM asset_themes t
     WHERE a.theme_id = t.id
       AND a.taxonomy_code IS NULL
       AND t.taxonomy_code IS NOT NULL
  `);

  const res = await query(
    `SELECT id, domain FROM assets
      WHERE taxonomy_code IS NULL AND domain IS NOT NULL`,
  );
  for (const row of res.rows) {
    const src = row.domain as string;
    const code = toCode(src);
    await query(`UPDATE assets SET taxonomy_code = $1 WHERE id = $2`, [code, row.id]);
    bump(c, src, code);
  }
  // Anything still null -> E99.USER
  const fallback = await query(
    `UPDATE assets SET taxonomy_code = 'E99.USER' WHERE taxonomy_code IS NULL`,
  );
  if (fallback.rowCount) {
    c.total += fallback.rowCount;
    c.fallback_e99 += fallback.rowCount;
  }
  console.log(`[backfill] assets: resolved ${res.rowCount}, fallback ${fallback.rowCount ?? 0}`);
}

async function backfillExperts(c: Counter) {
  const res = await query(
    `SELECT id, domains FROM expert_library
      WHERE (taxonomy_codes IS NULL OR array_length(taxonomy_codes, 1) IS NULL)
        AND domains IS NOT NULL`,
  );
  for (const row of res.rows) {
    const list: string[] = Array.isArray(row.domains) ? row.domains : [];
    const codes = Array.from(new Set(list.map(d => toCode(d)).filter(Boolean)));
    if (!codes.length) codes.push('E99.USER');
    await query(
      `UPDATE expert_library SET taxonomy_codes = $1::varchar[] WHERE id = $2`,
      [codes, row.id],
    );
    bump(c, list.join(','), codes[0]);
  }
  console.log(`[backfill] expert_library: updated ${res.rowCount}`);
}

async function backfillContentFacts(c: Counter) {
  let rowCount = 0;
  try {
    const res = await query(
      `SELECT id, context FROM content_facts
        WHERE (context->>'taxonomy_code') IS NULL
          AND (context->>'domain') IS NOT NULL`,
    );
    for (const row of res.rows) {
      const src = row.context?.domain as string;
      const code = toCode(src);
      await query(
        `UPDATE content_facts
            SET context = jsonb_set(COALESCE(context, '{}'::jsonb), '{taxonomy_code}', to_jsonb($1::text), true)
          WHERE id = $2`,
        [code, row.id],
      );
      bump(c, src, code);
    }
    rowCount = res.rowCount ?? 0;
  } catch (err) {
    console.warn('[backfill] content_facts skipped:', (err as Error).message);
  }
  console.log(`[backfill] content_facts: updated ${rowCount}`);
}

/** 一级领域中文名：二级码取 parent.name，一级码取自身 name（与 /assets 级联 UI 一致）。 */
async function syncThemeDomainsFromTaxonomy(): Promise<number> {
  const res = await query(`
    UPDATE asset_themes t
       SET domain = COALESCE(
             (SELECT p.name
                FROM taxonomy_domains c
                JOIN taxonomy_domains p ON p.code = c.parent_code
               WHERE c.code = t.taxonomy_code
                 AND c.level = 2),
             (SELECT n.name
                FROM taxonomy_domains n
               WHERE n.code = t.taxonomy_code
                 AND n.level = 1)
           )
     WHERE t.taxonomy_code IS NOT NULL
  `);
  const n = res.rowCount ?? 0;
  console.log(`[backfill] asset_themes.domain synced from taxonomy: ${n}`);
  return n;
}

async function syncAssetDomainsFromTaxonomy(): Promise<number> {
  const res = await query(`
    UPDATE assets a
       SET domain = COALESCE(
             (SELECT p.name
                FROM taxonomy_domains c
                JOIN taxonomy_domains p ON p.code = c.parent_code
               WHERE c.code = a.taxonomy_code
                 AND c.level = 2),
             (SELECT n.name
                FROM taxonomy_domains n
               WHERE n.code = a.taxonomy_code
                 AND n.level = 1)
           )
     WHERE a.taxonomy_code IS NOT NULL
  `);
  const n = res.rowCount ?? 0;
  console.log(`[backfill] assets.domain synced from taxonomy: ${n}`);
  return n;
}

/** 内容类型（分类）：补全 type，与 routes 中 ASSET_TYPES 一致。 */
async function backfillAssetTypes(): Promise<{ filled: number; normalized: number }> {
  const list = VALID_ASSET_TYPES.map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
  const norm = await query(`
    UPDATE assets
       SET type = 'file'
     WHERE type IS NOT NULL
       AND btrim(type::text) <> ''
       AND type::text NOT IN (${list})
  `);
  const fill = await query(`
    UPDATE assets
       SET type = CASE
             WHEN content_type = 'pdf' THEN 'report'
             ELSE 'file'
           END
     WHERE type IS NULL
        OR btrim(COALESCE(type::text, '')) = ''
  `);
  const normalized = norm.rowCount ?? 0;
  const filled = fill.rowCount ?? 0;
  console.log(`[backfill] assets.type: filled ${filled}, normalized invalid -> file ${normalized}`);
  return { filled, normalized };
}

async function main() {
  await ensureDbPoolConnected();
  await ensureTaxonomySchema();
  await sync('backfill');

  const counter: Counter = {
    total: 0,
    matched_l1: 0,
    matched_l2: 0,
    fallback_e99: 0,
    samples: [],
  };

  await backfillAssetThemes(counter);
  const themeDomainSynced = await syncThemeDomainsFromTaxonomy();
  await backfillAssets(counter);
  const assetDomainSynced = await syncAssetDomainsFromTaxonomy();
  const typeBackfill = await backfillAssetTypes();
  await backfillExperts(counter);
  await backfillContentFacts(counter);

  const outDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'taxonomy-backfill-report.json');
  const report = {
    ...counter,
    asset_themes_domain_synced: themeDomainSynced,
    assets_domain_synced: assetDomainSynced,
    assets_type_filled: typeBackfill.filled,
    assets_type_normalized_invalid: typeBackfill.normalized,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[backfill] report written: ${outPath}`);
  console.log(report);

  await closePool();
}

main().catch(async (err) => {
  console.error('[taxonomy] backfill failed:', err);
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
