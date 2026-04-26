// parse/transcriptParser.ts — 真实 ingest（取代原 noop AssetsAi.parseMeeting）
//
// 输入：assets.content 任意纯文本
// 输出：segments + participants + cleaned transcript
//
// 解析规则（按命中优先级）：
//   1. "说话人 N HH:MM[:SS]"（中文腾讯会议导出格式）
//   2. "[Name] HH:MM[:SS]"
//   3. "Name: 内容"（行首冒号）
//   4. 回退：按空行切段，speaker 留空
//
// 不调用 LLM；纯本地正则。完全离线、确定性、可在 sandbox 跑。

export interface ParsedSegment {
  speaker?: string;
  start?: number;       // 秒
  end?: number;
  text: string;
}

export interface ParseTranscriptResult {
  cleaned: string;
  segments: ParsedSegment[];
  participants: Array<{ name: string; role?: string; segmentCount: number }>;
  stats: {
    rawLength: number;
    cleanedLength: number;
    segmentCount: number;
    speakerCount: number;
    durationSec: number | null;
  };
}

/** 把 "HH:MM:SS" / "MM:SS" 转秒。不合法返回 null。 */
function timeToSec(t: string | undefined): number | undefined {
  if (!t) return undefined;
  const parts = t.split(':').map((x) => Number(x));
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return undefined;
}

/** 文档清洗：去 BOM / 统一换行 / 折叠空行 */
function cleanText(raw: string): string {
  return raw
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const RE_CN_SPEAKER = /^(说话人\s*\d+|[一-龥A-Za-z][一-龥A-Za-z0-9_·\s]{0,30}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
const RE_BRACKET_SPEAKER = /^\[\s*([^\]]{1,30})\s*\]\s*(\d{1,2}:\d{2}(?::\d{2})?)?\s*[:：]?\s*(.*)$/;
const RE_COLON_SPEAKER = /^([一-龥A-Za-z][一-龥A-Za-z0-9_·\s]{0,30})[:：]\s*(.+)$/;

// 中文短填充词（嗯/哦/对/啊/呃 等）若被误判为 speaker 会过度切段，过滤之
const ZH_FILLER_SPEAKER = /^(嗯|哦|对|啊|呃|额|那|这)$/;

export function parseTranscript(raw: string): ParseTranscriptResult {
  // 空输入早退
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return {
      cleaned: '',
      segments: [],
      participants: [],
      stats: { rawLength: 0, cleanedLength: 0, segmentCount: 0, speakerCount: 0, durationSec: null },
    };
  }
  const cleaned = cleanText(raw);
  const lines = cleaned.split('\n');
  const segments: ParsedSegment[] = [];
  let cur: ParsedSegment | null = null;

  const flush = () => {
    if (cur && cur.text.trim().length > 0) segments.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }

    // 跳过元信息行（关键词:、文字记录:、日期标题等）
    if (/^(关键词|文字记录|参会人|主题|时间)\s*[:：]/.test(line)) continue;
    if (/^\d{4}年\d{1,2}月\d{1,2}日/.test(line)) continue;

    const mCN = line.match(RE_CN_SPEAKER);
    if (mCN) {
      flush();
      cur = { speaker: mCN[1].replace(/\s+/g, ''), start: timeToSec(mCN[2]), text: '' };
      continue;
    }
    const mBracket = line.match(RE_BRACKET_SPEAKER);
    if (mBracket && (mBracket[2] || mBracket[3])) {
      flush();
      cur = {
        speaker: mBracket[1].trim(),
        start: timeToSec(mBracket[2]),
        text: (mBracket[3] || '').trim(),
      };
      continue;
    }
    const mColon = line.match(RE_COLON_SPEAKER);
    if (
      mColon &&
      mColon[1].length <= 12 &&
      !/[，。？！,.?!]/.test(mColon[1]) &&
      !ZH_FILLER_SPEAKER.test(mColon[1].trim())
    ) {
      flush();
      cur = { speaker: mColon[1].trim(), text: mColon[2].trim() };
      continue;
    }
    if (!cur) cur = { text: '' };
    cur.text += (cur.text ? '\n' : '') + line;
  }
  flush();

  // end 时间：用下一段的 start 推断
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].start != null && segments[i + 1].start != null) {
      segments[i].end = segments[i + 1].start;
    }
  }

  // 参与者聚合
  const speakerMap = new Map<string, number>();
  for (const s of segments) {
    if (!s.speaker) continue;
    speakerMap.set(s.speaker, (speakerMap.get(s.speaker) ?? 0) + 1);
  }
  const participants = [...speakerMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, segmentCount: count }));

  const lastWithStart = [...segments].reverse().find((s) => s.start != null);
  const durationSec = lastWithStart?.start ?? null;

  return {
    cleaned,
    segments,
    participants,
    stats: {
      rawLength: raw.length,
      cleanedLength: cleaned.length,
      segmentCount: segments.length,
      speakerCount: speakerMap.size,
      durationSec,
    },
  };
}
