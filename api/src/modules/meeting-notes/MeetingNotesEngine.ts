// MeetingNotesEngine — 模块核心编排
// 5 层能力：parse / axes / runs / longitudinal / crosslinks
//
// PR3: parse + axes 层完整；runs / longitudinal / crosslinks 仍为 PR4/5 占位

import type {
  MeetingNotesDeps,
  MeetingNotesOptions,
  EnqueueRunRequest,
  RunRecord,
  ScopeRef,
  AxisName,
  AxisVersionRef,
} from './types.js';
import { parseMeeting, type ParseMeetingResult } from './parse/meetingParser.js';
import {
  ALL_AXES,
  AXIS_SUBDIMS,
  runAxisAll,
} from './axes/registry.js';
import type { ComputeResult } from './axes/_shared.js';
import { RunEngine } from './runs/runEngine.js';
import { VersionStore } from './runs/versionStore.js';
import { ScopeService } from './scope/scopeService.js';
import { CrossAxisLinkResolver } from './crosslinks/crossAxisLinkResolver.js';
import { LongitudinalService } from './longitudinal/index.js';

export interface ComputeAxisRequest {
  meetingId?: string;
  scope?: ScopeRef;
  axis: AxisName;
  subDims?: string[];
  replaceExisting?: boolean;
}

export interface ComputeAxisResponse {
  ok: boolean;
  axis: AxisName;
  results: ComputeResult[];
  reason?: string;
}

export class MeetingNotesEngine {
  readonly scopes: ScopeService;
  readonly runEngine: RunEngine;
  readonly versionStore: VersionStore;
  readonly crossLinks: CrossAxisLinkResolver;
  readonly longitudinal: LongitudinalService;

  constructor(
    readonly deps: MeetingNotesDeps,
    readonly options: MeetingNotesOptions = {},
  ) {
    this.scopes = new ScopeService(deps);
    this.versionStore = new VersionStore(deps);
    this.crossLinks = new CrossAxisLinkResolver(deps);
    this.longitudinal = new LongitudinalService(deps);
    this.runEngine = new RunEngine(
      deps,
      (meetingId) => this.getMeetingAxes(meetingId),
      { concurrency: options.runConcurrency ?? 2 },
    );

    // Run 完成后触发 crosslink 重算 +（若 scope 不是 meeting）longitudinal 重算
    deps.eventBus.subscribe('mn.run.completed', async (payload: any) => {
      try {
        const run = await this.runEngine.get(payload?.runId);
        if (!run) return;
        await this.crossLinks.recomputeForScope(run.scope.kind, run.scope.id ?? null, run.id);
        if (run.scope.kind !== 'meeting' && run.scope.id) {
          await this.longitudinal.recomputeAll(run.scope.id, run.id);
        } else if (run.scope.kind === 'library') {
          await this.longitudinal.recomputeAll(null, run.id);
        }
      } catch (e) {
        console.error('[MeetingNotes] post-run recompute failed:', (e as Error).message);
      }
    });
  }

  // ============================================================
  // Health
  // ============================================================

  async health(): Promise<{ ok: true; version: string }> {
    return { ok: true, version: '0.3.0-axes' };
  }

  // ============================================================
  // Layer 1 — parse
  // ============================================================

  async parseMeeting(assetId: string): Promise<ParseMeetingResult> {
    return parseMeeting(this.deps, assetId);
  }

  // ============================================================
  // Layer 2 — axes
  // ============================================================

  async computeAxis(req: ComputeAxisRequest): Promise<ComputeAxisResponse> {
    if (req.axis === 'all') {
      const allResults: ComputeResult[] = [];
      for (const ax of ALL_AXES) {
        const r = await runAxisAll(this.deps, ax, {
          meetingId: req.meetingId,
          scopeId: req.scope?.id ?? null,
          scopeKind: req.scope?.kind,
          replaceExisting: req.replaceExisting,
        });
        allResults.push(...r);
      }
      return { ok: true, axis: 'all', results: allResults };
    }

    const axisKey = req.axis;
    if (!AXIS_SUBDIMS[axisKey]) {
      return { ok: false, axis: req.axis, results: [], reason: `unknown-axis:${req.axis}` };
    }

    const results = await runAxisAll(this.deps, axisKey, {
      meetingId: req.meetingId,
      scopeId: req.scope?.id ?? null,
      scopeKind: req.scope?.kind,
      replaceExisting: req.replaceExisting,
    }, req.subDims);

    return { ok: true, axis: req.axis, results };
  }

  /** 聚合单个 meeting 的四轴数据给前端 */
  async getMeetingAxes(meetingId: string): Promise<Record<string, any>> {
    return {
      meetingId,
      people: {
        commitments: (await this.deps.db.query(
          `SELECT id, person_id, text, due_at, state, progress, created_at
             FROM mn_commitments WHERE meeting_id = $1 ORDER BY due_at NULLS LAST`,
          [meetingId],
        )).rows,
        role_trajectory: (await this.deps.db.query(
          `SELECT person_id, role_label, confidence
             FROM mn_role_trajectory_points WHERE meeting_id = $1`,
          [meetingId],
        )).rows,
        speech_quality: (await this.deps.db.query(
          `SELECT person_id, entropy_pct, followed_up_count, quality_score, sample_quotes
             FROM mn_speech_quality WHERE meeting_id = $1`,
          [meetingId],
        )).rows,
        silence_signals: (await this.deps.db.query(
          `SELECT person_id, topic_id, state, anomaly_score
             FROM mn_silence_signals WHERE meeting_id = $1 AND state <> 'spoke'`,
          [meetingId],
        )).rows,
      },
      projects: {
        decisions: (await this.deps.db.query(
          `SELECT id, title, proposer_person_id, confidence, is_current, rationale, based_on_ids, superseded_by_id
             FROM mn_decisions WHERE meeting_id = $1 ORDER BY created_at`,
          [meetingId],
        )).rows,
        assumptions: (await this.deps.db.query(
          `SELECT id, text, evidence_grade, verification_state, confidence, underpins_decision_ids
             FROM mn_assumptions WHERE meeting_id = $1 ORDER BY evidence_grade`,
          [meetingId],
        )).rows,
        open_questions: (await this.deps.db.query(
          `SELECT id, text, category, status, times_raised, owner_person_id
             FROM mn_open_questions
             WHERE first_raised_meeting_id = $1 OR last_raised_meeting_id = $1`,
          [meetingId],
        )).rows,
        risks: (await this.deps.db.query(
          `SELECT id, text, severity, mention_count, heat_score, trend, action_taken
             FROM mn_risks
             WHERE scope_id IN (
               SELECT scope_id FROM mn_scope_members WHERE meeting_id = $1
             )
             ORDER BY heat_score DESC`,
          [meetingId],
        )).rows,
      },
      knowledge: {
        judgments: (await this.deps.db.query(
          `SELECT id, text, domain, generality_score, reuse_count
             FROM mn_judgments WHERE $1 = ANY(linked_meeting_ids) ORDER BY generality_score DESC`,
          [meetingId],
        )).rows,
        mental_models: (await this.deps.db.query(
          `SELECT id, model_name, invoked_by_person_id, correctly_used, outcome, confidence
             FROM mn_mental_model_invocations WHERE meeting_id = $1`,
          [meetingId],
        )).rows,
        cognitive_biases: (await this.deps.db.query(
          `SELECT id, bias_type, where_excerpt, by_person_id, severity, mitigated
             FROM mn_cognitive_biases WHERE meeting_id = $1 ORDER BY severity DESC`,
          [meetingId],
        )).rows,
        counterfactuals: (await this.deps.db.query(
          `SELECT id, rejected_path, rejected_by_person_id, tracking_note,
                  next_validity_check_at, current_validity
             FROM mn_counterfactuals WHERE meeting_id = $1`,
          [meetingId],
        )).rows,
        evidence_grades: (await this.deps.db.query(
          `SELECT dist_a, dist_b, dist_c, dist_d, weighted_score
             FROM mn_evidence_grades WHERE meeting_id = $1`,
          [meetingId],
        )).rows[0] ?? null,
      },
      meta: {
        decision_quality: (await this.deps.db.query(
          `SELECT overall, clarity, actionable, traceable, falsifiable, aligned, notes
             FROM mn_decision_quality WHERE meeting_id = $1`,
          [meetingId],
        )).rows[0] ?? null,
        meeting_necessity: (await this.deps.db.query(
          `SELECT verdict, suggested_duration_min, reasons
             FROM mn_meeting_necessity WHERE meeting_id = $1`,
          [meetingId],
        )).rows[0] ?? null,
        affect_curve: (await this.deps.db.query(
          `SELECT samples, tension_peaks, insight_points
             FROM mn_affect_curve WHERE meeting_id = $1`,
          [meetingId],
        )).rows[0] ?? null,
      },
    };
  }

  /**
   * 会议详情三变体 A/B/C 聚合数据。PR3 同源数据 + 不同聚合视角：
   *   A Editorial:  长文结构（章节 + 侧栏）
   *   B Workbench: 三栏（structure / claims / experts & actions）
   *   C Threads:    以 person 为中心的网络
   */
  async getMeetingDetail(meetingId: string, view: 'A' | 'B' | 'C' = 'A'): Promise<Record<string, any>> {
    const [axes, assetRows] = await Promise.all([
      this.getMeetingAxes(meetingId),
      this.deps.db.query(
        `SELECT title,
                metadata->>'occurred_at'   AS occurred_at,
                metadata->>'participants'   AS participants_raw,
                metadata->>'meeting_kind'  AS meeting_kind,
                created_at
           FROM assets WHERE id = $1 LIMIT 1`,
        [meetingId],
      ),
    ]);
    const asset = assetRows.rows[0] ?? null;
    const title = asset?.title ?? null;
    const occurredAt = asset?.occurred_at ?? null;
    // Normalize Date object → ISO string; take the date-only portion (YYYY-MM-DD)
    const toDateStr = (v: any): string | null => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v);
      // Try to parse as Date in case it's a locale string
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return s.slice(0, 10);
    };
    const dateStr = toDateStr(occurredAt) ?? toDateStr(asset?.created_at) ?? null;
    let participants: Array<{ name: string; role?: string }> = [];
    try {
      const raw = asset?.participants_raw;
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          participants = parsed.map((p: any) =>
            typeof p === 'string' ? { name: p } : { name: String(p?.name ?? ''), role: p?.role },
          );
        }
      }
    } catch { /* ignore parse errors */ }

    if (view === 'A') {
      return {
        view: 'A',
        meetingId,
        title,
        date: dateStr,
        participants,
        sections: [
          { id: 'minutes',     title: '纪要', body: axes.projects.decisions },
          { id: 'tension',     title: '张力点', body: axes.knowledge.cognitive_biases },
          { id: 'new-cognition', title: '新认知', body: axes.knowledge.judgments },
          { id: 'focus-map',   title: '焦点地图', body: axes.projects.open_questions },
          { id: 'consensus',   title: '共识/分歧', body: axes.projects.assumptions },
          { id: 'cross-view',  title: '跨视角', body: axes.knowledge.counterfactuals },
        ],
      };
    }
    if (view === 'B') {
      return {
        view: 'B',
        meetingId,
        title,
        date: dateStr,
        participants,
        left:   { speakers: axes.people.speech_quality, structure: axes.projects.decisions },
        center: { claims: axes.projects.assumptions, tensions: axes.knowledge.cognitive_biases },
        right:  { commitments: axes.people.commitments, openQuestions: axes.projects.open_questions },
      };
    }
    return {
      view: 'C',
      meetingId,
      title,
      date: dateStr,
      participants,
      nodes: axes.people.role_trajectory,
      threads: axes.people.commitments,
      influence: axes.people.speech_quality,
    };
  }

  // ============================================================
  // Layer 3 — runs / versions（PR4 实现）
  // ============================================================

  async enqueueRun(req: EnqueueRunRequest): Promise<{ ok: boolean; runId?: string; reason?: string }> {
    return this.runEngine.enqueue(req);
  }

  async getRun(id: string): Promise<RunRecord | null> {
    return this.runEngine.get(id);
  }

  async listRuns(filter: {
    scopeKind?: string;
    scopeId?: string | null;
    axis?: string;
    state?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    limit?: number;
  }): Promise<RunRecord[]> {
    return this.runEngine.list(filter);
  }

  async cancelRun(id: string): Promise<boolean> {
    return this.runEngine.cancel(id);
  }

  async listAxisVersions(scope: ScopeRef, axis: AxisName): Promise<AxisVersionRef[]> {
    const rows = await this.versionStore.listVersions(scope.kind, scope.id ?? null, axis);
    return rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      scope,
      axis,
      versionLabel: r.versionLabel,
      createdAt: r.createdAt,
    }));
  }

  async diffVersions(aId: string, bId: string) {
    return this.versionStore.diff(aId, bId);
  }

  // ============================================================
  // Layer 4 — longitudinal（PR5 实现）
  // ============================================================

  async computeLongitudinal(req: {
    scopeId: string | null;
    kind?: 'belief_drift' | 'decision_tree' | 'model_hit_rate' | 'all';
  }): Promise<{ ok: boolean; result?: any }> {
    if (!req.kind || req.kind === 'all') {
      const out = await this.longitudinal.recomputeAll(req.scopeId);
      return { ok: true, result: out };
    }
    if (!req.scopeId && (req.kind === 'belief_drift' || req.kind === 'decision_tree')) {
      return { ok: false, result: { reason: 'scopeId required for this kind' } };
    }
    if (req.kind === 'belief_drift') {
      return { ok: true, result: await this.longitudinal.beliefDrift.recomputeForScope(req.scopeId!) };
    }
    if (req.kind === 'decision_tree') {
      return { ok: true, result: await this.longitudinal.decisionTree.recomputeForScope(req.scopeId!) };
    }
    return { ok: true, result: await this.longitudinal.modelHitRate.recomputeForScope(req.scopeId) };
  }

  async getLongitudinal(scopeId: string, kind: 'belief_drift' | 'decision_tree' | 'model_hit_rate') {
    if (kind === 'belief_drift') return this.longitudinal.beliefDrift.list(scopeId);
    if (kind === 'decision_tree') return this.longitudinal.decisionTree.latestForScope(scopeId);
    return this.longitudinal.modelHitRate.listForScope(scopeId);
  }

  // ============================================================
  // Layer 5 — cross-axis links（PR4 实现）
  // ============================================================

  async getCrossAxisLinks(req: {
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
    const links = await this.crossLinks.listBySource(req.axis, req.itemId);
    return links.map((l) => ({
      targetAxis: l.targetAxis as AxisName,
      targetItemType: l.targetItemType,
      targetItemId: l.targetItemId,
      relationship: l.relationship,
      score: l.score,
    }));
  }
}
