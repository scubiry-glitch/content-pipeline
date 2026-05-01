// Shared wiki root resolver · 所有写 wiki 的代码点都用这个函数, 避免不同 env 名导致写到不同目录
//
// env 优先级 (高→低):
//   1. MN_CLAUDE_WIKI_ROOT       (历史 · meeting-notes/claude-cli 用的)
//   2. CONTENT_LIBRARY_WIKI_ROOT (历史 · /content-library/wiki 路由用的)
//   3. WIKI_ROOT                 (新 · 推荐)
//   fallback: <repo-root>/data/content-wiki/default
//
// 一个项目最好只 set 其中一个; 三个都 set 时优先 MN_CLAUDE_WIKI_ROOT.
//
// 相对路径 (env 或 API override): 相对「仓库根」解析 —— REPO_ROOT_FALLBACK =
//   cwd 去掉末尾的 /api 或 /api/...（与 api/migrations 里 repoRoot 语义一致），
//   避免在 api/ 下启动且 WIKI_ROOT=data/... 时误写到 api/data/content-wiki。

import { isAbsolute, resolve } from 'node:path';

const REPO_ROOT_FALLBACK = process.cwd().replace(/\/api(?:\/.*)?$/, '');
const DEFAULT_WIKI_ROOT_REL = 'data/content-wiki/default';

export const DEFAULT_WIKI_ROOT_ABS = resolve(REPO_ROOT_FALLBACK, DEFAULT_WIKI_ROOT_REL);

function resolveWikiPathCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (isAbsolute(trimmed)) return resolve(trimmed);
  return resolve(REPO_ROOT_FALLBACK, trimmed);
}

/** 解析 wiki vault 根的绝对路径; 是所有写 wiki 代码的唯一入口 */
export function resolveWikiRoot(override?: string | null): string {
  if (override && override.trim().length > 0) return resolveWikiPathCandidate(override);
  const envRoot =
    process.env.MN_CLAUDE_WIKI_ROOT
    ?? process.env.CONTENT_LIBRARY_WIKI_ROOT
    ?? process.env.WIKI_ROOT;
  if (envRoot && envRoot.trim().length > 0) return resolveWikiPathCandidate(envRoot);
  return DEFAULT_WIKI_ROOT_ABS;
}

/** 解析 'meeting-chats' 等子路径, 返回绝对路径 */
export function resolveWikiSubPath(...segments: string[]): string {
  return resolve(resolveWikiRoot(), ...segments);
}
