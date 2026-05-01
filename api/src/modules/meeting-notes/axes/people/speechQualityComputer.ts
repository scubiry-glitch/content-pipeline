// axes/people/speechQualityComputer.ts — 发言质量 (speech_quality)
//
// 为每人算 entropy_pct + followed_up_count + quality_score
// PR3: 由 LLM 同时评估三项；PR4 可替换为基于 segment 的统计

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_SPEECH_QUALITY } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedQuality {
  who: string;
  entropy_pct: number;       // 0-100 信息熵百分比
  followed_up_count: number; // 其他人跟进/引用次数
  sample_quote?: string;
}

const SYSTEM = `为每位参会人评估发言质量。返回 JSON 数组：
[{"who":"姓名", "entropy_pct": 0-100, "followed_up_count": 整数, "sample_quote":"代表性引述（原文）"}]
- entropy_pct: 信息密度 (重复/口水话低、有具体数字/引用高)
- followed_up_count: 其观点被其他人引用/反驳/附议的次数
- sample_quote 必须从原文挑出一句信息密度最高的（含数字/比率/具体名词），不要复述

${FEW_SHOT_HEADER}
${EX_SPEECH_QUALITY}`;

export async function computeSpeechQuality(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('speech_quality');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    // P0 数据源契约：只删 LLM 行
    await deps.db.query(
      `DELETE FROM mn_speech_quality WHERE meeting_id = $1 AND source = 'llm_extracted'`,
      [bundle.meetingId],
    );
  }

  // per-person 单值；多 chunks 后按 who 聚合（entropy/followups 取均值，sample_quote 选最长）
  const rawItems = await extractListOverChunks<ExtractedQuality>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { statsSink: out },
  );
  const byPerson = new Map<string, { sumE: number; sumF: number; n: number; quote: string }>();
  for (const r of rawItems) {
    const key = r.who?.trim() ?? '';
    if (!key) continue;
    const cur = byPerson.get(key) ?? { sumE: 0, sumF: 0, n: 0, quote: '' };
    cur.sumE += Number(r.entropy_pct ?? 0);
    cur.sumF += Number(r.followed_up_count ?? 0);
    cur.n += 1;
    if ((r.sample_quote ?? '').length > cur.quote.length) cur.quote = r.sample_quote ?? '';
    byPerson.set(key, cur);
  }
  const items: ExtractedQuality[] = [...byPerson.entries()].map(([who, v]) => ({
    who,
    entropy_pct: Math.round(v.sumE / Math.max(1, v.n)),
    followed_up_count: Math.round(v.sumF / Math.max(1, v.n)),
    sample_quote: v.quote,
  }));

  for (const item of items) {
    let entropy = 0;
    let followups = 0;
    try {
      const personId = await ensurePersonByName(deps, item.who, undefined, undefined, args.meetingId);
      if (!personId) { out.skipped += 1; continue; }
      entropy = Math.max(0, Math.min(100, item.entropy_pct ?? 0));
      followups = Math.max(0, item.followed_up_count ?? 0);
      const quality = entropy * 0.6 + Math.min(100, followups * 10) * 0.4;
      const samples = item.sample_quote ? [item.sample_quote] : [];
      await deps.db.query(
        // P0 数据源契约：UPSERT 守护 manual_import / human_edit
        `INSERT INTO mn_speech_quality
           (meeting_id, person_id, entropy_pct, followed_up_count, quality_score, sample_quotes)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (meeting_id, person_id)
         DO UPDATE SET entropy_pct = EXCLUDED.entropy_pct,
                       followed_up_count = EXCLUDED.followed_up_count,
                       quality_score = EXCLUDED.quality_score,
                       sample_quotes = EXCLUDED.sample_quotes,
                       computed_at = NOW()
         WHERE mn_speech_quality.source NOT IN ('manual_import','human_edit')`,
        [bundle.meetingId, personId, entropy, followups, quality, JSON.stringify(samples)],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `who=${item.who} entropy=${entropy} followups=${followups}`);
    }
  }
  return out;
}
