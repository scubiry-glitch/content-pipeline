// runs/dispatchPlan.ts — 把 axes 分派给 3 位虚拟专家
//
// 前端 step3 第 3 步「分派给 3 位专家 · preset: standard」之前是空文案。
// 实际后端跑的是 4 个 axis × N 个 subDim 的纯 LLM 调用，没有「专家分组」概念。
// 本模块给出最小可观察的 dispatch：把 axes 划成 3 组，分别对应 3 位虚拟专家，
// 写入 mn_runs.metadata.dispatchPlan 让前端能展示真实的"专家×子维度"映射。

export interface ExpertSlot {
  /** 专家 id（与 expert-library 的 expert_id 一致；缺失则虚拟） */
  expertId: string;
  /** 显示名 */
  label: string;
  /** 关注的 axis 列表 */
  axes: string[];
  /** 关注的子维度（合并后） */
  subDims: string[];
  /** 状态：queued / running / done / failed */
  state: 'queued' | 'running' | 'done' | 'failed';
  /** 已完成的子维度（用于进度展示） */
  completedSubDims: string[];
}

export interface DispatchPlan {
  preset: 'lite' | 'standard' | 'max';
  /** 形如 "evidence_anchored|calibrated_confidence|knowledge_grounded|...|base" */
  decoratorStack: string[];
  experts: ExpertSlot[];
}

const AXIS_TO_EXPERT: Record<string, { id: string; label: string }> = {
  people:    { id: 'expert-people-analyst',     label: '人事/团队动态分析师' },
  projects:  { id: 'expert-decision-strategist', label: '项目/决策战略家' },
  knowledge: { id: 'expert-knowledge-synthesizer', label: '知识/认知综合师' },
  meta:      { id: 'expert-knowledge-synthesizer', label: '知识/认知综合师' },
  // P1-5：tension 归到知识/认知综合师（与 cognitive_biases 同源逻辑）
  tension:   { id: 'expert-knowledge-synthesizer', label: '知识/认知综合师' },
};

const AXIS_SUBDIMS: Record<string, string[]> = {
  people:    ['commitments', 'role_trajectory', 'speech_quality', 'silence_signal'],
  projects:  ['decision_provenance', 'assumptions', 'open_questions', 'risk_heat'],
  knowledge: ['reusable_judgments', 'mental_models', 'cognitive_biases', 'counterfactuals', 'evidence_grading'],
  meta:      ['decision_quality', 'meeting_necessity', 'affect_curve'],
  tension:   ['intra_meeting'],
};

export function buildDispatchPlan(
  axesToRun: string[],
  preset: 'lite' | 'standard' | 'max',
  strategySpec: string | null,
): DispatchPlan {
  const grouped = new Map<string, ExpertSlot>();
  for (const ax of axesToRun) {
    const meta = AXIS_TO_EXPERT[ax];
    if (!meta) continue;
    const slot = grouped.get(meta.id) ?? {
      expertId: meta.id,
      label: meta.label,
      axes: [],
      subDims: [],
      state: 'queued' as const,
      completedSubDims: [],
    };
    if (!slot.axes.includes(ax)) slot.axes.push(ax);
    for (const sd of AXIS_SUBDIMS[ax] ?? []) {
      if (!slot.subDims.includes(sd)) slot.subDims.push(sd);
    }
    grouped.set(meta.id, slot);
  }
  const experts = [...grouped.values()];
  const decoratorStack = (strategySpec ?? 'evidence_anchored|calibrated_confidence|knowledge_grounded|base')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  return { preset, decoratorStack, experts };
}
