// MeetingNotesEngine — 模块核心编排
// 5 层能力：parse / axes / runs / longitudinal / crosslinks
// 本文件仅为 PR1 的骨架；后续 PR 会逐层补齐实现

import type {
  MeetingNotesDeps,
  MeetingNotesOptions,
  EnqueueRunRequest,
  RunRecord,
  ScopeRef,
  AxisName,
  AxisVersionRef,
} from './types.js';

export class MeetingNotesEngine {
  constructor(
    readonly deps: MeetingNotesDeps,
    readonly options: MeetingNotesOptions = {},
  ) {}

  // ============================================================
  // 健康探测（PR1 唯一可用方法）
  // ============================================================

  async health(): Promise<{ ok: true; version: string }> {
    return { ok: true, version: '0.1.0-scaffold' };
  }

  // ============================================================
  // Layer 1 — parse（PR2 实现）
  // ============================================================

  async parseMeeting(_assetId: string): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'not-implemented (PR2)' };
  }

  // ============================================================
  // Layer 2 — axes（PR3 实现）
  // ============================================================

  async computeAxis(_req: {
    meetingId?: string;
    scope?: ScopeRef;
    axis: AxisName;
    subDims?: string[];
  }): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'not-implemented (PR3)' };
  }

  // ============================================================
  // Layer 3 — runs / versions（PR4 实现）
  // ============================================================

  async enqueueRun(_req: EnqueueRunRequest): Promise<{ ok: boolean; runId?: string; reason?: string }> {
    return { ok: false, reason: 'not-implemented (PR4)' };
  }

  async getRun(_id: string): Promise<RunRecord | null> {
    return null;
  }

  async listAxisVersions(_scope: ScopeRef, _axis: AxisName): Promise<AxisVersionRef[]> {
    return [];
  }

  // ============================================================
  // Layer 4 — longitudinal（PR5 实现）
  // ============================================================

  async computeLongitudinal(_req: {
    scopeId: string;
    kind: 'belief_drift' | 'decision_tree' | 'model_hit_rate';
  }): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'not-implemented (PR5)' };
  }

  // ============================================================
  // Layer 5 — cross-axis links（PR4 实现）
  // ============================================================

  async getCrossAxisLinks(_req: {
    scope: ScopeRef;
    axis: AxisName;
    itemId: string;
  }): Promise<Array<{
    targetAxis: AxisName;
    targetItemType: string;
    targetItemId: string;
    relationship: string;
    score: number;
  }>> {
    return [];
  }
}
