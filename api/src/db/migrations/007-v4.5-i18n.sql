-- v4.5 国际化 (i18n) 数据库迁移
-- 日期: 2026-03-17

-- 1. 翻译内容表
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id VARCHAR(100) NOT NULL, -- 源内容ID (draft_id, article_id等)
  source_type VARCHAR(50) NOT NULL, -- draft, article, report

  -- 语言
  source_language VARCHAR(10) DEFAULT 'zh-CN',
  target_language VARCHAR(10) NOT NULL,

  -- 内容
  source_content TEXT NOT NULL,
  translated_content TEXT,

  -- 翻译状态
  status VARCHAR(20) DEFAULT 'pending', -- pending, translating, reviewing, published, archived

  -- 翻译方式
  translation_method VARCHAR(20), -- manual, machine, hybrid
  translation_provider VARCHAR(50), -- claude, openai, google, deepl

  -- 元数据
  metadata JSONB DEFAULT '{}', -- { word_count: 1000, char_count: 3000 }

  -- 统计
  view_count INTEGER DEFAULT 0,
  engagement_count INTEGER DEFAULT 0,

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,

  -- 人员
  created_by VARCHAR(100),
  translator_id VARCHAR(100),
  reviewer_id VARCHAR(100),

  -- 唯一约束
  UNIQUE(source_id, source_type, target_language)
);

-- 2. 翻译任务表
CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 任务类型
  job_type VARCHAR(50) NOT NULL, -- translate, review, update

  -- 关联翻译
  translation_id UUID REFERENCES translations(id) ON DELETE CASCADE,

  -- 任务状态
  status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, failed, cancelled
  priority INTEGER DEFAULT 3, -- 1-5, 1最高

  -- 分配
  assigned_to VARCHAR(100),
  assigned_at TIMESTAMP,

  -- 进度
  progress INTEGER DEFAULT 0, -- 0-100

  -- 时间
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  due_date TIMESTAMP,

  -- 结果
  result_summary TEXT,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 术语库表
CREATE TABLE IF NOT EXISTS terminology_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 术语
  term VARCHAR(200) NOT NULL,
  language VARCHAR(10) NOT NULL,

  -- 定义
  definition TEXT,
  context TEXT, -- 使用语境

  -- 翻译
  translations JSONB NOT NULL DEFAULT '{}', -- { "en": "translation", "ja": "翻訳" }

  -- 分类
  category VARCHAR(100), -- 行业/领域
  tags JSONB DEFAULT '[]',

  -- 状态
  status VARCHAR(20) DEFAULT 'active', -- active, deprecated, pending_review

  -- 元数据
  source_url TEXT, -- 术语来源
  notes TEXT,

  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 唯一约束
  UNIQUE(term, language, category)
);

-- 4. 语言设置表
CREATE TABLE IF NOT EXISTS language_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 语言
  language_code VARCHAR(10) NOT NULL UNIQUE,
  language_name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100) NOT NULL,

  -- 状态
  is_enabled BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- 配置
  config JSONB DEFAULT '{}', -- { rtl: false, date_format: "YYYY-MM-DD", number_format: "en-US" }

  -- SEO
  seo_config JSONB DEFAULT '{}', -- { url_prefix: "/en/", hreflang: "en-US" }

  -- 内容统计
  content_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. 翻译记忆库表
CREATE TABLE IF NOT EXISTS translation_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 源文和译文
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,

  -- 语言对
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,

  -- 元数据
  source_type VARCHAR(50), -- 内容来源类型
  similarity_score DECIMAL(5,2), -- 相似度评分

  -- 使用统计
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- 状态
  is_approved BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 创建索引
CREATE INDEX IF NOT EXISTS idx_translations_source ON translations (source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_translations_status ON translations (status, target_language);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs (status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_terminology_language ON terminology_entries (language, category);
CREATE INDEX IF NOT EXISTS idx_terminology_status ON terminology_entries (status);
CREATE INDEX IF NOT EXISTS idx_translation_memory_lookup ON translation_memory (source_language, target_language, source_text);

-- 7. 插入默认语言设置
INSERT INTO language_settings (language_code, language_name, native_name, is_enabled, is_default, seo_config) VALUES
  ('zh-CN', '简体中文', '简体中文', true, true, '{"url_prefix": "/", "hreflang": "zh-CN"}'),
  ('en', 'English', 'English', true, false, '{"url_prefix": "/en/", "hreflang": "en-US"}'),
  ('ja', '日本語', '日本語', true, false, '{"url_prefix": "/ja/", "hreflang": "ja-JP"}'),
  ('ko', '한국어', '한국어', true, false, '{"url_prefix": "/ko/", "hreflang": "ko-KR"}'),
  ('zh-TW', '繁體中文', '繁體中文', true, false, '{"url_prefix": "/zh-tw/", "hreflang": "zh-TW"}')
ON CONFLICT (language_code) DO NOTHING;

-- 8. 插入示例术语
INSERT INTO terminology_entries (term, language, definition, translations, category, tags) VALUES
  ('内容流水线', 'zh-CN', '标准化的内容生产流程', '{"en": "Content Pipeline", "ja": "コンテンツパイプライン"}', 'product', '["core", "concept"]'),
  ('热点追踪', 'zh-CN', '监控和跟踪热门话题的功能', '{"en": "Hot Topic Tracking", "ja": "トレンド追跡"}', 'feature', '["v3.4"]'),
  ('智能审核', 'zh-CN', '使用AI进行内容合规性检查', '{"en": "AI Compliance Review", "ja": "AI審査"}', 'feature', '["v4.0"]')
ON CONFLICT (term, language, category) DO NOTHING;

-- 9. 更新时间触发器
DROP TRIGGER IF EXISTS update_translations_updated_at ON translations;
CREATE TRIGGER update_translations_updated_at
    BEFORE UPDATE ON translations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_translation_jobs_updated_at ON translation_jobs;
CREATE TRIGGER update_translation_jobs_updated_at
    BEFORE UPDATE ON translation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_terminology_entries_updated_at ON terminology_entries;
CREATE TRIGGER update_terminology_entries_updated_at
    BEFORE UPDATE ON terminology_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_language_settings_updated_at ON language_settings;
CREATE TRIGGER update_language_settings_updated_at
    BEFORE UPDATE ON language_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_translation_memory_updated_at ON translation_memory;
CREATE TRIGGER update_translation_memory_updated_at
    BEFORE UPDATE ON translation_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 10. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.5-i18n', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
