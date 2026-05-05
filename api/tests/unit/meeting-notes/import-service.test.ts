/**
 * importSharedMeeting · asset-only fork
 *
 * 测试边界:
 *   - share token 缺失 / 过期 / 源会议已删
 *   - happy path: 克隆 asset 行 + metadata 白名单 + imported_from
 *   - 幂等: 同 (shareId, target ws) 第二次导入返回原 newId
 *   - audit 事件 emit
 *
 * 不测的(留给端到端):
 *   - axis 表行为(本期不复制)
 *   - 真 DB 事务行为
 */
import { describe, it, expect, vi } from 'vitest';
import {
  importSharedMeeting,
  ImportSharedMeetingError,
} from '../../../src/modules/meeting-notes/services/import.js';

function mockDeps() {
  const query = vi.fn();
  const audit = vi.fn().mockResolvedValue(undefined);
  return {
    deps: { db: { query }, audit } as any,
    query,
    audit,
  };
}

const FUTURE = '2099-12-31T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

const SOURCE_META = {
  analysis: { summary: { tldr: 'hi' } },
  participants: [{ id: 'p1', name: 'A' }],
  parse_segments: { segments: [{ t: 0, text: 'hello' }] },
  meeting_kind: 'general',
  duration_min: 45,
  occurred_at: '2026-04-01',
  attendee_count: 5,
  // 应被剔除:
  claudeSession: { sessionId: 'should-not-leak' },
  checkpoint: { axisIdx: 3 },
  workerHint: 'cli',
  archived: true,
  archived_at: '2026-04-15',
  _generated: { by: 'json-import' },
  // 旧的 imported_from 应被新值覆盖,不嵌套:
  imported_from: { sourceMeetingId: 'older' },
};

const SHARE_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_MEETING_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_WS = '33333333-3333-4333-8333-333333333333';
const TARGET_WS = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const NEW_MEETING_ID = '66666666-6666-4666-8666-666666666666';

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function setupHappyPath(query: ReturnType<typeof vi.fn>, options: { existingImport?: string | null } = {}) {
  const { existingImport = null } = options;
  query.mockImplementation(async (sql: string) => {
    const s = norm(sql);
    if (s.includes('FROM mn_meeting_shares')) {
      return { rows: [{ id: SHARE_ID, meeting_id: SOURCE_MEETING_ID, expires_at: null }] };
    }
    // 幂等查询(先匹配,因为它也含 FROM assets)
    if (s.includes("metadata->'imported_from'->>'shareId'")) {
      return { rows: existingImport ? [{ id: existingImport }] : [] };
    }
    if (s.includes('FROM assets WHERE id::text =')) {
      return {
        rows: [{
          id: SOURCE_MEETING_ID,
          title: '上海客户访谈 #1',
          content: '',
          content_type: 'meeting_note',
          type: 'meeting_note',
          workspace_id: SOURCE_WS,
          metadata: SOURCE_META,
        }],
      };
    }
    if (s.includes('INSERT INTO assets')) {
      return { rows: [{ id: NEW_MEETING_ID }] };
    }
    return { rows: [] };
  });
}

describe('importSharedMeeting · errors', () => {
  it('throws NOT_FOUND when share token does not exist', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      importSharedMeeting(deps, {
        shareToken: 'no-such-token',
        targetWorkspaceId: TARGET_WS,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws EXPIRED when share is past expires_at', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({
      rows: [{ id: SHARE_ID, meeting_id: SOURCE_MEETING_ID, expires_at: PAST }],
    });
    await expect(
      importSharedMeeting(deps, {
        shareToken: 'expired-token',
        targetWorkspaceId: TARGET_WS,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: 'EXPIRED' });
  });

  it('throws NOT_FOUND when source meeting is deleted', async () => {
    const { deps, query } = mockDeps();
    query.mockImplementation(async (sql: string) => {
      const s = norm(sql);
      if (s.includes('FROM mn_meeting_shares')) {
        return { rows: [{ id: SHARE_ID, meeting_id: SOURCE_MEETING_ID, expires_at: null }] };
      }
      if (s.includes('FROM assets WHERE id::text =')) return { rows: [] };
      return { rows: [] };
    });
    await expect(
      importSharedMeeting(deps, {
        shareToken: 'tok',
        targetWorkspaceId: TARGET_WS,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('honors non-expired future expires_at', async () => {
    const { deps, query, audit } = mockDeps();
    query.mockImplementation(async (sql: string) => {
      const s = norm(sql);
      if (s.includes('FROM mn_meeting_shares')) {
        return { rows: [{ id: SHARE_ID, meeting_id: SOURCE_MEETING_ID, expires_at: FUTURE }] };
      }
      if (s.includes("metadata->'imported_from'->>'shareId'")) return { rows: [] };
      if (s.includes('FROM assets WHERE id::text =')) {
        return { rows: [{ id: SOURCE_MEETING_ID, title: 't', content: '', content_type: 'meeting_note', type: 'meeting_note', workspace_id: SOURCE_WS, metadata: {} }] };
      }
      if (s.includes('INSERT INTO assets')) return { rows: [{ id: NEW_MEETING_ID }] };
      return { rows: [] };
    });
    const r = await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    expect(r.meetingId).toBe(NEW_MEETING_ID);
    expect(audit).toHaveBeenCalled();
  });
});

describe('importSharedMeeting · happy path', () => {
  it('returns the new meetingId and source refs', async () => {
    const { deps, query } = mockDeps();
    setupHappyPath(query);
    const r = await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    expect(r.meetingId).toBe(NEW_MEETING_ID);
    expect(r.sourceMeetingId).toBe(SOURCE_MEETING_ID);
    expect(r.sourceWorkspaceId).toBe(SOURCE_WS);
    expect(r.shareId).toBe(SHARE_ID);
    expect(r.alreadyImported).toBeFalsy();
  });

  it('inserts asset with target workspace_id', async () => {
    const { deps, query } = mockDeps();
    setupHappyPath(query);
    await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO assets'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain(TARGET_WS);
  });

  it('whitelists safe metadata fields and strips unsafe ones', async () => {
    const { deps, query } = mockDeps();
    setupHappyPath(query);
    await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO assets'));
    const metaJson = insertCall![1].find((p: unknown) => typeof p === 'string' && p.startsWith('{')) as string;
    expect(metaJson).toBeDefined();
    const meta = JSON.parse(metaJson);

    // 白名单保留
    expect(meta.analysis).toEqual(SOURCE_META.analysis);
    expect(meta.participants).toEqual(SOURCE_META.participants);
    expect(meta.parse_segments).toEqual(SOURCE_META.parse_segments);
    expect(meta.meeting_kind).toBe('general');
    expect(meta.duration_min).toBe(45);
    expect(meta.occurred_at).toBe('2026-04-01');
    expect(meta.attendee_count).toBe(5);

    // 黑名单剔除
    expect(meta).not.toHaveProperty('claudeSession');
    expect(meta).not.toHaveProperty('checkpoint');
    expect(meta).not.toHaveProperty('workerHint');
    expect(meta).not.toHaveProperty('archived');
    expect(meta).not.toHaveProperty('archived_at');
    expect(meta).not.toHaveProperty('_generated');
  });

  it('writes new imported_from with source refs (not the inherited one)', async () => {
    const { deps, query } = mockDeps();
    setupHappyPath(query);
    await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO assets'));
    const metaJson = insertCall![1].find((p: unknown) => typeof p === 'string' && p.startsWith('{')) as string;
    const meta = JSON.parse(metaJson);

    expect(meta.imported_from).toBeDefined();
    expect(meta.imported_from.sourceMeetingId).toBe(SOURCE_MEETING_ID);
    expect(meta.imported_from.sourceWorkspaceId).toBe(SOURCE_WS);
    expect(meta.imported_from.shareId).toBe(SHARE_ID);
    expect(meta.imported_from.importedBy).toBe(USER_ID);
    expect(meta.imported_from.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // 老 imported_from 不嵌套
    expect(meta.imported_from.sourceMeetingId).not.toBe('older');
  });
});

describe('importSharedMeeting · idempotency', () => {
  it('returns existing meetingId when same share already imported into same ws', async () => {
    const { deps, query, audit } = mockDeps();
    setupHappyPath(query, { existingImport: NEW_MEETING_ID });
    const r = await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    expect(r.meetingId).toBe(NEW_MEETING_ID);
    expect(r.alreadyImported).toBe(true);
    // 不重复 INSERT
    const insertCalls = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO assets'));
    expect(insertCalls).toHaveLength(0);
    // 不重复 audit
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('importSharedMeeting · audit', () => {
  it('emits meeting.imported with source/target refs', async () => {
    const { deps, query, audit } = mockDeps();
    setupHappyPath(query);
    await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    expect(audit).toHaveBeenCalledTimes(1);
    const call = audit.mock.calls[0][0];
    expect(call.event).toBe('meeting.imported');
    expect(call.userId).toBe(USER_ID);
    expect(call.metadata).toMatchObject({
      sourceMeetingId: SOURCE_MEETING_ID,
      newMeetingId: NEW_MEETING_ID,
      shareId: SHARE_ID,
      sourceWorkspaceId: SOURCE_WS,
      targetWorkspaceId: TARGET_WS,
    });
  });

  it('does not throw when audit dep is absent', async () => {
    const query = vi.fn();
    setupHappyPath(query);
    const r = await importSharedMeeting({ db: { query } } as any, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    expect(r.meetingId).toBe(NEW_MEETING_ID);
  });

  it('does not propagate audit failures', async () => {
    const { deps, query, audit } = mockDeps();
    setupHappyPath(query);
    audit.mockRejectedValueOnce(new Error('audit table missing'));
    const r = await importSharedMeeting(deps, {
      shareToken: 'tok', targetWorkspaceId: TARGET_WS, userId: USER_ID,
    });
    expect(r.meetingId).toBe(NEW_MEETING_ID);
  });
});

describe('ImportSharedMeetingError', () => {
  it('exposes code and message', () => {
    const err = new ImportSharedMeetingError('EXPIRED', 'expired');
    expect(err.code).toBe('EXPIRED');
    expect(err.message).toBe('expired');
    expect(err).toBeInstanceOf(Error);
  });
});
