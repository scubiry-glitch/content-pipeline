# P3a 会议实体统一 · 激活真语义嵌入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已有的 `EmbeddingService`（自动选 provider）接进 meeting-notes 的实体嵌入路径，唤醒 P2 已搭好但因 noop 而休眠的语义模糊匹配（"张总/张伟/张总监" 归一），并给存量 `content_entities` 补算向量——但仅当活跃 provider 是真语义服务时才写向量，本地哈希兜底一律不写以防误合并。

**Architecture:** 新增一个「语义门控」`EmbeddingAdapter`，内部委托 `getEmbeddingService()`；`provider==='local'` 时 `embed` 返回 `[]`（经 EntityResolver 的 C1 guard 落 `null`，行为退回 P2 的 exact+alias），否则返回 `coerceVec768(service.embed(text))`。生产在 `server.ts` 组装 meeting-notes deps 时注入这个适配器（默认仍是 noop，只有 prod 入口显式换真的），一处注入同时唤醒 `ensurePersonByName` 注册、`PersonRoster` 模糊解析、wiki 注册三条路径的 embedding。再加一个 `content_entities` 空向量补算脚本。

**Tech Stack:** TypeScript (ESM, `.js` import 后缀) · Node.js · PostgreSQL (pgvector `vector(768)`) · vitest（mock service/db，不连真库、不打真嵌入 API）。

## Global Constraints

- **语义门控**：仅当 `EmbeddingService.provider !== 'local'`（即 siliconflow/openai/dashboard-llm 之一，凭真 API key 自动选中）才产出向量；`provider==='local'`（哈希兜底，无语义）→ `embed` 返回 `[]`。理由：本地哈希向量的余弦相似度无语义意义，写进 `content_entities.embedding` 会让 P4 自动合并误判，把不同的人错误合并。宁可保持 P2 的 exact+alias 行为。
- **默认不变**：`createPipelineDeps` 的 `embedding` 默认仍为 `createNoopEmbeddingAdapter()`（`adapters/pipeline.ts:233`）。只有 `server.ts` 的生产入口显式传真适配器。测试/脚本不受影响，除非显式 opt-in。
- **维度**：`content_entities.embedding` 是 `vector(768)`。任何真向量写库前必须 `coerceVec768`（截断/补零到 768）。
- **失败降级**：真嵌入调用抛错（API 超时等）→ 返回 `[]` 并 `console.warn`，绝不 sink 会议解析或回填（承接 P1/P2 的 best-effort 语义）。
- **一处注入唤醒三路**：meeting-notes `deps.embedding` 被 `ensurePersonByName`（`new EntityResolver(deps.db, deps.embedding)`）、`PersonRoster.build/resolveAsync`、wiki 注册共用。换真适配器即同时激活。
- ESM：本地 import 带 `.js`。commit 粒度：一 task 一 commit，message 结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- **运维前提（计划外，仅告知）**：P3a 的模糊价值只有在生产 worker 配了真 provider key（如 `SILICONFLOW_API_KEY` + `embedding_model`）时才兑现；没配则 provider 落 `local`，本计划安全地保持 P2 行为（不写向量）。

---

## File Structure

- **Modify** `api/src/services/assets-ai/embedding.ts` — `EmbeddingService` 加一个 `get provider()` 公有 getter（当前 `config` 私有，适配器需读 provider 做门控）。
- **Modify** `api/src/modules/meeting-notes/adapters/pipeline.ts` — 新增 `createSemanticEmbeddingAdapter(service?)` 工厂 + 本地 `coerceVec768`；`createNoopEmbeddingAdapter` 与默认保持不动。
- **Modify** `api/src/server.ts` — 生产组装 meeting-notes deps（`:275` 的 `createMeetingNotesDeps({...})`）注入 `embedding: createSemanticEmbeddingAdapter()`。
- **Create** `api/src/modules/content-library/scripts/backfillEntityEmbeddings.ts` — 存量 `content_entities` 空向量补算函数。
- **Create** `api/src/scripts/backfill-entity-embeddings.ts` — 补算 CLI 入口（镜像 `api/src/scripts/backfill-people-content-entity.ts` 的直接 deps 组装）。
- **Create tests** — `semantic-embedding-adapter.test.ts`、`backfill-entity-embeddings.test.ts`。

---

## Task 1: 语义门控嵌入适配器

**Files:**
- Modify: `api/src/services/assets-ai/embedding.ts`（加 `get provider()`）
- Modify: `api/src/modules/meeting-notes/adapters/pipeline.ts`（加工厂 + coerceVec768）
- Test: `api/tests/unit/meeting-notes/semantic-embedding-adapter.test.ts`

**Interfaces:**
- Consumes: `EmbeddingService`（`embed(text): Promise<number[]>`，新增 `get provider(): string`）；`getEmbeddingService()`（singleton）。
- Produces: `export function createSemanticEmbeddingAdapter(service?: EmbeddingService): EmbeddingAdapter`（返回与 `createNoopEmbeddingAdapter` 相同的 `EmbeddingAdapter` 类型）。

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/semantic-embedding-adapter.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createSemanticEmbeddingAdapter } from '../../../src/modules/meeting-notes/adapters/pipeline.js';

function fakeService(provider: string, embedImpl: (t: string) => Promise<number[]>) {
  return { provider, embed: vi.fn(embedImpl) } as any;
}

describe('createSemanticEmbeddingAdapter', () => {
  it('真 provider：返回 coerce 到 768 维的向量', async () => {
    const svc = fakeService('siliconflow', async () => new Array(4).fill(0.5));
    const ad = createSemanticEmbeddingAdapter(svc);
    const v = await ad.embed('张伟');
    expect(v).toHaveLength(768);
    expect(v[0]).toBe(0.5);
    expect(v[4]).toBe(0); // 补零
  });

  it('provider=local：返回 [] （不写垃圾向量）', async () => {
    const svc = fakeService('local', async () => new Array(768).fill(0.1));
    const ad = createSemanticEmbeddingAdapter(svc);
    expect(await ad.embed('张伟')).toEqual([]);
    expect(svc.embed).not.toHaveBeenCalled(); // 门控在调用前短路
  });

  it('真 provider 抛错：降级 [] 不抛穿', async () => {
    const svc = fakeService('openai', async () => { throw new Error('timeout'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createSemanticEmbeddingAdapter(svc);
    expect(await ad.embed('张伟')).toEqual([]);
    warn.mockRestore();
  });

  it('embedBatch：真 provider coerce 每条；local 全 []', async () => {
    const real = createSemanticEmbeddingAdapter(fakeService('siliconflow', async () => new Array(768).fill(1)));
    expect((await real.embedBatch(['a', 'b'])).map((r) => r.length)).toEqual([768, 768]);
    const local = createSemanticEmbeddingAdapter(fakeService('local', async () => new Array(768).fill(1)));
    expect(await local.embedBatch(['a', 'b'])).toEqual([[], []]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/semantic-embedding-adapter.test.ts`
Expected: FAIL（`createSemanticEmbeddingAdapter` 未导出）

- [ ] **Step 3: 加 provider getter**

在 `api/src/services/assets-ai/embedding.ts` 的 `EmbeddingService` 类里（紧挨 `async embed(...)` 之前，约 line 118）加：

```typescript
  /** 当前活跃 provider（'siliconflow'|'openai'|'kimi'|'dashboard-llm'|'local'），供门控读取 */
  get provider(): string {
    return this.config.provider;
  }
```

- [ ] **Step 4: 实现工厂**

在 `api/src/modules/meeting-notes/adapters/pipeline.ts` 顶部 import（与现有 import 并列）：

```typescript
import { getEmbeddingService, type EmbeddingService } from '../../../services/assets-ai/embedding.js';
```

在 `createNoopEmbeddingAdapter` 附近新增（`coerceVec768` 与 content-library 私有实现同义，本地复制一份避免跨模块耦合，仅 6 行）：

```typescript
function coerceVec768(v: number[]): number[] {
  if (v.length === 768) return v;
  if (v.length > 768) return v.slice(0, 768);
  const out = v.slice();
  while (out.length < 768) out.push(0);
  return out;
}

/**
 * 语义门控的真嵌入适配器。
 * provider!=='local' → coerceVec768(service.embed(text))；
 * provider==='local'（哈希兜底,无语义）→ 返回 []，经 EntityResolver C1 guard 落 null，
 * 保持 P2 的 exact+alias 行为，杜绝垃圾向量导致的误合并。
 * 真嵌入调用抛错 → 降级 [] + warn，绝不 sink 上游解析。
 */
export function createSemanticEmbeddingAdapter(
  service: EmbeddingService = getEmbeddingService(),
): EmbeddingAdapter {
  const semantic = () => service.provider !== 'local';
  return {
    async embed(text: string): Promise<number[]> {
      if (!semantic()) return [];
      try {
        return coerceVec768(await service.embed(text));
      } catch (e) {
        console.warn('[semanticEmbed] 语义向量失败，降级 []:', (e as Error).message);
        return [];
      }
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (!semantic()) return texts.map(() => []);
      try {
        const rows = await Promise.all(texts.map((t) => service.embed(t)));
        return rows.map(coerceVec768);
      } catch (e) {
        console.warn('[semanticEmbedBatch] 语义向量失败，降级 []:', (e as Error).message);
        return texts.map(() => []);
      }
    },
  };
}
```

> 实现者：确认 `EmbeddingAdapter` 类型在本文件已被 `createNoopEmbeddingAdapter` 引用/导入，工厂复用同一类型；不要新造类型。

- [ ] **Step 5: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/semantic-embedding-adapter.test.ts`
Expected: PASS（4 tests）。`npx tsc --noEmit` exit 0。

- [ ] **Step 6: Commit**

```bash
git add api/src/services/assets-ai/embedding.ts \
        api/src/modules/meeting-notes/adapters/pipeline.ts \
        api/tests/unit/meeting-notes/semantic-embedding-adapter.test.ts
git commit -m "feat(meeting-notes): 语义门控真嵌入适配器（local→[]，防垃圾向量）(P3a-1)"
```

---

## Task 2: 生产入口注入真适配器

**Files:**
- Modify: `api/src/server.ts`（`:275` 的 `createMeetingNotesDeps({...})`）
- Test: `api/tests/unit/meeting-notes/pipeline-embedding-injection.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `createSemanticEmbeddingAdapter`；`createPipelineDeps`（`adapters/pipeline.ts`，`embedding: input.embedding ?? createNoopEmbeddingAdapter()`）。
- Produces: 无新导出；生产 deps.embedding 变为语义门控真适配器。

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/pipeline-embedding-injection.test.ts`

> 目的：锁定「显式传入的 embedding 适配器会被 `createPipelineDeps` 采用」这条契约（server.ts 的 wiring 本身难单测，但这条契约保证注入生效）。

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createPipelineDeps } from '../../../src/modules/meeting-notes/adapters/pipeline.js';

describe('createPipelineDeps embedding 注入', () => {
  it('显式传入的 embedding 适配器被采用（而非 noop）', () => {
    const marker = { embed: vi.fn(async () => [1, 2, 3]), embedBatch: vi.fn(async () => [[1]]) };
    // createPipelineDeps 需要的其它 input 依赖用最小桩；实现者按该函数实际入参补齐
    const deps = createPipelineDeps({ db: { query: vi.fn() }, embedding: marker } as any);
    expect(deps.embedding).toBe(marker);
  });

  it('未传 embedding → 回退 noop（embed 返回 []）', async () => {
    const deps = createPipelineDeps({ db: { query: vi.fn() } } as any);
    expect(await deps.embedding.embed('x')).toEqual([]);
  });
});
```

> 实现者：先 Read `createPipelineDeps` 的入参结构（`adapters/pipeline.ts`），把上面桩里的 `db` 等必填项补全到该函数真正要求的最小集合，使两条断言可跑。若该函数强依赖更多 adapter 才能返回，改为直接断言 `input.embedding ?? createNoopEmbeddingAdapter()` 这行的行为等价形式——但必须真实覆盖「传入即采用 / 不传即 noop」。

- [ ] **Step 2: 运行确认失败/或先建立基线**

Run: `cd api && npx vitest run tests/unit/meeting-notes/pipeline-embedding-injection.test.ts`
Expected: 第一条可能已 PASS（契约本已存在）；若已 PASS 则本 task 的 TDD 重心是 server.ts 注入不可回归——保留此测试作防回归锚，继续 Step 3。

- [ ] **Step 3: server.ts 注入**

先 import（与 `createMeetingNotesDeps` 的 import 并列，`server.ts` 顶部）：

```typescript
import { createSemanticEmbeddingAdapter } from './modules/meeting-notes/adapters/pipeline.js';
```

在 `server.ts:275` 的 `createMeetingNotesDeps({ ... })` 对象字面量里加一行（与其它 adapter 并列）：

```typescript
      embedding: createSemanticEmbeddingAdapter(),
```

> 实现者：Read `server.ts:270-290` 确认该对象字面量结构与是否已有 `embedding:` 键；若已有（不太可能）则替换，否则新增。确认 `createMeetingNotesDeps` 即 `createPipelineDeps`（`server.ts:77` 的 alias import）。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/pipeline-embedding-injection.test.ts`
Expected: PASS。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/server.ts \
        api/tests/unit/meeting-notes/pipeline-embedding-injection.test.ts
git commit -m "feat(meeting-notes): 生产入口注入语义门控嵌入，唤醒 P2 模糊匹配 (P3a-2)"
```

---

## Task 3: content_entities 空向量补算脚本

**Files:**
- Create: `api/src/modules/content-library/scripts/backfillEntityEmbeddings.ts`
- Create: `api/src/scripts/backfill-entity-embeddings.ts`
- Test: `api/tests/unit/content-library/backfill-entity-embeddings.test.ts`

**Interfaces:**
- Consumes: `deps.db.query`、`deps.embedding.embed`（Task 1 的语义门控适配器；`provider==='local'` 时 embed 返回 `[]` → 该行跳过）。
- Produces: `export async function backfillEntityEmbeddings(deps: { db: DatabaseAdapter; embedding: EmbeddingAdapter }): Promise<{ scanned: number; embedded: number }>`。

- [ ] **Step 1: 写失败测试** `api/tests/unit/content-library/backfill-entity-embeddings.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { backfillEntityEmbeddings } from '../../../src/modules/content-library/scripts/backfillEntityEmbeddings.js';

function makeDeps(rows: any[], embed: (t: string) => Promise<number[]>) {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/SELECT .* FROM content_entities/i.test(sql)) return { rows };
      return { rows: [] };
    }),
  };
  return { deps: { db, embedding: { embed: vi.fn(embed), embedBatch: vi.fn() } } as any, calls };
}

describe('backfillEntityEmbeddings', () => {
  it('对空向量行补算并 UPDATE，返回 {scanned, embedded}', async () => {
    const { deps, calls } = makeDeps(
      [{ id: 'e1', canonical_name: '腾讯' }, { id: 'e2', canonical_name: '阿里' }],
      async () => new Array(768).fill(0.2),
    );
    const r = await backfillEntityEmbeddings(deps);
    expect(r).toEqual({ scanned: 2, embedded: 2 });
    const updates = calls.filter((c) => /UPDATE content_entities SET embedding/i.test(c.sql));
    expect(updates).toHaveLength(2);
    expect(typeof updates[0].params[1]).toBe('string'); // JSON.stringify(vec)
  });

  it('embed 返回 [] （local provider）→ 跳过 UPDATE，embedded=0', async () => {
    const { deps, calls } = makeDeps([{ id: 'e1', canonical_name: '腾讯' }], async () => []);
    const r = await backfillEntityEmbeddings(deps);
    expect(r).toEqual({ scanned: 1, embedded: 0 });
    expect(calls.some((c) => /UPDATE content_entities SET embedding/i.test(c.sql))).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/content-library/backfill-entity-embeddings.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现补算函数** `api/src/modules/content-library/scripts/backfillEntityEmbeddings.ts`

```typescript
// content_entities 空向量补算：仅当活跃 embedding 适配器产出非空向量时写库
// （语义门控：local provider → embed 返回 []，本脚本自然跳过，不写垃圾向量）
import type { DatabaseAdapter, EmbeddingAdapter } from '../types.js';

export async function backfillEntityEmbeddings(
  deps: { db: DatabaseAdapter; embedding: EmbeddingAdapter },
): Promise<{ scanned: number; embedded: number }> {
  const res = await deps.db.query(
    `SELECT id, canonical_name FROM content_entities WHERE embedding IS NULL`,
  );
  let embedded = 0;
  for (const row of res.rows) {
    const name = String(row.canonical_name ?? '').trim();
    if (!name) continue;
    let vec: number[] = [];
    try {
      vec = await deps.embedding.embed(name);
    } catch {
      vec = [];
    }
    if (Array.isArray(vec) && vec.length > 0) {
      await deps.db.query(
        `UPDATE content_entities SET embedding = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, JSON.stringify(vec)],
      );
      embedded += 1;
    }
  }
  return { scanned: res.rows.length, embedded };
}
```

> 实现者：确认 `content-library/types.ts` 导出 `DatabaseAdapter` 与 `EmbeddingAdapter`（Explore 已证 `EmbeddingAdapter` 在 `types.ts:31`）。若 `DatabaseAdapter` 名称/路径不同，Read `types.ts` 用真实名。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/content-library/backfill-entity-embeddings.test.ts`
Expected: PASS（2 tests）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: 写 CLI 入口** `api/src/scripts/backfill-entity-embeddings.ts`

镜像 `api/src/scripts/backfill-people-content-entity.ts`（P1 已建）的直接 deps 组装方式，但 embedding 用真适配器：

```typescript
// CLI：补算 content_entities 空向量。用法：node dist/scripts/backfill-entity-embeddings.js
import { createPipelineDBAdapter, createPipelineDeps } from '../modules/meeting-notes/adapters/pipeline.js';
import { createSemanticEmbeddingAdapter } from '../modules/meeting-notes/adapters/pipeline.js';
import { backfillEntityEmbeddings } from '../modules/content-library/scripts/backfillEntityEmbeddings.js';

async function main() {
  const db = createPipelineDBAdapter();
  const deps = createPipelineDeps({ db, embedding: createSemanticEmbeddingAdapter() } as any);
  const r = await backfillEntityEmbeddings({ db: deps.db, embedding: deps.embedding });
  console.log(`[backfill-entity-embeddings] scanned=${r.scanned} embedded=${r.embedded}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> 实现者：Read `api/src/scripts/backfill-people-content-entity.ts` 与 `adapters/pipeline.ts`，用其真实的 DB adapter 工厂名（可能是 `createPipelineDBAdapter` 或别名）与 `createPipelineDeps` 入参形状；对齐后再定稿。此 CLI 无单测（属运维脚本），但 `tsc --noEmit` 必须过。

- [ ] **Step 6: tsc 全量校验 + Commit**

Run: `cd api && npx tsc --noEmit`，Expected: exit 0。

```bash
git add api/src/modules/content-library/scripts/backfillEntityEmbeddings.ts \
        api/src/scripts/backfill-entity-embeddings.ts \
        api/tests/unit/content-library/backfill-entity-embeddings.test.ts
git commit -m "feat(content-library): content_entities 空向量补算脚本 + CLI (P3a-3)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** 本 P3a 对应总 spec §5 的 P3 中「真 embedding」这一子块（P3 的其余：org/product 等 5 类走 resolver + 修 persistClaudeWiki → P3b；content_entities 通用合并函数 → P3c，各自出计划）。P3a 独立可上线、可回滚（不注入即回 noop）。

**类型一致：** `createSemanticEmbeddingAdapter(service?): EmbeddingAdapter` 在 Task 1 定义、Task 2/3 引用一致；`backfillEntityEmbeddings(deps): Promise<{scanned;embedded}>` Task 3 内自洽；`EmbeddingService.provider` getter Task 1 加、Task 1 工厂读。

**Placeholder 扫描：** 无 TBD/TODO；每个 code step 给全代码。三处「实现者：先 Read 确认真实入参/类型名」是**校验指令**（因 `createPipelineDeps`/`createPipelineDBAdapter` 的确切入参形状需对齐现有代码），非占位——每处都给了默认实现与对齐目标。

**已知边界（明确记录）：**
1. **价值取决于运维配 key**：生产没配真 provider key → provider=local → 本计划安全地不写向量（P2 exact+alias 行为不变），模糊归一仍休眠。P3a 交付的是「一旦 key 就绪即自动生效」的接线，不负责配 key。
2. **coerceVec768 本地复制**：content-library 的同名函数私有未导出，本计划在 meeting-notes 侧复制 6 行避免跨模块耦合；若日后需统一可提取共享 util（YAGNI，暂不做）。
3. **补算脚本不并发**：逐行 embed+UPDATE，存量大时慢但稳（避免打爆嵌入 API 限流）；需要再优化时可批量化，属后续。
4. **未触 P3b/P3c**：org/product/event/location/project 走 resolver、persistClaudeWiki 修复、通用合并函数均不在本计划。特别地 `'project'` 不在 `EntityType` union，留给 P3b 决策。
