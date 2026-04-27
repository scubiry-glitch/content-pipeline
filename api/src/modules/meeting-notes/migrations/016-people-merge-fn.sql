-- Meeting Notes Module · 016 — mn_people 合并函数
--
-- 实现「把 source_id 合并到 target_id」的原子操作：
--   1. 解决 UNIQUE 约束冲突（mn_role_trajectory_points / mn_speech_quality
--      / mn_silence_signals 都有 (person_id, meeting_id, ...) 复合 UNIQUE，
--      若 source 和 target 都覆盖同一个 meeting，UPDATE 会 23505。先 DELETE
--      source 的"对撞行"，target 的版本胜出）
--   2. UPDATE 所有 11 张引用 person_id 的表：set 引用列 = target
--      （4 个 ON DELETE CASCADE + 7 个 ON DELETE SET NULL 都直接 reassign）
--   3. 合并 aliases：target.aliases ∪ {source.canonical_name} ∪ source.aliases
--      去重，且把 target.canonical_name 自身从 aliases 移除
--   4. DELETE source 行
--
-- 全部在一个 plpgsql 函数里，PG 函数体隐式 transactional → 任一步失败全 rollback。
-- 调用方：API POST /people/:id/merge body { fromId } → 函数返回 affected counts。

CREATE OR REPLACE FUNCTION mn_merge_people(target_id UUID, source_id UUID)
RETURNS TABLE (
  table_name VARCHAR,
  rows_reassigned INT,
  rows_dropped INT
) AS $$
DECLARE
  target_canonical VARCHAR;
  target_aliases TEXT[];
  source_canonical VARCHAR;
  source_aliases TEXT[];
  merged_aliases TEXT[];
  affected INT;
  dropped INT;
BEGIN
  -- 校验：两个 id 不能相同 + 都必须存在
  IF target_id = source_id THEN
    RAISE EXCEPTION 'target_id 和 source_id 不能相同'
      USING ERRCODE = '22023', HINT = 'merge needs two different person ids';
  END IF;

  SELECT canonical_name, aliases INTO target_canonical, target_aliases
    FROM mn_people WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target person % not found', target_id USING ERRCODE = '02000';
  END IF;

  SELECT canonical_name, aliases INTO source_canonical, source_aliases
    FROM mn_people WHERE id = source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source person % not found', source_id USING ERRCODE = '02000';
  END IF;

  -- 1. 解决 UNIQUE 冲突 - mn_role_trajectory_points (person_id, meeting_id, scope_id)
  DELETE FROM mn_role_trajectory_points
   WHERE person_id = source_id
     AND (meeting_id, COALESCE(scope_id::text, '')) IN (
       SELECT meeting_id, COALESCE(scope_id::text, '')
         FROM mn_role_trajectory_points WHERE person_id = target_id
     );
  GET DIAGNOSTICS dropped = ROW_COUNT;
  -- 然后 reassign 剩下的
  UPDATE mn_role_trajectory_points SET person_id = target_id WHERE person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_role_trajectory_points'; rows_reassigned := affected; rows_dropped := dropped;
  RETURN NEXT;

  -- mn_speech_quality (meeting_id, person_id)
  DELETE FROM mn_speech_quality
   WHERE person_id = source_id
     AND meeting_id IN (SELECT meeting_id FROM mn_speech_quality WHERE person_id = target_id);
  GET DIAGNOSTICS dropped = ROW_COUNT;
  UPDATE mn_speech_quality SET person_id = target_id WHERE person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_speech_quality'; rows_reassigned := affected; rows_dropped := dropped;
  RETURN NEXT;

  -- mn_silence_signals (meeting_id, person_id, topic_id)
  DELETE FROM mn_silence_signals
   WHERE person_id = source_id
     AND (meeting_id, topic_id) IN (
       SELECT meeting_id, topic_id FROM mn_silence_signals WHERE person_id = target_id
     );
  GET DIAGNOSTICS dropped = ROW_COUNT;
  UPDATE mn_silence_signals SET person_id = target_id WHERE person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_silence_signals'; rows_reassigned := affected; rows_dropped := dropped;
  RETURN NEXT;

  -- mn_commitments (no UNIQUE) — 直接 UPDATE
  UPDATE mn_commitments SET person_id = target_id WHERE person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_commitments'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  -- 7 张 ON DELETE SET NULL 表（不同列名）
  UPDATE mn_decisions SET proposer_person_id = target_id WHERE proposer_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_decisions'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  UPDATE mn_assumptions SET verifier_person_id = target_id WHERE verifier_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_assumptions'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  UPDATE mn_open_questions SET owner_person_id = target_id WHERE owner_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_open_questions'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  UPDATE mn_judgments SET author_person_id = target_id WHERE author_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_judgments'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  UPDATE mn_mental_model_invocations SET invoked_by_person_id = target_id WHERE invoked_by_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_mental_model_invocations'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  UPDATE mn_cognitive_biases SET by_person_id = target_id WHERE by_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_cognitive_biases'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  UPDATE mn_counterfactuals SET rejected_by_person_id = target_id WHERE rejected_by_person_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_counterfactuals'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  -- 3. 合并 aliases：target.aliases ∪ {source.canonical_name} ∪ source.aliases，
  --    去重，且排除 target 自己的 canonical（避免 alias = canonical）
  merged_aliases := ARRAY(
    SELECT DISTINCT a FROM unnest(
      target_aliases || ARRAY[source_canonical]::text[] || source_aliases
    ) AS a
    WHERE a IS NOT NULL AND a <> '' AND a <> target_canonical
  );
  UPDATE mn_people
     SET aliases = merged_aliases,
         updated_at = NOW()
   WHERE id = target_id;

  -- 4. DELETE source 行（CASCADE 已无引用，因为前面都 reassign 走了）
  DELETE FROM mn_people WHERE id = source_id;
  affected := 1;
  table_name := 'mn_people (source deleted)'; rows_reassigned := 0; rows_dropped := affected;
  RETURN NEXT;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS mn_merge_people(uuid, uuid);
-- ============================================================
