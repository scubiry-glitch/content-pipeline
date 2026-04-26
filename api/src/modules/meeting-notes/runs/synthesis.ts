// runs/synthesis.ts — Step3 第 5 步「跨专家综合 · 7 条 deliverable 映射」
//
// 把 axes 跑完后散落在多张表里的事实统一聚合成 7 条 deliverable：
//   ① topic-enrich     · meta.meeting_kind / 议题主旨
//   ⑩ insights         · knowledge.judgments + knowledge.mental_models
//   ⑫ consensus        · projects.assumptions（verified） + mn_consensus_items
//   ⑬ controversy      · knowledge.cognitive_biases + mn_consensus_items(divergence)
//   ⑭ beliefEvolution  · 跨会议（先放占位，longitudinal 真值由 LongitudinalService 填）
//   step3-fact-review  · knowledge.evidence_grades（A/B/C/D 分布 + 加权分）
//   step5-synthesis    · 6 个 deliverable 的超表（counts + top items）
//
// 落库：mn_runs.metadata.synthesis（不新增表）

import type { MeetingNotesDeps } from '../types.js';

export interface DeliverableItem {
  key: string;
  /** 业务名 */
  label: string;
  /** 来源 axis 列表（用于前端着色） */
  sourceAxes: string[];
  /** 该 deliverable 已聚合的对象数 */
  count: number;
  /** 前 N 条样例（≤5）；前端可直接渲染 */
  samples: any[];
  /** 是否生效 */
  generated: boolean;
}

export interface SynthesisResult {
  deliverables: DeliverableItem[];
  generatedCount: number;
  /** 聚合时刻 */
  generatedAt: string;
}

export async function synthesizeDeliverables(
  deps: MeetingNotesDeps,
  meetingId: string,
): Promise<SynthesisResult> {
  // ① topic-enrich
  const meta = await deps.db.query(
    `SELECT title, metadata->>'meeting_kind' AS kind,
            metadata->>'occurred_at' AS occurred_at
       FROM assets WHERE id = $1`,
    [meetingId],
  );
  const topicEnrich: DeliverableItem = {
    key: '① topic-enrich',
    label: '议题主旨与会议类型',
    sourceAxes: ['meta'],
    count: meta.rows.length,
    samples: meta.rows.slice(0, 1),
    generated: meta.rows.length > 0,
  };

  // ⑩ insights = judgments + mental_models（top by score）
  const judgments = await deps.db.query(
    `SELECT id, text, domain, generality_score, reuse_count
       FROM mn_judgments
      WHERE $1 = ANY(linked_meeting_ids)
      ORDER BY generality_score DESC NULLS LAST
      LIMIT 5`,
    [meetingId],
  );
  const models = await deps.db.query(
    `SELECT id, model_name, correctly_used, outcome, confidence
       FROM mn_mental_model_invocations
      WHERE meeting_id = $1
      ORDER BY confidence DESC NULLS LAST
      LIMIT 5`,
    [meetingId],
  );
  const insightsCount = judgments.rows.length + models.rows.length;
  const insights: DeliverableItem = {
    key: '⑩ insights',
    label: '新认知 · 可复用判断',
    sourceAxes: ['knowledge'],
    count: insightsCount,
    samples: [...judgments.rows.slice(0, 3), ...models.rows.slice(0, 2)],
    generated: insightsCount > 0,
  };

  // ⑫ consensus = mn_consensus_items(consensus) + 已验证 assumptions
  const consensusRows = await safeQuery(
    deps,
    `SELECT id, summary, side_count
       FROM mn_consensus_items
      WHERE meeting_id = $1 AND kind = 'consensus'
      LIMIT 5`,
    [meetingId],
  );
  const verifiedAssumptions = await deps.db.query(
    `SELECT id, text, evidence_grade, verification_state
       FROM mn_assumptions
      WHERE meeting_id = $1 AND verification_state = 'verified'
      LIMIT 5`,
    [meetingId],
  );
  const consensusCount = consensusRows.length + verifiedAssumptions.rows.length;
  const consensus: DeliverableItem = {
    key: '⑫ consensus',
    label: '共识与已验证假设',
    sourceAxes: ['projects'],
    count: consensusCount,
    samples: [...consensusRows, ...verifiedAssumptions.rows].slice(0, 5),
    generated: consensusCount > 0,
  };

  // ⑬ controversy = cognitive_biases + divergences
  const biases = await deps.db.query(
    `SELECT id, bias_type, where_excerpt, severity
       FROM mn_cognitive_biases
      WHERE meeting_id = $1
      ORDER BY severity DESC NULLS LAST
      LIMIT 5`,
    [meetingId],
  );
  const divergences = await safeQuery(
    deps,
    `SELECT id, summary, side_count
       FROM mn_consensus_items
      WHERE meeting_id = $1 AND kind = 'divergence'
      LIMIT 5`,
    [meetingId],
  );
  const controversyCount = biases.rows.length + divergences.length;
  const controversy: DeliverableItem = {
    key: '⑬ controversy',
    label: '张力与认知偏误',
    sourceAxes: ['knowledge', 'projects'],
    count: controversyCount,
    samples: [...biases.rows.slice(0, 3), ...divergences.slice(0, 2)],
    generated: controversyCount > 0,
  };

  // ⑭ beliefEvolution = 占位（真值由 LongitudinalService 填）
  const beliefEvolution: DeliverableItem = {
    key: '⑭ beliefEvolution',
    label: '信念演化（跨会议）',
    sourceAxes: ['longitudinal'],
    count: 0,
    samples: [],
    generated: false,
  };

  // step3-fact-review = evidence_grades
  const grades = await deps.db.query(
    `SELECT dist_a, dist_b, dist_c, dist_d, weighted_score
       FROM mn_evidence_grades WHERE meeting_id = $1`,
    [meetingId],
  );
  const factReview: DeliverableItem = {
    key: 'step3-fact-review',
    label: '事实/证据等级评估',
    sourceAxes: ['knowledge'],
    count: grades.rows.length,
    samples: grades.rows.slice(0, 1),
    generated: grades.rows.length > 0,
  };

  // step5-synthesis = 上述 6 项的超表
  const all = [topicEnrich, insights, consensus, controversy, beliefEvolution, factReview];
  const synthesis: DeliverableItem = {
    key: 'step5-synthesis',
    label: '总览综合',
    sourceAxes: ['meta', 'knowledge', 'projects'],
    count: all.reduce((s, d) => s + d.count, 0),
    samples: all.map((d) => ({ key: d.key, count: d.count, generated: d.generated })),
    generated: all.some((d) => d.generated),
  };

  const deliverables = [...all, synthesis];
  return {
    deliverables,
    generatedCount: deliverables.filter((d) => d.generated).length,
    generatedAt: new Date().toISOString(),
  };
}

/** 表可能不存在（旧库未迁移），失败降级为空数组 */
async function safeQuery(
  deps: MeetingNotesDeps,
  sql: string,
  params: any[],
): Promise<any[]> {
  try {
    const r = await deps.db.query(sql, params);
    return r.rows;
  } catch {
    return [];
  }
}
