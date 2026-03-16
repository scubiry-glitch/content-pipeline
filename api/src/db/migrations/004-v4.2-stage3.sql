-- v4.2 Stage 3 文稿生成增强数据库迁移
-- 日期: 2026-03-17

-- 1. 标注表
CREATE TABLE IF NOT EXISTS draft_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  version_id UUID REFERENCES draft_versions(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL, -- error, logic, optimize, add, delete
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  comment TEXT,
  suggestion TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
  created_by VARCHAR(50) NOT NULL, -- user, ai, blueteam
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 对话修改记录表
CREATE TABLE IF NOT EXISTS draft_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  version_id UUID REFERENCES draft_versions(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  context_range JSONB, -- { start: 100, end: 500 }
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 修改日志表
CREATE TABLE IF NOT EXISTS draft_change_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  version_from UUID,
  version_to UUID,
  change_type VARCHAR(50) NOT NULL, -- annotation, chat, manual
  change_summary TEXT,
  changes_detail JSONB,
  changed_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 版本表
CREATE TABLE IF NOT EXISTS draft_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  name VARCHAR(200),
  content TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  created_by VARCHAR(50) NOT NULL,
  auto_save BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_annotations_draft ON draft_annotations (draft_id);
CREATE INDEX IF NOT EXISTS idx_annotations_version ON draft_annotations (version_id);
CREATE INDEX IF NOT EXISTS idx_annotations_status ON draft_annotations (status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_draft ON draft_chat_sessions (draft_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_draft ON draft_change_logs (draft_id);
CREATE INDEX IF NOT EXISTS idx_versions_draft ON draft_versions (draft_id);

-- 6. 更新时间触发器
DROP TRIGGER IF EXISTS update_annotations_updated_at ON draft_annotations;
CREATE TRIGGER update_annotations_updated_at
    BEFORE UPDATE ON draft_annotations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.2-stage3', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
