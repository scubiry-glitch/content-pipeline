// axes/tension/tensionComputer.ts — 张力 (intra_meeting tension)
//
// 抽取会议中"两人或多人之间的实质性观点对立"，写入 mn_tensions。
// 与 cognitive_biases 的区别：cognitive_biases 是单人的认知偏误；
// tension 是两人/派系之间的对立。

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, normalizeScopeIdForPersist, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_TENSIONS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedTension {
  tension_key?: string;     // T1/T2 等显式标签（可选）
  between: string[];        // 对立人物姓名（≥2）
  topic: string;            // 对立焦点
  intensity?: number;       // 0-1
  summary?: string;         // 因果摘要
  moments?: Array<{ who: string; text: string }>;
}

const SYSTEM = `你是张力识别器。识别会议中"两人或多人之间的实质性观点对立"。
返回 JSON 数组：
[{
  "tension_key": "可选标签如 T1",
  "between": ["人名1", "人名2"],
  "topic": "对立焦点（用 X vs Y 句式如 中游 vs 训练层）",
  "intensity": 0-1,
  "summary": "2-3 句因果摘要：谁主张什么 / 对方反驳什么 / 关键论据",
  "moments": [{"who":"人名", "text":"原文≤60字"}]
}]
- intensity 必须有区分: 0.3=温和分歧 0.6=明显对立 0.85+=激烈交锋
- moments 至少 1 条，理想 2-3 条；text 必须是原文真实片段
- between 至少 2 人；多人派系对立时可 3-4 人
- 只列实质对立，不包括澄清式提问、重复主张

${FEW_SHOT_HEADER}
${EX_TENSIONS}`;

export async function computeTensions(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('intra_meeting');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(`DELETE FROM mn_tensions WHERE meeting_id = $1`, [bundle.meetingId]);
  }

  const items = await extractListOverChunks<ExtractedTension>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    {
      // 同一 topic 在重叠 chunk 会被识别两次，去重保留先见到的
      // 用 topic 归一化作 key（去除大小写/空白）
      dedupeKey: (x) => (x.topic ?? '').toLowerCase().replace(/\s+/g, ' ').slice(0, 60),
      statsSink: out,
    },
  );

  const persistScopeId = normalizeScopeIdForPersist(args);
  for (const item of items) {
    try {
      // 解析 between 人名 → person_id 数组
      const personIds: string[] = [];
      for (const name of item.between ?? []) {
        if (!name) continue;
        const id = await ensurePersonByName(deps, name, undefined, undefined, args.meetingId);
        if (id) personIds.push(id);
      }
      // 至少需要 1 个 person_id 才入库（避免空对立）
      if (personIds.length === 0) { out.skipped += 1; continue; }

      const intensity = Math.max(0, Math.min(1, Number(item.intensity ?? 0.5)));
      const moments = Array.isArray(item.moments) ? item.moments.slice(0, 8) : [];

      // 010 已建 UNIQUE (meeting_id, tension_key)；同 key 重跑 → 走 ON CONFLICT
      // 更新而非崩。tension_key 为 null 时 PostgreSQL 视为 distinct，不会触发 conflict。
      const ins = await deps.db.query(
        `INSERT INTO mn_tensions
           (meeting_id, scope_id, tension_key, between_ids, topic, intensity, summary, moments)
         VALUES ($1, $2, $3, $4::uuid[], $5, $6, $7, $8::jsonb)
         ON CONFLICT (meeting_id, tension_key) DO UPDATE SET
           between_ids = EXCLUDED.between_ids,
           topic       = EXCLUDED.topic,
           intensity   = EXCLUDED.intensity,
           summary     = EXCLUDED.summary,
           moments     = EXCLUDED.moments,
           computed_at = NOW()
         RETURNING id`,
        [
          bundle.meetingId,
          persistScopeId,
          item.tension_key ?? null,
          personIds,
          item.topic ?? '(unspecified)',
          intensity,
          item.summary ?? null,
          JSON.stringify(moments),
        ],
      );
      out.created += 1;
      if (out.sampleIds && out.sampleIds.length < 5 && ins.rows[0]?.id) {
        out.sampleIds.push(ins.rows[0].id);
      }
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `topic=${(item.topic ?? '').slice(0, 40)} between=${(item.between ?? []).join('+')}`);
    }
  }

  return out;
}
