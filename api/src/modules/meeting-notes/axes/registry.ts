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
  people:    ['commitments', 'role_trajectory', 'speech_quality', 'silence_signal'],
  projects:  ['decision_provenance', 'assumptions', 'open_questions', 'risk_heat'],
  knowledge: ['reusable_judgments', 'mental_models', 'cognitive_biases', 'counterfactuals', 'evidence_grading'],
  meta:      ['decision_quality', 'meeting_necessity', 'affect_curve'],
  tension:   ['intra_meeting'],
};

export const ALL_AXES = ['people', 'projects', 'knowledge', 'meta', 'tension'] as const;

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
  // meta
  'meta/decision_quality':       computeDecisionQuality,
  'meta/meeting_necessity':      computeMeetingNecessity,
  'meta/affect_curve':           computeAffectCurve,
  // tension (P1-5)
  'tension/intra_meeting':       computeTensions,
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
