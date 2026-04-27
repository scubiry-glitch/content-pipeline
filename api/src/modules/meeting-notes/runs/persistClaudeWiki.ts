// runs/persistClaudeWiki.ts — 把 Claude CLI 输出的 wikiMarkdown 直接写到 obsidian vault
//
// 默认 vault 根: <repo-root>/data/content-wiki/default/{entities,sources,concepts,.obsidian}/
// 跟现有 wikiGenerator.generate() 用的同一目录约定（兼容 /content-library/wiki 页面）。
//
// 写法：
//   1. sources/<meetingId>.md ← wiki.sourceEntry 直接 fs.writeFile (覆盖)。这是 claude 写完
//      就立刻可读的会议级索引页 (wikiGenerator 之后跑也会重写这个文件，基于 content_facts，
//      两者基本同信源不冲突)。
//   2. entities/<entityName>.md ← wiki.entityUpdates[].appendMarkdown 选择性追加：
//      a) SELECT id FROM content_entities WHERE name = entityName 命中才处理（不创建新 entity）
//      b) 文件不存在则跳过 (wikiGenerator 还没生成 → 留给它先建)
//      c) 命中 + 文件存在 → 末尾 append "\n## Claude CLI · meeting <id>\n<appendMarkdown>\n"

import type { MeetingNotesDeps } from '../types.js';
import { writeFile, appendFile, mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

export interface ClaudeWikiOutput {
  sourceEntry?: string;
  entityUpdates?: Array<{ entityName: string; appendMarkdown: string }>;
}

const REPO_ROOT_FALLBACK = process.cwd().replace(/\/api(?:\/.*)?$/, ''); // 万一 cwd 在 api/ 里
const DEFAULT_WIKI_ROOT_REL = 'data/content-wiki/default';

/**
 * 解析 wikiRoot：env > fallback。返回绝对路径。
 */
export function resolveWikiRoot(): string {
  const envRoot = process.env.MN_CLAUDE_WIKI_ROOT;
  if (envRoot && envRoot.trim().length > 0) {
    return resolve(envRoot.trim());
  }
  // 项目内默认路径：<repo>/data/content-wiki/default
  return resolve(REPO_ROOT_FALLBACK, DEFAULT_WIKI_ROOT_REL);
}

async function ensureWikiDirs(wikiRoot: string): Promise<void> {
  await mkdir(join(wikiRoot, 'sources'), { recursive: true });
  await mkdir(join(wikiRoot, 'entities'), { recursive: true });
}

/** 文件名 sanitize: 替换斜杠 / 控制符 / 系统保留字符，避免 fs 写错路径 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, 200);
}

export async function persistClaudeWiki(
  deps: MeetingNotesDeps,
  meetingId: string,
  wiki: ClaudeWikiOutput,
  wikiRoot?: string,
): Promise<{ sourceWritten: boolean; entityAppended: number }> {
  const root = wikiRoot ?? resolveWikiRoot();
  let sourceWritten = false;
  let entityAppended = 0;

  // 启动时确保目录存在
  try {
    await ensureWikiDirs(root);
  } catch (e: any) {
    console.warn('[persistClaudeWiki] mkdir failed:', e?.message, '· root=', root);
    return { sourceWritten, entityAppended };
  }

  // 1) sources/<meetingId>.md
  if (typeof wiki?.sourceEntry === 'string' && wiki.sourceEntry.trim().length > 0) {
    const sourcePath = join(root, 'sources', `${sanitizeFilename(meetingId)}.md`);
    try {
      await writeFile(sourcePath, wiki.sourceEntry, 'utf8');
      sourceWritten = true;
    } catch (e: any) {
      console.warn('[persistClaudeWiki] writeFile sources failed:', e?.message);
    }
  }

  // 2) entities/<entityName>.md 选择性追加
  const updates = Array.isArray(wiki?.entityUpdates) ? wiki.entityUpdates : [];
  for (const u of updates) {
    const entityName = String(u?.entityName ?? '').trim();
    const appendMd = String(u?.appendMarkdown ?? '').trim();
    if (!entityName || !appendMd) continue;

    // 2a) content_entities 命中检查
    let exists = false;
    try {
      const r = await deps.db.query(
        `SELECT id FROM content_entities WHERE name = $1 LIMIT 1`,
        [entityName],
      );
      exists = (r.rows?.length ?? 0) > 0;
    } catch (e: any) {
      console.warn('[persistClaudeWiki] content_entities check failed:', e?.message);
      continue;
    }
    if (!exists) continue; // 跳过未在 content_entities 注册过的实体，避免脏数据

    // 2b) 文件存在检查（wikiGenerator 还没建过则跳过）
    const entityPath = join(root, 'entities', `${sanitizeFilename(entityName)}.md`);
    if (!existsSync(entityPath)) continue;

    // 2c) 追加内容
    const block = `\n\n## Claude CLI · meeting ${meetingId}\n${appendMd}\n`;
    try {
      await appendFile(entityPath, block, 'utf8');
      entityAppended += 1;
    } catch (e: any) {
      console.warn('[persistClaudeWiki] appendFile entities failed:', e?.message, '| entity:', entityName);
    }
  }

  if (sourceWritten || entityAppended > 0) {
    console.log(
      `[persistClaudeWiki] meeting ${meetingId}: source=${sourceWritten ? 'written' : 'skip'}, entities appended=${entityAppended}, root=${root}`,
    );
  }
  return { sourceWritten, entityAppended };
}

// 防止 access 未使用导致 unused-import warning（保留 import 以备后续 ENOENT 检测扩展）
void access;
