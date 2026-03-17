-- v4.4 Copilot AI助手数据库迁移
-- 日期: 2026-03-17

-- 1. Copilot会话表
CREATE TABLE IF NOT EXISTS copilot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  session_type VARCHAR(50) NOT NULL, -- writing, code, data, general
  title VARCHAR(200),
  context_id VARCHAR(100), -- 关联的draft_id, task_id等
  context_type VARCHAR(50), -- draft, task, report, general

  -- 会话配置
  config JSONB NOT NULL DEFAULT '{}',

  -- 统计
  message_count INTEGER DEFAULT 0,
  token_used INTEGER DEFAULT 0,

  status VARCHAR(20) DEFAULT 'active', -- active, archived, deleted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP
);

-- 2. Copilot消息表
CREATE TABLE IF NOT EXISTS copilot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES copilot_sessions(id) ON DELETE CASCADE,

  -- 消息内容
  role VARCHAR(20) NOT NULL, -- user, assistant, system, tool
  content TEXT NOT NULL,
  content_type VARCHAR(50) DEFAULT 'text', -- text, code, markdown, json

  -- 元数据
  metadata JSONB DEFAULT '{}', -- { model: 'claude', tokens: 150, latency: 1200 }

  -- 工具调用（可选）
  tool_calls JSONB,
  tool_results JSONB,

  -- 反馈
  feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_comment TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Copilot技能表
CREATE TABLE IF NOT EXISTS copilot_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,

  -- 技能类型
  skill_type VARCHAR(50) NOT NULL, -- builtin, custom, plugin
  category VARCHAR(50) NOT NULL, -- writing, code, data, analysis, utility

  -- 技能配置
  prompt_template TEXT,
  system_prompt TEXT,
  tools JSONB DEFAULT '[]', -- 技能可用的工具列表

  -- 触发条件
  triggers JSONB DEFAULT '[]', -- 触发关键词/模式

  is_enabled BOOLEAN DEFAULT true,
  is_builtin BOOLEAN DEFAULT false,

  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Copilot上下文表
CREATE TABLE IF NOT EXISTS copilot_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES copilot_sessions(id) ON DELETE CASCADE,

  -- 上下文类型
  context_type VARCHAR(50) NOT NULL, -- draft_content, task_info, report_data, user_preference

  -- 上下文数据
  data JSONB NOT NULL,

  -- 过期时间
  expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Copilot使用统计表
CREATE TABLE IF NOT EXISTS copilot_usage_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 使用统计
  session_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  token_input INTEGER DEFAULT 0,
  token_output INTEGER DEFAULT 0,

  -- 技能使用统计
  skill_usage JSONB DEFAULT '{}', -- { "writing": 10, "code": 5 }

  -- 反馈统计
  avg_rating DECIMAL(3,2),

  UNIQUE(user_id, date)
);

-- 6. 创建索引
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_user ON copilot_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_type ON copilot_sessions (session_type);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_session ON copilot_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_copilot_skills_category ON copilot_skills (category, is_enabled);
CREATE INDEX IF NOT EXISTS idx_copilot_contexts_session ON copilot_contexts (session_id, context_type);
CREATE INDEX IF NOT EXISTS idx_copilot_usage_user_date ON copilot_usage_stats (user_id, date);

-- 7. 插入内置技能
INSERT INTO copilot_skills (name, display_name, description, skill_type, category, system_prompt, is_builtin) VALUES
  (
    'writing_assistant',
    '写作助手',
    '帮助用户改进写作，提供润色、扩写、总结等建议',
    'builtin',
    'writing',
    '你是一位专业的写作助手。请帮助用户改进他们的写作，提供具体、可操作的建议。你可以：
1. 润色文字，使其更加流畅
2. 扩写内容，增加深度
3. 总结要点，提炼核心
4. 检查逻辑和结构
请保持原文的核心意思，同时提升表达质量。',
    true
  ),
  (
    'code_assistant',
    '代码助手',
    '帮助用户编写和优化代码，包括SQL查询、API调用等',
    'builtin',
    'code',
    '你是一位专业的代码助手。请帮助用户编写高质量、可维护的代码。你可以：
1. 编写SQL查询
2. 生成API调用代码
3. 代码审查和优化建议
4. 解释代码逻辑
请确保代码安全、高效，并添加必要的注释。',
    true
  ),
  (
    'data_analyst',
    '数据分析师',
    '帮助用户分析数据，解读报表，发现趋势',
    'builtin',
    'data',
    '你是一位数据分析专家。请帮助用户理解数据、发现洞察。你可以：
1. 解读数据报表
2. 分析趋势和模式
3. 提供可视化建议
4. 生成数据摘要
请用清晰、易懂的语言解释复杂的概念。',
    true
  ),
  (
    'research_helper',
    '研究助手',
    '帮助用户进行资料搜集和研究分析',
    'builtin',
    'analysis',
    '你是一位研究助手。请帮助用户进行有效的研究。你可以：
1. 总结资料要点
2. 对比不同观点
3. 发现信息缺口
4. 建议研究方向
请确保信息准确，并指出不确定性。',
    true
  ),
  (
    'content_planner',
    '内容规划师',
    '帮助用户规划内容策略和选题',
    'builtin',
    'writing',
    '你是一位内容规划专家。请帮助用户制定有效的内容策略。你可以：
1. 分析热点话题
2. 建议选题方向
3. 规划内容结构
4. 优化发布时机
请考虑目标受众和平台特点。',
    true
  )
ON CONFLICT (name) DO NOTHING;

-- 8. 更新时间触发器
DROP TRIGGER IF EXISTS update_copilot_sessions_updated_at ON copilot_sessions;
CREATE TRIGGER update_copilot_sessions_updated_at
    BEFORE UPDATE ON copilot_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_copilot_skills_updated_at ON copilot_skills;
CREATE TRIGGER update_copilot_skills_updated_at
    BEFORE UPDATE ON copilot_skills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 9. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.4-copilot', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
