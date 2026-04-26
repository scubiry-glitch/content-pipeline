// axes/projects/openQuestionsComputer.ts — 开放问题 (open_questions)
//
// 抽取本会议提出但未决议的问题；若 scope 下已有相似 question 则 times_raised +1
// 简易相似判定：PR3 用纯文本完全匹配 + lower-trim；PR5+ 可升级 embedding 去重

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_OPEN_QUESTIONS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedQuestion {
  text: string;
  category?: 'strategic' | 'analytical' | 'governance' | 'operational';
  owner?: string;
}

const SYSTEM = `你是开放问题抽取器。从正文里找出"被提出但未在本会议解决"的问题。返回 JSON 数组：
[{"text":"问题（≤80字）", "category":"strategic|analytical|governance|operational", "owner":"可选-负责人姓名"}]
- 只抽取明确提出的问题，不包括主持人的修辞性提问
- text 必须保留原文中的具体范围/数字（如"6000 万-8000 万单笔上限"），不要泛化
- owner 仅在会上明确指派时填写，否则留空

${FEW_SHOT_HEADER}
${EX_OPEN_QUESTIONS}`;

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function computeOpenQuestions(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('open_questions');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  const items = await extractListOverChunks<ExtractedQuestion>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => normalizeText(x.text ?? '').slice(0, 60) },
  );

  for (const item of items) {
    try {
      const ownerId = item.owner ? await ensurePersonByName(deps, item.owner) : null;
      const normalized = normalizeText(item.text);
      // 同 scope 下相似问题累加
      const existing = await deps.db.query(
        `SELECT id, times_raised FROM mn_open_questions
          WHERE COALESCE(scope_id::text,'') = COALESCE($1::text,'')
            AND lower(btrim(regexp_replace(text, '\\s+', ' ', 'g'))) = $2
          LIMIT 1`,
        [args.scopeId ?? null, normalized],
      );
      if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        const nextCount = Number(existing.rows[0].times_raised ?? 1) + 1;
        const nextStatus = nextCount >= 3 && !ownerId ? 'chronic' : 'open';
        await deps.db.query(
          `UPDATE mn_open_questions
              SET times_raised = $2,
                  last_raised_meeting_id = $3,
                  status = $4,
                  updated_at = NOW()
            WHERE id = $1`,
          [id, nextCount, bundle.meetingId, nextStatus],
        );
        out.updated += 1;
      } else {
        await deps.db.query(
          `INSERT INTO mn_open_questions
             (scope_id, text, category, status, times_raised,
              first_raised_meeting_id, last_raised_meeting_id, owner_person_id)
           VALUES ($1, $2, $3, $4, 1, $5, $5, $6)`,
          [
            args.scopeId ?? null,
            item.text,
            item.category ?? 'operational',
            ownerId ? 'assigned' : 'open',
            bundle.meetingId,
            ownerId,
          ],
        );
        out.created += 1;
      }
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
