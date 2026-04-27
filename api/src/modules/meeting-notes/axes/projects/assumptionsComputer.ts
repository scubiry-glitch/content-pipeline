// axes/projects/assumptionsComputer.ts — 假设清单 (assumptions)
//
// 抽取支撑决策的假设 + 其证据等级（A/B/C/D）

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { extractListOverChunks, emptyResult, normalizeScopeIdForPersist, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_ASSUMPTIONS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedAssumption {
  text: string;
  evidence_grade: 'A' | 'B' | 'C' | 'D';
  confidence?: number;
}

const SYSTEM = `你是假设识别器。从正文里找出明显是"信念/假设"的断言（不是事实、不是决策本身）。
返回 JSON 数组：
[{"text":"假设内容", "evidence_grade":"A|B|C|D", "confidence":0-1}]
- A=硬数据（具体次数/比率/精确测量） B=类比案例（同类项目/历史样本）
  C=直觉/趋势判断 D=道听途说
- text 必须保留原文中的数字/比率/具体名词（如"H-chip Q3 配额"）
- 每条 ≤ 80 字
- evidence_grade 抽取后必须能在原文找到对应支撑句；找不到就降到 C/D

${FEW_SHOT_HEADER}
${EX_ASSUMPTIONS}`;

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

  const items = await extractListOverChunks<ExtractedAssumption>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => (x.text ?? '').slice(0, 50).toLowerCase(), statsSink: out },
  );

  const persistScopeId = normalizeScopeIdForPersist(args);
  for (const item of items) {
    try {
      const grade = ['A', 'B', 'C', 'D'].includes(item.evidence_grade) ? item.evidence_grade : 'C';
      await deps.db.query(
        `INSERT INTO mn_assumptions
           (scope_id, meeting_id, text, evidence_grade, confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [persistScopeId, bundle.meetingId, item.text, grade, item.confidence ?? 0.5],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `grade=${item.evidence_grade} text=${(item.text ?? '').slice(0, 50)}`);
    }
  }
  return out;
}
