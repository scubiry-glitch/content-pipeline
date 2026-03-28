-- 修复 question_decisions 表约束
-- 1. 放宽 decision CHECK 约束，支持 manual_resolved（一键改稿标记）
-- 2. 移除 review_id 对 blue_team_reviews 的 FK，改为普通列（兼容 expert_reviews）

-- Step 1: 放宽 decision CHECK 约束
ALTER TABLE question_decisions DROP CONSTRAINT IF EXISTS question_decisions_decision_check;
ALTER TABLE question_decisions ADD CONSTRAINT question_decisions_decision_check
  CHECK (decision IN ('accept', 'ignore', 'pending', 'manual_resolved', 'accepted'));

-- Step 2: 移除 review_id FK（使其同时支持 blue_team_reviews 和 expert_reviews 的 ID）
ALTER TABLE question_decisions DROP CONSTRAINT IF EXISTS question_decisions_review_id_fkey;

-- Step 3: 更新统计函数，兼容 manual_resolved
CREATE OR REPLACE FUNCTION get_task_question_stats(p_task_id VARCHAR)
RETURNS TABLE (
    total_questions BIGINT,
    accepted_count BIGINT,
    ignored_count BIGINT,
    pending_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_questions,
        COUNT(*) FILTER (WHERE qd.decision IN ('accept', 'accepted', 'manual_resolved'))::BIGINT as accepted_count,
        COUNT(*) FILTER (WHERE qd.decision = 'ignore')::BIGINT as ignored_count,
        COUNT(*) FILTER (WHERE qd.decision IS NULL OR qd.decision = 'pending')::BIGINT as pending_count
    FROM blue_team_reviews btr
    LEFT JOIN LATERAL (
        SELECT question, idx FROM jsonb_array_elements(btr.questions) WITH ORDINALITY AS q(question, idx)
        WHERE jsonb_typeof(btr.questions) = 'array'
        UNION ALL
        SELECT btr.questions as question, 1 as idx
        WHERE jsonb_typeof(btr.questions) = 'object'
    ) q ON true
    LEFT JOIN question_decisions qd ON qd.review_id = btr.id AND qd.question_index = (q.idx::int - 1)
    WHERE btr.task_id = p_task_id;
END;
$$ LANGUAGE plpgsql;
