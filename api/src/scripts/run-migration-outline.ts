// Run streaming outline migration
import { query } from '../db/connection.js';

async function runMigration() {
  console.log('Running migration: 007_add_streaming_outline.sql\n');

  try {
    // Create outline_generation_progress table
    console.log('Creating outline_generation_progress table...');
    await query(`
      CREATE TABLE IF NOT EXISTS outline_generation_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'running',
        current_layer VARCHAR(20),
        layers JSONB DEFAULT '[]',
        accumulated_outline JSONB DEFAULT '[]',
        insights JSONB DEFAULT '[]',
        novel_angles JSONB DEFAULT '[]',
        layer_progress JSONB DEFAULT '{"macro":0,"meso":0,"micro":0}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id)
      )
    `);
    console.log('✓ outline_generation_progress table created');

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_outline_progress_task ON outline_generation_progress(task_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_outline_progress_status ON outline_generation_progress(status)`);
    console.log('✓ outline_generation_progress indexes created');

    // Create outline_versions table
    console.log('\nCreating outline_versions table...');
    await query(`
      CREATE TABLE IF NOT EXISTS outline_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(50) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        outline JSONB NOT NULL,
        layers JSONB,
        insights JSONB,
        novel_angles JSONB,
        data_requirements JSONB,
        generated_by VARCHAR(50) DEFAULT 'system',
        generation_mode VARCHAR(20) DEFAULT 'streaming',
        layer_progress JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ outline_versions table created');

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_outline_versions_task ON outline_versions(task_id, version DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_outline_versions_created ON outline_versions(created_at)`);
    console.log('✓ outline_versions indexes created');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
