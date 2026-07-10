import { describe, it, expect, vi } from 'vitest';
import { EntityResolver } from '../../../src/modules/content-library/consolidation/entityResolver.js';

// C1 regression: noop embedding (returns []) must bind NULL, not '[]', into vector(768)
describe('EntityResolver · registerNew embedding guard', () => {
  it('空 embedding [] → INSERT 时 embedding 参数为 null，而非字符串 "[]"', async () => {
    const insertCalls: any[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        // findByNameOrAlias — no match
        if (/FROM content_entities/i.test(sql) && !/INSERT/i.test(sql)) {
          return { rows: [] };
        }
        // registerNew INSERT
        if (/INSERT INTO content_entities/i.test(sql)) {
          insertCalls.push(params);
          return {
            rows: [{
              id: 'ce-test-1',
              canonical_name: '张伟',
              aliases: [],
              entity_type: 'person',
              taxonomy_domain_id: null,
              metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          };
        }
        return { rows: [] };
      }),
    };

    // noop embedding — mirrors createNoopEmbeddingAdapter() in meeting-notes pipeline adapter
    const noopEmbedding = {
      async embed(_text: string): Promise<number[]> { return []; },
      async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => []); },
    };

    const resolver = new EntityResolver(db as any, noopEmbedding);
    await resolver.resolveAndRegister({
      canonicalName: '张伟',
      aliases: [],
      entityType: 'person',
      taxonomyDomainId: undefined,
      metadata: {},
    });

    expect(insertCalls.length).toBe(1);
    // param $6 is the embedding (index 5)
    const embeddingParam = insertCalls[0][5];
    expect(embeddingParam).toBeNull();
    expect(embeddingParam).not.toBe('[]');
  });

  it('正常 768 维 embedding → INSERT 时 embedding 参数为 JSON 字符串（非 null）', async () => {
    const insertCalls: any[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        if (/FROM content_entities/i.test(sql) && !/INSERT/i.test(sql)) {
          return { rows: [] };
        }
        if (/INSERT INTO content_entities/i.test(sql)) {
          insertCalls.push(params);
          return {
            rows: [{
              id: 'ce-test-2',
              canonical_name: '李明',
              aliases: [],
              entity_type: 'person',
              taxonomy_domain_id: null,
              metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          };
        }
        return { rows: [] };
      }),
    };

    const realEmbedding = {
      async embed(_text: string): Promise<number[]> { return new Array(768).fill(0.1); },
      async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => new Array(768).fill(0.1)); },
    };

    const resolver = new EntityResolver(db as any, realEmbedding);
    await resolver.resolveAndRegister({
      canonicalName: '李明',
      aliases: [],
      entityType: 'person',
      taxonomyDomainId: undefined,
      metadata: {},
    });

    expect(insertCalls.length).toBe(1);
    const embeddingParam = insertCalls[0][5];
    expect(typeof embeddingParam).toBe('string');
    expect(embeddingParam).not.toBeNull();
    const parsed = JSON.parse(embeddingParam);
    expect(parsed.length).toBe(768);
  });
});
