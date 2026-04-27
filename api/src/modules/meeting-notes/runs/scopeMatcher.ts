// runs/scopeMatcher.ts — 按内容自动匹配 mn_scopes 并绑定 meeting
//
// 背景：用户上传会议后，meeting 默认无 scope 绑定（mn_scope_members 为空）。
// 这导致：
//   1) axes 写入 scope_id 时只能 NULL（虽已用 normalizeScopeIdForPersist 兜底，但 scope-level
//      聚合永远拿不到该 meeting 的数据）
//   2) /scopes/:id/decisions / risks / open-questions 等端点查不到该 meeting
//   3) 跨会议纵向视图（belief drift / decision-tree / commitment-rate）无法关联
//
// 这个模块在 runEngine.execute() 的 dispatch 阶段之后 / axes 阶段之前调用，
// 从 mn_scopes(active) 列表里按 scope.name 在 meeting.title + 前缀 content 里做关键词
// 命中匹配，命中即写入 mn_scope_members。
//
// Phase 1（当前）：纯关键词匹配，零 LLM 调用。每个 scope.name 至少 2 字、出现一次即算
//   命中。多 scope 命中时全部绑定（用户后续可手工 unbind 不需要的）。
// Phase 2（未来）：加 LLM 调用让模型从 scopes 列表里挑出"最相关的 1-3 个"，避免泛匹配；
//   同时支持给 mn_scopes 加 keywords[] / aliases[] 列以提升精度。

import type { DatabaseAdapter } from '../types.js';

export interface ScopeMatchResult {
  matchedCount: number;
  newlyBoundCount: number;
  matched: Array<{
    scopeId: string;
    kind: 'project' | 'client' | 'topic';
    name: string;
    matchedKeyword: string;
    occurrences: number;
    newlyBound: boolean;
  }>;
}

/**
 * 把候选 scope.name 转成可搜索关键词。
 *
 * 策略（从精到粗）：
 *   1) 完整 name 整体匹配（最精确，权重最高，但中文短语 like "装修分期" 在
 *      "装修贷款与分期付款" 这种 title 里命不中）
 *   2) 显式分隔符（空格/顿号/逗号/-/·/斜杠/括号）切出来的子词
 *   3) 中文 ≥3 字短语再按 2-char 滑动窗口切出 bigram，让"装修分期" → "装修"+"修分"+"分期"
 *      在 title "装修贷款与分期付款" 里也能命中 2 处（装修 + 分期）
 * 短词（≤1 字）一律跳过避免误伤。
 */
function tokenize(name: string): string[] {
  const trimmed = (name ?? '').trim();
  if (trimmed.length < 2) return [];
  const tokens = new Set<string>();
  tokens.add(trimmed);
  for (const part of trimmed.split(/[\s、，,\-·/()（）]+/)) {
    const t = part.trim();
    if (t.length >= 2) tokens.add(t);
  }
  // 中文 bigram：仅对 ≥3 字的子串做切分（避免把"AI"这种短词再拆烂）
  for (const t of [...tokens]) {
    if (t.length < 3) continue;
    if (!/[一-鿿]/.test(t)) continue; // 非中文跳过（英文 bigram 没意义）
    for (let i = 0; i + 2 <= t.length; i++) {
      const bg = t.slice(i, i + 2);
      if (/^[一-鿿]{2}$/.test(bg)) tokens.add(bg);
    }
  }
  return [...tokens];
}

/** 数 needle 在 haystack 出现次数（区分大小写不敏感，全局） */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle || needle.length < 2) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = h.indexOf(n, idx)) !== -1) {
    count++;
    idx += n.length;
  }
  return count;
}

/**
 * 自动匹配 + 绑定。读取 meeting 的 title / content（截前 16 KB 防长会议拖慢），
 * 与 mn_scopes(status='active') 做关键词命中扫描。
 *
 * 不会重复绑定已存在的 scope_id × meeting_id（PK 防重）。
 */
export async function autoMatchAndBindScopes(
  db: DatabaseAdapter,
  meetingId: string,
  opts: { runId?: string; contentLimit?: number; minOccurrences?: number } = {},
): Promise<ScopeMatchResult> {
  const contentLimit = opts.contentLimit ?? 16 * 1024;
  const minOcc = opts.minOccurrences ?? 1;

  // 1) 读 meeting title + 头部 content
  // 历史数据里 assets.content 偶有 invalid UTF-8 字节（mammoth 提取 docx 时偶发 encoding bug）
  // → PG 报 "invalid byte sequence for encoding UTF8" → 整个 SELECT 失败
  // 防御策略：先只读 title（可靠），再单独读 content_head 包一层 try/catch；content 不可读时降级
  // 到仅 title + metadata 摘要做匹配。
  let title = '';
  let contentHead = '';
  try {
    const tr = await db.query(
      `SELECT COALESCE(title, metadata->>'title', '') AS title FROM assets WHERE id = $1`,
      [meetingId],
    );
    if (tr.rows.length === 0) {
      return { matchedCount: 0, newlyBoundCount: 0, matched: [] };
    }
    title = String(tr.rows[0].title ?? '');
  } catch (e) {
    console.warn('[scopeMatcher] read title failed:', (e as Error).message);
  }
  try {
    // SUBSTRING 按字符切；EncodeLB 处理避免半截 UTF-8 char。失败时 catch 走只 title 路径。
    const cr = await db.query(
      `SELECT SUBSTRING(content FROM 1 FOR $2) AS content_head FROM assets WHERE id = $1`,
      [meetingId, contentLimit],
    );
    contentHead = String(cr.rows[0]?.content_head ?? '');
  } catch (e) {
    // 0xe5 这类 invalid byte 直接降级到仅 title 匹配
    console.warn('[scopeMatcher] read content_head failed (degrading to title-only):', (e as Error).message);
  }
  const haystack = `${title}\n\n${contentHead}`;

  if (haystack.trim().length < 2) {
    return { matchedCount: 0, newlyBoundCount: 0, matched: [] };
  }

  // 2) 列出所有 active scope 候选
  const sr = await db.query(
    `SELECT id, kind, name FROM mn_scopes
      WHERE status = 'active' AND name IS NOT NULL AND length(name) >= 2
      ORDER BY length(name) DESC`, // 先匹配长的避免短名错伤
  );
  if (sr.rows.length === 0) {
    return { matchedCount: 0, newlyBoundCount: 0, matched: [] };
  }

  // 3) 对每个 scope 做关键词命中扫描
  const matched: ScopeMatchResult['matched'] = [];
  for (const scope of sr.rows as Array<{ id: string; kind: 'project' | 'client' | 'topic'; name: string }>) {
    let bestKeyword = '';
    let bestOcc = 0;
    for (const kw of tokenize(scope.name)) {
      const occ = countOccurrences(haystack, kw);
      if (occ > bestOcc) {
        bestOcc = occ;
        bestKeyword = kw;
      }
    }
    if (bestOcc >= minOcc) {
      matched.push({
        scopeId: scope.id,
        kind: scope.kind,
        name: scope.name,
        matchedKeyword: bestKeyword,
        occurrences: bestOcc,
        newlyBound: false, // 后面写入时再翻
      });
    }
  }

  if (matched.length === 0) {
    return { matchedCount: 0, newlyBoundCount: 0, matched };
  }

  // 4) 一次性查已存在的绑定，避免每条 INSERT 触发 ON CONFLICT
  const scopeIds = matched.map((m) => m.scopeId);
  const existingRes = await db.query(
    `SELECT scope_id FROM mn_scope_members
      WHERE meeting_id = $1 AND scope_id = ANY($2::uuid[])`,
    [meetingId, scopeIds],
  );
  const existingSet = new Set<string>(existingRes.rows.map((r: any) => String(r.scope_id)));

  // 5) 写入新绑定（PK 是 (scope_id, meeting_id)，ON CONFLICT 防重）
  let newlyBound = 0;
  for (const m of matched) {
    if (existingSet.has(m.scopeId)) {
      m.newlyBound = false;
      continue;
    }
    try {
      await db.query(
        `INSERT INTO mn_scope_members (scope_id, meeting_id, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (scope_id, meeting_id) DO NOTHING`,
        [
          m.scopeId,
          meetingId,
          `auto-match: 关键词「${m.matchedKeyword}」命中 ${m.occurrences} 次` +
            (opts.runId ? ` (run ${opts.runId.slice(0, 8)})` : ''),
        ],
      );
      m.newlyBound = true;
      newlyBound++;
    } catch (e) {
      console.warn(`[scopeMatcher] bind failed for scope=${m.scopeId.slice(0, 8)}:`, (e as Error).message);
    }
  }

  return { matchedCount: matched.length, newlyBoundCount: newlyBound, matched };
}
