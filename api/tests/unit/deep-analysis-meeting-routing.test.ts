/**
 * routeMeetingKind — pure routing helper called at the top of runDeepAnalysis.
 *
 * Routing rules:
 *   1. Non-meeting-minutes asset   → no routing (skip=false, no derive)
 *   2. meeting_kind=internal_ops   → skip=true (early return in orchestrator)
 *   3. meeting_minutes, no caller strategy, known kind → derive from map
 *   4. meeting_minutes, caller provided strategy → don't override
 *   5. meeting_minutes, unknown kind, no caller strategy → no derive
 */
import { describe, it, expect } from 'vitest';
import { routeMeetingKind } from '../../src/services/assets-ai/deepAnalysisOrchestrator.js';

function minutesAsset(meetingKind?: string): any {
  return {
    id: 'a1',
    type: 'meeting_minutes',
    title: 'T',
    content: 'C',
    metadata: meetingKind ? { meeting_kind: meetingKind } : {},
  };
}

describe('routeMeetingKind', () => {
  it('non-meeting asset → no routing even if meeting_kind present in metadata', () => {
    const result = routeMeetingKind(
      { id: 'r', type: 'report', metadata: { meeting_kind: 'internal_ops' } } as any,
    );
    expect(result).toEqual({ skip: false });
  });

  it('internal_ops meeting → skip=true with reason', () => {
    const result = routeMeetingKind(minutesAsset('internal_ops'));
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('internal_ops');
    expect(result.derivedStrategy).toBeUndefined();
  });

  it('tech_review with no caller strategy → derives max preset + mental_model_rotation', () => {
    const result = routeMeetingKind(minutesAsset('tech_review'));
    expect(result.skip).toBe(false);
    expect(result.derivedStrategy?.preset).toBe('max');
    expect(result.derivedStrategy?.default).toContain('mental_model_rotation');
  });

  it('strategy_roadshow → derives debate-based strategy', () => {
    const result = routeMeetingKind(minutesAsset('strategy_roadshow'));
    expect(result.derivedStrategy?.default).toContain('debate');
    expect(result.derivedStrategy?.default).toContain('emm_iterative');
  });

  it('expert_interview → derives single-based strategy (no EMM)', () => {
    const result = routeMeetingKind(minutesAsset('expert_interview'));
    expect(result.derivedStrategy?.default).toContain('single');
    expect(result.derivedStrategy?.default).toContain('contradictions_surface');
    expect(result.derivedStrategy?.default).not.toContain('emm_iterative');
  });

  it('industry_research → derives heuristic_trigger_first', () => {
    const result = routeMeetingKind(minutesAsset('industry_research'));
    expect(result.derivedStrategy?.default).toContain('heuristic_trigger_first');
  });

  it('caller-provided strategy is never overwritten', () => {
    const caller = { preset: 'lite' as const, default: 'single' };
    const result = routeMeetingKind(minutesAsset('tech_review'), caller);
    expect(result.skip).toBe(false);
    expect(result.derivedStrategy).toBeUndefined();
  });

  it('meeting_minutes without meeting_kind → no derive, no skip', () => {
    const result = routeMeetingKind(minutesAsset(undefined));
    expect(result).toEqual({ skip: false });
  });

  it('unknown meeting_kind string → no derive, no skip', () => {
    const result = routeMeetingKind(minutesAsset('weekly_standup_custom' as any));
    expect(result).toEqual({ skip: false });
  });
});
