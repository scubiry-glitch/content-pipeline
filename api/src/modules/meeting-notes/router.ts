// Meeting Notes — Fastify 路由适配层
// PR1: /health + 模块自检
// PR2: /sources/*（ingest 路由）
// PR3: /ingest/parse + /meetings/:id/axes + /meetings/:id/detail + /compute/axis
// PR4: /scopes + /runs + /versions + /crosslinks

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';
import { meetingNotesRoutes as ingestRoutes } from './ingest/routes.js';
import { createMeetingChatRoutes } from './meetingChat.js';
import { authenticate } from '../../middleware/auth.js';
import { isConnectionError } from '../../db/connection.js';
import { AXIS_SUBDIMS } from './axes/registry.js';
import { assertRowInWorkspace, currentWorkspaceId } from '../../db/repos/withWorkspace.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// P1 闸门 #3 阈值：scope 下所有 meetings.content 总字数 < 此值即拒绝重算
// （避免用户点了重算才发现 transcript 没上传，silent succeeded 空集覆盖）
const MIN_TRANSCRIPT_CHARS = parseInt(process.env.MN_MIN_TRANSCRIPT_CHARS ?? '2000', 10);

async function resolveScopeUuid(db: any, idOrSlug: string): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const r = await db.query(`SELECT id FROM mn_scopes WHERE slug = $1 LIMIT 1`, [idOrSlug]);
  return r.rows[0]?.id ?? null;
}

/** P1 闸门 helper：列出 scope 下所有 meeting asset.id（assets.id 是 varchar） */
async function collectMeetingsInScope(
  db: any,
  scope: { kind: string; id?: string | null },
): Promise<string[]> {
  if (scope.kind === 'meeting') return scope.id ? [scope.id] : [];
  if (scope.kind === 'library') {
    const r = await db.query(
      `SELECT id FROM assets
        WHERE type = 'meeting_note' OR type = 'meeting_minutes' OR (metadata ? 'meeting_kind')`,
    );
    return r.rows.map((row: any) => String(row.id));
  }
  // project / client / topic
  if (!scope.id) return [];
  const r = await db.query(
    `SELECT meeting_id::text AS meeting_id FROM mn_scope_members WHERE scope_id = $1`,
    [scope.id],
  );
  return r.rows.map((row: any) => row.meeting_id);
}

function emptyAxes(meetingId: string) {
  return {
    meetingId,
    people: {
      commitments: [],
      role_trajectory: [],
      speech_quality: [],
      silence_signals: [],
    },
    projects: {
      decisions: [],
      assumptions: [],
      open_questions: [],
      risks: [],
    },
    knowledge: {
      judgments: [],
      mental_models: [],
      cognitive_biases: [],
      counterfactuals: [],
      evidence_grades: null,
    },
    meta: {
      decision_quality: null,
      meeting_necessity: null,
      affect_curve: null,
    },
  };
}

function getMeetingRunModelHint(mode: 'multi-axis' | 'claude-cli' | 'api-oneshot'): string {
  // multi-axis / api-oneshot 都经由 meeting-notes deps.llm（taskType=expert_library）路由。
  // 默认首选 volcano-engine/deepseek-v3-2-251201，失败回退 siliconflow/DeepSeek-V3.2。
  if (mode === 'api-oneshot') {
    if (process.env.MN_ONESHOT_MODEL && process.env.MN_ONESHOT_MODEL.trim()) {
      return process.env.MN_ONESHOT_MODEL.trim();
    }
    return 'deepseek-v3-2-251201 (volcano-engine, fallback: Pro/deepseek-ai/DeepSeek-V3.2)';
  }
  if (mode === 'multi-axis') {
    return 'deepseek-v3-2-251201 (volcano-engine, fallback: Pro/deepseek-ai/DeepSeek-V3.2)';
  }
  return 'Claude Code CLI session model';
}

export function createRouter(engine: MeetingNotesEngine): FastifyPluginAsync {
  return async function meetingNotesRouter(fastify: FastifyInstance) {
    // Workspace 守卫: 按 URL 路径分派到对应表的 ws 校验, 跨 ws 一律 404
    // 涵盖 /meetings/:id (assets), /scopes/:id (mn_scopes), /people/:id (mn_people),
    //      /runs/:id (mn_runs), /schedules/:id (mn_schedules)
    // api-key 路径无 workspace 跳过 (admin 全局视图)
    fastify.addHook('preHandler', async (request, reply) => {
      const params = (request.params as Record<string, string> | undefined) ?? {};
      const id = params.id;
      if (!id) return;

      // Plugin 挂载在 /api/v1/meeting-notes 之下, 用 url 检测 collection 段
      // request.url 包含 query string, 先剥掉
      const fullUrl = (request.url || '').split('?')[0];
      // 去掉挂载 prefix; 保险起见允许任意前缀, 用 indexOf 查找最后一个集合段
      const seg = fullUrl.split('/').filter(Boolean); // [api, v1, meeting-notes, meetings, <id>, detail?]
      const idxId = seg.indexOf(id);
      if (idxId <= 0) return;
      const collection = seg[idxId - 1];

      let table: string | null = null;
      const idCol = 'id';
      switch (collection) {
        case 'meetings':  table = 'assets'; break;
        case 'scopes':    table = 'mn_scopes'; break;
        case 'people':    table = 'mn_people'; break;
        case 'runs':      table = 'mn_runs'; break;
        case 'schedules': table = 'mn_schedules'; break;
        default: return;
      }

      if (!request.auth) {
        await authenticate(request, reply);
        if (reply.sent) return;
      }
      const wsId = currentWorkspaceId(request);
      if (!wsId) return;

      // assets.id 是 varchar (e.g. UUID 或 'asset_xxx')；其它 mn_* 是 uuid
      // assertRowInWorkspace 用 text 绑定 + Postgres 自动 cast
      // GET → read 模式 (允许 is_shared workspace 的行); 其他方法 → write 模式 (严格当前 ws)
      const mode = request.method === 'GET' ? 'read' : 'write';
      try {
        const ok = await assertRowInWorkspace(table, idCol, id, wsId, mode);
        if (!ok) {
          reply.code(404).send({ error: 'Not Found' });
        }
      } catch {
        // UUID 格式错误等 — 当作不存在
        reply.code(404).send({ error: 'Not Found' });
      }
    });

    // --------------------------------------------------------
    // Health & module info
    // --------------------------------------------------------
    fastify.get('/health', async () => engine.health());

    fastify.get('/', async () => ({
      module: 'meeting-notes',
      version: '0.4.0-runs',
      status: 'runs-online',
      endpoints: {
        health: 'GET /health',
        sources: '/sources/* (PR2)',
        parse: 'POST /ingest/parse (PR3)',
        meetingAxes: 'GET /meetings/:id/axes (PR3)',
        meetingDetail: 'GET /meetings/:id/detail?view=A|B|C (PR3)',
        computeAxis: 'POST /compute/axis (PR3)',
        scopes: '/scopes/* (PR4)',
        runs: '/runs/* (PR4)',
        versions: '/versions/* (PR4)',
        crosslinks: 'GET /crosslinks (PR4)',
      },
    }));

    // --------------------------------------------------------
    // Ingest routes (PR2)
    // --------------------------------------------------------
    await fastify.register(ingestRoutes, { pathPrefix: '/sources' });

    // --------------------------------------------------------
    // Meeting Chat (resume Claude CLI session for /b 抽屉)
    // GET /meetings/:id/chat/history · POST /meetings/:id/chat/stream
    // --------------------------------------------------------
    await fastify.register(createMeetingChatRoutes(engine));

    // --------------------------------------------------------
    // Meetings CRUD (list + create, detail in /meetings/:id/*)
    // --------------------------------------------------------
    fastify.get('/meetings', { preHandler: authenticate }, async (request) => {
      const q = request.query as { limit?: string; status?: string };
      const limit = Math.min(100, parseInt(q.limit ?? '50', 10));
      // ?status=active（默认 · 排除归档）/ archived（仅归档）/ all（全部）
      const status = q.status === 'archived' || q.status === 'all' ? q.status : 'active';
      const wsId = currentWorkspaceId(request);
      try {
        const r = await engine.deps.db.query(
          `SELECT
           a.id,
           COALESCE(a.title, a.metadata->>'title', 'Untitled') AS title,
           a.metadata->>'meeting_kind' AS meeting_kind,
           a.created_at,
           a.metadata AS metadata,
           COALESCE((a.metadata->>'archived')::boolean, false) AS archived,
           a.metadata->>'archived_at' AS archived_at,
           -- claude-cli 模式跑过的 meeting 在 metadata.claudeSession.sessionId 留下 UUID
           a.metadata->'claudeSession'->>'sessionId' AS claude_session_id,
           -- 会议实际发生时间：优先 occurred_at，回退 analysis.date（可能只有日期），最后 NULL
           COALESCE(a.metadata->>'occurred_at', a.metadata->'analysis'->>'date') AS occurred_at,
           -- 与会人数：四级兜底
           --   1) metadata.attendee_count（整数字符串）
           --   2) metadata.analysis 是 jsonb object → analysis.participants 数组长度
           --   3) metadata.analysis 是 jsonb string（stringified JSON）→ 解析后取
           --   4) mn_speech_quality 表 distinct person_id（axes 跑过但 analysis 未回写时）
           COALESCE(
             CASE WHEN a.metadata->>'attendee_count' ~ '^-?\d+$'
                    THEN (a.metadata->>'attendee_count')::int
                  ELSE NULL END,
             CASE WHEN jsonb_typeof(a.metadata->'analysis'->'participants') = 'array'
                    THEN jsonb_array_length(a.metadata->'analysis'->'participants')
                  ELSE NULL END,
             CASE WHEN jsonb_typeof(a.metadata->'analysis') = 'string'
                    THEN (
                      SELECT jsonb_array_length(p.parsed->'participants')
                      FROM (SELECT (a.metadata->>'analysis')::jsonb AS parsed) p
                      WHERE jsonb_typeof(p.parsed->'participants') = 'array'
                    )
                  ELSE NULL END,
             NULLIF(
               (SELECT COUNT(DISTINCT person_id)::int FROM mn_speech_quality
                 WHERE meeting_id::text = a.id::text),
               0
             )
           ) AS attendee_count,
           -- 时长（分钟）：两级兜底
           --   1) metadata.duration_min（整数 / 小数字符串都吃 · floor 后转 int）
           --   2) mn_affect_curve.samples 最后一个样本的 t_sec / 60
           COALESCE(
             CASE WHEN a.metadata->>'duration_min' ~ '^-?\d+(\.\d+)?$'
                    THEN FLOOR((a.metadata->>'duration_min')::numeric)::int
                  ELSE NULL END,
             (
               SELECT FLOOR(((samples->-1->>'t_sec')::numeric) / 60)::int
               FROM mn_affect_curve
               WHERE meeting_id::text = a.id::text
                 AND jsonb_typeof(samples) = 'array'
                 AND jsonb_array_length(samples) > 0
             )
           ) AS duration_min,
           (SELECT row_to_json(rr) FROM (
             SELECT id, state, axis, finished_at, error_message
             FROM mn_runs WHERE scope_kind='meeting' AND scope_id::text = a.id
             ORDER BY created_at DESC LIMIT 1
           ) rr) AS last_run,
           COALESCE(
             (SELECT json_agg(json_build_object(
               'scopeId', s.id, 'kind', s.kind, 'name', s.name, 'slug', s.slug
             ) ORDER BY sm.bound_at)
             FROM mn_scope_members sm
             JOIN mn_scopes s ON s.id = sm.scope_id
             WHERE sm.meeting_id::text = a.id),
             '[]'::json
           ) AS scope_bindings
         FROM assets a
         WHERE (a.type = 'meeting_note' OR (a.metadata ? 'meeting_kind'))
           AND (
             $2::text = 'all'
             OR ($2::text = 'active'   AND COALESCE((a.metadata->>'archived')::boolean, false) = false)
             OR ($2::text = 'archived' AND COALESCE((a.metadata->>'archived')::boolean, false) = true)
           )
           AND (
             $3::uuid IS NULL
             OR a.workspace_id = $3::uuid
             OR a.workspace_id IN (SELECT id FROM workspaces WHERE is_shared)
           )
         ORDER BY a.created_at DESC
         LIMIT $1`,
          [limit, status, wsId],
        );
        // library-scoped runs (not attached to a specific meeting asset)
        const libR = await engine.deps.db.query(
          `SELECT id, scope_kind, axis, state, created_at, finished_at, error_message, metadata
         FROM mn_runs
         WHERE scope_kind = 'library'
           AND (
             $2::uuid IS NULL
             OR workspace_id = $2::uuid
             OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared)
           )
         ORDER BY created_at DESC LIMIT $1`,
          [Math.min(limit, 20), wsId],
        );

        // Phase 16 · 库列表 mini-stat：count tension / consensus / divergence
        // 单独查 · 表未迁移时静默降级为 0，不影响 /meetings 主响应
        const meetingIds: string[] = (r.rows as any[]).map((row) => String(row.id));
        const counts: Record<string, { tension: number; consensus: number; divergence: number }> = {};
        if (meetingIds.length > 0) {
          const [tensionRes, consensusRes] = await Promise.allSettled([
            engine.deps.db.query(
              `SELECT meeting_id::text AS meeting_id, COUNT(*)::int AS n
                 FROM mn_tensions
                WHERE meeting_id::text = ANY($1::text[])
                GROUP BY meeting_id`,
              [meetingIds],
            ),
            engine.deps.db.query(
              `SELECT meeting_id::text AS meeting_id, kind, COUNT(*)::int AS n
                 FROM mn_consensus_items
                WHERE meeting_id::text = ANY($1::text[])
                  AND kind IN ('consensus', 'divergence')
                GROUP BY meeting_id, kind`,
              [meetingIds],
            ),
          ]);
          const ensure = (id: string) => {
            if (!counts[id]) counts[id] = { tension: 0, consensus: 0, divergence: 0 };
            return counts[id];
          };
          if (tensionRes.status === 'fulfilled') {
            for (const row of (tensionRes.value as any).rows) ensure(String(row.meeting_id)).tension = Number(row.n) || 0;
          }
          if (consensusRes.status === 'fulfilled') {
            for (const row of (consensusRes.value as any).rows) {
              const slot = ensure(String(row.meeting_id));
              if (row.kind === 'consensus') slot.consensus = Number(row.n) || 0;
              else if (row.kind === 'divergence') slot.divergence = Number(row.n) || 0;
            }
          }
        }
        // JSON fallback：metadata.analysis.{tension,consensus} 旧路径写入时
        // 取数组长度填补为 0 的字段；consensus JSON 是合并数组，按 type 字段拆分
        const items = (r.rows as any[]).map((row) => {
          const id = String(row.id);
          const c = counts[id] ?? { tension: 0, consensus: 0, divergence: 0 };
          const analysis = row.metadata?.analysis;
          if (analysis && typeof analysis === 'object') {
            if (c.tension === 0 && Array.isArray(analysis.tension)) c.tension = analysis.tension.length;
            if (c.consensus === 0 && c.divergence === 0 && Array.isArray(analysis.consensus)) {
              for (const it of analysis.consensus) {
                const k = it && typeof it === 'object' ? (it as any).kind ?? (it as any).type : null;
                if (k === 'divergence') c.divergence += 1;
                else c.consensus += 1;
              }
            }
          }
          // metadata 字段对前端无用，剥离回历史响应形状
          const { metadata: _drop, ...rest } = row;
          return { ...rest, tension_count: c.tension, consensus_count: c.consensus, divergence_count: c.divergence };
        });
        return { items, libraryRuns: libR.rows };
      } catch (error) {
        if (isConnectionError(error)) {
          request.log.warn({ err: error }, 'meeting list degraded: database unavailable');
          return { items: [], libraryRuns: [] };
        }
        throw error;
      }
    });

    fastify.post('/meetings', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as { title?: string; meetingKind?: string; metadata?: Record<string, unknown> };
      const meta = { meeting_kind: body.meetingKind ?? 'general', ...(body.metadata ?? {}) };
      const wsId = currentWorkspaceId(request);
      const r = wsId
        ? await engine.deps.db.query(
            `INSERT INTO assets (id, type, title, content, content_type, metadata, workspace_id)
             VALUES (gen_random_uuid(), 'meeting_note', $1, '', 'meeting_note', $2::jsonb, $3)
             RETURNING id, title, created_at, metadata`,
            [body.title ?? 'New Meeting', JSON.stringify(meta), wsId],
          )
        : await engine.deps.db.query(
            `INSERT INTO assets (id, type, title, content, content_type, metadata)
             VALUES (gen_random_uuid(), 'meeting_note', $1, '', 'meeting_note', $2::jsonb)
             RETURNING id, title, created_at, metadata`,
            [body.title ?? 'New Meeting', JSON.stringify(meta)],
          );
      reply.status(201);
      return r.rows[0];
    });

    fastify.put('/meetings/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) {
        reply.status(404);
        return { error: 'Not Found' };
      }
      const body = request.body as { title?: string };
      const nextTitle = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!nextTitle) {
        reply.status(400);
        return { error: 'Bad Request', message: 'title is required' };
      }
      const r = await engine.deps.db.query(
        `UPDATE assets
            SET title = $1,
                updated_at = NOW()
          WHERE id::text = $2::text
          RETURNING id, title, created_at, updated_at`,
        [nextTitle, id],
      );
      if ((r as any).rowCount === 0) {
        reply.status(404);
        return { error: 'Not Found' };
      }
      return r.rows[0];
    });

    // 归档（逻辑删除） · metadata.archived=true + archived_at；列表默认隐藏
    fastify.post('/meetings/:id/archive', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const r = await engine.deps.db.query(
        `UPDATE assets
            SET metadata = COALESCE(metadata, '{}'::jsonb)
                            || jsonb_build_object('archived', true,
                                                  'archived_at', NOW()::text),
                updated_at = NOW()
          WHERE id::text = $1::text
            AND (type = 'meeting_note' OR (metadata ? 'meeting_kind'))
          RETURNING id, title, updated_at`,
        [id],
      );
      if ((r as any).rowCount === 0) { reply.status(404); return { error: 'Not Found' }; }
      return { ...r.rows[0], archived: true };
    });

    // 取消归档 · 移除 archived / archived_at 标记
    fastify.post('/meetings/:id/unarchive', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const r = await engine.deps.db.query(
        `UPDATE assets
            SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'archived' - 'archived_at'),
                updated_at = NOW()
          WHERE id::text = $1::text
            AND (type = 'meeting_note' OR (metadata ? 'meeting_kind'))
          RETURNING id, title, updated_at`,
        [id],
      );
      if ((r as any).rowCount === 0) { reply.status(404); return { error: 'Not Found' }; }
      return { ...r.rows[0], archived: false };
    });

    // 物理删除 · 不可恢复
    // 清理顺序：先 mn_* 表（无 FK 的会成为孤儿，FK CASCADE 表会随 assets 删除自动清理）
    // 表未迁移（42P01）静默跳过；任一步失败但已删除部分仍向前推进，最终 DELETE FROM assets。
    fastify.delete('/meetings/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const probe = await engine.deps.db.query(
        `SELECT id FROM assets
          WHERE id::text = $1::text
            AND (type = 'meeting_note' OR (metadata ? 'meeting_kind'))
          LIMIT 1`,
        [id],
      );
      if ((probe as any).rowCount === 0) { reply.status(404); return { error: 'Not Found' }; }

      const childTables = [
        // 001: scope memberships
        'mn_scope_members',
        // 002: people axis
        'mn_speech_quality', 'mn_silence_signals', 'mn_role_trajectory_points', 'mn_commitments',
        // 003: projects axis
        'mn_decisions', 'mn_assumptions',
        // 004: knowledge axis
        'mn_judgments', 'mn_cognitive_biases', 'mn_counterfactuals', 'mn_evidence_grades',
        'mn_mental_model_invocations',
        // 005: meta axis
        'mn_meeting_necessity', 'mn_decision_quality', 'mn_affect_curve',
        // 010 (FK CASCADE) 也手动删一遍 · 防 FK 缺失或测试库只迁了 010 的状态
        'mn_consensus_items', 'mn_focus_map', 'mn_tensions',
      ];
      for (const t of childTables) {
        try {
          await engine.deps.db.query(`DELETE FROM ${t} WHERE meeting_id::text = $1::text`, [id]);
        } catch (e: any) {
          // 42P01: undefined_table（迁移未跑）→ 跳过
          if (e?.code !== '42P01') {
            request.log.warn({ table: t, err: e }, 'meeting delete: child cleanup failed (continuing)');
          }
        }
      }
      // 兜底：mn_runs 由 scope_kind/scope_id 关联；同步清理本会议挂的 run 记录
      try {
        await engine.deps.db.query(
          `DELETE FROM mn_runs WHERE scope_kind = 'meeting' AND scope_id::text = $1::text`,
          [id],
        );
      } catch (e: any) {
        if (e?.code !== '42P01') {
          request.log.warn({ err: e }, 'meeting delete: mn_runs cleanup failed (continuing)');
        }
      }

      await engine.deps.db.query(`DELETE FROM assets WHERE id::text = $1::text`, [id]);
      return { ok: true };
    });

    // --------------------------------------------------------
    // Parse + axes read (PR3)
    // --------------------------------------------------------
    fastify.post('/ingest/parse', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as { assetId?: string };
      if (!body?.assetId) {
        reply.status(400);
        return { error: 'Bad Request', message: 'assetId is required' };
      }
      const result = await engine.parseMeeting(body.assetId);
      if (!result.ok) reply.status(result.reason === 'asset-not-found' ? 404 : 400);
      return result;
    });

    // 不重跑 LLM 直接基于现有 axes 数据重新合成 ANALYSIS（写入 assets.metadata.analysis）。
    // 用途：fix composeAnalysis 的 schema mapping bug 后无需 5 分钟跑完整 standard run，
    // 也用于 standard run 卡死后单独完成 view A 渲染层。manualOverride 守护仍生效。
    fastify.post('/meetings/:id/recompose-analysis', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) {
        reply.status(400);
        return { error: 'Bad Request', message: 'invalid meeting id' };
      }
      try {
        const { composeAnalysisFromAxes, persistAnalysisToAsset } =
          await import('./runs/composeAnalysis.js');
        const analysis = await composeAnalysisFromAxes(engine.deps.db, id);
        const wrote = await persistAnalysisToAsset(engine.deps.db, id, analysis);
        return {
          ok: true,
          status: wrote,  // 'written' | 'skipped-manual' | 'failed'
          summary: {
            decision: (analysis.summary?.decision ?? '').slice(0, 80),
            actionItems: analysis.summary?.actionItems?.length ?? 0,
            risks: analysis.summary?.risks?.length ?? 0,
            tension: analysis.tension.length,
            newCognition: analysis.newCognition.length,
            focusMap: analysis.focusMap.length,
            consensus: analysis.consensus.length,
            crossView: analysis.crossView.length,
          },
        };
      } catch (e) {
        request.log.warn({ id, err: e }, 'recompose-analysis failed');
        reply.status(500);
        return { ok: false, error: (e as Error).message };
      }
    });

    /**
     * GET /meetings/:id/grep?q=张总&limit=50
     *
     * 跨 mn_*.text 字段做全文搜索（含转写 mn_segments），返回所有命中行 + 所属 axis + 片段。
     * 用途：会议中被称呼但非发言人的角色（张总/刘总等）追踪——这些人没在 mn_people 表，
     * cross-axis 线索查不到他们；这个端点直接用关键词从原始文本里捞出所有相关 axis 行。
     *
     * 返回 schema:
     *   { items: [{ axis, table, id, kind?, snippet, person_id?, person_name? }] }
     * snippet 是 keyword 前后 ~80 字的上下文，已 trim 换行。
     */
    fastify.get('/meetings/:id/grep', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = (request.query as { q?: string; limit?: string }).q?.trim() ?? '';
      const limit = Math.min(200, parseInt((request.query as any).limit ?? '50', 10));
      if (!UUID_RE.test(id)) {
        reply.status(400);
        return { error: 'Bad Request', message: 'invalid meeting id' };
      }
      if (q.length < 1) {
        return { items: [], q };
      }

      const db = engine.deps.db;
      const items: Array<{
        axis: string; table: string; id: string; kind?: string;
        snippet: string; person_id?: string; person_name?: string;
      }> = [];

      // 通用 LIKE pattern；为防 ReDoS / SQL 注入，只用参数绑定 + ILIKE
      const pattern = `%${q}%`;

      const queries: Array<{
        axis: string; table: string; sql: string; mapper: (r: any) => any;
      }> = [
        {
          axis: 'people', table: 'mn_commitments',
          sql: `SELECT c.id, c.text, c.person_id, p.canonical_name AS pname
                  FROM mn_commitments c
                  LEFT JOIN mn_people p ON p.id = c.person_id
                 WHERE c.meeting_id = $1::uuid AND c.text ILIKE $2
                 LIMIT $3`,
          mapper: (r) => ({ kind: 'commitment', text: r.text, person_id: r.person_id, person_name: r.pname }),
        },
        {
          axis: 'projects', table: 'mn_decisions',
          sql: `SELECT d.id, d.title AS text, d.proposer_person_id AS person_id,
                       p.canonical_name AS pname
                  FROM mn_decisions d
                  LEFT JOIN mn_people p ON p.id = d.proposer_person_id
                 WHERE d.meeting_id = $1::uuid AND (d.title ILIKE $2 OR d.rationale ILIKE $2)
                 LIMIT $3`,
          mapper: (r) => ({ kind: 'decision', text: r.text, person_id: r.person_id, person_name: r.pname }),
        },
        {
          axis: 'projects', table: 'mn_assumptions',
          sql: `SELECT id, text FROM mn_assumptions
                 WHERE meeting_id = $1::uuid AND text ILIKE $2 LIMIT $3`,
          mapper: (r) => ({ kind: 'assumption', text: r.text }),
        },
        {
          axis: 'projects', table: 'mn_open_questions',
          sql: `SELECT id, text FROM mn_open_questions
                 WHERE (first_raised_meeting_id = $1::uuid OR last_raised_meeting_id = $1::uuid)
                   AND text ILIKE $2 LIMIT $3`,
          mapper: (r) => ({ kind: 'open_question', text: r.text }),
        },
        {
          axis: 'projects', table: 'mn_risks',
          sql: `SELECT id, text FROM mn_risks
                 WHERE text ILIKE $2
                   AND (scope_id IN (SELECT scope_id FROM mn_scope_members WHERE meeting_id = $1::uuid)
                        OR scope_id IS NULL)
                 LIMIT $3`,
          mapper: (r) => ({ kind: 'risk', text: r.text }),
        },
        {
          axis: 'knowledge', table: 'mn_judgments',
          sql: `SELECT id, text FROM mn_judgments
                 WHERE $1::uuid = ANY(linked_meeting_ids) AND text ILIKE $2 LIMIT $3`,
          mapper: (r) => ({ kind: 'judgment', text: r.text }),
        },
        {
          axis: 'knowledge', table: 'mn_cognitive_biases',
          sql: `SELECT b.id, b.where_excerpt AS text, b.by_person_id AS person_id,
                       p.canonical_name AS pname
                  FROM mn_cognitive_biases b
                  LEFT JOIN mn_people p ON p.id = b.by_person_id
                 WHERE b.meeting_id = $1::uuid AND b.where_excerpt ILIKE $2 LIMIT $3`,
          mapper: (r) => ({ kind: 'cognitive_bias', text: r.text, person_id: r.person_id, person_name: r.pname }),
        },
        {
          axis: 'tension', table: 'mn_tensions',
          sql: `SELECT id, topic AS text, summary FROM mn_tensions
                 WHERE meeting_id = $1::uuid AND (topic ILIKE $2 OR summary ILIKE $2 OR moments::text ILIKE $2)
                 LIMIT $3`,
          mapper: (r) => ({ kind: 'tension', text: r.text + (r.summary ? `：${r.summary}` : '') }),
        },
      ];

      for (const Q of queries) {
        try {
          const r = await db.query(Q.sql, [id, pattern, limit]);
          for (const row of r.rows) {
            const m = Q.mapper(row);
            const text = String(m.text ?? '');
            // 取 keyword 前后 ~80 字做 snippet（保留位置感）
            const idx = text.toLowerCase().indexOf(q.toLowerCase());
            const start = Math.max(0, idx - 40);
            const end = Math.min(text.length, idx + q.length + 80);
            const prefix = start > 0 ? '…' : '';
            const suffix = end < text.length ? '…' : '';
            const snippet = `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
            items.push({
              axis: Q.axis,
              table: Q.table,
              id: String(row.id),
              kind: m.kind,
              snippet,
              person_id: m.person_id,
              person_name: m.person_name,
            });
            if (items.length >= limit) break;
          }
        } catch (e) {
          request.log.warn({ table: Q.table, err: e }, 'grep query failed');
        }
        if (items.length >= limit) break;
      }

      // 兜底：从 assets.metadata.parse_segments.segments 里 grep 原始转写文本
      // 这是 parseMeeting 写入的 1204 段原文，含 speaker / start / text
      // 当 axes 表都 0 命中时，让用户至少能看到原文里"张总/刘总"出现的段落
      if (items.length < limit) {
        try {
          const segRes = await db.query(
            `SELECT metadata->'parse_segments'->'segments' AS segs FROM assets WHERE id = $1`,
            [id],
          );
          const raw = segRes.rows[0]?.segs;
          const segs = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
          const lower = q.toLowerCase();
          let segIdx = 0;
          for (const s of segs) {
            const text = String((s as any)?.text ?? '');
            if (!text) continue;
            const lc = text.toLowerCase();
            if (!lc.includes(lower)) continue;
            const idx = lc.indexOf(lower);
            const start = Math.max(0, idx - 40);
            const end = Math.min(text.length, idx + q.length + 80);
            const prefix = start > 0 ? '…' : '';
            const suffix = end < text.length ? '…' : '';
            const snippet = `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
            items.push({
              axis: 'transcript',
              table: 'metadata.parse_segments',
              id: `seg-${segIdx}`,
              kind: 'segment',
              snippet,
              person_name: typeof (s as any)?.speaker === 'string' ? (s as any).speaker : undefined,
            });
            segIdx++;
            if (items.length >= limit) break;
          }
        } catch (e) {
          request.log.warn({ id, err: e }, 'grep parse_segments fallback failed');
        }
      }

      return { items, q, totalLimit: limit };
    });

    fastify.get('/meetings/:id/axes', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return emptyAxes(id);
      return engine.getMeetingAxes(id);
    });
    // Phase 15.1 · Speech metrics (#6 · 新路由 · 无破坏性)
    fastify.get('/meetings/:id/speech-metrics', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return { items: [] };
      const r = await engine.deps.db.query(
        `SELECT person_id AS "personId",
                entropy_pct AS entropy,
                followed_up_count AS "followedUp",
                qa_ratio AS "qaRatio",
                term_density AS "termDensity"
           FROM mn_speech_quality
          WHERE meeting_id = $1
          ORDER BY quality_score DESC NULLS LAST`,
        [id],
      );
      return { items: r.rows };
    });


    fastify.get('/meetings/:id/detail', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = request.query as { view?: string; source?: string };
      const view = q.view === 'B' || q.view === 'C' ? q.view : 'A';
      // ?source=axes 强制 axes-driven（绕过 storedAnalysis fast-path）；调试 / 对比新生成质量用
      const forceAxes = q.source === 'axes';
      // 非 UUID（demo meeting id）直接返回 null · 让前端 fallback mock
      if (!UUID_RE.test(id)) return { analysis: null };
      try {
        const base = await engine.getMeetingDetail(id, view as 'A' | 'B' | 'C', { forceAxes });
        let payload: Record<string, unknown> = base;
        if (view === 'C') {
          // Phase 15.15 · C view: append consensus (C.2) + focusMap (C.3)
          const db = engine.deps.db;
          const [cRows, fRows] = await Promise.all([
            db.query(
              `SELECT ci.id, ci.kind, ci.item_text AS text, ci.supported_by,
                      COALESCE(
                        json_agg(
                          json_build_object('stance', s.stance, 'reason', s.reason, 'by', s.by_ids)
                          ORDER BY s.seq
                        ) FILTER (WHERE s.id IS NOT NULL),
                        '[]'::json
                      ) AS sides
                 FROM mn_consensus_items ci
                 LEFT JOIN mn_consensus_sides s ON s.item_id = ci.id
                WHERE ci.meeting_id = $1
                GROUP BY ci.id
                ORDER BY ci.seq`,
              [id],
            ),
            db.query(
              `SELECT person_id AS who, themes, returns_to AS "returnsTo"
                 FROM mn_focus_map
                WHERE meeting_id = $1`,
              [id],
            ),
          ]);
          let consensus: any[] = cRows.rows;
          let focusMap: any[] = fRows.rows;

          // 兜底：mn_consensus_items / mn_focus_map 没 axis computer 写入时表永远是空。
          // 读 assets.metadata.analysis（composeAnalysis 已用 mn_assumptions+mn_open_questions
          // 拼出了 consensus，用 mn_speech_quality 拼出了 focusMap），作为 view C 的兜底来源。
          if (consensus.length === 0 || focusMap.length === 0) {
            try {
              const ar = await db.query(
                `SELECT metadata->>'analysis' AS analysis_raw FROM assets WHERE id = $1`,
                [id],
              );
              const raw = ar.rows[0]?.analysis_raw;
              const analysis = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
              if (consensus.length === 0 && Array.isArray(analysis?.consensus)) {
                consensus = analysis.consensus;
              }
              if (focusMap.length === 0 && Array.isArray(analysis?.focusMap)) {
                focusMap = analysis.focusMap;
              }
            } catch (e) {
              request.log.warn({ id, err: e }, 'view-C metadata.analysis fallback failed');
            }
          }

          payload = { ...base, consensus, focusMap };
        }

        // 专家栈 (view B 用):从该 meeting 最新 succeeded run 的 metadata.expertRoles 取 ID,
        // JOIN expert_profiles 拿名字 / 领域 / display_metadata 拼成前端能渲染的卡片数据。
        // 之前前端这块写死 "未透传该数据,留待后续接入" — 这里把它接上。
        try {
          const db = engine.deps.db;
          // 优先取 axis='all' 的 succeeded run（含完整 expertRoles 三角色），
          // 没有时退到任意 succeeded run（避免 axis='tension' 只返回 knowledge 角色）
          const runRes = await db.query(
            `SELECT metadata FROM mn_runs
              WHERE scope_kind = 'meeting' AND scope_id::text = $1 AND state = 'succeeded'
              ORDER BY (axis = 'all') DESC, finished_at DESC NULLS LAST LIMIT 1`,
            [id],
          );
          const meta = runRes.rows[0]?.metadata ?? {};
          // 不兜底：没跑过 run / run 里没 expertRoles → experts 留空，前端显示"未跑过"提示
          const expertRoles = meta?.expertRoles ?? null;
          let experts: any[] = [];
          if (expertRoles && typeof expertRoles === 'object') {
            const ids = Array.from(new Set([
              ...(expertRoles.people ?? []),
              ...(expertRoles.projects ?? []),
              ...(expertRoles.knowledge ?? []),
            ].filter((x: unknown) => typeof x === 'string' && x.length > 0)));
            if (ids.length > 0) {
              const er = await db.query(
                `SELECT expert_id, name, domain, display_metadata, signature_phrases
                   FROM expert_profiles
                  WHERE expert_id = ANY($1::text[]) AND is_active = true`,
                [ids],
              );
              const profileById = new Map<string, any>();
              for (const row of er.rows) profileById.set(String(row.expert_id), row);
              const roleLabel: Record<string, string> = {
                people: '人事/团队', projects: '项目/决策', knowledge: '知识/认知/张力',
              };
              for (const role of ['people', 'projects', 'knowledge'] as const) {
                for (const eid of (expertRoles[role] ?? [])) {
                  const p = profileById.get(String(eid));
                  if (!p) continue;
                  const dm = (typeof p.display_metadata === 'string'
                    ? (() => { try { return JSON.parse(p.display_metadata); } catch { return {}; } })()
                    : (p.display_metadata ?? {})) as Record<string, any>;
                  const profile = (dm.profile ?? {}) as Record<string, any>;
                  const philosophy = (dm.philosophy ?? {}) as Record<string, any>;
                  experts.push({
                    id: p.expert_id,
                    name: p.name,
                    role,
                    roleLabel: roleLabel[role],
                    field: dm.domainName ?? (Array.isArray(p.domain) ? p.domain[0] : p.domain) ?? '',
                    style: profile.personality ?? profile.title ?? '',
                    mentalModels: Array.isArray(philosophy.core) ? philosophy.core.slice(0, 4) : [],
                    signaturePhrases: Array.isArray(p.signature_phrases) ? p.signature_phrases.slice(0, 3) : [],
                    match: 1.0,
                  });
                }
              }
            }
          }
          payload = { ...payload, experts, expertRoles };
        } catch (e) {
          request.log.warn({ id, err: e }, 'detail experts join failed');
          payload = { ...payload, experts: [], expertRoles: null };
        }

        // claude-cli 模式标记：从 assets.metadata.claudeSession 取 sessionId/lastResumedAt/runCount
        // 前端 MeetingDetailShell 顶栏据此显示「By Claude CLI」chip
        try {
          const sr = await engine.deps.db.query(
            `SELECT metadata->'claudeSession' AS claude_session FROM assets WHERE id = $1`,
            [id],
          );
          const cs = sr.rows[0]?.claude_session ?? null;
          payload = { ...payload, claudeSession: cs };
        } catch (e) {
          request.log.warn({ id, err: e }, 'detail claudeSession lookup failed');
          payload = { ...payload, claudeSession: null };
        }

        // 最近一次 meeting run 来源（mode + model）：
        // 供 /meeting/:id/b 顶栏展示模式标签，并在 hover 中显示模型名。
        try {
          const rr = await engine.deps.db.query(
            `SELECT id::text AS id, state,
                    COALESCE(metadata->>'mode', 'multi-axis') AS mode
               FROM mn_runs
              WHERE scope_kind = 'meeting'
                AND scope_id::text = $1
              ORDER BY COALESCE(started_at, created_at) DESC
              LIMIT 1`,
            [id],
          );
          const row = rr.rows[0];
          if (!row) {
            payload = { ...payload, runSource: null };
          } else {
            const rawMode = String(row.mode || 'multi-axis');
            const mode: 'multi-axis' | 'claude-cli' | 'api-oneshot' =
              rawMode === 'claude-cli' ? 'claude-cli'
              : rawMode === 'api-oneshot' ? 'api-oneshot'
              : 'multi-axis';
            payload = {
              ...payload,
              runSource: {
                runId: row.id,
                state: row.state,
                mode,
                modelName: getMeetingRunModelHint(mode),
              },
            };
          }
        } catch (e) {
          request.log.warn({ id, err: e }, 'detail runSource lookup failed');
          payload = { ...payload, runSource: null };
        }

        // 包一层 { analysis } 让 VariantEditorial/Workbench/Threads 的
        // `data?.analysis` 探针生效；具体字段（summary/tension/...）按
        // 前端 ANALYSIS 形态映射，缺失字段在前端 fallback 到 mock
        return { analysis: payload };
      } catch (e) {
        request.log.warn({ id, view, err: e }, 'getMeetingDetail failed → fallback');
        // 失败时也返 null analysis · 让前端走 mock，避免 500 让用户看不到任何内容
        return { analysis: null };
      }
    });

    fastify.post('/compute/axis', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as any;
      if (!body?.axis) { reply.status(400); return { error: 'Bad Request', message: 'axis is required' }; }
      return engine.computeAxis({
        meetingId: body.meetingId,
        scope: body.scope,
        axis: body.axis,
        subDims: body.subDims,
        replaceExisting: body.replaceExisting,
      });
    });

    // --------------------------------------------------------
    // Scopes CRUD (PR4)
    // --------------------------------------------------------
    fastify.get('/scopes', { preHandler: authenticate }, async (request) => {
      const q = request.query as { kind?: string; status?: string };
      try {
        return {
          items: await engine.scopes.list({
            kind: q.kind as any,
            status: q.status as any,
            workspaceId: currentWorkspaceId(request) ?? undefined,
          }),
        };
      } catch (error) {
        if (isConnectionError(error)) {
          request.log.warn({ err: error }, 'scopes list degraded: database unavailable');
          return { items: [] };
        }
        throw error;
      }
    });

    fastify.get('/scopes/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const scope = await engine.scopes.getById(id);
      if (!scope) { reply.status(404); return { error: 'Not Found' }; }
      return scope;
    });

    fastify.post('/scopes', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as any;
      if (!body?.kind || !body?.slug || !body?.name) {
        reply.status(400);
        return { error: 'Bad Request', message: 'kind, slug, name are required' };
      }
      const created = await engine.scopes.create({
        kind: body.kind,
        slug: body.slug,
        name: body.name,
        status: body.status,
        stewardPersonIds: body.stewardPersonIds,
        description: body.description,
        metadata: body.metadata,
        workspaceId: currentWorkspaceId(request) ?? undefined,
      });
      reply.status(201);
      return created;
    });

    fastify.put('/scopes/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const updated = await engine.scopes.update(id, {
        name: body.name,
        status: body.status,
        stewardPersonIds: body.stewardPersonIds,
        description: body.description,
        metadata: body.metadata,
      });
      if (!updated) { reply.status(404); return { error: 'Not Found' }; }
      return updated;
    });

    fastify.delete('/scopes/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await engine.scopes.delete(id);
      if (!ok) { reply.status(404); return { error: 'Not Found' }; }
      return { success: true };
    });

    // Scope membership
    fastify.post('/scopes/:id/bindings', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { meetingId?: string; reason?: string };
      if (!body?.meetingId) {
        reply.status(400);
        return { error: 'Bad Request', message: 'meetingId is required' };
      }
      await engine.scopes.bindMeeting(id, body.meetingId, { reason: body.reason });
      return { success: true };
    });

    fastify.delete('/scopes/:id/bindings/:meetingId', { preHandler: authenticate }, async (request, reply) => {
      const { id, meetingId } = request.params as { id: string; meetingId: string };
      const ok = await engine.scopes.unbindMeeting(id, meetingId);
      if (!ok) { reply.status(404); return { error: 'Not Found' }; }
      return { success: true };
    });

    fastify.get('/scopes/:id/meetings', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      return { meetingIds: await engine.scopes.listMeetings(id) };
    });

    /**
     * GET /scopes/:id/role-trajectory
     *   返回 scope 下每人按时间排序的角色演化点。供 AxisPeople · 角色画像演化 tab 渲染
     *   多场会议的"漂移"——和 mock 的 `roleTrajectory: [{role, m: 'YYYY-MM'}, ...]` 同形。
     */
    fastify.get('/scopes/:id/role-trajectory', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      const r = await engine.deps.db.query(
        `WITH meets AS (
           SELECT meeting_id::uuid AS mid FROM mn_scope_members WHERE scope_id = $1
         ),
         pts AS (
           SELECT t.person_id, t.meeting_id, t.role_label, t.confidence,
                  COALESCE(a.metadata->>'occurred_at', a.metadata->'analysis'->>'date', t.detected_at::text) AS occurred_at,
                  COALESCE(a.title, a.metadata->>'title', '会议') AS meeting_title
             FROM mn_role_trajectory_points t
             JOIN assets a ON a.id = t.meeting_id::text
            WHERE t.meeting_id IN (SELECT mid FROM meets)
         )
         SELECT p.id          AS person_id,
                p.canonical_name,
                p.role,
                p.org,
                COALESCE(
                  jsonb_agg(jsonb_build_object(
                    'meeting_id',    pts.meeting_id,
                    'meeting_title', pts.meeting_title,
                    'occurred_at',   pts.occurred_at,
                    'role_label',    pts.role_label,
                    'confidence',    pts.confidence
                  ) ORDER BY pts.occurred_at) FILTER (WHERE pts.person_id IS NOT NULL),
                  '[]'::jsonb
                ) AS points
           FROM mn_people p
           JOIN pts ON pts.person_id = p.id
          GROUP BY p.id, p.canonical_name, p.role, p.org
          ORDER BY p.canonical_name`,
        [uuid],
      );
      return { items: r.rows };
    });

    // ============================================================
    // F11 · 人物管理 · 改名 + alias 历史映射
    // ============================================================

    /** GET /scopes/:id/people · 列出该 scope 下所有出现过的人物（按相关 mn_* 反查） */
    fastify.get('/scopes/:id/people', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      // 通过 mn_scope_members 找会议，再回看 mn_commitments / mn_speech_quality /
      // mn_role_trajectory_points 涉及的 person_id 全集
      const r = await engine.deps.db.query(
        `WITH meets AS (
           SELECT meeting_id::uuid AS mid FROM mn_scope_members WHERE scope_id = $1
         ),
         pids AS (
           SELECT person_id FROM mn_commitments WHERE meeting_id IN (SELECT mid FROM meets)
           UNION
           SELECT person_id FROM mn_speech_quality WHERE meeting_id IN (SELECT mid FROM meets)
           UNION
           SELECT person_id FROM mn_role_trajectory_points WHERE meeting_id IN (SELECT mid FROM meets)
           UNION
           SELECT person_id FROM mn_silence_signals WHERE meeting_id IN (SELECT mid FROM meets)
         )
         SELECT p.id, p.canonical_name, p.aliases, p.role, p.org, p.created_at, p.updated_at,
                (SELECT COUNT(*)::int FROM mn_commitments WHERE person_id = p.id
                  AND meeting_id IN (SELECT mid FROM meets)) AS commitment_count
           FROM mn_people p
          WHERE p.id IN (SELECT person_id FROM pids WHERE person_id IS NOT NULL)
          ORDER BY p.canonical_name`,
        [uuid],
      );
      return { items: r.rows };
    });

    /** GET /people/:id · 单人详情（含 aliases） */
    fastify.get('/people/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const r = await engine.deps.db.query(
        `SELECT id, canonical_name, aliases, role, org, metadata, created_at, updated_at
           FROM mn_people WHERE id = $1`,
        [id],
      );
      if (r.rows.length === 0) { reply.status(404); return { error: 'Not Found' }; }
      return r.rows[0];
    });

    /**
     * POST /people/:id/merge · 合并两个人物（F11.1）
     * Body: { fromId, dryRun? }
     *
     * 把 fromId 合并到 :id（target 胜出）：所有 11 张表的 person_id 引用 reassign，
     * fromId 的 canonical_name + aliases 全部并入 target.aliases，最后 DELETE fromId。
     * UNIQUE 冲突（mn_role_trajectory_points / mn_speech_quality / mn_silence_signals）
     * 由 plpgsql 函数 mn_merge_people 处理：先 DELETE 源的对撞行（target 版本胜出），
     * 再 UPDATE 剩余。整个操作原子（PG 函数体隐式 transactional）。
     *
     * dryRun=true 时只返回 fromId 在各表的引用计数 + 合并后 aliases 预览，不真改。
     */
    fastify.post('/people/:id/merge', { preHandler: authenticate }, async (request, reply) => {
      const { id: targetId } = request.params as { id: string };
      const body = (request.body ?? {}) as { fromId?: string; dryRun?: boolean };
      const fromId = body.fromId;
      if (!UUID_RE.test(targetId) || !fromId || !UUID_RE.test(fromId)) {
        reply.status(400);
        return { error: 'Bad Request', code: 'INVALID_ID', message: 'targetId / fromId 都需要是 UUID' };
      }
      if (targetId === fromId) {
        reply.status(400);
        return { error: 'Bad Request', code: 'SAME_ID', message: '不能合并到自己' };
      }
      const both = await engine.deps.db.query(
        `SELECT id, canonical_name, aliases FROM mn_people WHERE id = ANY($1::uuid[])`,
        [[targetId, fromId]],
      );
      if (both.rows.length !== 2) {
        reply.status(404);
        return { error: 'Not Found', code: 'PERSON_NOT_FOUND', message: 'target 或 source 不存在' };
      }
      const target = both.rows.find((r: any) => r.id === targetId);
      const source = both.rows.find((r: any) => r.id === fromId);

      if (body.dryRun) {
        const refs = await engine.deps.db.query(
          `SELECT 'mn_commitments' AS t, count(*)::int AS n FROM mn_commitments WHERE person_id = $1
           UNION ALL SELECT 'mn_role_trajectory_points', count(*)::int FROM mn_role_trajectory_points WHERE person_id = $1
           UNION ALL SELECT 'mn_speech_quality', count(*)::int FROM mn_speech_quality WHERE person_id = $1
           UNION ALL SELECT 'mn_silence_signals', count(*)::int FROM mn_silence_signals WHERE person_id = $1
           UNION ALL SELECT 'mn_decisions', count(*)::int FROM mn_decisions WHERE proposer_person_id = $1
           UNION ALL SELECT 'mn_assumptions', count(*)::int FROM mn_assumptions WHERE verifier_person_id = $1
           UNION ALL SELECT 'mn_open_questions', count(*)::int FROM mn_open_questions WHERE owner_person_id = $1
           UNION ALL SELECT 'mn_judgments', count(*)::int FROM mn_judgments WHERE author_person_id = $1
           UNION ALL SELECT 'mn_mental_model_invocations', count(*)::int FROM mn_mental_model_invocations WHERE invoked_by_person_id = $1
           UNION ALL SELECT 'mn_cognitive_biases', count(*)::int FROM mn_cognitive_biases WHERE by_person_id = $1
           UNION ALL SELECT 'mn_counterfactuals', count(*)::int FROM mn_counterfactuals WHERE rejected_by_person_id = $1
           ORDER BY 1`,
          [fromId],
        );
        const previewAliases = Array.from(new Set([
          ...(target.aliases ?? []),
          source.canonical_name,
          ...(source.aliases ?? []),
        ])).filter((a: string) => a && a !== target.canonical_name);
        return {
          dryRun: true,
          target: { id: target.id, canonical_name: target.canonical_name },
          source: { id: source.id, canonical_name: source.canonical_name },
          refs: refs.rows.filter((r: any) => r.n > 0),
          previewMergedAliases: previewAliases,
        };
      }

      try {
        const r = await engine.deps.db.query(
          `SELECT * FROM mn_merge_people($1::uuid, $2::uuid)`,
          [targetId, fromId],
        );
        const after = await engine.deps.db.query(
          `SELECT id, canonical_name, aliases, updated_at FROM mn_people WHERE id = $1`,
          [targetId],
        );
        return {
          ok: true,
          target: after.rows[0],
          source: { id: source.id, canonical_name: source.canonical_name, deleted: true },
          affected: r.rows,
        };
      } catch (e: any) {
        request.log.error({ err: e, targetId, fromId }, 'mn_merge_people failed');
        reply.status(500);
        return {
          error: 'Internal Server Error',
          code: 'MERGE_FAILED',
          message: `合并失败：${e?.message ?? String(e)}`,
        };
      }
    });

    /**
     * PUT /people/:id · 改名
     * Body: { canonical_name, role?, org? }
     *
     * 改名时自动把旧 canonical_name 入 aliases[]（如果还没在），新名字若在
     * aliases 里则同步移除（保持互斥）。aliases 用 PG array 操作做幂等。
     * 之后 ensurePersonByName 查时会用 `OR $1 = ANY(aliases)` 同时匹配旧名 →
     * LLM 抽取转写里出现旧名时仍能 dedup 到同一行。
     */
    fastify.put('/people/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const body = (request.body ?? {}) as { canonical_name?: string; role?: string; org?: string };
      const newName = (body.canonical_name ?? '').trim();
      if (!newName) {
        reply.status(400);
        return { error: 'Bad Request', code: 'CANONICAL_NAME_REQUIRED', message: 'canonical_name 必填且非空' };
      }
      // 取旧记录
      const cur = await engine.deps.db.query(
        `SELECT canonical_name, aliases, role, org FROM mn_people WHERE id = $1`,
        [id],
      );
      if (cur.rows.length === 0) { reply.status(404); return { error: 'Not Found' }; }
      const oldName = cur.rows[0].canonical_name as string;
      const oldAliases: string[] = Array.isArray(cur.rows[0].aliases) ? cur.rows[0].aliases : [];

      // 没改名 → no-op
      if (newName === oldName) {
        return { id, canonical_name: oldName, aliases: oldAliases, changed: false };
      }

      // 检查新 canonical 是否与"另一个人"冲突 (UNIQUE canonical_name + org)
      const targetOrg = body.org ?? cur.rows[0].org ?? null;
      const conflict = await engine.deps.db.query(
        `SELECT id FROM mn_people
          WHERE id <> $1
            AND canonical_name = $2
            AND COALESCE(org, '') = COALESCE($3, '')
          LIMIT 1`,
        [id, newName, targetOrg],
      );
      if (conflict.rows.length > 0) {
        reply.status(409);
        return {
          error: 'Conflict',
          code: 'CANONICAL_NAME_CONFLICT',
          message: `已有同名人物 (canonical_name='${newName}', org='${targetOrg ?? ''}'). 若是同一个人请合并而非改名。`,
          conflictPersonId: conflict.rows[0].id,
        };
      }

      // 计算新 aliases：
      //  - 旧名 push 进去（如不在）
      //  - 新名如果之前在 aliases 里则移除
      const newAliases = Array.from(new Set([...oldAliases, oldName])).filter((a) => a !== newName);

      const upd = await engine.deps.db.query(
        `UPDATE mn_people
            SET canonical_name = $2,
                aliases = $3::text[],
                role = COALESCE($4, role),
                org = COALESCE($5, org),
                updated_at = NOW()
          WHERE id = $1
       RETURNING id, canonical_name, aliases, role, org`,
        [id, newName, newAliases, body.role ?? null, targetOrg],
      );
      return {
        ...upd.rows[0],
        changed: true,
        previousName: oldName,
      };
    });

    // --------------------------------------------------------
    // Phase 15.8 · AxisProjects data routes (decisions / assumptions / open-questions / risks)
    // --------------------------------------------------------
    fastify.get('/scopes/:id/decisions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      try {
        const uuid = await resolveScopeUuid(engine.deps.db, id);
        if (!uuid) return { items: [] };
        const r = await engine.deps.db.query(
          `SELECT d.id, d.meeting_id, d.title, d.proposer_person_id,
                d.based_on_ids, d.superseded_by_id, d.confidence, d.is_current, d.rationale,
                d.created_at,
                p.canonical_name AS proposer_name
           FROM mn_decisions d
           LEFT JOIN mn_people p ON p.id = d.proposer_person_id
          WHERE d.scope_id = $1
          ORDER BY d.created_at ASC`,
          [uuid],
        );
        return { items: r.rows };
      } catch (error) {
        if (isConnectionError(error)) {
          request.log.warn({ scopeId: id, err: error }, 'decisions degraded: database unavailable');
          return { items: [] };
        }
        throw error;
      }
    });

    fastify.get('/scopes/:id/assumptions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      const r = await engine.deps.db.query(
        `SELECT a.id, a.meeting_id, a.text, a.evidence_grade, a.verification_state,
                a.verifier_person_id, a.due_at, a.underpins_decision_ids,
                a.confidence, a.created_at, a.updated_at,
                p.canonical_name AS verifier_name
           FROM mn_assumptions a
           LEFT JOIN mn_people p ON p.id = a.verifier_person_id
          WHERE a.scope_id = $1
          ORDER BY a.created_at DESC`,
        [uuid],
      );
      return { items: r.rows };
    });

    fastify.get('/scopes/:id/open-questions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      const q = request.query as { status?: string; category?: string };
      const conds: string[] = ['scope_id = $1'];
      const args: unknown[] = [uuid];
      if (q.status)   { conds.push(`status = $${args.length + 1}`);   args.push(q.status); }
      if (q.category) { conds.push(`category = $${args.length + 1}`); args.push(q.category); }
      const r = await engine.deps.db.query(
        `SELECT oq.id, oq.text, oq.category, oq.status, oq.times_raised,
                oq.first_raised_meeting_id, oq.last_raised_meeting_id,
                oq.owner_person_id, oq.due_at, oq.metadata, oq.created_at,
                p.canonical_name AS owner_name
           FROM mn_open_questions oq
           LEFT JOIN mn_people p ON p.id = oq.owner_person_id
          WHERE ${conds.join(' AND ')}
          ORDER BY oq.times_raised DESC, oq.created_at DESC`,
        args,
      );
      return { items: r.rows };
    });

    fastify.get('/scopes/:id/risks', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      const r = await engine.deps.db.query(
        `SELECT id, text, severity, mention_count, heat_score, trend,
                action_taken, metadata, created_at, updated_at
           FROM mn_risks
          WHERE scope_id = $1
          ORDER BY heat_score DESC, mention_count DESC`,
        [uuid],
      );
      return { items: r.rows };
    });

    // Phase 15.11 · AxisMeta · Necessity audit (mn_meeting_necessity)
    fastify.get('/meetings/:id/necessity-audit', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return null;
      const r = await engine.deps.db.query(
        `SELECT meeting_id, verdict, suggested_duration_min, reasons, computed_at
           FROM mn_meeting_necessity
          WHERE meeting_id = $1`,
        [id],
      );
      if (r.rows.length === 0) return null;
      return r.rows[0];
    });

    // Phase 15.2 · AxisMeta · Decision quality (mn_decision_quality)
    fastify.get('/meetings/:id/decision-quality', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return null;
      const r = await engine.deps.db.query(
        `SELECT meeting_id, overall, clarity, actionable, traceable, falsifiable, aligned, notes, computed_at
           FROM mn_decision_quality
          WHERE meeting_id = $1`,
        [id],
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0];
      const notes = (row.notes ?? {}) as Record<string, string>;
      // 转换为前端期望的 { overall, dims: [{id, label, score, note}] } 形态
      const dimMeta: Array<{ id: 'clarity' | 'actionable' | 'traceable' | 'falsifiable' | 'aligned'; label: string }> = [
        { id: 'clarity',     label: '清晰度' },
        { id: 'actionable',  label: '可执行' },
        { id: 'traceable',   label: '可追溯' },
        { id: 'falsifiable', label: '可证伪' },
        { id: 'aligned',     label: '对齐度' },
      ];
      return {
        overall: Number(row.overall ?? 0),
        dims: dimMeta.map(({ id: dimId, label }) => ({
          id: dimId,
          label,
          score: Number(row[dimId] ?? 0),
          note: notes[String(dimId)] ?? '',
        })),
        teamAvg: null,
        computedAt: row.computed_at,
      };
    });

    // Phase 15.12 · AxisPeople · Silence signals (mn_silence_signals)
    fastify.get('/meetings/:id/silence', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return { items: [] };
      const q = request.query as { personId?: string };
      const conds: string[] = ['s.meeting_id = $1'];
      const args: unknown[] = [id];
      if (q.personId) { conds.push(`s.person_id = $${args.length + 1}`); args.push(q.personId); }
      const r = await engine.deps.db.query(
        `SELECT s.id, s.meeting_id, s.person_id, s.topic_id, s.state,
                s.prior_topics_spoken, s.anomaly_score, s.computed_at,
                p.canonical_name AS person_name
           FROM mn_silence_signals s
           LEFT JOIN mn_people p ON p.id = s.person_id
          WHERE ${conds.join(' AND ')}
          ORDER BY s.anomaly_score DESC`,
        args,
      );
      return { items: r.rows };
    });

    // Phase 15.13 · AxisKnowledge · Biases (mn_cognitive_biases)
    fastify.get('/meetings/:id/biases', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return { items: [] };
      const r = await engine.deps.db.query(
        `SELECT b.id, b.meeting_id, b.bias_type, b.where_excerpt, b.by_person_id,
                b.severity, b.mitigated, b.mitigation_strategy, b.created_at,
                p.canonical_name AS by_person_name
           FROM mn_cognitive_biases b
           LEFT JOIN mn_people p ON p.id = b.by_person_id
          WHERE b.meeting_id = $1
          ORDER BY CASE b.severity WHEN 'high' THEN 3 WHEN 'med' THEN 2 ELSE 1 END DESC,
                   b.created_at DESC`,
        [id],
      );
      return { items: r.rows };
    });

    // Phase 15.14 · AxisMeta · Emotion curve (mn_affect_curve)
    fastify.get('/meetings/:id/emotion-curve', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return null;
      const r = await engine.deps.db.query(
        `SELECT meeting_id, samples, tension_peaks, insight_points, computed_at
           FROM mn_affect_curve
          WHERE meeting_id = $1`,
        [id],
      );
      if (r.rows.length === 0) return null;
      return r.rows[0];
    });

    // Phase 15.15 · C.1 · Tensions (mn_tensions + mn_tension_moments)
    fastify.get('/meetings/:id/tensions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return { items: [] };
      const r = await engine.deps.db.query(
        `SELECT t.id, t.tension_key, t.between_ids, t.topic, t.intensity, t.summary,
                COALESCE(
                  json_agg(
                    json_build_object('who', m.person_id::text, 'text', m.quote)
                    ORDER BY m.seq
                  ) FILTER (WHERE m.id IS NOT NULL),
                  '[]'::json
                ) AS moments
           FROM mn_tensions t
           LEFT JOIN mn_tension_moments m ON m.tension_id = t.id
          WHERE t.meeting_id = $1
          GROUP BY t.id
          ORDER BY t.intensity DESC`,
        [id],
      );
      return { items: r.rows };
    });

    // Phase 15.10 · AxisKnowledge · Judgments (mn_judgments) + Mental Model Hit Rate (mn_mental_model_hit_stats)
    fastify.get('/scopes/:id/judgments', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      // judgments 本身无 scope_id 字段；通过 linked_meeting_ids ∩ scope bindings 筛
      const r = await engine.deps.db.query(
        `SELECT j.id, j.text, j.abstracted_from_meeting_id, j.author_person_id,
                j.domain, j.generality_score, j.reuse_count, j.linked_meeting_ids,
                j.created_at, j.updated_at,
                p.canonical_name AS author_name
           FROM mn_judgments j
           LEFT JOIN mn_people p ON p.id = j.author_person_id
          WHERE j.linked_meeting_ids && ARRAY(
                  SELECT meeting_id::uuid FROM mn_scope_members WHERE scope_id = $1
                )
             OR j.abstracted_from_meeting_id IN (
                  SELECT meeting_id::uuid FROM mn_scope_members WHERE scope_id = $1
                )
          ORDER BY j.reuse_count DESC, j.generality_score DESC`,
                [uuid],
      );
      return { items: r.rows };
    });

    fastify.get('/scopes/:id/mental-models/hit-rate', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [] };
      const r = await engine.deps.db.query(
        `SELECT id, model_name, invocations, hits, hit_rate, trend_30d, flag,
                computed_at
           FROM mn_mental_model_hit_stats
          WHERE scope_id = $1
          ORDER BY hit_rate DESC, invocations DESC`,
        [uuid],
      );
      return { items: r.rows };
    });

    // Phase 15.9 · AxisPeople · Commitments (mn_commitments)
    fastify.get('/scopes/:id/commitments', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      try {
        const uuid = await resolveScopeUuid(engine.deps.db, id);
        if (!uuid) return { items: [] };
        const q = request.query as { personId?: string; state?: string };
        const conds: string[] = [
          `c.meeting_id IN (SELECT meeting_id::uuid FROM mn_scope_members WHERE scope_id = $1)`,
        ];
        const args: unknown[] = [uuid];
        if (q.personId) { conds.push(`c.person_id = $${args.length + 1}`); args.push(q.personId); }
        if (q.state)    { conds.push(`c.state = $${args.length + 1}`);     args.push(q.state); }
        const r = await engine.deps.db.query(
          `SELECT c.id, c.meeting_id, c.person_id, c.text, c.due_at,
                c.state, c.progress, c.evidence_refs, c.created_at, c.updated_at,
                p.canonical_name AS person_name
           FROM mn_commitments c
           LEFT JOIN mn_people p ON p.id = c.person_id
          WHERE ${conds.join(' AND ')}
          ORDER BY c.created_at DESC`,
          args,
        );
        return { items: r.rows };
      } catch (error) {
        if (isConnectionError(error)) {
          request.log.warn({ scopeId: id, err: error }, 'commitments degraded: database unavailable');
          return { items: [] };
        }
        throw error;
      }
    });

    // Provenance chain · 从一个 decision 往回追 N 层 based_on_ids
    fastify.get('/scopes/:id/provenance', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const uuid = await resolveScopeUuid(engine.deps.db, id);
      if (!uuid) return { items: [], chain: [] };
      const q = request.query as { decisionId?: string; depth?: string };
      if (!q.decisionId) return { items: [], chain: [] };
      const maxDepth = Math.min(20, Math.max(1, parseInt(q.depth ?? '6', 10)));
      const r = await engine.deps.db.query(
        `WITH RECURSIVE chain AS (
           SELECT d.id, d.title, d.meeting_id, d.based_on_ids, d.proposer_person_id,
                  d.confidence, d.created_at, 0 AS depth
             FROM mn_decisions d
            WHERE d.id = $1 AND d.scope_id = $2
           UNION ALL
           SELECT d2.id, d2.title, d2.meeting_id, d2.based_on_ids, d2.proposer_person_id,
                  d2.confidence, d2.created_at, c.depth + 1
             FROM mn_decisions d2
             JOIN chain c ON d2.id = ANY(c.based_on_ids)
            WHERE c.depth < $3
         )
         SELECT DISTINCT ON (id) id, title, meeting_id, based_on_ids, proposer_person_id,
                confidence, created_at, depth
           FROM chain
          ORDER BY id, depth`,
        [q.decisionId, uuid, maxDepth],
      );
      return { decisionId: q.decisionId, chain: r.rows };
    });

    // --------------------------------------------------------
    // Schedules (Phase 15.7) — cron 配置 · GenerationCenter · ScheduleView
    // --------------------------------------------------------
    fastify.get('/schedules', { preHandler: authenticate }, async (request) => {
      const q = request.query as { scopeId?: string; scopeKind?: string; axis?: string };
      const conds: string[] = [];
      const args: unknown[] = [];
      const wsId = currentWorkspaceId(request);
      if (wsId) {
        args.push(wsId);
        conds.push(`(workspace_id = $${args.length} OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`);
      }
      if (q.scopeKind) { args.push(q.scopeKind); conds.push(`scope_kind = $${args.length}`); }
      if (q.scopeId && UUID_RE.test(q.scopeId)) { args.push(q.scopeId); conds.push(`scope_id = $${args.length}`); }
      if (q.axis) { args.push(q.axis); conds.push(`axis = $${args.length}`); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const r = await engine.deps.db.query(
        `SELECT id, name, cron, on_state AS on, scope_kind AS "scopeKind", scope_id AS "scopeId",
                axis, preset, next_run_at AS next, last_run_at AS "lastRunAt", last_run_id AS "lastRunId",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM mn_schedules ${where}
          ORDER BY created_at DESC`,
        args,
      );
      return { items: r.rows };
    });

    fastify.post('/schedules', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as {
        name?: string; cron?: string; scopeKind?: string; scopeId?: string;
        axis?: string; preset?: string; on?: boolean;
      };
      if (!body?.name || !body.name.trim()) {
        reply.status(400);
        return { error: 'Bad Request', message: 'name is required' };
      }
      const scopeId = body.scopeId && UUID_RE.test(body.scopeId) ? body.scopeId : null;
      const wsId = currentWorkspaceId(request);
      const r = wsId
        ? await engine.deps.db.query(
            `INSERT INTO mn_schedules (name, cron, on_state, scope_kind, scope_id, axis, preset, workspace_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              body.name.trim(),
              body.cron ?? null,
              body.on !== false,
              body.scopeKind ?? null,
              scopeId,
              body.axis ?? null,
              body.preset ?? 'standard',
              wsId,
            ],
          )
        : await engine.deps.db.query(
            `INSERT INTO mn_schedules (name, cron, on_state, scope_kind, scope_id, axis, preset)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              body.name.trim(),
              body.cron ?? null,
              body.on !== false,
              body.scopeKind ?? null,
              scopeId,
              body.axis ?? null,
              body.preset ?? 'standard',
            ],
          );
      return { id: r.rows[0].id, ok: true };
    });

    fastify.put('/schedules/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const body = request.body as Record<string, unknown>;
      const cols: string[] = [];
      const args: unknown[] = [];
      const allowed: Record<string, string> = {
        name: 'name', cron: 'cron', on: 'on_state', scopeKind: 'scope_kind',
        scopeId: 'scope_id', axis: 'axis', preset: 'preset',
      };
      for (const [k, dbCol] of Object.entries(allowed)) {
        if (k in body) {
          let v = body[k];
          if (k === 'scopeId' && typeof v === 'string' && !UUID_RE.test(v)) v = null;
          args.push(v);
          cols.push(`${dbCol} = $${args.length}`);
        }
      }
      if (cols.length === 0) return { ok: true };
      cols.push('updated_at = NOW()');
      args.push(id);
      const r = await engine.deps.db.query(
        `UPDATE mn_schedules SET ${cols.join(', ')} WHERE id = $${args.length} RETURNING id`,
        args,
      );
      if ((r as any).rowCount === 0) { reply.status(404); return { error: 'Not Found' }; }
      return { ok: true };
    });

    fastify.delete('/schedules/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) { reply.status(404); return { error: 'Not Found' }; }
      const r = await engine.deps.db.query(
        `DELETE FROM mn_schedules WHERE id = $1`,
        [id],
      );
      if ((r as any).rowCount === 0) { reply.status(404); return { error: 'Not Found' }; }
      return { ok: true };
    });

    // --------------------------------------------------------
    // Runs (PR4)
    // --------------------------------------------------------
    fastify.post('/runs', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as any;
      if (!body?.scope || !body?.axis) {
        reply.status(400);
        return { error: 'Bad Request', message: 'scope and axis are required' };
      }
      let scope = body.scope as { kind?: string; id?: string };
      const allowedKinds = new Set(['library', 'project', 'client', 'topic', 'meeting']);
      if (scope?.kind === 'scope' && scope?.id) {
        const r = await engine.deps.db.query(
          `SELECT id, kind
             FROM mn_scopes
            WHERE id::text = $1::text OR slug::text = $1::text
            LIMIT 1`,
          [scope.id],
        );
        if (r.rows[0]) {
          scope = { kind: r.rows[0].kind, id: r.rows[0].id };
        } else {
          reply.status(400);
          return { error: 'Bad Request', message: `unknown scope: ${scope.id}` };
        }
      } else if (
        scope?.id
        && scope.kind
        && ['project', 'client', 'topic'].includes(scope.kind)
        && !UUID_RE.test(scope.id)
      ) {
        const uuid = await resolveScopeUuid(engine.deps.db, scope.id);
        if (uuid) {
          scope = { ...scope, id: uuid };
        } else {
          reply.status(400);
          return { error: 'Bad Request', message: `unknown scope: ${scope.id}` };
        }
      }
      if (!scope?.kind || !allowedKinds.has(scope.kind)) {
        reply.status(400);
        return { error: 'Bad Request', message: `invalid scope kind: ${scope?.kind ?? 'unknown'}` };
      }
      const normalizedScope: { kind: string; id?: string } = { kind: scope.kind, id: scope.id };

      // ============================================================
      // P1 前置闸门：拦下 silent-succeeded 空跑（详情见 docs/plans/P1-precheck-gates.md）
      // ============================================================

      // Gate 1: project / client / topic 必须传 scope.id（meeting/library 例外）
      if (['project', 'client', 'topic'].includes(scope.kind) && !scope.id) {
        reply.status(400);
        return {
          error: 'Bad Request',
          code: 'SCOPE_ID_REQUIRED',
          message: `scope.id required for kind=${scope.kind}; otherwise we can't resolve which meetings to compute over`,
        };
      }

      // Gate 4: subDims 必须能映射到 computer（避免短 id 跑成 silent-succeeded 0 行）
      if (Array.isArray(body.subDims) && body.subDims.length > 0 && body.axis !== 'all') {
        const validSubDims = AXIS_SUBDIMS[body.axis] ?? [];
        const invalid = body.subDims.filter((sd: unknown) => typeof sd !== 'string' || !validSubDims.includes(sd as string));
        if (invalid.length > 0) {
          reply.status(400);
          return {
            error: 'Bad Request',
            code: 'UNKNOWN_SUBDIMS',
            message: `subDims 含未注册项: ${invalid.join(', ')}. 合法值: ${validSubDims.join(', ')}.`,
            detail: { invalid, valid: validSubDims },
          };
        }
      }

      // Gate 2: 解析 scope 下的 meetings；project/client/topic 为 0 则拒
      const meetingIds = await collectMeetingsInScope(engine.deps.db, normalizedScope);
      if (meetingIds.length === 0 && scope.kind !== 'library') {
        reply.status(400);
        return {
          error: 'Bad Request',
          code: 'EMPTY_SCOPE',
          message: '该 scope 下没有任何会议绑定。请先到会议库绑定会议。',
        };
      }

      // Gate 3: transcript 总字数充足（library/project/meeting 都校验）
      // 跳过的场景：scope.kind=library 但全库为空（不太可能，且让用户能跑空 library 触发清理）
      if (meetingIds.length > 0) {
        // F5 修：原 SQL 用 `id = ANY($1::text[])`，把 text[] 跟 UUID 列比，
        // PG 不隐式 cast 导致始终 0 命中，所有有内容的会议都被错判为 "0 字符"。
        // 改成 id::text 比对，跟 collectMeetingsInScope 返回的 string[] 对齐。
        const sumLen = await engine.deps.db.query(
          `SELECT COALESCE(SUM(LENGTH(content)), 0)::int AS total
             FROM assets WHERE id::text = ANY($1::text[])`,
          [meetingIds],
        );
        const totalChars = sumLen.rows[0]?.total ?? 0;
        if (totalChars < MIN_TRANSCRIPT_CHARS) {
          reply.status(400);
          return {
            error: 'Bad Request',
            code: 'INSUFFICIENT_TRANSCRIPT',
            message: `scope 下 ${meetingIds.length} 场会议 transcript 共 ${totalChars} 字符，不足 ${MIN_TRANSCRIPT_CHARS}。请先上传完整文本到 assets.content（或调小 MN_MIN_TRANSCRIPT_CHARS）。`,
            detail: { totalChars, meetingCount: meetingIds.length, requiredMin: MIN_TRANSCRIPT_CHARS },
          };
        }
      }

      // 校验 expertRoles：仅保留 people / projects / knowledge 三个角色 + 字符串 id
      let expertRoles: { people?: string[]; projects?: string[]; knowledge?: string[] } | undefined;
      if (body.expertRoles && typeof body.expertRoles === 'object') {
        const allowedRoles = ['people', 'projects', 'knowledge'] as const;
        const cleaned: Record<string, string[]> = {};
        for (const role of allowedRoles) {
          const ids = (body.expertRoles as any)[role];
          if (Array.isArray(ids)) {
            const filtered = ids.filter((x: unknown) => typeof x === 'string' && x.length > 0);
            if (filtered.length > 0) cleaned[role] = filtered;
          }
        }
        if (Object.keys(cleaned).length > 0) expertRoles = cleaned;
      }

      // mode：默认 'multi-axis'；接受 'multi-axis' / 'claude-cli' / 'api-oneshot'
      const mode: 'multi-axis' | 'claude-cli' | 'api-oneshot' =
        body.mode === 'claude-cli' ? 'claude-cli'
        : body.mode === 'api-oneshot' ? 'api-oneshot'
        : 'multi-axis';

      const r = await engine.enqueueRun({
        scope: scope as any,
        axis: body.axis,
        subDims: body.subDims,
        preset: body.preset,
        strategy: body.strategy,
        triggeredBy: body.triggeredBy,
        parentRunId: body.parentRunId,
        mode,
        expertRoles,
        workspaceId: currentWorkspaceId(request) ?? undefined,
      });
      if (!r.ok) reply.status(400);
      return r;
    });

    fastify.get('/runs', { preHandler: authenticate }, async (request) => {
      const q = request.query as any;
      // F5 · 修：之前 `q.scopeId ?? null` 把没传 scopeId 的请求强制变成 null，
      // engine.list 又把 scopeId=null 解释成"只看 library scope (scope_id IS NULL)"，
      // 导致 GenerationCenter 不传 scopeId 时看不到 project/meeting scope 的 running/queued。
      // 现改成不传就 undefined，engine 不加 scope_id 过滤。
      const items = await engine.listRuns({
        scopeKind: q.scopeKind,
        scopeId: q.scopeId,
        axis: q.axis,
        state: q.state,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        workspaceId: currentWorkspaceId(request) ?? undefined,
      });
      return { items };
    });

    /**
     * F4 · GET /runs/_diagnostics —— 运维诊断快照
     *   - workerId（本进程）
     *   - in-memory queue 状态（pending / running / concurrency）
     *   - 24h DB state 分布
     *   - 当前 running runs（含 worker_id + heartbeat 年龄）
     *   - 滞留 5 min 以上的 queued runs（应被 reaper 自动 recover）
     *
     * 必须在 /runs/:id 之前注册，否则 _diagnostics 会被当成 id 路由到 getRun → 404 / 500
     */
    fastify.get('/runs/_diagnostics', { preHandler: authenticate }, async () => {
      return engine.getRunDiagnostics();
    });

    fastify.get('/runs/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const r = await engine.getRun(id);
        if (!r) { reply.status(404); return { error: 'Not Found' }; }
        return r;
      } catch (error) {
        if (isConnectionError(error)) {
          reply.status(503);
          return { error: 'Service Unavailable', message: 'database temporarily unavailable, please retry' };
        }
        throw error;
      }
    });

    fastify.post('/runs/:id/cancel', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await engine.cancelRun(id);
      if (!ok) { reply.status(404); return { error: 'Not Found', message: 'run not cancellable' }; }
      return { success: true };
    });

    // Opt-9 (O9): 续传 failed/cancelled run。从 metadata.checkpoint.axisIdx 续跑，
    // 已完成的 axis 不会重做（避免 23 分钟的 run 全重）。
    fastify.post('/runs/:id/resume', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const r = await engine.resumeRun(id);
      if (!r.ok) {
        const isNotFound = r.reason === 'not-found';
        reply.status(isNotFound ? 404 : 409);
        return {
          error: isNotFound ? 'Not Found' : 'Conflict',
          message: r.reason ?? 'resume failed',
        };
      }
      return { success: true };
    });

    // --------------------------------------------------------
    // Versions (PR4)
    // --------------------------------------------------------

    /**
     * POST /versions —— 主动写入一份 axis 快照到 mn_axis_versions（"临时版本/备份"）
     *
     * 主要用途：AxisRegeneratePanel 在弹出危险确认弹窗时，先调本路由把当前 scope×axis 数据
     * 快照成 vN，让用户在勾选确认+输入"重算"+点继续之前能看到具体版本号。
     *
     * 与 runEngine 的 post-run 快照（runEngine.ts L869-878）独立共存：那个是 LLM 跑完后写，
     * 本路由是 LLM 跑之前手动写。两者都通过 mn_runs FK 锚定 — 本路由插一行
     * triggered_by='manual' + metadata.kind='manual_snapshot' 的占位 run。
     */
    fastify.post('/versions', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as {
        scopeKind?: string;
        scopeId?: string | null;
        axis?: string;
        label?: string;
      };

      // 1. 校验
      const allowedScopeKinds = new Set(['library', 'project', 'client', 'topic', 'meeting']);
      const allowedAxes = new Set(['people', 'projects', 'knowledge', 'meta', 'longitudinal', 'all']);
      if (!body?.scopeKind || !allowedScopeKinds.has(body.scopeKind)) {
        reply.status(400);
        return { error: 'Bad Request', message: `invalid scopeKind: ${body?.scopeKind}` };
      }
      if (!body?.axis || !allowedAxes.has(body.axis)) {
        reply.status(400);
        return { error: 'Bad Request', message: `invalid axis: ${body?.axis}` };
      }
      const scopeKind = body.scopeKind as 'library' | 'project' | 'client' | 'topic' | 'meeting';
      const axis = body.axis as 'people' | 'projects' | 'knowledge' | 'meta' | 'longitudinal' | 'all';

      // scopeId: library 时为 null；其它 kind 必填，slug 走 resolveScopeUuid
      let scopeId: string | null = null;
      if (scopeKind === 'library') {
        scopeId = null;
      } else if (scopeKind === 'meeting') {
        if (!body.scopeId) { reply.status(400); return { error: 'Bad Request', message: 'scopeId required for kind=meeting' }; }
        scopeId = body.scopeId; // assets.id 是 varchar，直接用
      } else {
        if (!body.scopeId) { reply.status(400); return { error: 'Bad Request', message: `scopeId required for kind=${scopeKind}` }; }
        const uuid = UUID_RE.test(body.scopeId)
          ? body.scopeId
          : await resolveScopeUuid(engine.deps.db, body.scopeId);
        if (!uuid) { reply.status(400); return { error: 'Bad Request', message: `unknown scope: ${body.scopeId}` }; }
        scopeId = uuid;
      }

      // 2. 列出涉及的 meeting ids
      let meetingIds: string[] = [];
      if (scopeKind === 'meeting') {
        meetingIds = [scopeId as string];
      } else if (scopeKind === 'library') {
        const r = await engine.deps.db.query(
          `SELECT id FROM assets
            WHERE type = 'meeting_note' OR type = 'meeting_minutes' OR (metadata ? 'meeting_kind')
            ORDER BY created_at DESC`,
        );
        meetingIds = r.rows.map((row: any) => String(row.id));
      } else {
        // project / client / topic：通过 mn_scope_members
        const r = await engine.deps.db.query(
          `SELECT meeting_id::text AS meeting_id FROM mn_scope_members WHERE scope_id = $1`,
          [scopeId],
        );
        meetingIds = r.rows.map((row: any) => row.meeting_id);
      }

      // 3. 聚合 axis 数据 —— 形状必须是 { [axis]: { [subDim]: [...] } } 才能让
      //    versionStore.computeDiff 的 flatten（versionStore.ts:154-170）正确比对
      const axisesToCapture = axis === 'all'
        ? ['people', 'projects', 'knowledge', 'meta'] as const
        : [axis] as const;

      // P3 snapshot v1：数组项加 __meeting_id 让 restore 知道每条 row 该写回哪场会议
      const captureOne = (axisName: string, perMeetingAxes: Array<Record<string, any>>) => {
        const axisBlocks = perMeetingAxes.map((m) => m?.[axisName] ?? {});
        if (axisBlocks.length === 0) return {};
        // 收集所有 subDim key 的并集
        const subDimKeys = new Set<string>();
        for (const b of axisBlocks) for (const k of Object.keys(b)) subDimKeys.add(k);
        const out: Record<string, any> = {};
        for (const key of subDimKeys) {
          const samples = axisBlocks.map((b) => b[key]).filter((v) => v !== undefined && v !== null);
          if (samples.length === 0) { out[key] = []; continue; }
          // 数组型 subDim（commitments, decisions, ...）：concat 所有 meeting；每条 row 加 __meeting_id
          if (Array.isArray(samples[0])) {
            const tagged: any[] = [];
            axisBlocks.forEach((b, i) => {
              const arr = b[key];
              if (Array.isArray(arr)) {
                for (const item of arr) tagged.push({ __meeting_id: meetingIds[i], ...item });
              }
            });
            out[key] = tagged;
          } else {
            // 单例对象（evidence_grades / decision_quality / meeting_necessity / affect_curve）
            // → 多 meeting 时按 meeting_id 索引保留
            if (axisBlocks.length === 1) {
              out[key] = samples[0];
            } else {
              const map: Record<string, any> = {};
              axisBlocks.forEach((b, i) => { if (b[key] !== undefined && b[key] !== null) map[meetingIds[i]] = b[key]; });
              out[key] = map;
            }
          }
        }
        return out;
      };

      let capturedData: Record<string, any> = {};
      let captureFailed: { meetingId: string; message: string } | null = null;
      try {
        const perMeeting: Array<Record<string, any>> = [];
        for (const mid of meetingIds) {
          try {
            perMeeting.push(await engine.getMeetingAxes(mid));
          } catch (e) {
            captureFailed = { meetingId: mid, message: (e as Error).message };
            throw e;
          }
        }
        for (const a of axisesToCapture) {
          capturedData[a] = captureOne(a, perMeeting);
        }
        // P3 snapshot v1：附 _meta 让 restore 路由识别格式 + 拿到原始 meeting list
        capturedData._meta = {
          snapshotVersion: 1,
          meetingIds,
          scopeKind,
          scopeId,
          axis,
          capturedAt: new Date().toISOString(),
        };
      } catch (e) {
        request.log.error({ scopeKind, scopeId, axis, captureFailed }, 'snapshot capture failed');
        reply.status(500);
        const failedDetail = captureFailed
          ? ` (meeting ${captureFailed.meetingId.slice(0, 8)}: ${(captureFailed as { message: string }).message})`
          : '';
        return {
          error: 'Internal Server Error',
          message: `snapshot capture failed${failedDetail}`,
        };
      }

      // 4. library × all 大尺寸警告
      let warning: string | undefined;
      const sizeBytes = Buffer.byteLength(JSON.stringify(capturedData), 'utf8');
      if (scopeKind === 'library' && axis === 'all' && sizeBytes > 5 * 1024 * 1024) {
        warning = `snapshot ~${(sizeBytes / 1024 / 1024).toFixed(1)} MB across ${meetingIds.length} meetings, consider narrowing scope`;
      } else if (sizeBytes > 5 * 1024 * 1024) {
        warning = `snapshot ~${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
      }

      // 5. 写占位 mn_runs（满足 mn_axis_versions.run_id NOT NULL FK）
      let runId: string;
      try {
        const r = await engine.deps.db.query(
          `INSERT INTO mn_runs (scope_kind, scope_id, axis, state, triggered_by, started_at, finished_at, metadata)
             VALUES ($1, $2, $3, 'succeeded', 'manual', NOW(), NOW(), $4::jsonb)
             RETURNING id`,
          [
            scopeKind,
            scopeKind === 'library' || scopeKind === 'meeting' ? null : scopeId, // mn_runs.scope_id 是 UUID，meeting 的 assets.id 不一定符合 → 保留在 metadata
            axis,
            JSON.stringify({
              kind: 'manual_snapshot',
              snapshotOnly: true,
              meetingCount: meetingIds.length,
              meetingScopeId: scopeKind === 'meeting' ? scopeId : null,
              labelHint: body.label ?? null,
            }),
          ],
        );
        runId = r.rows[0].id as string;
      } catch (e) {
        request.log.error({ err: e }, 'placeholder mn_runs insert failed');
        reply.status(500);
        return { error: 'Internal Server Error', message: 'snapshot run-anchor insert failed' };
      }

      // 6. 调 versionStore.snapshot 写入（已自动算 vN + diff_vs_prev）
      try {
        const result = await engine.versionStore.snapshot({
          runId,
          scopeKind,
          // mn_axis_versions.scope_id 是 UUID；对 scopeKind='meeting'（assets.id 可能不是 uuid）
          // 写 null，把真实 meetingId 留在 metadata（已存在 mn_runs.metadata.meetingScopeId）。
          // project/client/topic 的 scopeId 已是 UUID，直接传。
          scopeId: scopeKind === 'library' || scopeKind === 'meeting' ? null : (scopeId as string),
          axis,
          data: capturedData,
        });
        return {
          versionId: result.id,
          versionLabel: result.versionLabel,
          prevVersionId: result.prevVersionId,
          diff: result.diff,
          runId,
          sizeBytes,
          meetingCount: meetingIds.length,
          warning,
        };
      } catch (e) {
        request.log.error({ err: e, runId }, 'versionStore.snapshot failed');
        // 占位 run 已写但 version 未写入 → run 是孤儿，可接受（无 FK 反向影响）
        reply.status(500);
        return { error: 'Internal Server Error', message: `snapshot insert failed: ${(e as Error).message}` };
      }
    });

    /**
     * POST /versions/:id/restore —— 把 mn_axis_versions.snapshot 反向写回 mn_*
     *
     * 配套 P0 source 列：写回行 source='restored'，仅清掉
     * source IN ('llm_extracted','restored') 的旧行，manual_import / human_edit 保留。
     *
     * 仅处理 snapshotVersion=1 格式（数组项有 __meeting_id 标记 + _meta.meetingIds）。
     * 旧 snapshot（无 _meta.snapshotVersion）→ 422 LEGACY_SNAPSHOT，提示先 POST /versions 再试。
     */
    fastify.post('/versions/:id/restore', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { dryRun?: boolean };
      const dryRun = body.dryRun === true;
      if (!UUID_RE.test(id)) {
        reply.status(404);
        return { error: 'Not Found' };
      }

      // 1. 读 snapshot
      const verR = await engine.deps.db.query(
        `SELECT id, scope_kind, scope_id::text AS scope_id, axis, version_label, snapshot
           FROM mn_axis_versions WHERE id = $1`,
        [id],
      );
      if (verR.rows.length === 0) {
        reply.status(404);
        return { error: 'Not Found', message: `version ${id.slice(0, 8)}… not found` };
      }
      const ver = verR.rows[0];
      const snapshot = ver.snapshot ?? {};
      if (snapshot._meta?.snapshotVersion !== 1) {
        reply.status(422);
        return {
          error: 'Unprocessable Entity',
          code: 'LEGACY_SNAPSHOT',
          message: `version ${ver.version_label} 是早期格式（缺 _meta.snapshotVersion），无法反向解构。请先 POST /versions 写一份新快照再试。`,
        };
      }

      const meetingIds: string[] = Array.isArray(snapshot._meta.meetingIds) ? snapshot._meta.meetingIds : [];
      const scopeKindFromSnap = snapshot._meta.scopeKind ?? ver.scope_kind;
      const scopeIdFromSnap = snapshot._meta.scopeId ?? ver.scope_id;

      // 2. 反写 schema 表 —— subDim → mn_* 列映射
      // 数组型: 用 __meeting_id 路由到原 meeting，DELETE source IN llm/restored 后逐行 INSERT
      // 单例型: 按 meeting_id 索引（也支持单 meeting 直接对象）
      type RestoreEntry = {
        table: string;
        kind: 'array_per_meeting' | 'singleton_per_meeting' | 'global_judgments';
        cols: string[];                  // 数组型 row 取的列
        scopeIdCol?: 'scope_id' | null;  // 写回是否填 scope_id（risks/decisions/assumptions/open_questions 是）
      };
      const SCHEMA: Record<string, RestoreEntry> = {
        'people.commitments':       { table: 'mn_commitments', kind: 'array_per_meeting',
          cols: ['id', 'person_id', 'text', 'due_at', 'state', 'progress'] },
        'people.role_trajectory':   { table: 'mn_role_trajectory_points', kind: 'array_per_meeting',
          cols: ['person_id', 'role_label', 'confidence'] },
        'people.speech_quality':    { table: 'mn_speech_quality', kind: 'array_per_meeting',
          cols: ['person_id', 'entropy_pct', 'followed_up_count', 'quality_score', 'sample_quotes'] },
        'people.silence_signals':   { table: 'mn_silence_signals', kind: 'array_per_meeting',
          cols: ['person_id', 'topic_id', 'state', 'anomaly_score'] },
        'projects.decisions':       { table: 'mn_decisions', kind: 'array_per_meeting',
          cols: ['id', 'title', 'proposer_person_id', 'confidence', 'is_current', 'rationale', 'based_on_ids', 'superseded_by_id'],
          scopeIdCol: 'scope_id' },
        'projects.assumptions':     { table: 'mn_assumptions', kind: 'array_per_meeting',
          cols: ['id', 'text', 'evidence_grade', 'verification_state', 'confidence', 'underpins_decision_ids'],
          scopeIdCol: 'scope_id' },
        'projects.open_questions':  { table: 'mn_open_questions', kind: 'array_per_meeting',
          cols: ['id', 'text', 'category', 'status', 'times_raised', 'owner_person_id'],
          scopeIdCol: 'scope_id' },
        'projects.risks':           { table: 'mn_risks', kind: 'array_per_meeting',
          cols: ['id', 'text', 'severity', 'mention_count', 'heat_score', 'trend', 'action_taken'],
          scopeIdCol: 'scope_id' },
        'knowledge.judgments':      { table: 'mn_judgments', kind: 'global_judgments',
          cols: ['id', 'text', 'domain', 'generality_score', 'reuse_count'] },
        'knowledge.mental_models':  { table: 'mn_mental_model_invocations', kind: 'array_per_meeting',
          cols: ['id', 'model_name', 'invoked_by_person_id', 'correctly_used', 'outcome', 'confidence'] },
        'knowledge.cognitive_biases': { table: 'mn_cognitive_biases', kind: 'array_per_meeting',
          cols: ['id', 'bias_type', 'where_excerpt', 'by_person_id', 'severity', 'mitigated'] },
        'knowledge.counterfactuals':{ table: 'mn_counterfactuals', kind: 'array_per_meeting',
          cols: ['id', 'rejected_path', 'rejected_by_person_id', 'tracking_note', 'next_validity_check_at', 'current_validity'] },
        'knowledge.evidence_grades': { table: 'mn_evidence_grades', kind: 'singleton_per_meeting',
          cols: ['dist_a', 'dist_b', 'dist_c', 'dist_d', 'weighted_score'] },
        'meta.decision_quality':    { table: 'mn_decision_quality', kind: 'singleton_per_meeting',
          cols: ['overall', 'clarity', 'actionable', 'traceable', 'falsifiable', 'aligned', 'notes'] },
        'meta.meeting_necessity':   { table: 'mn_meeting_necessity', kind: 'singleton_per_meeting',
          cols: ['verdict', 'suggested_duration_min', 'reasons'] },
        'meta.affect_curve':        { table: 'mn_affect_curve', kind: 'singleton_per_meeting',
          cols: ['samples', 'tension_peaks', 'insight_points'] },
      };

      const affected: Record<string, Record<string, { deleted: number; inserted: number; skipped: number }>> = {};

      // 3. 遍历 snapshot.{axis}.{subDim} 反写
      const axesInSnap = Object.keys(snapshot).filter((k) => k !== '_meta');
      const client = engine.deps.db; // 简化：复用 pool 上的 query；事务用一个连接更安全，但 dryRun 不改不需要

      const exec = async (sql: string, args: unknown[]) => {
        if (dryRun) return { rowCount: 0 };
        return client.query(sql, args);
      };

      for (const ax of axesInSnap) {
        const axisData = snapshot[ax];
        if (!axisData || typeof axisData !== 'object') continue;
        affected[ax] = {};
        for (const [sub, val] of Object.entries(axisData as Record<string, any>)) {
          const key = `${ax}.${sub}`;
          const def = SCHEMA[key];
          if (!def) {
            affected[ax][sub] = { deleted: 0, inserted: 0, skipped: 1 };
            continue;
          }
          const stat = { deleted: 0, inserted: 0, skipped: 0 };

          // ---- array_per_meeting / global_judgments：DELETE source IN(llm,restored) → INSERT each ----
          if (def.kind === 'array_per_meeting' || def.kind === 'global_judgments') {
            const items: any[] = Array.isArray(val) ? val : [];
            // delete preexisting LLM/restored rows for these meetings
            if (def.kind === 'array_per_meeting' && meetingIds.length > 0) {
              const delR = await exec(
                `DELETE FROM ${def.table} WHERE meeting_id = ANY($1::uuid[]) AND source IN ('llm_extracted', 'restored')`,
                [meetingIds],
              );
              stat.deleted = (delR as any).rowCount ?? 0;
            } else if (def.kind === 'global_judgments' && meetingIds.length > 0) {
              // mn_judgments 没有 meeting_id，按 abstracted_from_meeting_id / linked_meeting_ids 过滤
              const delR = await exec(
                `DELETE FROM ${def.table}
                  WHERE source IN ('llm_extracted','restored')
                    AND (abstracted_from_meeting_id = ANY($1::uuid[]) OR linked_meeting_ids && $1::uuid[])`,
                [meetingIds],
              );
              stat.deleted = (delR as any).rowCount ?? 0;
            }

            // INSERT each item
            for (const item of items) {
              try {
                const mid = item.__meeting_id ?? meetingIds[0]; // global_judgments fallback
                const cols = def.kind === 'array_per_meeting'
                  ? ['meeting_id', ...(def.scopeIdCol ? ['scope_id'] : []), ...def.cols, 'source']
                  : ['abstracted_from_meeting_id', ...def.cols, 'linked_meeting_ids', 'source'];
                const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
                const values: any[] = def.kind === 'array_per_meeting'
                  ? [mid, ...(def.scopeIdCol ? [scopeIdFromSnap] : []), ...def.cols.map((c) => item[c] ?? null), 'restored']
                  : [mid, ...def.cols.map((c) => item[c] ?? null), Array.isArray(item.linked_meeting_ids) ? item.linked_meeting_ids : meetingIds, 'restored'];
                // mn_judgments.linked_meeting_ids 是 uuid[] → 强制 cast 防止 pg 选错类型
                const sqlBody = def.kind === 'global_judgments'
                  ? `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${placeholders.replace(/\$(\d+),\s*'restored'\)$/, "$$$1::uuid[], 'restored')")})`
                  : `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${placeholders})`;
                await exec(sqlBody, values);
                stat.inserted += 1;
              } catch (e) {
                stat.skipped += 1;
                request.log.warn({ table: def.table, err: (e as Error).message }, 'restore item insert failed');
              }
            }
          }

          // ---- singleton_per_meeting：UPSERT per meeting ----
          if (def.kind === 'singleton_per_meeting') {
            // 形态可能是 { mid1: {...}, mid2: {...} } 或者 单 meeting 直接 {...}
            const perMeeting: Array<[string, any]> =
              meetingIds.length === 1 && typeof val === 'object' && val !== null && !Object.keys(val).some((k) => k.length > 30)
                ? [[meetingIds[0], val]]
                : Object.entries(val as Record<string, any>);
            for (const [mid, payload] of perMeeting) {
              if (!payload || typeof payload !== 'object') { stat.skipped += 1; continue; }
              const cols = ['meeting_id', ...def.cols, 'source'];
              const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
              const values = [mid, ...def.cols.map((c) => {
                const v = payload[c];
                if (v && typeof v === 'object') return JSON.stringify(v);
                return v ?? null;
              }), 'restored'];
              const updateSet = def.cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
              const sqlBody = `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${placeholders})
                  ON CONFLICT (meeting_id) DO UPDATE SET ${updateSet}, source = 'restored'
                  WHERE ${def.table}.source NOT IN ('manual_import','human_edit')`;
              try {
                await exec(sqlBody, values);
                stat.inserted += 1;
              } catch (e) {
                stat.skipped += 1;
                request.log.warn({ table: def.table, err: (e as Error).message }, 'restore singleton upsert failed');
              }
            }
          }

          affected[ax][sub] = stat;
        }
      }

      if (dryRun) {
        return {
          fromVersion: { id: ver.id, label: ver.version_label, axis: ver.axis, scopeKind: ver.scope_kind, scopeId: ver.scope_id },
          dryRun: true,
          affected,
        };
      }

      // 4. 写新 mn_runs 占位 + 新 mn_axis_versions（label='restored-from-vN'）
      const runIns = await engine.deps.db.query(
        `INSERT INTO mn_runs (scope_kind, scope_id, axis, state, triggered_by, started_at, finished_at, metadata)
           VALUES ($1, $2, $3, 'succeeded', 'manual', NOW(), NOW(), $4::jsonb)
           RETURNING id`,
        [
          ver.scope_kind,
          ver.scope_kind === 'library' || ver.scope_kind === 'meeting' ? null : ver.scope_id,
          ver.axis,
          JSON.stringify({ kind: 'restore', fromVersionId: ver.id, fromVersionLabel: ver.version_label }),
        ],
      );
      const newRunId = runIns.rows[0].id as string;

      const newVer = await engine.versionStore.snapshot({
        runId: newRunId,
        scopeKind: ver.scope_kind,
        scopeId: ver.scope_kind === 'library' || ver.scope_kind === 'meeting' ? null : ver.scope_id,
        axis: ver.axis,
        data: snapshot, // 同一份内容复用，确保 vN 时间轴线性
      });

      return {
        fromVersion: { id: ver.id, label: ver.version_label, axis: ver.axis, scopeKind: ver.scope_kind, scopeId: ver.scope_id },
        dryRun: false,
        affected,
        newRunId,
        newVersionId: newVer.id,
        newVersionLabel: `restored-from-${ver.version_label}`,
      };
    });

    fastify.get('/versions/:scopeKind/:axis', { preHandler: authenticate }, async (request) => {
      const { scopeKind, axis } = request.params as { scopeKind: string; axis: string };
      const q = request.query as { scopeId?: string; limit?: string };
      return {
        items: await engine.listAxisVersions(
          { kind: scopeKind as any, id: q.scopeId },
          axis as any,
        ),
      };
    });

    fastify.get('/versions/:id/diff', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = request.query as { vs?: string };
      if (!q.vs) { reply.status(400); return { error: 'Bad Request', message: 'vs query param required' }; }
      try {
        const d = await engine.diffVersions(id, q.vs);
        if (!d) { reply.status(404); return { error: 'Not Found' }; }
        return d;
      } catch (e) {
        // 引擎抛错（版本不存在/解析失败）通常意味着请求的版本 id 不在库 ·
        // 转 404 让前端走 fallback，避免 500 满屏
        request.log.warn({ id, vs: q.vs, err: e }, 'diffVersions failed → 404');
        reply.status(404);
        return { error: 'Not Found', message: e instanceof Error ? e.message : 'diff failed' };
      }
    });

    // --------------------------------------------------------
    // Cross-axis links (PR4)
    // --------------------------------------------------------
    fastify.get('/crosslinks', { preHandler: authenticate }, async (request, reply) => {
      const q = request.query as { axis?: string; itemId?: string; scopeId?: string };
      if (!q.axis || !q.itemId) {
        reply.status(400);
        return { error: 'Bad Request', message: 'axis and itemId required' };
      }
      return {
        items: await engine.getCrossAxisLinks({
          scope: { kind: 'meeting', id: q.scopeId ?? undefined } as any,
          axis: q.axis as any,
          itemId: q.itemId,
        }),
      };
    });

    /**
     * GET /meetings/:id/cross-axis-clues?axis=people|projects|knowledge|meta
     *
     * 计算"此轴上的问题在其他轴的映射"的真实线索（替换 _axisShared.tsx 的 mock）。
     * 三条最高 leverage 关联（方案 2）：
     *   C1 人物→项目: 决策密度 × 高 heat 风险密度（"提议人 N 个决策对应 M 条高风险"）
     *   C2 项目→人物: 决策 owner 的承诺兑现率（"决策 owner 历史 commitment 兑现 X/Y"）
     *   C3 知识→项目: judgment 关联的未验证假设数（"判断 J 关联 N 条 untested assumption"）
     *
     * 纯 SQL，零 LLM。表都不存在 / count 为 0 时返空数组。
     */
    fastify.get('/meetings/:id/cross-axis-clues', { preHandler: authenticate }, async (request, reply) => {
      const { id: meetingId } = request.params as { id: string };
      const q = request.query as { axis?: string };
      if (!UUID_RE.test(meetingId)) {
        return { items: [] };
      }
      const axis = (q.axis ?? 'people') as 'people' | 'projects' | 'knowledge' | 'meta';
      const db = engine.deps.db;
      const items: Array<{
        targetAxis: string;
        label: string;
        detail: string;
        count: number;
        to: string;
        anchor?: { kind: string; ids: string[] };
      }> = [];

      try {
        if (axis === 'people') {
          // C1 人物→项目: 该会上提议人 × 关联风险数。heat 阈值放宽到 ≥1（含所有 mention）
          // 提议人门槛降到 ≥1（小会议只有几条决策也能命中）
          const r = await db.query(
            `WITH proposers AS (
               SELECT proposer_person_id AS pid, COUNT(*)::int AS dcount,
                      array_agg(id) AS decision_ids
                 FROM mn_decisions
                WHERE meeting_id = $1::uuid AND proposer_person_id IS NOT NULL
                GROUP BY proposer_person_id
             ),
             scope_risks AS (
               SELECT COUNT(*)::int AS rcount FROM mn_risks
                WHERE COALESCE(heat_score, 0) >= 1
                  AND (scope_id IN (SELECT scope_id FROM mn_scope_members WHERE meeting_id = $1::uuid)
                       OR scope_id IS NULL)
             )
             SELECT p.pid, p.dcount, sr.rcount, mp.canonical_name AS pname,
                    p.decision_ids
               FROM proposers p
               CROSS JOIN scope_risks sr
               LEFT JOIN mn_people mp ON mp.id = p.pid
              WHERE sr.rcount > 0
              ORDER BY p.dcount DESC LIMIT 5`,
            [meetingId],
          ).catch(() => ({ rows: [] as any[] }));
          for (const row of r.rows) {
            items.push({
              targetAxis: '项目',
              label: '项目轴 · 风险热度',
              detail: `${row.pname ?? row.pid?.slice(0, 6)} 提的 ${row.dcount} 项决策，本会议（含 scope）共 ${row.rcount} 条风险`,
              count: row.rcount,
              to: `/meeting/${meetingId}/a`,
              anchor: { kind: 'risk-by-proposer', ids: [String(row.pid)] },
            });
          }
        }

        if (axis === 'projects') {
          // C2 项目→人物: 决策 owner 的承诺兑现统计
          // 区分有意义的 state：'done' 真完成；'at_risk'/'slipped' 真脱轨；'on_track' 默认状态视作未明
          // 用"明确兑现率 = done / (done + slipped)"避免被默认 on_track 噪音拉到 100%
          const r = await db.query(
            `WITH proposers AS (
               SELECT DISTINCT proposer_person_id AS pid FROM mn_decisions
                WHERE meeting_id = $1::uuid AND proposer_person_id IS NOT NULL
             ),
             stats AS (
               SELECT c.person_id AS pid,
                      COUNT(*) FILTER (WHERE c.state = 'done')::int AS done_count,
                      COUNT(*) FILTER (WHERE c.state = 'slipped')::int AS slipped_count,
                      COUNT(*) FILTER (WHERE c.state = 'at_risk')::int AS at_risk_count,
                      COUNT(*)::int AS total_count
                 FROM mn_commitments c
                 JOIN proposers p ON p.pid = c.person_id
                GROUP BY c.person_id
             )
             SELECT s.pid, s.done_count, s.slipped_count, s.at_risk_count, s.total_count,
                    mp.canonical_name AS pname
               FROM stats s
               LEFT JOIN mn_people mp ON mp.id = s.pid
              WHERE s.total_count >= 1
              ORDER BY (s.slipped_count + s.at_risk_count) DESC, s.total_count DESC LIMIT 5`,
            [meetingId],
          ).catch(() => ({ rows: [] as any[] }));
          for (const row of r.rows) {
            const issues = row.slipped_count + row.at_risk_count;
            const detail = issues > 0
              ? `${row.pname ?? row.pid?.slice(0, 6)} 的 ${row.total_count} 条 commitment 中 ${row.slipped_count} 条已脱轨、${row.at_risk_count} 条 at_risk`
              : `${row.pname ?? row.pid?.slice(0, 6)} 共 ${row.total_count} 条 commitment（${row.done_count} 已完成，其余 on_track 待跟进）`;
            items.push({
              targetAxis: '人物',
              label: '人物轴 · 承诺兑现',
              detail,
              count: issues > 0 ? issues : row.total_count,
              to: `/meeting/${meetingId}/c`,
              anchor: { kind: 'commitments-by-person', ids: [String(row.pid)] },
            });
          }
        }

        if (axis === 'knowledge') {
          // C3 知识→项目: high-generality judgment 关联的 untested assumption 数
          // mn_assumptions.underpins_decision_ids 与 mn_decisions.based_on_ids 没直接 join，
          // 改用同 meeting 的所有未 verified assumption 作粗略代理
          const r = await db.query(
            `WITH top_judgments AS (
               SELECT id, text, generality_score FROM mn_judgments
                WHERE $1::uuid = ANY(linked_meeting_ids)
                  AND COALESCE(generality_score, 0) >= 0.7
                ORDER BY generality_score DESC LIMIT 3
             ),
             untested AS (
               SELECT COUNT(*)::int AS acount FROM mn_assumptions
                WHERE meeting_id = $1::uuid
                  AND COALESCE(verification_state, 'untested') NOT IN ('verified','falsified')
             )
             SELECT j.id, j.text, j.generality_score, u.acount
               FROM top_judgments j CROSS JOIN untested u
              WHERE u.acount > 0`,
            [meetingId],
          ).catch(() => ({ rows: [] as any[] }));
          for (const row of r.rows) {
            const snippet = String(row.text ?? '').slice(0, 30);
            items.push({
              targetAxis: '项目',
              label: '项目轴 · 假设清单',
              detail: `判断「${snippet}…」关联 ${row.acount} 条未验证假设`,
              count: row.acount,
              to: `/meeting/${meetingId}/a`,
              anchor: { kind: 'assumptions', ids: [String(row.id)] },
            });
          }
        }
      } catch (e) {
        request.log.warn({ meetingId, axis, err: e }, 'cross-axis-clues compute failed');
      }

      return { items };
    });

    /**
     * GET /cross-axis-clues?axis=&scopeKind=&scopeId=
     *
     * scope 级聚合 — 给 /meeting/axes/* axis 聚合页用。同 schema、跨该 scope 下所有 meeting。
     * scopeId 为空时跨全库。
     */
    fastify.get('/cross-axis-clues', { preHandler: authenticate }, async (request, reply) => {
      const q = request.query as { axis?: string; scopeKind?: string; scopeId?: string };
      const axis = (q.axis ?? 'people') as 'people' | 'projects' | 'knowledge' | 'meta';
      const db = engine.deps.db;
      const items: Array<{
        targetAxis: string; label: string; detail: string; count: number;
        to: string; anchor?: { kind: string; ids: string[] };
      }> = [];

      const scopeId = q.scopeId && UUID_RE.test(q.scopeId) ? q.scopeId : null;
      const meetingFilter = scopeId
        ? `meeting_id IN (SELECT meeting_id FROM mn_scope_members WHERE scope_id = $1::uuid)`
        : `TRUE`;
      const params: any[] = scopeId ? [scopeId] : [];

      try {
        if (axis === 'people') {
          const r = await db.query(
            `WITH proposers AS (
               SELECT proposer_person_id AS pid, COUNT(*)::int AS dcount
                 FROM mn_decisions
                WHERE proposer_person_id IS NOT NULL AND ${meetingFilter}
                GROUP BY proposer_person_id
                HAVING COUNT(*) >= 2
             ),
             scope_risks AS (
               SELECT COUNT(*)::int AS rcount FROM mn_risks
                WHERE COALESCE(heat_score, 0) >= 1
                  ${scopeId ? `AND scope_id = $1::uuid` : ``}
             )
             SELECT p.pid, p.dcount, sr.rcount, mp.canonical_name AS pname
               FROM proposers p CROSS JOIN scope_risks sr
               LEFT JOIN mn_people mp ON mp.id = p.pid
              WHERE sr.rcount > 0
              ORDER BY p.dcount DESC LIMIT 5`,
            params,
          ).catch(() => ({ rows: [] as any[] }));
          for (const row of r.rows) {
            items.push({
              targetAxis: '项目',
              label: '项目轴 · 风险热度',
              detail: `${row.pname ?? row.pid?.slice(0,6)} 在该 scope 下提了 ${row.dcount} 项决策；scope 累积 ${row.rcount} 条风险`,
              count: row.dcount,
              to: '/meeting/axes/projects',
              anchor: { kind: 'risk-by-proposer', ids: [String(row.pid)] },
            });
          }
        }

        if (axis === 'projects') {
          const r = await db.query(
            `WITH proposers AS (
               SELECT DISTINCT proposer_person_id AS pid FROM mn_decisions
                WHERE proposer_person_id IS NOT NULL AND ${meetingFilter}
             ),
             stats AS (
               SELECT c.person_id AS pid,
                      COUNT(*) FILTER (WHERE c.state = 'done')::int AS done_count,
                      COUNT(*) FILTER (WHERE c.state = 'slipped')::int AS slipped_count,
                      COUNT(*) FILTER (WHERE c.state = 'at_risk')::int AS at_risk_count,
                      COUNT(*)::int AS total_count
                 FROM mn_commitments c
                 JOIN proposers p ON p.pid = c.person_id
                GROUP BY c.person_id
             )
             SELECT s.pid, s.done_count, s.slipped_count, s.at_risk_count, s.total_count,
                    mp.canonical_name AS pname
               FROM stats s
               LEFT JOIN mn_people mp ON mp.id = s.pid
              WHERE s.total_count >= 1
              ORDER BY (s.slipped_count + s.at_risk_count) DESC, s.total_count DESC LIMIT 5`,
            params,
          ).catch(() => ({ rows: [] as any[] }));
          for (const row of r.rows) {
            const issues = row.slipped_count + row.at_risk_count;
            const detail = issues > 0
              ? `${row.pname ?? row.pid?.slice(0,6)} 跨 scope 共 ${row.total_count} 条 commitment：${row.slipped_count} 已脱轨 / ${row.at_risk_count} at_risk`
              : `${row.pname ?? row.pid?.slice(0,6)} 跨 scope 共 ${row.total_count} 条 commitment（${row.done_count} 完成，其余 on_track）`;
            items.push({
              targetAxis: '人物', label: '人物轴 · 承诺兑现',
              detail, count: issues > 0 ? issues : row.total_count,
              to: '/meeting/axes/people',
              anchor: { kind: 'commitments-by-person', ids: [String(row.pid)] },
            });
          }
        }

        if (axis === 'knowledge') {
          const r = await db.query(
            `WITH top_judgments AS (
               SELECT id, text, generality_score FROM mn_judgments
                WHERE COALESCE(generality_score, 0) >= 0.7
                  ${scopeId ? `AND linked_meeting_ids && (SELECT array_agg(meeting_id::uuid) FROM mn_scope_members WHERE scope_id = $1::uuid)` : ``}
                ORDER BY generality_score DESC LIMIT 3
             ),
             untested AS (
               SELECT COUNT(*)::int AS acount FROM mn_assumptions
                WHERE COALESCE(verification_state,'untested') NOT IN ('verified','falsified')
                  AND ${meetingFilter}
             )
             SELECT j.id, j.text, j.generality_score, u.acount
               FROM top_judgments j CROSS JOIN untested u
              WHERE u.acount > 0`,
            params,
          ).catch(() => ({ rows: [] as any[] }));
          for (const row of r.rows) {
            const snippet = String(row.text ?? '').slice(0, 30);
            items.push({
              targetAxis: '项目', label: '项目轴 · 假设清单',
              detail: `判断「${snippet}…」该 scope 下关联 ${row.acount} 条未验证假设`,
              count: row.acount,
              to: '/meeting/axes/projects',
              anchor: { kind: 'assumptions', ids: [String(row.id)] },
            });
          }
        }
      } catch (e) {
        request.log.warn({ axis, scopeId, err: e }, 'scope cross-axis-clues failed');
      }

      return { items };
    });

    fastify.post('/crosslinks/recompute', { preHandler: authenticate }, async (request) => {
      const body = request.body as { scopeKind?: string; scopeId?: string };
      const result = await engine.crossLinks.recomputeForScope(
        (body?.scopeKind as any) ?? 'library',
        body?.scopeId ?? null,
        null,
      );
      return result;
    });

    // --------------------------------------------------------
    // Longitudinal (PR5)
    // --------------------------------------------------------
    fastify.get('/scopes/:id/longitudinal/:kind', { preHandler: authenticate }, async (request, reply) => {
      const { id, kind } = request.params as { id: string; kind: string };
      if (!['belief_drift', 'decision_tree', 'model_hit_rate'].includes(kind)) {
        reply.status(400);
        return { error: 'Bad Request', message: 'kind must be belief_drift|decision_tree|model_hit_rate' };
      }
      return engine.getLongitudinal(id, kind as any);
    });

    fastify.post('/longitudinal/recompute', { preHandler: authenticate }, async (request) => {
      const body = request.body as { scopeId?: string; kind?: string };
      return engine.computeLongitudinal({
        scopeId: body?.scopeId ?? null,
        kind: body?.kind as any,
      });
    });
  };
}
