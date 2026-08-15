# P4a 会议实体统一 · embedding 自动合并任务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个后端任务，扫描同 `entity_type` 且向量余弦相似的 `content_entities` 对，按「双档」策略处理：非 person 类型且相似度 ≥ 自动档阈值 → 直接调 `mergeContentEntities` 合并；其余（中档相似 + 所有 person 对）→ 写入 `content_entity_merge_candidates` 候选表交人工复核。

**Architecture:** SQL 自连接找相似对（`1 - (a.embedding <=> b.embedding)`），target=较早创建者。编排函数 `autoMergeContentEntities` 逐对路由：非 person 且 sim ≥ 自动档 → `mergeContentEntities`（P3c 已建，事务内重指向+删源）；否则 upsert 候选表。person 对**恒进候选**（不自动合并，规避 I1 跨 workspace 同名塌缩）。CLI 入口镜像 `backfill-entity-embeddings.ts` 一次性运行。

**Tech Stack:** PostgreSQL + pgvector (`<=>` 余弦距离) · TypeScript (ESM, `.js` 后缀) · vitest（mock `db.query`，不连真库、不打真嵌入）。

## Global Constraints

- **双档阈值（默认）**：`autoThreshold = 0.97`（≥ 自动合并），`proposeThreshold = 0.90`（≥ 提候选、< 自动档）。相似度 = `1 - (a.embedding <=> b.embedding)`（pgvector `<=>` 余弦距离，本仓库既定：`hybridSearch.ts:167`）。
- **person 对恒不自动合并**：`entity_type='person'` 的对无论相似度多高，**只进候选表**，绝不在本任务里合并。理由：person 身份 workspace-scoped，自动合并会塌缩 I1 已刻意推迟的跨 workspace 同名——person 合并须由人工经 `mn_merge_people`（workspace 语义）确认。非 person 类型（org/product/event/location/concept 等）本就全局，双档适用。
- **只用 `mergeContentEntities`**：自动档合并调 P3c 的 `mergeContentEntities(deps, targetId, sourceId)`（`content-library/consolidation/mergeEntities.ts`）；本任务**不**调 `mn_merge_people`（那是 person 人工路径，P4b/人工审批时用）。
- **target = 较早创建者**：一对里 target（存活）= `created_at` 较早者，tie-break 较小 id；source（删除）= 另一个。
- **只扫有向量的**：`a.embedding IS NOT NULL AND b.embedding IS NOT NULL`；`a.id < b.id` 去反向重复。生产未配真 embedding 时 `content_entities.embedding` 多为 null，本任务自然扫不出对（安全空转）。
- **消费去重**：自动合并会删 source；同一 source/target 不得在本轮被二次处理——用内存 `Set` 跳过已消费端点的后续对。
- **有界**：SQL 带 `LIMIT`（默认 500）防 O(N²) 自连接失控；文档记明大规模需改 per-entity KNN。
- **迁移**：候选表放 meeting-notes 迁移 `034-entity-merge-candidates.sql`，登记进 `ensureMeetingNotesSchema.ts` 的 `FILES`（当前末位 `033-merge-content-entities.sql`）。
- **best-effort**：单对合并抛错（如 source 已被上一对删掉）→ `console.warn` 跳过，不中断整轮。
- ESM `.js` 后缀。一 task 一 commit，message 结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Create** `api/src/modules/meeting-notes/migrations/034-entity-merge-candidates.sql` — `content_entity_merge_candidates` 候选表。
- **Modify** `api/src/db/ensureMeetingNotesSchema.ts` — `FILES` 追加 `'034-entity-merge-candidates.sql'`。
- **Create** `api/src/modules/content-library/consolidation/autoMergeEntities.ts` — `findMergeCandidatePairs` + `autoMergeContentEntities`。
- **Create** `api/src/scripts/auto-merge-entities.ts` — CLI 入口。
- **Create tests** — `entity-merge-candidates-migration.test.ts`、`auto-merge-entities.test.ts`。

---

## Task 1: content_entity_merge_candidates 候选表

**Files:**
- Create: `api/src/modules/meeting-notes/migrations/034-entity-merge-candidates.sql`
- Modify: `api/src/db/ensureMeetingNotesSchema.ts`
- Test: `api/tests/unit/meeting-notes/entity-merge-candidates-migration.test.ts`

**Interfaces:**
- Produces: 表 `content_entity_merge_candidates(target_entity_id, source_entity_id, entity_type, similarity, status, created_at)`，`UNIQUE(target_entity_id, source_entity_id)`。

- [ ] **Step 1: 写迁移** `api/src/modules/meeting-notes/migrations/034-entity-merge-candidates.sql`

```sql
-- Meeting Notes Module · 034 — content_entity_merge_candidates 实体合并候选队列
-- P4a 自动合并任务把「中档相似」及「所有 person 对」写入此表，交 P4b/人工复核。
CREATE TABLE IF NOT EXISTS content_entity_merge_candidates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_entity_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  entity_type      VARCHAR(50) NOT NULL,
  similarity       DOUBLE PRECISION NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_entity_id, source_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_merge_candidates_status
  ON content_entity_merge_candidates(status);
```

- [ ] **Step 2: 注册迁移**

在 `api/src/db/ensureMeetingNotesSchema.ts` 的 `FILES` 数组末尾（`'033-merge-content-entities.sql'` 之后）追加：

```typescript
  '034-entity-merge-candidates.sql',
```

- [ ] **Step 3: 写失败测试** `api/tests/unit/meeting-notes/entity-merge-candidates-migration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

function sql(): string {
  const p = fileURLToPath(new URL(
    '../../../src/modules/meeting-notes/migrations/034-entity-merge-candidates.sql', import.meta.url));
  return readFileSync(p, 'utf8');
}

describe('034-entity-merge-candidates migration', () => {
  it('已登记进 FILES', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('034-entity-merge-candidates.sql');
  });
  it('建候选表且 (target, source) 唯一', () => {
    const s = sql();
    expect(s).toMatch(/CREATE TABLE IF NOT EXISTS content_entity_merge_candidates/);
    expect(s).toMatch(/UNIQUE \(target_entity_id, source_entity_id\)/);
    expect(s).toMatch(/similarity\s+DOUBLE PRECISION NOT NULL/);
    expect(s).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pending'/);
  });
});
```

- [ ] **Step 4: 运行确认失败 → 通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/entity-merge-candidates-migration.test.ts`
先失败（文件/登记缺），补齐后 Expected: PASS（2 tests）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/migrations/034-entity-merge-candidates.sql \
        api/src/db/ensureMeetingNotesSchema.ts \
        api/tests/unit/meeting-notes/entity-merge-candidates-migration.test.ts
git commit -m "feat(content-library): content_entity_merge_candidates 合并候选表 (P4a-1)"
```

---

## Task 2: findMergeCandidatePairs 相似对查询

**Files:**
- Create: `api/src/modules/content-library/consolidation/autoMergeEntities.ts`（本 task 只放 `findMergeCandidatePairs`）
- Test: `api/tests/unit/content-library/auto-merge-entities.test.ts`（本 task 只放 pair 查询测试）

**Interfaces:**
- Consumes: `DatabaseAdapter`（content-library `types.ts`）。
- Produces:
  - `export interface MergeCandidatePair { targetId: string; sourceId: string; entityType: string; similarity: number }`
  - `export async function findMergeCandidatePairs(deps: { db: DatabaseAdapter }, minSimilarity: number, limit?: number): Promise<MergeCandidatePair[]>`

- [ ] **Step 1: 写失败测试** `api/tests/unit/content-library/auto-merge-entities.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { findMergeCandidatePairs } from '../../../src/modules/content-library/consolidation/autoMergeEntities.js';

describe('findMergeCandidatePairs', () => {
  it('用余弦相似自连接查询并映射对（target=较早创建者）', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        return { rows: [
          { target_id: 't1', source_id: 's1', entity_type: 'organization', similarity: 0.98 },
        ] };
      }),
    };
    const pairs = await findMergeCandidatePairs({ db } as any, 0.9, 100);
    // 相似度阈值与 limit 作为参数
    expect(calls[0].params).toEqual([0.9, 100]);
    // 余弦相似写法 + 同类型 + 非空向量 + a.id<b.id
    expect(calls[0].sql).toMatch(/1 - \(a\.embedding <=> b\.embedding\)/);
    expect(calls[0].sql).toMatch(/a\.entity_type = b\.entity_type/);
    expect(calls[0].sql).toMatch(/a\.embedding IS NOT NULL AND b\.embedding IS NOT NULL/);
    expect(calls[0].sql).toMatch(/a\.id < b\.id/);
    expect(pairs).toEqual([
      { targetId: 't1', sourceId: 's1', entityType: 'organization', similarity: 0.98 },
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/content-library/auto-merge-entities.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `api/src/modules/content-library/consolidation/autoMergeEntities.ts`

```typescript
// P4a: content_entities embedding 自动合并——找相似对 + 双档路由。
import type { DatabaseAdapter } from '../types.js';

export interface MergeCandidatePair {
  targetId: string;
  sourceId: string;
  entityType: string;
  similarity: number;
}

/**
 * 找同 entity_type、双方均有向量、余弦相似 ≥ minSimilarity 的实体对。
 * target = created_at 较早者（tie-break 较小 id）；source = 另一个。a.id<b.id 去反向重复。
 */
export async function findMergeCandidatePairs(
  deps: { db: DatabaseAdapter },
  minSimilarity: number,
  limit = 500,
): Promise<MergeCandidatePair[]> {
  const res = await deps.db.query(
    `SELECT
       CASE WHEN a.created_at < b.created_at
              OR (a.created_at = b.created_at AND a.id < b.id)
            THEN a.id ELSE b.id END AS target_id,
       CASE WHEN a.created_at < b.created_at
              OR (a.created_at = b.created_at AND a.id < b.id)
            THEN b.id ELSE a.id END AS source_id,
       a.entity_type AS entity_type,
       1 - (a.embedding <=> b.embedding) AS similarity
     FROM content_entities a
     JOIN content_entities b
       ON a.entity_type = b.entity_type
      AND a.id < b.id
      AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
     WHERE 1 - (a.embedding <=> b.embedding) >= $1
     ORDER BY similarity DESC
     LIMIT $2`,
    [minSimilarity, limit],
  );
  return (res.rows ?? []).map((r: any) => ({
    targetId: String(r.target_id),
    sourceId: String(r.source_id),
    entityType: String(r.entity_type),
    similarity: Number(r.similarity),
  }));
}
```

> 实现者：确认 `content-library/types.ts` 导出 `DatabaseAdapter`（P3c 已用，`types.ts:9`）。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/content-library/auto-merge-entities.test.ts`
Expected: PASS（1 test）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/content-library/consolidation/autoMergeEntities.ts \
        api/tests/unit/content-library/auto-merge-entities.test.ts
git commit -m "feat(content-library): findMergeCandidatePairs 余弦相似对查询 (P4a-2)"
```

---

## Task 3: autoMergeContentEntities 双档编排

**Files:**
- Modify: `api/src/modules/content-library/consolidation/autoMergeEntities.ts`（加 `autoMergeContentEntities` + 内部 upsert）
- Test: 扩 `api/tests/unit/content-library/auto-merge-entities.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `findMergeCandidatePairs`、`MergeCandidatePair`；P3c 的 `mergeContentEntities`（`./mergeEntities.js`）。
- Produces:
  - `export interface AutoMergeSummary { scanned: number; autoMerged: number; proposed: number }`
  - `export async function autoMergeContentEntities(deps: { db: DatabaseAdapter }, opts?: { autoThreshold?: number; proposeThreshold?: number; limit?: number }): Promise<AutoMergeSummary>`

- [ ] **Step 1: 写失败测试**（追加）

```typescript
import { autoMergeContentEntities } from '../../../src/modules/content-library/consolidation/autoMergeEntities.js';

describe('autoMergeContentEntities 双档', () => {
  function makeDeps(pairsRows: any[]) {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        if (/FROM content_entities a\s+JOIN content_entities b/i.test(sql)) return { rows: pairsRows };
        if (/merge_content_entities/i.test(sql)) return { rows: [{ table_name: 'x', rows_reassigned: 0, rows_dropped: 1 }] };
        return { rows: [] };
      }),
    };
    return { deps: { db } as any, calls };
  }

  it('非 person 且 sim≥0.97 → 调 mergeContentEntities 合并', async () => {
    const { deps, calls } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'organization', similarity: 0.99 },
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(1);
    expect(r.proposed).toBe(0);
    expect(calls.some(c => /merge_content_entities/i.test(c.sql))).toBe(true);
    expect(calls.some(c => /INSERT INTO content_entity_merge_candidates/i.test(c.sql))).toBe(false);
  });

  it('person 对无论多相似 → 只进候选，不合并', async () => {
    const { deps, calls } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'person', similarity: 0.999 },
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(0);
    expect(r.proposed).toBe(1);
    expect(calls.some(c => /merge_content_entities/i.test(c.sql))).toBe(false);
    expect(calls.some(c => /INSERT INTO content_entity_merge_candidates/i.test(c.sql))).toBe(true);
  });

  it('中档相似(0.90-0.97) → 进候选', async () => {
    const { deps, calls } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'product', similarity: 0.93 },
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(0);
    expect(r.proposed).toBe(1);
    expect(calls.some(c => /INSERT INTO content_entity_merge_candidates/i.test(c.sql))).toBe(true);
  });

  it('同一 source 被上一对消费后，后续涉及它的对跳过', async () => {
    const { deps } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'organization', similarity: 0.99 },
      { target_id: 't2', source_id: 's1', entity_type: 'organization', similarity: 0.98 }, // s1 已消费
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(1); // 第二对跳过
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/content-library/auto-merge-entities.test.ts`
Expected: FAIL（`autoMergeContentEntities` 未导出）

- [ ] **Step 3: 实现**（追加到 `autoMergeEntities.ts`）

```typescript
import { mergeContentEntities } from './mergeEntities.js';

export interface AutoMergeSummary {
  scanned: number;
  autoMerged: number;
  proposed: number;
}

async function upsertCandidate(
  deps: { db: DatabaseAdapter },
  p: MergeCandidatePair,
): Promise<void> {
  await deps.db.query(
    `INSERT INTO content_entity_merge_candidates
       (target_entity_id, source_entity_id, entity_type, similarity)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (target_entity_id, source_entity_id)
     DO UPDATE SET similarity = EXCLUDED.similarity, status = 'pending'`,
    [p.targetId, p.sourceId, p.entityType, p.similarity],
  );
}

/**
 * 双档自动合并：
 *   非 person 且 sim ≥ autoThreshold → mergeContentEntities 立即合并；
 *   其余（中档相似 + 所有 person 对）→ upsert 候选表交人工。
 * person 对恒不自动合并（规避 I1 跨 workspace 同名塌缩）。
 */
export async function autoMergeContentEntities(
  deps: { db: DatabaseAdapter },
  opts?: { autoThreshold?: number; proposeThreshold?: number; limit?: number },
): Promise<AutoMergeSummary> {
  const auto = opts?.autoThreshold ?? 0.97;
  const propose = opts?.proposeThreshold ?? 0.90;
  const pairs = await findMergeCandidatePairs(deps, propose, opts?.limit ?? 500);

  const consumed = new Set<string>();
  let autoMerged = 0;
  let proposed = 0;

  for (const p of pairs) {
    if (consumed.has(p.targetId) || consumed.has(p.sourceId)) continue;

    const canAuto = p.entityType !== 'person' && p.similarity >= auto;
    if (canAuto) {
      try {
        await mergeContentEntities(deps, p.targetId, p.sourceId);
        consumed.add(p.sourceId); // source 已删除；target 存活
        autoMerged += 1;
        continue;
      } catch (err) {
        console.warn(`[autoMerge] 合并失败，降级为候选: ${p.targetId}<-${p.sourceId}`, err);
        // 落到候选
      }
    }
    try {
      await upsertCandidate(deps, p);
      proposed += 1;
    } catch (err) {
      console.warn(`[autoMerge] 写候选失败: ${p.targetId}<-${p.sourceId}`, err);
    }
  }

  return { scanned: pairs.length, autoMerged, proposed };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/content-library/auto-merge-entities.test.ts`
Expected: PASS（Task2 的 1 + 本 task 的 4）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/content-library/consolidation/autoMergeEntities.ts \
        api/tests/unit/content-library/auto-merge-entities.test.ts
git commit -m "feat(content-library): autoMergeContentEntities 双档自动合并/提候选 (P4a-3)"
```

---

## Task 4: CLI 入口

**Files:**
- Create: `api/src/scripts/auto-merge-entities.ts`

**Interfaces:**
- Consumes: Task 3 的 `autoMergeContentEntities`；`createPipelineDBAdapter`/`query`（镜像 `backfill-entity-embeddings.ts`）。

- [ ] **Step 1: 写 CLI** `api/src/scripts/auto-merge-entities.ts`

镜像 `api/src/scripts/backfill-entity-embeddings.ts` 的直接 deps 组装：

```typescript
// CLI：content_entities embedding 双档自动合并。用法：cd api && npx tsx src/scripts/auto-merge-entities.ts
// 阈值可选环境变量覆盖：ENTITY_AUTO_MERGE_THRESHOLD(默认0.97) / ENTITY_PROPOSE_THRESHOLD(默认0.90)
import 'dotenv/config';
import { query } from '../db/connection.js';
import { createPipelineDBAdapter } from '../modules/meeting-notes/adapters/pipeline.js';
import { autoMergeContentEntities } from '../modules/content-library/consolidation/autoMergeEntities.js';

function envNum(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

async function main() {
  const db = createPipelineDBAdapter(query);
  const r = await autoMergeContentEntities({ db }, {
    autoThreshold: envNum('ENTITY_AUTO_MERGE_THRESHOLD', 0.97),
    proposeThreshold: envNum('ENTITY_PROPOSE_THRESHOLD', 0.90),
  });
  console.log(`[auto-merge-entities] scanned=${r.scanned} autoMerged=${r.autoMerged} proposed=${r.proposed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> 实现者：Read `backfill-entity-embeddings.ts` 与 `adapters/pipeline.ts` 确认 `createPipelineDBAdapter(query)` 真实签名；对齐后定稿。此 CLI 无单测（运维脚本），但 `npx tsc --noEmit` 必须过。

- [ ] **Step 2: tsc 校验 + Commit**

Run: `cd api && npx tsc --noEmit`，Expected: exit 0。

```bash
git add api/src/scripts/auto-merge-entities.ts
git commit -m "feat(content-library): auto-merge-entities CLI 入口 (P4a-4)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** 对应总 spec §4.4(a)「embedding 自动合并任务」。**明确细化**：用户选「双档」；本计划把双档限定在**非 person 类型**，person 对恒进候选（规避 I1）。§4.4(b) 人工复核队列的**读取/审批 UI = P4b**（另出计划），本计划只产出候选表 + 自动合并后端 + CLI。person 候选的审批（走 `mn_merge_people`）也在 P4b/人工侧。

**类型一致：** `MergeCandidatePair{targetId,sourceId,entityType,similarity}` Task2 定义、Task3 用；`AutoMergeSummary{scanned,autoMerged,proposed}` Task3 内自洽；`mergeContentEntities(deps,target,source)` 复用 P3c 签名；候选表列名与 `upsertCandidate` 的 INSERT 对齐。

**Placeholder 扫描：** 无 TBD；SQL/TS 全量给出。两处「实现者：确认 DatabaseAdapter / createPipelineDBAdapter 签名」是校验指令。

**已知边界（明确记录）：**
1. **依赖真 embedding（P3a 运维开关）**：未配真 provider → embedding 多为 null → 扫不出对（安全空转）。自动合并的实际价值随 `SILICONFLOW_API_KEY` 就绪而兑现。
2. **O(N²) 自连接 + LIMIT**：首版有界（默认 500）；content_entities 规模大时需改 per-entity KNN（pgvector KNN 索引），文档记明。
3. **person 恒不自动合并**：刻意安全边界；person 去重仍靠人工 `mn_merge_people`。
4. **候选表 status 流转（approved/rejected）与审批执行 = P4b**：本计划只写 `pending`；不含读取/审批路由与 UI。
5. **SQL 相似查询无法离线单测**：pair 查询测试断言 SQL 形状（同 031/032/033 先例）；编排逻辑用 mock pairs 完整覆盖路由分档。
