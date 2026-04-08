// Expert Seed — 将内置专家同步到 DB（默认由管理员手动触发 CLI 或 API）
// 合并后端详细 profile (topExperts) + 前端展示数据 (frontendExperts)
// 使用 ON CONFLICT DO NOTHING 避免覆盖用户已编辑的数据

import type { ExpertProfile, ExpertLibraryDeps } from './types.js';
import { expertProfileToDbParams } from './expertProfileDb.js';
import { muskProfile } from './data/musk.js';
import { xiaohongshuProfile } from './data/xiaohongshu.js';
import { topExpertProfiles } from './data/topExperts.js';
import { weiHangkongProfile } from './data/weiHangkong.js';
import { jobsProfile } from './data/jobs.js';
import { mungerProfile } from './data/munger.js';
import { talebProfile } from './data/taleb.js';
import { feynmanProfile } from './data/feynman.js';
import { karpathyProfile } from './data/karpathy.js';
import { paulGrahamProfile } from './data/paulgraham.js';
import { buffettProfile } from './data/buffett.js';
import { bezosProfile } from './data/bezos.js';
import { zhangXiaolongProfile } from './data/zhangxiaolong.js';
import { huangZhengProfile } from './data/huangzheng.js';
import { liKaifuProfile } from './data/likaifu.js';

/** 将前端 Expert 格式转换为后端 ExpertProfile 格式 */
export function frontendExpertToProfile(fe: any): ExpertProfile & { display_metadata: any } {
  const profile: ExpertProfile & { display_metadata: any } = {
    expert_id: fe.id,
    name: fe.name,
    domain: fe.domainName ? [fe.domainName] : [],
    persona: {
      style: fe.profile?.personality || '',
      tone: fe.profile?.background || '',
      bias: fe.philosophy?.core || [],
      cognition: undefined,
      values: undefined,
      taste: undefined,
      voice: fe.angle ? {
        disagreementStyle: fe.angle === 'challenger' ? '直接挑战对方逻辑漏洞'
          : fe.angle === 'expander' ? '从不同视角扩展讨论'
          : fe.angle === 'synthesizer' ? '归纳综合各方观点'
          : '从读者角度提问',
        praiseStyle: '客观指出亮点',
      } : undefined,
      blindSpots: undefined,
    },
    method: {
      frameworks: fe.reviewDimensions || [],
      reasoning: 'deductive',
      analysis_steps: fe.reviewDimensions?.map((d: string) => `从${d}角度评估`) || [],
      reviewLens: {
        firstGlance: `关注${fe.reviewDimensions?.[0] || '核心逻辑'}`,
        deepDive: fe.reviewDimensions || [],
        killShot: `${fe.reviewDimensions?.[0] || '核心指标'}不达标`,
        bonusPoints: fe.philosophy?.core?.slice(0, 2) || [],
      },
      dataPreference: '数据优先',
      evidenceStandard: '需要数据支撑',
    },
    emm: {
      critical_factors: fe.reviewDimensions || [],
      factor_hierarchy: (() => {
        const dims = fe.reviewDimensions || ['核心指标'];
        const w = 1 / dims.length;
        const h: Record<string, number> = {};
        dims.forEach((d: string) => { h[d] = Math.round(w * 100) / 100; });
        // 修正舍入误差
        const sum = Object.values(h).reduce((a, b) => a + b, 0);
        if (dims.length > 0) h[dims[0]] += Math.round((1 - sum) * 100) / 100;
        return h;
      })(),
      veto_rules: fe.philosophy?.core?.slice(0, 1).map((c: string) => `违反"${c}"原则`) || [],
      aggregation_logic: '加权评分',
    },
    constraints: { must_conclude: true, allow_assumption: false },
    output_schema: {
      format: 'structured_report',
      sections: ['核心判断', '维度分析', '风险提示', '建议'],
    },
    anti_patterns: [],
    signature_phrases: fe.philosophy?.quotes || [],
    display_metadata: {
      level: fe.level,
      code: fe.code,
      domainCode: fe.domainCode,
      domainName: fe.domainName,
      profile: fe.profile,
      philosophy: fe.philosophy,
      achievements: fe.achievements,
      reviewDimensions: fe.reviewDimensions,
      angle: fe.angle,
      totalReviews: fe.totalReviews || 0,
      acceptanceRate: fe.acceptanceRate || 0,
      avgResponseTime: fe.avgResponseTime || 0,
      status: fe.status || 'active',
    },
  };
  return profile;
}

function mergeExpertProfilesToMap(
  backendExperts: ExpertProfile[],
  frontendExperts: any[]
): Map<string, ExpertProfile & { display_metadata?: any }> {
  const profileMap = new Map<string, ExpertProfile & { display_metadata?: any }>();
  for (const bp of backendExperts) {
    profileMap.set(bp.expert_id, { ...bp, display_metadata: {} });
  }
  for (const fe of frontendExperts) {
    if (profileMap.has(fe.id)) {
      const existing = profileMap.get(fe.id)!;
      existing.display_metadata = {
        level: fe.level,
        code: fe.code,
        domainCode: fe.domainCode,
        domainName: fe.domainName,
        profile: fe.profile,
        philosophy: fe.philosophy,
        achievements: fe.achievements,
        reviewDimensions: fe.reviewDimensions,
        angle: fe.angle,
        totalReviews: fe.totalReviews || 0,
        acceptanceRate: fe.acceptanceRate || 0,
        avgResponseTime: fe.avgResponseTime || 0,
        status: fe.status || 'active',
      };
    } else {
      profileMap.set(fe.id, frontendExpertToProfile(fe));
    }
  }
  return profileMap;
}

async function loadFrontendExpertsData(): Promise<any[]> {
  try {
    const { frontendExpertsData } = await import('./data/frontendExperts.js');
    return frontendExpertsData;
  } catch {
    console.warn('[ExpertSeed] Frontend expert data not found, seeding backend experts only');
    return [];
  }
}

let defaultBuiltinMapPromise: Promise<
  Map<string, ExpertProfile & { display_metadata?: any }>
> | null = null;

/** 与默认内置名单一致的专家 profile 合并结果（顺序与批量播种一致）；进程内缓存供批量 item 同步复用 */
export async function buildDefaultBuiltinProfileMap(): Promise<
  Map<string, ExpertProfile & { display_metadata?: any }>
> {
  if (!defaultBuiltinMapPromise) {
    defaultBuiltinMapPromise = (async () => {
      const builtinExperts: ExpertProfile[] = [
        muskProfile,
        xiaohongshuProfile,
        weiHangkongProfile,
        ...topExpertProfiles,
        jobsProfile, mungerProfile, talebProfile, feynmanProfile, karpathyProfile, paulGrahamProfile,
        buffettProfile, bezosProfile, zhangXiaolongProfile, huangZhengProfile, liKaifuProfile,
      ];
      const frontendExperts = await loadFrontendExpertsData();
      return mergeExpertProfilesToMap(builtinExperts, frontendExperts);
    })().catch((e) => {
      defaultBuiltinMapPromise = null;
      throw e;
    });
  }
  return defaultBuiltinMapPromise;
}

export type BuiltinSyncManifestItem = { expert_id: string; name: string };

export async function getBuiltinSyncManifest(): Promise<{
  total: number;
  experts: BuiltinSyncManifestItem[];
}> {
  const profileMap = await buildDefaultBuiltinProfileMap();
  const experts = Array.from(profileMap.values()).map((p) => ({
    expert_id: p.expert_id,
    name: p.name,
  }));
  return { total: experts.length, experts };
}

export type SyncBuiltinItemResult =
  | { ok: true; status: 'inserted' | 'skipped' | 'overwritten'; expert_id: string; name: string }
  | { ok: true; status: 'duplicate_pending'; expert_id: string; name: string }
  | { ok: false; error: string };

function profileToInsertRow(profile: ExpertProfile & { display_metadata?: any }) {
  const params = expertProfileToDbParams(profile);
  const displayMeta = (profile as any).display_metadata || {};
  return [
    params.expert_id,
    params.name,
    params.domain,
    JSON.stringify(params.persona),
    JSON.stringify(params.method),
    params.emm ? JSON.stringify(params.emm) : null,
    JSON.stringify(params.constraints_config),
    JSON.stringify(params.output_schema),
    params.anti_patterns,
    params.signature_phrases,
    JSON.stringify(displayMeta),
  ];
}

const INSERT_EXPERT_SQL = `INSERT INTO expert_profiles
  (expert_id, name, domain, persona, method, emm, constraints_config, output_schema, anti_patterns, signature_phrases, display_metadata, is_active)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`;

const UPSERT_EXPERT_SQL = `${INSERT_EXPERT_SQL}
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
   display_metadata = EXCLUDED.display_metadata,
   is_active = true,
   updated_at = NOW()`;

/**
 * 同步单个内置专家。若库中已存在且未传 duplicate_resolution，返回 duplicate_pending 供前端询问覆盖/跳过。
 */
export async function syncBuiltinExpertItem(
  deps: ExpertLibraryDeps,
  expert_id: string,
  duplicate_resolution?: 'skip' | 'overwrite'
): Promise<SyncBuiltinItemResult> {
  const profileMap = await buildDefaultBuiltinProfileMap();
  const profile = profileMap.get(expert_id);
  if (!profile) {
    return { ok: false, error: `不是内置专家 ID: ${expert_id}` };
  }

  const existsRes = await deps.db.query(
    `SELECT 1 FROM expert_profiles WHERE expert_id = $1 LIMIT 1`,
    [expert_id]
  );
  const exists = existsRes.rows.length > 0;
  const row = profileToInsertRow(profile);

  if (!exists) {
    try {
      await deps.db.query(
        `${INSERT_EXPERT_SQL} ON CONFLICT (expert_id) DO NOTHING`,
        row
      );
      return { ok: true, status: 'inserted', expert_id, name: profile.name };
    } catch (err: any) {
      console.warn(`[ExpertSeed] insert ${expert_id}:`, err.message);
      return { ok: false, error: err.message || '插入失败' };
    }
  }

  if (!duplicate_resolution) {
    return { ok: true, status: 'duplicate_pending', expert_id, name: profile.name };
  }

  if (duplicate_resolution === 'skip') {
    return { ok: true, status: 'skipped', expert_id, name: profile.name };
  }

  try {
    await deps.db.query(UPSERT_EXPERT_SQL, row);
    return { ok: true, status: 'overwritten', expert_id, name: profile.name };
  } catch (err: any) {
    console.warn(`[ExpertSeed] upsert ${expert_id}:`, err.message);
    return { ok: false, error: err.message || '覆盖写入失败' };
  }
}

/**
 * 将所有内置专家播种到数据库
 * - 合并 backend topExperts (完整 persona/emm) + frontend experts (展示数据)
 * - 同 ID 时以 backend profile 为主，补充 display_metadata
 * - 使用 ON CONFLICT DO NOTHING，不覆盖已有数据
 */
export async function seedExpertsToDb(
  deps: ExpertLibraryDeps,
  backendExperts: ExpertProfile[],
  frontendExperts: any[]
): Promise<{ seeded: number; skipped: number; errors: number }> {
  let seeded = 0, skipped = 0, errors = 0;

  const profileMap = mergeExpertProfilesToMap(backendExperts, frontendExperts);
  for (const [id, profile] of profileMap) {
    try {
      const params = expertProfileToDbParams(profile);
      const displayMeta = (profile as any).display_metadata || {};

      const result = await deps.db.query(
        `INSERT INTO expert_profiles
           (expert_id, name, domain, persona, method, emm, constraints_config, output_schema, anti_patterns, signature_phrases, display_metadata, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
         ON CONFLICT (expert_id) DO NOTHING`,
        [
          params.expert_id,
          params.name,
          params.domain,
          JSON.stringify(params.persona),
          JSON.stringify(params.method),
          params.emm ? JSON.stringify(params.emm) : null,
          JSON.stringify(params.constraints_config),
          JSON.stringify(params.output_schema),
          params.anti_patterns,
          params.signature_phrases,
          JSON.stringify(displayMeta),
        ]
      );

      if ((result as any).rowCount > 0) {
        seeded++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        skipped++;
      } else {
        errors++;
        console.warn(`[ExpertSeed] Failed to seed ${id}:`, err.message);
      }
    }
  }

  console.log(`[ExpertSeed] 播种完成: ${seeded} 新增, ${skipped} 已存在跳过, ${errors} 错误 (共 ${profileMap.size} 个专家)`);
  return { seeded, skipped, errors };
}

/** 与 createExpertEngine 内置名单一致：手动同步内置 + 前端展示专家到 expert_profiles */
export async function seedDefaultBuiltinExpertsToDb(
  deps: ExpertLibraryDeps
): Promise<{ seeded: number; skipped: number; errors: number }> {
  const builtinExperts: ExpertProfile[] = [
    muskProfile,
    xiaohongshuProfile,
    weiHangkongProfile,
    ...topExpertProfiles,
  ];
  const frontendExperts = await loadFrontendExpertsData();
  return seedExpertsToDb(deps, builtinExperts, frontendExperts);
}
