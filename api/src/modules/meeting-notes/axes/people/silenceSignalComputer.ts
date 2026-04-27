// axes/people/silenceSignalComputer.ts — 沉默信号 (silence_signal)
//
// 识别异常沉默：某人在其平常发言的 topic 上此次未发言
// PR3: LLM 直接识别异常点；PR5+ 接入 longitudinal 历史基线做更准判定

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
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
    // P0 数据源契约：只删 LLM 行
    await deps.db.query(
      `DELETE FROM mn_silence_signals WHERE meeting_id = $1 AND source = 'llm_extracted'`,
      [bundle.meetingId],
    );
  }

  // 用 (who, topic_id) 联合 dedupe；先到为准
  const items = await extractListOverChunks<ExtractedSilence>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => `${x.who?.trim() ?? ''}|${x.topic_id?.trim() ?? ''}`, statsSink: out },
  );

  for (const item of items) {
    try {
      const personId = await ensurePersonByName(deps, item.who);
      if (!personId) { out.skipped += 1; continue; }
      await deps.db.query(
        // P0 数据源契约：UPSERT 守护 manual_import / human_edit
        `INSERT INTO mn_silence_signals
           (meeting_id, person_id, topic_id, state, anomaly_score)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (meeting_id, person_id, topic_id)
         DO UPDATE SET state = EXCLUDED.state, anomaly_score = EXCLUDED.anomaly_score
         WHERE mn_silence_signals.source NOT IN ('manual_import','human_edit')`,
        [bundle.meetingId, personId, item.topic_id, item.state, item.anomaly_score ?? 0],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `who=${item.who} topic=${item.topic_id}`);
    }
  }
  return out;
}
