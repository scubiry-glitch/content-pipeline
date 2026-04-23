// axes/projects/assumptionsComputer.ts — 假设清单 (assumptions)
//
// 抽取支撑决策的假设 + 其证据等级（A/B/C/D）

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedAssumption {
  text: string;
  evidence_grade: 'A' | 'B' | 'C' | 'D';
  confidence?: number;
}

const SYSTEM = `你是假设识别器。从正文里找出明显是"信念/假设"的断言（不是事实、不是决策本身）。
返回 JSON 数组：
[{"text":"假设内容", "evidence_grade":"A|B|C|D", "confidence":0-1}]
- A=硬数据 B=类比案例 C=直觉/主观 D=道听途说
- 每条 ≤ 80 字`;

export async function computeAssumptions(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('assumptions');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(`DELETE FROM mn_assumptions WHERE meeting_id = $1`, [bundle.meetingId]);
  }

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const items = safeJsonParse<ExtractedAssumption[]>(raw, []);

  for (const item of items) {
    try {
      const grade = ['A', 'B', 'C', 'D'].includes(item.evidence_grade) ? item.evidence_grade : 'C';
      await deps.db.query(
        `INSERT INTO mn_assumptions
           (scope_id, meeting_id, text, evidence_grade, confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [args.scopeId ?? null, bundle.meetingId, item.text, grade, item.confidence ?? 0.5],
      );
      out.created += 1;
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
