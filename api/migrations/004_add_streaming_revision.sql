-- Stage4 蓝军评审后流式修改支持 - Streaming Revision Tables v1.0
-- 支持流式生成、版本保存、实时进度追踪

-- ============================================
-- 文稿修订记录表 (draft_revisions)
-- ============================================
CREATE TABLE IF NOT EXISTS draft_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    draft_id VARCHAR(50) NOT NULL,  -- 原稿ID
    new_draft_id VARCHAR(50) NOT NULL,  -- 修订后稿ID
    version INTEGER NOT NULL,
    suggestions_applied INTEGER DEFAULT 0,
    suggestions_total INTEGER DEFAULT 0,
    mode VARCHAR(20) DEFAULT 'balanced' CHECK (mode IN ('conservative', 'balanced', 'aggressive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_version UNIQUE (task_id, version)
);

CREATE INDEX IF NOT EXISTS idx_draft_revisions_task ON draft_revisions(task_id);
CREATE INDEX IF NOT EXISTS idx_draft_revisions_draft ON draft_revisions(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_revisions_new_draft ON draft_revisions(new_draft_id);

-- ============================================
-- 修订进度表 (draft_revision_progress) - 实时进度追踪
-- ============================================
CREATE TABLE IF NOT EXISTS draft_revision_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    draft_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'error')),
    current_section_index INTEGER DEFAULT 0,
    total_sections INTEGER DEFAULT 0,
    accumulated_content TEXT DEFAULT '',
    sections JSONB DEFAULT '[]'::jsonb,
    progress DECIMAL(5,4) DEFAULT 0,  -- 0.0 ~ 1.0
    applied_suggestions INTEGER DEFAULT 0,
    total_suggestions INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_task_draft_progress UNIQUE (task_id, draft_id)
);

CREATE INDEX IF NOT EXISTS idx_revision_progress_task ON draft_revision_progress(task_id);
CREATE INDEX IF NOT EXISTS idx_revision_progress_draft ON draft_revision_progress(draft_id);
CREATE INDEX IF NOT EXISTS idx_revision_progress_status ON draft_revision_progress(status);

-- ============================================
-- 中间版本表 (draft_intermediate_versions) - 保存中间进度
-- ============================================
CREATE TABLE IF NOT EXISTS draft_intermediate_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    parent_draft_id VARCHAR(50) NOT NULL,  -- 原始稿ID
    version INTEGER NOT NULL,
    sub_version INTEGER NOT NULL,  -- 中间版本号，如 v2.1, v2.2
    content TEXT NOT NULL,
    sections_completed INTEGER DEFAULT 0,
    total_sections INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_intermediate_version UNIQUE (task_id, parent_draft_id, version, sub_version)
);

CREATE INDEX IF NOT EXISTS idx_intermediate_task ON draft_intermediate_versions(task_id);
CREATE INDEX IF NOT EXISTS idx_intermediate_parent ON draft_intermediate_versions(parent_draft_id);

-- ============================================
-- 更新 draft_versions 表 - 添加修订相关字段
-- ============================================
DO $$
BEGIN
    -- 添加父版本ID（用于版本链）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'draft_versions' AND column_name = 'parent_id'
    ) THEN
        ALTER TABLE draft_versions ADD COLUMN parent_id VARCHAR(50);
    END IF;
    
    -- 添加修订备注
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'draft_versions' AND column_name = 'revision_notes'
    ) THEN
        ALTER TABLE draft_versions ADD COLUMN revision_notes JSONB;
    END IF;
END $$;

-- ============================================
-- 创建视图: 版本历史树
-- ============================================
CREATE OR REPLACE VIEW draft_version_tree AS
WITH RECURSIVE version_chain AS (
    -- 根版本（没有父版本）
    SELECT 
        id,
        task_id,
        version,
        parent_id,
        status,
        word_count,
        created_at,
        0 as depth,
        ARRAY[version] as version_path
    FROM draft_versions
    WHERE parent_id IS NULL OR parent_id = ''
    
    UNION ALL
    
    -- 子版本
    SELECT 
        dv.id,
        dv.task_id,
        dv.version,
        dv.parent_id,
        dv.status,
        dv.word_count,
        dv.created_at,
        vc.depth + 1,
        vc.version_path || dv.version
    FROM draft_versions dv
    JOIN version_chain vc ON dv.parent_id = vc.id
)
SELECT * FROM version_chain;

-- ============================================
-- 创建视图: 修订统计
-- ============================================
CREATE OR REPLACE VIEW revision_statistics AS
SELECT 
    dr.task_id,
    COUNT(*) as total_revisions,
    SUM(dr.suggestions_applied) as total_suggestions_applied,
    SUM(dr.suggestions_total) as total_suggestions_received,
    AVG(dr.suggestions_applied::float / NULLIF(dr.suggestions_total, 0)) * 100 as avg_acceptance_rate,
    MAX(dr.created_at) as last_revision_at
FROM draft_revisions dr
GROUP BY dr.task_id;

COMMENT ON TABLE draft_revisions IS '文稿修订记录，保存每次评审后的修订信息';
COMMENT ON TABLE draft_revision_progress IS '修订实时进度，用于流式生成状态追踪';
COMMENT ON TABLE draft_intermediate_versions IS '中间版本，保存流式生成过程中的检查点';
