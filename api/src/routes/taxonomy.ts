// Two-level taxonomy routes.
// - Read endpoints (flat/tree/usage) are public; they power shared front-end components.
// - Write endpoints are admin-only (same API-key as other internal writes).

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  sync,
  listAll,
  getTree,
  create,
  update,
  getUsage,
  listAudit,
  resolve,
  exportConfig,
} from '../services/taxonomyService.js';

const createSchema = z.object({
  code: z.string().min(3).max(20),
  parent_code: z.string().min(3).max(20).nullable().optional(),
  name: z.string().min(1).max(100),
  icon: z.string().max(20).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(20).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});

export async function taxonomyRoutes(fastify: FastifyInstance) {
  // ---------- Public reads ----------

  fastify.get('/domains', async (request) => {
    const q = request.query as { include_inactive?: string };
    const includeInactive = q.include_inactive === 'true' || q.include_inactive === '1';
    const rows = await listAll({ includeInactive });
    return { data: rows };
  });

  fastify.get('/domains/tree', async (request) => {
    const q = request.query as { include_inactive?: string };
    const includeInactive = q.include_inactive === 'true' || q.include_inactive === '1';
    const tree = await getTree({ includeInactive });
    return { data: tree };
  });

  fastify.get('/domains/:code/usage', async (request, reply) => {
    const { code } = request.params as { code: string };
    if (!code) {
      reply.status(400);
      return { error: 'code is required', code: 'BAD_REQUEST' };
    }
    return { data: await getUsage(code) };
  });

  fastify.get('/resolve', async (request) => {
    const { text } = request.query as { text?: string };
    return { data: { code: resolve(text) } };
  });

  // ---------- Admin writes ----------

  fastify.post('/domains', { preHandler: authenticate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: parsed.error.issues, code: 'BAD_REQUEST' };
    }
    try {
      const actor = ((request as any).user?.id as string) || 'admin';
      const node = await create(parsed.data, actor);
      return { data: node };
    } catch (err) {
      reply.status(400);
      return { error: (err as Error).message, code: 'BAD_REQUEST' };
    }
  });

  fastify.patch('/domains/:code', { preHandler: authenticate }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: parsed.error.issues, code: 'BAD_REQUEST' };
    }
    try {
      const actor = ((request as any).user?.id as string) || 'admin';
      const node = await update(code, parsed.data, actor);
      return { data: node };
    } catch (err) {
      reply.status(400);
      return { error: (err as Error).message, code: 'BAD_REQUEST' };
    }
  });

  fastify.post('/sync', { preHandler: authenticate }, async (request) => {
    const actor = ((request as any).user?.id as string) || 'admin';
    return { data: await sync(actor) };
  });

  fastify.get('/export', { preHandler: authenticate }, async (_request, reply) => {
    const src = await exportConfig();
    reply.type('text/plain; charset=utf-8');
    return src;
  });

  fastify.get('/audit', { preHandler: authenticate }, async (request) => {
    const { code, limit } = request.query as { code?: string; limit?: string };
    const n = Math.min(parseInt(limit || '50', 10) || 50, 500);
    const rows = await listAudit(code || null, n);
    return { data: rows };
  });
}
