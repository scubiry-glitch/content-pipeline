// runs/persistClaudeWiki.ts — Phase H+ · 把 Claude CLI 输出的 wikiMarkdown 写到 obsidian vault
//
// vault 根: <repo-root>/data/content-wiki/default/
//   ├── sources/meeting/<meetingId>/_index.md   ← claude-cli 写 (覆盖, Phase H+ 路径)
//   ├── entities/{person,org,...}/<slug>.md      ← claude-cli 创建 + dedup 追加
//   └── concepts/{mental-model,judgment,bias,counterfactual}/<slug>.md  ← 同上
//
// 写入规则 (per plan §C.2):
//   - 文件不存在 → 用 frontmatter (app=meeting-notes, generatedBy=claude-cli) + initialContent
//                  + wrapBlock(blockId, blockContent) 创建
//   - 文件存在 → 读 → parseFrontmatter → upsertBlock(blockId, blockContent) → 写回
//                · 不动 owner app (preserve), 只更新 lastEditedBy / lastEditedAt
//                · blocks 数组 dedup by id 后追加
//
// 兼容旧契约 (entityName + appendMarkdown): 仍走老 "必须 content_entities 命中 + 文件存在才追加" 路径

import type { MeetingNotesDeps } from '../types.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import {
  parseFrontmatter,
  renderFrontmatter,
  hasBlock,
  upsertBlock,
  wrapBlock,
  type WikiFrontmatter,
  type WikiBlockMeta,
} from '../../content-library/wiki/wikiFrontmatter.js';
import { slugify } from '../../content-library/wiki/templates.js';

export interface ClaudeWikiOutput {
  sourceEntry?: string;
  entityUpdates?: Array<{
    // Phase H 新形态
    type?: 'entity' | 'concept';
    subtype?: 'person' | 'org' | 'product' | 'project' | 'event'
            | 'mental-model' | 'judgment' | 'bias' | 'counterfactual';
    canonicalName?: string;
    aliases?: string[];
    initialContent?: string;
    blockContent?: string;
    // 旧契约兼容
    entityName?: string;
    appendMarkdown?: string;
  }>;
}

const ENTITY_SUBTYPES = ['person', 'org', 'product', 'project', 'event', 'location'] as const;
const CONCEPT_SUBTYPES = [
  'mental-model', 'judgment', 'bias', 'counterfactual',
  'metric', 'technology', 'financial-instrument', 'business-model',
  'regulation', 'demographic',
] as const;

// Re-export shared resolver, so existing callers (runEngine 等) 仍能从这里 import
import { resolveWikiRoot } from '../../../lib/wikiRoot.js';
export { resolveWikiRoot };

async function ensureWikiDirs(wikiRoot: string): Promise<void> {
  // Phase H+ · sources/<kind>/ 分子目录
  await mkdir(join(wikiRoot, 'sources', 'meeting'), { recursive: true });
  for (const sub of ENTITY_SUBTYPES) {
    await mkdir(join(wikiRoot, 'entities', sub), { recursive: true });
  }
  for (const sub of CONCEPT_SUBTYPES) {
    await mkdir(join(wikiRoot, 'concepts', sub), { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, 200);
}

/** 计算 entity / concept 在 vault 内的相对路径 */
function resolveEntityPath(
  wikiRoot: string,
  type: 'entity' | 'concept',
  subtype: string,
  canonicalName: string,
): string {
  const slug = slugify(canonicalName);
  const dir = type === 'entity' ? `entities/${subtype}` : `concepts/${subtype}`;
  return join(wikiRoot, dir, `${sanitizeFilename(slug)}.md`);
}

function isValidEntitySubtype(s: string | undefined, type: 'entity' | 'concept'): boolean {
  if (!s) return false;
  if (type === 'entity') return (ENTITY_SUBTYPES as readonly string[]).includes(s);
  return (CONCEPT_SUBTYPES as readonly string[]).includes(s);
}

/** 把 meeting title 变成 fs-friendly slug + id 后缀, 与 axes/scope generator 同步 */
function buildMeetingDirSlug(id: string, title: string | null | undefined): string {
  const cleanTitle = String(title || 'untitled')
    .replace(/\.docx?$|\.txt$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${cleanTitle || 'untitled'}-${id.slice(0, 8)}`;
}

export async function persistClaudeWiki(
  deps: MeetingNotesDeps,
  meetingId: string,
  wiki: ClaudeWikiOutput,
  wikiRoot?: string,
  meetingTitle?: string | null,
): Promise<{
  sourceWritten: boolean;
  entityCreated: number;
  entityUpdated: number;
  legacyAppended: number;
  skipped: number;
}> {
  const root = wikiRoot ?? resolveWikiRoot();
  let sourceWritten = false;
  let entityCreated = 0;
  let entityUpdated = 0;
  let legacyAppended = 0;
  let skipped = 0;

  try {
    await ensureWikiDirs(root);
  } catch (e: any) {
    console.warn('[persistClaudeWiki] mkdir failed:', e?.message, '· root=', root);
    return { sourceWritten, entityCreated, entityUpdated, legacyAppended, skipped };
  }

  // ─── 1. sources/meeting/<title-slug>-<id8>/_index.md (覆盖, Phase H+ 路径) ───
  if (typeof wiki?.sourceEntry === 'string' && wiki.sourceEntry.trim().length > 0) {
    // 优先用 caller 传入的 title; 没传则从 assets 表 lookup; 都不行 fallback 到 meetingId 形态
    let title = meetingTitle ?? null;
    if (!title) {
      try {
        const r = await deps.db.query(
          `SELECT COALESCE(title, metadata->>'title') AS title FROM assets WHERE id::text = $1 LIMIT 1`,
          [meetingId],
        );
        title = r.rows[0]?.title ?? null;
      } catch {/* swallow */}
    }
    const dirSlug = buildMeetingDirSlug(meetingId, title);
    const meetingDir = join(root, 'sources', 'meeting', sanitizeFilename(dirSlug));
    const sourcePath = join(meetingDir, '_index.md');
    try {
      await mkdir(meetingDir, { recursive: true });
      await writeFile(sourcePath, wiki.sourceEntry, 'utf8');
      sourceWritten = true;
    } catch (e: any) {
      console.warn('[persistClaudeWiki] writeFile sources/meeting failed:', e?.message);
    }
  }

  // ─── 2. entityUpdates 路由 (新契约 vs 旧契约) ─────────────────────────────
  const updates = Array.isArray(wiki?.entityUpdates) ? wiki.entityUpdates : [];
  const blockId = `meeting-${meetingId.slice(0, 8)}`;
  const now = new Date().toISOString();

  for (const u of updates) {
    // 新契约: type + subtype + canonicalName + blockContent (initialContent 可选)
    if (u?.type && u?.subtype && u?.canonicalName && u?.blockContent) {
      const result = await handleNewEntityUpdate(
        root,
        u as Required<Pick<NonNullable<ClaudeWikiOutput['entityUpdates']>[number],
          'type' | 'subtype' | 'canonicalName' | 'blockContent'>> & { aliases?: string[]; initialContent?: string },
        meetingId,
        blockId,
        now,
      );
      if (result === 'created') entityCreated += 1;
      else if (result === 'updated') entityUpdated += 1;
      else skipped += 1;
      continue;
    }

    // 旧契约: entityName + appendMarkdown (兼容期保留)
    if (u?.entityName && u?.appendMarkdown) {
      const ok = await handleLegacyEntityUpdate(
        deps, root, u.entityName, u.appendMarkdown, meetingId,
      );
      if (ok) legacyAppended += 1;
      else skipped += 1;
      continue;
    }

    skipped += 1;
  }

  if (sourceWritten || entityCreated > 0 || entityUpdated > 0 || legacyAppended > 0) {
    console.log(
      `[persistClaudeWiki] meeting ${meetingId}: source=${sourceWritten ? '✓' : '✗'}, ` +
      `created=${entityCreated}, updated=${entityUpdated}, legacy=${legacyAppended}, skip=${skipped}, ` +
      `root=${root}`,
    );
  }
  return { sourceWritten, entityCreated, entityUpdated, legacyAppended, skipped };
}

// ============================================================
// 新契约 · 创建或 dedup 追加
// ============================================================

async function handleNewEntityUpdate(
  wikiRoot: string,
  upd: {
    type: 'entity' | 'concept';
    subtype: string;
    canonicalName: string;
    aliases?: string[];
    initialContent?: string;
    blockContent: string;
  },
  meetingId: string,
  blockId: string,
  now: string,
): Promise<'created' | 'updated' | 'skipped'> {
  if (!isValidEntitySubtype(upd.subtype, upd.type)) {
    console.warn(`[persistClaudeWiki] invalid subtype '${upd.subtype}' for type '${upd.type}', skip ${upd.canonicalName}`);
    return 'skipped';
  }

  const filePath = resolveEntityPath(wikiRoot, upd.type, upd.subtype, upd.canonicalName);
  const blockMeta: WikiBlockMeta = {
    id: blockId, app: 'meeting-notes', via: 'claude-cli', meetingId, addedAt: now,
  };
  // 顶部 ## 标题让用户在 obsidian 看清楚来源；包在 <!-- block:xxx --> 注释里
  const blockBody = `## Claude CLI · meeting ${meetingId} · ${now.slice(0, 10)}\n\n${upd.blockContent.trim()}`;

  if (!existsSync(filePath)) {
    // 创建
    const fm: WikiFrontmatter = {
      type: upd.type,
      subtype: upd.subtype,
      canonical_name: upd.canonicalName,
      aliases: upd.aliases ?? [],
      slug: slugify(upd.canonicalName),
      app: 'meeting-notes',
      generatedBy: 'claude-cli',
      firstCreatedBy: 'claude-cli',
      firstCreatedAt: now,
      lastEditedBy: 'claude-cli',
      lastEditedAt: now,
      blocks: [blockMeta],
    };
    const body =
      `# ${upd.canonicalName}\n\n` +
      (upd.initialContent ? `${upd.initialContent.trim()}\n\n` : '') +
      `${wrapBlock(blockId, blockBody)}\n`;
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${renderFrontmatter(fm)}\n\n${body}`, 'utf8');
      return 'created';
    } catch (e: any) {
      console.warn('[persistClaudeWiki] create failed:', e?.message, '· file=', filePath);
      return 'skipped';
    }
  }

  // 更新
  try {
    const cur = await readFile(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(cur);
    const newBody = upsertBlock(body, blockId, blockBody);

    // blocks 数组 dedup by id
    const existingBlocks = (frontmatter.blocks ?? []) as WikiBlockMeta[];
    const blocks = existingBlocks.filter((b) => b?.id !== blockId);
    blocks.push(blockMeta);

    const updatedFm: WikiFrontmatter = {
      ...frontmatter,
      blocks,
      lastEditedBy: 'claude-cli',
      lastEditedAt: now,
    };
    await writeFile(filePath, `${renderFrontmatter(updatedFm)}\n\n${newBody.trimStart()}`, 'utf8');
    return 'updated';
  } catch (e: any) {
    console.warn('[persistClaudeWiki] update failed:', e?.message, '· file=', filePath);
    return 'skipped';
  }
}

// ============================================================
// 旧契约 · "必须 content_entities 命中 + 文件存在才追加"
// ============================================================

async function handleLegacyEntityUpdate(
  deps: MeetingNotesDeps,
  wikiRoot: string,
  entityName: string,
  appendMarkdown: string,
  meetingId: string,
): Promise<boolean> {
  const trimmedName = entityName.trim();
  const appendMd = appendMarkdown.trim();
  if (!trimmedName || !appendMd) return false;

  // a) content_entities 命中
  let exists = false;
  try {
    const r = await deps.db.query(
      `SELECT id FROM content_entities WHERE canonical_name = $1 OR name = $1 LIMIT 1`,
      [trimmedName],
    );
    exists = (r.rows?.length ?? 0) > 0;
  } catch (e: any) {
    console.warn('[persistClaudeWiki/legacy] content_entities check failed:', e?.message);
    return false;
  }
  if (!exists) return false;

  // b) 文件存在（旧路径：entities/<slug>.md 平铺，因为 wikiGenerator 还在写老路径）
  const entityPath = join(wikiRoot, 'entities', `${sanitizeFilename(slugify(trimmedName))}.md`);
  if (!existsSync(entityPath)) return false;

  // c) 用 block 模式追加（即使是 legacy 也升级到 block 包装，避免重复 append）
  try {
    const cur = await readFile(entityPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(cur);
    const blockId = `meeting-${meetingId.slice(0, 8)}`;
    const blockBody = `## Claude CLI · meeting ${meetingId}\n\n${appendMd}`;
    const alreadyHasBlock = hasBlock(body, blockId);
    const newBody = upsertBlock(body, blockId, blockBody);

    if (Object.keys(frontmatter).length > 0) {
      // 有 frontmatter：更新 blocks + lastEditedAt 后写回
      const blocks = ((frontmatter.blocks ?? []) as WikiBlockMeta[]).filter((b) => b?.id !== blockId);
      blocks.push({
        id: blockId, app: 'meeting-notes', via: 'claude-cli',
        meetingId, addedAt: new Date().toISOString(),
      });
      const updatedFm: WikiFrontmatter = {
        ...frontmatter, blocks,
        lastEditedBy: 'claude-cli', lastEditedAt: new Date().toISOString(),
      };
      await writeFile(entityPath, `${renderFrontmatter(updatedFm)}\n\n${newBody.trimStart()}`, 'utf8');
    } else {
      // 没 frontmatter：直接写带 block 包装的 body
      await writeFile(entityPath, newBody, 'utf8');
    }
    return !alreadyHasBlock; // 仅当本次新增 block 才计为成功
  } catch (e: any) {
    console.warn('[persistClaudeWiki/legacy] append failed:', e?.message, '| entity:', trimmedName);
    return false;
  }
}
