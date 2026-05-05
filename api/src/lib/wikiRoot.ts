// Shared wiki root resolver · 所有写 wiki 的代码点都用这个函数, 避免不同 env 名导致写到不同目录
//
// env 优先级 (高→低):
//   1. MN_CLAUDE_WIKI_ROOT       (历史 · meeting-notes/claude-cli 用的)
//   2. CONTENT_LIBRARY_WIKI_ROOT (历史 · /content-library/wiki 路由用的)
//   3. WIKI_ROOT                 (新 · 推荐)
//   fallback: <repo-root>/data/content-wiki/<workspaceSlug ?? 'default'>
//
// 一个项目最好只 set 其中一个; 三个都 set 时优先 MN_CLAUDE_WIKI_ROOT.
//
// 相对路径 (env 或 API override): 相对「仓库根」解析 —— REPO_ROOT_FALLBACK =
//   cwd 去掉末尾的 /api 或 /api/...（与 api/migrations 里 repoRoot 语义一致），
//   避免在 api/ 下启动且 WIKI_ROOT=data/... 时误写到 api/data/content-wiki。
//
// Workspace 隔离 (2026-05-05+):
//   resolveWikiRoot({ workspaceSlug }) 让每个 workspace 拥有独立 vault:
//     data/content-wiki/<slug>/{concepts,domains,entities,sources}
//   现有 data/content-wiki/default/ 天然对应 slug='default' 的 default ws,
//   零迁移. caller 链需要从 mn_runs.workspace_id / request.auth.workspace.id
//   解析 slug (用 resolveWorkspaceSlug helper, 进程内缓存).

import { isAbsolute, resolve } from 'node:path';
import { query } from '../db/connection.js';

const REPO_ROOT_FALLBACK = process.cwd().replace(/\/api(?:\/.*)?$/, '');
const CONTENT_WIKI_BASE_REL = 'data/content-wiki';
const DEFAULT_WORKSPACE_SLUG = 'default';

export const DEFAULT_WIKI_ROOT_ABS = resolve(
  REPO_ROOT_FALLBACK,
  CONTENT_WIKI_BASE_REL,
  DEFAULT_WORKSPACE_SLUG,
);

export interface ResolveWikiRootOpts {
  /** 当前 workspace 的 slug; 缺省 fallback 到 'default' 兼容老路径 */
  workspaceSlug?: string | null;
  /** 显式覆盖路径 (绝对或仓库根相对) — 跳过所有 env / slug 逻辑 */
  override?: string | null;
  /**
   * strict=true 时, 缺 workspaceSlug 直接抛错.
   * caller 应该对"必须按 ws 写"的路径 (新会议 / 新 ws sources) 用 strict;
   * "全局共享" / 临时操作可以 strict=false 走 default fallback.
   */
  strict?: boolean;
}

function resolveWikiPathCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (isAbsolute(trimmed)) return resolve(trimmed);
  return resolve(REPO_ROOT_FALLBACK, trimmed);
}

function isValidSlug(slug: string): boolean {
  // slug 由 connection.ts:setupAuthSchema 生成, 限定 [a-z0-9-]+; 这里防注入式路径穿越
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
}

/**
 * 解析 wiki vault 根的绝对路径; 是所有写 wiki 代码的唯一入口.
 *
 * 兼容老 string 签名: resolveWikiRoot('/some/override') 仍工作 (按 override 处理).
 *
 * 优先级:
 *   1. opts.override / 老 string 参数
 *   2. process.env (MN_CLAUDE_WIKI_ROOT > CONTENT_LIBRARY_WIKI_ROOT > WIKI_ROOT)
 *   3. data/content-wiki/<workspaceSlug ?? 'default'>
 */
export function resolveWikiRoot(
  opts?: ResolveWikiRootOpts | string | null,
): string {
  // 老 string 签名兼容
  const normalized: ResolveWikiRootOpts =
    typeof opts === 'string' || opts === null || opts === undefined
      ? { override: typeof opts === 'string' ? opts : null }
      : opts;

  if (normalized.override && normalized.override.trim().length > 0) {
    return resolveWikiPathCandidate(normalized.override);
  }
  const envRoot =
    process.env.MN_CLAUDE_WIKI_ROOT
    ?? process.env.CONTENT_LIBRARY_WIKI_ROOT
    ?? process.env.WIKI_ROOT;
  if (envRoot && envRoot.trim().length > 0) {
    return resolveWikiPathCandidate(envRoot);
  }

  const slug = normalized.workspaceSlug?.trim() || '';
  if (!slug) {
    if (normalized.strict) {
      throw new Error(
        '[wikiRoot] strict=true 时必须传 workspaceSlug (caller 没正确从 ws 上下文派生)',
      );
    }
    return DEFAULT_WIKI_ROOT_ABS;
  }
  if (!isValidSlug(slug)) {
    throw new Error(`[wikiRoot] invalid workspaceSlug: ${slug}`);
  }
  return resolve(REPO_ROOT_FALLBACK, CONTENT_WIKI_BASE_REL, slug);
}

/** 解析 'meeting-chats' 等子路径, 返回绝对路径
 *
 * 兼容: 老 resolveWikiSubPath('a','b','c') 仍工作 (无 ws context 走 default).
 *       resolveWikiSubPath({ workspaceSlug: 's' }, 'a','b','c') 走 per-ws vault.
 */
export function resolveWikiSubPath(
  optsOrFirstSeg: ResolveWikiRootOpts | string,
  ...segments: string[]
): string {
  if (typeof optsOrFirstSeg === 'string') {
    return resolve(resolveWikiRoot(), optsOrFirstSeg, ...segments);
  }
  return resolve(resolveWikiRoot(optsOrFirstSeg), ...segments);
}

// ─── ws_id → slug 解析 (进程内缓存) ─────────────────────────────────────
//
// slug 由 INSERT INTO workspaces 时一次性确定 (connection.ts:1431-1438),
// PATCH /workspaces/:id 当前不允许改 slug (只改 name). 因此进程内永久缓存安全.
// 即使将来允许改 slug, 进程重启就清空缓存; 路径错位由 commit 4 的 rename 处理.

const slugCache = new Map<string, string>();

/**
 * 通过 workspace_id 查 slug, 用于构造 per-ws wiki 路径.
 * - workspaceId === null (api-key admin) → 返回 'default'
 * - 找不到 ws (异常情况) → 返回 'default' + 一行 warn 日志
 */
export async function resolveWorkspaceSlug(
  workspaceId: string | null | undefined,
): Promise<string> {
  if (!workspaceId) return DEFAULT_WORKSPACE_SLUG;
  const cached = slugCache.get(workspaceId);
  if (cached) return cached;
  try {
    const r = await query(
      `SELECT slug FROM workspaces WHERE id = $1::uuid LIMIT 1`,
      [workspaceId],
    );
    const slug = (r.rows[0] as { slug?: string } | undefined)?.slug;
    if (slug && isValidSlug(slug)) {
      slugCache.set(workspaceId, slug);
      return slug;
    }
    console.warn(
      `[wikiRoot] workspace ${workspaceId} 未找到合法 slug; 用 default 兜底`,
    );
    return DEFAULT_WORKSPACE_SLUG;
  } catch (e) {
    console.warn(
      `[wikiRoot] resolveWorkspaceSlug DB 错误: ${(e as Error).message}; 用 default 兜底`,
    );
    return DEFAULT_WORKSPACE_SLUG;
  }
}

/** 测试 / dev 工具: 清空 slug 缓存 */
export function clearWorkspaceSlugCache(): void {
  slugCache.clear();
}
