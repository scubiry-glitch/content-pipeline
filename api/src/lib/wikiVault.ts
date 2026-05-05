// wikiVault — per-workspace vault 目录的初始化 / 路径安全校验
//
// 与 wikiRoot.ts 的分工:
//   wikiRoot.ts 只解析路径字符串 (无 IO);
//   wikiVault.ts 做实际 fs 操作 + 跨 ws 路径越权防御.
//
// 调用方:
//   - POST /workspaces 创建后立即 initWorkspaceVault(slug, name)
//   - GET /content-library/wiki/files / /wiki/preview 用 isPathInWorkspaceVault
//     校验 caller 自带的 query.wikiRoot 是否在当前 ws 范围内

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute, relative } from 'node:path';
import { resolveWikiRoot } from './wikiRoot.js';

// 与 wikiRoot.ts 同款 REPO_ROOT 推导 — 让相对路径解析与 resolveWikiRoot 行为一致
// (避免 cwd=api/ 时 resolve('data/...') 落到 api/data/, 而 wikiRoot 落到 repo/data/)
const REPO_ROOT_FALLBACK = process.cwd().replace(/\/api(?:\/.*)?$/, '');

const VAULT_SKELETON_DIRS = [
  'concepts',
  'domains',
  'entities',
  'sources',
  'sources/meeting',
];

/**
 * 给新建 workspace 初始化空 vault 骨架.
 * - 已存在的目录 / 文件不覆盖, 完全幂等
 * - 失败不抛 (caller best-effort), 但返回 ok=false 让上层日志
 */
export async function initWorkspaceVault(
  slug: string,
  name: string,
): Promise<{ ok: boolean; root?: string; error?: string }> {
  try {
    const root = resolveWikiRoot({ workspaceSlug: slug, strict: true });
    for (const sub of VAULT_SKELETON_DIRS) {
      await mkdir(resolve(root, sub), { recursive: true });
    }
    // index.md 占位 (Obsidian 显示用); flag='wx' 已存在不覆盖
    const indexPath = resolve(root, 'index.md');
    const indexBody = `# ${name}\n\n> Workspace vault · slug=\`${slug}\`\n\n*由 workspace 创建时自动生成的空骨架. 在此填写本 ws 的内容地图.*\n`;
    try {
      await writeFile(indexPath, indexBody, { flag: 'wx' });
    } catch {
      // EEXIST → 已有 index.md, OK
    }
    return { ok: true, root };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 校验 caller 提供的 wikiRoot 字符串是否落在指定 ws 的 vault 内.
 *
 * 通过条件:
 *   1. wikiRoot resolve 后等于 ws vault 根
 *   2. 或者 wikiRoot 是该 vault 的子路径 (resolve 后 relative 不以 .. 开头, 也不是绝对路径)
 *
 * 对路径穿越防御 (wikiRoot=/etc/passwd, ../../tmp 等) 直接返回 false.
 */
export function isPathInWorkspaceVault(
  wikiRootInput: string,
  currentSlug: string,
): boolean {
  if (typeof wikiRootInput !== 'string' || !wikiRootInput.trim()) return false;
  let expected: string;
  try {
    expected = resolveWikiRoot({ workspaceSlug: currentSlug, strict: true });
  } catch {
    return false;
  }
  const provided = isAbsolute(wikiRootInput)
    ? resolve(wikiRootInput)
    : resolve(REPO_ROOT_FALLBACK, wikiRootInput);
  const rel = relative(expected, provided);
  // rel 为空 = 完全相等; 不以 .. 开头 + 不是绝对路径 = 在 vault 内
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
