// Expert Library — 全景图统一统计 (供 /expert-library/panorama 页面消费)
// 汇总 expert_profiles / expert_knowledge_sources / expert_invocations / expert_feedback / expert_task_assignments
// 所有查询 safe-fallback 到 0，避免某张表缺失时整个接口 500

import type { ExpertLibraryDeps } from './types.js';

export interface ExpertOverviewStats {
  experts: {
    total: number;
    active: number;
    builtin: number;
    generated: number;
    byLevel: Record<string, number>;
  };
  knowledgeSources: number;
  mentalModels: number;
  invocations: {
    total: number;
    analysis: number;
    evaluation: number;
    generation: number;
    debate: number;
    hotTopic: number;
    assetAnnotation: number;
  };
  feedback: {
    total: number;
    avgScore: number | null;
  };
  scheduling: {
    activeAssignments: number;
    completedAssignments: number;
  };
}

export async function getExpertOverviewStats(deps: ExpertLibraryDeps): Promise<ExpertOverviewStats> {
  const safeCount = async (sql: string, params: any[] = []): Promise<number> => {
    try {
      const r = await deps.db.query(sql, params);
      return Number(r.rows[0]?.c) || 0;
    } catch {
      return 0;
    }
  };

  const safeFloat = async (sql: string, params: any[] = []): Promise<number | null> => {
    try {
      const r = await deps.db.query(sql, params);
      const v = r.rows[0]?.v;
      return v == null ? null : Number(v);
    } catch {
      return null;
    }
  };

  const safeLevelMap = async (): Promise<Record<string, number>> => {
    try {
      const r = await deps.db.query(
        `SELECT COALESCE(display_metadata->>'level', 'unknown') AS level, COUNT(*)::int AS c
         FROM expert_profiles WHERE is_active = true
         GROUP BY 1`,
      );
      const out: Record<string, number> = {};
      for (const row of r.rows) out[row.level || 'unknown'] = Number(row.c) || 0;
      return out;
    } catch {
      return {};
    }
  };

  const [
    expertsTotal,
    expertsActive,
    expertsBuiltin,
    expertsGenerated,
    byLevel,
    knowledgeSources,
    mentalModels,
    invAnalysis,
    invEvaluation,
    invGeneration,
    invDebate,
    invHotTopic,
    invAssetAnn,
    feedbackCount,
    feedbackAvg,
    activeAssignments,
    completedAssignments,
  ] = await Promise.all([
    safeCount('SELECT COUNT(*)::int AS c FROM expert_profiles'),
    safeCount('SELECT COUNT(*)::int AS c FROM expert_profiles WHERE is_active = true'),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_profiles
               WHERE is_active = true AND COALESCE(display_metadata->>'source', 'builtin') <> 'generated'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_profiles
               WHERE is_active = true AND display_metadata->>'source' = 'generated'`),
    safeLevelMap(),
    safeCount('SELECT COUNT(*)::int AS c FROM expert_knowledge_sources WHERE is_active = true'),
    safeCount(
      `SELECT COUNT(DISTINCT m->>'name')::int AS c
       FROM expert_profiles ep,
         jsonb_array_elements(COALESCE(ep.persona->'cognition'->'mentalModels', '[]'::jsonb)) m
       WHERE ep.is_active = true`,
    ),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_invocations WHERE task_type = 'analysis'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_invocations WHERE task_type = 'evaluation'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_invocations WHERE task_type = 'generation'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_invocations WHERE task_type = 'debate'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_invocations WHERE task_type = 'hot_topic_perspective'`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_invocations WHERE task_type = 'asset_annotation'`),
    safeCount('SELECT COUNT(*)::int AS c FROM expert_feedback'),
    safeFloat('SELECT AVG(human_score)::float AS v FROM expert_feedback WHERE human_score IS NOT NULL'),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_task_assignments WHERE status IN ('assigned','active')`),
    safeCount(`SELECT COUNT(*)::int AS c FROM expert_task_assignments WHERE status = 'completed'`),
  ]);

  const invocationsTotal =
    invAnalysis + invEvaluation + invGeneration + invDebate + invHotTopic + invAssetAnn;

  return {
    experts: {
      total: expertsTotal,
      active: expertsActive,
      builtin: expertsBuiltin,
      generated: expertsGenerated,
      byLevel,
    },
    knowledgeSources,
    mentalModels,
    invocations: {
      total: invocationsTotal,
      analysis: invAnalysis,
      evaluation: invEvaluation,
      generation: invGeneration,
      debate: invDebate,
      hotTopic: invHotTopic,
      assetAnnotation: invAssetAnn,
    },
    feedback: {
      total: feedbackCount,
      avgScore: feedbackAvg,
    },
    scheduling: {
      activeAssignments,
      completedAssignments,
    },
  };
}
