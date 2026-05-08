// 给新用户创建 1:1 personal workspace.
//
// Why: 用户被创建后没加入任何 ws → request.auth.workspace=null →
// currentWorkspaceId() 返回 NO_WORKSPACE_SENTINEL → 任何写路径
// `?? undefined` 把 sentinel 喂给 INSERT 触发 FK 23503 → 500.
// 在用户创建链路里同事务把 ws 准备好, 链路上根本不会出现没 ws 的用户.
//
// 调用方必须传 client (transaction) — user 行 + identity 行 + 这次 ws 必须
// 同事务原子写入, 否则崩溃 / 23505 处理一旦不一致就再次落入 hanxiangqin 的
// 半建状态.

import type { PoolClient } from 'pg';

interface CreatePersonalWorkspaceOptions {
  /** 显示名 fallback. 若不传, 用 email 的 local-part. */
  name?: string;
}

/** slug 必须仅含 [a-z0-9-]. 这里只截 user_id 前 8 hex, 安全. */
function makeSlug(userId: string, suffix?: string): string {
  const head = userId.slice(0, 8);
  return suffix ? `u-${head}-${suffix}` : `u-${head}`;
}

function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  const local = at > 0 ? email.slice(0, at) : email;
  const trimmed = local.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createPersonalWorkspace(
  userId: string,
  email: string | null | undefined,
  client: PoolClient,
  options: CreatePersonalWorkspaceOptions = {},
): Promise<string> {
  const displayName =
    options.name?.trim() || emailLocalPart(email) || '个人工作区';
  const name = `${displayName} 的个人工作区`;

  // slug 撞库降级: u-XXXXXXXX → u-XXXXXXXX-{user_id 完整 32 hex}
  // 完整 32 hex 在系统内必唯一 (user_id PK), 第二次冲突不可能.
  const primarySlug = makeSlug(userId);
  const fallbackSlug = makeSlug(userId, userId.replace(/-/g, ''));

  let wsId: string;
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO workspaces (name, slug, owner_id, is_shared)
       VALUES ($1, $2, $3, false)
       RETURNING id`,
      [name, primarySlug, userId],
    );
    wsId = r.rows[0].id;
  } catch (e: any) {
    if (e?.code !== '23505') throw e;
    const r = await client.query<{ id: string }>(
      `INSERT INTO workspaces (name, slug, owner_id, is_shared)
       VALUES ($1, $2, $3, false)
       RETURNING id`,
      [name, fallbackSlug, userId],
    );
    wsId = r.rows[0].id;
  }

  await client.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [wsId, userId],
  );

  return wsId;
}
