// Run database migration script
import { query } from '../db/connection.js';

async function runMigration() {
  console.log('Running migration: 006_add_community_topics.sql\n');
  
  try {
    // Create community_topics table
    console.log('Creating community_topics table...');
    await query(`
      CREATE TABLE IF NOT EXISTS community_topics (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        platform_id VARCHAR(100),
        platform_url VARCHAR(1000),
        hot_score INTEGER DEFAULT 0,
        platform_rank INTEGER,
        view_count BIGINT,
        like_count BIGINT,
        comment_count BIGINT,
        share_count BIGINT,
        content_type VARCHAR(20) DEFAULT 'text',
        key_opinions JSONB DEFAULT '[]',
        sentiment VARCHAR(20) DEFAULT 'neutral',
        tags JSONB DEFAULT '[]',
        creator_name VARCHAR(200),
        creator_followers BIGINT,
        creator_verified BOOLEAN DEFAULT false,
        category VARCHAR(50),
        is_filtered BOOLEAN DEFAULT false,
        filter_reason VARCHAR(200),
        published_at TIMESTAMP,
        crawled_at TIMESTAMP DEFAULT NOW(),
        unified_topic_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ community_topics table created');

    // Create indexes for community_topics
    await query(`CREATE INDEX IF NOT EXISTS idx_community_platform ON community_topics(platform)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_community_hot_score ON community_topics(hot_score DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_community_crawled ON community_topics(crawled_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_community_unified ON community_topics(unified_topic_id)`);
    console.log('✓ community_topics indexes created');

    // Create web_search_results table
    console.log('\nCreating web_search_results table...');
    await query(`
      CREATE TABLE IF NOT EXISTS web_search_results (
        id VARCHAR(50) PRIMARY KEY,
        query VARCHAR(500),
        search_mode VARCHAR(50),
        search_engine VARCHAR(50),
        title VARCHAR(500),
        url VARCHAR(1000),
        snippet TEXT,
        content TEXT,
        published_at TIMESTAMP,
        source_domain VARCHAR(200),
        is_authority_source BOOLEAN DEFAULT false,
        related_topic_id VARCHAR(50),
        relevance_score DECIMAL(3,2),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ web_search_results table created');

    // Create indexes for web_search_results
    await query(`CREATE INDEX IF NOT EXISTS idx_web_search_topic ON web_search_results(related_topic_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_web_search_query ON web_search_results(query)`);
    console.log('✓ web_search_results indexes created');

    // Create unified_topics table
    console.log('\nCreating unified_topics table...');
    await query(`
      CREATE TABLE IF NOT EXISTS unified_topics (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        canonical_title VARCHAR(500),
        hot_score INTEGER DEFAULT 0,
        confidence DECIMAL(3,2) DEFAULT 0,
        has_rss_source BOOLEAN DEFAULT false,
        has_web_source BOOLEAN DEFAULT false,
        has_community_source BOOLEAN DEFAULT false,
        source_count INTEGER DEFAULT 0,
        sources JSONB DEFAULT '[]',
        key_opinions JSONB DEFAULT '[]',
        cross_platform_sentiment VARCHAR(20) DEFAULT 'neutral',
        first_seen_at TIMESTAMP,
        last_updated_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✓ unified_topics table created');

    // Create indexes for unified_topics
    await query(`CREATE INDEX IF NOT EXISTS idx_unified_hot_score ON unified_topics(hot_score DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_unified_confidence ON unified_topics(confidence DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_unified_sources ON unified_topics(has_rss_source, has_web_source, has_community_source)`);
    console.log('✓ unified_topics indexes created');

    // Add columns to existing tables
    console.log('\nAdding columns to existing tables...');
    
    // Add unified_topic_id to rss_items
    try {
      await query(`ALTER TABLE rss_items ADD COLUMN IF NOT EXISTS unified_topic_id VARCHAR(50)`);
      console.log('✓ Added unified_topic_id to rss_items');
    } catch (e) {
      console.log('⊘ unified_topic_id in rss_items already exists or error');
    }

    // Add columns to hot_topics
    try {
      await query(`ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS unified_topic_id VARCHAR(50)`);
      await query(`ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS discovery_sources JSONB DEFAULT '[]'`);
      await query(`ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS web_verified_score INTEGER`);
      await query(`ALTER TABLE hot_topics ADD COLUMN IF NOT EXISTS community_score INTEGER`);
      console.log('✓ Added columns to hot_topics');
    } catch (e) {
      console.log('⊘ Columns in hot_topics already exist or error');
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
