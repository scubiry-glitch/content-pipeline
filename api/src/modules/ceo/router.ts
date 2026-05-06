// CEO Module — Fastify 路由 (薄层)
// 子路由按房间 + 全局 (panorama / brain) 拆分

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { CeoEngine } from './CeoEngine.js';
import { createCompassRouter } from './rooms/compass/router.js';
import { createBoardroomRouter } from './rooms/boardroom/router.js';
import { createTowerRouter } from './rooms/tower/router.js';
import { createWarRoomRouter } from './rooms/war-room/router.js';
import { createSituationRouter } from './rooms/situation/router.js';
import { createBalconyRouter } from './rooms/balcony/router.js';
import { createPanoramaRouter } from './panorama/router.js';
import { createBrainRouter } from './brain/router.js';
import { createPeopleAgentsRouter } from './rooms/people-agents/router.js';
import { getRecommendedScopes, getDefaultScopes } from './recommendation/service.js';
import { ceoWorkspaceGuard } from './workspaceGuard.js';
import { currentWorkspaceId } from '../../db/repos/withWorkspace.js';
import { authenticate } from '../../middleware/auth.js';

export function createRouter(engine: CeoEngine): FastifyPluginAsync {
  return async function ceoRoutes(fastify: FastifyInstance) {
    // 必须先 authenticate 才能让 currentWorkspaceId 拿到 request.auth.workspace.id;
    // 没这条钩子时 request.auth=undefined → currentWorkspaceId 返回 null →
    // wsFilterClause 走 IS NULL 分支 → 看全表(包含其他 ws 的数据). 必须放在
    // ceoWorkspaceGuard 之前, 否则 guard 也读不到 wsId 退化为放行.
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', ceoWorkspaceGuard);

    fastify.get('/health', async () => engine.health());

    fastify.get('/dashboard', async (request) => {
      const { scopeId } = (request.query ?? {}) as { scopeId?: string };
      return engine.buildDashboard(scopeId);
    });

    // 推荐 scope (动态评分) — 按素材丰富度排序
    // GET /api/v1/ceo/recommended-scopes?limit=3&minScore=1
    fastify.get('/recommended-scopes', async (request) => {
      const q = (request.query ?? {}) as { limit?: string; minScore?: string };
      return getRecommendedScopes(engine.deps, currentWorkspaceId(request), {
        limit: q.limit ? Number(q.limit) : undefined,
        minScore: q.minScore ? Number(q.minScore) : undefined,
      });
    });

    // 默认 scope — 优先 CEO_PREFERRED_SCOPES 名字精确匹配，回退动态评分
    // GET /api/v1/ceo/default-scopes
    fastify.get('/default-scopes', async (request) => {
      return getDefaultScopes(engine.deps, currentWorkspaceId(request));
    });

    // 批量分析填充 — 对一组 scope 入队 g2/g3/g4/g5 全部任务
    // POST /api/v1/ceo/scopes/fill-all { scopeIds: ['<uuid>'], axes?: ['g2','g3','g4','g5'] }
    // 返回每个 scope 的 runId 列表，用于前端追踪进度
    fastify.post('/scopes/fill-all', async (request, reply) => {
      const body = (request.body ?? {}) as { scopeIds?: string[]; axes?: string[] };
      const ids = Array.isArray(body.scopeIds) ? body.scopeIds.filter((x) => typeof x === 'string') : [];
      if (ids.length === 0) {
        reply.code(400);
        return { ok: false, error: 'scopeIds[] required' };
      }
      const axes = Array.isArray(body.axes) && body.axes.length > 0
        ? body.axes.filter((a) => typeof a === 'string')
        : ['g2', 'g3', 'g4', 'g5']; // 默认: 跳过 g1 (它由 mn ingest 触发)
      const wsId = currentWorkspaceId(request);
      const results: Array<{ scopeId: string; axis: string; ok: boolean; runId?: string; error?: string }> = [];
      for (const scopeId of ids) {
        for (const axis of axes) {
          try {
            const r = await engine.enqueueRun({
              axis,
              scopeKind: 'project',
              scopeId,
              workspaceId: wsId,
              metadata: { source: 'fill-all', triggeredAt: new Date().toISOString() },
            });
            results.push({ scopeId, axis, ok: r.ok, runId: r.runId });
          } catch (e) {
            results.push({ scopeId, axis, ok: false, error: (e as Error).message });
          }
        }
      }
      const total = results.length;
      const enqueued = results.filter((r) => r.ok).length;
      return { ok: enqueued > 0, total, enqueued, items: results };
    });

    // 房间子路由
    await fastify.register(createCompassRouter(engine), { prefix: '/compass' });
    await fastify.register(createBoardroomRouter(engine), { prefix: '/boardroom' });
    await fastify.register(createTowerRouter(engine), { prefix: '/tower' });
    await fastify.register(createWarRoomRouter(engine), { prefix: '/war-room' });
    await fastify.register(createSituationRouter(engine), { prefix: '/situation' });
    await fastify.register(createBalconyRouter(engine), { prefix: '/balcony' });
    await fastify.register(createPanoramaRouter(engine), { prefix: '/panorama' });
    await fastify.register(createBrainRouter(engine), { prefix: '/brain' });
    await fastify.register(createPeopleAgentsRouter(engine), { prefix: '/people' });

    // 手动入队接口
    // axis 接受语义化命名 (room-action, e.g. 'warroom-sandbox') 或 legacy 'g1'..'g5'
    const AXIS_RE = /^[a-z][a-z0-9_-]{0,63}$/;
    fastify.post('/runs/enqueue', async (request) => {
      const body = (request.body ?? {}) as Record<string, any>;
      const axis = body.axis as string;
      if (typeof axis !== 'string' || !AXIS_RE.test(axis)) {
        return { ok: false, error: 'axis must match /^[a-z][a-z0-9_-]{0,63}$/' };
      }
      return engine.enqueueRun({
        axis,
        scopeKind: body.scopeKind,
        scopeId: body.scopeId,
        workspaceId: currentWorkspaceId(request),
        metadata: body.metadata,
      });
    });

    // R3-2 — SSE 流式进度
    // GET /api/v1/ceo/runs/:runId/stream → text/event-stream
    // 每 500ms 查 mn_runs 一次, push event; 终态后 done event 关闭
    // 超时 60s 自动关闭 (避免连接泄漏)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    fastify.get('/runs/:runId/stream', async (request, reply) => {
      const { runId } = request.params as { runId: string };
      if (!UUID_RE.test(runId)) {
        reply.status(400);
        return { error: 'invalid runId' };
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Nginx: 关 buffer
      });

      let closed = false;
      const cleanup = () => {
        if (!closed) {
          closed = true;
          try { reply.raw.end(); } catch { /* ignore */ }
        }
      };
      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);

      const startedAt = Date.now();
      const TIMEOUT_MS = 60_000;
      const POLL_MS = 500;

      const tick = async () => {
        if (closed) return;
        if (Date.now() - startedAt > TIMEOUT_MS) {
          try {
            reply.raw.write(`event: timeout\ndata: ${JSON.stringify({ ok: false })}\n\n`);
          } catch { /* ignore */ }
          cleanup();
          return;
        }
        try {
          const r = await engine.deps.db.query(
            `SELECT id::text, module, axis, state, triggered_by, preset, progress_pct,
                    cost_tokens, cost_ms, error_message, started_at, finished_at, created_at,
                    metadata
               FROM mn_runs WHERE id = $1::uuid`,
            [runId],
          );
          if (r.rows.length === 0) {
            reply.raw.write(`event: not-found\ndata: ${JSON.stringify({ runId })}\n\n`);
            cleanup();
            return;
          }
          const row = r.rows[0];
          reply.raw.write(`event: progress\ndata: ${JSON.stringify(row)}\n\n`);
          if (['succeeded', 'failed', 'cancelled'].includes(row.state)) {
            reply.raw.write(`event: done\ndata: ${JSON.stringify({ state: row.state })}\n\n`);
            cleanup();
            return;
          }
        } catch (e) {
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
        }
        if (!closed) setTimeout(tick, POLL_MS);
      };
      tick();
    });
  };
}
