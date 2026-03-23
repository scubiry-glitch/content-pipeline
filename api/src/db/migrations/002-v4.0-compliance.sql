-- v4.0 智能审核与合规数据库迁移
-- 日期: 2026-03-17

-- 1. 检测规则表
CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(50) NOT NULL, -- sensitive, ad_law, copyright, privacy
  rule_type VARCHAR(50) NOT NULL, -- keyword, regex, semantic
  pattern TEXT NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'warning', -- strict, warning, info
  suggestion TEXT,
  description TEXT,
  examples JSONB DEFAULT '[]',
  is_enabled BOOLEAN DEFAULT true,
  is_custom BOOLEAN DEFAULT false,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 检测日志表
CREATE TABLE IF NOT EXISTS compliance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id VARCHAR(100) NOT NULL, -- 支持任意内容ID（任务ID、资产ID等）
  content_type VARCHAR(50) DEFAULT 'draft', -- draft, report, asset
  check_type VARCHAR(50) NOT NULL, -- sensitive, ad_law, copyright, privacy
  result JSONB NOT NULL,
  overall_score INTEGER,
  passed BOOLEAN DEFAULT false,
  issues_count INTEGER DEFAULT 0,
  checked_by VARCHAR(100) DEFAULT 'system',
  checked_at TIMESTAMP DEFAULT NOW()
);

-- 3. 敏感词库表
CREATE TABLE IF NOT EXISTS sensitive_words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL, -- political, porn_violence, discrimination, prohibited
  level VARCHAR(20) NOT NULL DEFAULT 'strict', -- strict, warning
  variants JSONB DEFAULT '[]',
  is_regex BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_compliance_rules_category ON compliance_rules (category);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_enabled ON compliance_rules (is_enabled);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_content ON compliance_logs (content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_time ON compliance_logs (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_words_category ON sensitive_words (category);
CREATE INDEX IF NOT EXISTS idx_sensitive_words_enabled ON sensitive_words (is_enabled);

-- 5. 插入默认规则
-- 广告法极限词
INSERT INTO compliance_rules (category, rule_type, pattern, level, suggestion, description, examples) VALUES
('ad_law', 'keyword', '最|第一|顶级|唯一|首发|最佳|最大|最小', 'strict', '请使用更客观的描述', '禁止使用绝对化用语', '["最好"->"优质", "第一"->"领先"]'),
('ad_law', 'keyword', '稳赚|保本|保过|100%有效|根治|包治', 'strict', '请删除此类承诺用语', '禁止夸大产品效果', '["稳赚不赔"->"有风险"]'),
('ad_law', 'keyword', '国家级|最高级|最佳|第一品牌', 'strict', '请删除权威背书用语', '禁止使用国家级等权威表述', '[]'),
('privacy', 'regex', '\d{17}[\dXx]', 'strict', '请脱敏处理', '检测到身份证号', '["110101199001011234"->"110***********1234"]'),
('privacy', 'regex', '1[3-9]\d{9}', 'strict', '请脱敏处理', '检测到手机号', '["13800138000"->"138****8000"]'),
('privacy', 'regex', '[\w.-]+@[\w.-]+\.\w+', 'warning', '请确认是否需要展示', '检测到邮箱地址', '["test@example.com"->"t***@example.com"]')
ON CONFLICT DO NOTHING;

-- 6. 插入默认敏感词
INSERT INTO sensitive_words (word, category, level, variants) VALUES
('敏感词1', 'political', 'strict', '["变体1", "变体2"]'),
('敏感词2', 'porn_violence', 'strict', '["变体1"]')
ON CONFLICT DO NOTHING;

-- 7. 更新时间触发器
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_compliance_rules_updated_at ON compliance_rules;
CREATE TRIGGER update_compliance_rules_updated_at
    BEFORE UPDATE ON compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_compliance_updated_at();

-- 8. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.0-compliance', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
