/**
 * 从 docs/ceo-app-samples/*.json 解析 fixture，写入 CEO 相关表（幂等）。
 *
 * 用法:
 *   cd api && npm run ceo:seed-from-samples
 *   cd api && npm run ceo:seed-from-samples -- --dry-run
 *   cd api && npm run ceo:seed-from-samples -- --dir=docs/ceo-app-samples-s --tag=ceo-app-samples-s
 *
 * 也可 `import { runCeoSamplesSeed } from './ceo-seed-from-samples.ts'`（见 ceo-seed-from-samples-s.ts）。
 *
 * 覆盖: compass / boardroom / situation / balcony / war-room 中有对应表的字段。
 * 未写 DB 的样例: tower.json、panorama.json、brain.json、all.json（汇总-only）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'api', '.env'), join(__dirname, '../../.env')]) {
  try {
    dotenv.config({ path: p });
  } catch {
    /* ignore */
  }
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asArr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export type CeoSamplesRunOpts = {
  /** 相对仓库根目录，如 docs/ceo-app-samples-s */
  docsFolder?: string;
  /** attention_alloc.source、ceo_sandbox_runs.created_by */
  sourceTag?: string;
  logPrefix?: string;
};

function argvDir(): string | null {
  const raw = process.argv.find((a) => a.startsWith('--dir='));
  return raw ? raw.slice('--dir='.length) : null;
}

function argvTag(): string | null {
  const raw = process.argv.find((a) => a.startsWith('--tag='));
  return raw ? raw.slice('--tag='.length) : null;
}

function resolveSamplesDir(opts?: CeoSamplesRunOpts): string {
  const folder =
    opts?.docsFolder ?? argvDir() ?? (process.env.CEO_SAMPLES_DIR?.trim() || 'docs/ceo-app-samples');
  const candidates = [
    join(process.cwd(), folder),
    join(process.cwd(), '..', folder),
    join(__dirname, '../../..', folder),
  ];
  const hit = candidates.find((d) => existsSync(join(d, 'war-room.json')));
  if (!hit) throw new Error(`未找到 ${folder}（已尝试: ${candidates.join(', ')}）`);
  return hit;
}

function resolveSourceTag(opts?: CeoSamplesRunOpts): string {
  return opts?.sourceTag ?? argvTag() ?? (process.env.CEO_SAMPLES_TAG?.trim() || 'ceo-app-samples');
}

function loadJson(dir: string, name: string): Json {
  return JSON.parse(readFileSync(join(dir, name), 'utf8')) as Json;
}

function endpoints(doc: Json): Record<string, Json> {
  const ep = doc.endpoints;
  if (!isObj(ep)) return {};
  return ep as Record<string, Json>;
}

function findEndpoint(ep: Record<string, Json>, needle: string): Json | null {
  const k = Object.keys(ep).find((x) => x.includes(needle));
  return k ? ep[k] : null;
}

function normCitations(raw: unknown): string {
  const arr = asArr(raw);
  const mapped = arr.map((c) => {
    if (!isObj(c)) return c;
    const o = c as Json;
    return { type: o.type, id: o.id, label: (o.label as string) ?? (o.title as string) ?? '' };
  });
  return JSON.stringify(mapped);
}

async function seedBoardroom(client: PoolClient, boardroom: Json) {
  const epB = endpoints(boardroom);
  const dirBody = epB['GET /api/v1/ceo/boardroom/directors'] as Json | undefined;
  for (const row of asArr<Json>(dirBody?.items)) {
    const meta = { personId: row.personId, expert_binding: row.expert_binding };
    await client.query(
      `INSERT INTO ceo_directors (id, name, role, weight, scope_id, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, weight = EXCLUDED.weight,
         scope_id = EXCLUDED.scope_id, metadata = EXCLUDED.metadata`,
      [
        row.id as string,
        row.name as string,
        (row.role as string) ?? null,
        Number(row.weight ?? 1),
        (row.scope_id as string) ?? null,
        JSON.stringify(meta),
      ],
    );
  }

  const concernsEp = findEndpoint(epB, 'boardroom/concerns');
  for (const row of asArr<Json>(concernsEp?.items)) {
    await client.query(
      `INSERT INTO ceo_director_concerns (id, director_id, topic, status, raised_count, raised_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         topic = EXCLUDED.topic, status = EXCLUDED.status,
         raised_count = EXCLUDED.raised_count, raised_at = EXCLUDED.raised_at`,
      [
        row.id as string,
        row.director_id as string,
        row.topic as string,
        (row.status as string) ?? 'pending',
        Number(row.raised_count ?? 1),
        row.raised_at ? new Date(row.raised_at as string) : new Date(),
      ],
    );
  }

  const briefsEp = epB['GET /api/v1/ceo/boardroom/briefs'] as Json | undefined;
  for (const row of asArr<Json>(briefsEp?.items)) {
    await client.query(
      `INSERT INTO ceo_briefs (id, scope_id, board_session, version, toc, page_count, status, generated_run_id, generated_at, read_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         board_session = EXCLUDED.board_session, version = EXCLUDED.version, toc = EXCLUDED.toc,
         page_count = EXCLUDED.page_count, status = EXCLUDED.status, generated_run_id = EXCLUDED.generated_run_id,
         generated_at = EXCLUDED.generated_at, read_at = EXCLUDED.read_at, updated_at = NOW()`,
      [
        row.id as string,
        (row.scope_id as string) ?? null,
        (row.board_session as string) ?? null,
        Number(row.version ?? 1),
        JSON.stringify(row.toc ?? []),
        row.page_count != null ? Number(row.page_count) : null,
        (row.status as string) ?? 'draft',
        (row.generated_run_id as string) ?? null,
        row.generated_at ? new Date(row.generated_at as string) : null,
        row.read_at ? new Date(row.read_at as string) : null,
      ],
    );
  }

  const annEp = findEndpoint(epB, 'boardroom/annotations');
  for (const row of asArr<Json>(annEp?.items)) {
    const expertId = (row.expert_id as string) ?? 'unknown';
    const highlight = row.highlight as string;
    const bodyMd = (row.body as string) ?? (row.body_md as string) ?? '';
    const mode = (row.mode as string) ?? 'synthesis';
    await client.query(
      `INSERT INTO ceo_boardroom_annotations (expert_id, expert_name, mode, highlight, body_md, citations)
       SELECT $1, $2, $3, $4, $5, $6::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM ceo_boardroom_annotations a WHERE a.expert_id = $1 AND a.highlight = $4)`,
      [
        expertId,
        (row.expertName as string) ?? (row.expert_name as string) ?? expertId,
        mode,
        highlight,
        bodyMd,
        normCitations(row.citations),
      ],
    );
  }
}

function lineMergeKey(row: Json): string {
  const n = row.name as string;
  const sid = (row.scope_id as string) || '';
  return `${n}\0${sid}`;
}

async function seedCompass(client: PoolClient, compass: Json, sourceTag: string) {
  const ep = endpoints(compass);
  const astro = ep['GET /api/v1/ceo/compass/astrolabe'] as Json | undefined;
  const linesFromApi = asArr<Json>(
    (findEndpoint(ep, 'compass/lines') as Json | undefined)?.items,
  );
  const byKey = new Map<string, Json>();
  for (const x of linesFromApi) byKey.set(lineMergeKey(x), x);
  for (const star of asArr<Json>(astro?.stars)) {
    const k = lineMergeKey(star);
    if (!byKey.has(k)) byKey.set(k, star);
  }
  for (const [, row] of byKey) {
    const name = row.name as string;
    const kind = row.kind as string;
    if (!['main', 'branch', 'drift'].includes(kind)) continue;
    const score = Number(row.alignment_score ?? row.alignmentScore ?? 0);
    const description =
      (row.description as string) ??
      (typeof row.fate_summary === 'string'
        ? String(row.fate_summary).replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, '').trim()
        : null);
    const scopeId = (row.scope_id as string) || null;
    await client.query(
      `INSERT INTO ceo_strategic_lines (name, kind, alignment_score, status, description, scope_id)
       SELECT $1, $2, $3, 'active', $4, $5::uuid
       WHERE NOT EXISTS (
         SELECT 1 FROM ceo_strategic_lines s
         WHERE s.name = $1 AND (s.scope_id IS NOT DISTINCT FROM $5::uuid)
       )`,
      [name, kind, score, description, scopeId],
    );
  }

  const echosEp = findEndpoint(ep, 'compass/echos');
  for (const row of asArr<Json>(echosEp?.items)) {
    const lineName = (row.lineName as string) ?? '';
    const hyp = row.hypothesis_text as string;
    const fact = (row.fact_text as string) ?? null;
    const fate = (row.fate as string) ?? 'pending';
    const evIds = asArr<string>(row.evidence_run_ids);
    const lineScopeId = (row.line_scope_id as string) || null;
    await client.query(
      `INSERT INTO ceo_strategic_echos (line_id, hypothesis_text, fact_text, fate, evidence_run_ids)
       SELECT l.id, $2, $3, $4, $5::text[]
       FROM ceo_strategic_lines l
       WHERE l.name = $1 AND (l.scope_id IS NOT DISTINCT FROM $6::uuid)
         AND NOT EXISTS (
           SELECT 1 FROM ceo_strategic_echos e
           WHERE e.line_id = l.id AND e.hypothesis_text = $2
         )`,
      [lineName, hyp, fact, fate, evIds, lineScopeId],
    );
  }

  const pie = ep['GET /api/v1/ceo/compass/time-pie'] as Json | undefined;
  const weekStart = (pie?.weekStart as string) ?? null;
  if (weekStart) {
    for (const seg of asArr<Json>(pie?.segments)) {
      const kind = seg.kind as string;
      const hours = Number(seg.hours ?? 0);
      await client.query(
        `INSERT INTO ceo_attention_alloc (week_start, project_id, hours, kind, source)
         SELECT $1::date, NULL, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM ceo_attention_alloc a
           WHERE a.week_start = $1::date AND a.kind = $3 AND a.source = $4
         )`,
        [weekStart, hours, kind, sourceTag],
      );
    }
  }
}

async function seedSituation(client: PoolClient, situation: Json) {
  const ep = endpoints(situation);
  const shEp = ep['GET /api/v1/ceo/situation/stakeholders'] as Json | undefined;
  for (const row of asArr<Json>(shEp?.items)) {
    const lastAt = row.last_signal_at ? new Date(row.last_signal_at as string) : null;
    await client.query(
      `INSERT INTO ceo_stakeholders (id, scope_id, name, kind, heat, last_signal_at, description, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, kind = EXCLUDED.kind, heat = EXCLUDED.heat,
         last_signal_at = EXCLUDED.last_signal_at, description = EXCLUDED.description,
         metadata = EXCLUDED.metadata`,
      [
        row.id as string,
        (row.scope_id as string) ?? null,
        row.name as string,
        row.kind as string,
        Number(row.heat ?? 0),
        lastAt,
        (row.description as string) ?? null,
        row.escalation_path ? JSON.stringify({ escalation_path: row.escalation_path }) : null,
      ],
    );
  }

  const sigEp = findEndpoint(ep, 'situation/signals');
  for (const row of asArr<Json>(sigEp?.items)) {
    const name = row.stakeholder_name as string;
    const meta = {
      auto_response_suggested: row.auto_response_suggested,
      linked_assets: row.linked_assets,
      blast_radius: row.blast_radius,
      category: row.category,
    };
    await client.query(
      `INSERT INTO ceo_external_signals (stakeholder_id, signal_text, source_url, sentiment, captured_at, metadata)
       SELECT s.id, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6::jsonb
       FROM ceo_stakeholders s
       WHERE s.name = $1 AND s.scope_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM ceo_external_signals x
           WHERE x.stakeholder_id = s.id AND x.signal_text = $2
         )`,
      [
        name,
        row.signal_text as string,
        (row.source_url as string) ?? null,
        row.sentiment != null ? Number(row.sentiment) : null,
        row.captured_at ? new Date(row.captured_at as string) : null,
        JSON.stringify(meta),
      ],
    );
  }

  const rubEp = findEndpoint(ep, 'situation/rubric');
  for (const rrow of asArr<Json>(rubEp?.rows)) {
    const sid = rrow.stakeholderId as string;
    const scores = rrow.scores as Json | undefined;
    if (!scores || !isObj(scores)) continue;
    for (const [dim, cell] of Object.entries(scores)) {
      if (!isObj(cell)) continue;
      const c = cell as Json;
      await client.query(
        `INSERT INTO ceo_rubric_scores (stakeholder_id, dimension, score, evidence_text, evidence_run_id)
         SELECT $1::uuid, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM ceo_rubric_scores z
           WHERE z.stakeholder_id = $1::uuid AND z.dimension = $2 AND z.scope_id IS NULL
         )`,
        [sid, dim, Number(c.value ?? 0), (c.evidence_text as string) ?? null, (c.evidence_run_id as string) ?? null],
      );
    }
  }
}

async function seedBalcony(client: PoolClient, balcony: Json) {
  const ep = endpoints(balcony);
  const refEp =
    (ep['GET /api/v1/ceo/balcony/reflections?userId=system&weekStart=2026-04-27'] as Json | undefined) ??
    (findEndpoint(ep, 'balcony/reflections') as Json | undefined);
  for (const row of asArr<Json>(refEp?.items)) {
    await client.query(
      `INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question, prompt)
       VALUES ($1, $2::date, $3, $4, $5)
       ON CONFLICT (user_id, week_start, prism_id) DO UPDATE SET
         question = EXCLUDED.question, prompt = EXCLUDED.prompt`,
      [
        (row.user_id as string) ?? 'system',
        (row.week_start as string) ?? '2026-04-27',
        row.prism_id as string,
        row.question as string,
        (row.prompt as string) ?? null,
      ],
    );
  }

  const roiEp = ep['GET /api/v1/ceo/balcony/roi?userId=system'] as Json | undefined;
  if (roiEp && roiEp.week_start) {
    await client.query(
      `INSERT INTO ceo_time_roi (user_id, week_start, total_hours, deep_focus_hours, meeting_hours, target_focus_hours, weekly_roi)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         total_hours = EXCLUDED.total_hours,
         deep_focus_hours = EXCLUDED.deep_focus_hours,
         meeting_hours = EXCLUDED.meeting_hours,
         target_focus_hours = EXCLUDED.target_focus_hours,
         weekly_roi = EXCLUDED.weekly_roi`,
      [
        (roiEp.user_id as string) ?? 'system',
        roiEp.week_start as string,
        Number(roiEp.total_hours ?? 0),
        Number(roiEp.deep_focus_hours ?? 0),
        Number(roiEp.meeting_hours ?? 0),
        Number(roiEp.target_focus_hours ?? 0),
        roiEp.weekly_roi != null ? Number(roiEp.weekly_roi) : null,
      ],
    );
  }

  const tables = balcony.tables as Json | undefined;
  for (const pr of asArr<Json>(tables?.ceo_prisms)) {
    const scopeId = (pr.scope_id as string) ?? null;
    const ws = pr.week_start as string;
    const meta = pr.metadata ? JSON.stringify(pr.metadata) : '{}';
    if (scopeId === null) {
      await client.query(
        `INSERT INTO ceo_prisms (scope_id, week_start, alignment, board_score, coord, team, ext, self, metadata)
         SELECT NULL, $1::date, $2, $3, $4, $5, $6, $7, $8::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM ceo_prisms p WHERE p.week_start = $1::date AND p.scope_id IS NULL)`,
        [
          ws,
          pr.alignment != null ? Number(pr.alignment) : null,
          pr.board_score != null ? Number(pr.board_score) : null,
          pr.coord != null ? Number(pr.coord) : null,
          pr.team != null ? Number(pr.team) : null,
          pr.ext != null ? Number(pr.ext) : null,
          pr.self != null ? Number(pr.self) : null,
          meta,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO ceo_prisms (scope_id, week_start, alignment, board_score, coord, team, ext, self, metadata)
         VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (scope_id, week_start) DO UPDATE SET
           alignment = EXCLUDED.alignment, board_score = EXCLUDED.board_score, coord = EXCLUDED.coord,
           team = EXCLUDED.team, ext = EXCLUDED.ext, self = EXCLUDED.self, metadata = EXCLUDED.metadata, computed_at = NOW()`,
        [
          scopeId,
          ws,
          pr.alignment != null ? Number(pr.alignment) : null,
          pr.board_score != null ? Number(pr.board_score) : null,
          pr.coord != null ? Number(pr.coord) : null,
          pr.team != null ? Number(pr.team) : null,
          pr.ext != null ? Number(pr.ext) : null,
          pr.self != null ? Number(pr.self) : null,
          meta,
        ],
      );
    }
  }
}

async function seedWarRoom(client: PoolClient, warRoom: Json, sourceTag: string) {
  const ep = endpoints(warRoom);
  for (const [key, val] of Object.entries(ep)) {
    if (!key.includes('sparks') || !isObj(val)) continue;
    for (const row of asArr<Json>(val.items)) {
      const why = Array.isArray(row.why_evidence) ? row.why_evidence : [];
      await client.query(
        `INSERT INTO ceo_war_room_sparks (tag, headline, evidence_short, why_evidence, risk_text, seed_group)
         SELECT $1, $2, $3, $4::jsonb, $5, $6::smallint
         WHERE NOT EXISTS (SELECT 1 FROM ceo_war_room_sparks s WHERE s.headline = $2)`,
        [
          row.tag as string,
          row.headline as string,
          (row.evidence_short as string) ?? null,
          JSON.stringify(why),
          (row.risk_text as string) ?? null,
          Number(row.seed_group ?? 0),
        ],
      );
    }
  }

  for (const [key, val] of Object.entries(ep)) {
    if (!key.includes('war-room/sandbox/:id') || !isObj(val)) continue;
    if (!Array.isArray(val.branches) || typeof val.topic_text !== 'string') continue;
    const topic = val.topic_text as string;
    const status = (val.status as string) ?? 'pending';
    const branchesJson = JSON.stringify(val.branches);
    const evalJson = val.evaluation != null ? JSON.stringify(val.evaluation) : null;
    const completedAt = val.completed_at ? new Date(val.completed_at as string) : null;
    if (completedAt) {
      await client.query(
        `INSERT INTO ceo_sandbox_runs (topic_text, status, branches, evaluation, created_by, completed_at)
         SELECT $1, $2, $3::jsonb, $4::jsonb, $6, $5::timestamptz
         WHERE NOT EXISTS (SELECT 1 FROM ceo_sandbox_runs r WHERE r.topic_text = $1)`,
        [topic, status, branchesJson, evalJson, completedAt, sourceTag],
      );
    } else {
      await client.query(
        `INSERT INTO ceo_sandbox_runs (topic_text, status, branches, created_by)
         SELECT $1, $2, $3::jsonb, $4
         WHERE NOT EXISTS (SELECT 1 FROM ceo_sandbox_runs r WHERE r.topic_text = $1)`,
        [topic, status, branchesJson, sourceTag],
      );
    }
  }
}

export async function runCeoSamplesSeed(opts?: CeoSamplesRunOpts): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const samplesDir = resolveSamplesDir(opts);
  const sourceTag = resolveSourceTag(opts);
  const logPrefix = opts?.logPrefix ?? '[ceo-seed-from-samples]';
  const compass = loadJson(samplesDir, 'compass.json');
  const boardroom = loadJson(samplesDir, 'boardroom.json');
  const situation = loadJson(samplesDir, 'situation.json');
  const balcony = loadJson(samplesDir, 'balcony.json');
  const warRoom = loadJson(samplesDir, 'war-room.json');

  if (dry) {
    const epB = endpoints(boardroom);
    const epW = endpoints(warRoom);
    let sparks = 0;
    let sandboxes = 0;
    for (const [k, v] of Object.entries(epW)) {
      if (k.includes('sparks') && isObj(v)) sparks += asArr(v.items).length;
      if (k.includes('war-room/sandbox/:id') && isObj(v) && Array.isArray(v.branches) && typeof v.topic_text === 'string')
        sandboxes += 1;
    }
    console.log(`${logPrefix} dry-run`, {
      samplesDir,
      sourceTag,
      directors: asArr(epB['GET /api/v1/ceo/boardroom/directors']?.items).length,
      concerns: asArr(findEndpoint(epB, 'boardroom/concerns')?.items).length,
      lines: asArr(endpoints(compass)['GET /api/v1/ceo/compass/astrolabe']?.stars).length,
      sparks,
      sandboxes,
    });
    return;
  }

  const { query } = await import('../db/connection.js');
  const { ensureCeoModuleSchema } = await import('../db/ensureCeoSchema.js');
  const { getClient } = await import('../db/connection.js');

  await ensureCeoModuleSchema(query);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await seedBoardroom(client, boardroom);
    await seedCompass(client, compass, sourceTag);
    await seedSituation(client, situation);
    await seedBalcony(client, balcony);
    await seedWarRoom(client, warRoom, sourceTag);
    await client.query('COMMIT');
    console.log(`${logPrefix} done (committed)`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function cliMain() {
  await runCeoSamplesSeed();
}

const selfPath = resolve(fileURLToPath(import.meta.url));
const invokedPath = resolve(process.argv[1] ?? '');
const isThisEntry = selfPath === invokedPath;
if (isThisEntry) {
  cliMain().catch((err) => {
    console.error('[ceo-seed-from-samples] failed:', err);
    process.exit(1);
  });
}
