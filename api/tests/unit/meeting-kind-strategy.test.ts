import { describe, it, expect } from 'vitest';
import {
  resolveStrategyForMeeting,
  shouldSkipExpertAnalysis,
  MEETING_KIND_STRATEGY,
} from '../../src/services/expert-application/meetingKindStrategyMap.js';

describe('meetingKindStrategyMap', () => {
  it('strategy_roadshow uses debate base with failure_check + emm + rubric', () => {
    const spec = resolveStrategyForMeeting('strategy_roadshow');
    expect(spec?.default).toContain('debate');
    expect(spec?.default).toContain('failure_check');
    expect(spec?.default).toContain('emm_iterative');
    expect(spec?.default).toContain('rubric_anchored_output');
  });

  it('tech_review uses mental_model_rotation + max preset', () => {
    const spec = resolveStrategyForMeeting('tech_review');
    expect(spec?.preset).toBe('max');
    expect(spec?.default).toContain('mental_model_rotation');
    expect(spec?.default).toContain('failure_check');
    expect(spec?.default).toContain('emm_iterative');
  });

  it('expert_interview uses single base + contradictions + knowledge, no EMM', () => {
    const spec = resolveStrategyForMeeting('expert_interview');
    expect(spec?.default).toContain('single');
    expect(spec?.default).toContain('contradictions_surface');
    expect(spec?.default).toContain('knowledge_grounded');
    expect(spec?.default).not.toContain('emm_iterative');
    expect(spec?.default).not.toContain('rubric_anchored_output');
  });

  it('industry_research uses heuristic_trigger_first + evidence + knowledge, no EMM', () => {
    const spec = resolveStrategyForMeeting('industry_research');
    expect(spec?.default).toContain('heuristic_trigger_first');
    expect(spec?.default).toContain('evidence_anchored');
    expect(spec?.default).toContain('knowledge_grounded');
    expect(spec?.default).not.toContain('emm_iterative');
  });

  it('internal_ops returns null', () => {
    expect(resolveStrategyForMeeting('internal_ops')).toBeNull();
    expect(shouldSkipExpertAnalysis('internal_ops')).toBe(true);
  });

  it('unknown meetingKind returns null without throwing', () => {
    expect(resolveStrategyForMeeting('weekly_standup' as any)).toBeNull();
    expect(resolveStrategyForMeeting(undefined)).toBeNull();
    expect(shouldSkipExpertAnalysis(undefined)).toBe(false);
  });

  it('every active kind uses only registered decorator/base ids', () => {
    const VALID = new Set([
      'single', 'debate', 'mental_model_rotation', 'heuristic_trigger_first',
      'failure_check', 'emm_iterative', 'evidence_anchored',
      'calibrated_confidence', 'track_record_verify', 'signature_style',
      'knowledge_grounded', 'contradictions_surface', 'rubric_anchored_output',
    ]);
    for (const [kind, spec] of Object.entries(MEETING_KIND_STRATEGY)) {
      if (spec === null) continue;
      const tokens = (spec.default || '').split('|');
      for (const t of tokens) {
        expect(VALID, `${kind} references unknown spec id: ${t}`).toContain(t);
      }
    }
  });
});
