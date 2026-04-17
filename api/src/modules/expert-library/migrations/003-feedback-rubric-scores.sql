-- Phase 6: feedbackLoop 按 rubric 维度校准
-- 为 expert_feedback 增加 rubric_scores 字段，JSONB 存储 {dimension: score}
-- 与 ExpertFeedback.rubric_scores TypeScript 类型对齐

ALTER TABLE expert_feedback
  ADD COLUMN IF NOT EXISTS rubric_scores JSONB;

-- 可选索引（如果后续做 rubric_scores 检索会需要）
CREATE INDEX IF NOT EXISTS idx_feedback_rubric_scores ON expert_feedback USING GIN (rubric_scores);

COMMENT ON COLUMN expert_feedback.rubric_scores IS
  'Phase 6: 按专家 output_schema.rubrics 维度的分别评分；key=dimension, value=1-5 整数';
</content>
</invoke>
