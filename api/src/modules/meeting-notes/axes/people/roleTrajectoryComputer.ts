// axes/people/roleTrajectoryComputer.ts — 角色演化 (role_trajectory)
//
// 为每个参会人在此 meeting 中打一个角色标签
// （proposer/challenger/decider/moderator/silent 等），写入 mn_role_trajectory_points。

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
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

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const items = safeJsonParse<ExtractedRole[]>(raw, []);

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
        [personId, bundle.meetingId, args.scopeId ?? null, item.role_label, item.confidence ?? 0.5],
      );
      out.created += 1;
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
