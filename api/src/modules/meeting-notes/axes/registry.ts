// axes/registry.ts — (axis, subDim) → computer function
//
// 16 个 computer 统一入口。MeetingNotesEngine.computeAxis 通过此表分发。

import type { MeetingNotesDeps } from '../types.js';
import type { ComputeArgs, ComputeResult } from './_shared.js';

import { computeCommitments } from './people/commitmentsComputer.js';
import { computeRoleTrajectory } from './people/roleTrajectoryComputer.js';
import { computeSpeechQuality } from './people/speechQualityComputer.js';
import { computeSilenceSignal } from './people/silenceSignalComputer.js';

import { computeDecisionProvenance } from './projects/decisionProvenanceComputer.js';
import { computeAssumptions } from './projects/assumptionsComputer.js';
import { computeOpenQuestions } from './projects/openQuestionsComputer.js';
import { computeRiskHeat } from './projects/riskHeatComputer.js';

import { computeReusableJudgments } from './knowledge/reusableJudgmentsComputer.js';
import { computeMentalModels } from './knowledge/mentalModelsComputer.js';
import { computeCognitiveBiases } from './knowledge/cognitiveBiasesComputer.js';
import { computeCounterfactuals } from './knowledge/counterfactualsComputer.js';
import { computeEvidenceGrading } from './knowledge/evidenceGradingComputer.js';
import { computeModelHitrate } from './knowledge/modelHitrateComputer.js';
import { computeConsensusTrack } from './knowledge/consensusTrackComputer.js';
import { computeConceptDrift } from './knowledge/conceptDriftComputer.js';
import { computeTopicLineage } from './knowledge/topicLineageComputer.js';
import { computeExternalExperts } from './knowledge/externalExpertsComputer.js';

import { computeDecisionQuality } from './meta/decisionQualityComputer.js';
import { computeMeetingNecessity } from './meta/meetingNecessityComputer.js';
import { computeAffectCurve } from './meta/affectCurveComputer.js';

import { computeTensions } from './tension/tensionComputer.js';

export type ComputerFn = (deps: MeetingNotesDeps, args: ComputeArgs) => Promise<ComputeResult>;

/**
 * 每个 axis 的 "所有子维度" 执行顺序。
 * 注：evidence_grading 必须在 assumptions 之后（派生聚合依赖前者）。
 */
export const AXIS_SUBDIMS: Record<string, string[]> = {
  people:    ['commitments', 'role_trajectory', 'speech_quality', 'silence_signal', 'affect_curve', 'intra_meeting'],
  projects:  ['decision_provenance', 'assumptions', 'open_questions', 'risk_heat', 'decision_quality', 'meeting_necessity'],
  knowledge: ['reusable_judgments', 'mental_models', 'cognitive_biases', 'counterfactuals', 'evidence_grading',
              'model_hitrate', 'consensus_track', 'concept_drift', 'topic_lineage', 'external_experts'],
  // meta/tension 已合并入 people/projects，保留空数组供旧 run 记录向后兼容
  meta:    [],
  tension: [],
};

export const ALL_AXES = ['people', 'projects', 'knowledge'] as const;

/**
 * AXIS_REGISTRY — 单一注册表，喂给：
 *   - panorama service / fallback（OUTPUTS / SOURCES 反向聚合）
 *   - GenerationCenter / NewMeeting 前端（AXIS_TOTAL_COUNT / AXIS_SUB 派生）
 *   - DAG scheduler（stage 决定 L1/L2 路由）
 *
 * 每个 axis 声明：
 *   - subDims: 该 axis 下所有子维度（与 AXIS_SUBDIMS 等价，方便面向新 API 调用方）
 *   - subDimLabels: subDim → 中文 label
 *   - produces:   该 axis 跑完会产出哪些"产物标签"（panorama OUTPUTS）
 *   - consumes:   该 axis 依赖哪些 source（panorama SOURCES）
 *   - stage:      'L1' = per-meeting 体征（先跑）/ 'L2' = 跨会聚合（depends_on L1）
 *   - perMeetingView: meta 数据被 a/b/c 单场视图吸收时的渲染位置（null=不在单场暴露）
 */
export type AxisStage = 'L1' | 'L2';

export interface AxisMetadata {
  axis: string;
  subDims: string[];
  subDimLabels: Record<string, string>;
  produces: string[];
  consumes: string[];
  stage: AxisStage;
  /** meta 轴的 3 个 sub_dim 各自归宿到哪个单场视图；其它轴留 null */
  perMeetingView?: Partial<Record<string, 'a' | 'b' | 'c'>>;
}

export const AXIS_REGISTRY: Record<string, AxisMetadata> = {
  people: {
    axis: 'people',
    subDims: AXIS_SUBDIMS.people,
    subDimLabels: {
      commitments:      '承诺兑现',
      role_trajectory:  '角色演化',
      speech_quality:   '发言质量',
      silence_signal:   '沉默信号',
      affect_curve:     '情绪热力图',
      intra_meeting:    '张力清单',
    },
    produces: ['承诺清单', '角色轨迹', '发言图谱', '沉默信号', '情绪热力图', '张力清单'],
    consumes: ['会议原材料', '历史纪要'],
    stage: 'L2',
  },
  projects: {
    axis: 'projects',
    subDims: AXIS_SUBDIMS.projects,
    subDimLabels: {
      decision_provenance: '决议溯源',
      assumptions:         '假设清单',
      open_questions:      '开放问题',
      risk_heat:           '风险热度',
      decision_quality:    '决策质量',
      meeting_necessity:   '必要性评估',
    },
    produces: ['决策链', '假设清单', '开放问题', '风险热度', '会议健康度报告', '一页纸摘要'],
    consumes: ['会议原材料', '历史纪要'],
    stage: 'L2',
  },
  knowledge: {
    axis: 'knowledge',
    subDims: AXIS_SUBDIMS.knowledge,
    subDimLabels: {
      reusable_judgments: '可复用判断',
      mental_models:      '心智模型命中',
      cognitive_biases:   '认知偏误',
      counterfactuals:    '反事实',
      evidence_grading:   'Rubric 矩阵',
      model_hitrate:      '心智模型命中率',
      consensus_track:    '共识轨迹',
      concept_drift:      '概念漂移',
      topic_lineage:      '议题谱系',
      external_experts:   '外部专家注释',
    },
    produces: [
      '心智模型命中', '互补专家组', '盲区档案', 'Rubric 矩阵',
      '心智模型命中率', '共识轨迹', '概念漂移', '议题谱系', '外部专家注释',
    ],
    consumes: ['会议原材料', '历史纪要', '专家库', '内容库 assets'],
    stage: 'L2',
  },
};

/** 全局派生：所有 axis × subdim 总数（NewMeeting 文案 "22 子维度" 来自这里） */
export const AXIS_TOTAL_COUNT: number = Object.values(AXIS_REGISTRY)
  .reduce((sum, a) => sum + a.subDims.length, 0);

/** panorama OUTPUTS 反向聚合（去重 + 按 axis 顺序） */
export const ALL_PRODUCES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const axis of ALL_AXES) {
    for (const p of AXIS_REGISTRY[axis].produces) {
      if (!seen.has(p)) { seen.add(p); out.push(p); }
    }
  }
  return out;
})();

/** panorama SOURCES 反向聚合（去重） */
export const ALL_CONSUMES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const axis of ALL_AXES) {
    for (const c of AXIS_REGISTRY[axis].consumes) {
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
  }
  return out;
})();

/** L1 / L2 拆分（DAG scheduler 用） */
export const AXES_BY_STAGE: Record<AxisStage, string[]> = {
  L1: ALL_AXES.filter((a) => AXIS_REGISTRY[a].stage === 'L1'),
  L2: ALL_AXES.filter((a) => AXIS_REGISTRY[a].stage === 'L2'),
};

const REGISTRY: Record<string, ComputerFn> = {
  // people
  'people/commitments':          computeCommitments,
  'people/role_trajectory':      computeRoleTrajectory,
  'people/speech_quality':       computeSpeechQuality,
  'people/silence_signal':       computeSilenceSignal,
  // projects
  'projects/decision_provenance': computeDecisionProvenance,
  'projects/assumptions':        computeAssumptions,
  'projects/open_questions':     computeOpenQuestions,
  'projects/risk_heat':          computeRiskHeat,
  // knowledge
  'knowledge/reusable_judgments': computeReusableJudgments,
  'knowledge/mental_models':     computeMentalModels,
  'knowledge/cognitive_biases':  computeCognitiveBiases,
  'knowledge/counterfactuals':   computeCounterfactuals,
  'knowledge/evidence_grading':  computeEvidenceGrading,
  'knowledge/model_hitrate':     computeModelHitrate,
  'knowledge/consensus_track':   computeConsensusTrack,
  'knowledge/concept_drift':     computeConceptDrift,
  'knowledge/topic_lineage':     computeTopicLineage,
  'knowledge/external_experts':  computeExternalExperts,
  // projects (merged from meta)
  'projects/decision_quality':   computeDecisionQuality,
  'projects/meeting_necessity':  computeMeetingNecessity,
  // people (merged from meta + tension)
  'people/affect_curve':         computeAffectCurve,
  'people/intra_meeting':        computeTensions,
};

export function resolveComputer(axis: string, subDim: string): ComputerFn | null {
  return REGISTRY[`${axis}/${subDim}`] ?? null;
}

/**
 * 已知依赖关系：当前唯一一处串行依赖是 knowledge.evidence_grading 必须在
 * knowledge.assumptions 之后跑（不，evidence_grading 派生自 mn_assumptions，
 * 但 mn_assumptions 是 projects/assumptions 的产出，**不是同 axis 内 subDim**）。
 * 因此 knowledge axis 内 5 个 subDim 实际可全部并行。
 *
 * 但为安全起见，把 evidence_grading 单独留到最后一阶段（其他 4 个并行后再跑）。
 */
const SEQUENTIAL_AFTER: Record<string, string[]> = {
  // knowledge axis: evidence_grading 依赖 mn_assumptions 表（projects axis 已先跑），
  // 单独留到 knowledge 内的 phase-2，避免与并行的其他 4 个争资源。
  knowledge: ['evidence_grading'],
};

/**
 * 对一个 axis 跑所有（或指定）子维度。
 * Opt-6 (O7)：同 axis 内独立 subDim 并行；SEQUENTIAL_AFTER 列表里的 subDim
 * 在 phase-1 全部完成后再跑（保留显式依赖顺序）。
 */
export async function runAxisAll(
  deps: MeetingNotesDeps,
  axis: string,
  args: ComputeArgs,
  subDims?: string[],
): Promise<ComputeResult[]> {
  const dims = subDims && subDims.length > 0 ? subDims : (AXIS_SUBDIMS[axis] ?? []);
  const tail = new Set(SEQUENTIAL_AFTER[axis] ?? []);
  const phase1 = dims.filter((sd) => !tail.has(sd));
  const phase2 = dims.filter((sd) => tail.has(sd));

  const runOne = async (sd: string): Promise<ComputeResult> => {
    const fn = resolveComputer(axis, sd);
    if (!fn) return { subDim: sd, created: 0, updated: 0, skipped: 0, errors: 0 };
    try {
      return await fn(deps, args);
    } catch (e) {
      return {
        subDim: sd,
        created: 0, updated: 0, skipped: 0, errors: 1,
        errorSamples: [{ kind: 'transform', message: (e as Error).message }],
      };
    }
  };

  // Phase 1: 独立 subDims 并行
  const phase1Results = await Promise.all(phase1.map(runOne));
  // Phase 2: 有依赖的 subDims 串行（通常只 0-1 个）
  const phase2Results: ComputeResult[] = [];
  for (const sd of phase2) {
    phase2Results.push(await runOne(sd));
  }
  return [...phase1Results, ...phase2Results];
}
