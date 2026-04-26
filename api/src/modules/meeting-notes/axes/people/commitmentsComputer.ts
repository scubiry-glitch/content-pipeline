// axes/people/commitmentsComputer.ts — 承诺兑现 (commitments)
//
// 从一场 meeting 的 content 里抽取"谁承诺了什么、何时完成"，写入 mn_commitments。
// 重算（replaceExisting=true）会先删掉本 meeting 的旧 commitments。

import { loadMeetingBundle, budgetedExcerpt } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { callExpertOrLLM, emptyResult, safeJsonParse, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_COMMITMENTS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedCommitment {
  who: string;
  text: string;
  due_at?: string;
  state?: 'on_track' | 'at_risk' | 'done' | 'slipped';
  progress?: number;
}

const SYSTEM = `你是会议纪要承诺抽取器。从给定的会议正文里找出所有承诺/行动项。
返回 JSON 数组，每项格式：
{"who":"发言者姓名", "text":"承诺内容", "due_at":"ISO8601 或 null", "state":"on_track|at_risk|done|slipped", "progress":0-100}
- 只抽取明确具名的承诺，不要推断
- text 必须保留原文中的所有数字、公司名、日期（如"3 家 candidate"、"两周内"、"Q3 配额"）
- text 控制在 80 字内但不省略关键信息
- 若无承诺，返回 []

${FEW_SHOT_HEADER}
${EX_COMMITMENTS}`;

export async function computeCommitments(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('commitments');
  if (!args.meetingId) return out;

  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  if (args.replaceExisting) {
    await deps.db.query(`DELETE FROM mn_commitments WHERE meeting_id = $1`, [bundle.meetingId]);
  }

  const raw = await callExpertOrLLM(
    deps,
    bundle.meetingKind,
    SYSTEM,
    `会议标题：${bundle.title}\n\n正文：\n${budgetedExcerpt(bundle.content)}`,
  );
  const items = safeJsonParse<ExtractedCommitment[]>(raw, []);

  for (const item of items) {
    try {
      const personId = await ensurePersonByName(deps, item.who);
      if (!personId) { out.skipped += 1; continue; }
      const ins = await deps.db.query(
        `INSERT INTO mn_commitments
           (meeting_id, person_id, text, due_at, state, progress)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          bundle.meetingId,
          personId,
          item.text,
          item.due_at ?? null,
          item.state ?? 'on_track',
          item.progress ?? 0,
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
