# content_entities.embedding → vector(1024) 升维 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `content_entities.embedding` 从 `vector(768)` 升到 `vector(1024)`,让实体注册/去重/自动合并跑在**原生 bge-m3 1024 向量**上(去掉截断损耗),且**完全不动** HybridSearch / `asset_embeddings`(1536) / `content_facts`。

**Architecture:** 给两处 `EntityResolver` 构造点(content-library `ContentLibraryEngine` + meeting-notes `ensurePersonByName`)注入一个**专用 1024 语义适配器**,与 content-library 的 `deps.embedding`(HybridSearch 用,维持原样)彻底解耦。meeting-notes 侧把 `coerceVec768`→`coerceVec1024`;content-library 侧新增一个 1024 语义适配器(放 content-library,避免 content-library→meeting-notes 反向依赖)。列改 1024 用幂等守卫式迁移。改完后运维:跑一次 1024 重嵌入。

**Tech Stack:** PostgreSQL + pgvector · TypeScript (ESM `.js`) · SiliconFlow bge-m3(原生 1024)· vitest。

## Global Constraints

- **绝不触碰** content-library 的 `deps.embedding`、`HybridSearch`、`asset_embeddings`(`vector(1536)`)、`content_facts.embedding`。它们与本次无关,动了会崩资产语义搜索。
- **专用 1024 实体适配器**只服务:content-library `EntityResolver`、meeting-notes `EntityResolver`(ensurePersonByName)、`PersonRoster`(resolveAsync)、重嵌入 CLI。这些都只读写 `content_entities.embedding`。
- **语义门控保留**:`provider==='local'` → 产出 `[]`(不写垃圾),真 provider(bge-m3)→ `embedSemanticStrict` 原生 1024 → `coerceVec1024`(基本直通)。真 provider 失败即降级 `[]`(承接 P3a I1/C1)。
- **依赖方向**:meeting-notes→content-library 是唯一方向(已证)。1024 适配器放 **content-library**(neutral 亦可),**禁止** content-library import meeting-notes。
- **迁移幂等**:列改用 `DO` 块,**仅当当前维度=768 时**才 `DROP INDEX`+`DROP COLUMN`+`ADD COLUMN vector(1024)`;当前已是 1024 则跳过(否则每次启动清空重嵌入结果)。pgvector 不能把 768 数据 cast 到 1024,所以是 DROP+ADD(数据清空 → 靠重嵌入重建,可接受)。
- **ivfflat 索引**:`connection.ts` 现有 `CREATE INDEX IF NOT EXISTS idx_content_entities_embedding ... ivfflat`(带 `.catch` 吞错)——迁移里先 `DROP INDEX IF EXISTS`,现有 CREATE 块会在 1024 列上重建(空表建 ivfflat 会 warn 但 OK;数据回来后有效)。
- ESM `.js`。一 task 一 commit,`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Modify** `api/src/modules/meeting-notes/adapters/pipeline.ts` — `coerceVec768`→`coerceVec1024`(重命名+1024);`createSemanticEmbeddingAdapter` 产出 1024。
- **Modify** `api/tests/unit/meeting-notes/semantic-embedding-adapter.test.ts` — 768→1024 断言。
- **Create** `api/src/modules/content-library/adapters/entityEmbedding.ts` — `createEntityEmbeddingAdapter()`(1024 语义门控,wraps `getEmbeddingService()`)。
- **Modify** `api/src/modules/content-library/ContentLibraryEngine.ts:90` — EntityResolver 用 1024 适配器。
- **Modify** `api/src/db/connection.ts`(`setupContentLibrarySchema`)— 幂等守卫式 ALTER 到 1024 + drop 旧索引。
- **Create tests** — `entity-embedding-1024.test.ts`(content-library 适配器)、`content-entities-1024-migration.test.ts`(迁移 SQL 断言)。

---

## Task 1: meeting-notes 适配器 → 1024

**Files:**
- Modify: `api/src/modules/meeting-notes/adapters/pipeline.ts`
- Test: `api/tests/unit/meeting-notes/semantic-embedding-adapter.test.ts`

**Interfaces:**
- Produces: `createSemanticEmbeddingAdapter()` 现产出 1024 维(名字签名不变,现有调用点零改)。

- [ ] **Step 1: 改 coerce**

`meeting-notes/adapters/pipeline.ts`:把 `coerceVec768` 重命名为 `coerceVec1024` 并改 1024(现在 96-102 行):

```typescript
function coerceVec1024(v: number[]): number[] {
  if (v.length === 1024) return v;
  if (v.length > 1024) return v.slice(0, 1024);
  const out = v.slice();
  while (out.length < 1024) out.push(0);
  return out;
}
```

把 `createSemanticEmbeddingAdapter` 里两处 `coerceVec768(...)`（约 120、130 行）改成 `coerceVec1024(...)`。

- [ ] **Step 2: 改测试断言**

`semantic-embedding-adapter.test.ts`:把断言里 `toHaveLength(768)` / `new Array(768)` 相关改为 1024（真 provider 分支断言长度 1024;local→[] 分支不变;抛错→[] 不变)。READ 该测试文件,逐处把 768 期望改 1024(mock 返回向量可用 `new Array(4).fill(0.5)` → coerce 后 1024)。

- [ ] **Step 3: 跑测试 + tsc**

Run: `cd api && npx vitest run tests/unit/meeting-notes/semantic-embedding-adapter.test.ts`;`npx tsc --noEmit`。Expected: PASS + exit 0。

- [ ] **Step 4: Commit**

```bash
git add api/src/modules/meeting-notes/adapters/pipeline.ts api/tests/unit/meeting-notes/semantic-embedding-adapter.test.ts
git commit -m "feat(meeting-notes): 语义嵌入适配器 768→1024（去截断）(1024-1)"
```

---

## Task 2: content-library 专用 1024 实体适配器

**Files:**
- Create: `api/src/modules/content-library/adapters/entityEmbedding.ts`
- Test: `api/tests/unit/content-library/entity-embedding-1024.test.ts`

**Interfaces:**
- Consumes: `getEmbeddingService`（`services/assets-ai/embedding.js`）;`EmbeddingAdapter`（content-library types）。
- Produces: `export function createEntityEmbeddingAdapter(service?): EmbeddingAdapter`（1024 语义门控,只服务 content_entities）。

- [ ] **Step 1: 写失败测试** `api/tests/unit/content-library/entity-embedding-1024.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createEntityEmbeddingAdapter } from '../../../src/modules/content-library/adapters/entityEmbedding.js';

function fake(provider: string, embed: (t: string) => Promise<number[]>) {
  return { provider, embedSemanticStrict: vi.fn(embed) } as any;
}

describe('createEntityEmbeddingAdapter (1024)', () => {
  it('真 provider → coerce 到 1024', async () => {
    const ad = createEntityEmbeddingAdapter(fake('siliconflow', async () => new Array(4).fill(0.5)));
    const v = await ad.embed('欧莱雅');
    expect(v).toHaveLength(1024);
    expect(v[0]).toBe(0.5);
  });
  it('local → [] 不写垃圾', async () => {
    const svc = fake('local', async () => new Array(1024).fill(0.1));
    const ad = createEntityEmbeddingAdapter(svc);
    expect(await ad.embed('x')).toEqual([]);
    expect(svc.embedSemanticStrict).not.toHaveBeenCalled();
  });
  it('真 provider 抛错 → [] 降级', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createEntityEmbeddingAdapter(fake('siliconflow', async () => { throw new Error('x'); }));
    expect(await ad.embed('x')).toEqual([]);
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `cd api && npx vitest run tests/unit/content-library/entity-embedding-1024.test.ts`（模块不存在）。

- [ ] **Step 3: 实现** `api/src/modules/content-library/adapters/entityEmbedding.ts`

```typescript
// content_entities 专用 1024 语义嵌入适配器（与 HybridSearch 的 deps.embedding 解耦）。
// 语义门控：local→[]；真 provider→embedSemanticStrict 原生 1024→coerce；失败→[]。
import { getEmbeddingService, type EmbeddingService } from '../../../services/assets-ai/embedding.js';
import type { EmbeddingAdapter } from '../types.js';

function coerceVec1024(v: number[]): number[] {
  if (v.length === 1024) return v;
  if (v.length > 1024) return v.slice(0, 1024);
  const out = v.slice();
  while (out.length < 1024) out.push(0);
  return out;
}

export function createEntityEmbeddingAdapter(
  service: EmbeddingService = getEmbeddingService(),
): EmbeddingAdapter {
  const semantic = () => service.provider !== 'local';
  return {
    async embed(text: string): Promise<number[]> {
      if (!semantic()) return [];
      try {
        return coerceVec1024(await service.embedSemanticStrict(text));
      } catch (e) {
        console.warn('[entityEmbed] 语义向量失败，降级 []:', (e as Error).message);
        return [];
      }
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (!semantic()) return texts.map(() => []);
      try {
        const rows = await Promise.all(texts.map((t) => service.embedSemanticStrict(t)));
        return rows.map(coerceVec1024);
      } catch (e) {
        console.warn('[entityEmbedBatch] 语义向量失败，降级 []:', (e as Error).message);
        return texts.map(() => []);
      }
    },
  };
}
```

> 实现者：确认 `EmbeddingService` 有公有 `get provider()` 与 `embedSemanticStrict`（P3a 已加）;`EmbeddingAdapter` 类型在 content-library `types.ts`。

- [ ] **Step 4: 运行确认通过 + tsc** — Expected: PASS + tsc 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/content-library/adapters/entityEmbedding.ts api/tests/unit/content-library/entity-embedding-1024.test.ts
git commit -m "feat(content-library): 专用 1024 实体嵌入适配器（解耦 HybridSearch）(1024-2)"
```

---

## Task 3: EntityResolver 用 1024 适配器（两处构造点）

**Files:**
- Modify: `api/src/modules/content-library/ContentLibraryEngine.ts`（约 line 90）

**Interfaces:**
- Consumes: Task 2 的 `createEntityEmbeddingAdapter`。

- [ ] **Step 1: 改 content-library 构造点**

`ContentLibraryEngine.ts` 顶部 import：

```typescript
import { createEntityEmbeddingAdapter } from './adapters/entityEmbedding.js';
```

把（约 line 90）：

```typescript
this.entityResolver = new EntityResolver(deps.db, deps.embedding);
```

改为：

```typescript
// content_entities.embedding 用专用 1024 适配器；deps.embedding（HybridSearch/资产 1536）保持不动
this.entityResolver = new EntityResolver(deps.db, createEntityEmbeddingAdapter());
```

> 实现者：READ `ContentLibraryEngine.ts` 确认 line 90 附近仅此一处 `new EntityResolver`;`deps.embedding` 的其它用途（HybridSearch 等）**不要动**。meeting-notes 侧的 `new EntityResolver(deps.db, deps.embedding)`（participantExtractor）无需改——Task 1 已让 meeting-notes 的 `deps.embedding`（createSemanticEmbeddingAdapter）产出 1024。

- [ ] **Step 2: tsc + 相关单测回归**

Run: `cd api && npx tsc --noEmit`;`npx vitest run tests/unit/meeting-notes/ensure-person-content-entity.test.ts tests/unit/content-library/entity-resolver.test.ts`。Expected: tsc 0 + 通过（这些 mock db,维度无关,应仍绿）。

- [ ] **Step 3: Commit**

```bash
git add api/src/modules/content-library/ContentLibraryEngine.ts
git commit -m "feat(content-library): EntityResolver 用 1024 适配器,不动 HybridSearch (1024-3)"
```

---

## Task 4: content_entities.embedding 列 → vector(1024)（幂等守卫式迁移）

**Files:**
- Modify: `api/src/db/connection.ts`（`setupContentLibrarySchema`）
- Test: `api/tests/unit/content-library/content-entities-1024-migration.test.ts`

**Interfaces:**
- Produces: 启动时幂等把 `content_entities.embedding` 由 768 改 1024（仅当前是 768 时）。

- [ ] **Step 1: 写失败测试** `api/tests/unit/content-library/content-entities-1024-migration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function connSrc(): string {
  const p = fileURLToPath(new URL('../../../src/db/connection.ts', import.meta.url));
  return readFileSync(p, 'utf8');
}

describe('content_entities 1024 迁移', () => {
  it('含幂等守卫式 ALTER 到 vector(1024)', () => {
    const s = connSrc();
    // 守卫：检测当前维度 / 仅 768 时才改
    expect(s).toMatch(/content_entities.*embedding.*vector\(1024\)/s);
    expect(s).toMatch(/DROP INDEX IF EXISTS idx_content_entities_embedding/);
    // 幂等守卫标记（DO 块 + 维度判断）
    expect(s).toMatch(/atttypmod|format_type|vector\(768\)/);
  });
});
```

- [ ] **Step 2: 运行确认失败** — `cd api && npx vitest run tests/unit/content-library/content-entities-1024-migration.test.ts`。

- [ ] **Step 3: 实现守卫式迁移**

在 `setupContentLibrarySchema` 里、`CREATE TABLE IF NOT EXISTS content_entities (...)`（约 line 1507-1518）**之后**、创建 embedding 索引之前,插入幂等守卫块：

```typescript
  // content_entities.embedding 768→1024：仅当现列是 vector(768) 时改（幂等，避免重启清空重嵌入）
  await query(`
    DO $$
    DECLARE cur text;
    BEGIN
      SELECT format_type(atttypid, atttypmod) INTO cur
        FROM pg_attribute
       WHERE attrelid = 'content_entities'::regclass AND attname = 'embedding' AND NOT attisdropped;
      IF cur = 'vector(768)' THEN
        DROP INDEX IF EXISTS idx_content_entities_embedding;
        ALTER TABLE content_entities DROP COLUMN embedding;
        ALTER TABLE content_entities ADD COLUMN embedding vector(1024);
      END IF;
    END $$;
  `).catch((e: any) => console.log('[DB] content_entities 1024 迁移跳过:', e?.message));
```

把该文件里 `CREATE TABLE ... content_entities (... embedding vector(768) ...)` 的列定义也改成 `vector(1024)`（首次建表即 1024;守卫块处理已存在的 768 表）。

> 实现者：READ `connection.ts:1507-1518` + 索引块(1674-1677)。确认：(a) 新建表用 1024;(b) 守卫块只改已存在的 768 表;(c) 现有 `CREATE INDEX IF NOT EXISTS idx_content_entities_embedding ... ivfflat` 保留（drop 后它会在 1024 上重建）。**不要动 content_facts(768) 与 asset_embeddings(1536) 的定义。**

- [ ] **Step 4: 运行确认通过 + tsc** — Expected: PASS + tsc 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/db/connection.ts api/tests/unit/content-library/content-entities-1024-migration.test.ts
git commit -m "feat(db): content_entities.embedding 768→1024 幂等守卫式迁移 (1024-4)"
```

---

## Task 5（运维·controller 执行,非 subagent）: 应用迁移 + 1024 重嵌入 + 验证

> 本 task 由 controller 在合并后对共享 DB 执行(改 schema + 重嵌入),不派 subagent。

- [ ] **Step 1**: 对共享 DB 应用列迁移（跑一段触发守卫块的脚本,或直接执行守卫 SQL）。确认 `format_type` 显示 `vector(1024)`、旧索引已 drop。
- [ ] **Step 2**: 跑 `cd api && npx tsx src/scripts/reembed-entity-embeddings.ts`（适配器现产 1024）→ 4330 行填 1024 向量。
- [ ] **Step 3**: 验证：`SELECT format_type(...)`=vector(1024);`SELECT vector_dims(embedding)` 抽样=1024;重跑 cosine（欧莱雅 vs 薇姿/自然堂）应 ≥ 之前 768 的 0.28~0.48（1024 无截断,预期相近或更好）。
- [ ] **Step 4**: 索引：确认 `idx_content_entities_embedding` 在 1024 上重建（或手动 `CREATE INDEX ... ivfflat`）。

---

## Self-Review（作者已核对）

**Spec 覆盖：** Scheme A 完整——列 1024(Task4)、去截断的 1024 适配器(Task1 meeting-notes / Task2 content-library)、EntityResolver 接线(Task3)、运维迁移+重嵌入(Task5)。**明确不碰**:HybridSearch/`deps.embedding`/`asset_embeddings`(1536)/`content_facts`。

**类型一致：** `createEntityEmbeddingAdapter()`(Task2)→ ContentLibraryEngine(Task3);meeting-notes `createSemanticEmbeddingAdapter` 现 1024(Task1)覆盖 roster/person-EntityResolver/reembed CLI(维度无关的调用点无需改);迁移列 1024 与两个适配器 coerce 1024 对齐。P4a `findMergeCandidatePairs`/EntityResolver bind 维度无关,不改。

**已知边界：**
1. **迁移清空再重嵌入**:DROP+ADD 会清空 embedding,Step5 重嵌入前有空窗(功能短暂空转)。可接受。守卫确保只发生一次。
2. **两份 1024 coerce**(meeting-notes + content-library 各一份 ~6 行):模块边界所需(禁反向依赖),小重复可接受;要 DRY 可后续抽 neutral util。
3. **索引 ivfflat 空表 warn**:drop 后现有 CREATE IF NOT EXISTS 在(可能空的)1024 列上重建;数据回来后有效;`.catch` 已吞错。
4. **薇姿仍偏低是"只嵌名字"所致**,与 768/1024 无关;要更高召回需把嵌入内容从纯名字扩到名字+简介(独立后续)。
