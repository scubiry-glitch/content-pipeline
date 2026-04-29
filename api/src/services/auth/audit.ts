// 认证审计日志 + 登录失败锁定
//
// 写日志: writeAuditEvent({ event, userId?, email?, request?, metadata? })
// 锁定查询: isEmailLocked(email) -> { locked, retryAfterSeconds? }
//
// 表结构在 migrations/036-auth-audit-log.sql

import type { FastifyRequest } from 'fastify';
import { query } from '../../db/connection.js';

export type AuditEvent =
  | 'login.success'
  | 'login.failure'
  | 'login.locked'
  | 'logout'
  | 'password.change'
  | 'password.reset'
  | 'user.create'
  | 'user.disable'
  | 'workspace.delete';

export interface WriteAuditInput {
  event: AuditEvent;
  userId?: string | null;
  email?: string | null;
  request?: FastifyRequest;
  metadata?: Record<string, unknown>;
}

/** 尽力而为: 失败不抛, 仅 console.warn (审计写不上不应阻断业务路径) */
export async function writeAuditEvent(input: WriteAuditInput): Promise<void> {
  const ip = input.request ? extractIp(input.request) : null;
  const userAgent = input.request?.headers['user-agent']?.toString().slice(0, 512) ?? null;
  try {
    await query(
      `INSERT INTO auth_audit_log (user_id, email, event, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4::inet, $5, $6::jsonb)`,
      [
        input.userId ?? null,
        input.email ?? null,
        input.event,
        ip,
        userAgent,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch (err) {
    console.warn('[Audit] write failed:', (err as Error).message);
  }
}

function extractIp(request: FastifyRequest): string | null {
  // 优先 X-Forwarded-For (反代场景), 退到 socket
  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  const ra = request.ip;
  return ra && ra.length > 0 ? ra : null;
}

// ============================================================
// 登录失败锁定
// ============================================================

const LOCK_WINDOW_MS = 15 * 60 * 1000;          // 15 分钟内
const LOCK_FAILURE_THRESHOLD = 5;                // 失败 ≥5 次
const LOCK_DURATION_MS = 30 * 60 * 1000;         // 锁 30 分钟

export interface LockStatus {
  locked: boolean;
  /** 距离解锁还需要多少秒; 仅 locked=true 时设置 */
  retryAfterSeconds?: number;
  /** 当前窗口内累计失败次数 */
  recentFailures: number;
}

/**
 * 判断 email 是否处于锁定中.
 *
 * 逻辑: 看最近 30 分钟内 (LOCK_DURATION_MS) 是否有锁定记录, 没有的话再看 15 分钟内
 * (LOCK_WINDOW_MS) 是否累计 5 次失败. 一次锁定写入 'login.locked' event 后, 在 30
 * 分钟内一直拒登 — 这个语义比"达到 5 次自然冷却"更可控.
 */
export async function checkEmailLock(email: string): Promise<LockStatus> {
  if (!email) return { locked: false, recentFailures: 0 };

  // 1. 是否在锁定期? (最近 30 分钟有 login.locked)
  const lockedRes = await query<{ created_at: Date }>(
    `SELECT created_at FROM auth_audit_log
       WHERE email = $1 AND event = 'login.locked'
         AND created_at > NOW() - INTERVAL '${LOCK_DURATION_MS} milliseconds'
       ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  if (lockedRes.rows.length > 0) {
    const lockedAt = new Date(lockedRes.rows[0].created_at).getTime();
    const remaining = lockedAt + LOCK_DURATION_MS - Date.now();
    if (remaining > 0) {
      return {
        locked: true,
        retryAfterSeconds: Math.ceil(remaining / 1000),
        recentFailures: LOCK_FAILURE_THRESHOLD,
      };
    }
  }

  // 2. 不在锁定期: 查 15 分钟内的失败次数
  const failRes = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM auth_audit_log
       WHERE email = $1 AND event = 'login.failure'
         AND created_at > NOW() - INTERVAL '${LOCK_WINDOW_MS} milliseconds'`,
    [email],
  );
  const recentFailures = parseInt(failRes.rows[0]?.n || '0', 10);
  return { locked: false, recentFailures };
}

/**
 * 在 login.failure 写入后调用; 如果累计达阈值则写一条 login.locked
 * (调用方看到 lockJustTriggered=true 时应给前端返回 423 Locked + retry-after).
 */
export async function escalateLockIfNeeded(
  email: string,
  request?: FastifyRequest,
): Promise<{ lockJustTriggered: boolean; retryAfterSeconds: number }> {
  if (!email) return { lockJustTriggered: false, retryAfterSeconds: 0 };

  const status = await checkEmailLock(email);
  if (status.locked) {
    // 已锁定 — 不再升级
    return { lockJustTriggered: false, retryAfterSeconds: status.retryAfterSeconds ?? 0 };
  }

  if (status.recentFailures >= LOCK_FAILURE_THRESHOLD) {
    await writeAuditEvent({
      event: 'login.locked',
      email,
      request,
      metadata: { recentFailures: status.recentFailures, lockDurationMs: LOCK_DURATION_MS },
    });
    return {
      lockJustTriggered: true,
      retryAfterSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
    };
  }
  return { lockJustTriggered: false, retryAfterSeconds: 0 };
}
