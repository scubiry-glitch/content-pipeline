// ExpertProfile ↔ expert_profiles 表（与 dbRowToProfile 互逆，供 UPSERT 脚本使用）

import type { ExpertProfile, ExpertLibraryDeps } from './types.js';

export function assertExpertProfile(data: unknown): data is ExpertProfile {
  if (!data || typeof data !== 'object') return false;
  const p = data as ExpertProfile;
  if (typeof p.expert_id !== 'string' || typeof p.name !== 'string') return false;
  if (!Array.isArray(p.domain)) return false;
  if (!p.persona || typeof p.persona.style !== 'string' || typeof p.persona.tone !== 'string') return false;
  if (!Array.isArray(p.persona.bias)) return false;
  if (!p.method || !Array.isArray(p.method.frameworks) || typeof p.method.reasoning !== 'string') return false;
  if (!Array.isArray(p.method.analysis_steps)) return false;
  if (!p.constraints || typeof p.constraints.must_conclude !== 'boolean') return false;
  if (!p.output_schema || typeof p.output_schema.format !== 'string' || !Array.isArray(p.output_schema.sections)) return false;
  if (!Array.isArray(p.anti_patterns) || !Array.isArray(p.signature_phrases)) return false;

  if (p.emm) {
    const h = p.emm.factor_hierarchy;
    if (!h || typeof h !== 'object') return false;
    const sum = Object.values(h).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
    if (Math.abs(sum - 1) > 0.02) return false;
  }
  return true;
}

/**
 * 更新专家的 EMM factor_hierarchy 权重（数据库持久化）
 */
export async function updateExpertWeights(
  expertId: string,
  newWeights: Record<string, number>,
  deps: ExpertLibraryDeps
): Promise<void> {
  await deps.db.query(
    `UPDATE expert_profiles
     SET emm = jsonb_set(COALESCE(emm, '{}'), '{factor_hierarchy}', $1::jsonb),
         updated_at = NOW()
     WHERE expert_id = $2`,
    [JSON.stringify(newWeights), expertId]
  );
}

/** 供 node-pg 写入 JSONB / text[] */
export function expertProfileToDbParams(p: ExpertProfile) {
  return {
    expert_id: p.expert_id,
    name: p.name,
    domain: p.domain,
    persona: p.persona,
    method: p.method,
    emm: p.emm ?? null,
    constraints_config: p.constraints,
    output_schema: p.output_schema,
    anti_patterns: p.anti_patterns,
    signature_phrases: p.signature_phrases,
  };
}
