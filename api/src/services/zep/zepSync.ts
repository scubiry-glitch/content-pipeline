// Zep 可选增强模块 — 事实双写同步
// 每次 extractFacts / reextractBatch 完成后，将事实同步到 Zep Graph
// 无 Zep 时静默跳过, 不影响主流程

import { isZepEnabled, ensureZepUser, addGraphEpisode } from './zepClient.js';

/** 系统级 Zep User ID */
const SYSTEM_USER = 'content-pipeline-system';

let userEnsured = false;

/** 确保系统用户已注册 (只执行一次) */
async function ensureSystemUser(): Promise<boolean> {
  if (userEnsured) return true;
  const ok = await ensureZepUser(SYSTEM_USER, { firstName: 'ContentPipeline' });
  if (ok) userEnsured = true;
  return ok;
}

/**
 * 将提取的事实同步到 Zep Graph (Episode 模式)
 *
 * 每个 fact 转换为 Zep 可理解的文本:
 *   "[domain] subject predicate object (confidence: 0.9, source: assetId)"
 *
 * Zep 会自动:
 * - 提取实体 (Entity nodes)
 * - 建立关系 (Fact edges with temporal validity)
 * - 去重合并 (Entity resolution)
 * - 检测矛盾 (Temporal invalidation)
 */
export async function syncFactsToZep(facts: Array<{
  assetId: string;
  subject: string;
  predicate: string;
  object: string;
  context?: { domain?: string; time?: string; source?: string; [k: string]: any };
  confidence: number;
}>): Promise<{ synced: number; skipped: number }> {
  if (!isZepEnabled()) return { synced: 0, skipped: 0 };

  await ensureSystemUser();

  let synced = 0;
  let skipped = 0;

  // 批量: 将多个 facts 合并为一个 episode text (减少 API 调用)
  const BATCH_SIZE = 10;
  for (let i = 0; i < facts.length; i += BATCH_SIZE) {
    const batch = facts.slice(i, i + BATCH_SIZE);
    const lines = batch.map(f => {
      const domain = f.context?.domain ? `[${f.context.domain}] ` : '';
      const time = f.context?.time ? ` (时间: ${f.context.time})` : '';
      return `${domain}${f.subject} ${f.predicate} ${f.object}${time}。置信度: ${(f.confidence * 100).toFixed(0)}%`;
    });

    const episodeText = `内容库事实提取 (来源: ${batch[0]?.assetId || 'unknown'}):\n${lines.join('\n')}`;

    try {
      const result = await addGraphEpisode(SYSTEM_USER, {
        type: 'text',
        data: episodeText,
        user_id: SYSTEM_USER,
      });
      if (result) {
        synced += batch.length;
      } else {
        skipped += batch.length;
      }
    } catch (err) {
      console.warn('[ZepSync] Episode sync failed:', err);
      skipped += batch.length;
    }
  }

  if (synced > 0) {
    console.log(`[ZepSync] Synced ${synced} facts to Zep Graph (skipped ${skipped})`);
  }

  return { synced, skipped };
}

/**
 * 将实体同步到 Zep Graph
 */
export async function syncEntitiesToZep(entities: Array<{
  canonicalName: string;
  entityType: string;
  aliases?: string[];
}>): Promise<{ synced: number }> {
  if (!isZepEnabled()) return { synced: 0 };
  if (entities.length === 0) return { synced: 0 };

  await ensureSystemUser();

  const lines = entities.map(e => {
    const aliasStr = e.aliases?.length ? ` (别名: ${e.aliases.join(', ')})` : '';
    return `${e.canonicalName} 是一个 ${e.entityType}${aliasStr}`;
  });

  const episodeText = `实体注册:\n${lines.join('\n')}`;

  try {
    await addGraphEpisode(SYSTEM_USER, {
      type: 'text',
      data: episodeText,
      user_id: SYSTEM_USER,
    });
    return { synced: entities.length };
  } catch {
    return { synced: 0 };
  }
}
