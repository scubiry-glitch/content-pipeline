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
import { emitImportWebhook, emitUploadedWebhook } from './importWebhook.js';
import type { MeetingNotesEngine } from '../MeetingNotesEngine.js';

export interface MeetingNotesRouteOptions extends FastifyPluginOptions {
  service?: Service;
  /** 路径前缀；默认 '/meeting-note-sources' 保留历史 alias，新挂载传 '/sources' */
  pathPrefix?: string;
  /** MeetingNotesEngine 实例；如需 autoParse 自动触发分析则必传 */
  engine?: MeetingNotesEngine;
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

function isUuid(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
}

function parseOptionalUuid(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (!v) return null;
  return isUuid(v) ? v : '__invalid__';
}

function fieldValue(fields: Record<string, any> | undefined, key: string): string | undefined {
  const v = fields?.[key]?.value;
  return typeof v === 'string' ? v : undefined;
}

function parseBooleanField(fields: Record<string, any> | undefined, key: string): boolean {
  const v = fieldValue(fields, key) ?? fieldValue(fields, key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()));
  if (v === undefined || v === null || v === '') return true; // 默认 true
  const lowered = v.trim().toLowerCase();
  return lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'on';
}

const VALID_RUN_MODES = ['multi-axis', 'claude-cli', 'api-oneshot'] as const;
const VALID_PRESETS = ['lite', 'standard', 'max'] as const;
type RunModeT = typeof VALID_RUN_MODES[number];
type PresetT = typeof VALID_PRESETS[number];

function pickRunMode(value: string | undefined, fallback: RunModeT): RunModeT | null {
  if (value === undefined || value === '') return fallback;
  return (VALID_RUN_MODES as readonly string[]).includes(value) ? (value as RunModeT) : null;
}

function pickPreset(value: string | undefined, fallback: PresetT): PresetT | null {
  if (value === undefined || value === '') return fallback;
  return (VALID_PRESETS as readonly string[]).includes(value) ? (value as PresetT) : null;
}

function parseExpertRolesField(value: string | undefined):
  | { people?: string[]; projects?: string[]; knowledge?: string[] }
  | null
  | undefined
{
  if (value === undefined || value === '') return undefined;
  try {
    const obj = JSON.parse(value);
    if (!obj || typeof obj !== 'object') return null;
    const out: { people?: string[]; projects?: string[]; knowledge?: string[] } = {};
    for (const k of ['people', 'projects', 'knowledge'] as const) {
      const arr = (obj as any)[k];
      if (Array.isArray(arr)) {
        const cleaned = arr.filter((x: any) => typeof x === 'string' && x.trim().length > 0);
        if (cleaned.length > 0) out[k] = cleaned;
      }
    }
    return out;
  } catch {
    return null;
  }
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
  const engine = opts.engine;
  const p = opts.pathPrefix ?? '/meeting-note-sources';

  // Workspace 守卫: :id 路径验证 source 属于当前 workspace, 跨 ws 一律 404
  fastify.addHook('preHandler', async (request, reply) => {
    const params = (request.params as Record<string, string> | undefined) ?? {};
    const id = params.id;
    if (!id) return;
    if (!isUuid(id)) {
      return reply.code(400).send({ error: 'Bad Request', message: 'invalid source id' });
    }
    if (!request.auth) {
      await authenticate(request, reply);
      if (reply.sent) return;
    }
    const wsId = currentWorkspaceId(request);
    if (!wsId) return;
    const ok = await assertRowInWorkspace('meeting_note_sources', 'id', id, wsId);
    if (!ok) {
      return reply.code(404).send({ error: 'Not Found', message: `Source ${id} not found` });
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
    const body = request.body as {
      id?: string;
      triggeredBy?: string;
      callbackUrl?: string;
      callbackSecret?: string;
      workspaceId?: string;
      userId?: string;
      scopeKind?: string;
      scopeId?: string;
    };
    if (!body?.id) {
      reply.status(400);
      return { error: 'Bad Request', message: 'id is required' };
    }
    try {
      const result = await svc.runImport(body.id, body.triggeredBy ?? 'manual');
      if (body.callbackUrl) {
        const source = await svc.getSource(body.id).catch(() => null);
        setImmediate(() => {
          void emitImportWebhook({
            sourceId: body.id as string,
            sourceName: source?.name,
            triggeredBy: body.triggeredBy ?? 'manual',
            importResult: result as any,
            callbackUrl: body.callbackUrl,
            callbackSecret: body.callbackSecret ?? null,
            context: {
              workspaceId: body.workspaceId ?? null,
              userId: body.userId ?? null,
              scopeKind: body.scopeKind ?? null,
              scopeId: body.scopeId ?? null,
            },
          });
        });
      }
      return result;
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
      const result = await svc.runImport(id, 'upload');
      const callbackUrl = fieldValue((mp as any).fields, 'callbackUrl') ?? fieldValue((mp as any).fields, 'callback_url');
      const callbackSecret = fieldValue((mp as any).fields, 'callbackSecret') ?? fieldValue((mp as any).fields, 'callback_secret');
      const autoParse = parseBooleanField((mp as any).fields, 'autoParse');
      if (autoParse && engine && result.assetIds?.length > 0) {
        setImmediate(() => {
          for (const assetId of result.assetIds) {
            engine.parseMeeting(assetId).catch((err) => {
              console.warn('[autoParse] failed after upload:', err);
            });
          }
        });
      }
      if (callbackUrl) {
        setImmediate(() => {
          void emitImportWebhook({
            sourceId: id,
            sourceName: source.name,
            triggeredBy: 'upload',
            importResult: result as any,
            callbackUrl,
            callbackSecret: callbackSecret ?? null,
            context: {
              workspaceId: currentWorkspaceId(request),
              userId: request.auth?.user?.id ?? null,
            },
          });
        });
      }
      return result;
    } finally {
      if (ad) {
        if (previous) ad[source.kind] = previous;
        else delete ad[source.kind];
      }
    }
  });

  // External API: single-call upload task (auto source + optional webhook callback)
  fastify.post(`${p}/upload-task`, { preHandler: authenticate }, async (request, reply) => {
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

    let sourceId = fieldValue((mp as any).fields, 'sourceId') ?? fieldValue((mp as any).fields, 'source_id');
    if (sourceId && !isUuid(sourceId)) {
      reply.status(400);
      return { error: 'Bad Request', message: 'invalid sourceId' };
    }
    const workspaceIdRaw = parseOptionalUuid(
      fieldValue((mp as any).fields, 'workspaceId') ?? fieldValue((mp as any).fields, 'workspace_id'),
    );
    if (workspaceIdRaw === '__invalid__') {
      reply.status(400);
      return { error: 'Bad Request', message: 'invalid workspaceId' };
    }
    const scopeIdRaw = parseOptionalUuid(
      fieldValue((mp as any).fields, 'scopeId') ?? fieldValue((mp as any).fields, 'scope_id'),
    );
    if (scopeIdRaw === '__invalid__') {
      reply.status(400);
      return { error: 'Bad Request', message: 'invalid scopeId' };
    }
    const scopeKind = fieldValue((mp as any).fields, 'scopeKind') ?? fieldValue((mp as any).fields, 'scope_kind') ?? null;
    const userId = fieldValue((mp as any).fields, 'userId') ?? fieldValue((mp as any).fields, 'user_id') ?? request.auth?.user?.id ?? null;
    const effectiveWorkspaceId = workspaceIdRaw || currentWorkspaceId(request);
    const callbackUrl = fieldValue((mp as any).fields, 'callbackUrl') ?? fieldValue((mp as any).fields, 'callback_url');
    const callbackSecret = fieldValue((mp as any).fields, 'callbackSecret') ?? fieldValue((mp as any).fields, 'callback_secret');

    if (!sourceId) {
      const listed = await svc.listSources({ workspaceId: effectiveWorkspaceId ?? undefined });
      sourceId = listed.find((s) => s.kind === 'upload' || s.kind === 'manual')?.id ?? listed[0]?.id;
      if (!sourceId) {
        const created = await svc.createSource({
          name: '默认上传来源',
          kind: 'upload',
          config: callbackUrl ? { callbackUrl, callbackSecret: callbackSecret ?? null } : {},
          isActive: true,
          createdBy: userId,
          workspaceId: effectiveWorkspaceId ?? undefined,
        });
        sourceId = created.id;
      }
    }
    if (!sourceId) {
      reply.status(500);
      return { error: 'Internal Server Error', message: 'failed to resolve source' };
    }

    const source = await svc.getSource(sourceId);
    if (!source) {
      reply.status(404);
      return { error: 'Not Found', message: `Source ${sourceId} not found` };
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

    await fs.mkdir(meetingUploadDir, { recursive: true });
    await fs.writeFile(localFilePath, buf);

    const content = await textFromUploadBuffer(buf, mp.filename as string | undefined, mp.mimetype);
    if (!content.trim()) {
      reply.status(400);
      return { error: 'Bad Request', message: 'file is empty or unreadable as text' };
    }

    // 分析参数：请求级 > source.config.defaults > 系统默认
    const sourceDefaults = ((source.config as any)?.defaults ?? {}) as Record<string, any>;
    const fallbackMode: RunModeT =
      typeof sourceDefaults.mode === 'string' && (VALID_RUN_MODES as readonly string[]).includes(sourceDefaults.mode)
        ? (sourceDefaults.mode as RunModeT)
        : 'api-oneshot';
    const fallbackPreset: PresetT =
      typeof sourceDefaults.preset === 'string' && (VALID_PRESETS as readonly string[]).includes(sourceDefaults.preset)
        ? (sourceDefaults.preset as PresetT)
        : 'standard';

    const requestedMode = fieldValue((mp as any).fields, 'mode');
    const requestedPreset = fieldValue((mp as any).fields, 'preset');
    const requestedAxisRaw = fieldValue((mp as any).fields, 'axis') ?? '';
    const requestedExpertRolesRaw = fieldValue((mp as any).fields, 'expertRoles');

    const runMode = pickRunMode(requestedMode, fallbackMode);
    if (runMode === null) {
      reply.status(400);
      return { error: 'Bad Request', message: `invalid mode (allowed: ${VALID_RUN_MODES.join('/')})` };
    }
    const runPreset = pickPreset(requestedPreset, fallbackPreset);
    if (runPreset === null) {
      reply.status(400);
      return { error: 'Bad Request', message: `invalid preset (allowed: ${VALID_PRESETS.join('/')})` };
    }
    const runAxis = (requestedAxisRaw && requestedAxisRaw.trim().length > 0
      ? requestedAxisRaw.trim()
      : (typeof sourceDefaults.axis === 'string' && sourceDefaults.axis ? sourceDefaults.axis : 'all'));
    const runExpertRoles = (() => {
      if (requestedExpertRolesRaw !== undefined) {
        const parsed = parseExpertRolesField(requestedExpertRolesRaw);
        if (parsed === null) {
          // 解析失败也返回 400
          return '__invalid__' as const;
        }
        return parsed;
      }
      const fromDefaults = sourceDefaults.expertRoles;
      if (fromDefaults && typeof fromDefaults === 'object') {
        return fromDefaults as { people?: string[]; projects?: string[]; knowledge?: string[] };
      }
      return undefined;
    })();
    if (runExpertRoles === '__invalid__') {
      reply.status(400);
      return { error: 'Bad Request', message: 'invalid expertRoles (must be JSON object with optional people/projects/knowledge string arrays)' };
    }

    const oneShot = {
      fetchDrafts: async () => [{
        externalId: `sha256:${sha}`,
        title: originalFilename,
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
    const ad = (svc as any).adapters as Record<string, any>;
    const previous = ad?.[source.kind];
    if (ad) ad[source.kind] = oneShot;
    try {
      const result = await svc.runImport(source.id, 'upload');
      const autoParse = parseBooleanField((mp as any).fields, 'autoParse');
      const effectiveCallbackUrl = callbackUrl || (source.config as any)?.callbackUrl || null;
      const effectiveCallbackSecret = callbackSecret || (source.config as any)?.callbackSecret || null;
      const callbackContext = {
        workspaceId: effectiveWorkspaceId,
        userId,
        scopeKind,
        scopeId: scopeIdRaw === '__invalid__' ? null : scopeIdRaw,
      };

      // autoParse=true：parseMeeting + enqueue 分析 run；同时把回调配置写进 mn_runs.metadata.callback
      // 让 stage 2 webhook 订阅器能读到。autoParse=false：assetId 列表里 runId 全部为 null。
      const runEntries: Array<{ id: string | null; assetId: string; state: string; mode: string }> = [];
      if (autoParse && engine && result.assetIds && result.assetIds.length > 0) {
        for (const assetId of result.assetIds) {
          // parseMeeting 异步启动；run 入队不等它（worker 取到 run 时会兜底抽取参与者）
          setImmediate(() => {
            engine.parseMeeting(assetId).catch((err) => {
              console.warn('[autoParse] parseMeeting failed:', err);
            });
          });

          try {
            const enq = await engine.runEngine.enqueue({
              scope: { kind: 'meeting', id: assetId },
              axis: runAxis as any,
              preset: runPreset,
              triggeredBy: 'auto',
              mode: runMode,
              expertRoles: runExpertRoles && typeof runExpertRoles === 'object' ? runExpertRoles : undefined,
              workspaceId: effectiveWorkspaceId ?? undefined,
              triggerMeetingId: assetId,
            });
            if (enq.ok && enq.runId) {
              runEntries.push({ id: enq.runId, assetId, state: 'queued', mode: runMode });
              // 持久化 callback 配置到 mn_runs.metadata.callback；分析完成时订阅器会读
              if (effectiveCallbackUrl) {
                try {
                  await engine.deps.db.query(
                    `UPDATE mn_runs
                        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('callback', $2::jsonb)
                      WHERE id = $1::uuid`,
                    [
                      enq.runId,
                      JSON.stringify({
                        callbackUrl: effectiveCallbackUrl,
                        callbackSecret: effectiveCallbackSecret,
                        context: callbackContext,
                      }),
                    ],
                  );
                } catch (e) {
                  console.warn('[autoParse] persist run callback failed:', (e as Error).message);
                }
              }
            } else {
              runEntries.push({ id: null, assetId, state: 'enqueue-failed', mode: runMode });
              console.warn('[autoParse] enqueue rejected:', enq.reason);
            }
          } catch (err) {
            runEntries.push({ id: null, assetId, state: 'enqueue-error', mode: runMode });
            console.warn('[autoParse] enqueue threw:', (err as Error).message);
          }
        }
      } else if (result.assetIds && result.assetIds.length > 0) {
        for (const assetId of result.assetIds) {
          runEntries.push({ id: null, assetId, state: 'skipped', mode: runMode });
        }
      }

      // Stage 1 webhook：会议纪要已上传
      if (effectiveCallbackUrl) {
        const webhookAssets = runEntries.map((r) => ({
          assetId: r.assetId,
          runId: r.id,
          mode: r.id ? r.mode : null,
        }));
        setImmediate(() => {
          void emitUploadedWebhook({
            sourceId: source.id,
            sourceName: source.name,
            fileTitle: originalFilename,
            triggeredBy: 'upload',
            importResult: result as any,
            assets: webhookAssets,
            callbackUrl: effectiveCallbackUrl,
            callbackSecret: effectiveCallbackSecret,
            context: callbackContext,
          });
        });
      }

      reply.code(202);
      return {
        sourceId: source.id,
        context: callbackContext,
        import: result,
        runs: runEntries.filter((r) => r.id).map((r) => ({
          id: r.id,
          assetId: r.assetId,
          state: r.state,
          mode: r.mode,
        })),
        callback: effectiveCallbackUrl ? { sentAsync: true, callbackUrl: effectiveCallbackUrl } : null,
      };
    } finally {
      if (ad) {
        if (previous) ad[source.kind] = previous;
        else delete ad[source.kind];
      }
    }
  });
}
