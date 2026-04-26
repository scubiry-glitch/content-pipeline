// runs/renderMultiDim.ts — Step3 第 6 步「多维度组装 · 张力/新认知/共识/观点对位」
//
// synthesis 已经把事实聚合成 7 条 deliverable，但前端的多视图需要
// 「张力 / 新认知 / 共识 / 观点对位」4 个维度的渲染清单，本模块把它
// 进一步拆出来落到 mn_runs.metadata.render，让前端 step3 第 6 步
// 可以报告"4/4 维度已就绪"的真实进度。

import type { MeetingNotesDeps } from '../types.js';

export interface RenderDim {
  key: 'tension' | 'newCognition' | 'consensus' | 'perspectiveAlign';
  label: string;
  count: number;
  samples: any[];
  /** 是否已组装就绪 */
  ready: boolean;
}

export interface RenderResult {
  dims: RenderDim[];
  ready: number;
  generatedAt: string;
}

export async function renderMultiDim(
  deps: MeetingNotesDeps,
  meetingId: string,
): Promise<RenderResult> {
  // 1) 张力（tension）：cognitive_biases + divergences + at_risk commitments
  const biases = await deps.db.query(
    `SELECT id, bias_type, where_excerpt, severity
       FROM mn_cognitive_biases
      WHERE meeting_id = $1
      ORDER BY severity DESC NULLS LAST
      LIMIT 5`,
    [meetingId],
  );
  const atRisk = await deps.db.query(
    `SELECT id, person_id, text, state
       FROM mn_commitments
      WHERE meeting_id = $1 AND state IN ('at_risk', 'slipped')
      LIMIT 5`,
    [meetingId],
  );
  // mn_consensus_items 真实列：item_text / supported_by（migration 010）
  const divergences = await safeRows(
    deps,
    `SELECT id, item_text AS summary,
            COALESCE(array_length(supported_by, 1), 0) AS side_count
       FROM mn_consensus_items
      WHERE meeting_id = $1 AND kind = 'divergence'
      LIMIT 5`,
    [meetingId],
  );
  const tensionItems = [
    ...biases.rows.map((b) => ({ kind: 'bias', ...b })),
    ...atRisk.rows.map((c) => ({ kind: 'commitment_at_risk', ...c })),
    ...divergences.map((d) => ({ kind: 'divergence', ...d })),
  ];

  // 2) 新认知（newCognition）：judgments + counterfactuals
  const judgments = await deps.db.query(
    `SELECT id, text, domain, generality_score
       FROM mn_judgments
      WHERE $1 = ANY(linked_meeting_ids)
      ORDER BY generality_score DESC NULLS LAST
      LIMIT 5`,
    [meetingId],
  );
  const counterfactuals = await deps.db.query(
    `SELECT id, rejected_path, current_validity
       FROM mn_counterfactuals
      WHERE meeting_id = $1
      LIMIT 3`,
    [meetingId],
  );
  const cognitionItems = [
    ...judgments.rows.map((j) => ({ kind: 'judgment', ...j })),
    ...counterfactuals.rows.map((c) => ({ kind: 'counterfactual', ...c })),
  ];

  // 3) 共识（consensus）：verified assumptions + consensus_items
  // 'confirmed' 是 mn_assumptions.verification_state 的合法值（migration 003），
  // 但 codebase 里没有任何地方写 'confirmed'，全是默认 'unverified'。
  // 务实降级：高证据等级（A/B）即视为共识级，OR verification_state='confirmed'
  // 兼容外部标记的情况。
  const verified = await deps.db.query(
    `SELECT id, text, evidence_grade
       FROM mn_assumptions
      WHERE meeting_id = $1
        AND (verification_state = 'confirmed' OR evidence_grade IN ('A','B'))
      ORDER BY evidence_grade
      LIMIT 5`,
    [meetingId],
  );
  const consensusRows = await safeRows(
    deps,
    `SELECT id, item_text AS summary,
            COALESCE(array_length(supported_by, 1), 0) AS side_count
       FROM mn_consensus_items
      WHERE meeting_id = $1 AND kind = 'consensus'
      LIMIT 5`,
    [meetingId],
  );
  const consensusItems = [
    ...verified.rows.map((a) => ({ kind: 'verified_assumption', ...a })),
    ...consensusRows.map((c) => ({ kind: 'consensus_item', ...c })),
  ];

  // 4) 观点对位（perspectiveAlign）：cross-axis links
  // mn_cross_axis_links 没有 meeting_id 列（migration 008），按 scope_id 过滤；
  // 通过 mn_scope_members 把 meeting → scope 反查。
  const links = await safeRows(
    deps,
    `SELECT source_axis, source_item_type, target_axis, target_item_type,
            relationship, score
       FROM mn_cross_axis_links
      WHERE scope_id IN (
              SELECT scope_id FROM mn_scope_members WHERE meeting_id = $1
            )
      ORDER BY score DESC NULLS LAST
      LIMIT 10`,
    [meetingId],
  );

  const dims: RenderDim[] = [
    {
      key: 'tension',
      label: '张力',
      count: tensionItems.length,
      samples: tensionItems.slice(0, 5),
      ready: tensionItems.length > 0,
    },
    {
      key: 'newCognition',
      label: '新认知',
      count: cognitionItems.length,
      samples: cognitionItems.slice(0, 5),
      ready: cognitionItems.length > 0,
    },
    {
      key: 'consensus',
      label: '共识',
      count: consensusItems.length,
      samples: consensusItems.slice(0, 5),
      ready: consensusItems.length > 0,
    },
    {
      key: 'perspectiveAlign',
      label: '观点对位',
      count: links.length,
      samples: links.slice(0, 5),
      ready: links.length > 0,
    },
  ];

  return {
    dims,
    ready: dims.filter((d) => d.ready).length,
    generatedAt: new Date().toISOString(),
  };
}

async function safeRows(
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
