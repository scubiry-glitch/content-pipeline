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
  // 列前缀 a. 是因为下面 SELECT 加了 LEFT JOIN mn_meetings m，需要消歧义
  const typeExpr = hasAssetTypeCol.rows.length > 0
    ? `COALESCE(a.asset_type::text, a.type::text, a.content_type::text, '')`
    : `COALESCE(a.type::text, a.content_type::text, '')`;
  // F9 fix · 放开 type 白名单：早期约定只接 'meeting_minutes'，但实际新建会议
  // 默认 type='meeting_note'，导致绝大多数会议被 loadMeetingBundle 直接 return null
  // → axis computer 早 return → 整个 axis 跑出来 0 行（典型 silent-zero）
  // 改为接受 meeting_minutes / meeting_note；或 metadata 里有 meeting_kind 标记
  //
  // F5 silent-zero fix · 再加一条 fallback：assets 行存在于 mn_meetings 也认。
  // 实测有 asset 上传时 type=NULL/'txt' 且 metadata={} 的（"新录音.txt" 走的
  // 是 generic 上传链路而非 meeting wizard），但 mn_meetings 里 meeting_kind
  // 写好了。前两个白名单都不命中 → silent-zero。LEFT JOIN mn_meetings 后用它
  // 的 meeting_kind 兜底，无需手工 UPDATE 修每条 asset。
  const r = await deps.db.query(
    `SELECT a.id, a.title, a.content, a.metadata, a.created_at,
            m.meeting_kind AS mn_meeting_kind
       FROM assets a
       LEFT JOIN mn_meetings m ON m.id = a.id
      WHERE a.id = $1
        AND (
          ${typeExpr} IN ('meeting_minutes', 'meeting_note')
          OR (a.metadata ? 'meeting_kind')
          OR m.id IS NOT NULL
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
    // 优先 metadata.meeting_kind；回退到 mn_meetings.meeting_kind
    meetingKind: a.metadata?.meeting_kind ?? a.mn_meeting_kind ?? null,
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
