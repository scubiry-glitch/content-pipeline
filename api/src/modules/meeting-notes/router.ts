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
    // Meetings CRUD (list + create, detail in /meetings/:id/*)
    // --------------------------------------------------------
    fastify.get('/meetings', { preHandler: authenticate }, async (request) => {
      const q = request.query as { limit?: string };
      const limit = Math.min(100, parseInt(q.limit ?? '50', 10));
      const r = await engine.deps.db.query(
        `SELECT
           a.id,
           COALESCE(a.title, a.metadata->>'title', 'Untitled') AS title,
           a.metadata->>'meeting_kind' AS meeting_kind,
           a.created_at,
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
         WHERE a.type = 'meeting_note' OR (a.metadata ? 'meeting_kind')
         ORDER BY a.created_at DESC
         LIMIT $1`,
        [limit],
      );
      // library-scoped runs (not attached to a specific meeting asset)
      const libR = await engine.deps.db.query(
        `SELECT id, scope_kind, axis, state, created_at, finished_at, error_message, metadata
         FROM mn_runs WHERE scope_kind = 'library'
         ORDER BY created_at DESC LIMIT $1`,
        [Math.min(limit, 20)],
      );
      return { items: r.rows, libraryRuns: libR.rows };
    });

    fastify.post('/meetings', { preHandler: authenticate }, async (request, reply) => {
      const body = request.body as { title?: string; meetingKind?: string; metadata?: Record<string, unknown> };
      const meta = { meeting_kind: body.meetingKind ?? 'general', ...(body.metadata ?? {}) };
      const r = await engine.deps.db.query(
        `INSERT INTO assets (id, type, title, content, content_type, metadata)
         VALUES (gen_random_uuid(), 'meeting_note', $1, '', 'meeting_note', $2::jsonb)
         RETURNING id, title, created_at, metadata`,
        [body.title ?? 'New Meeting', JSON.stringify(meta)],
      );
      reply.status(201);
      return r.rows[0];
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
    // Phase 15.8 · AxisProjects data routes (decisions / assumptions / open-questions / risks)
    // --------------------------------------------------------
    fastify.get('/scopes/:id/decisions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const r = await engine.deps.db.query(
        `SELECT d.id, d.meeting_id, d.title, d.proposer_person_id,
                d.based_on_ids, d.superseded_by_id, d.confidence, d.is_current, d.rationale,
                d.created_at,
                p.canonical_name AS proposer_name
           FROM mn_decisions d
           LEFT JOIN mn_people p ON p.id = d.proposer_person_id
          WHERE d.scope_id = $1
          ORDER BY d.created_at ASC`,
        [id],
      );
      return { items: r.rows };
    });

    fastify.get('/scopes/:id/assumptions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const r = await engine.deps.db.query(
        `SELECT a.id, a.meeting_id, a.text, a.evidence_grade, a.verification_state,
                a.verifier_person_id, a.due_at, a.underpins_decision_ids,
                a.confidence, a.created_at, a.updated_at,
                p.canonical_name AS verifier_name
           FROM mn_assumptions a
           LEFT JOIN mn_people p ON p.id = a.verifier_person_id
          WHERE a.scope_id = $1
          ORDER BY a.created_at DESC`,
        [id],
      );
      return { items: r.rows };
    });

    fastify.get('/scopes/:id/open-questions', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const q = request.query as { status?: string; category?: string };
      const conds: string[] = ['scope_id = $1'];
      const args: unknown[] = [id];
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
      const r = await engine.deps.db.query(
        `SELECT id, text, severity, mention_count, heat_score, trend,
                action_taken, metadata, created_at, updated_at
           FROM mn_risks
          WHERE scope_id = $1
          ORDER BY heat_score DESC, mention_count DESC`,
        [id],
      );
      return { items: r.rows };
    });

    // Phase 15.11 · AxisMeta · Necessity audit (mn_meeting_necessity)
    fastify.get('/meetings/:id/necessity-audit', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const r = await engine.deps.db.query(
        `SELECT meeting_id, verdict, suggested_duration_min, reasons, computed_at
           FROM mn_meeting_necessity
          WHERE meeting_id = $1`,
        [id],
      );
      if (r.rows.length === 0) return null;
      return r.rows[0];
    });

    // Phase 15.12 · AxisPeople · Silence signals (mn_silence_signals)
    fastify.get('/meetings/:id/silence', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
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
      const r = await engine.deps.db.query(
        `SELECT meeting_id, samples, tension_peaks, insight_points, computed_at
           FROM mn_affect_curve
          WHERE meeting_id = $1`,
        [id],
      );
      if (r.rows.length === 0) return null;
      return r.rows[0];
    });

    // Phase 15.10 · AxisKnowledge · Judgments (mn_judgments) + Mental Model Hit Rate (mn_mental_model_hit_stats)
    fastify.get('/scopes/:id/judgments', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
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
        [id],
      );
      return { items: r.rows };
    });

    fastify.get('/scopes/:id/mental-models/hit-rate', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const r = await engine.deps.db.query(
        `SELECT id, model_name, invocations, hits, hit_rate, trend_30d, flag,
                computed_at
           FROM mn_mental_model_hit_stats
          WHERE scope_id = $1
          ORDER BY hit_rate DESC, invocations DESC`,
        [id],
      );
      return { items: r.rows };
    });

    // Phase 15.9 · AxisPeople · Commitments (mn_commitments)
    fastify.get('/scopes/:id/commitments', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
      const q = request.query as { personId?: string; state?: string };
      const conds: string[] = [
        `c.meeting_id IN (SELECT meeting_id::uuid FROM mn_scope_members WHERE scope_id = $1)`,
      ];
      const args: unknown[] = [id];
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
    });

    // Provenance chain · 从一个 decision 往回追 N 层 based_on_ids
    fastify.get('/scopes/:id/provenance', { preHandler: authenticate }, async (request) => {
      const { id } = request.params as { id: string };
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
        [q.decisionId, id, maxDepth],
      );
      return { decisionId: q.decisionId, chain: r.rows };
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
