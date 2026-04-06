-- Expert Task Assignments — 专家任务调度表
-- 追踪专家-任务分配关系和工作量

CREATE TABLE IF NOT EXISTS expert_task_assignments (
  id VARCHAR(100) PRIMARY KEY,
  expert_id VARCHAR(50) NOT NULL,
  task_id VARCHAR(50) NOT NULL,
  role VARCHAR(50) DEFAULT 'reviewer',
  status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'active', 'completed', 'cancelled')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  deadline TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_expert_task UNIQUE (expert_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_expert_task_assignments_expert ON expert_task_assignments (expert_id, status);
CREATE INDEX IF NOT EXISTS idx_expert_task_assignments_task ON expert_task_assignments (task_id);
CREATE INDEX IF NOT EXISTS idx_expert_task_assignments_status ON expert_task_assignments (status, assigned_at DESC);
