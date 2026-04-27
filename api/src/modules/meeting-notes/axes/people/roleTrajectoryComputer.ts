// axes/people/roleTrajectoryComputer.ts — 角色演化 (role_trajectory)
//
// 为每个参会人在此 meeting 中打一个角色标签
// （proposer/challenger/decider/moderator/silent 等），写入 mn_role_trajectory_points。

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, normalizeScopeIdForPersist, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_ROLE_TRAJECTORY } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedRole {
  who: string;
  role_label: string;
  confidence?: number;
}

const SYSTEM = `你是会议角色识别器。识别每位参会人在这场会议中的主导角色，返回 JSON 数组：
[{"who":"姓名", "role_label":"proposer|challenger|decider|moderator|silent|reporter|analyst", "confidence":0-1}]
- 每人只给一个最能代表的角色
- 仅返回本场会议中有明显证据的人
- confidence 反映角色证据强度，不要默认 0.5；强证据 0.85+，单次发言 0.6 左右

${FEW_SHOT_HEADER}
${EX_ROLE_TRAJECTORY}`;

export async function computeRoleTrajectory(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('role_trajectory');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(
      `DELETE FROM mn_role_trajectory_points WHERE meeting_id = $1`,
      [bundle.meetingId],
    );
  }

  // role 是 per-person 单值，多 chunk 抽取后用 who 取 confidence 最高那条
  // 不传 dedupeKey 是为了拿到 raw items（包含同 who 的多份）后自己挑 max
  const rawItems = await extractListOverChunks<ExtractedRole>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { statsSink: out },
  );
  const byPerson = new Map<string, ExtractedRole>();
  for (const r of rawItems) {
    const key = r.who?.trim() ?? '';
    if (!key) continue;
    const prev = byPerson.get(key);
    if (!prev || (r.confidence ?? 0) > (prev.confidence ?? 0)) byPerson.set(key, r);
  }
  const items = [...byPerson.values()];

  const persistScopeId = normalizeScopeIdForPersist(args);

  for (const item of items) {
    try {
      const personId = await ensurePersonByName(deps, item.who);
      if (!personId) { out.skipped += 1; continue; }
      await deps.db.query(
        `INSERT INTO mn_role_trajectory_points
           (person_id, meeting_id, scope_id, role_label, confidence)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (person_id, meeting_id, scope_id)
         DO UPDATE SET role_label = EXCLUDED.role_label, confidence = EXCLUDED.confidence`,
        [personId, bundle.meetingId, persistScopeId, item.role_label, item.confidence ?? 0.5],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `who=${item.who} role=${item.role_label}`);
    }
  }
  return out;
}
