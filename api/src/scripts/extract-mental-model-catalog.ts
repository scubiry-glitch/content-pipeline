#!/usr/bin/env npx tsx
/**
 * 抽取 Mental Model Catalog 脚本 (Phase 10)
 *
 * 扫描所有内置专家的 persona.cognition.mentalModels，生成统一的 catalog JSON
 * 输出到 01-product/experts/mental-model-catalog.json
 *
 * 用法：
 *   cd api && npx tsx src/scripts/extract-mental-model-catalog.ts
 *
 * Catalog 结构：
 * {
 *   generatedAt: string,
 *   totalModels: number,
 *   sharedCount: number,
 *   experts: Array<{ expert_id, name, domain }>,
 *   models: Array<{
 *     name, expertCount, isShared,
 *     variants: Array<{ expert_id, expert_name, summary, evidence[], applicationContext, failureCondition }>,
 *   }>
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 导入所有内置专家 profile (静态)
import { muskProfile } from '../modules/expert-library/data/musk.js';
import { xiaohongshuProfile } from '../modules/expert-library/data/xiaohongshu.js';
import { weiHangkongProfile } from '../modules/expert-library/data/weiHangkong.js';
import { yiMengProfile } from '../modules/expert-library/data/yiMeng.js';
import { topExpertProfiles } from '../modules/expert-library/data/topExperts.js';
import { jobsProfile } from '../modules/expert-library/data/jobs.js';
import { mungerProfile } from '../modules/expert-library/data/munger.js';
import { talebProfile } from '../modules/expert-library/data/taleb.js';
import { feynmanProfile } from '../modules/expert-library/data/feynman.js';
import { karpathyProfile } from '../modules/expert-library/data/karpathy.js';
import { paulGrahamProfile } from '../modules/expert-library/data/paulgraham.js';
import { buffettProfile } from '../modules/expert-library/data/buffett.js';
import { bezosProfile } from '../modules/expert-library/data/bezos.js';
import { zhangXiaolongProfile } from '../modules/expert-library/data/zhangxiaolong.js';
import { huangZhengProfile } from '../modules/expert-library/data/huangzheng.js';
import { liKaifuProfile } from '../modules/expert-library/data/likaifu.js';

import type { ExpertProfile, MentalModel } from '../modules/expert-library/types.js';

interface CatalogVariant {
  expert_id: string;
  expert_name: string;
  summary: string;
  evidence: string[];
  applicationContext: string;
  failureCondition: string;
}

interface CatalogModel {
  name: string;
  expertCount: number;
  isShared: boolean;
  variants: CatalogVariant[];
}

interface Catalog {
  generatedAt: string;
  totalModels: number;
  sharedCount: number;
  expertCount: number;
  experts: Array<{ expert_id: string; name: string; domain: string[] }>;
  models: CatalogModel[];
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, '');
}

function collectAllExperts(): ExpertProfile[] {
  return [
    muskProfile,
    xiaohongshuProfile,
    weiHangkongProfile,
    yiMengProfile,
    ...topExpertProfiles,
    jobsProfile,
    mungerProfile,
    talebProfile,
    feynmanProfile,
    karpathyProfile,
    paulGrahamProfile,
    buffettProfile,
    bezosProfile,
    zhangXiaolongProfile,
    huangZhengProfile,
    liKaifuProfile,
  ];
}

function buildCatalog(): Catalog {
  const experts = collectAllExperts();
  const map = new Map<string, CatalogModel>();

  for (const expert of experts) {
    const models: MentalModel[] | undefined = expert.persona.cognition?.mentalModels;
    if (!models) continue;
    for (const m of models) {
      const key = normalizeName(m.name);
      if (!key) continue;
      let entry = map.get(key);
      if (!entry) {
        entry = { name: m.name, expertCount: 0, isShared: false, variants: [] };
        map.set(key, entry);
      }
      entry.variants.push({
        expert_id: expert.expert_id,
        expert_name: expert.name,
        summary: m.summary,
        evidence: [...m.evidence],
        applicationContext: m.applicationContext,
        failureCondition: m.failureCondition,
      });
      entry.expertCount = entry.variants.length;
      entry.isShared = entry.expertCount >= 2;
    }
  }

  const models = Array.from(map.values()).sort((a, b) => b.expertCount - a.expertCount);

  return {
    generatedAt: new Date().toISOString(),
    totalModels: models.length,
    sharedCount: models.filter(m => m.isShared).length,
    expertCount: experts.length,
    experts: experts.map(e => ({ expert_id: e.expert_id, name: e.name, domain: e.domain })),
    models,
  };
}

async function main() {
  const catalog = buildCatalog();

  // 输出路径：脚本所在目录向上解析到仓库根（与 tsx / 编译产物路径一致）
  // @ts-ignore - import.meta is available at runtime with tsx
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../../');
  const outDir = path.join(repoRoot, '01-product/experts');
  const outFile = path.join(outDir, 'mental-model-catalog.json');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2));

  console.log('═══════════════════════════════════════════════');
  console.log('  Mental Model Catalog 生成完成');
  console.log('═══════════════════════════════════════════════');
  console.log(`  专家总数: ${catalog.expertCount}`);
  console.log(`  心智模型总数: ${catalog.totalModels}`);
  console.log(`  共享模型（2+ 专家）: ${catalog.sharedCount}`);
  console.log(`  输出: ${outFile}`);
  console.log('');
  console.log('  Top 5 共享模型:');
  for (const m of catalog.models.slice(0, 5)) {
    const experts = m.variants.map(v => v.expert_name).join('、');
    console.log(`  - ${m.name} (${m.expertCount} 位): ${experts}`);
  }
}

main().catch(err => {
  console.error('❌ catalog 生成失败:', err);
  process.exit(1);
});
