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
  const r = await deps.db.query(
    `SELECT id, title, content, metadata, created_at
       FROM assets
      WHERE id = $1 AND ${typeExpr} = 'meeting_minutes'`,
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
 * 截断长会议纪要到 ~N chars，保留开头 60% + 结尾 40%。
 * 各 axis computer 需要避免把整份纪要塞进 prompt。
 */
export function budgetedExcerpt(content: string, maxChars = 6000): string {
  if (!content) return '';
  if (content.length <= maxChars) return content;
  const headLen = Math.floor(maxChars * 0.6);
  const tailLen = maxChars - headLen - 20;
  return `${content.slice(0, headLen)}\n...(省略 ${content.length - headLen - tailLen} 字符)...\n${content.slice(-tailLen)}`;
}
