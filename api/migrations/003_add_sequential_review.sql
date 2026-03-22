-- 串行多轮评审支持 - Sequential Review Tables v5.0
-- 用于专家库 + AI专家串行评审流程

-- ============================================
-- 专家评审记录表 (expert_reviews)
-- ============================================
CREATE TABLE IF NOT EXISTS expert_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    draft_id VARCHAR(50) NOT NULL,
    round INTEGER NOT NULL,
    expert_type VARCHAR(20) NOT NULL CHECK (expert_type IN ('ai', 'human')),
    expert_role VARCHAR(50),
    expert_id VARCHAR(50),
    expert_name VARCHAR(100) NOT NULL,
    expert_profile TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    questions JSONB DEFAULT '[]'::jsonb,
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    summary TEXT,
    input_draft_id VARCHAR(50) NOT NULL,
    output_draft_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_round_expert UNIQUE (task_id, round, expert_id, expert_role)
);

CREATE INDEX IF NOT EXISTS idx_expert_reviews_task ON expert_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_expert_reviews_draft ON expert_reviews(draft_id);
CREATE INDEX IF NOT EXISTS idx_expert_reviews_round ON expert_reviews(task_id, round);

-- ============================================
-- 专家评审任务表 (expert_review_tasks) - 用于真人专家
-- ============================================
CREATE TABLE IF NOT EXISTS expert_review_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES expert_reviews(id) ON DELETE CASCADE,
    draft_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'completed_proxy', 'timeout')),
    draft_content TEXT NOT NULL,
    fact_check_summary JSONB,
    logic_check_summary JSONB,
    deadline TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_expert_review UNIQUE (expert_id, review_id)
);

CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_expert ON expert_review_tasks(expert_id);
CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_status ON expert_review_tasks(status);
CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_deadline ON expert_review_tasks(deadline);

-- ============================================
-- 评审链记录表 (review_chains) - 记录评审版本流转
-- ============================================
CREATE TABLE IF NOT EXISTS review_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    expert_id VARCHAR(50) NOT NULL,
    expert_name VARCHAR(100) NOT NULL,
    input_draft_id VARCHAR(50) NOT NULL,
    output_draft_id VARCHAR(50),
    review_id UUID REFERENCES expert_reviews(id),
    score INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_review_chain_round UNIQUE (task_id, round)
);

CREATE INDEX IF NOT EXISTS idx_review_chains_task ON review_chains(task_id);

-- ============================================
-- 更新 draft_versions 表 - 添加版本流转状态
-- ============================================
DO $$
BEGIN
    -- 如果 status 列不存在，添加它
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'draft_versions' AND column_name = 'status'
    ) THEN
        ALTER TABLE draft_versions ADD COLUMN status VARCHAR(50) DEFAULT 'draft';
    END IF;
    
    -- 如果 version_number 列不存在，添加它
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'draft_versions' AND column_name = 'version_number'
    ) THEN
        ALTER TABLE draft_versions ADD COLUMN version_number INTEGER;
    END IF;
END $$;

-- ============================================
-- 更新 tasks 表 - 添加串行评审相关字段
-- ============================================
DO $$
BEGIN
    -- 添加串行评审配置字段
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'sequential_review_config'
    ) THEN
        ALTER TABLE tasks ADD COLUMN sequential_review_config JSONB;
    END IF;
    
    -- 添加当前评审轮次字段
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'current_review_round'
    ) THEN
        ALTER TABLE tasks ADD COLUMN current_review_round INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- 添加评审相关日志类型
-- ============================================
DO $$
BEGIN
    -- 检查 task_logs 表是否存在 action 列
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'task_logs' AND column_name = 'action'
    ) THEN
        -- 如果有 CHECK 约束，需要更新它
        -- 这里我们假设 action 是 varchar 类型，不做 CHECK 约束
        RAISE NOTICE 'task_logs.action column exists';
    END IF;
END $$;

-- ============================================
-- 创建视图: 任务评审进度
-- ============================================
CREATE OR REPLACE VIEW task_review_progress AS
SELECT 
    t.id as task_id,
    t.topic,
    t.current_review_round,
    COUNT(DISTINCT er.id) as total_reviews,
    COUNT(DISTINCT CASE WHEN er.status = 'completed' THEN er.id END) as completed_reviews,
    MAX(er.round) as latest_round,
    AVG(er.overall_score)::NUMERIC(5,2) as avg_score,
    MIN(er.completed_at) as first_review_at,
    MAX(er.completed_at) as last_review_at
FROM tasks t
LEFT JOIN expert_reviews er ON t.id = er.task_id
GROUP BY t.id, t.topic, t.current_review_round;

COMMENT ON TABLE expert_reviews IS '专家评审记录，支持AI专家和真人专家';
COMMENT ON TABLE expert_review_tasks IS '真人专家评审任务，用于通知和追踪';
COMMENT ON TABLE review_chains IS '评审链记录，追踪版本流转';
