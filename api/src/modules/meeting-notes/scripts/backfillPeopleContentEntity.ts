import type { MeetingNotesDeps } from '../types.js';
import { EntityResolver } from '../../content-library/consolidation/entityResolver.js';

/** 回填历史 mn_people 的 content_entity_id。幂等：只处理 IS NULL 的行。 */
export async function backfillPeopleContentEntity(
  deps: MeetingNotesDeps,
): Promise<{ scanned: number; linked: number }> {
  const resolver = new EntityResolver(deps.db, deps.embedding);
  const { rows } = await deps.db.query(
    `SELECT id, canonical_name, aliases FROM mn_people WHERE content_entity_id IS NULL`,
  );
  let linked = 0;
  for (const r of rows as Array<{ id: string; canonical_name: string; aliases: string[] }>) {
    const entity = await resolver.resolveAndRegister({
      canonicalName: r.canonical_name,
      aliases: r.aliases ?? [],
      entityType: 'person',
      metadata: {},
    });
    await deps.db.query(
      `UPDATE mn_people SET content_entity_id = $2 WHERE id = $1`,
      [r.id, entity.id],
    );
    linked += 1;
  }
  return { scanned: rows.length, linked };
}
