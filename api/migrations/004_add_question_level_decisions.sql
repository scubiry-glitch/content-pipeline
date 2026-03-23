-- Question 级别决策支持
-- 支持单个 question 的 accept/ignore 决策

-- ============================================
-- Question 级别决策表
-- ============================================
CREATE TABLE IF NOT EXISTS question_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES blue_team_reviews(id) ON DELETE CASCADE,
    question_index INTEGER NOT NULL, -- questions 数组中的索引
    decision VARCHAR(20) CHECK (decision IN ('accept', 'ignore', 'pending')),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_question_decision UNIQUE (review_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_question_decisions_task ON question_decisions(task_id);
CREATE INDEX IF NOT EXISTS idx_question_decisions_review ON question_decisions(review_id);

-- ============================================
-- 更新触发器 - 自动更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_question_decisions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_question_decisions ON question_decisions;
CREATE TRIGGER trigger_update_question_decisions
    BEFORE UPDATE ON question_decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_question_decisions_updated_at();

-- ============================================
-- 辅助函数: 获取任务的 question 级别统计
-- ============================================
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
        COUNT(*) FILTER (WHERE qd.decision = 'accept')::BIGINT as accepted_count,
        COUNT(*) FILTER (WHERE qd.decision = 'ignore')::BIGINT as ignored_count,
        COUNT(*) FILTER (WHERE qd.decision IS NULL OR qd.decision = 'pending')::BIGINT as pending_count
    FROM blue_team_reviews btr
    LEFT JOIN LATERAL jsonb_array_elements(btr.questions) WITH ORDINALITY AS q(question, idx) ON true
    LEFT JOIN question_decisions qd ON qd.review_id = btr.id AND qd.question_index = (idx::int - 1)
    WHERE btr.task_id = p_task_id;
END;
$$ LANGUAGE plpgsql;
