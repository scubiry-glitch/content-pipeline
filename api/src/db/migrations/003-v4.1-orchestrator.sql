-- v4.1 智能流水线编排数据库迁移
-- 日期: 2026-03-17

-- 1. 工作流规则表
CREATE TABLE IF NOT EXISTS workflow_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  condition_expression TEXT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_params JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  trigger_stage VARCHAR(50),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 工作流实例表
CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL,
  current_stage INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) DEFAULT 'running',
  context_data JSONB DEFAULT '{}',
  applied_rules JSONB DEFAULT '[]',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 任务队列表
CREATE TABLE IF NOT EXISTS task_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  priority INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  assigned_to VARCHAR(100),
  stage INTEGER NOT NULL,
  due_time TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 蓝军专家表
CREATE TABLE IF NOT EXISTS expert_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  specialties JSONB DEFAULT '[]',
  availability_status VARCHAR(50) DEFAULT 'available',
  current_task_id UUID,
  max_concurrent_tasks INTEGER DEFAULT 1,
  task_count INTEGER DEFAULT 0,
  avg_response_time INTEGER,
  rating DECIMAL(3,2) DEFAULT 5.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_workflow_rules_enabled ON workflow_rules (is_enabled);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_stage ON workflow_rules (trigger_stage);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_task ON workflow_instances (task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances (status);
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue (status);
CREATE INDEX IF NOT EXISTS idx_task_queue_priority ON task_queue (priority DESC);
CREATE INDEX IF NOT EXISTS idx_task_queue_assigned ON task_queue (assigned_to);
CREATE INDEX IF NOT EXISTS idx_expert_specialties ON expert_profiles USING GIN (specialties);
CREATE INDEX IF NOT EXISTS idx_expert_availability ON expert_profiles (availability_status);

-- 6. 插入默认规则
INSERT INTO workflow_rules (name, description, condition_expression, action_type, action_params, priority, trigger_stage) VALUES
('低质量退回研究', '内容质量不足时退回研究', 'quality_score < 60', 'back_to_stage', '{"target": 2, "notify": true}', 10, 'stage_3'),
('热点加速发布', '热点内容跳过竞品分析', 'hot_score > 90', 'skip_step', '{"step": "competitor_analysis"}', 20, 'stage_1'),
('极端情绪预警', '市场情绪极端时添加警告', 'sentiment == "extreme_greed"', 'add_warning', '{"message": "市场过度乐观，建议增加风险提示"}', 15, 'stage_3'),
('长文自动分段', '长文转换为系列文章', 'word_count > 5000', 'split_output', '{"type": "series"}', 5, 'stage_4'),
('合规不通过拦截', '合规检查失败阻止发布', 'compliance.score < 70', 'block_and_notify', '{"target": "author"}', 100, 'stage_3')
ON CONFLICT DO NOTHING;

-- 7. 插入默认专家
INSERT INTO expert_profiles (user_id, name, specialties, max_concurrent_tasks) VALUES
('expert_finance', '金融专家', '["金融", "投资", "证券"]', 2),
('expert_tech', '技术专家', '["科技", "AI", "芯片"]', 2),
('expert_policy', '政策专家', '["政策", "监管", "宏观经济"]', 1),
('expert_consumer', '消费专家', '["消费", "零售", "品牌"]', 2)
ON CONFLICT (user_id) DO NOTHING;

-- 8. 更新时间触发器
DROP TRIGGER IF EXISTS update_workflow_rules_updated_at ON workflow_rules;
CREATE TRIGGER update_workflow_rules_updated_at
    BEFORE UPDATE ON workflow_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_instances_updated_at ON workflow_instances;
CREATE TRIGGER update_workflow_instances_updated_at
    BEFORE UPDATE ON workflow_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expert_profiles_updated_at ON expert_profiles;
CREATE TRIGGER update_expert_profiles_updated_at
    BEFORE UPDATE ON expert_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 9. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.1-orchestrator', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
