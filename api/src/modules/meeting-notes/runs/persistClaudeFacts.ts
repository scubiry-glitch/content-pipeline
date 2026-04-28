// runs/persistClaudeFacts.ts — 把 Claude CLI 输出的 facts SPO 写到 content_facts 表
//
// claudeCliFullPipeline.ts 让 Claude 输出 facts: [{ subject, predicate, object, confidence, context: { quote } }]，
// 这里把每条转成 content_facts 行 INSERT。重跑同一 meeting 时按 (asset_id, context.source='claude_cli')
// 复合键 DELETE 旧行后再批量 INSERT，不影响其他来源（手工录入 / 其他 LLM 抽取等）。
//
// content_facts 跟 wiki 的关系：wikiGenerator.generate() 直接 SELECT * FROM content_facts WHERE asset_id IN (...)
// 把 SPO 渲染成 obsidian 风格的 entities/<subject>.md 和 sources/<asset_id>.md。所以这里写完之后
// 用户在 /content-library/wiki 点 generate 就能看到这场会议的 facts 进入 wiki。

import type { MeetingNotesDeps } from '../types.js';
import { isValidTaxonomyCode } from '../../content-library/wiki/wikiFrontmatter.js';

export interface ClaudeFact {
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  /** Phase H · 必填 (claude prompt 已强制); 不合法时回退 'E99.OTHER' */
  taxonomy_code?: string;
  context?: { quote?: string };
}

const SOURCE_TAG = 'claude_cli';
const TAXONOMY_FALLBACK = 'E99.OTHER';

/**
 * 把 facts 写入 content_facts。每条带 context.source='claude_cli' 标记，重跑只清这批不动别的。
 */
export async function persistClaudeFacts(
  deps: MeetingNotesDeps,
  meetingId: string,
  facts: ClaudeFact[],
): Promise<{ inserted: number; deleted: number }> {
  // 1) 先 DELETE 同一 meeting 之前 claude_cli 写的行
  let deleted = 0;
  try {
    const r = await deps.db.query(
      `DELETE FROM content_facts
        WHERE asset_id = $1
          AND context->>'source' = $2
        RETURNING id`,
      [meetingId, SOURCE_TAG],
    );
    deleted = (r as any).rowCount ?? r.rows?.length ?? 0;
  } catch (e: any) {
    console.warn('[persistClaudeFacts] cleanup failed:', e?.message);
  }

  // 2) 批量 INSERT
  let inserted = 0;
  for (const f of facts) {
    const subject = String(f?.subject ?? '').trim();
    const predicate = String(f?.predicate ?? '').trim();
    const object = String(f?.object ?? '').trim();
    if (!subject || !predicate || !object) continue;

    const confidence = clamp(Number(f?.confidence ?? 0.5), 0, 1, 0.5);
    // Phase H · taxonomy_code 必填 + 校验 (84 个 L2 候选), 不合法降级 E99.OTHER
    const rawCode = typeof f?.taxonomy_code === 'string' ? f.taxonomy_code.trim() : '';
    const taxonomy_code = rawCode && isValidTaxonomyCode(rawCode) ? rawCode : TAXONOMY_FALLBACK;
    const context = {
      meetingId,
      source: SOURCE_TAG,
      quote: typeof f?.context?.quote === 'string' ? f.context.quote : null,
      taxonomy_code,
    };

    try {
      await deps.db.query(
        `INSERT INTO content_facts
           (asset_id, subject, predicate, object, context, confidence, is_current)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)`,
        [meetingId, subject, predicate, object, JSON.stringify(context), confidence],
      );
      inserted += 1;
    } catch (e: any) {
      console.warn('[persistClaudeFacts] insert failed:', e?.message, '| spo:', subject, predicate, object);
    }
  }

  if (inserted > 0 || deleted > 0) {
    console.log(`[persistClaudeFacts] meeting ${meetingId}: cleaned ${deleted}, inserted ${inserted}`);
  }
  return { inserted, deleted };
}

function clamp(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
