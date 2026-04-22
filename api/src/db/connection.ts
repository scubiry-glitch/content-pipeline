// Database connection for Content Pipeline MVP
// PostgreSQL with pgvector support

import { Pool, PoolClient, QueryResult } from 'pg';

let pool: Pool | null = null;
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD_MS || '1000', 10);
const QUERY_MAX_RETRIES = parseInt(process.env.DB_QUERY_MAX_RETRIES || '3', 10);
const QUERY_BASE_BACKOFF_MS = parseInt(process.env.DB_QUERY_BASE_BACKOFF_MS || '100', 10);

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
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const sslFromEnv =
      process.env.DB_SSL === 'true' || /\bsslmode=(require|verify-full|verify-ca)\b/i.test(databaseUrl || '');

    const poolBase = {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    if (databaseUrl) {
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: sslFromEnv ? { rejectUnauthorized: false } : undefined,
        ...poolBase,
      });
    } else {
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
        ...poolBase,
      });
    }

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
  return withConnectionRetry(() => pool!.connect(), 'pool.connect');
}

export async function query(
  text: string,
  params?: any[]
): Promise<QueryResult<any>> {
  if (!pool) {
    createPool();
  }
  return withConnectionRetry(async () => {
    const startedAt = Date.now();
    const result = await pool!.query(text, params);
    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= SLOW_QUERY_THRESHOLD_MS) {
      console.warn('[DB][SLOW_QUERY]', {
        elapsedMs,
        thresholdMs: SLOW_QUERY_THRESHOLD_MS,
        sql: summarizeSql(text),
        paramsCount: params?.length || 0
      });
    }

    return result;
  }, 'pool.query');
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Initialize database schema for MVP
// In-memory mode flag
let inMemoryMode = false;

export function enableInMemoryMode(): void {
  inMemoryMode = true;
  console.log('[DB] In-memory mode enabled');
}

export function isInMemoryMode(): boolean {
  return inMemoryMode;
}

export async function initDatabase(config?: DBConfig): Promise<void> {
  if (config) {
    // Use provided config
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
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
  } else {
    createPool();
  }
  await setupMVPSchema();
}

/**
 * 仅创建连接池并 ping 数据库，不执行 setupMVPSchema。
 * 适用于库结构已由 `npm run db:init` 或 API 启动迁移过的环境，避免脚本重复跑漫长 DDL。
 */
export async function ensureDbPoolConnected(): Promise<void> {
  createPool();
  await query('SELECT 1');
}

async function withConnectionRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= QUERY_MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isConnectionError(error) || attempt === QUERY_MAX_RETRIES) {
        throw error;
      }

      const delayMs = backoffWithJitter(attempt);
      console.warn('[DB][RETRY]', {
        operation: operationName,
        attempt: attempt + 1,
        maxRetries: QUERY_MAX_RETRIES,
        delayMs,
        reason: getErrorMessage(error)
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown database error');
}

function isConnectionError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const code = err?.code || '';
  const message = (err?.message || '').toLowerCase();
  const transientCodes = new Set([
    '57P01', // admin shutdown
    '57P02', // crash shutdown
    '57P03', // cannot connect now
    '08000',
    '08001',
    '08003',
    '08004',
    '08006',
    '08007',
    '08P01',
    '53300' // too many connections
  ]);
  if (transientCodes.has(code)) return true;

  return (
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection timeout') ||
    message.includes('connect econnrefused') ||
    message.includes('connect etimedout') ||
    message.includes('connection reset') ||
    message.includes('the database system is starting up')
  );
}

function backoffWithJitter(attempt: number): number {
  const cappedAttempt = Math.min(attempt, 6);
  const baseDelay = QUERY_BASE_BACKOFF_MS * Math.pow(2, cappedAttempt);
  const jitter = Math.floor(Math.random() * QUERY_BASE_BACKOFF_MS);
  return baseDelay + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function summarizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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

  const vectorType = await query(
    `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') AS ok`
  ).catch(() => ({ rows: [{ ok: false }] as { ok: boolean }[] }));
  if (!vectorType.rows[0]?.ok) {
    throw new Error(
      'PostgreSQL 未提供 vector 类型（pgvector 未安装或未启用）。请先安装扩展并以有权限的用户执行：CREATE EXTENSION vector;\n' +
        '常见做法：Docker 使用 pgvector/pgvector 镜像；macOS 可用 brew install pgvector 并确保与当前 Postgres 主版本匹配。'
    );
  }

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
      search_config JSONB DEFAULT '{}',
      research_data JSONB,
      approval_feedback TEXT,
      output_ids JSONB DEFAULT '[]',
      asset_ids JSONB NOT NULL DEFAULT '[]',
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
      hidden_by VARCHAR(100),
      metadata JSONB DEFAULT '{}'
    )
  `);

  // 旧库升级：CREATE TABLE IF NOT EXISTS 不会补列，此处与 pipeline / listTasks / 专家评审 等路径对齐
  await query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS search_config JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS source_materials JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS target_formats JSONB DEFAULT '["markdown"]',
    ADD COLUMN IF NOT EXISTS output_ids JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS asset_ids JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS evaluation JSONB,
    ADD COLUMN IF NOT EXISTS competitor_analysis JSONB,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS delete_reason TEXT,
    ADD COLUMN IF NOT EXISTS will_be_purged_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hidden_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'
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
      -- 串行评审版本链支持
      source_review_id VARCHAR(50),
      previous_version_id UUID REFERENCES draft_versions(id),
      round INTEGER DEFAULT 0,
      expert_role VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // 旧库仅存在早期 draft_versions 结构时补列（否则 idx_draft_versions_round 会因缺列失败）
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS source_review_id VARCHAR(50)`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS previous_version_id UUID`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS round INTEGER DEFAULT 0`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS expert_role VARCHAR(20)`);
  
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_versions_task ON draft_versions(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_versions_round ON draft_versions(round)`);

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

  // Add missing columns to assets table for v6.2 AI processing
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS file_url TEXT`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS file_size BIGINT`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS author VARCHAR(200)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS hidden_reason TEXT`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(50) DEFAULT 'pending'`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_theme_id VARCHAR(50)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_theme_confidence DECIMAL(4,3)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tags JSONB DEFAULT '[]'`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_duplicate_of VARCHAR(50)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);
  // v6.3: taxonomy integration columns
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS domain VARCHAR(100)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS taxonomy_code VARCHAR(50)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS type VARCHAR(50)`);

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

  // Asset library table - for smart asset import with quality scoring
  await query(`
    CREATE TABLE IF NOT EXISTS asset_library (
      id VARCHAR(50) PRIMARY KEY DEFAULT 'asset_' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 8),
      content TEXT NOT NULL,
      content_type VARCHAR(50) NOT NULL,
      auto_tags JSONB DEFAULT '[]',
      quality_score DECIMAL(4,3) DEFAULT 0.5,
      quality_factors JSONB DEFAULT '{}',
      reference_weight DECIMAL(4,3) DEFAULT 0,
      combined_weight DECIMAL(4,3) DEFAULT 0,
      embedding VECTOR(1536),
      source VARCHAR(255) NOT NULL,
      source_url TEXT,
      publish_date TIMESTAMP WITH TIME ZONE,
      last_used_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
      domain VARCHAR(100),
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

  // Research reports table - for storing research results
  await query(`
    CREATE TABLE IF NOT EXISTS research_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      topic_id VARCHAR(50) REFERENCES tasks(id) ON DELETE CASCADE,
      data_package JSONB NOT NULL DEFAULT '[]',
      analysis JSONB NOT NULL DEFAULT '{}',
      insights JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Expert library table - for BlueTeam reviewers
  await query(`
    CREATE TABLE IF NOT EXISTS expert_library (
      id VARCHAR(50) PRIMARY KEY DEFAULT 'expert_' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 8),
      name VARCHAR(100) NOT NULL,
      title VARCHAR(200),
      role VARCHAR(50) NOT NULL DEFAULT 'domain_expert',
      domains TEXT[] DEFAULT '{}',
      expertise_level INTEGER DEFAULT 3,
      system_prompt TEXT,
      bio TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `).catch(async (err) => {
    // Table might exist with different schema, try to add missing columns
    if (err.message?.includes('already exists')) {
      await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'domain_expert'`);
      await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS domains TEXT[] DEFAULT '{}'`);
      await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS expertise_level INTEGER DEFAULT 3`);
      await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS system_prompt TEXT`);
      await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS bio TEXT`);
      await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
    }
  });

  // Ensure columns exist (for existing tables)
  await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'domain_expert'`).catch(() => {});
  await query(`ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => {});

  // Expert profiles table - for Expert Library module
  await query(`
    CREATE TABLE IF NOT EXISTS expert_profiles (
      expert_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      domain TEXT[] DEFAULT '{}',
      persona JSONB DEFAULT '{}',
      method JSONB DEFAULT '{}',
      emm JSONB,
      constraints_config JSONB DEFAULT '{"must_conclude": true, "allow_assumption": false}',
      output_schema JSONB DEFAULT '{"format": "structured_report", "sections": []}',
      anti_patterns TEXT[] DEFAULT '{}',
      signature_phrases TEXT[] DEFAULT '{}',
      display_metadata JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      availability_status VARCHAR(20) DEFAULT 'available',
      authority_score DECIMAL(4,3) DEFAULT 0.500,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // 兼容旧库：补齐 expert_profiles 新增列，避免 expert seed / experts/full 500
  await query(`ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS display_metadata JSONB DEFAULT '{}'`).catch(() => {});
  await query(`ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS availability_status VARCHAR(20) DEFAULT 'available'`).catch(() => {});
  await query(`ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});
  await query(`ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS authority_score DECIMAL(4,3) DEFAULT 0.500`).catch(() => {});

  // expert_invocations 兼容创建（调用历史记录）
  await query(`
    CREATE TABLE IF NOT EXISTS expert_invocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      expert_id VARCHAR(50) NOT NULL,
      task_type VARCHAR(50) NOT NULL,
      input_type VARCHAR(50) NOT NULL,
      input_summary TEXT,
      output_sections JSONB,
      input_analysis JSONB,
      emm_gates_passed TEXT[],
      confidence FLOAT,
      params JSONB DEFAULT '{}',
      is_hidden BOOLEAN DEFAULT false,
      user_rating SMALLINT,
      rated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_invocations_expert ON expert_invocations(expert_id, created_at DESC)`).catch(() => {});
  // 辩论隐藏 + 打分列（旧库补列）
  await query(`ALTER TABLE expert_invocations ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false`).catch(() => {});
  await query(`ALTER TABLE expert_invocations ADD COLUMN IF NOT EXISTS user_rating SMALLINT`).catch(() => {});
  await query(`ALTER TABLE expert_invocations ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ`).catch(() => {});

  // Phase 6: expert_feedback 兼容创建（未经迁移的旧环境） + rubric_scores 列
  await query(`
    CREATE TABLE IF NOT EXISTS expert_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      expert_id VARCHAR(50) NOT NULL,
      invoke_id UUID,
      human_score SMALLINT CHECK (human_score BETWEEN 1 AND 5),
      human_notes TEXT,
      actual_outcome JSONB,
      comparison JSONB,
      rubric_scores JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await query(`ALTER TABLE expert_feedback ADD COLUMN IF NOT EXISTS rubric_scores JSONB`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_feedback_expert ON expert_feedback(expert_id, created_at DESC)`).catch(() => {});

  // Seed default experts for BlueTeam if none exist
  const expertCount = await query(`SELECT COUNT(*) FROM expert_library WHERE is_active = true`);
  if (parseInt(expertCount.rows[0].count) === 0) {
    await query(`
      INSERT INTO expert_library (id, name, title, role, domains, expertise_level, system_prompt, bio) VALUES
      ('expert_general_fact', '陈事实', '资深数据核查专家', 'fact_checker', ARRAY['通用', '数据'], 5,
       '你是一位严谨的事实核查专家，专注于检查数据准确性、来源可靠性和统计正确性。',
       '10年数据核查经验，曾为多家主流媒体把关'),
      ('expert_general_logic', '罗逻辑', '逻辑分析专家', 'logic_checker', ARRAY['通用', '逻辑'], 5,
       '你是一位敏锐的逻辑检察官，专注于检查论证严密性、推理合理性和逻辑一致性。',
       '哲学博士，专精于论证分析和逻辑推理'),
      ('expert_general_domain', '李行家', '产业研究专家', 'domain_expert', ARRAY['通用', '产业'], 5,
       '你是一位资深的行业专家，专注于检查专业术语使用、趋势判断准确性和洞察深度。',
       '20年产业研究经验，覆盖多个行业领域'),
      ('expert_general_reader', '张读者', '用户体验专家', 'reader_rep', ARRAY['通用', '阅读'], 5,
       '你是一位代表读者视角的专家，专注于检查文章可读性、流畅度和易理解程度。',
       '资深编辑，深谙读者心理')
    `);
  }

  // Create indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_research_reports_topic ON research_reports(topic_id)`);
  // Expert library indexes (only if table exists with correct schema)
  await query(`CREATE INDEX IF NOT EXISTS idx_expert_library_role ON expert_library(role)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_expert_library_active ON expert_library(is_active)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_theme ON assets(theme_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_pinned ON assets(is_pinned, pinned_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_visibility ON assets(is_deleted, is_hidden, created_at DESC)`);
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

  // ========== Pipeline v5.0 补全: 流式生成 + 评审所需表结构 ==========

  // 扩展 draft_versions 表 — 添加流式生成和修订所需的列
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS status VARCHAR(50)`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS outline JSONB`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS sections JSONB`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS word_count INTEGER`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS parent_id UUID`);
  await query(`ALTER TABLE draft_versions ADD COLUMN IF NOT EXISTS revision_notes JSONB`);

  // 草稿生成进度表 — 支持流式生成断点续传
  await query(`
    CREATE TABLE IF NOT EXISTS draft_generation_progress (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'running',
      current_section_index INTEGER DEFAULT 0,
      total_sections INTEGER DEFAULT 0,
      accumulated_content TEXT DEFAULT '',
      sections JSONB DEFAULT '[]',
      outline JSONB,
      config JSONB,
      progress DECIMAL(5,4) DEFAULT 0,
      error_message TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(task_id)
    )
  `);

  // 草稿修订进度表 — 支持流式修订断点续传
  await query(`
    CREATE TABLE IF NOT EXISTS draft_revision_progress (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL,
      draft_id UUID,
      status VARCHAR(20) DEFAULT 'running',
      current_section_index INTEGER DEFAULT 0,
      total_sections INTEGER DEFAULT 0,
      accumulated_content TEXT DEFAULT '',
      sections JSONB DEFAULT '[]',
      applied_suggestions INTEGER DEFAULT 0,
      total_suggestions INTEGER DEFAULT 0,
      progress DECIMAL(5,4) DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(task_id, draft_id)
    )
  `);

  // 草稿修订记录表
  await query(`
    CREATE TABLE IF NOT EXISTS draft_revisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL,
      draft_id UUID,
      new_draft_id UUID,
      version INTEGER,
      suggestions_applied INTEGER DEFAULT 0,
      suggestions_total INTEGER DEFAULT 0,
      mode VARCHAR(20) DEFAULT 'balanced',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // 草稿中间版本表 — 修订过程中的检查点
  await query(`
    CREATE TABLE IF NOT EXISTS draft_intermediate_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL,
      parent_draft_id UUID,
      version INTEGER,
      sub_version INTEGER,
      content TEXT,
      sections_completed INTEGER,
      total_sections INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // 专家评审记录表 — 串行多轮评审
  await query(`
    CREATE TABLE IF NOT EXISTS expert_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL,
      draft_id UUID,
      round INTEGER NOT NULL,
      expert_type VARCHAR(10) NOT NULL,
      expert_role VARCHAR(20),
      expert_id VARCHAR(50),
      expert_name VARCHAR(100),
      expert_profile TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      input_draft_id UUID,
      output_draft_id UUID,
      questions JSONB,
      overall_score INTEGER,
      summary TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  // 真人专家评审任务表
  await query(`
    CREATE TABLE IF NOT EXISTS expert_review_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      expert_id VARCHAR(50),
      task_id VARCHAR(50) NOT NULL,
      review_id UUID,
      draft_id UUID,
      status VARCHAR(20) DEFAULT 'pending',
      draft_content TEXT,
      fact_check_summary JSONB,
      logic_check_summary JSONB,
      score INTEGER,
      summary TEXT,
      questions JSONB,
      deadline TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  // 大纲评论表
  await query(`
    CREATE TABLE IF NOT EXISTS outline_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(100) DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // 视图: 草稿版本树
  await query(`DROP VIEW IF EXISTS draft_version_tree`);
  await query(`
    CREATE VIEW draft_version_tree AS
    SELECT dv.*, COALESCE(dv.parent_id::text, '') AS parent_path
    FROM draft_versions dv
  `);

  // 确保 tasks 表有评审相关字段
  await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sequential_review_config JSONB`);
  await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_review_round INTEGER DEFAULT 0`);

  // 索引
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_gen_progress_task ON draft_generation_progress(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_rev_progress_task ON draft_revision_progress(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_revisions_task ON draft_revisions(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expert_reviews_task ON expert_reviews(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expert_reviews_round ON expert_reviews(task_id, round)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_expert ON expert_review_tasks(expert_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expert_review_tasks_status ON expert_review_tasks(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_outline_comments_task ON outline_comments(task_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_versions_parent ON draft_versions(parent_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_draft_versions_status ON draft_versions(status)`);

  // ========== Pipeline v6.2: Assets AI 批量处理 ==========

  // Asset AI 分析结果表
  await query(`
    CREATE TABLE IF NOT EXISTS asset_ai_analysis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id VARCHAR(50) NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
      quality_score INTEGER,
      quality_dimensions JSONB DEFAULT '{}',
      quality_summary TEXT,
      quality_strengths JSONB DEFAULT '[]',
      quality_weaknesses JSONB DEFAULT '[]',
      quality_key_insights JSONB DEFAULT '[]',
      quality_data_highlights JSONB DEFAULT '[]',
      quality_recommendation VARCHAR(50),
      structure_analysis JSONB DEFAULT '{}',
      primary_theme_id VARCHAR(50),
      primary_theme_confidence DECIMAL(4,3),
      secondary_themes JSONB DEFAULT '[]',
      expert_library_mapping JSONB DEFAULT '[]',
      extracted_tags JSONB DEFAULT '[]',
      extracted_entities JSONB DEFAULT '[]',
      embedding_status VARCHAR(50) DEFAULT 'pending',
      document_embedding VECTOR(1536),
      chunk_count INTEGER DEFAULT 0,
      embedding_model VARCHAR(100),
      duplicate_detection_result JSONB DEFAULT '{}',
      similarity_group_id VARCHAR(50),
      has_recommendation BOOLEAN DEFAULT FALSE,
      processing_time_ms INTEGER,
      model_version VARCHAR(50) DEFAULT 'v1.0',
      analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // v7.4: Deep Analysis 结果表 (15 deliverable + 专家库调用)
  await query(`
    CREATE TABLE IF NOT EXISTS asset_deep_analysis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id VARCHAR(50) NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
      matched_domain_expert_ids JSONB DEFAULT '[]',
      matched_senior_expert_id VARCHAR(50),
      match_reasons JSONB DEFAULT '[]',
      topic_recommendations JSONB,
      trend_signals JSONB,
      differentiation_gaps JSONB,
      knowledge_blanks JSONB,
      key_facts JSONB,
      entity_graph JSONB,
      delta_report JSONB,
      stale_facts JSONB,
      knowledge_card JSONB,
      insights JSONB,
      material_recommendations JSONB,
      expert_consensus JSONB,
      controversies JSONB,
      belief_evolution JSONB,
      cross_domain_insights JSONB,
      expert_invocations JSONB DEFAULT '[]',
      model_version VARCHAR(50) DEFAULT 'v2.0-deep',
      analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      processing_time_ms INTEGER
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ada_analyzed_at ON asset_deep_analysis(analyzed_at DESC)`);

  // Asset 内容分块表
  await query(`
    CREATE TABLE IF NOT EXISTS asset_content_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      chunk_type VARCHAR(50) DEFAULT 'body',
      chapter_title VARCHAR(500),
      start_page INTEGER,
      end_page INTEGER,
      priority INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(asset_id, chunk_index)
    )
  `);

  // AI 任务推荐表 (扩展 source_type 支持 asset)
  await query(`
    CREATE TABLE IF NOT EXISTS ai_task_recommendations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_type VARCHAR(50) DEFAULT 'asset',
      source_asset_id VARCHAR(50) REFERENCES assets(id) ON DELETE CASCADE,
      rss_item_id VARCHAR(50) REFERENCES rss_items(id) ON DELETE CASCADE,
      recommendation_data JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(source_asset_id, source_type)
    )
  `);

  // 索引
  await query(`CREATE INDEX IF NOT EXISTS idx_asset_ai_analysis_asset ON asset_ai_analysis(asset_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_asset_ai_analysis_score ON asset_ai_analysis(quality_score)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_asset_ai_analysis_theme ON asset_ai_analysis(primary_theme_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_asset_chunks_asset ON asset_content_chunks(asset_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_asset ON ai_task_recommendations(source_asset_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_status ON ai_task_recommendations(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_type ON ai_task_recommendations(source_type)`);

  // 为 assets 表添加 AI 向量索引
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_ai_embedding ON assets USING ivfflat (ai_document_embedding vector_cosine_ops)`).catch(() => {
    console.log('[DB] Assets AI embedding index creation skipped');
  });

  await setupContentLibrarySchema();

  console.log('[DB] MVP Schema initialized successfully');
}

/** v7.0 内容库表与索引（与 modules/content-library/migrations 对齐） */
async function setupContentLibrarySchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS content_facts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id VARCHAR(50),
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      context JSONB DEFAULT '{}',
      confidence DECIMAL(3,2) DEFAULT 0.5,
      is_current BOOLEAN DEFAULT true,
      superseded_by UUID REFERENCES content_facts(id),
      source_chunk_index INTEGER,
      embedding vector(768),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch((e) => console.warn('[DB] content_facts table skipped:', getErrorMessage(e)));

  await query(`CREATE INDEX IF NOT EXISTS idx_content_facts_subject ON content_facts(subject)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_facts_predicate ON content_facts(predicate)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_facts_current ON content_facts(is_current) WHERE is_current = true`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_facts_asset ON content_facts(asset_id)`).catch(() => {});
  await query(
    `CREATE INDEX IF NOT EXISTS idx_content_facts_context_domain ON content_facts USING GIN ((context->'domain'))`
  ).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_facts_created ON content_facts(created_at DESC)`).catch(() => {});
  await query(
    `CREATE INDEX IF NOT EXISTS idx_content_facts_contradiction ON content_facts(subject, predicate) WHERE is_current = true`
  ).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS content_entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_name TEXT NOT NULL UNIQUE,
      aliases TEXT[] DEFAULT '{}',
      entity_type VARCHAR(50) DEFAULT 'concept',
      taxonomy_domain_id VARCHAR(10),
      metadata JSONB DEFAULT '{}',
      embedding vector(768),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch((e) => console.warn('[DB] content_entities table skipped:', getErrorMessage(e)));

  await query(`CREATE INDEX IF NOT EXISTS idx_content_entities_type ON content_entities(entity_type)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_entities_domain ON content_entities(taxonomy_domain_id)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_entities_aliases ON content_entities USING GIN(aliases)`).catch(() => {});

  // v7.2 Louvain / getTopicRecommendations 依赖列（与 migrations/005-louvain-community.sql 对齐）
  await query(`
    ALTER TABLE content_entities
      ADD COLUMN IF NOT EXISTS community_id VARCHAR(50),
      ADD COLUMN IF NOT EXISTS community_cohesion DECIMAL(4,3)
  `).catch(() => {});
  await query(`
    CREATE INDEX IF NOT EXISTS idx_content_entities_community
      ON content_entities(community_id) WHERE community_id IS NOT NULL
  `).catch(() => {});

  // 议题 LLM  enrichment 缓存（getTopicRecommendations enrich=true 写入）
  await query(`
    CREATE TABLE IF NOT EXISTS content_topic_enrichments (
      entity_id UUID PRIMARY KEY,
      reason TEXT,
      title_suggestion TEXT,
      narrative TEXT,
      angle_matrix JSONB DEFAULT '[]',
      suggested_angles JSONB DEFAULT '[]',
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Round 2: 深度模式 — mode 列 + 复合唯一约束，让 generic/deep 两套缓存共存
  await query(`
    ALTER TABLE content_topic_enrichments
    ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'generic' NOT NULL
  `).catch(() => {});
  await query(`
    ALTER TABLE content_topic_enrichments
    ADD COLUMN IF NOT EXISTS expert_id VARCHAR(100)
  `).catch(() => {});
  await query(`
    ALTER TABLE content_topic_enrichments
    ADD COLUMN IF NOT EXISTS strategy VARCHAR(200)
  `).catch(() => {});
  // 新复合唯一索引 (entity_id, mode) — 若旧 PK(entity_id) 存在则放宽
  await query(`DROP INDEX IF EXISTS uq_topic_enrich_entity_mode`).catch(() => {});
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_enrich_entity_mode
    ON content_topic_enrichments(entity_id, mode)
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS content_beliefs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proposition TEXT NOT NULL,
      current_stance VARCHAR(20) DEFAULT 'evolving',
      confidence DECIMAL(3,2) DEFAULT 0.5,
      supporting_facts UUID[] DEFAULT '{}',
      contradicting_facts UUID[] DEFAULT '{}',
      taxonomy_domain_id VARCHAR(10),
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      history JSONB DEFAULT '[]'
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_beliefs_stance ON content_beliefs(current_stance)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_content_beliefs_domain ON content_beliefs(taxonomy_domain_id)`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS content_production_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(50),
      asset_ids TEXT[] DEFAULT '{}',
      expert_ids TEXT[] DEFAULT '{}',
      output_quality_score DECIMAL(3,2),
      human_feedback_score SMALLINT,
      combination_insight TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_production_log_quality ON content_production_log(output_quality_score DESC)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_production_log_task ON content_production_log(task_id)`).catch(() => {});

  await query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asset_ai_analysis') THEN
        ALTER TABLE asset_ai_analysis ADD COLUMN IF NOT EXISTS l0_summary TEXT;
        ALTER TABLE asset_ai_analysis ADD COLUMN IF NOT EXISTS l1_key_points TEXT[];
        ALTER TABLE asset_ai_analysis ADD COLUMN IF NOT EXISTS l1_token_count INTEGER;
      END IF;
    END $$
  `).catch(() => {});

  // 可选：assets 全文检索与 content_facts / content_entities 向量索引（失败时跳过）
  await query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assets') THEN
        ALTER TABLE assets ADD COLUMN IF NOT EXISTS content_tsv tsvector;
      END IF;
    END $$
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_assets_content_tsv ON assets USING GIN(content_tsv)`).catch(() => {
    console.log('[DB] idx_assets_content_tsv skipped (assets.content_tsv 可能不存在)');
  });
  await query(`
    CREATE OR REPLACE FUNCTION assets_tsv_trigger_fn()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `).catch(() => {});
  await query(`DROP TRIGGER IF EXISTS trg_assets_tsv_update ON assets`).catch(() => {});
  await query(`
    CREATE TRIGGER trg_assets_tsv_update
      BEFORE INSERT OR UPDATE OF title, content ON assets
      FOR EACH ROW EXECUTE FUNCTION assets_tsv_trigger_fn()
  `).catch(() => {
    console.log('[DB] assets tsvector trigger skipped (需 PG14+ 且存在 assets 表)');
  });
  await query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'assets' AND column_name = 'content_tsv') THEN
        UPDATE assets
        SET content_tsv = to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, ''))
        WHERE content_tsv IS NULL;
      END IF;
    END $$
  `).catch(() => {});

  await query(`
    CREATE INDEX IF NOT EXISTS idx_content_facts_embedding ON content_facts
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 50)
  `).catch(() => console.log('[DB] content_facts ivfflat index skipped'));
  await query(`
    CREATE INDEX IF NOT EXISTS idx_content_entities_embedding ON content_entities
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 50)
  `).catch(() => console.log('[DB] content_entities ivfflat index skipped'));
}
