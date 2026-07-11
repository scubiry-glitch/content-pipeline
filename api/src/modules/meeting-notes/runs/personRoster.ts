// runs/personRoster.ts — 每 run 一份 workspace 花名册，唯一目的是「只读解析、绝不造人」
import type { MeetingNotesDeps } from '../types.js';
import { normalizeName } from '../parse/participantExtractor.js';

export interface RosterMember {
  id: string;
  canonicalName: string;
  aliases: string[];
  contentEntityId: string | null;
  embedding: number[] | null;
}

const EMBED_MATCH_THRESHOLD = 0.86;

function parseVec(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { const a = JSON.parse(v); return Array.isArray(a) && a.length > 0 ? a : null; } catch { return null; }
  }
  return null;
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class PersonRoster {
  private members: RosterMember[] = [];
  private byExact = new Map<string, string>(); // normalized canonical/alias → mn_people.id
  private unresolvedMap = new Map<string, { normalized: string; raw: string; count: number }>();

  private constructor(
    private readonly deps: MeetingNotesDeps,
    members: RosterMember[],
  ) {
    this.members = members;
    for (const m of members) {
      this.byExact.set(normalizeName(m.canonicalName), m.id);
      for (const a of m.aliases ?? []) {
        const na = normalizeName(a);
        if (na && !this.byExact.has(na)) this.byExact.set(na, m.id);
      }
    }
  }

  static async build(deps: MeetingNotesDeps, meetingId: string): Promise<PersonRoster> {
    const res = await deps.db.query(
      `SELECT p.id, p.canonical_name, p.aliases, p.content_entity_id, e.embedding
         FROM mn_people p
         LEFT JOIN content_entities e ON e.id = p.content_entity_id
        WHERE p.workspace_id = (SELECT workspace_id FROM assets WHERE id::text = $1::text LIMIT 1)`,
      [meetingId],
    );
    const members: RosterMember[] = res.rows.map((r: any) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      contentEntityId: r.content_entity_id ?? null,
      embedding: parseVec(r.embedding),
    }));
    return new PersonRoster(deps, members);
  }

  get size(): number { return this.members.length; }

  private record(normalized: string, raw: string): void {
    const cur = this.unresolvedMap.get(normalized);
    if (cur) cur.count += 1;
    else this.unresolvedMap.set(normalized, { normalized, raw, count: 1 });
  }

  /** 同步快路径：exact canonical + alias。命不中记 unresolved 返回 null。永不造人。 */
  resolve(rawName: string): string | null {
    const norm = normalizeName(rawName ?? '');
    if (!norm) return null;
    const hit = this.byExact.get(norm);
    if (hit) return hit;
    this.record(norm, rawName);
    return null;
  }

  /** 全路径：exact/alias 命中即返回；否则 embedding 余弦（生产休眠）。命不中记 unresolved。永不造人。 */
  async resolveAsync(rawName: string): Promise<string | null> {
    const norm = normalizeName(rawName ?? '');
    if (!norm) return null;
    const exact = this.byExact.get(norm);
    if (exact) return exact;

    const candidates = this.members.filter((m) => m.embedding && m.embedding.length > 0);
    if (candidates.length > 0) {
      const qv = parseVec(await this.deps.embedding.embed(norm));
      if (qv && qv.length > 0) {
        let best: { id: string; score: number } | null = null;
        for (const m of candidates) {
          const s = cosine(qv, m.embedding as number[]);
          if (!best || s > best.score) best = { id: m.id, score: s };
        }
        if (best && best.score >= EMBED_MATCH_THRESHOLD) return best.id;
      }
    }
    this.record(norm, rawName);
    return null;
  }

  get unresolved(): { normalized: string; raw: string; count: number }[] {
    return [...this.unresolvedMap.values()];
  }

  // Task 2 落实现
  async flushUnresolved(_deps: MeetingNotesDeps, _meetingId: string): Promise<number> {
    return 0;
  }
}
