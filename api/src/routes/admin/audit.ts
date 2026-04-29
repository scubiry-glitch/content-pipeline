// /api/admin/audit/* — 审计日志查看 (仅 super_admin)

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/connection.js';
import { requireSuperAdmin } from '../../middleware/auth.js';

export async function adminAuditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireSuperAdmin);

  // GET /api/admin/audit?event=&email=&userId=&since=&limit=
  // - event: 单值或逗号分隔
  // - email / userId: 精确匹配
  // - since: ISO 时间戳, 默认 7 天前
  // - limit: 默认 100, 最大 500
  fastify.get('/', async (request) => {
    const q = request.query as {
      event?: string; email?: string; userId?: string; since?: string; limit?: string;
    };
    const limit = Math.min(500, Math.max(1, parseInt(q.limit || '100', 10) || 100));
    const since = q.since ? new Date(q.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(since.getTime())) {
      return { items: [], total: 0, error: 'invalid since' };
    }

    const conds: string[] = ['created_at >= $1'];
    const args: any[] = [since.toISOString()];

    if (q.event) {
      const events = q.event.split(',').map((s) => s.trim()).filter(Boolean);
      if (events.length > 0) {
        args.push(events);
        conds.push(`event = ANY($${args.length}::text[])`);
      }
    }
    if (q.email) {
      args.push(q.email.trim().toLowerCase());
      conds.push(`email = $${args.length}`);
    }
    if (q.userId) {
      args.push(q.userId);
      conds.push(`user_id = $${args.length}`);
    }
    args.push(limit);

    const where = conds.join(' AND ');
    const rows = await query<{
      id: string;
      user_id: string | null;
      email: string | null;
      event: string;
      ip: string | null;
      user_agent: string | null;
      metadata: any;
      created_at: Date;
    }>(
      `SELECT id, user_id, email, event, ip::text AS ip, user_agent, metadata, created_at
         FROM auth_audit_log
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${args.length}`,
      args,
    );

    const items = rows.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      event: r.event,
      ip: r.ip,
      userAgent: r.user_agent,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
    return { items, total: items.length, limit, since: since.toISOString() };
  });

  // GET /api/admin/audit/stats?days=7
  // 按 event 聚合, 用于面板小卡片
  fastify.get('/stats', async (request) => {
    const q = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, parseInt(q.days || '7', 10) || 7));
    const r = await query<{ event: string; n: string }>(
      `SELECT event, count(*)::text AS n
         FROM auth_audit_log
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY event
        ORDER BY n DESC`,
      [days],
    );
    return {
      windowDays: days,
      counts: r.rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.event] = parseInt(row.n, 10);
        return acc;
      }, {}),
    };
  });

  // GET /api/admin/audit/locked-accounts
  // 当前处于锁定中 (最近 30min 内有 login.locked) 的邮箱列表
  fastify.get('/locked-accounts', async () => {
    const r = await query<{ email: string; locked_at: Date }>(
      `SELECT email, MAX(created_at) AS locked_at
         FROM auth_audit_log
        WHERE event = 'login.locked'
          AND created_at > NOW() - INTERVAL '30 minutes'
          AND email IS NOT NULL
        GROUP BY email
        ORDER BY locked_at DESC`,
    );
    return {
      items: r.rows.map((row) => ({
        email: row.email,
        lockedAt: row.locked_at,
        retryAfterSeconds: Math.max(
          0,
          Math.ceil(
            (new Date(row.locked_at).getTime() + 30 * 60 * 1000 - Date.now()) / 1000,
          ),
        ),
      })),
    };
  });

  // POST /api/admin/audit/unlock { email }
  // 手动解锁账号 (写一条 login.locked + 标记已解锁? 这里更简单: 直接清最近的 login.failure
  // 与 login.locked 让 checkEmailLock 视窗内为零)
  fastify.post('/unlock', async (request, reply) => {
    const body = (request.body || {}) as { email?: string };
    const email = (body.email || '').trim().toLowerCase();
    if (!email) {
      reply.status(400);
      return { error: 'Bad Request', message: 'email required', code: 'INVALID_INPUT' };
    }
    const r = await query(
      `DELETE FROM auth_audit_log
        WHERE email = $1
          AND event IN ('login.failure', 'login.locked')
          AND created_at > NOW() - INTERVAL '60 minutes'`,
      [email],
    );
    return { ok: true, removed: (r as any).rowCount ?? 0 };
  });
}
