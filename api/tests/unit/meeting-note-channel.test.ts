/**
 * MeetingNoteChannelService — CRUD + adapter dispatch + ingestion pipeline
 *
 * Uses dependency-injected query fn so we don't need a real postgres.
 * The service is the SAME shape as assetService: thin wrapper around `query`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ImportedMeetingNoteDraft,
  MeetingNoteSource,
  MeetingNoteSourceKind,
} from '../../src/services/assetService.js';
import {
  MeetingNoteChannelService,
  type MeetingNoteChannelDeps,
} from '../../src/services/meetingNoteChannel.js';

function makeDeps(overrides: Partial<MeetingNoteChannelDeps> = {}): {
  deps: MeetingNoteChannelDeps;
  query: ReturnType<typeof vi.fn>;
  createAsset: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const createAsset = vi.fn().mockImplementation(async (dto) => ({
    id: 'asset-' + Math.random().toString(36).slice(2, 8),
    type: dto.type,
    title: dto.title,
    content: dto.content,
    source: dto.source || '',
    sourceId: dto.sourceId,
    tags: dto.tags || [],
    qualityScore: dto.qualityScore || 0,
    usageCount: 0,
    domain: dto.domain,
    metadata: dto.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const deps: MeetingNoteChannelDeps = {
    query,
    createAsset,
    adapters: {},
    ...overrides,
  };
  return { deps, query, createAsset };
}

function sourceRow(over: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 's1',
    name: '测试源',
    kind: 'manual',
    config: {},
    is_active: true,
    schedule_cron: null,
    last_imported_at: null,
    created_by: null,
    created_at: new Date('2026-04-20T00:00:00Z'),
    updated_at: new Date('2026-04-20T00:00:00Z'),
    ...over,
  };
}

describe('MeetingNoteChannelService — CRUD', () => {
  describe('listSources', () => {
    it('selects all sources ordered by created_at DESC', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rows: [sourceRow()] });
      const svc = new MeetingNoteChannelService(deps);
      const rows = await svc.listSources();
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/FROM meeting_note_sources[\s\S]*ORDER BY created_at DESC/),
        expect.any(Array),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('s1');
      expect(rows[0].isActive).toBe(true);
    });

    it('filters by kind when supplied', async () => {
      const { deps, query } = makeDeps();
      const svc = new MeetingNoteChannelService(deps);
      await svc.listSources({ kind: 'lark' });
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/WHERE[\s\S]*kind = \$/),
        expect.arrayContaining(['lark']),
      );
    });

    it('filters by is_active when supplied', async () => {
      const { deps, query } = makeDeps();
      const svc = new MeetingNoteChannelService(deps);
      await svc.listSources({ isActive: true });
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/is_active = \$/),
        expect.arrayContaining([true]),
      );
    });
  });

  describe('getSource', () => {
    it('returns null when not found', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rows: [] });
      const svc = new MeetingNoteChannelService(deps);
      const row = await svc.getSource('missing');
      expect(row).toBeNull();
    });

    it('returns camelCased row when found', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rows: [sourceRow({ id: 'abc' })] });
      const svc = new MeetingNoteChannelService(deps);
      const row = await svc.getSource('abc');
      expect(row?.id).toBe('abc');
      expect(row?.kind).toBe('manual');
    });
  });

  describe('createSource', () => {
    it('rejects unsupported kind', async () => {
      const { deps } = makeDeps();
      const svc = new MeetingNoteChannelService(deps);
      await expect(
        svc.createSource({
          name: 'x',
          kind: 'slack' as MeetingNoteSourceKind,
          config: {},
        }),
      ).rejects.toThrow(/kind/);
    });

    it('inserts with JSONB-stringified config and returns the row', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rows: [sourceRow({ kind: 'lark' })] });
      const svc = new MeetingNoteChannelService(deps);
      const created = await svc.createSource({
        name: 'Feishu 会议室 A',
        kind: 'lark',
        config: { space_id: 'abc' },
      });
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO meeting_note_sources/),
        expect.arrayContaining(['Feishu 会议室 A', 'lark', JSON.stringify({ space_id: 'abc' })]),
      );
      expect(created.id).toBe('s1');
    });
  });

  describe('updateSource', () => {
    it('updates and returns the row', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rows: [sourceRow({ name: 'renamed' })] });
      const svc = new MeetingNoteChannelService(deps);
      const updated = await svc.updateSource('s1', { name: 'renamed' });
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE meeting_note_sources[\s\S]+WHERE id/),
        expect.any(Array),
      );
      expect(updated?.name).toBe('renamed');
    });

    it('returns null when no row matches', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rows: [] });
      const svc = new MeetingNoteChannelService(deps);
      const updated = await svc.updateSource('missing', { name: 'x' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteSource', () => {
    it('issues DELETE and returns true on 1 row affected', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      const svc = new MeetingNoteChannelService(deps);
      await expect(svc.deleteSource('s1')).resolves.toBe(true);
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE FROM meeting_note_sources WHERE id/),
        ['s1'],
      );
    });

    it('returns false when nothing deleted', async () => {
      const { deps, query } = makeDeps();
      query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const svc = new MeetingNoteChannelService(deps);
      await expect(svc.deleteSource('x')).resolves.toBe(false);
    });
  });
});

describe('MeetingNoteChannelService — runImport', () => {
  const draft = (over: Partial<ImportedMeetingNoteDraft> = {}): ImportedMeetingNoteDraft => ({
    externalId: 'sha256:abc',
    title: '2026-04-20 技术评审',
    content: '## 议题\n- 模型升级\n',
    ...over,
  });

  function sourceStub(kind: MeetingNoteSourceKind = 'manual'): MeetingNoteSource {
    return {
      id: 's1',
      name: 'Test',
      kind,
      config: {},
      isActive: true,
      scheduleCron: null,
      lastImportedAt: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('inserts a pending job, marks succeeded, and writes asset_ids', async () => {
    const { deps, query, createAsset } = makeDeps({
      adapters: {
        manual: { fetchDrafts: vi.fn().mockResolvedValue([draft()]) },
      },
    });
    // getSource
    query.mockResolvedValueOnce({ rows: [{
      id: 's1', name: 'Test', kind: 'manual', config: {},
      is_active: true, schedule_cron: null, last_imported_at: null,
      created_by: null, created_at: new Date(), updated_at: new Date(),
    }] });
    // INSERT meeting_note_imports pending -> returns job with id
    query.mockResolvedValueOnce({ rows: [{ id: 'j1' }] });
    // no dedup hit
    query.mockResolvedValueOnce({ rows: [] });
    // UPDATE job to succeeded
    query.mockResolvedValueOnce({ rows: [] });
    // UPDATE source.last_imported_at
    query.mockResolvedValueOnce({ rows: [] });

    const svc = new MeetingNoteChannelService(deps);
    const result = await svc.runImport('s1', 'manual');

    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'meeting_minutes', sourceId: 's1' }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.itemsImported).toBe(1);
    expect(result.duplicates).toBe(0);

    // Final UPDATE should set status=succeeded and asset_ids
    const updateCall = query.mock.calls.find(([sql]: any[]) =>
      typeof sql === 'string' && /UPDATE meeting_note_imports[\s\S]+SET[\s\S]+status/.test(sql),
    );
    expect(updateCall).toBeDefined();
  });

  it('skips drafts already seen via (source_id, external_id)', async () => {
    const { deps, query, createAsset } = makeDeps({
      adapters: {
        manual: { fetchDrafts: vi.fn().mockResolvedValue([draft({ externalId: 'dup' })]) },
      },
    });
    query.mockResolvedValueOnce({ rows: [{
      id: 's1', name: 'Test', kind: 'manual', config: {},
      is_active: true, schedule_cron: null, last_imported_at: null,
      created_by: null, created_at: new Date(), updated_at: new Date(),
    }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'j1' }] });
    // dedup check hits
    query.mockResolvedValueOnce({ rows: [{ id: 'existing-asset' }] });
    query.mockResolvedValueOnce({ rows: [] }); // UPDATE job
    query.mockResolvedValueOnce({ rows: [] }); // UPDATE source

    const svc = new MeetingNoteChannelService(deps);
    const result = await svc.runImport('s1', 'manual');

    expect(createAsset).not.toHaveBeenCalled();
    expect(result.duplicates).toBe(1);
    expect(result.itemsImported).toBe(0);
  });

  it('records errors but keeps importing other drafts (partial success)', async () => {
    const { deps, query, createAsset } = makeDeps({
      adapters: {
        manual: {
          fetchDrafts: vi.fn().mockResolvedValue([
            draft({ externalId: 'a' }),
            draft({ externalId: 'b' }),
          ]),
        },
      },
    });
    // Make 2nd createAsset throw
    createAsset.mockImplementationOnce(async (dto) => ({
      id: 'ok', type: dto.type, title: dto.title, content: dto.content,
      source: '', tags: [], qualityScore: 0, usageCount: 0,
      metadata: {}, createdAt: new Date(), updatedAt: new Date(),
    } as any));
    createAsset.mockImplementationOnce(async () => { throw new Error('disk full'); });

    query.mockResolvedValueOnce({ rows: [{
      id: 's1', name: 'Test', kind: 'manual', config: {},
      is_active: true, schedule_cron: null, last_imported_at: null,
      created_by: null, created_at: new Date(), updated_at: new Date(),
    }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'j1' }] });
    // dedup checks (both miss)
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });
    // UPDATE job + source
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const svc = new MeetingNoteChannelService(deps);
    const result = await svc.runImport('s1', 'manual');
    expect(result.itemsImported).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.status).toBe('partial');
  });

  it('stub adapters (lark/zoom/teams) return zero drafts without error', async () => {
    const { deps, query } = makeDeps({
      adapters: {
        lark:  { fetchDrafts: vi.fn().mockResolvedValue([]) },
        zoom:  { fetchDrafts: vi.fn().mockResolvedValue([]) },
        teams: { fetchDrafts: vi.fn().mockResolvedValue([]) },
      },
    });
    query.mockResolvedValueOnce({ rows: [{
      id: 's2', name: 'Lark', kind: 'lark', config: {},
      is_active: true, schedule_cron: null, last_imported_at: null,
      created_by: null, created_at: new Date(), updated_at: new Date(),
    }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'j2' }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const svc = new MeetingNoteChannelService(deps);
    const result = await svc.runImport('s2', 'manual');
    expect(result.status).toBe('succeeded');
    expect(result.itemsDiscovered).toBe(0);
  });

  it('fails whole job when adapter throws', async () => {
    const boom = new Error('network unreachable');
    const { deps, query } = makeDeps({
      adapters: {
        lark: { fetchDrafts: vi.fn().mockRejectedValue(boom) },
      },
    });
    query.mockResolvedValueOnce({ rows: [{
      id: 's2', name: 'Lark', kind: 'lark', config: {},
      is_active: true, schedule_cron: null, last_imported_at: null,
      created_by: null, created_at: new Date(), updated_at: new Date(),
    }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'j2' }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const svc = new MeetingNoteChannelService(deps);
    const result = await svc.runImport('s2', 'manual');
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/network unreachable/);
  });

  it('returns structured error when source id does not exist', async () => {
    const { deps, query } = makeDeps();
    query.mockResolvedValueOnce({ rows: [] });
    const svc = new MeetingNoteChannelService(deps);
    await expect(svc.runImport('missing', 'manual')).rejects.toThrow(/source/i);
  });
});
