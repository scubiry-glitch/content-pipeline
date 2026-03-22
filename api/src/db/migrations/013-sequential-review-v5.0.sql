-- v5.0: 串行评审流程支持
-- 创建专家评审和版本链相关表

-- 1. 专家评审表 (按PRD设计)
CREATE TABLE IF NOT EXISTS expert_reviews (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  draft_id VARCHAR(50) NOT NULL,
  round INTEGER NOT NULL,
  
  -- 专家信息
  expert_type VARCHAR(10) NOT NULL CHECK (expert_type IN ('ai', 'human')),
  expert_role VARCHAR(20),           -- AI专家角色: challenger, expander, synthesizer
  expert_id VARCHAR(50),             -- 真人专家ID (关联experts表)
  expert_name VARCHAR(100),
  expert_profile TEXT,
  
  -- 评审内容
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  questions JSONB DEFAULT '[]',
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  summary TEXT,
  
  -- 串行评审特有: 输入/输出版本
  input_draft_id VARCHAR(50) NOT NULL,
  output_draft_id VARCHAR(50),       -- LLM生成的新版本
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_expert_reviews_task ON expert_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_expert_reviews_draft ON expert_reviews(draft_id);
CREATE INDEX IF NOT EXISTS idx_expert_reviews_round ON expert_reviews(round);
CREATE INDEX IF NOT EXISTS idx_expert_reviews_status ON expert_reviews(status);

-- 2. 评审链记录表 (记录串行流程)
CREATE TABLE IF NOT EXISTS review_chains (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  review_id VARCHAR(50) REFERENCES expert_reviews(id),
  
  round INTEGER NOT NULL,
  expert_id VARCHAR(50),
  expert_name VARCHAR(100),
  expert_role VARCHAR(20),
  
  input_draft_id VARCHAR(50) NOT NULL,
  output_draft_id VARCHAR(50),
  
  score INTEGER,
  status VARCHAR(20) DEFAULT 'completed',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_chains_task ON review_chains(task_id);
CREATE INDEX IF NOT EXISTS idx_review_chains_round ON review_chains(round);

-- 3. 评审报告表
CREATE TABLE IF NOT EXISTS review_reports (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_draft_id VARCHAR(50) NOT NULL,
  final_draft_id VARCHAR(50),
  
  -- 评审统计
  total_rounds INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  major_count INTEGER DEFAULT 0,
  minor_count INTEGER DEFAULT 0,
  praise_count INTEGER DEFAULT 0,
  resolved_count INTEGER DEFAULT 0,
  
  final_score INTEGER,
  decision VARCHAR(20) CHECK (decision IN ('accept', 'revise', 'reject')),
  
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_reports_task ON review_reports(task_id);

-- 4. 真人专家评审任务表
CREATE TABLE IF NOT EXISTS expert_review_tasks (
  id VARCHAR(50) PRIMARY KEY,
  expert_id VARCHAR(50) REFERENCES experts(id),
  task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  review_id VARCHAR(50) REFERENCES expert_reviews(id),
  draft_id VARCHAR(50) NOT NULL,
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  draft_content TEXT,
  fact_check_summary TEXT,
  logic_check_summary TEXT,
  
  -- 专家反馈
  score INTEGER,
  summary TEXT,
  questions JSONB DEFAULT '[]',
  
  deadline TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_expert ON expert_review_tasks(expert_id);
CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_status ON expert_review_tasks(status);
CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_task ON expert_review_tasks(task_id);

-- 5. 任务评审进度表 (记录当前串行评审进度)
CREATE TABLE IF NOT EXISTS task_review_progress (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- 串行评审配置
  total_rounds INTEGER DEFAULT 0,
  current_round INTEGER DEFAULT 0,
  review_queue JSONB DEFAULT '[]',  -- 专家评审队列配置
  
  -- 当前状态
  status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'completed', 'failed')),
  current_expert_role VARCHAR(20),
  current_review_id VARCHAR(50),
  
  -- 版本链
  initial_draft_id VARCHAR(50),
  current_draft_id VARCHAR(50),
  final_draft_id VARCHAR(50),
  
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_review_progress_status ON task_review_progress(status);

-- 6. 为 draft_versions 添加版本链支持
DO $$
BEGIN
  -- 添加 source_review_id 字段，记录是哪个评审生成的版本
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'draft_versions' AND column_name = 'source_review_id') THEN
    ALTER TABLE draft_versions ADD COLUMN source_review_id VARCHAR(50);
  END IF;
  
  -- 添加 previous_version_id 字段，支持版本链
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'draft_versions' AND column_name = 'previous_version_id') THEN
    ALTER TABLE draft_versions ADD COLUMN previous_version_id UUID REFERENCES draft_versions(id);
  END IF;
  
  -- 添加 round 字段，记录是第几轮生成的版本
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'draft_versions' AND column_name = 'round') THEN
    ALTER TABLE draft_versions ADD COLUMN round INTEGER DEFAULT 0;
  END IF;
  
  -- 添加 expert_role 字段，记录是哪个专家角色生成的
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'draft_versions' AND column_name = 'expert_role') THEN
    ALTER TABLE draft_versions ADD COLUMN expert_role VARCHAR(20);
  END IF;
END $$;

-- 为 tasks 表添加串行评审相关字段
DO $$
BEGIN
  -- 添加当前使用的评审模式
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tasks' AND column_name = 'review_mode') THEN
    ALTER TABLE drafts ADD COLUMN review_mode VARCHAR(20) DEFAULT 'parallel' 
      CHECK (review_mode IN ('parallel', 'sequential'));
  END IF;
END $$;
