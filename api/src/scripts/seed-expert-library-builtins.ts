#!/usr/bin/env npx tsx
/**
 * 手动将专家库内置 profile 同步到 expert_profiles（与线上一致逻辑，ON CONFLICT DO NOTHING）。
 *
 * 用法（在 api/ 目录）：
 *   npm run expert:seed-builtins
 *   npx tsx src/scripts/seed-expert-library-builtins.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { initDatabase, closePool } from '../db/connection.js';
import { initLLMRouter } from '../providers/index.js';
import { createPipelineDeps } from '../modules/expert-library/adapters/pipeline.js';
import { query } from '../db/connection.js';
import { generateEmbedding } from '../services/llm.js';
import { seedDefaultBuiltinExpertsToDb } from '../modules/expert-library/expertSeed.js';

const API_ROOT = process.cwd();
dotenv.config({ path: path.join(API_ROOT, '.env') });

async function main() {
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.error('未配置 DATABASE_URL 或 DB_HOST，跳过');
    process.exit(1);
  }

  initLLMRouter({
    kimiApiKey: process.env.KIMI_API_KEY,
    claudeApiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    useClaudeCode: false,
  });

  await initDatabase();
  const deps = createPipelineDeps(query, undefined, undefined, generateEmbedding);
  const stats = await seedDefaultBuiltinExpertsToDb(deps);
  console.log('[seed-expert-library-builtins] 完成:', stats);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
