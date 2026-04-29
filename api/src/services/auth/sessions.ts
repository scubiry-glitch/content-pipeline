import crypto from 'node:crypto';
import { query } from '../../db/connection.js';

export const SESSION_COOKIE_NAME = 'cp_session';
export const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export interface SessionWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
}

export interface ResolvedSession {
  sessionId: string;
  user: SessionUser;
  currentWorkspace: SessionWorkspace | null;
  workspaces: SessionWorkspace[];
  expiresAt: Date;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(opts: {
  userId: string;
  userAgent?: string;
  ip?: string;
  currentWorkspaceId?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO auth_sessions (user_id, token_hash, user_agent, ip, current_workspace_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [opts.userId, tokenHash, opts.userAgent || null, opts.ip || null, opts.currentWorkspaceId || null, expiresAt]
  );

  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const tokenHash = sha256(token);
  const sessRes = await query<{
    id: string;
    user_id: string;
    current_workspace_id: string | null;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT id, user_id, current_workspace_id, expires_at, revoked_at
       FROM auth_sessions
      WHERE token_hash = $1`,
    [tokenHash]
  );
  const sess = sessRes.rows[0];
  if (!sess) return null;
  if (sess.revoked_at) return null;
  if (new Date(sess.expires_at).getTime() <= Date.now()) return null;

  const userRes = await query<{
    id: string;
    email: string;
    name: string;
    status: string;
    is_super_admin: boolean;
    must_change_password: boolean;
  }>(
    `SELECT id, email, name, status, is_super_admin, must_change_password
       FROM users WHERE id = $1`,
    [sess.user_id]
  );
  const user = userRes.rows[0];
  if (!user || user.status !== 'active') return null;

  const wsRes = await query<{
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member';
  }>(
    `SELECT w.id, w.name, w.slug, m.role
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1
      ORDER BY m.joined_at ASC`,
    [sess.user_id]
  );
  const workspaces = wsRes.rows;

  let currentWorkspace = workspaces.find((w) => w.id === sess.current_workspace_id) || null;
  if (!currentWorkspace && workspaces.length > 0) {
    currentWorkspace = workspaces[0];
    await query(
      `UPDATE auth_sessions SET current_workspace_id = $1 WHERE id = $2`,
      [currentWorkspace.id, sess.id]
    );
  }

  // 异步更新 last_seen，不等待
  query(`UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1`, [sess.id]).catch(() => {});

  return {
    sessionId: sess.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.is_super_admin,
      mustChangePassword: user.must_change_password,
    },
    currentWorkspace,
    workspaces,
    expiresAt: new Date(sess.expires_at),
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
}

export async function setSessionWorkspace(sessionId: string, workspaceId: string): Promise<void> {
  await query(`UPDATE auth_sessions SET current_workspace_id = $1 WHERE id = $2`, [workspaceId, sessionId]);
}

// 剩余 < SESSION_REFRESH_THRESHOLD_MS 时才真正写 DB; 否则视为"已经够新", 只更 last_seen
const SESSION_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * 续期 session.
 * - 已 revoked / 已过期 → null
 * - 剩余 > 7 天 → 不写 expires_at (避免热点 UPDATE), 仅更 last_seen, 返回当前 expiresAt
 * - 剩余 ≤ 7 天 → 把 expires_at 推后到 now + 30d
 *
 * 调用方拿到 expiresAt + refreshed 标记, refreshed=true 才需要重设 cookie maxAge.
 */
export async function refreshSession(
  sessionId: string,
): Promise<{ expiresAt: Date; refreshed: boolean } | null> {
  const cur = await query<{ expires_at: Date; revoked_at: Date | null }>(
    `SELECT expires_at, revoked_at FROM auth_sessions WHERE id = $1`,
    [sessionId],
  );
  const row = cur.rows[0];
  if (!row || row.revoked_at) return null;
  const expiresAtMs = new Date(row.expires_at).getTime();
  if (expiresAtMs <= Date.now()) return null;

  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs > SESSION_REFRESH_THRESHOLD_MS) {
    // 充足, 不写 expires_at, 只更 last_seen
    await query(`UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1`, [sessionId]).catch(() => {});
    return { expiresAt: new Date(row.expires_at), refreshed: false };
  }
  // 临近过期, 真正推后
  const newExpiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `UPDATE auth_sessions SET expires_at = $1, last_seen_at = NOW() WHERE id = $2`,
    [newExpiresAt, sessionId],
  );
  return { expiresAt: newExpiresAt, refreshed: true };
}
