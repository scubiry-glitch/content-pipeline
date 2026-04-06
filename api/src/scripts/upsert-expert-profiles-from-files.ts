#!/usr/bin/env npx tsx
/**
 * 将已审查的 ExpertProfile JSON 批量 UPSERT 到 expert_profiles。
 *
 * 用法：
 *   cd api && npx tsx src/scripts/upsert-expert-profiles-from-files.ts --dir=modules/expert-library/data/generated/approved
 *   npx tsx src/scripts/upsert-expert-profiles-from-files.ts --dry-run
 *
 * 默认目录（相对 api/）：modules/expert-library/data/generated/approved
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { query } from '../db/connection.js';
import { assertExpertProfile, expertProfileToDbParams } from '../modules/expert-library/expertProfileDb.js';
import type { ExpertProfile } from '../modules/expert-library/types.js';

/** 请在仓库 `api/` 目录下执行 */
const API_ROOT = process.cwd();
dotenv.config({ path: path.join(API_ROOT, '.env') });

const DEFAULT_REL = 'src/modules/expert-library/data/generated/approved';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let dir = path.join(API_ROOT, DEFAULT_REL);
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  if (dirArg) {
    const v = dirArg.replace(/^--dir=/, '');
    dir = path.isAbsolute(v) ? v : path.join(API_ROOT, v);
  }
  return { dryRun, dir };
}

async function main() {
  const { dryRun, dir } = parseArgs();
  if (!fs.existsSync(dir)) {
    console.error('目录不存在:', dir);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  const profiles: ExpertProfile[] = [];

  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    if (!assertExpertProfile(raw)) {
      console.error('校验失败，跳过:', f);
      continue;
    }
    profiles.push(raw);
  }

  console.log(`待写入 ${profiles.length} 条${dryRun ? '（dry-run，不执行 SQL）' : ''}`);

  if (dryRun) {
    for (const p of profiles) console.log(' ', p.expert_id, p.name);
    return;
  }

  const sql = `
    INSERT INTO expert_profiles (
      expert_id, name, domain, persona, method, emm, constraints_config, output_schema, anti_patterns, signature_phrases, is_active
    ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, true)
    ON CONFLICT (expert_id) DO UPDATE SET
      name = EXCLUDED.name,
      domain = EXCLUDED.domain,
      persona = EXCLUDED.persona,
      method = EXCLUDED.method,
      emm = EXCLUDED.emm,
      constraints_config = EXCLUDED.constraints_config,
      output_schema = EXCLUDED.output_schema,
      anti_patterns = EXCLUDED.anti_patterns,
      signature_phrases = EXCLUDED.signature_phrases,
      is_active = true,
      updated_at = NOW()
  `;

  for (const p of profiles) {
    const row = expertProfileToDbParams(p);
    await query(sql, [
      row.expert_id,
      row.name,
      row.domain,
      JSON.stringify(row.persona),
      JSON.stringify(row.method),
      row.emm ? JSON.stringify(row.emm) : null,
      JSON.stringify(row.constraints_config),
      JSON.stringify(row.output_schema),
      row.anti_patterns,
      row.signature_phrases,
    ]);
    console.log('UPSERT OK', p.expert_id);
  }

  console.log('完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
