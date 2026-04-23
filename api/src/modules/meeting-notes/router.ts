// Meeting Notes — Fastify 路由适配层
// PR1: /health + 模块自检
// PR2: /sources/*（ingest 路由）
// PR3: /ingest/parse + /meetings/:id/axes + /meetings/:id/detail + /compute/axis
// PR4: /scopes + /runs + /versions + /crosslinks

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';
import { meetingNotesRoutes as ingestRoutes } from './ingest/routes.js';
import { authenticate } from '../../middleware/auth.js';

export function createRouter(engine: MeetingNotesEngine): FastifyPluginAsync {
  return async function meetingNotesRouter(fastify: FastifyInstance) {
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

    fastify.get('/meetings/:id/axes', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      return engine.getMeetingAxes(id);
    });

    fastify.get('/meetings/:id/detail', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = request.query as { view?: string };
      const view = q.view === 'B' || q.view === 'C' ? q.view : 'A';
      try {
        return await engine.getMeetingDetail(id, view as 'A' | 'B' | 'C');
      } catch (e) {
        reply.status(500);
        return { error: 'Internal Server Error', message: (e as Error).message };
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
      return {
        items: await engine.scopes.list({
          kind: q.kind as any,
          status: q.status as any,
        }),
      };
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

    // --------------------------------------------------------
    // Runs (PR4)
    // --------------------------------------------------------
    fastify.post('/runs', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as any;
      if (!body?.scope || !body?.axis) {
        reply.status(400);
        return { error: 'Bad Request', message: 'scope and axis are required' };
      }
      const r = await engine.enqueueRun({
        scope: body.scope,
        axis: body.axis,
        subDims: body.subDims,
        preset: body.preset,
        strategy: body.strategy,
        triggeredBy: body.triggeredBy,
        parentRunId: body.parentRunId,
      });
      if (!r.ok) reply.status(400);
      return r;
    });

    fastify.get('/runs', { preHandler: authenticate }, async (request) => {
      const q = request.query as any;
      const items = await engine.listRuns({
        scopeKind: q.scopeKind,
        scopeId: q.scopeId ?? null,
        axis: q.axis,
        state: q.state,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return { items };
    });

    fastify.get('/runs/:id', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const r = await engine.getRun(id);
      if (!r) { reply.status(404); return { error: 'Not Found' }; }
      return r;
    });

    fastify.post('/runs/:id/cancel', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await engine.cancelRun(id);
      if (!ok) { reply.status(404); return { error: 'Not Found', message: 'run not cancellable' }; }
      return { success: true };
    });

    // --------------------------------------------------------
    // Versions (PR4)
    // --------------------------------------------------------
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
      const d = await engine.diffVersions(id, q.vs);
      if (!d) { reply.status(404); return { error: 'Not Found' }; }
      return d;
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

    fastify.post('/crosslinks/recompute', { preHandler: authenticate }, async (request) => {
      const body = request.body as { scopeKind?: string; scopeId?: string };
      const result = await engine.crossLinks.recomputeForScope(
        (body?.scopeKind as any) ?? 'library',
        body?.scopeId ?? null,
        null,
      );
      return result;
    });
  };
}
