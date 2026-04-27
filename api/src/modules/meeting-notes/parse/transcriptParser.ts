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
    // docx → 纯文本时，mammoth 常把 "说话人N HH:MM\n正文..." 同段不同 run 拼成单行
    // ("说话人1 00:00在假设...")，导致 RE_CN_SPEAKER 因 `\s*$` 不命中、降级到 RE_COLON_SPEAKER
    // 把时间戳后的内容当 name 切，结果产出几十上百个假 "说话人N MM" 参与者。
    // 这里在 speaker label 后强插换行，让 RE_CN_SPEAKER 单行命中。
    .replace(/(说话人\s*\d+\s+\d{1,2}:\d{2}(?::\d{2})?)\s*(?=\S)/g, '$1\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const RE_CN_SPEAKER = /^(说话人\s*\d+|[一-龥A-Za-z][一-龥A-Za-z0-9_·\s]{0,30}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
const RE_BRACKET_SPEAKER = /^\[\s*([^\]]{1,30})\s*\]\s*(\d{1,2}:\d{2}(?::\d{2})?)?\s*[:：]?\s*(.*)$/;
const RE_COLON_SPEAKER = /^([一-龥A-Za-z][一-龥A-Za-z0-9_·\s]{0,30})[:：]\s*(.+)$/;

// 中文短填充词（嗯/哦/对/啊/呃 等）若被误判为 speaker 会过度切段，过滤之
const ZH_FILLER_SPEAKER = /^(嗯|哦|对|啊|呃|额|那|这)$/;

/**
 * 急救#3 fallback：当 3 个 speaker 正则全没命中时，把全文按段落切。
 * 切分线索（按优先级试一遍）：
 *   1. 空行（\n\n+） — 标准 markdown / docx 段落分隔
 *   2. 章节标题行 "==="/"---"/"###"/"##" 后续段
 *   3. 中文章节号 "一、二、三、" 或 "（一）（二）" 起始行
 *   4. 单换行连续 N 行后强切（兜底，避免单段过长）
 */
function splitByParagraphs(text: string): string[] {
  if (!text) return [];
  // 1) 优先按空行切（最可靠的段落分隔符）
  let parts = text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return mergeShort(parts);

  // 2) 章节标题切
  const headingRE = /(^|\n)(={3,}|-{3,}|#{1,4}\s|（?[一二三四五六七八九十]+[、）])/g;
  parts = text.split(headingRE).map((s) => (s ?? '').trim()).filter((s) => s && s.length > 30);
  if (parts.length >= 3) return mergeShort(parts);

  // 3) 兜底：每 ~1500 字硬切（保留段落完整性的近似）
  const slabSize = 1500;
  const slabs: string[] = [];
  for (let i = 0; i < text.length; i += slabSize) {
    slabs.push(text.slice(i, i + slabSize));
  }
  return slabs;
}

/** 把过短的段（<200 字）合并到前一段，避免下游每个段都短到没意义 */
function mergeShort(parts: string[]): string[] {
  const merged: string[] = [];
  for (const p of parts) {
    if (p.length < 200 && merged.length > 0) {
      merged[merged.length - 1] += '\n\n' + p;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

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

  // 急救#3 (Opt-8) fallback：3 个 speaker 正则全没命中 → segments 只有
  // 0 段或 1 大段（整篇被当一段）。降级到段落级切分:按空行、长换行、
  // 标题（"==="/"---"/"###"/章节号"一、二、"）切分。
  // 这样下游 chunked LLM 抽取仍然能拿到合理粒度。
  const noSpeakerDetected = segments.every((s) => !s.speaker);
  if (noSpeakerDetected && cleaned.length > 1500) {
    const fallback = splitByParagraphs(cleaned);
    // 仅当回退能切出 ≥3 段才采用（避免反而比"1 大段"更糟）
    if (fallback.length >= 3) {
      segments.length = 0;
      for (const para of fallback) segments.push({ text: para });
    }
  }

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
