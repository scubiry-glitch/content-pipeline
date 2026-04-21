// taxonomyService: single source of truth for two-level domain taxonomy.
// Reads taxonomy_domains + taxonomy_audit_log, backed by taxonomyData.ts seed.

import { query } from '../db/connection.js';
import { TAXONOMY, SYNONYMS, flattenTaxonomy, TaxonomySeed } from '../config/taxonomyData.js';

export interface TaxonomyNode {
  code: string;
  parent_code: string | null;
  name: string;
  level: 1 | 2;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  children?: TaxonomyNode[];
}

export interface TaxonomyUsage {
  assets: number;
  themes: number;
  facts: number;
  experts: number;
  total: number;
}

export interface TaxonomyAuditEntry {
  id: string;
  code: string;
  action: string;
  diff: unknown;
  actor: string | null;
  created_at: string;
}

const CODE_RE_L1 = /^E\d{2}$/;
const CODE_RE_L2 = /^E\d{2}\.[A-Z][A-Z0-9_]*$/;

/** Idempotent DDL for the taxonomy tables + join columns.
 *  Mirrors api/src/db/migrations/026-taxonomy-domains.sql so server boot and
 *  the standalone npm run taxonomy:sync produce the same end state. */
export async function ensureTaxonomySchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS taxonomy_domains (
      code         VARCHAR(20) PRIMARY KEY,
      parent_code  VARCHAR(20) REFERENCES taxonomy_domains(code),
      name         VARCHAR(100) NOT NULL,
      level        SMALLINT NOT NULL,
      icon         VARCHAR(20),
      color        VARCHAR(20),
      sort_order   INT DEFAULT 0,
      is_active    BOOLEAN DEFAULT TRUE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_taxonomy_parent ON taxonomy_domains(parent_code)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_taxonomy_active ON taxonomy_domains(is_active)`);

  await query(`
    CREATE TABLE IF NOT EXISTS taxonomy_audit_log (
      id          BIGSERIAL PRIMARY KEY,
      code        VARCHAR(20) NOT NULL,
      action      VARCHAR(20) NOT NULL,
      diff        JSONB,
      actor       VARCHAR(100),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_taxonomy_audit_code    ON taxonomy_audit_log(code)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_taxonomy_audit_created ON taxonomy_audit_log(created_at DESC)`);

  // Join columns — tolerant of tables missing (fresh DB not initialised yet)
  const alters: Array<{ table: string; sql: string; index?: string }> = [
    {
      table: 'asset_themes',
      sql: `ALTER TABLE asset_themes   ADD COLUMN IF NOT EXISTS taxonomy_code  VARCHAR(20)`,
      index: `CREATE INDEX IF NOT EXISTS idx_asset_themes_taxcode ON asset_themes(taxonomy_code)`,
    },
    {
      table: 'assets',
      sql: `ALTER TABLE assets         ADD COLUMN IF NOT EXISTS taxonomy_code  VARCHAR(20)`,
      index: `CREATE INDEX IF NOT EXISTS idx_assets_taxcode       ON assets(taxonomy_code)`,
    },
    {
      table: 'expert_library',
      sql: `ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS taxonomy_codes VARCHAR(20)[]`,
      index: `CREATE INDEX IF NOT EXISTS idx_experts_taxcodes     ON expert_library USING GIN(taxonomy_codes)`,
    },
  ];
  for (const a of alters) {
    try {
      await query(a.sql);
      if (a.index) await query(a.index);
    } catch (err) {
      // Table may not exist yet on first bootstrap; skip silently.
      console.warn(`[taxonomy] skipped ${a.table}: ${(err as Error).message}`);
    }
  }
}

function validateCode(code: string, level: 1 | 2): void {
  const ok = level === 1 ? CODE_RE_L1.test(code) : CODE_RE_L2.test(code);
  if (!ok) {
    const expected = level === 1 ? 'E\\d{2} (e.g. E07)' : 'E\\d{2}.[A-Z]+ (e.g. E07.LLM)';
    throw new Error(`Invalid level-${level} code "${code}"; expected ${expected}`);
  }
}

async function recordAudit(
  code: string,
  action: string,
  diff: unknown,
  actor: string | null,
): Promise<void> {
  await query(
    `INSERT INTO taxonomy_audit_log (code, action, diff, actor) VALUES ($1, $2, $3, $4)`,
    [code, action, diff ? JSON.stringify(diff) : null, actor],
  );
}

/** Upsert the seed list from taxonomyData.ts. Codes not in seed keep their
 *  is_active as-is (we do NOT deactivate DB-only additions from /admin/taxonomy). */
export async function sync(actor: string | null = 'system'): Promise<{ upserted: number }> {
  const rows = flattenTaxonomy();
  for (const r of rows) {
    await query(
      `INSERT INTO taxonomy_domains
         (code, parent_code, name, level, icon, color, sort_order, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE, NOW())
       ON CONFLICT (code) DO UPDATE SET
         parent_code = EXCLUDED.parent_code,
         name        = EXCLUDED.name,
         level       = EXCLUDED.level,
         icon        = COALESCE(EXCLUDED.icon, taxonomy_domains.icon),
         color       = COALESCE(EXCLUDED.color, taxonomy_domains.color),
         sort_order  = EXCLUDED.sort_order,
         updated_at  = NOW()`,
      [r.code, r.parent_code, r.name, r.level, r.icon, r.color, r.sort_order],
    );
  }
  await recordAudit('*', 'sync', { count: rows.length }, actor);
  return { upserted: rows.length };
}

export async function listAll(opts: { includeInactive?: boolean } = {}): Promise<TaxonomyNode[]> {
  const res = await query(
    `SELECT code, parent_code, name, level, icon, color, sort_order, is_active
       FROM taxonomy_domains
       ${opts.includeInactive ? '' : 'WHERE is_active = TRUE'}
       ORDER BY level ASC, sort_order ASC, code ASC`,
  );
  return res.rows as TaxonomyNode[];
}

export async function getTree(opts: { includeInactive?: boolean } = {}): Promise<TaxonomyNode[]> {
  const flat = await listAll(opts);
  const byCode = new Map<string, TaxonomyNode>();
  flat.forEach(n => byCode.set(n.code, { ...n, children: [] }));
  const tree: TaxonomyNode[] = [];
  for (const node of byCode.values()) {
    if (node.parent_code) {
      const parent = byCode.get(node.parent_code);
      if (parent) parent.children!.push(node);
      else tree.push(node);
    } else {
      tree.push(node);
    }
  }
  return tree;
}

export async function create(input: {
  code: string;
  parent_code?: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}, actor: string | null): Promise<TaxonomyNode> {
  const level: 1 | 2 = input.parent_code ? 2 : 1;
  validateCode(input.code, level);
  if (level === 2) {
    const [prefix] = input.code.split('.');
    if (prefix !== input.parent_code) {
      throw new Error(`Level-2 code "${input.code}" must be prefixed with parent "${input.parent_code}"`);
    }
  }
  const existing = await query(`SELECT code FROM taxonomy_domains WHERE code = $1`, [input.code]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error(`Code "${input.code}" already exists`);
  }
  const res = await query(
    `INSERT INTO taxonomy_domains (code, parent_code, name, level, icon, color, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING code, parent_code, name, level, icon, color, sort_order, is_active`,
    [
      input.code,
      input.parent_code ?? null,
      input.name,
      level,
      input.icon ?? null,
      input.color ?? null,
      input.sort_order ?? 0,
    ],
  );
  const row = res.rows[0] as TaxonomyNode;
  await recordAudit(input.code, 'create', { after: row }, actor);
  return row;
}

export async function update(
  code: string,
  patch: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    sort_order?: number;
    is_active?: boolean;
  },
  actor: string | null,
): Promise<TaxonomyNode> {
  const before = await query(
    `SELECT code, parent_code, name, level, icon, color, sort_order, is_active
       FROM taxonomy_domains WHERE code = $1`,
    [code],
  );
  if (!before.rowCount) throw new Error(`Code "${code}" not found`);
  const beforeRow = before.rows[0] as TaxonomyNode;

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    params.push(v);
  }
  if (!sets.length) return beforeRow;
  sets.push(`updated_at = NOW()`);
  params.push(code);

  const res = await query(
    `UPDATE taxonomy_domains SET ${sets.join(', ')}
       WHERE code = $${i}
       RETURNING code, parent_code, name, level, icon, color, sort_order, is_active`,
    params,
  );
  const afterRow = res.rows[0] as TaxonomyNode;

  const action =
    patch.is_active === false ? 'deactivate'
    : patch.is_active === true ? 'reactivate'
    : 'update';
  await recordAudit(code, action, { before: beforeRow, after: afterRow }, actor);
  return afterRow;
}

export async function getUsage(code: string): Promise<TaxonomyUsage> {
  const isPrefix = CODE_RE_L1.test(code); // level-1 code -> also count sub-codes
  const likePat = `${code}%`;
  const [assets, themes, facts, experts] = await Promise.all([
    query(
      isPrefix
        ? `SELECT COUNT(*)::text AS c FROM assets WHERE taxonomy_code LIKE $1`
        : `SELECT COUNT(*)::text AS c FROM assets WHERE taxonomy_code = $1`,
      [isPrefix ? likePat : code],
    ),
    query(
      isPrefix
        ? `SELECT COUNT(*)::text AS c FROM asset_themes WHERE taxonomy_code LIKE $1`
        : `SELECT COUNT(*)::text AS c FROM asset_themes WHERE taxonomy_code = $1`,
      [isPrefix ? likePat : code],
    ),
    query(
      `SELECT COUNT(*)::text AS c FROM content_facts
        WHERE (context->>'taxonomy_code') ${isPrefix ? 'LIKE' : '='} $1`,
      [isPrefix ? likePat : code],
    ).catch(() => ({ rows: [{ c: '0' }] } as any)),
    query(
      `SELECT COUNT(*)::text AS c FROM expert_library WHERE $1 = ANY(taxonomy_codes)`,
      [code],
    ).catch(() => ({ rows: [{ c: '0' }] } as any)),
  ]);
  const n = (r: { rows: Array<{ c?: string }> }) => parseInt(r.rows[0]?.c || '0', 10) || 0;
  const total = n(assets) + n(themes) + n(facts) + n(experts);
  return {
    assets: n(assets),
    themes: n(themes),
    facts: n(facts),
    experts: n(experts),
    total,
  };
}

export async function listAudit(code: string | null, limit = 50): Promise<TaxonomyAuditEntry[]> {
  const res = code
    ? await query(
        `SELECT id::text, code, action, diff, actor, created_at::text
           FROM taxonomy_audit_log WHERE code = $1 OR code = '*'
           ORDER BY created_at DESC LIMIT $2`,
        [code, limit],
      )
    : await query(
        `SELECT id::text, code, action, diff, actor, created_at::text
           FROM taxonomy_audit_log ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
  return res.rows as TaxonomyAuditEntry[];
}

/** Resolve a free-text domain string to the most specific taxonomy code. */
export function resolve(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  if (CODE_RE_L2.test(t) || CODE_RE_L1.test(t)) return t;

  // Exact-name match first (cheapest, highest confidence)
  for (const node of TAXONOMY) {
    if (node.name === t) return node.code;
    for (const child of node.children || []) {
      if (child.name === t) return child.code;
    }
  }
  // Synonym lookup (sub-codes first because list is ordered that way)
  const hay = t.toLowerCase();
  for (const entry of SYNONYMS) {
    if (entry.tokens.some(tok => hay.includes(tok.toLowerCase()))) {
      return entry.code;
    }
  }
  return null;
}

/** Export current DB state as a taxonomyData.ts source string. */
export async function exportConfig(): Promise<string> {
  const tree = await getTree({ includeInactive: false });
  const level1 = tree.filter(n => n.level === 1);
  const seeds: TaxonomySeed[] = level1.map(n => ({
    code: n.code,
    name: n.name,
    icon: n.icon ?? undefined,
    color: n.color ?? undefined,
    children: (n.children ?? []).map(c => ({ code: c.code, name: c.name })),
  }));
  const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
  const lines: string[] = [
    '// Auto-generated by /api/v1/taxonomy/export — paste into api/src/config/taxonomyData.ts',
    '// Keep the SYNONYMS block from the existing file unchanged.',
    '',
    'export const TAXONOMY = [',
  ];
  for (const s of seeds) {
    lines.push(`  {`);
    lines.push(`    code: ${q(s.code)},`);
    lines.push(`    name: ${q(s.name)},`);
    if (s.icon) lines.push(`    icon: ${q(s.icon)},`);
    if (s.color) lines.push(`    color: ${q(s.color)},`);
    if (s.children && s.children.length) {
      lines.push(`    children: [`);
      for (const c of s.children) {
        lines.push(`      { code: ${q(c.code)}, name: ${q(c.name)} },`);
      }
      lines.push(`    ],`);
    }
    lines.push(`  },`);
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}
