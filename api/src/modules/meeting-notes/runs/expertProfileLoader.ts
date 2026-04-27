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

/** 一位专家被拉出来后的 prompt 友好快照 */
export interface ExpertSnapshot {
  expertId: string;
  name: string;
  /** 风格短语：personality / tone */
  style: string;
  /** 思想内核：philosophy.core */
  core: string[];
  /** 签名口头禅：signature_phrases / philosophy.quotes */
  signaturePhrases: string[];
  /** 评审关注维度：reviewDimensions / emm.critical_factors */
  reviewDimensions: string[];
  /** 领域名 */
  domain: string;
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
      `SELECT expert_id, name, domain, persona, display_metadata, signature_phrases, emm
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
      const emm = coerceJson(row.emm);
      const domainArr = coerceStringArray(row.domain);
      out.set(row.expert_id, {
        expertId: row.expert_id,
        name: row.name ?? row.expert_id,
        style: String(profile.personality ?? persona.style ?? persona.tone ?? '').trim(),
        core: coerceStringArray(philosophy.core ?? persona.bias),
        signaturePhrases: coerceStringArray(row.signature_phrases ?? philosophy.quotes),
        reviewDimensions: coerceStringArray(dm.reviewDimensions ?? emm.critical_factors),
        domain: String(dm.domainName ?? domainArr[0] ?? '').trim(),
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
