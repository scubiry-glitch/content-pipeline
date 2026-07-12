// parse/participantExtractor.ts — 参会人 → mn_people 合并
//
// 去重规则：canonical_name + org 联合唯一（migration 002）
// 若同名不同 org：视为不同人
// 若同名无 org：按 canonical_name 合并（参会人记录通常不带 org）

import type { MeetingNotesDeps } from '../types.js';
import { EntityResolver } from '../../content-library/consolidation/entityResolver.js';

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[（(].*?[)）]/g, '') // 去掉括号注释
    .trim();
}

// 会议元数据字段（被抽取误标成人物）：整名精确命中即拒
const META_FIELD_NAMES = new Set([
  '地点', '会议地点', '时间', '会议时间', '录音时间', '日期', '会议日期',
  '议程', '会议议程', '主题', '会议主题', '纪要', '会议纪要',
  '参会人员', '参会人', '与会人员', '与会人', '出席人员', '参与人',
]);

/**
 * 高精度非人物判别（防误标进 mn_people 的兜底闸门，零误伤真人名为目标）。
 * 只拦**结构性/元数据**类明确不是自然人的名字——语义层面的角色/话题判别交给抽取 prompt。
 * 命中场景（实测存量脏数据）：文档章节「第一部分/第七部分」、元数据「地点/参会人员/录音时间」。
 */
export function isLikelyNonPerson(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  // 文档结构标题：第N部分/章/节/条/讲/页/步/阶段
  if (/^第[一二三四五六七八九十百千零〇两\d]+(部分|章|节|条|讲|页|步|阶段|点)/.test(n)) return true;
  // 会议元数据字段
  if (META_FIELD_NAMES.has(n)) return true;
  return false;
}

/**
 * 幂等：若已存在（canonical_name, org [, workspace]）则返回；否则新建。
 * 返回 mn_people.id。
 *
 * meetingId 透传作用:
 *   1) 写入时落 first_seen_meeting_id, 让 040 trigger 派生 workspace_id (选项 B 语义:
 *      同一姓名在两个 ws 是两条记录)
 *   2) 查重时按 (canonical, org, workspace_id) 三元组锁定到当前 ws, 避免跨 ws 错误合并
 *   未传 meetingId 时退回到旧行为 (没 ws scope, INSERT 不带 first_seen_meeting_id —
 *   会因 mn_people.workspace_id NOT NULL 失败, 暴露漏传 bug, 比静默落 default 安全)
 */
export async function ensurePersonByName(
  deps: MeetingNotesDeps,
  rawName: string,
  role?: string,
  org?: string,
  meetingId?: string,
): Promise<string | null> {
  const canonical = normalizeName(rawName);
  if (!canonical) return null;
  // 兜底闸门：结构/元数据类明确非人物直接跳过，不进 mn_people / content_entities
  if (isLikelyNonPerson(canonical)) {
    console.warn(`[ensurePersonByName] 跳过疑似非人物条目: ${canonical}`);
    return null;
  }

  // 唯一实体 seam：先注册/解析到全局 content_entities，拿 canonical id。
  // P1 桥接语义：content_entity_id 为「尽力而为」列，解析失败(embedding/DB 抖动)时
  // 降级为 null 并照常建 mn_people，绝不因实体解析异常吞掉承诺/轴数据；
  // 漏链的行由回填任务(backfillPeopleContentEntity)兜底。
  let contentEntityId: string | null = null;
  try {
    const resolver = new EntityResolver(deps.db, deps.embedding);
    const entity = await resolver.resolveAndRegister({
      canonicalName: canonical,
      aliases: [],
      entityType: 'person',
      metadata: {},
    });
    contentEntityId = entity.id;
  } catch (err) {
    console.warn(
      `[ensurePersonByName] content_entities 解析失败，降级 content_entity_id=null: ${canonical}`,
      err,
    );
  }

  // F11 · alias-aware lookup：除了 canonical_name 还查 aliases[]
  // 040 起: 若给了 meetingId, 通过 assets.workspace_id 把查重限定到当前 ws,
  // 避免 ws=A 的 "John" 错误合并到 ws=B 已有的 "John"
  const existing = meetingId
    ? await deps.db.query(
        `SELECT id FROM mn_people
          WHERE (canonical_name = $1 OR $1 = ANY(aliases))
            AND COALESCE(org, '') = COALESCE($2, '')
            AND workspace_id = (SELECT workspace_id FROM assets WHERE id::text = $3::text LIMIT 1)
          LIMIT 1`,
        [canonical, org ?? null, meetingId],
      )
    : await deps.db.query(
        `SELECT id FROM mn_people
          WHERE (canonical_name = $1 OR $1 = ANY(aliases))
            AND COALESCE(org, '') = COALESCE($2, '')
          LIMIT 1`,
        [canonical, org ?? null],
      );
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id as string;
    await deps.db.query(
      `UPDATE mn_people SET content_entity_id = $2 WHERE id = $1 AND content_entity_id IS DISTINCT FROM $2`,
      [id, contentEntityId],
    );
    // 若 role 变了可选 append 到 metadata
    if (role) {
      await deps.db.query(
        `UPDATE mn_people SET role = COALESCE(role, $2) WHERE id = $1`,
        [id, role],
      );
    }
    return id;
  }

  // INSERT: meetingId → first_seen_meeting_id; trigger inherit_ws_from_first_seen_meeting()
  // 自动从 assets.workspace_id 派生 workspace_id
  const inserted = meetingId
    ? await deps.db.query(
        `INSERT INTO mn_people (canonical_name, role, org, first_seen_meeting_id, content_entity_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [canonical, role ?? null, org ?? null, meetingId, contentEntityId],
      )
    : await deps.db.query(
        `INSERT INTO mn_people (canonical_name, role, org, content_entity_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [canonical, role ?? null, org ?? null, contentEntityId],
      );
  return inserted.rows[0]?.id ?? null;
}
