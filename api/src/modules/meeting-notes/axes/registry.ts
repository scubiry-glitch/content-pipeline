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
};

export const ALL_AXES = ['people', 'projects', 'knowledge', 'meta'] as const;

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
};

export function resolveComputer(axis: string, subDim: string): ComputerFn | null {
  return REGISTRY[`${axis}/${subDim}`] ?? null;
}

/**
 * 对一个 axis 按顺序跑所有（或指定）子维度，返回 ComputeResult 数组。
 * 若 subDims 为空，跑该 axis 的所有 subDim（按 AXIS_SUBDIMS 顺序）。
 */
export async function runAxisAll(
  deps: MeetingNotesDeps,
  axis: string,
  args: ComputeArgs,
  subDims?: string[],
): Promise<ComputeResult[]> {
  const dims = subDims && subDims.length > 0 ? subDims : (AXIS_SUBDIMS[axis] ?? []);
  const results: ComputeResult[] = [];
  for (const sd of dims) {
    const fn = resolveComputer(axis, sd);
    if (!fn) continue;
    try {
      results.push(await fn(deps, args));
    } catch (e) {
      results.push({
        subDim: sd,
        created: 0, updated: 0, skipped: 0, errors: 1,
      });
    }
  }
  return results;
}
