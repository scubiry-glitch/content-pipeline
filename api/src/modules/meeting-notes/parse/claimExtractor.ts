// parse/claimExtractor.ts — 抽取发言/断言/承诺 原子事实
//
// PR3 仅提供 loadMeetingBundle 读取 meeting 上下文，
// 具体的断言/承诺抽取由 axes/people/commitmentsComputer 等实际 axis computer 去做 LLM 调用，
// 避免在 parse 阶段提前绑定结构化格式。

import type { MeetingNotesDeps } from '../types.js';

export interface MeetingBundle {
  meetingId: string;
  title: string;
  content: string;          // 正文（ASR 或纸面纪要）
  metadata: Record<string, any>;
  occurredAt?: string;
  meetingKind?: string;
}

export async function loadMeetingBundle(
  deps: MeetingNotesDeps,
  meetingId: string,
): Promise<MeetingBundle | null> {
  const hasAssetTypeCol = await deps.db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_name = 'assets' AND column_name = 'asset_type'
      LIMIT 1`,
  );
  const typeExpr = hasAssetTypeCol.rows.length > 0
    ? `COALESCE(asset_type::text, type::text, content_type::text, '')`
    : `COALESCE(type::text, content_type::text, '')`;
  // F9 fix · 放开 type 白名单：早期约定只接 'meeting_minutes'，但实际新建会议
  // 默认 type='meeting_note'，导致绝大多数会议被 loadMeetingBundle 直接 return null
  // → axis computer 早 return → 整个 axis 跑出来 0 行（典型 silent-zero）
  // 改为接受 meeting_minutes / meeting_note；或 metadata 里有 meeting_kind 标记
  //
  // F5 silent-zero fix · 加 mn_scope_members 兜底（之前误用 mn_meetings 不存在
  // 的表，导致 SQL throws 把 silent-zero 又加重一档）。语义：只要这条 asset 在
  // mn_scope_members.meeting_id 里有 binding（已被绑到某个 project/topic/library
  // scope），就当成 meeting 接进来。覆盖通过 generic 上传链路上来、type=NULL
  // 且 metadata 暂时没 meeting_kind 的"新录音.txt"这类资产。
  const r = await deps.db.query(
    `SELECT id, title, content, metadata, created_at
       FROM assets
      WHERE id = $1
        AND (
          ${typeExpr} IN ('meeting_minutes', 'meeting_note')
          OR (metadata ? 'meeting_kind')
          OR EXISTS (SELECT 1 FROM mn_scope_members WHERE meeting_id::text = $1)
        )`,
    [meetingId],
  );
  if (r.rows.length === 0) return null;
  const a = r.rows[0];
  return {
    meetingId: a.id,
    title: a.title ?? '',
    content: a.content ?? '',
    metadata: a.metadata ?? {},
    occurredAt: a.metadata?.occurred_at,
    meetingKind: a.metadata?.meeting_kind,
  };
}

/**
 * 截断长会议纪要为 3-window 摘要（head 40% / mid 30% / tail 30%），不再
 * 把中段一刀切。default budget 提到 10000 chars（约 5000 中文字 = 25 分钟会议）。
 *
 * 用于 SINGLE-OBJECT axes（decision_quality / meeting_necessity / affect_curve）
 * 这些 axes 必须给 LLM 一份"完整议程概览"才能给出整体评分；因此不分块，但
 * 用 3 个采样窗口避免开场+收尾偏置。
 *
 * LIST-OUTPUT axes（commitments/assumptions/...）应该用 chunkedContent 分块
 * 多次调用 LLM 后合并，覆盖率更全。
 */
export function budgetedExcerpt(content: string, maxChars = 10000): string {
  if (!content) return '';
  if (content.length <= maxChars) return content;
  const headLen = Math.floor(maxChars * 0.4);
  const midLen  = Math.floor(maxChars * 0.3);
  const tailLen = maxChars - headLen - midLen - 40;
  const total = content.length;
  const midStart = Math.floor((total - midLen) / 2);
  const midSlice = content.slice(midStart, midStart + midLen);
  return [
    content.slice(0, headLen),
    `\n...(中段省略 ${midStart - headLen} 字符 → 取中部样本)...\n`,
    midSlice,
    `\n...(省略 ${total - (midStart + midLen) - tailLen} 字符)...\n`,
    content.slice(-tailLen),
  ].join('');
}

/**
 * 把全文切成多个 chunks，相邻 chunks 有 overlap 字符重叠（避免在 chunk 边界
 * 切断关键句子）。返回 chunks 数组，每个 chunk 长度约 `chunkSize` 字符。
 *
 * 用于 LIST-OUTPUT axis：每个 chunk 跑一次 LLM，结果由 axis 自己 dedupe + 合并。
 * 不分块的兜底：若 content ≤ chunkSize，直接返回 [content]。
 */
export function chunkedContent(
  content: string,
  chunkSize = 4500,
  overlap = 400,
): string[] {
  if (!content) return [''];
  const total = content.length;
  if (total <= chunkSize) return [content];

  const step = Math.max(1, chunkSize - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < total; start += step) {
    const end = Math.min(total, start + chunkSize);
    chunks.push(content.slice(start, end));
    if (end >= total) break;
  }
  return chunks;
}
