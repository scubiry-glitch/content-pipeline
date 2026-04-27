// runs/expertProfileLoader.ts — 把用户在 Step 2 选中的真实专家拉成 prompt persona
//
// 在此之前 callExpertOrLLM 只是名字里带"Expert"，实际只发通用 system prompt + 装饰器栈，
// 跟 expert library 完全脱钩。这里把选中专家的 persona/philosophy/signature_phrases
// 拼成一段 system prompt 段，让 axis computer 在跑 LLM 时真正"以这位专家的视角"输出。

import type { DatabaseAdapter } from '../types.js';

export type ExpertRoleId = 'people' | 'projects' | 'knowledge';

/** 前端 Step 2 收集后传到后端的"角色 → expert_id 列表"映射 */
export interface ExpertRoleAssignment {
  people?: string[];
  projects?: string[];
  knowledge?: string[];
}

/** Method (方法论) 块 · expert_profiles.method JSONB 解析后的形态 */
export interface ExpertMethod {
  frameworks?: string[];
  reasoning?: string;
  analysis_steps?: string[];
  reviewLens?: {
    firstGlance?: string;
    deepDive?: string[];
    killShot?: string;
    bonusPoints?: string[];
  };
  dataPreference?: string;
  evidenceStandard?: string;
}

/** EMM Gate Logic 块 · expert_profiles.emm JSONB 解析后的形态 */
export interface ExpertEmm {
  critical_factors?: string[];
  factor_hierarchy?: Record<string, number>;
  veto_rules?: string[];
  aggregation_logic?: string; // 'weighted_score' | 'majority_vote' | 'strictest' | …
}

/** 一位专家被拉出来后的 prompt 友好快照（按 plan §E.2 扩展，CLI 模式按场景挑字段用） */
export interface ExpertSnapshot {
  expertId: string;
  name: string;
  /** 领域名 */
  domain: string;
  /** 风格短语：personality / tone（来自 persona / display_metadata.profile） */
  style: string;
  /** 背景：display_metadata.profile.background */
  background?: string;
  /** 思想内核：philosophy.core / persona.bias */
  core: string[];
  /** 签名口头禅：signature_phrases TEXT[]（首选） */
  signaturePhrases: string[];
  /** 哲学引用 fallback：display_metadata.philosophy.quotes */
  philosophyQuotes: string[];
  /** 评审关注维度：reviewDimensions / emm.critical_factors（向下兼容字段） */
  reviewDimensions: string[];
  /** Methodology 块（method JSONB） */
  method: ExpertMethod;
  /** EMM Gate Logic 块（emm JSONB） */
  emm: ExpertEmm;
  /** 反向约束：anti_patterns TEXT[] */
  antiPatterns: string[];
}

/** role → 该角色覆盖的 axis 列表 */
export const ROLE_TO_AXES: Record<ExpertRoleId, string[]> = {
  people: ['people'],
  projects: ['projects'],
  knowledge: ['knowledge', 'meta', 'tension'],
};

/** axis → role 反查 */
export const AXIS_TO_ROLE: Record<string, ExpertRoleId> = (() => {
  const out: Record<string, ExpertRoleId> = {};
  for (const role of Object.keys(ROLE_TO_AXES) as ExpertRoleId[]) {
    for (const ax of ROLE_TO_AXES[role]) out[ax] = role;
  }
  return out;
})();

function coerceJson(val: unknown): Record<string, any> {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, any>;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, any>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function coerceStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x) => typeof x === 'string').slice(0, 8);
  if (typeof val === 'string' && val.trim()) {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p)) return p.filter((x) => typeof x === 'string').slice(0, 8);
    } catch { /* fallthrough */ }
  }
  return [];
}

/**
 * 按 expert_id[] 一次拉所有需要的专家档案；DB 不可达 / id 不存在时返回空 Map。
 */
export async function loadExpertSnapshots(
  db: DatabaseAdapter,
  expertIds: string[],
): Promise<Map<string, ExpertSnapshot>> {
  const out = new Map<string, ExpertSnapshot>();
  const ids = Array.from(new Set(expertIds.filter((x) => typeof x === 'string' && x.length > 0)));
  if (ids.length === 0) return out;
  try {
    const r = await db.query(
      `SELECT expert_id, name, domain,
              persona, method, emm,
              signature_phrases, anti_patterns,
              display_metadata
         FROM expert_profiles
        WHERE expert_id = ANY($1::text[])
          AND is_active = true`,
      [ids],
    );
    for (const row of r.rows) {
      const persona = coerceJson(row.persona);
      const dm = coerceJson(row.display_metadata);
      const philosophy = coerceJson(dm.philosophy);
      const profile = coerceJson(dm.profile);
      const emmRaw = coerceJson(row.emm);
      const methodRaw = coerceJson(row.method);
      const reviewLensRaw = coerceJson(methodRaw.reviewLens);
      const domainArr = coerceStringArray(row.domain);

      const method: ExpertMethod = {
        frameworks: coerceStringArray(methodRaw.frameworks),
        reasoning: typeof methodRaw.reasoning === 'string' ? methodRaw.reasoning : undefined,
        analysis_steps: coerceStringArray(methodRaw.analysis_steps),
        reviewLens: Object.keys(reviewLensRaw).length === 0 ? undefined : {
          firstGlance: typeof reviewLensRaw.firstGlance === 'string' ? reviewLensRaw.firstGlance : undefined,
          deepDive: coerceStringArray(reviewLensRaw.deepDive),
          killShot: typeof reviewLensRaw.killShot === 'string' ? reviewLensRaw.killShot : undefined,
          bonusPoints: coerceStringArray(reviewLensRaw.bonusPoints),
        },
        dataPreference: typeof methodRaw.dataPreference === 'string' ? methodRaw.dataPreference : undefined,
        evidenceStandard: typeof methodRaw.evidenceStandard === 'string' ? methodRaw.evidenceStandard : undefined,
      };

      const factorHierarchy = coerceJson(emmRaw.factor_hierarchy);
      const emm: ExpertEmm = {
        critical_factors: coerceStringArray(emmRaw.critical_factors),
        factor_hierarchy: Object.fromEntries(
          Object.entries(factorHierarchy).filter(([, v]) => typeof v === 'number'),
        ) as Record<string, number>,
        veto_rules: coerceStringArray(emmRaw.veto_rules),
        aggregation_logic: typeof emmRaw.aggregation_logic === 'string' ? emmRaw.aggregation_logic : undefined,
      };

      out.set(row.expert_id, {
        expertId: row.expert_id,
        name: row.name ?? row.expert_id,
        domain: String(dm.domainName ?? domainArr[0] ?? '').trim(),
        style: String(profile.personality ?? persona.style ?? persona.tone ?? '').trim(),
        background: typeof profile.background === 'string' ? profile.background : undefined,
        core: coerceStringArray(philosophy.core ?? persona.bias),
        signaturePhrases: coerceStringArray(row.signature_phrases),
        philosophyQuotes: coerceStringArray(philosophy.quotes),
        reviewDimensions: coerceStringArray(dm.reviewDimensions ?? emmRaw.critical_factors),
        method,
        emm,
        antiPatterns: coerceStringArray(row.anti_patterns),
      });
    }
  } catch (e) {
    console.warn('[expertProfileLoader] load failed:', (e as Error).message);
  }
  return out;
}

/** 把一组专家快照拼成一段 system prompt 用的 persona 块；多人作为合议席 */
export function renderPersonaPrompt(snapshots: ExpertSnapshot[]): string {
  if (snapshots.length === 0) return '';
  const lines: string[] = ['【当前角色 · 用户在 Step 2 选中的专家】'];
  for (const s of snapshots) {
    const head = s.domain ? `${s.name}（${s.domain}）` : s.name;
    lines.push(`- ${head}`);
    if (s.style) lines.push(`  风格：${s.style}`);
    if (s.core.length) lines.push(`  核心信条：${s.core.slice(0, 3).join(' / ')}`);
    if (s.signaturePhrases.length) {
      lines.push(`  口头禅：${s.signaturePhrases.slice(0, 3).map((q) => `"${q}"`).join('，')}`);
    }
    if (s.reviewDimensions.length) {
      lines.push(`  关注维度：${s.reviewDimensions.slice(0, 5).join('、')}`);
    }
  }
  if (snapshots.length > 1) {
    lines.push('要求：以上多位专家形成合议席，输出需同时反映他们各自的判断口径与差异。');
  } else {
    lines.push('要求：以这位专家的视角与判断口径输出，保留其风格与典型表达方式。');
  }
  return lines.join('\n');
}

/**
 * 把 ExpertRoleAssignment + 专家快照 → axis 级别的 persona 文本。
 * 同一 role 下多位专家会合并为一段 persona；ROLE_TO_AXES 决定文本扩散到哪些 axis。
 * snapshots 可由调用方预加载注入（避免重复查 DB）；不传则内部从 db 拉。
 */
export async function buildExpertPersonaByAxis(
  db: DatabaseAdapter,
  expertRoles: ExpertRoleAssignment | null | undefined,
  snapshots?: Map<string, ExpertSnapshot>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!expertRoles) return result;
  const allIds = [
    ...(expertRoles.people ?? []),
    ...(expertRoles.projects ?? []),
    ...(expertRoles.knowledge ?? []),
  ];
  if (allIds.length === 0) return result;
  const snaps = snapshots ?? await loadExpertSnapshots(db, allIds);
  for (const role of Object.keys(ROLE_TO_AXES) as ExpertRoleId[]) {
    const ids = expertRoles[role] ?? [];
    if (ids.length === 0) continue;
    const personaSnaps = ids.map((id) => snaps.get(id)).filter(Boolean) as ExpertSnapshot[];
    if (personaSnaps.length === 0) continue;
    const personaText = renderPersonaPrompt(personaSnaps);
    for (const ax of ROLE_TO_AXES[role]) {
      result[ax] = personaText;
    }
  }
  return result;
}
