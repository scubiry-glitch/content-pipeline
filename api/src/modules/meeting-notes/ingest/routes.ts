// 会议纪要采集渠道 REST routes — 吸收自原 routes/meetingNotes.ts
//
// 本插件可在两个位置挂载（PR2 起）：
//   1. /api/v1/quality/meeting-note-sources/*   (alias，保留历史 URL)
//   2. /api/v1/meeting-notes/sources/*          (新规范路径，由 modules 路由注册)
//
// 区别仅在 pathPrefix option：默认 '/meeting-note-sources' 保留历史兼容；
// 新路由注册时传 pathPrefix: '/sources' 获得更短 URL。

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import {
  MeetingNoteChannelService,
  type MeetingNoteChannelService as Service,
} from './meetingNoteChannelService.js';
import { authenticate } from '../../../middleware/auth.js';
import { assertRowInWorkspace, currentWorkspaceId } from '../../../db/repos/withWorkspace.js';

export interface MeetingNotesRouteOptions extends FastifyPluginOptions {
  service?: Service;
  /** 路径前缀；默认 '/meeting-note-sources' 保留历史 alias，新挂载传 '/sources' */
  pathPrefix?: string;
}

function notFound(err: unknown): boolean {
  return err instanceof Error && /not found/i.test(err.message);
}

function unsupportedKind(err: unknown): boolean {
  return err instanceof Error && /kind/i.test(err.message);
}

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** 从上传字节解析正文：.docx 用 mammoth，其余按 UTF-8 文本。 */
async function textFromUploadBuffer(
  buf: Buffer,
  filename?: string,
  mime?: string,
): Promise<string> {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.docx') || (mime && mime.includes('wordprocessingml'))) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value || '').trim();
  }
  return buf.toString('utf8');
}

export async function meetingNotesRoutes(
  fastify: FastifyInstance,
  opts: MeetingNotesRouteOptions = {},
) {
  const svc: Service = opts.service ?? new MeetingNoteChannelService();
  const p = opts.pathPrefix ?? '/meeting-note-sources';

  // Workspace 守卫: :id 路径验证 source 属于当前 workspace, 跨 ws 一律 404
  fastify.addHook('preHandler', async (request, reply) => {
    const params = (request.params as Record<string, string> | undefined) ?? {};
    const id = params.id;
    if (!id) return;
    if (!request.auth) {
      await authenticate(request, reply);
      if (reply.sent) return;
    }
    const wsId = currentWorkspaceId(request);
    if (!wsId) return;
    const ok = await assertRowInWorkspace('meeting_note_sources', 'id', id, wsId);
    if (!ok) {
      reply.code(404).send({ error: 'Not Found', message: `Source ${id} not found` });
    }
  });

  // List sources
  fastify.get(p, { preHandler: authenticate }, async (request) => {
    const q = request.query as { kind?: string; active?: string };
    const filter: { kind?: any; isActive?: boolean; workspaceId?: string } = {};
    if (q.kind) filter.kind = q.kind;
    if (q.active !== undefined) filter.isActive = q.active === 'true';
    filter.workspaceId = currentWorkspaceId(request) ?? undefined;
    const items = await svc.listSources(filter);
    return { items };
  });

  // Create source
  fastify.post(p, { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as any;
    try {
      const created = await svc.createSource({
        name: body.name,
        kind: body.kind,
        config: body.config ?? {},
        isActive: body.isActive,
        scheduleCron: body.scheduleCron,
        createdBy: body.createdBy,
        workspaceId: currentWorkspaceId(request) ?? undefined,
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
  fastify.put(`${p}/:id`, { preHandler: authenticate }, async (request, reply) => {
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
  fastify.delete(`${p}/:id`, { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await svc.deleteSource(id);
    if (!ok) {
      reply.status(404);
      return { error: 'Not Found', message: `Source ${id} not found` };
    }
    return { success: true };
  });

  // Trigger import
  fastify.post(`${p}/import`, { preHandler: authenticate }, async (request, reply) => {
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
  fastify.get(`${p}/progress`, { preHandler: authenticate }, async () => {
    const jobs = await svc.getActiveJobs();
    return { jobs };
  });

  // History
  fastify.get(`${p}/history`, { preHandler: authenticate }, async (request) => {
    const q = request.query as { sourceId?: string; limit?: string };
    const limit = q.limit ? Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50)) : 50;
    const items = await svc.getHistory(q.sourceId, limit);
    return { items };
  });

  // Paste text (JSON or text/plain) → one-shot adapter → runImport
  fastify.post(`${p}/:id/ingest-text`, { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const source = await svc.getSource(id);
    if (!source) {
      reply.status(404);
      return { error: 'Not Found', message: `Source ${id} not found` };
    }

    let title = '';
    let content = '';
    const ct = (request.headers['content-type'] || '').toLowerCase();
    if (ct.includes('text/plain')) {
      content = typeof request.body === 'string' ? request.body : String(request.body ?? '');
      title = (request.headers['x-title'] as string | undefined)
        ?? `pasted-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`;
    } else {
      const body = (request.body ?? {}) as { title?: string; content?: string };
      title = (body.title || '').trim();
      content = body.content || '';
    }

    if (!content.trim()) {
      reply.status(400);
      return { error: 'Bad Request', message: 'content is required' };
    }
    if (!title) {
      title = `pasted-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`;
    }

    const sha = createHash('sha256').update(`${title}\n${content}`).digest('hex');
    const oneShot = {
      fetchDrafts: async () => [{
        externalId: `paste:${sha}`,
        title,
        content,
        metadata: { origin: 'paste' },
      }],
    };
    const ad = (svc as any).adapters as Record<string, any>;
    const previous = ad?.[source.kind];
    if (ad) ad[source.kind] = oneShot;
    try {
      return await svc.runImport(id, 'paste');
    } finally {
      if (ad) {
        if (previous) ad[source.kind] = previous;
        else delete ad[source.kind];
      }
    }
  });

  // Upload file (manual/upload adapter shortcut): parse file bytes → one draft → runImport
  fastify.post(`${p}/:id/upload`, { preHandler: authenticate }, async (request, reply) => {
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
    const uploadRoot = process.env.UPLOAD_DIR || './uploads';
    const meetingUploadDir = path.join(uploadRoot, 'meeting-notes');
    const originalFilename = (mp.filename as string | undefined) ?? `upload-${sha.slice(0, 8)}`;
    const safeFilename = sanitizeFilename(originalFilename);
    const localFilePath = path.join(meetingUploadDir, `${sha.slice(0, 12)}-${safeFilename}`);

    try {
      await fs.mkdir(meetingUploadDir, { recursive: true });
      await fs.writeFile(localFilePath, buf);
    } catch (e) {
      reply.status(500);
      return { error: 'Internal Server Error', message: `failed to persist uploaded file: ${(e as Error).message}` };
    }

    let content: string;
    try {
      content = await textFromUploadBuffer(buf, mp.filename as string | undefined, mp.mimetype);
    } catch (e) {
      reply.status(400);
      return { error: 'Bad Request', message: (e as Error).message || 'failed to read file' };
    }
    if (!content.trim()) {
      reply.status(400);
      return { error: 'Bad Request', message: 'file is empty or unreadable as text' };
    }
    const title = originalFilename;

    // Register a one-shot adapter with this single draft
    const oneShot = {
      fetchDrafts: async () => [{
        externalId: `sha256:${sha}`,
        title,
        content,
        metadata: {
          origin: 'upload',
          filename: mp.filename,
          mime: mp.mimetype,
          sha256: sha,
          sizeBytes: buf.byteLength,
          localFilePath,
        },
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
