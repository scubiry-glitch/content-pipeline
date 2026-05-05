// importSharedMeeting · 把分享链接里的会议复制到当前用户的工作区
//
// 范围(本期 v1):asset-only fork
//   - 复制 assets 行(白名单 metadata 字段)
//   - 设 workspace_id = 目标 ws
//   - 写 metadata.imported_from 用于幂等
//   - 不复制 mn_* axis 数据;B 拿到副本后在自己 ws 重跑引擎重新生成
//
// 不在本期范围:
//   - mn_people / mn_scopes 跨 ws clone + FK 重映射(person_id 8 种列名 + JSONB 引用)
//   - 聚合表(belief_drift / consensus_tracks 等)recompute
//   - scope binding UI(B 导入后可手动绑 scope)
//
// metadata 处理 — 重要!
//   下面 META_SAFE_KEYS 是 review checkpoint:任何加进 assets.metadata 的新业务字段
//   要在这里同步决定是否安全跨 ws 复制。漏列只会丢字段,不会泄漏。
//   META_STRIP_KEYS 是显式标注 "永远不要带过去" 的字段(运行态/会话/归档标记)。

export type ImportErrorCode = 'NOT_FOUND' | 'EXPIRED' | 'BAD_INPUT';

export class ImportSharedMeetingError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ImportSharedMeetingError';
  }
}

export interface ImportSharedMeetingDeps {
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
  /** 可选 audit hook;失败不抛(best-effort)。生产代码用 writeAuditEvent 包一层即可 */
  audit?: (input: {
    event: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

export interface ImportSharedMeetingInput {
  shareToken: string;
  targetWorkspaceId: string;
  userId: string | null;
}

export interface ImportSharedMeetingResult {
  meetingId: string;
  sourceMeetingId: string;
  sourceWorkspaceId: string;
  shareId: string;
  /** true 时 meetingId 是已有副本(幂等命中),没新增行也没发 audit */
  alreadyImported?: boolean;
}

const META_SAFE_KEYS = [
  'analysis',
  'participants',
  'parse_segments',
  'meeting_kind',
  'duration_min',
  'occurred_at',
  'attendee_count',
  'ai_kind',
  'title',
] as const;

const META_STRIP_KEYS = [
  'claudeSession',
  'checkpoint',
  'workerHint',
  'apiPid',
  'cliPid',
  'archived',
  'archived_at',
  '_generated',
  'imported_from',
] as const;

function pickSafeMetadata(src: unknown): Record<string, unknown> {
  if (!src || typeof src !== 'object') return {};
  const m = src as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of META_SAFE_KEYS) {
    if (k in m) out[k] = m[k];
  }
  return out;
}

export async function importSharedMeeting(
  deps: ImportSharedMeetingDeps,
  input: ImportSharedMeetingInput,
): Promise<ImportSharedMeetingResult> {
  const { shareToken, targetWorkspaceId, userId } = input;

  if (!shareToken || !targetWorkspaceId) {
    throw new ImportSharedMeetingError('BAD_INPUT', 'shareToken and targetWorkspaceId are required');
  }

  // 1. 查 share token
  const shareRes = await deps.db.query(
    `SELECT id, meeting_id, expires_at
       FROM mn_meeting_shares
      WHERE share_token = $1::uuid
      LIMIT 1`,
    [shareToken],
  );
  if (shareRes.rows.length === 0) {
    throw new ImportSharedMeetingError('NOT_FOUND', 'Share token not found');
  }
  const share = shareRes.rows[0];

  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    throw new ImportSharedMeetingError('EXPIRED', 'Share link expired');
  }

  // 2. 查源 asset
  const sourceRes = await deps.db.query(
    `SELECT id, type, title, content, content_type, workspace_id, metadata
       FROM assets
      WHERE id::text = $1::text
      LIMIT 1`,
    [share.meeting_id],
  );
  if (sourceRes.rows.length === 0) {
    throw new ImportSharedMeetingError('NOT_FOUND', 'Source meeting not found');
  }
  const source = sourceRes.rows[0];

  // 3. 幂等检查:同一 (shareId, target ws) 已导入过则直接返回
  const dupRes = await deps.db.query(
    `SELECT id FROM assets
      WHERE workspace_id = $1
        AND metadata->'imported_from'->>'shareId' = $2
      LIMIT 1`,
    [targetWorkspaceId, String(share.id)],
  );
  if (dupRes.rows.length > 0) {
    return {
      meetingId: dupRes.rows[0].id,
      alreadyImported: true,
      sourceMeetingId: String(share.meeting_id),
      sourceWorkspaceId: String(source.workspace_id),
      shareId: String(share.id),
    };
  }

  // 4. 构建新 asset 的 metadata(白名单 + 新 imported_from)
  const safeMeta = pickSafeMetadata(source.metadata);
  const newMeta: Record<string, unknown> = {
    ...safeMeta,
    imported_from: {
      sourceMeetingId: String(share.meeting_id),
      sourceWorkspaceId: String(source.workspace_id),
      shareId: String(share.id),
      importedBy: userId,
      importedAt: new Date().toISOString(),
    },
  };

  // 5. INSERT 新 asset 行
  const insertRes = await deps.db.query(
    `INSERT INTO assets (id, type, title, content, content_type, metadata, workspace_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id`,
    [
      source.type ?? 'meeting_note',
      source.title ?? '导入的会议',
      source.content ?? '',
      source.content_type ?? 'meeting_note',
      JSON.stringify(newMeta),
      targetWorkspaceId,
    ],
  );
  const newId = insertRes.rows[0].id;

  // 6. Audit(best-effort)
  if (deps.audit) {
    try {
      await deps.audit({
        event: 'meeting.imported',
        userId,
        metadata: {
          sourceMeetingId: String(share.meeting_id),
          newMeetingId: String(newId),
          shareId: String(share.id),
          sourceWorkspaceId: String(source.workspace_id),
          targetWorkspaceId,
        },
      });
    } catch {
      // 审计失败不应阻断业务路径;deps.audit 自身已应有 try/catch,这里再兜一层
    }
  }

  return {
    meetingId: String(newId),
    sourceMeetingId: String(share.meeting_id),
    sourceWorkspaceId: String(source.workspace_id),
    shareId: String(share.id),
  };
}
