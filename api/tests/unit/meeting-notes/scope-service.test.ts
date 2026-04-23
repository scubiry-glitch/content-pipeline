/**
 * scope/scopeService — CRUD 与 membership 基本行为
 */
import { describe, it, expect, vi } from 'vitest';
import { ScopeService } from '../../../src/modules/meeting-notes/scope/scopeService.js';

function mockDeps() {
  const query = vi.fn();
  return { deps: { db: { query } } as any, query };
}

function scopeRow(over: any = {}) {
  return {
    id: 's1', kind: 'project', slug: 'p-ai-q2', name: 'AI Q2',
    status: 'active', steward_person_ids: [], description: null,
    metadata: {}, created_at: '2026-04-24', updated_at: '2026-04-24',
    ...over,
  };
}

describe('ScopeService.list', () => {
  it('lists without filter', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [scopeRow(), scopeRow({ id: 's2', slug: 'p-hw' })] });
    const svc = new ScopeService(deps);
    const rows = await svc.list();
    expect(rows).toHaveLength(2);
    expect(query.mock.calls[0][0]).toContain('ORDER BY created_at DESC');
    expect(query.mock.calls[0][0]).not.toContain('WHERE');
  });

  it('applies kind and status filters', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [] });
    const svc = new ScopeService(deps);
    await svc.list({ kind: 'project', status: 'active' });
    expect(query.mock.calls[0][0]).toContain('kind = $1');
    expect(query.mock.calls[0][0]).toContain('status = $2');
    expect(query.mock.calls[0][1]).toEqual(['project', 'active']);
  });
});

describe('ScopeService.create / update', () => {
  it('create inserts with defaults', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [scopeRow({ id: 'new', name: 'New' })] });
    const svc = new ScopeService(deps);
    const r = await svc.create({ kind: 'project', slug: 'new', name: 'New' });
    expect(r.id).toBe('new');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO mn_scopes');
    // defaults: status='active', steward_person_ids=[], description=null, metadata={}
    expect(params[3]).toBe('active');
    expect(params[4]).toEqual([]);
  });

  it('update builds dynamic SET; empty patch returns getById', async () => {
    const { deps, query } = mockDeps();
    // empty patch → getById fetch only
    query.mockResolvedValueOnce({ rows: [scopeRow()] });
    const svc = new ScopeService(deps);
    const r = await svc.update('s1', {});
    expect(r?.id).toBe('s1');
    expect(query.mock.calls[0][0]).toContain('WHERE id = $1');
  });

  it('update with fields builds SET clause', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [scopeRow({ name: 'Renamed' })] });
    const svc = new ScopeService(deps);
    await svc.update('s1', { name: 'Renamed', status: 'archived' });
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('name = $1');
    expect(sql).toContain('status = $2');
    expect(sql).toContain('WHERE id = $3');
  });
});

describe('ScopeService.membership', () => {
  it('bind is idempotent via ON CONFLICT', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [] });
    const svc = new ScopeService(deps);
    await svc.bindMeeting('s1', 'm1', { reason: 'initial' });
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (scope_id, meeting_id) DO NOTHING');
  });

  it('listMeetings returns ordered ids', async () => {
    const { deps, query } = mockDeps();
    query.mockResolvedValueOnce({ rows: [{ meeting_id: 'm2' }, { meeting_id: 'm1' }] });
    const svc = new ScopeService(deps);
    const ids = await svc.listMeetings('s1');
    expect(ids).toEqual(['m2', 'm1']);
  });
});
