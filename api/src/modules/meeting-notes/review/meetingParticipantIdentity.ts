import type { MeetingNotesDeps } from '../types.js';
import { normalizeName, isLikelyNonPerson } from '../parse/participantExtractor.js';
import { reassignMeetingPerson, type ReassignResult } from './reassignMeetingPerson.js';

type Db = MeetingNotesDeps['db'];

type LabelKind = 'generic_asr' | 'named' | 'unknown';
type ParticipantStatus = 'pending' | 'confirmed' | 'rejected';

export interface MeetingParticipantCandidate {
  person: {
    id: string;
    canonicalName: string;
    aliases: string[];
    role: string | null;
    org: string | null;
    personKind: string | null;
  };
  score: number;
  reasons: string[];
}

export interface MeetingParticipantReviewItem {
  participantId: string;
  rawLabel: string;
  normalizedLabel: string;
  labelKind: LabelKind;
  role: string | null;
  occurrences: number;
  status: ParticipantStatus;
  confirmedPerson: {
    id: string;
    canonicalName: string;
    role: string | null;
    org: string | null;
    personKind: string | null;
  } | null;
  candidates: MeetingParticipantCandidate[];
  needsReview: boolean;
}

export interface ObserveParticipantInput {
  rawLabel: string;
  role?: string | null;
  source?: string;
  occurrenceDelta?: number;
  metadata?: Record<string, unknown>;
}

export interface ConfirmParticipantBindingResult {
  participantId: string;
  meetingId: string;
  target: {
    id: string;
    canonicalName: string;
  };
  reassigned: ReassignResult[];
  affectedTensionCount: number;
}

function classifyLabel(rawLabel: string): LabelKind | null {
  const normalized = normalizeName(rawLabel);
  if (!normalized) return null;
  if (isLikelyNonPerson(normalized)) return null;
  if (/^(说话人|speaker)\s*[0-9]+$/i.test(normalized)) return 'generic_asr';
  return /^[一-龥a-zA-Z][一-龥a-zA-Z0-9·.\-\s]{0,40}$/.test(normalized) ? 'named' : 'unknown';
}

function mergeMetadata(prev: unknown, next?: Record<string, unknown>): Record<string, unknown> {
  const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev as Record<string, unknown> : {};
  return next ? { ...base, ...next } : base;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function workspaceIdForMeeting(db: Db, meetingId: string): Promise<string | null> {
  const r = await db.query(`SELECT workspace_id::text AS wid FROM assets WHERE id::text = $1 LIMIT 1`, [meetingId]);
  return r.rows[0]?.wid ?? null;
}

async function confirmedMapForMeeting(db: Db, meetingId: string): Promise<Map<string, string>> {
  const r = await db.query(
    `SELECT normalized_label, confirmed_person_id::text AS person_id
       FROM mn_meeting_participants
      WHERE meeting_id = $1
        AND status = 'confirmed'
        AND confirmed_person_id IS NOT NULL`,
    [meetingId],
  );
  return new Map((r.rows ?? []).map((x: any) => [String(x.normalized_label), String(x.person_id)]));
}

async function syncParticipantOverride(
  db: Db,
  meetingId: string,
  rawLabel: string,
  targetPersonId: string,
  canonicalName: string,
): Promise<void> {
  const asset = await db.query(`SELECT metadata FROM assets WHERE id::text = $1 LIMIT 1`, [meetingId]);
  const metadata = asset.rows[0]?.metadata && typeof asset.rows[0].metadata === 'object'
    ? asset.rows[0].metadata as Record<string, unknown>
    : {};
  const participants = Array.isArray(metadata.participants)
    ? metadata.participants.map((participant: any) => {
      const participantLabel = typeof participant === 'string' ? participant : String(participant?.name ?? '');
      if (normalizeName(participantLabel) !== normalizeName(rawLabel)) return participant;
      return {
        ...(typeof participant === 'object' && participant ? participant : {}),
        id: targetPersonId,
        name: canonicalName,
        rawLabel,
        confirmedPersonId: targetPersonId,
      };
    })
    : metadata.participants;
  await db.query(
    `UPDATE assets SET metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata,'{}'::jsonb),
          ARRAY['participantOverrides'],
          COALESCE(metadata->'participantOverrides','{}'::jsonb) || jsonb_build_object($2::text, $3::text),
          true
        ),
        ARRAY['participants'],
        COALESCE($4::jsonb, metadata->'participants', '[]'::jsonb),
        true
      ) WHERE id::text = $1`,
    [meetingId, rawLabel, targetPersonId, participants ? JSON.stringify(participants) : null],
  );
}

async function resolveMatchingUnresolvedIds(db: Db, meetingId: string, normalizedLabel: string): Promise<string[]> {
  const r = await db.query(
    `SELECT id::text AS id FROM mn_unresolved_mentions
      WHERE meeting_id::text = $1 AND normalized_name = $2 AND status <> 'resolved'`,
    [meetingId, normalizedLabel],
  );
  return (r.rows ?? []).map((x: any) => String(x.id));
}

async function markUnresolvedResolved(db: Db, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.query(`UPDATE mn_unresolved_mentions SET status = 'resolved' WHERE id = ANY($1::uuid[])`, [ids]);
}

async function findSourcePersonId(db: Db, meetingId: string, rawLabel: string, normalizedLabel: string, targetPersonId: string): Promise<string | null> {
  const direct = await db.query(
    `SELECT id::text AS id
       FROM mn_people
      WHERE id <> $4::uuid
        AND workspace_id = (SELECT workspace_id FROM assets WHERE id::text = $1 LIMIT 1)
        AND (
          canonical_name = $2 OR $2 = ANY(aliases)
          OR canonical_name = $3 OR $3 = ANY(aliases)
        )
      LIMIT 1`,
    [meetingId, rawLabel, normalizedLabel, targetPersonId],
  );
  return direct.rows[0]?.id ?? null;
}

async function rankCandidates(deps: MeetingNotesDeps, meetingId: string, rawLabel: string, normalizedLabel: string, role?: string | null): Promise<MeetingParticipantCandidate[]> {
  const wid = await workspaceIdForMeeting(deps.db, meetingId);
  if (!wid) return [];
  const r = await deps.db.query(
    `SELECT id::text AS id, canonical_name, aliases, role, org, metadata
       FROM mn_people
      WHERE workspace_id::text = $1
      ORDER BY canonical_name ASC`,
    [wid],
  );
  const labelKind = classifyLabel(rawLabel);
  const out: MeetingParticipantCandidate[] = [];
  for (const row of r.rows ?? []) {
    const personKind = row?.metadata?.person_kind ?? null;
    if (personKind && personKind !== 'person') continue;
    const canonical = String(row.canonical_name ?? '');
    const aliases: string[] = Array.isArray(row.aliases) ? row.aliases.map(String) : [];
    const canonNorm = normalizeName(canonical);
    if (!canonNorm || classifyLabel(canonical) === 'generic_asr' || isLikelyNonPerson(canonical)) continue;

    const reasons: string[] = [];
    let score = 0;
    if (labelKind !== 'generic_asr') {
      if (canonNorm === normalizedLabel) {
        score += 1.0;
        reasons.push('规范名精确匹配');
      }
      if (aliases.some((a) => normalizeName(a) === normalizedLabel)) {
        score += 0.95;
        reasons.push('别名精确匹配');
      }
    }
    if (role && row.role && String(row.role).trim() && String(row.role).trim() === String(role).trim()) {
      score += 0.25;
      reasons.push('角色匹配');
    }
    if (!reasons.length && labelKind === 'generic_asr' && role && row.role && String(row.role).includes(String(role))) {
      score += 0.15;
      reasons.push('角色近似匹配');
    }
    if (score <= 0) continue;
    out.push({
      person: {
        id: String(row.id),
        canonicalName: canonical,
        aliases,
        role: row.role ?? null,
        org: row.org ?? null,
        personKind: personKind ? String(personKind) : null,
      },
      score,
      reasons,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.person.canonicalName.localeCompare(b.person.canonicalName)).slice(0, 5);
}

export async function observeMeetingParticipants(
  deps: MeetingNotesDeps,
  meetingId: string,
  participants: ObserveParticipantInput[],
): Promise<void> {
  for (const p of participants) {
    const rawLabel = String(p.rawLabel ?? '').trim();
    if (!rawLabel) continue;
    const normalizedLabel = normalizeName(rawLabel);
    const labelKind = classifyLabel(rawLabel);
    if (!normalizedLabel || !labelKind) continue;
    const mergedMeta = mergeMetadata({ source: p.source ?? 'observe' }, p.metadata);
    await deps.db.query(
      `INSERT INTO mn_meeting_participants
         (meeting_id, raw_label, normalized_label, label_kind, role, occurrences, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (meeting_id, normalized_label)
       DO UPDATE SET
         raw_label = EXCLUDED.raw_label,
         role = COALESCE(mn_meeting_participants.role, EXCLUDED.role),
         label_kind = EXCLUDED.label_kind,
         occurrences = mn_meeting_participants.occurrences + EXCLUDED.occurrences,
         metadata = COALESCE(mn_meeting_participants.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_at = NOW()`,
      [meetingId, rawLabel, normalizedLabel, labelKind, p.role ?? null, Math.max(1, p.occurrenceDelta ?? 1), JSON.stringify(mergedMeta)],
    );
  }
}

export async function resolveConfirmedMeetingParticipant(
  deps: MeetingNotesDeps,
  meetingId: string,
  rawLabel: string,
): Promise<string | null> {
  const normalized = normalizeName(rawLabel);
  if (!normalized) return null;
  const mapping = await confirmedMapForMeeting(deps.db, meetingId);
  return mapping.get(normalized) ?? null;
}

export async function listMeetingParticipantReview(
  deps: MeetingNotesDeps,
  meetingId: string,
): Promise<MeetingParticipantReviewItem[]> {
  const r = await deps.db.query(
    `SELECT mp.id::text AS id,
            mp.raw_label,
            mp.normalized_label,
            mp.label_kind,
            mp.role,
            mp.occurrences,
            mp.status,
            mp.confirmed_person_id::text AS confirmed_person_id,
            p.canonical_name,
            p.role AS confirmed_role,
            p.org AS confirmed_org,
            p.metadata->>'person_kind' AS confirmed_kind
       FROM mn_meeting_participants mp
       LEFT JOIN mn_people p ON p.id = mp.confirmed_person_id
      WHERE mp.meeting_id = $1
      ORDER BY mp.occurrences DESC, mp.created_at ASC`,
    [meetingId],
  );
  const items: MeetingParticipantReviewItem[] = [];
  for (const row of r.rows ?? []) {
    const candidates = row.status === 'confirmed'
      ? []
      : await rankCandidates(deps, meetingId, String(row.raw_label), String(row.normalized_label), row.role ?? null);
    items.push({
      participantId: String(row.id),
      rawLabel: String(row.raw_label),
      normalizedLabel: String(row.normalized_label),
      labelKind: (row.label_kind ?? 'unknown') as LabelKind,
      role: row.role ?? null,
      occurrences: Number(row.occurrences ?? 0),
      status: (row.status ?? 'pending') as ParticipantStatus,
      confirmedPerson: row.confirmed_person_id ? {
        id: String(row.confirmed_person_id),
        canonicalName: String(row.canonical_name ?? ''),
        role: row.confirmed_role ?? null,
        org: row.confirmed_org ?? null,
        personKind: row.confirmed_kind ?? null,
      } : null,
      candidates,
      needsReview: row.status !== 'confirmed',
    });
  }
  return items;
}

export async function confirmMeetingParticipantBinding(
  deps: MeetingNotesDeps,
  meetingId: string,
  participantId: string,
  targetPersonId: string,
): Promise<ConfirmParticipantBindingResult> {
  const current = await deps.db.query(
    `SELECT mp.id::text AS id, mp.raw_label, mp.normalized_label, mp.status,
            p.id::text AS person_id, p.canonical_name, p.workspace_id::text AS workspace_id,
            p.metadata->>'person_kind' AS person_kind
       FROM mn_meeting_participants mp
       CROSS JOIN LATERAL (
         SELECT id, canonical_name, workspace_id, metadata
           FROM mn_people WHERE id = $2::uuid
       ) p
      WHERE mp.id = $1::uuid AND mp.meeting_id = $3`,
    [participantId, targetPersonId, meetingId],
  );
  if (!current.rows.length) {
    throw Object.assign(new Error('participant or target person not found'), { code: 'PARTICIPANT_OR_PERSON_NOT_FOUND' });
  }
  const row = current.rows[0] as any;
  const meetingWorkspaceId = await workspaceIdForMeeting(deps.db, meetingId);
  if (!meetingWorkspaceId || row.workspace_id !== meetingWorkspaceId) {
    throw Object.assign(new Error('target person is not in meeting workspace'), { code: 'PERSON_NOT_IN_MEETING_WORKSPACE' });
  }
  if (row.person_kind && row.person_kind !== 'person') {
    throw Object.assign(new Error('target person kind is invalid'), { code: 'INVALID_TARGET_PERSON_KIND' });
  }

  await deps.db.query(
    `UPDATE mn_meeting_participants
        SET confirmed_person_id = $2::uuid,
            status = 'confirmed',
            confirmed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [participantId, targetPersonId],
  );
  await syncParticipantOverride(
    deps.db,
    meetingId,
    String(row.raw_label),
    targetPersonId,
    String(row.canonical_name),
  );

  const unresolvedIds = await resolveMatchingUnresolvedIds(deps.db, meetingId, String(row.normalized_label));
  await markUnresolvedResolved(deps.db, unresolvedIds);

  const srcPersonId = await findSourcePersonId(
    deps.db,
    meetingId,
    String(row.raw_label),
    String(row.normalized_label),
    targetPersonId,
  );
  const reassigned = srcPersonId && isUuid(meetingId)
    ? await reassignMeetingPerson(deps.db, meetingId, srcPersonId, targetPersonId)
    : [];
  const tensionHit = reassigned.find((x) => x.table === 'mn_tensions');

  return {
    participantId,
    meetingId,
    target: {
      id: String(row.person_id),
      canonicalName: String(row.canonical_name),
    },
    reassigned,
    affectedTensionCount: tensionHit?.reassigned ?? 0,
  };
}
