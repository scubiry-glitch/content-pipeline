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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE
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

  // Create vector index for semantic search (HNSW for fast approximate search)
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_embedding ON assets USING hnsw (embedding vector_cosine_ops)`).catch(() => {
    console.log('[DB] HNSW index creation failed, trying ivfflat...');
    return query(`CREATE INDEX IF NOT EXISTS idx_assets_embedding ON assets USING ivfflat (embedding vector_cosine_ops)`).catch(() => {
      console.log('[DB] Vector index creation skipped (may need more data)');
    });
  });

  console.log('[DB] MVP Schema initialized successfully');
}
