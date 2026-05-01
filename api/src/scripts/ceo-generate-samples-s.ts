/**
 * 基于 mn_scopes 中「业务支持 / 美租 / 养老 / 集团分析」相关项目，
 * 从 docs/ceo-app-samples 克隆并改写为 docs/ceo-app-samples-s（演示包 samples-s）。
 *
 * 说明（为何以前「没价值」）:
 * - 数据一般能取到（scopes + meeting_count）；价值低的主因是 **只做 6 个虚构线名的字符串替换**，
 *   叙事仍是 VC demo，与你们业务无关。
 * - 现版本额外拉取 **mn_scope_members → assets 会议标题**、**mn_runs（meeting 粒度）条数**，
 *   写入 `$pack_s.evidence_by_scope`，并覆盖 Compass / Situation 中 **首条** 高可见文案为库内摘录摘要。
 *
 * 用法: cd api && npm run ceo:generate-samples-s
 * 生成后再: npm run ceo:seed-from-samples-s
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const DEFAULT_LINE_NAMES = ['Halycon', 'Beacon', 'Stellar', 'Echo', 'Crucible', 'Pyre'] as const;

type ScopeRow = { id: string; kind: string; slug: string; name: string; meeting_count: number };

/** 每个 scope 从库内拉取的「可展示证据」（非 LLM 编造） */
type ScopeEvidenceRow = {
  scope_id: string;
  scope_name: string;
  /** mn_scope_members 行数（与能否 join 出 assets 标题无关） */
  scope_member_count: number;
  meeting_titles: string[];
  runs_for_scope_meetings: number;
};

type DbQuery = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function repoRoot(): string {
  return join(__dirname, '../../..');
}

function samplesBase(): string {
  return join(repoRoot(), 'docs/ceo-app-samples');
}

function samplesOut(): string {
  return join(repoRoot(), 'docs/ceo-app-samples-s');
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function replaceNames(s: string, pairs: [string, string][]): string {
  let out = s;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  return out;
}

function walkStrings(x: unknown, fn: (s: string) => string): void {
  if (typeof x === 'string') {
    /* noop at leaf — parent replaces */
    return;
  }
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (typeof v === 'string') x[i] = fn(v);
      else walkStrings(v, fn);
    }
    return;
  }
  if (x && typeof x === 'object') {
    for (const k of Object.keys(x as object)) {
      const o = x as Json;
      const v = o[k];
      if (typeof v === 'string') o[k] = fn(v);
      else walkStrings(v, fn);
    }
  }
}

function buildPairs(lineNames: string[]): [string, string][] {
  return DEFAULT_LINE_NAMES.map((d, i) => [d, lineNames[i] ?? d] as [string, string]);
}

function buildLineNames(scopes: ScopeRow[]): string[] {
  const take = (i: number, fallback: string) => scopes[i]?.name ?? fallback;
  return [
    take(0, '业务支持'),
    take(1, '美租'),
    take(2, '养老'),
    take(3, '集团分析'),
    scopes[3] ? `${scopes[3].name}·协同风险` : '跨项目依赖',
    scopes[2] ? `${scopes[2].name}·外部节奏` : '外部不确定性',
  ];
}

function scopeIdForLineIndex(scopes: ScopeRow[], i: number): string | null {
  if (i < scopes.length) return scopes[i].id;
  return null;
}

function patchCompass(doc: Json, pairs: [string, string][], scopes: ScopeRow[], lineNames: string[]): void {
  const ep = doc.endpoints as Json;
  if (!ep) return;
  const astro = ep['GET /api/v1/ceo/compass/astrolabe'] as Json | undefined;
  const stars = (astro?.stars as Json[]) ?? [];
  for (let i = 0; i < stars.length; i++) {
    if (lineNames[i]) {
      stars[i].name = lineNames[i];
      stars[i].scope_id = scopeIdForLineIndex(scopes, i);
    }
  }
  const linesEpKey = Object.keys(ep).find((k) => k.includes('compass/lines'));
  if (linesEpKey) {
    const items = ((ep[linesEpKey] as Json)?.items as Json[]) ?? [];
    for (let i = 0; i < items.length; i++) {
      items[i].name = lineNames[i] ?? items[i].name;
      items[i].scope_id = scopeIdForLineIndex(scopes, i);
      if (typeof items[i].description === 'string') {
        items[i].description = replaceNames(items[i].description as string, pairs);
      }
    }
  }
  const echosKey = Object.keys(ep).find((k) => k.includes('compass/echos'));
  if (echosKey) {
    const items = ((ep[echosKey] as Json)?.items as Json[]) ?? [];
    const nameByOld = new Map<string, string>(
      DEFAULT_LINE_NAMES.map((d, i) => [d, lineNames[i] ?? d]),
    );
    for (const row of items) {
      const oldName = row.lineName as string;
      const newName = nameByOld.get(oldName) ?? oldName;
      row.lineName = newName;
      const idx = lineNames.indexOf(newName);
      row.line_scope_id = idx >= 0 ? scopeIdForLineIndex(scopes, idx) : null;
      if (typeof row.hypothesis_text === 'string')
        row.hypothesis_text = replaceNames(row.hypothesis_text as string, pairs);
      if (typeof row.fact_text === 'string') row.fact_text = replaceNames(row.fact_text as string, pairs);
      if (typeof row.narrative === 'string') row.narrative = replaceNames(row.narrative as string, pairs);
    }
  }
  walkStrings(doc, (s) => replaceNames(s, pairs));
}

function patchBoardroom(doc: Json, pairs: [string, string][], scopes: ScopeRow[]): void {
  const ep = doc.endpoints as Json;
  if (!ep) return;
  const dashKey = Object.keys(ep).find((k) => k.includes('boardroom/dashboard'));
  if (dashKey && scopes.length >= 1) {
    const dash = ep[dashKey] as Json;
    dash.appliedScopes = scopes.slice(0, 2).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind === 'project' ? 'project' : s.kind,
    }));
  }
  walkStrings(doc, (s) => replaceNames(s, pairs));
}

async function fetchEvidenceForScope(q: DbQuery, s: ScopeRow): Promise<ScopeEvidenceRow> {
  const empty: ScopeEvidenceRow = {
    scope_id: s.id,
    scope_name: s.name,
    scope_member_count: Number(s.meeting_count ?? 0),
    meeting_titles: [],
    runs_for_scope_meetings: 0,
  };
  try {
    const mt = await q(
      `SELECT COALESCE(NULLIF(trim(a.title), ''), NULLIF(trim(a.metadata->>'title'), ''), '未命名会议') AS title
       FROM mn_scope_members sm
       JOIN assets a ON a.id::text = sm.meeting_id::text
       WHERE sm.scope_id::text = $1::text
       ORDER BY sm.bound_at DESC NULLS LAST, a.created_at DESC NULLS LAST
       LIMIT 12`,
      [s.id],
    );
    const titles = (mt.rows as { title: string }[]).map((r) => String(r.title || '').trim()).filter(Boolean);
    const rc = await q(
      `SELECT COUNT(*)::int AS n
       FROM mn_runs r
       WHERE r.scope_kind = 'meeting'
         AND r.scope_id::text IN (SELECT meeting_id::text FROM mn_scope_members WHERE scope_id::text = $1::text)`,
      [s.id],
    );
    const n = Number((rc.rows[0] as { n?: number })?.n ?? 0);
    return { ...empty, meeting_titles: titles, runs_for_scope_meetings: n };
  } catch (err) {
    console.warn(`[ceo-generate-samples-s] evidence scope=${s.name} (${s.id}):`, err);
    return empty;
  }
}

function summarizeEvidence(ev: ScopeEvidenceRow[], maxLen: number): string {
  if (!ev.length) return '（未拉到 scope 证据）';
  const head = ev[0];
  const run = head.runs_for_scope_meetings;
  const mc = head.scope_member_count;
  if (head.meeting_titles.length === 0) {
    const line =
      mc > 0
        ? `「${head.scope_name}」mn_scope_members=${mc} 条，但未能从 assets 解析出会议标题（检查 meeting_id 是否指向会议资产、或 title/metadata 是否为空）。mn_runs(meeting)=${run}。`
        : `「${head.scope_name}」下暂无 mn_scope_members 绑定会议；mn_runs(meeting)=${run}。`;
    return line.length <= maxLen ? line : `${line.slice(0, maxLen - 1)}…`;
  }
  const t = head.meeting_titles.slice(0, 5).join('；');
  const tail = head.meeting_titles.length > 5 ? `…等${head.meeting_titles.length}条` : '';
  const line = `「${head.scope_name}」绑定会议标题样例：${t}${tail}；members=${mc}；mn_runs(meeting)=${run}。`;
  return line.length <= maxLen ? line : `${line.slice(0, maxLen - 1)}…`;
}

function patchCompassEvidence(doc: Json, ev: ScopeEvidenceRow[], lineNames: string[]): void {
  const ep = doc.endpoints as Json;
  if (!ep || !ev.length) return;
  const dash = ep['GET /api/v1/ceo/compass/dashboard'] as Json | undefined;
  const alerts = (dash?.driftAlerts as Json[]) ?? [];
  if (alerts[0]) {
    alerts[0].name = lineNames[4] ?? alerts[0].name;
    alerts[0].text = summarizeEvidence(ev, 220);
  }
  const driftKey = Object.keys(ep).find((k) => k.includes('compass/drift-radar'));
  if (driftKey) {
    const items = ((ep[driftKey] as Json)?.items as Json[]) ?? [];
    if (items[0]) {
      items[0].name = lineNames[4] ?? items[0].name;
      items[0].text = summarizeEvidence(ev, 280);
    }
  }
}

function patchSituationEvidence(doc: Json, ev: ScopeEvidenceRow[]): void {
  const ep = doc.endpoints as Json;
  if (!ep || !ev.length) return;
  const sigKey = Object.keys(ep).find((k) => k.includes('situation/signals'));
  if (!sigKey) return;
  const items = ((ep[sigKey] as Json)?.items as Json[]) ?? [];
  if (!items[0]) return;
  const sum = summarizeEvidence(ev, 360);
  items[0].signal_text = `【库内摘录·samples-s】${sum}`;
  items[0].auto_response_suggested = `优先核对 scope「${ev[0].scope_name}」下会议与 mn_runs 是否已同步；再决定对外话术。`;
  items[0].blast_radius = `绑定在 ${ev.map((e) => e.scope_name).join('、')} 等 scope 的会议与加工任务。`;
  items[0].linked_assets = [`scope:${ev[0].scope_id}`, 'fixture:samples-s'];
}

function patchWarRoom(doc: Json, pairs: [string, string][]): void {
  const ep = doc.endpoints as Json;
  if (!ep) return;
  for (const [k, v] of Object.entries(ep)) {
    if (!k.includes('sparks') || !v || typeof v !== 'object') continue;
    const items = (v as Json).items as Json[] | undefined;
    if (!items) continue;
    for (const row of items) {
      if (typeof row.headline === 'string')
        row.headline = `[S] ${replaceNames(row.headline as string, pairs)}`;
    }
  }
  for (const [k, v] of Object.entries(ep)) {
    if (!k.includes('war-room/sandbox/:id') || !v || typeof v !== 'object') continue;
    const o = v as Json;
    if (typeof o.topic_text === 'string')
      o.topic_text = `[S] ${replaceNames(o.topic_text as string, pairs)}`;
    walkStrings(o.branches, (s) => replaceNames(s, pairs));
    if (o.evaluation && typeof o.evaluation === 'object') walkStrings(o.evaluation, (s) => replaceNames(s, pairs));
  }
}

async function main() {
  const { query, ensureDbPoolConnected } = await import('../db/connection.js');
  await ensureDbPoolConnected();
  const sql = `
    SELECT s.id::text, s.kind, s.slug, s.name,
           (SELECT COUNT(*)::int FROM mn_scope_members m WHERE m.scope_id = s.id) AS meeting_count
    FROM mn_scopes s
    WHERE s.status = 'active'
      AND (
        s.name ILIKE ('%' || '业务支持' || '%')
        OR s.name ILIKE ('%' || '美租' || '%')
        OR s.name ILIKE ('%' || '养老' || '%')
        OR s.name ILIKE ('%' || '集团分析' || '%')
      )
    ORDER BY meeting_count DESC NULLS LAST, s.name ASC
  `;
  const res = await query<ScopeRow>(sql);
  const scopes = res.rows ?? [];

  const evidenceByScope: ScopeEvidenceRow[] = [];
  for (const s of scopes) {
    evidenceByScope.push(await fetchEvidenceForScope(query as DbQuery, s));
  }

  const lineNames = buildLineNames(scopes);
  const pairs = buildPairs(lineNames);

  const totalMeetings = evidenceByScope.reduce((a, e) => a + e.meeting_titles.length, 0);
  const totalRuns = evidenceByScope.reduce((a, e) => a + e.runs_for_scope_meetings, 0);

  const pack = {
    id: 'samples-s',
    generated_at: new Date().toISOString(),
    query: '业务支持 / 美租 / 养老 / 集团分析',
    scopes,
    line_names: lineNames,
    evidence_by_scope: evidenceByScope,
    stats: { total_meeting_titles: totalMeetings, total_mn_runs_meeting_scope: totalRuns },
    methodology:
      '底层仍是 docs/ceo-app-samples 的 UI fixture；在 $pack_s.evidence_by_scope 与各文件内少量「首条」字段写入 **SQL 拉取的真实会议标题与 mn_runs 计数**。要全量替换叙事需另做 LLM 或手写 PRD。',
    note: scopes.length === 0 ? '未命中 mn_scopes，已用占位线名；请检查库内项目名称。' : null,
  };

  const base = samplesBase();
  const out = samplesOut();
  if (!existsSync(base)) throw new Error(`缺少模板目录: ${base}`);

  mkdirSync(out, { recursive: true });

  const files = ['compass.json', 'boardroom.json', 'situation.json', 'balcony.json', 'war-room.json'] as const;
  for (const f of files) {
    const doc = deepClone(JSON.parse(readFileSync(join(base, f), 'utf8')) as Json);
    if (f === 'compass.json') {
      patchCompass(doc, pairs, scopes, lineNames);
      patchCompassEvidence(doc, evidenceByScope, lineNames);
    } else if (f === 'boardroom.json') patchBoardroom(doc, pairs, scopes);
    else if (f === 'war-room.json') patchWarRoom(doc, pairs);
    else if (f === 'situation.json') {
      walkStrings(doc, (s) => replaceNames(s, pairs));
      patchSituationEvidence(doc, evidenceByScope);
    } else walkStrings(doc, (s) => replaceNames(s, pairs));
    doc.$pack_s = pack;

    writeFileSync(join(out, f), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }

  for (const extra of ['tower.json', 'panorama.json', 'brain.json', 'all.json'] as const) {
    const p = join(base, extra);
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Json;
      raw.$pack_s = pack;
      writeFileSync(join(out, extra), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    }
  }

  console.log(
    '[ceo-generate-samples-s] wrote',
    out,
    'scopes=',
    scopes.length,
    scopes.map((s) => s.name).join(', '),
    'meeting_titles=',
    totalMeetings,
    'mn_runs=',
    totalRuns,
  );
}

main().catch((e) => {
  console.error('[ceo-generate-samples-s] failed:', e);
  process.exit(1);
});
