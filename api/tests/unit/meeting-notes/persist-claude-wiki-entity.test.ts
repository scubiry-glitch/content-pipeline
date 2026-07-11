import { describe, it, expect, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { entityTypeForSubtype } from '../../../src/modules/meeting-notes/runs/persistClaudeWiki.js';
import { persistClaudeWiki } from '../../../src/modules/meeting-notes/runs/persistClaudeWiki.js';

describe('entityTypeForSubtype', () => {
  it('实体类 subtype 映射到 EntityType', () => {
    expect(entityTypeForSubtype('person')).toBe('person');
    expect(entityTypeForSubtype('org')).toBe('organization');
    expect(entityTypeForSubtype('product')).toBe('product');
    expect(entityTypeForSubtype('event')).toBe('event');
    expect(entityTypeForSubtype('location')).toBe('location');
  });
  it('project 与概念类 subtype → null（不注册 content_entities）', () => {
    expect(entityTypeForSubtype('project')).toBeNull();
    expect(entityTypeForSubtype('mental-model')).toBeNull();
    expect(entityTypeForSubtype('judgment')).toBeNull();
    expect(entityTypeForSubtype('bias')).toBeNull();
    expect(entityTypeForSubtype('counterfactual')).toBeNull();
    expect(entityTypeForSubtype('metric')).toBeNull();
    expect(entityTypeForSubtype('unknown-xyz')).toBeNull();
  });
});

function makeDeps() {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // EntityResolver: 精确/别名查不到 → 走 registerNew INSERT
      if (/INSERT INTO content_entities/i.test(sql)) {
        return { rows: [{ id: 'ce-x', canonical_name: params[0], aliases: [], entity_type: params[2] }] };
      }
      return { rows: [] };
    }),
  };
  const embedding = { embed: vi.fn(async () => []), embedBatch: vi.fn(async () => []) };
  return { deps: { db, embedding, llm: {}, experts: {}, expertApplication: {}, assetsAi: {}, eventBus: {}, textSearch: {} } as any, calls };
}

describe('persistClaudeWiki · 新契约实体注册', () => {
  it('subtype=org → 注册 content_entities(entity_type=organization) 且照写 wiki 页', async () => {
    const { deps, calls } = makeDeps();
    const root = await mkdtemp(join(tmpdir(), 'p3b-'));
    const res = await persistClaudeWiki(deps, 'm1', {
      entityUpdates: [{ type: 'entity', subtype: 'org', canonicalName: '腾讯控股', aliases: ['腾讯'], blockContent: '讨论了腾讯的云业务' }],
    }, root);
    const inserts = calls.filter(c => /INSERT INTO content_entities/i.test(c.sql));
    expect(inserts.length).toBe(1);
    expect(inserts[0].params[2]).toBe('organization'); // entity_type
    expect(res.entityCreated + res.entityUpdated).toBeGreaterThan(0); // 页照写
  });

  it('subtype=project → 不注册 content_entities，但 wiki 页照写', async () => {
    const { deps, calls } = makeDeps();
    const root = await mkdtemp(join(tmpdir(), 'p3b-'));
    const res = await persistClaudeWiki(deps, 'm1', {
      entityUpdates: [{ type: 'entity', subtype: 'project', canonicalName: 'Alpha 项目', blockContent: 'Alpha 项目进展' }],
    }, root);
    expect(calls.some(c => /INSERT INTO content_entities/i.test(c.sql))).toBe(false);
    expect(res.entityCreated + res.entityUpdated).toBeGreaterThan(0); // 页仍写
  });

  it('实体解析抛错不影响写页（best-effort）', async () => {
    const { deps } = makeDeps();
    (deps.db.query as any).mockImplementation(async (sql: string) => {
      if (/content_entities/i.test(sql)) throw new Error('db down');
      return { rows: [] };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = await mkdtemp(join(tmpdir(), 'p3b-'));
    const res = await persistClaudeWiki(deps, 'm1', {
      entityUpdates: [{ type: 'entity', subtype: 'org', canonicalName: '阿里', blockContent: 'x' }],
    }, root);
    warn.mockRestore();
    expect(res.entityCreated + res.entityUpdated).toBeGreaterThan(0); // 抛错也写页
  });
});
