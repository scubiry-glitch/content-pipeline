// _axisRegistry.ts — 前端 axis 注册表（与 api/src/modules/meeting-notes/axes/registry.ts 镜像）
//
// webapp 与 api 无共享 package，所以这里复制后端 AXIS_REGISTRY 的数据形态。
// 收敛 N 处硬编码 (GenerationCenter / NewMeeting / Panorama fallback / fixtures)。
// 改动 axis 时**两侧都要改**，但每侧只改一处。
//
// 来源：api/src/modules/meeting-notes/axes/registry.ts AXIS_REGISTRY
// 改动六：消除前端硬编码双写（PANORAMA_FALLBACK 与 service 双份等）

export type AxisStage = 'L1' | 'L2';

export interface AxisMetadata {
  axis: string;
  label: string;
  /** 视觉色（与 _axisShared.tsx 配色一致） */
  color: string;
  subDims: Array<{ id: string; label: string }>;
  produces: string[];
  consumes: string[];
  stage: AxisStage;
  /** meta / tension 子维度被吸收到哪个单场视图（a/b/c）；其它轴留 undefined */
  perMeetingView?: Partial<Record<string, 'a' | 'b' | 'c'>>;
}

export const AXIS_REGISTRY: Record<string, AxisMetadata> = {
  people: {
    axis: 'people',
    label: '人物轴',
    color: 'var(--accent)',
    subDims: [
      { id: 'commitments',     label: '承诺兑现' },
      { id: 'role_trajectory', label: '角色演化' },
      { id: 'speech_quality',  label: '发言质量' },
      { id: 'silence_signal',  label: '沉默信号' },
    ],
    produces: ['承诺清单', '角色轨迹', '发言图谱', '沉默信号'],
    consumes: ['会议原材料', '历史纪要'],
    stage: 'L2',
  },
  projects: {
    axis: 'projects',
    label: '项目轴',
    color: 'var(--teal)',
    subDims: [
      { id: 'decision_provenance', label: '决议溯源' },
      { id: 'assumptions',         label: '假设清单' },
      { id: 'open_questions',      label: '开放问题' },
      { id: 'risk_heat',           label: '风险热度' },
    ],
    produces: ['决策链', '假设清单', '开放问题', '风险热度'],
    consumes: ['会议原材料', '历史纪要'],
    stage: 'L2',
  },
  knowledge: {
    axis: 'knowledge',
    label: '知识轴',
    color: 'oklch(0.55 0.08 280)',
    subDims: [
      { id: 'reusable_judgments', label: '可复用判断' },
      { id: 'mental_models',      label: '心智模型命中' },
      { id: 'cognitive_biases',   label: '认知偏误' },
      { id: 'counterfactuals',    label: '反事实' },
      { id: 'evidence_grading',   label: 'Rubric 矩阵' },
      { id: 'model_hitrate',      label: '心智模型命中率' },
      { id: 'consensus_track',    label: '共识轨迹' },
      { id: 'concept_drift',      label: '概念漂移' },
      { id: 'topic_lineage',      label: '议题谱系' },
      { id: 'external_experts',   label: '外部专家注释' },
    ],
    produces: [
      '心智模型命中', '互补专家组', '盲区档案', 'Rubric 矩阵',
      '心智模型命中率', '共识轨迹', '概念漂移', '议题谱系', '外部专家注释',
    ],
    consumes: ['会议原材料', '历史纪要', '专家库', '内容库 assets'],
    stage: 'L2',
  },
  meta: {
    axis: 'meta',
    label: '会议本身',
    color: 'var(--amber)',
    subDims: [
      { id: 'decision_quality',  label: '决策质量' },
      { id: 'meeting_necessity', label: '必要性评估' },
      { id: 'affect_curve',      label: '情绪热力图' },
    ],
    produces: ['会议健康度报告', '一页纸摘要'],
    consumes: ['会议原材料'],
    stage: 'L1',
    perMeetingView: { decision_quality: 'a', meeting_necessity: 'b', affect_curve: 'c' },
  },
  tension: {
    axis: 'tension',
    label: '张力轴',
    color: 'var(--ink-2)',
    subDims: [{ id: 'intra_meeting', label: '张力清单' }],
    produces: ['张力清单'],
    consumes: ['会议原材料'],
    stage: 'L1',
    perMeetingView: { intra_meeting: 'b' },
  },
};

export const ALL_AXES = ['people', 'projects', 'knowledge', 'meta', 'tension'] as const;

/** 全部子维度总数（NewMeeting 文案"22 子维度"来源） */
export const AXIS_TOTAL_COUNT: number = ALL_AXES.reduce(
  (sum, k) => sum + AXIS_REGISTRY[k].subDims.length,
  0,
);

/** L1 / L2 stage → axes 映射 (DAG 预览卡用) */
export const AXES_BY_STAGE: Record<AxisStage, string[]> = {
  L1: ALL_AXES.filter((a) => AXIS_REGISTRY[a].stage === 'L1'),
  L2: ALL_AXES.filter((a) => AXIS_REGISTRY[a].stage === 'L2'),
};

/** 全部 produces 反向聚合（panorama OUTPUTS）— 按 axis 顺序去重 */
export const ALL_PRODUCES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of ALL_AXES) {
    for (const p of AXIS_REGISTRY[k].produces) {
      if (!seen.has(p)) { seen.add(p); out.push(p); }
    }
  }
  return out;
})();

/** 全部 consumes 反向聚合（panorama SOURCES） */
export const ALL_CONSUMES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of ALL_AXES) {
    for (const c of AXIS_REGISTRY[k].consumes) {
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
  }
  return out;
})();

/** GenerationCenter 用的 AXIS_SUB 形态（兼容老 prop 结构） */
export const AXIS_SUB: Record<string, { label: string; color: string; subs: Array<{ id: string; label: string }> }> = (() => {
  const out: Record<string, { label: string; color: string; subs: Array<{ id: string; label: string }> }> = {};
  for (const k of ALL_AXES) {
    const a = AXIS_REGISTRY[k];
    out[k] = { label: a.label, color: a.color, subs: a.subDims };
  }
  return out;
})();
