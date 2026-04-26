// axes/knowledge/reusableJudgmentsComputer.ts — 可复用判断 (reusable_judgments)
//
// 从会议里抽象出"可以迁移到其他场景"的通用判断/经验
// 写入 mn_judgments；若同文本已存在，则 reuse_count + linked_meeting_ids 追加

import { loadMeetingBundle } from '../../parse/claimExtractor.js';
import { ensurePersonByName } from '../../parse/participantExtractor.js';
import { extractListOverChunks, emptyResult, pushErrorSample, type ComputeArgs, type ComputeResult } from '../_shared.js';
import { FEW_SHOT_HEADER, EX_REUSABLE_JUDGMENTS } from '../_examples.js';
import type { MeetingNotesDeps } from '../../types.js';

interface ExtractedJudgment {
  text: string;
  author?: string;
  domain?: string;
  generality_score?: number;
}

const SYSTEM = `你是可复用判断抽象器。从会议里找出可抽象为跨场景适用的通用判断。
返回 JSON 数组：
[{"text":"判断内容（尽量抽象，≤100字）", "author":"提出者姓名", "domain":"领域关键词","generality_score":0-1}]
- 只抽取有明显普适性的判断（如"X 市场的增长依赖供给端")
- 排除纯事实和场景性说法
- 验收标准:把句中的具体公司名/数字去掉后，判断仍然成立 → 才算"可复用"
- generality_score 高(0.8+) = 跨行业通用；低(0.3-) = 仅限当前赛道
- domain 用业务领域关键词（"基础设施投资" / "deal flow / 跨境"），不要"投资"这种太泛

${FEW_SHOT_HEADER}
${EX_REUSABLE_JUDGMENTS}`;

export async function computeReusableJudgments(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('reusable_judgments');
  if (!args.meetingId) return out;
  const bundle = await loadMeetingBundle(deps, args.meetingId);
  if (!bundle) return out;

  const items = await extractListOverChunks<ExtractedJudgment>(
    deps, bundle.meetingKind, SYSTEM,
    (chunk, idx, total) => `标题：${bundle.title}\n\n正文（第 ${idx + 1}/${total} 段）：\n${chunk}`,
    bundle.content,
    { dedupeKey: (x) => (x.text ?? '').toLowerCase().slice(0, 60), statsSink: out },
  );

  for (const item of items) {
    try {
      const authorId = item.author ? await ensurePersonByName(deps, item.author) : null;
      const existing = await deps.db.query(
        `SELECT id, reuse_count, linked_meeting_ids FROM mn_judgments
          WHERE lower(text) = lower($1) LIMIT 1`,
        [item.text],
      );
      if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        const linked: string[] = existing.rows[0].linked_meeting_ids ?? [];
        if (!linked.includes(bundle.meetingId)) linked.push(bundle.meetingId);
        await deps.db.query(
          `UPDATE mn_judgments
              SET reuse_count = reuse_count + 1,
                  linked_meeting_ids = $2::uuid[],
                  updated_at = NOW()
            WHERE id = $1`,
          [id, linked],
        );
        out.updated += 1;
      } else {
        await deps.db.query(
          `INSERT INTO mn_judgments
             (text, abstracted_from_meeting_id, author_person_id, domain,
              generality_score, reuse_count, linked_meeting_ids)
           VALUES ($1, $2, $3, $4, $5, 1, ARRAY[$2]::uuid[])`,
          [item.text, bundle.meetingId, authorId, item.domain ?? null, item.generality_score ?? 0.5],
        );
        out.created += 1;
      }
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message,
        `text=${(item.text ?? '').slice(0, 60)}`);
    }
  }
  return out;
}
