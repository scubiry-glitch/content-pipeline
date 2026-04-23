/**
 * runs/versionStore — snapshot 自动版本号 + diff 计算
 *
 * 核心行为：
 *   - 下一版号 = max(vN) + 1
 *   - diff 按 id 比对 added/changed/removed
 *   - 结构：{ people: { commitments: [...], ... }, projects: {...}, ... }
 */
import { describe, it, expect, vi } from 'vitest';
import { VersionStore } from '../../../src/modules/meeting-notes/runs/versionStore.js';

function makeDeps(sequentialResults: any[][]) {
  let call = 0;
  const query = vi.fn(async () => ({ rows: sequentialResults[call++] ?? [] }));
  return { deps: { db: { query } } as any, query };
}

describe('VersionStore.snapshot', () => {
  it('generates v1 when no prior version', async () => {
    const { deps, query } = makeDeps([
      /* latestVersion lookup → */ [],
      /* max_v lookup         → */ [{ max_v: null }],
      /* insert snapshot      → */ [{ id: 'ver-1' }],
    ]);
    const vs = new VersionStore(deps);
    const r = await vs.snapshot({
      runId: 'r-1',
      scopeKind: 'meeting',
      scopeId: 'm-1',
      axis: 'people',
      data: { people: { commitments: [{ id: 'c1', text: 'x' }] } },
    });
    expect(r.versionLabel).toBe('v1');
    expect(r.prevVersionId).toBeNull();
    expect(r.diff.added).toEqual([]);  // no prior → no added/changed/removed
  });

  it('increments version and computes diff vs prev', async () => {
    const prevSnapshot = {
      people: { commitments: [{ id: 'c1', text: 'old' }, { id: 'c2', text: 'keep' }] },
    };
    const { deps } = makeDeps([
      [{ id: 'v-prev', version_label: 'v3', snapshot: prevSnapshot }],
      [{ max_v: 3 }],
      [{ id: 'v-new' }],
    ]);
    const vs = new VersionStore(deps);
    const r = await vs.snapshot({
      runId: 'r-2',
      scopeKind: 'meeting',
      scopeId: 'm-1',
      axis: 'people',
      data: {
        people: {
          commitments: [
            { id: 'c1', text: 'changed' },      // changed
            { id: 'c2', text: 'keep' },         // unchanged
            { id: 'c3', text: 'new' },          // added
          ],
        },
      },
    });
    expect(r.versionLabel).toBe('v4');
    expect(r.prevVersionId).toBe('v-prev');
    expect(r.diff.added).toContain('people/commitments/c3');
    expect(r.diff.changed).toContain('people/commitments/c1');
    expect(r.diff.removed).toEqual([]);
  });

  it('detects removed items', async () => {
    const prev = { people: { commitments: [{ id: 'c1' }, { id: 'c2' }] } };
    const next = { people: { commitments: [{ id: 'c1' }] } };
    const { deps } = makeDeps([
      [{ id: 'v-prev', version_label: 'v1', snapshot: prev }],
      [{ max_v: 1 }],
      [{ id: 'v-new' }],
    ]);
    const vs = new VersionStore(deps);
    const r = await vs.snapshot({
      runId: 'r-3',
      scopeKind: 'meeting',
      scopeId: 'm-1',
      axis: 'people',
      data: next,
    });
    expect(r.diff.removed).toContain('people/commitments/c2');
  });

  it('handles scalar object fields (non-array) as unit comparison', async () => {
    // meta 轴的 decision_quality 是单对象（不是数组），diff 也要能识别
    const prev = { meta: { decision_quality: { overall: 0.7 } } };
    const next = { meta: { decision_quality: { overall: 0.9 } } };
    const { deps } = makeDeps([
      [{ id: 'v-prev', version_label: 'v1', snapshot: prev }],
      [{ max_v: 1 }],
      [{ id: 'v-new' }],
    ]);
    const vs = new VersionStore(deps);
    const r = await vs.snapshot({
      runId: 'r-4', scopeKind: 'meeting', scopeId: 'm-1', axis: 'meta', data: next,
    });
    expect(r.diff.changed).toContain('meta/decision_quality');
  });
});
