// Expert Seed — 启动时将所有内置专家同步到 DB
// 合并后端详细 profile (topExperts) + 前端展示数据 (frontendExperts)
// 使用 ON CONFLICT DO NOTHING 避免覆盖用户已编辑的数据

import type { ExpertProfile, ExpertLibraryDeps } from './types.js';
import { expertProfileToDbParams } from './expertProfileDb.js';

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

  // 1. 以 backend profiles 为基础建 Map
  const profileMap = new Map<string, ExpertProfile & { display_metadata?: any }>();
  for (const bp of backendExperts) {
    profileMap.set(bp.expert_id, { ...bp, display_metadata: {} });
  }

  // 2. 合并前端专家
  for (const fe of frontendExperts) {
    if (profileMap.has(fe.id)) {
      // 已有完整后端 profile，只补充 display_metadata
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
      // 后端没有，从前端转换
      profileMap.set(fe.id, frontendExpertToProfile(fe));
    }
  }

  // 3. 批量 UPSERT 到 DB
  for (const [id, profile] of profileMap) {
    try {
      const params = expertProfileToDbParams(profile);
      const displayMeta = (profile as any).display_metadata || {};

      await deps.db.query(
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

      // 检查是否实际插入了
      seeded++;
    } catch (err: any) {
      // 可能 DO NOTHING 跳过了（已存在），或其他错误
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
