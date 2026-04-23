// longitudinal/index.ts — 聚合三个跨会议分析器的入口

export { BeliefDriftComputer } from './beliefDriftComputer.js';
export { DecisionTreeBuilder } from './decisionTreeBuilder.js';
export { MentalModelHitRate } from './mentalModelHitRate.js';

import type { MeetingNotesDeps } from '../types.js';
import { BeliefDriftComputer } from './beliefDriftComputer.js';
import { DecisionTreeBuilder } from './decisionTreeBuilder.js';
import { MentalModelHitRate } from './mentalModelHitRate.js';

export class LongitudinalService {
  readonly beliefDrift: BeliefDriftComputer;
  readonly decisionTree: DecisionTreeBuilder;
  readonly modelHitRate: MentalModelHitRate;

  constructor(deps: MeetingNotesDeps) {
    this.beliefDrift = new BeliefDriftComputer(deps);
    this.decisionTree = new DecisionTreeBuilder(deps);
    this.modelHitRate = new MentalModelHitRate(deps);
  }

  async recomputeAll(scopeId: string | null, runId?: string | null) {
    const out: Record<string, any> = {};
    if (scopeId) {
      out.beliefDrift = await this.beliefDrift.recomputeForScope(scopeId, runId);
      out.decisionTree = await this.decisionTree.recomputeForScope(scopeId, runId);
    }
    out.modelHitRate = await this.modelHitRate.recomputeForScope(scopeId, runId);
    return out;
  }
}
