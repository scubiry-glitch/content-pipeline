// Database connection for Content Pipeline MVP
// PostgreSQL with pgvector support

import { Pool, PoolClient, QueryResult } from 'pg';

let pool: Pool | null = null;

export interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export function createPool(): Pool {
  if (!pool) {
    const config: DBConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'author',
      user: process.env.DB_USER || 'scubiry',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true'
    };

    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }
  return pool;
}

export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    createPool();
  }
  return pool!.connect();
}

export async function query(
  text: string,
  params?: any[]
): Promise<QueryResult<any>> {
  if (!pool) {
    createPool();
  }
  return pool!.query(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Initialize database schema for MVP
export async function initDatabase(): Promise<void> {
  createPool();
  await setupMVPSchema();
}

async function setupMVPSchema(): Promise<void> {
  // Enable pgvector extension
  await query('CREATE EXTENSION IF NOT EXISTS vector').catch(() => {
    console.log('[DB] pgvector extension may not be available, continuing...');
  });

  // Enable pg_trgm for similarity search
  await query('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(() => {
    console.log('[DB] pg_trgm extension may not be available, continuing...');
  });

  // Tasks table - production pipeline tasks
  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(50) PRIMARY KEY,
      topic VARCHAR(500) NOT NULL,
      source_materials JSONB NOT NULL DEFAULT '[]',
      target_formats JSONB NOT NULL DEFAULT '["markdown"]',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      current_stage VARCHAR(100),
      outline JSONB,
      research_data JSONB,
      approval_feedback TEXT,
      output_ids JSONB DEFAULT '[]',
      is_hidden BOOLEAN DEFAULT false,
      hidden_at TIMESTAMP WITH TIME ZONE,
      evaluation JSONB,
      competitor_analysis JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      created_by VARCHAR(100) DEFAULT 'user',
      is_deleted BOOLEAN DEFAULT false,
      deleted_at TIMESTAMP WITH TIME ZONE,
      deleted_by VARCHAR(100),
      delete_reason TEXT,
      will_be_purged_at TIMESTAMP WITH TIME ZONE,
      hidden_by VARCHAR(100)
    )
  `);

  // Blue team reviews
  await query(`
    CREATE TABLE IF NOT EXISTS blue_team_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      expert_role VARCHAR(50) NOT NULL,
      questions JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'pending',
      user_decision VARCHAR(20),
      decision_note TEXT,
      decided_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Draft versions
  await query(`
    CREATE TABLE IF NOT EXISTS draft_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      change_summary TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Research annotations - for deep research citations
  await query(`
    CREATE TABLE IF NOT EXISTS research_annotations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('url', 'asset')),
      url TEXT,
      asset_id VARCHAR(50) REFERENCES assets(id) ON DELETE SET NULL,
      title VARCHAR(500) NOT NULL,
      credibility JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Assets table - research materials (with pgvector support)
  await query(`
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      content TEXT,
      content_type VARCHAR(50) NOT NULL,
      filename VARCHAR(500),
      source VARCHAR(255),
      tags JSONB DEFAULT '[]',
      auto_tags JSONB DEFAULT '[]',
      quality_score DECIMAL(4,3) DEFAULT 0.5,
      embedding VECTOR(1536),
      citation_count INTEGER DEFAULT 0,
      is_pinned BOOLEAN DEFAULT FALSE,
      pinned_at TIMESTAMP WITH TIME ZONE,
      theme_id VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Asset themes table - for categorizing assets by theme
  await query(`
    CREATE TABLE IF NOT EXISTS asset_themes (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      color VARCHAR(20) DEFAULT '#6366f1',
      icon VARCHAR(50) DEFAULT '📁',
      sort_order INTEGER DEFAULT 0,
      is_pinned BOOLEAN DEFAULT FALSE,
      pinned_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Asset directory bindings - for monitoring local directories
  await query(`
    CREATE TABLE IF NOT EXISTS asset_directory_bindings (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      path TEXT NOT NULL,
      theme_id VARCHAR(50) REFERENCES asset_themes(id) ON DELETE SET NULL,
      auto_import BOOLEAN DEFAULT TRUE,
      include_subdirs BOOLEAN DEFAULT TRUE,
      file_patterns JSONB DEFAULT '["*.pdf", "*.txt", "*.md", "*.docx", "*.doc"]',
      last_scan_at TIMESTAMP WITH TIME ZONE,
      total_imported INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Tracked files - to avoid re-importing unchanged files
  await query(`
    CREATE TABLE IF NOT EXISTS asset_tracked_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      binding_id VARCHAR(50) REFERENCES asset_directory_bindings(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_hash VARCHAR(64),
      asset_id VARCHAR(50) REFERENCES assets(id) ON DELETE SET NULL,
      file_size BIGINT,
      modified_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(binding_id, file_path)
    )
  `);

  // Task logs - for operation audit trail
  await query(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL,
      details JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Draft edits - for final draft editing history (FR-024 ~ FR-025)
  await query(`
    CREATE TABLE IF NOT EXISTS draft_edits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      original_content TEXT NOT NULL,
      edited_content TEXT NOT NULL,
      changes JSONB NOT NULL DEFAULT '[]',
      edited_by VARCHAR(100) DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Add final draft columns to tasks table
  await query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS final_draft TEXT,
    ADD COLUMN IF NOT EXISTS final_draft_edited BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS final_draft_edit_id UUID,
    ADD COLUMN IF NOT EXISTS research_config JSONB
  `);

  // Outputs table - final generated content
  await query(`
    CREATE TABLE IF NOT EXISTS outputs (
      id VARCHAR(50) PRIMARY KEY,
      task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      format VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Create indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_theme ON assets(theme_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_pinned ON assets(is_pinned, pinned_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_blue_team_task ON blue_team_reviews(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_research_annotations_task ON research_annotations(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_versions_task ON draft_versions(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_asset_bindings_active ON asset_directory_bindings(is_active)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tracked_files_binding ON asset_tracked_files(binding_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_edits_task ON draft_edits(task_id)`);

  // RSS sources table
  await query(`
    CREATE TABLE IF NOT EXISTS rss_sources (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      url VARCHAR(500) NOT NULL,
      category VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      last_crawled_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // RSS items table (FR-031 ~ FR-033)
  await query(`
    CREATE TABLE IF NOT EXISTS rss_items (
      id VARCHAR(32) PRIMARY KEY,
      source_id VARCHAR(50) NOT NULL,
      source_name VARCHAR(100) NOT NULL,
      title VARCHAR(500) NOT NULL,
      link TEXT NOT NULL,
      content TEXT,
      summary TEXT,
      published_at TIMESTAMP WITH TIME ZONE,
      author VARCHAR(200),
      categories JSONB DEFAULT '[]',
      tags JSONB DEFAULT '[]',
      relevance_score DECIMAL(3,2) DEFAULT 0,
      embedding VECTOR(1536),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(link)
    )
  `);

  // RSS fetch logs
  await query(`
    CREATE TABLE IF NOT EXISTS rss_fetch_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id VARCHAR(50) NOT NULL,
      fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      fetched_date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(20) NOT NULL,
      items_count INTEGER DEFAULT 0,
      error_message TEXT,
      UNIQUE(source_id, fetched_date)
    )
  `);

  // Create indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_rss_items_source ON rss_items(source_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rss_items_created ON rss_items(created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rss_items_tags ON rss_items USING GIN(tags)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rss_items_relevance ON rss_items(relevance_score)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rss_embedding ON rss_items USING hnsw (embedding vector_cosine_ops)`).catch(() => {
    console.log('[DB] HNSW index creation failed for rss_items, trying ivfflat...');
    return query(`CREATE INDEX IF NOT EXISTS idx_rss_embedding ON rss_items USING ivfflat (embedding vector_cosine_ops)`).catch(() => {
      console.log('[DB] Vector index creation skipped for rss_items');
    });
  });

  // Recommendation logs table (FR-028 ~ FR-030)
  await query(`
    CREATE TABLE IF NOT EXISTS recommendation_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recommendation_id VARCHAR(100) NOT NULL,
      user_id VARCHAR(100),
      action VARCHAR(20) NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Create indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_recommendation_logs_user ON recommendation_logs(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_recommendation_logs_action ON recommendation_logs(action)`);

  // Task archive table (FR-034 ~ FR-035)
  await query(`
    CREATE TABLE IF NOT EXISTS task_archives (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL UNIQUE,
      task_data JSONB NOT NULL,
      archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Create indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_task_archives_task ON task_archives(task_id)`);

  // Translation cache table (ML-002 ~ ML-004)
  await query(`
    CREATE TABLE IF NOT EXISTS translation_cache (
      hash VARCHAR(64) PRIMARY KEY,
      original TEXT NOT NULL,
      translated TEXT NOT NULL,
      source_language VARCHAR(10) NOT NULL DEFAULT 'en',
      target_language VARCHAR(10) NOT NULL DEFAULT 'zh',
      quality_score DECIMAL(3,2) DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Create index
  await query(`CREATE INDEX IF NOT EXISTS idx_translation_cache_created ON translation_cache(created_at)`);

  // Add translation columns to rss_items
  await query(`
    ALTER TABLE rss_items
    ADD COLUMN IF NOT EXISTS translated_title VARCHAR(500),
    ADD COLUMN IF NOT EXISTS translated_summary TEXT,
    ADD COLUMN IF NOT EXISTS translation_quality DECIMAL(3,2),
    ADD COLUMN IF NOT EXISTS translated_at TIMESTAMP WITH TIME ZONE
  `);

  // Create vector index for semantic search (HNSW for fast approximate search)
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_embedding ON assets USING hnsw (embedding vector_cosine_ops)`).catch(() => {
    console.log('[DB] HNSW index creation failed, trying ivfflat...');
    return query(`CREATE INDEX IF NOT EXISTS idx_assets_embedding ON assets USING ivfflat (embedding vector_cosine_ops)`).catch(() => {
      console.log('[DB] Vector index creation skipped (may need more data)');
    });
  });

  // Reports table - research reports library (v3.3)
  await query(`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      authors JSONB DEFAULT '[]',
      institution VARCHAR(200),
      publish_date DATE,
      page_count INTEGER,
      file_url TEXT,
      content TEXT,
      key_points JSONB DEFAULT '[]',
      tags JSONB DEFAULT '[]',
      quality_score DECIMAL(4,3) DEFAULT 0.5,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Add missing columns to existing reports table
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_score DECIMAL(4,3) DEFAULT 0.5`);
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'`);
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'`);

  // Create indexes for reports
  await query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at)`);

  // Experts table - expert library (v2.0)
  await query(`
    CREATE TABLE IF NOT EXISTS experts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      title VARCHAR(200),
      company VARCHAR(200),
      angle VARCHAR(50) DEFAULT 'challenger',
      domain VARCHAR(200),
      bio TEXT,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Create indexes for experts
  await query(`CREATE INDEX IF NOT EXISTS idx_experts_status ON experts(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_experts_domain ON experts(domain)`);

  // Sentiment analysis table (v2.2 - SA-001 ~ SA-005)
  await query(`
    CREATE TABLE IF NOT EXISTS sentiment_analysis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content_id VARCHAR(100) NOT NULL,
      topic_id VARCHAR(50),
      source_type VARCHAR(50) NOT NULL,
      polarity VARCHAR(20) NOT NULL CHECK (polarity IN ('positive', 'negative', 'neutral')),
      intensity INTEGER DEFAULT 0 CHECK (intensity >= 0 AND intensity <= 100),
      confidence DECIMAL(3,2) DEFAULT 0,
      keywords JSONB DEFAULT '[]',
      analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(content_id)
    )
  `);

  // Hot topics table for sentiment tracking
  await query(`
    CREATE TABLE IF NOT EXISTS hot_topics (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      category VARCHAR(100),
      sentiment_score DECIMAL(5,2) DEFAULT 0,
      mention_count INTEGER DEFAULT 0,
      trend_direction VARCHAR(20) DEFAULT 'stable',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Report hot topic relations table
  await query(`
    CREATE TABLE IF NOT EXISTS report_hot_topic_relations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL,
      hot_topic_id VARCHAR(50) NOT NULL,
      match_score DECIMAL(4,3) DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(report_id, hot_topic_id)
    )
  `);

  // User hot topic follows table
  await query(`
    CREATE TABLE IF NOT EXISTS user_hot_topic_follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(100) NOT NULL,
      hot_topic_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, hot_topic_id)
    )
  `);

  // Create indexes for hot topic tables
  await query(`CREATE INDEX IF NOT EXISTS idx_report_hot_topic_relations_report ON report_hot_topic_relations(report_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_report_hot_topic_relations_topic ON report_hot_topic_relations(hot_topic_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_hot_topic_follows_user ON user_hot_topic_follows(user_id)`);

  // Create indexes for sentiment analysis
  await query(`CREATE INDEX IF NOT EXISTS idx_sentiment_topic ON sentiment_analysis(topic_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sentiment_polarity ON sentiment_analysis(polarity)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sentiment_analyzed_at ON sentiment_analysis(analyzed_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sentiment_source ON sentiment_analysis(source_type, analyzed_at)`);

  console.log('[DB] MVP Schema initialized successfully');
}
