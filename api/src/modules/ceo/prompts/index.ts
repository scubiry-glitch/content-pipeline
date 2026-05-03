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
import { boardroomRebuttalPrompt } from './boardroom-rebuttal.js';
import { boardroomAnnotationPrompt } from './boardroom-annotation.js';
import { boardroomConcernsPrompt } from './boardroom-concerns.js';
import { situationSignalPrompt } from './situation-signal.js';
import { situationRubricPrompt } from './situation-rubric.js';
import { balconyPromptPrompt } from './balcony-prompt.js';
import { warRoomSparkPrompt } from './war-room-spark.js';

export type { PromptDef, PromptCtx } from './types.js';

/** axis → prompt def 映射 */
export const PROMPTS: Record<string, PromptDef<any>> = {
  'compass-stars':       compassStarsPrompt,
  'compass-drift-alert': compassDriftAlertPrompt,
  'compass-echo':        compassEchoPrompt,
  'boardroom-rebuttal':  boardroomRebuttalPrompt,
  'boardroom-annotation': boardroomAnnotationPrompt,
  'boardroom-concerns':  boardroomConcernsPrompt,
  'situation-signal':    situationSignalPrompt,
  'situation-rubric':    situationRubricPrompt,
  'balcony-prompt':      balconyPromptPrompt,
  'war-room-spark':      warRoomSparkPrompt,
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
    runId,
    extra: extra ?? {},
  };
}
