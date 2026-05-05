// CEO 棱镜 prompt 模块 · 统一入口
//
// 用法（runHandlers.ts）:
//   const def = PROMPTS[axis];
//   if (!def) return { ok:false, error:'unknown axis' };
//   const ctx = await loadPromptCtx(deps, run);
//   const result = await deps.llm.invoke({...});
//   const parsed = def.outputSchema.parse(JSON.parse(result.text));
//   for (const c of def.qualityChecks) {
//     const err = c(parsed, ctx);
//     if (err) throw new Error(`[${def.axis}] quality fail: ${err}`);
//   }

import type { PromptDef, PromptCtx } from './types.js';
import { compassStarsPrompt } from './compass-stars.js';
import { compassDriftAlertPrompt } from './compass-drift-alert.js';
import { compassEchoPrompt } from './compass-echo.js';
import { compassNarrativePrompt } from './compass-narrative.js';
import { boardroomRebuttalPrompt } from './boardroom-rebuttal.js';
import { boardroomAnnotationPrompt } from './boardroom-annotation.js';
import { boardroomConcernsPrompt } from './boardroom-concerns.js';
import { boardroomBriefTocPrompt } from './boardroom-brief-toc.js';
import { boardroomPromisesPrompt } from './boardroom-promises.js';
import { situationSignalPrompt } from './situation-signal.js';
import { situationRubricPrompt } from './situation-rubric.js';
import { balconyPromptPrompt } from './balcony-prompt.js';
import { warRoomSparkPrompt } from './war-room-spark.js';
import { warRoomFormationPrompt } from './war-room-formation.js';
import { ceoDecisionsCapturePrompt } from './ceo-decisions-capture.js';

export type { PromptDef, PromptCtx } from './types.js';

/** axis → prompt def 映射 */
export const PROMPTS: Record<string, PromptDef<any>> = {
  'compass-stars':         compassStarsPrompt,
  'compass-drift-alert':   compassDriftAlertPrompt,
  'compass-echo':          compassEchoPrompt,
  'compass-narrative':     compassNarrativePrompt,
  'boardroom-rebuttal':    boardroomRebuttalPrompt,
  'boardroom-annotation':  boardroomAnnotationPrompt,
  'boardroom-concerns':    boardroomConcernsPrompt,
  'boardroom-brief-toc':   boardroomBriefTocPrompt,
  'boardroom-promises':    boardroomPromisesPrompt,
  'situation-signal':      situationSignalPrompt,
  'situation-rubric':      situationRubricPrompt,
  'balcony-prompt':        balconyPromptPrompt,
  'war-room-spark':        warRoomSparkPrompt,
  'war-room-formation':    warRoomFormationPrompt,
  'ceo-decisions-capture': ceoDecisionsCapturePrompt,
};

export const PROMPT_AXES = Object.keys(PROMPTS);

// ─────────────────────────────────────────────────────────
// loadPromptCtx — 给一个 run 加载完整的 PromptCtx
//   db query 集中在这里，handler 只管"调 prompt → 写表"
// ─────────────────────────────────────────────────────────

interface LoadCtxArgs {
  scopeId: string | null;
  runId: string;
  /** 把 mn_runs.metadata 里的 axis-specific 字段透传给 prompt（如 expertId/briefId/weekStart）*/
  extra?: Record<string, unknown>;
}

interface DbHandle {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

export async function loadPromptCtx(db: DbHandle, args: LoadCtxArgs): Promise<PromptCtx> {
  const { scopeId, runId, extra } = args;

  // scope name
  let scopeName: string | null = null;
  if (scopeId) {
    const r = await db.query(`SELECT name FROM mn_scopes WHERE id = $1::uuid`, [scopeId]);
    scopeName = r.rows[0]?.name ?? null;
  }

  // meetings — 该 scope 绑定的会议（带 title）
  const meetingsRes = await db.query(
    scopeId
      ? `SELECT a.id::text AS id,
                COALESCE(NULLIF(trim(a.title), ''), NULLIF(trim(a.metadata->>'title'), ''), '未命名会议') AS title,
                a.created_at
           FROM mn_scope_members sm
           JOIN assets a ON a.id::text = sm.meeting_id::text
          WHERE sm.scope_id::text = $1::text
          ORDER BY sm.bound_at DESC NULLS LAST, a.created_at DESC NULLS LAST
          LIMIT 20`
      : `SELECT a.id::text AS id,
                COALESCE(NULLIF(trim(a.title), ''), NULLIF(trim(a.metadata->>'title'), ''), '未命名会议') AS title,
                a.created_at
           FROM assets a
          WHERE a.asset_type = 'meeting_minutes'
          ORDER BY a.created_at DESC NULLS LAST
          LIMIT 20`,
    scopeId ? [scopeId] : [],
  );
  const meetings = (meetingsRes.rows as any[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));

  // judgments — 近 90 天 mn_judgments；若该 scope 关联的 meetings 之外查不到，则按 scope_id 直查
  let judgments: PromptCtx['judgments'] = [];
  try {
    const meetingIds = meetings.map((m) => m.id);
    if (meetingIds.length > 0) {
      const r = await db.query(
        `SELECT kind, text, created_at
           FROM mn_judgments
          WHERE created_at > NOW() - INTERVAL '90 days'
            AND meeting_id::text = ANY($1::text[])
          ORDER BY created_at DESC
          LIMIT 80`,
        [meetingIds],
      );
      judgments = (r.rows as any[]).map((row) => ({
        kind: String(row.kind ?? ''),
        text: String(row.text ?? ''),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
      }));
    }
  } catch {
    judgments = [];
  }

  // commitments
  let commitments: PromptCtx['commitments'] = [];
  try {
    const meetingIds = meetings.map((m) => m.id);
    if (meetingIds.length > 0) {
      const r = await db.query(
        `SELECT what AS text, due_at, status, owner_name
           FROM mn_commitments
          WHERE meeting_id::text = ANY($1::text[])
          ORDER BY created_at DESC
          LIMIT 30`,
        [meetingIds],
      );
      commitments = (r.rows as any[]).map((row) => ({
        text: String(row.text ?? ''),
        dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
        status: String(row.status ?? 'in_progress'),
        ownerName: row.owner_name ? String(row.owner_name) : undefined,
      }));
    }
  } catch {
    commitments = [];
  }

  // directors
  let directors: PromptCtx['directors'] = [];
  try {
    const r = await db.query(
      `SELECT id::text AS id, name, role, weight FROM ceo_directors
        WHERE ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
        ORDER BY weight DESC NULLS LAST LIMIT 12`,
      [scopeId],
    );
    directors = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      role: row.role ? String(row.role) : null,
      weight: Number(row.weight ?? 1),
    }));
  } catch {
    directors = [];
  }

  // brief — 当前 draft
  let brief: PromptCtx['brief'] = null;
  try {
    const r = await db.query(
      `SELECT id::text AS id, board_session, version, toc, page_count
         FROM ceo_briefs
        WHERE status = 'draft' AND ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
        ORDER BY version DESC LIMIT 1`,
      [scopeId],
    );
    if (r.rows[0]) {
      brief = {
        id: String(r.rows[0].id),
        boardSession: r.rows[0].board_session ? String(r.rows[0].board_session) : null,
        version: Number(r.rows[0].version ?? 1),
        toc: r.rows[0].toc ?? [],
        pageCount: r.rows[0].page_count != null ? Number(r.rows[0].page_count) : null,
      };
    }
  } catch {
    brief = null;
  }

  // strategicLines
  let strategicLines: PromptCtx['strategicLines'] = [];
  try {
    const r = await db.query(
      `SELECT id::text AS id, name, kind, description FROM ceo_strategic_lines
        WHERE ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
          AND status = 'active'
        ORDER BY established_at DESC LIMIT 10`,
      [scopeId],
    );
    strategicLines = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: row.kind as 'main' | 'branch' | 'drift',
      description: row.description ? String(row.description) : null,
    }));
  } catch {
    strategicLines = [];
  }

  // stakeholders
  let stakeholders: PromptCtx['stakeholders'] = [];
  try {
    const r = await db.query(
      `SELECT id::text AS id, name, kind, heat FROM ceo_stakeholders
        WHERE ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
        ORDER BY heat DESC NULLS LAST LIMIT 12`,
      [scopeId],
    );
    stakeholders = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: String(row.kind),
      heat: Number(row.heat ?? 0),
    }));
  } catch {
    stakeholders = [];
  }

  // conceptDrifts — 知识轴 mn_concept_drifts，只取 med/high/critical
  // scopeId 给定 → 取 scope 内 + 全局（scope_id IS NULL）；scopeId null → 仅全局
  let conceptDrifts: PromptCtx['conceptDrifts'] = [];
  try {
    const r = await db.query(
      `SELECT id::text AS id,
              term,
              drift_severity,
              scope_id::text AS scope_id_text,
              first_observed_at,
              last_observed_at,
              definition_at_meeting
         FROM mn_concept_drifts
        WHERE drift_severity IN ('med','high','critical')
          AND ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
        ORDER BY CASE drift_severity
                   WHEN 'critical' THEN 0
                   WHEN 'high'     THEN 1
                   WHEN 'med'      THEN 2
                   ELSE 3 END,
                 last_observed_at DESC NULLS LAST
        LIMIT 15`,
      [scopeId],
    );
    conceptDrifts = (r.rows as any[]).map((row) => {
      const defs: any[] = Array.isArray(row.definition_at_meeting) ? row.definition_at_meeting : [];
      const usageCount = defs.length;
      const misuses = defs.filter((d) => d?.correctly_used === false);
      const correct = defs.filter((d) => d?.correctly_used !== false);
      // 优先暴露错误用法，再补充正确用法到 3 条
      const picked = [...misuses.slice(0, 2), ...correct.slice(0, Math.max(0, 3 - Math.min(2, misuses.length)))].slice(0, 3);
      return {
        term: String(row.term),
        severity: row.drift_severity as 'med' | 'high' | 'critical',
        scopeId: row.scope_id_text ? String(row.scope_id_text) : null,
        firstObservedAt: row.first_observed_at ? new Date(row.first_observed_at).toISOString() : null,
        lastObservedAt: row.last_observed_at ? new Date(row.last_observed_at).toISOString() : null,
        usageCount,
        misuseCount: misuses.length,
        usages: picked.map((d: any) => ({
          meetingId: d?.meeting_id ? String(d.meeting_id) : null,
          observedAt: d?.observed_at ? String(d.observed_at) : null,
          outcome: String(d?.outcome ?? '').slice(0, 220),
          correctlyUsed: d?.correctly_used !== false,
          modelVariant: d?.model_variant ? String(d.model_variant) : null,
        })),
      };
    });
  } catch {
    conceptDrifts = [];
  }

  // counterfactuals — mn_counterfactuals 通过 mn_scope_members JOIN 到 scope
  // 优先取 next_validity_check_at 已到/临近，其次 unclear|invalid 状态
  let counterfactuals: PromptCtx['counterfactuals'] = [];
  try {
    const r = await db.query(
      scopeId
        ? `SELECT cf.id::text AS id,
                  cf.rejected_path,
                  cf.tracking_note,
                  cf.next_validity_check_at,
                  cf.current_validity,
                  cf.meeting_id::text AS meeting_id
             FROM mn_counterfactuals cf
             JOIN mn_scope_members sm ON sm.meeting_id::text = cf.meeting_id::text
            WHERE sm.scope_id::text = $1::text
              AND cf.current_validity IN ('unclear','invalid')
            ORDER BY (cf.next_validity_check_at <= NOW()) DESC NULLS LAST,
                     cf.next_validity_check_at ASC NULLS LAST,
                     cf.created_at DESC
            LIMIT 25`
        : `SELECT id::text AS id,
                  rejected_path,
                  tracking_note,
                  next_validity_check_at,
                  current_validity,
                  meeting_id::text AS meeting_id
             FROM mn_counterfactuals
            WHERE current_validity IN ('unclear','invalid')
            ORDER BY (next_validity_check_at <= NOW()) DESC NULLS LAST,
                     next_validity_check_at ASC NULLS LAST,
                     created_at DESC
            LIMIT 25`,
      scopeId ? [scopeId] : [],
    );
    counterfactuals = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      rejectedPath: String(row.rejected_path ?? '').slice(0, 240),
      trackingNote: row.tracking_note ? String(row.tracking_note).slice(0, 240) : null,
      nextCheckAt: row.next_validity_check_at ? new Date(row.next_validity_check_at).toISOString() : null,
      currentValidity: (row.current_validity ?? 'unclear') as 'valid' | 'invalid' | 'unclear',
      meetingId: row.meeting_id ? String(row.meeting_id) : null,
    }));
  } catch {
    counterfactuals = [];
  }

  // topicLineages — 知识轴 mn_topic_lineage，scope 内 + 全局，按 mention_count + alive 优先
  let topicLineages: PromptCtx['topicLineages'] = [];
  try {
    const r = await db.query(
      `SELECT topic,
              scope_id::text AS scope_id_text,
              health_state,
              mention_count,
              last_active_at,
              birth_meeting_id::text AS birth_meeting_id
         FROM mn_topic_lineage
        WHERE ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
          AND mention_count >= 2
        ORDER BY CASE health_state
                   WHEN 'alive'      THEN 0
                   WHEN 'endangered' THEN 1
                   WHEN 'dead'       THEN 2
                   ELSE 3 END,
                 mention_count DESC,
                 last_active_at DESC NULLS LAST
        LIMIT 12`,
      [scopeId],
    );
    topicLineages = (r.rows as any[]).map((row) => ({
      topic: String(row.topic),
      scopeId: row.scope_id_text ? String(row.scope_id_text) : null,
      healthState: row.health_state as 'alive' | 'endangered' | 'dead',
      mentionCount: Number(row.mention_count ?? 0),
      lastActiveAt: row.last_active_at ? new Date(row.last_active_at).toISOString() : null,
      birthMeetingId: row.birth_meeting_id ? String(row.birth_meeting_id) : null,
    }));
  } catch {
    topicLineages = [];
  }

  // consensusTracks — 知识轴 mn_consensus_tracks，scope 内 + 全局
  // 取最近 90 天内、按 (topic 优先 high consensus) → (低 consensus 视为 drift 候选)
  let consensusTracks: PromptCtx['consensusTracks'] = [];
  try {
    const r = await db.query(
      `SELECT topic,
              consensus_score,
              dominant_view,
              meeting_id::text AS meeting_id
         FROM mn_consensus_tracks
        WHERE ($1::uuid IS NULL OR scope_id IS NULL OR scope_id = $1::uuid)
          AND created_at > NOW() - INTERVAL '90 days'
        ORDER BY ABS(consensus_score - 0.5) DESC,  -- 极端两侧（很共识 / 很分裂）优先
                 created_at DESC
        LIMIT 15`,
      [scopeId],
    );
    consensusTracks = (r.rows as any[]).map((row) => ({
      topic: String(row.topic),
      consensusScore: Number(row.consensus_score ?? 0.5),
      dominantView: row.dominant_view ? String(row.dominant_view).slice(0, 240) : null,
      meetingId: String(row.meeting_id),
    }));
  } catch {
    consensusTracks = [];
  }

  return {
    scopeId,
    scopeName,
    meetings,
    judgments,
    commitments,
    directors,
    brief,
    strategicLines,
    stakeholders,
    conceptDrifts,
    counterfactuals,
    topicLineages,
    consensusTracks,
    runId,
    extra: extra ?? {},
  };
}
