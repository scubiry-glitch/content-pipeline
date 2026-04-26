// axes/people/silenceSignalComputer.ts — 沉默信号 (silence_signal)
//
// 识别异常沉默：某人在其平常发言的 topic 上此次未发言
// PR3: LLM 直接识别异常点；PR5+ 接入 longitudinal 历史基线做更准判定

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_SILENCE_SIGNAL } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedSilence {
  who: string;
  topic_id: string;
  state: 'spoke' | 'normal_silence' | 'abnormal_silence' | 'absent';
  anomaly_score?: number;
}

const SYSTEM = `你是会议沉默信号识别器。识别本会议中"通常会发言、但此次未发言"的人 × topic 对。
返回 JSON 数组：
[{"who":"姓名", "topic_id":"话题短标签（英文蛇形）", "state":"spoke|normal_silence|abnormal_silence|absent", "anomaly_score":0-100}]
- 只列异常（abnormal_silence / absent），可附 1-2 个 normal_silence 作对照
- topic_id 用简短英文词汇区分（如 pricing/tech_debt/lp_comms/deal_flow）
- anomaly_score 必须给量化判断（参考其他议题该人的活跃度），不要默认 0

${FEW_SHOT_HEADER}
${EX_SILENCE_SIGNAL}`;

export async function computeSilenceSignal(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('silence_signal');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(`DELETE FROM mn_silence_signals WHERE meeting_id = $1`, [bundle.meetingId]);
  }

  const raw = await callExpertOrLLM(deps, bundle.meetingKind, SYSTEM,
    `标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`);
  const items = safeJsonParse<ExtractedSilence[]>(raw, []);

  for (const item of items) {
    try {
      const personId = await ensurePersonByName(deps, item.who);
      if (!personId) { out.skipped += 1; continue; }
      await deps.db.query(
        `INSERT INTO mn_silence_signals
           (meeting_id, person_id, topic_id, state, anomaly_score)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (meeting_id, person_id, topic_id)
         DO UPDATE SET state = EXCLUDED.state, anomaly_score = EXCLUDED.anomaly_score`,
        [bundle.meetingId, personId, item.topic_id, item.state, item.anomaly_score ?? 0],
      );
      out.created += 1;
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
