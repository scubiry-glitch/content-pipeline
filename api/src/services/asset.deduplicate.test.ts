import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('./llm.js', () => ({
  generate: vi.fn(),
  generateEmbedding: vi.fn(),
}));

import { AssetService } from './asset.js';
import { query } from '../db/connection.js';

describe('AssetService.deduplicateAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dry-run should return delete/hide plan without mutating data', async () => {
    const service = new AssetService();
    const queryMock = vi.mocked(query);

    queryMock
      .mockResolvedValueOnce({
        rows: [
          { id: 'a1', title: 'Alpha', content: 'Hello  World', created_at: '2026-01-01T00:00:00.000Z', citation_count: 2 },
          { id: 'a2', title: 'alpha', content: 'hello world', created_at: '2026-01-02T00:00:00.000Z', citation_count: 1 },
          { id: 'a3', title: 'Beta', content: 'B', created_at: '2026-01-03T00:00:00.000Z', citation_count: 0 },
          { id: 'a4', title: 'Beta', content: 'B', created_at: '2026-01-04T00:00:00.000Z', citation_count: 0 },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [{ asset_id: 'a4' }],
      } as any);

    const result = await service.deduplicateAssets({ mode: 'dry-run', limit: 100 });

    expect(result.duplicate_groups).toBe(2);
    expect(result.to_delete).toBe(1);
    expect(result.to_hide).toBe(1);
    expect(result.actions.some(a => a.asset_id === 'a2' && a.action === 'would_delete')).toBe(true);
    expect(result.actions.some(a => a.asset_id === 'a4' && a.action === 'would_hide')).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('apply should hide wiki-protected duplicates and delete the others', async () => {
    const service = new AssetService();
    const queryMock = vi.mocked(query);

    queryMock
      .mockResolvedValueOnce({
        rows: [
          { id: 'a1', title: 'Alpha', content: 'hello world', created_at: '2026-01-01T00:00:00.000Z', citation_count: 2 },
          { id: 'a2', title: 'Alpha', content: 'hello world', created_at: '2026-01-02T00:00:00.000Z', citation_count: 1 },
          { id: 'a3', title: 'Beta', content: 'B', created_at: '2026-01-03T00:00:00.000Z', citation_count: 0 },
          { id: 'a4', title: 'Beta', content: 'B', created_at: '2026-01-04T00:00:00.000Z', citation_count: 0 },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [{ asset_id: 'a4' }],
      } as any)
      .mockResolvedValue({ rows: [] } as any);

    const result = await service.deduplicateAssets({ mode: 'apply', limit: 100 });

    expect(result.to_delete).toBe(1);
    expect(result.to_hide).toBe(1);
    expect(result.actions.some(a => a.asset_id === 'a2' && a.action === 'deleted')).toBe(true);
    expect(result.actions.some(a => a.asset_id === 'a4' && a.action === 'hidden')).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(4);
    const executedSql = queryMock.mock.calls.slice(2).map(call => String(call[0]));
    expect(executedSql.some(sql => sql.includes('UPDATE assets'))).toBe(true);
    expect(executedSql.some(sql => sql.includes('DELETE FROM assets'))).toBe(true);
  });
});
