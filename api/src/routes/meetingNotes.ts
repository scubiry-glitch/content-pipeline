// 会议纪要采集渠道 - REST routes
// Mounted under /api/v1/quality (same prefix as rss-sources)

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createHash } from 'node:crypto';
import {
  MeetingNoteChannelService,
  type MeetingNoteChannelService as Service,
} from '../services/meetingNoteChannel.js';
import { authenticate } from '../middleware/auth.js';

export interface MeetingNotesRouteOptions extends FastifyPluginOptions {
  service?: Service;
}

function notFound(err: unknown): boolean {
  return err instanceof Error && /not found/i.test(err.message);
}

function unsupportedKind(err: unknown): boolean {
  return err instanceof Error && /kind/i.test(err.message);
}

export async function meetingNotesRoutes(
  fastify: FastifyInstance,
  opts: MeetingNotesRouteOptions = {},
) {
  const svc: Service = opts.service ?? new MeetingNoteChannelService();

  // List sources
  fastify.get('/meeting-note-sources', { preHandler: authenticate }, async (request) => {
    const q = request.query as { kind?: string; active?: string };
    const filter: { kind?: any; isActive?: boolean } = {};
    if (q.kind) filter.kind = q.kind;
    if (q.active !== undefined) filter.isActive = q.active === 'true';
    const items = await svc.listSources(filter);
    return { items };
  });

  // Create source
  fastify.post('/meeting-note-sources', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as any;
    try {
      const created = await svc.createSource({
        name: body.name,
        kind: body.kind,
        config: body.config ?? {},
        isActive: body.isActive,
        scheduleCron: body.scheduleCron,
        createdBy: body.createdBy,
      });
      reply.status(201);
      return created;
    } catch (err) {
      if (unsupportedKind(err)) {
        reply.status(400);
        return { error: 'Bad Request', message: (err as Error).message };
      }
      throw err;
    }
  });

  // Update source
  fastify.put('/meeting-note-sources/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updated = await svc.updateSource(id, {
      name: body.name,
      config: body.config,
      isActive: body.isActive,
      scheduleCron: body.scheduleCron,
    });
    if (!updated) {
      reply.status(404);
      return { error: 'Not Found', message: `Source ${id} not found` };
    }
    return updated;
  });

  // Delete source
  fastify.delete('/meeting-note-sources/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await svc.deleteSource(id);
    if (!ok) {
      reply.status(404);
      return { error: 'Not Found', message: `Source ${id} not found` };
    }
    return { success: true };
  });

  // Trigger import
  fastify.post('/meeting-note-sources/import', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as { id?: string; triggeredBy?: string };
    if (!body?.id) {
      reply.status(400);
      return { error: 'Bad Request', message: 'id is required' };
    }
    try {
      return await svc.runImport(body.id, body.triggeredBy ?? 'manual');
    } catch (err) {
      if (notFound(err)) {
        reply.status(404);
        return { error: 'Not Found', message: (err as Error).message };
      }
      throw err;
    }
  });

  // Active / pending jobs
  fastify.get('/meeting-note-sources/progress', { preHandler: authenticate }, async () => {
    const jobs = await svc.getActiveJobs();
    return { jobs };
  });

  // History
  fastify.get('/meeting-note-sources/history', { preHandler: authenticate }, async (request) => {
    const q = request.query as { sourceId?: string; limit?: string };
    const limit = q.limit ? Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50)) : 50;
    const items = await svc.getHistory(q.sourceId, limit);
    return { items };
  });

  // Upload file (manual/upload adapter shortcut): parse file bytes → one draft → runImport
  fastify.post('/meeting-note-sources/:id/upload', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const source = await svc.getSource(id);
    if (!source) {
      reply.status(404);
      return { error: 'Not Found', message: `Source ${id} not found` };
    }
    // @ts-ignore multipart plugin adds .file()
    if (typeof (request as any).file !== 'function') {
      reply.status(415);
      return { error: 'Unsupported Media Type', message: 'multipart/form-data required' };
    }
    const mp = await (request as any).file();
    if (!mp) {
      reply.status(400);
      return { error: 'Bad Request', message: 'no file' };
    }
    const chunks: Buffer[] = [];
    for await (const c of mp.file) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const sha = createHash('sha256').update(buf).digest('hex');
    const content = buf.toString('utf8');
    const title = (mp.filename as string | undefined) ?? `upload-${sha.slice(0, 8)}`;

    // Register a one-shot adapter with this single draft
    const oneShot = {
      fetchDrafts: async () => [{
        externalId: `sha256:${sha}`,
        title,
        content,
        metadata: { origin: 'upload', filename: mp.filename, mime: mp.mimetype },
      }],
    };
    // Compose with existing adapters for the source's kind
    // so the service treats it as a normal import.
    const ad = (svc as any).adapters as Record<string, any>;
    const previous = ad?.[source.kind];
    if (ad) ad[source.kind] = oneShot;
    try {
      return await svc.runImport(id, 'upload');
    } finally {
      if (ad) {
        if (previous) ad[source.kind] = previous;
        else delete ad[source.kind];
      }
    }
  });
}
