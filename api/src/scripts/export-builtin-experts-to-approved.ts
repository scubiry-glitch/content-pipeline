/**
 * 将代码内置 ExpertProfile（musk / xhs / topExperts）导出为 JSON 至 generated/approved/，供 expert:upsert-approved 入库。
 * 用法：cd api && npx tsx src/scripts/export-builtin-experts-to-approved.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { muskProfile } from '../modules/expert-library/data/musk.js';
import { xiaohongshuProfile } from '../modules/expert-library/data/xiaohongshu.js';
import { topExpertProfiles } from '../modules/expert-library/data/topExperts.js';
import { assertExpertProfile } from '../modules/expert-library/expertProfileDb.js';
import type { ExpertProfile } from '../modules/expert-library/types.js';

const APPROVED = path.join(
  process.cwd(),
  'src/modules/expert-library/data/generated/approved'
);

function main() {
  fs.mkdirSync(APPROVED, { recursive: true });
  const list: ExpertProfile[] = [muskProfile, xiaohongshuProfile, ...topExpertProfiles];
  const byId = new Map<string, ExpertProfile>();
  for (const p of list) {
    if (byId.has(p.expert_id)) {
      console.warn('重复 expert_id，后者覆盖:', p.expert_id);
    }
    byId.set(p.expert_id, p);
  }
  let n = 0;
  for (const p of byId.values()) {
    const id = p.expert_id;
    if (!assertExpertProfile(p)) {
      console.error('assertExpertProfile 失败，跳过:', id);
      continue;
    }
    const out = path.join(APPROVED, `${p.expert_id}.json`);
    fs.writeFileSync(out, JSON.stringify(p, null, 2) + '\n', 'utf8');
    n++;
    console.log('已写入', path.basename(out));
  }
  console.log(`完成：${n} 个文件 -> ${APPROVED}`);
}

main();
