// axes/projects/decisionProvenanceComputer.ts — 决议溯源 (decision_provenance)
//
// 抽取会议中的决策节点 + 其所基于的证据/前置决策
// 写入 mn_decisions。superseded_by 的关联由后续 run 更新。

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedDecision {
  title: string;
  proposer?: string;
  rationale?: string;
  confidence?: number;
  is_current?: boolean;
}

const SYSTEM = `你是决议抽取器。从会议正文里抽取达成的决策节点。返回 JSON 数组：
[{"title":"决策简述（≤40字）", "proposer":"提议人姓名", "rationale":"支撑理由", "confidence":0-1, "is_current":true/false}]
- 只抽取明确决策或方向选定，不包括讨论中的候选
- rationale ≤ 120 字
- is_current=false 仅当此决策被同场会议明确撤销`;

export async function computeDecisionProvenance(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('decision_provenance');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(`DELETE FROM mn_decisions WHERE meeting_id = $1`, [bundle.meetingId]);
  }

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const items = safeJsonParse<ExtractedDecision[]>(raw, []);

  for (const item of items) {
    try {
      const proposerId = item.proposer ? await ensurePersonByName(deps, item.proposer) : null;
      const ins = await deps.db.query(
        `INSERT INTO mn_decisions
           (scope_id, meeting_id, title, proposer_person_id, confidence, is_current, rationale)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          args.scopeId ?? null,
          bundle.meetingId,
          item.title,
          proposerId,
          item.confidence ?? 0.5,
          item.is_current ?? true,
          item.rationale ?? null,
        ],
      );
      out.created += 1;
      if (out.sampleIds && out.sampleIds.length < 5 && ins.rows[0]?.id) {
        out.sampleIds.push(ins.rows[0].id);
      }
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
