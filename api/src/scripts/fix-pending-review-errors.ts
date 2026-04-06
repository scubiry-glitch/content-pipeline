/**
 * 将 pending-review 下 *.error.json 修复为合法 ExpertProfile，写入 {id}.json 并删除 .error.json。
 * 用法（在 api/ 下）：npx tsx src/scripts/fix-pending-review-errors.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertExpertProfile } from '../modules/expert-library/expertProfileDb.js';

/** 约定在 api/ 目录执行：npx tsx src/scripts/fix-pending-review-errors.ts */
const DIR = path.join(process.cwd(), 'src/modules/expert-library/data/generated/pending-review');

function repairS30Raw(raw: string): string {
  // LLM 在 method 末尾多写了一个 }，导致根对象提前结束、后面内容与 JSON 粘连
  return raw.replace(/"\}\},"emm"/, '"},"emm"');
}

function coerceBool(v: unknown, defaultVal: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().length > 0 ? true : false;
  return defaultVal;
}

function normalizeConstraints(c: Record<string, unknown> | undefined): { must_conclude: boolean; allow_assumption: boolean } {
  const must = c?.must_conclude;
  const allow = c?.allow_assumption;
  return {
    must_conclude: coerceBool(must, true),
    allow_assumption: coerceBool(allow, true),
  };
}

function normalizeEmmSum(emm: { factor_hierarchy: Record<string, number> } | undefined) {
  if (!emm?.factor_hierarchy || typeof emm.factor_hierarchy !== 'object') return;
  const h = { ...emm.factor_hierarchy };
  let sum = 0;
  for (const v of Object.values(h)) {
    if (typeof v === 'number' && !Number.isNaN(v)) sum += v;
  }
  if (sum === 0 || Math.abs(sum - 1) <= 0.02) return;
  for (const k of Object.keys(h)) {
    const v = h[k];
    if (typeof v === 'number' && !Number.isNaN(v)) h[k] = v / sum;
  }
  emm.factor_hierarchy = h;
}

function loadProfileFromError(filePath: string): Record<string, unknown> | null {
  const text = fs.readFileSync(filePath, 'utf8');
  const wrap = JSON.parse(text) as {
    expert_id?: string;
    parsed?: Record<string, unknown>;
    raw?: string;
    error?: string;
  };
  if (wrap.parsed && typeof wrap.parsed === 'object') return { ...wrap.parsed };
  if (wrap.raw && typeof wrap.raw === 'string') {
    let raw = wrap.raw;
    if (wrap.expert_id === 'S-30') raw = repairS30Raw(raw);
    return JSON.parse(raw) as Record<string, unknown>;
  }
  return null;
}

function normalizeProfile(p: Record<string, unknown>) {
  const c = p.constraints as Record<string, unknown> | undefined;
  p.constraints = normalizeConstraints(c);
  if (p.emm && typeof p.emm === 'object') normalizeEmmSum(p.emm as { factor_hierarchy: Record<string, number> });
}

async function main() {
  const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.error.json'));
  let ok = 0;
  let fail = 0;
  for (const name of names.sort()) {
    const full = path.join(DIR, name);
    let p: Record<string, unknown> | null;
    try {
      p = loadProfileFromError(full);
    } catch (e) {
      console.error(`跳过 ${name}：解析失败`, e);
      fail++;
      continue;
    }
    if (!p || typeof p.expert_id !== 'string') {
      console.error(`跳过 ${name}：无 expert_id`);
      fail++;
      continue;
    }
    normalizeProfile(p);
    if (!assertExpertProfile(p)) {
      console.error(`跳过 ${name}：assertExpertProfile 仍失败`);
      fail++;
      continue;
    }
    const out = path.join(DIR, `${p.expert_id}.json`);
    fs.writeFileSync(out, JSON.stringify(p, null, 2) + '\n', 'utf8');
    fs.unlinkSync(full);
    console.log(`已修复 ${p.expert_id}.json，已删除 ${name}`);
    ok++;
  }
  console.log(`完成：${ok} 个成功，${fail} 个失败`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
