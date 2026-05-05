// axes/projects/decisionProvenanceComputer.ts — 决议溯源 (decision_provenance)
//
// 抽取会议中的决策节点 + 其所基于的证据/前置决策
// based_on_ids 由上游 registry.runAxisAll 预加载历史后注入 args.scopeDecisionHistory，
// LLM 通过短标签 D01/D02 引用，代码再解析回 UUID。

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, normalizeScopeIdForPersist, pushErrorSample, type ComputeArgs, type ComputeResult, type ScopeDecisionRef } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_DECISION_PROVENANCE } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedDecision {
  title: string;
  proposer?: string;
  rationale?: string;
  confidence?: number;
  is_current?: boolean;
  based_on?: string[];   // 历史决策标签，如 ["D01", "D03"]
}

function buildSystem(history: ScopeDecisionRef[]): string {
  const historyBlock = history.length === 0
    ? '（本 scope 暂无历史决策）'
    : history.map(h => `${h.label} [${h.date}] ${h.title}`).join('\n');

  return `你是决议抽取器。从会议正文里抽取达成的决策节点。返回 JSON 数组：
[{"title":"决策简述（≤40字）","proposer":"提议人姓名","rationale":"支撑理由","confidence":0-1,"is_current":true/false,"based_on":["D01"]}]
- 只抽取明确决策或方向选定，不包括讨论中的候选
- title 必须保留具体数字/公司名/比例（如"单笔上限 6000 万美元"），不要泛化为"调整投资策略"
- rationale ≤ 120 字，必须串联具体支撑人 + 反对人的论据，不要"经过讨论达成共识"套话
- is_current=false 仅当此决策被同场会议明确撤销
- based_on：若本决策明确建立在某条历史决策之上或是对其的修订，填对应标签（如["D02"]）；无明确前置则填 []

本 scope 历史决策（供 based_on 引用）：
${historyBlock}

${FEW_SHOT_HEADER}
${EX_DECISION_PROVENANCE}`;
}

export async function computeDecisionProvenance(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('decision_provenance');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(
      `DELETE FROM mn_decisions WHERE meeting_id = $1 AND source = 'llm_extracted'`,
      [bundle.meetingId],
    );
  }

  const history = args.scopeDecisionHistory ?? [];
  const labelToId = new Map(history.map(h => [h.label, h.id]));
  const SYSTEM = buildSystem(history);

  const items = await extractListOverChunks<ExtractedDecision>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => (x.title ?? '').slice(0, 40), statsSink: out },
  );

  const persistScopeId = normalizeScopeIdForPersist(args);
  for (const item of items) {
    try {
      const proposerId = item.proposer
        ? await ensurePersonByName(deps, item.proposer, undefined, undefined, args.meetingId)
        : null;

      const basedOnIds = (item.based_on ?? [])
        .map(label => labelToId.get(label.trim()))
        .filter((id): id is string => !!id);

      const ins = await deps.db.query(
        `INSERT INTO mn_decisions
           (scope_id, meeting_id, title, proposer_person_id, confidence, is_current, rationale, based_on_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          persistScopeId,
          bundle.meetingId,
          item.title,
          proposerId,
          item.confidence ?? 0.5,
          item.is_current ?? true,
          item.rationale ?? null,
          basedOnIds,
        ],
      );
      out.created += 1;
      if (out.sampleIds && out.sampleIds.length < 5 && ins.rows[0]?.id) {
        out.sampleIds.push(ins.rows[0].id);
      }
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `title=${(item.title ?? '').slice(0, 40)}`);
    }
  }
  return out;
}
