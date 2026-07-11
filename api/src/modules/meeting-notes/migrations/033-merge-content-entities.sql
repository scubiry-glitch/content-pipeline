-- Meeting Notes Module · 033 — merge_content_entities 通用实体合并
-- 把 source 实体引用重指向 target、合并 aliases、删除 source。
-- 镜像 mn_merge_people(031) 的结构；处理 content_entity_relations 的 UNIQUE(a,b) 冲突与自环。
-- content_facts 为 TEXT 键、无 FK，不在此改写（经 alias 解析到 target）。

CREATE OR REPLACE FUNCTION merge_content_entities(target_id UUID, source_id UUID)
RETURNS TABLE (
  table_name VARCHAR,
  rows_reassigned INT,
  rows_dropped INT
) AS $$
DECLARE
  target_canonical TEXT;
  target_aliases   TEXT[];
  source_canonical TEXT;
  source_aliases   TEXT[];
  merged_aliases   TEXT[];
  affected  INT;
  affected2 INT;
  dropped   INT;
  dropped_total INT;
BEGIN
  IF target_id = source_id THEN
    RAISE EXCEPTION 'target_id 和 source_id 不能相同'
      USING ERRCODE = '22023', HINT = 'merge needs two different entity ids';
  END IF;

  SELECT canonical_name, aliases INTO target_canonical, target_aliases
    FROM content_entities WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target entity % not found', target_id USING ERRCODE = '02000';
  END IF;

  SELECT canonical_name, aliases INTO source_canonical, source_aliases
    FROM content_entities WHERE id = source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source entity % not found', source_id USING ERRCODE = '02000';
  END IF;

  -- ===== content_entity_relations: UNIQUE(entity_a_id, entity_b_id), CASCADE =====
  dropped_total := 0;

  -- (i) 删 source↔target 直接配对（重指向后会成 target-target 自环）+ source 自环
  DELETE FROM content_entity_relations
   WHERE (entity_a_id = source_id AND entity_b_id = target_id)
      OR (entity_a_id = target_id AND entity_b_id = source_id)
      OR (entity_a_id = source_id AND entity_b_id = source_id);
  GET DIAGNOSTICS dropped = ROW_COUNT;
  dropped_total := dropped_total + dropped;

  -- (ii) entity_a_id 侧：删 reassign 后会与现有 (target, X) 撞 UNIQUE 的 source 行，再重指向
  DELETE FROM content_entity_relations r
   WHERE r.entity_a_id = source_id
     AND EXISTS (
       SELECT 1 FROM content_entity_relations t
        WHERE t.entity_a_id = target_id AND t.entity_b_id = r.entity_b_id
     );
  GET DIAGNOSTICS dropped = ROW_COUNT;
  dropped_total := dropped_total + dropped;
  UPDATE content_entity_relations SET entity_a_id = target_id WHERE entity_a_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- (iii) entity_b_id 侧
  DELETE FROM content_entity_relations r
   WHERE r.entity_b_id = source_id
     AND EXISTS (
       SELECT 1 FROM content_entity_relations t
        WHERE t.entity_b_id = target_id AND t.entity_a_id = r.entity_a_id
     );
  GET DIAGNOSTICS dropped = ROW_COUNT;
  dropped_total := dropped_total + dropped;
  UPDATE content_entity_relations SET entity_b_id = target_id WHERE entity_b_id = source_id;
  GET DIAGNOSTICS affected2 = ROW_COUNT;
  affected := affected + affected2;

  table_name := 'content_entity_relations'; rows_reassigned := affected; rows_dropped := dropped_total;
  RETURN NEXT;

  -- ===== mn_people.content_entity_id 重指向（无 CASCADE，必须删 source 前做）=====
  UPDATE mn_people SET content_entity_id = target_id WHERE content_entity_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_people'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  -- ===== 合并 aliases：target.aliases ∪ {source.canonical} ∪ source.aliases，去重、排除 target.canonical =====
  merged_aliases := ARRAY(
    SELECT DISTINCT a FROM unnest(
      COALESCE(target_aliases, '{}') || ARRAY[source_canonical]::text[] || COALESCE(source_aliases, '{}')
    ) AS a
    WHERE a IS NOT NULL AND a <> '' AND a <> target_canonical
  );
  UPDATE content_entities SET aliases = merged_aliases, updated_at = NOW() WHERE id = target_id;

  -- ===== 删 source（此时 content_entity_relations 与 mn_people 已无 source 引用）=====
  DELETE FROM content_entities WHERE id = source_id;
  table_name := 'content_entities (source deleted)'; rows_reassigned := 0; rows_dropped := 1;
  RETURN NEXT;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS merge_content_entities(uuid, uuid);
-- ============================================================
