# P3c 会议实体统一 · content_entities 通用合并函数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供一个 `merge_content_entities(target_id, source_id)` SQL 函数（镜像 `mn_merge_people`），把 source 实体的引用（`content_entity_relations` 两侧 + `mn_people.content_entity_id`）重指向 target、合并 aliases、删除 source，并配一个薄 TS 包装 `mergeContentEntities` 供 P4 自动/人工合并调用。

**Architecture:** 纯 SQL plpgsql 函数完成事务内的引用重指向 + UNIQUE 冲突去重 + 别名归并 + 删源，返回 `TABLE(table_name, rows_reassigned, rows_dropped)` 审计行（与 `mn_merge_people` 同形）。函数作为 meeting-notes 迁移 `033`（沿用 FILES registry，与同样跨引用 content_entities/mn_people 的 `031` 一致）。TS 层只做一次 `SELECT * FROM merge_content_entities($1,$2)` 调用与结果映射。

**Tech Stack:** PostgreSQL plpgsql · TypeScript (ESM, `.js` 后缀) · vitest（迁移测试读 SQL 文件断言内容、包装测试 mock `db.query`，均不连真库）。

## Global Constraints

- **只重指向 FK 引用**：`content_entities(id)` 的外键引用仅三处——`content_entity_relations.entity_a_id`、`content_entity_relations.entity_b_id`（均 `ON DELETE CASCADE` + `UNIQUE(entity_a_id, entity_b_id)`）、`mn_people.content_entity_id`（无 CASCADE，必须先重指向再删 source 否则 FK 阻止删除）。合并函数只处理这三处。
- **content_facts 不改写（明确非目标）**：`content_facts.subject/predicate/object` 是 TEXT 实体名、无 FK；沿用 `mn_merge_people` 先例不做文本改写——source 的 canonical 已并入 target 的 aliases，按名查询可经别名解析到 target。
- **UNIQUE 冲突与自环处理**：重指向 `content_entity_relations` 前必须先删除会造成 (a) source-target 直接配对（重指向后成 target-target 自环）、(b) 与现有 `(target, X)`/`(X, target)` 撞 `UNIQUE(entity_a_id, entity_b_id)` 的 source 边。
- **返回审计行**：`RETURNS TABLE (table_name VARCHAR, rows_reassigned INT, rows_dropped INT)`，每处理一类表 `RETURN NEXT` 一行（与 `mn_merge_people` 逐行同形）。
- **校验**：`target_id = source_id` → `RAISE EXCEPTION ... ERRCODE='22023'`；target/source 任一不存在 → `RAISE EXCEPTION ... ERRCODE='02000'`；两行取 `FOR UPDATE`。
- **迁移机制**：函数放 meeting-notes 迁移 `033-merge-content-entities.sql`，登记进 `api/src/db/ensureMeetingNotesSchema.ts` 的 `FILES`（当前末位 `032-unresolved-mentions.sql`）。函数引用 `content_entity_relations`（content-library 表，由 `setupContentLibrarySchema` 先建）与 `mn_people`——ordering 与 `031` 同（`031` 已成功引用 content_entities）。
- **幂等**：`CREATE OR REPLACE FUNCTION`；迁移可重复应用。
- ESM `.js` 后缀。一 task 一 commit，message 结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Create** `api/src/modules/meeting-notes/migrations/033-merge-content-entities.sql` — `merge_content_entities` plpgsql 函数。
- **Modify** `api/src/db/ensureMeetingNotesSchema.ts` — `FILES` 追加 `'033-merge-content-entities.sql'`。
- **Create** `api/src/modules/content-library/consolidation/mergeEntities.ts` — `mergeContentEntities(deps, targetId, sourceId)` 薄包装。
- **Create tests** — `merge-content-entities-migration.test.ts`（读 SQL 文件断言）、`merge-content-entities.test.ts`（包装 mock）。

---

## Task 1: merge_content_entities 迁移函数

**Files:**
- Create: `api/src/modules/meeting-notes/migrations/033-merge-content-entities.sql`
- Modify: `api/src/db/ensureMeetingNotesSchema.ts`
- Test: `api/tests/unit/meeting-notes/merge-content-entities-migration.test.ts`

**Interfaces:**
- Consumes: 现有表 `content_entities`、`content_entity_relations`、`mn_people`。
- Produces: SQL 函数 `merge_content_entities(target_id UUID, source_id UUID) RETURNS TABLE(table_name VARCHAR, rows_reassigned INT, rows_dropped INT)`。

- [ ] **Step 1: 写迁移** `api/src/modules/meeting-notes/migrations/033-merge-content-entities.sql`

```sql
-- Meeting Notes Module · 033 — merge_content_entities 通用实体合并
-- 把 source 实体引用重指向 target、合并 aliases、删除 source。
-- 镜像 mn_merge_people(031) 的结构；处理 content_entity_relations 的 UNIQUE(a,b) 冲突与自环。
-- content_facts 为 TEXT 键、无 FK，不在此改写（经 alias 解析到 target）。

CREATE OR REPLACE FUNCTION merge_content_entities(target_id UUID, source_id UUID)
RETURNS TABLE (
  table_name VARCHAR,
  rows_reassigned INT,
  rows_dropped INT
) AS $$
DECLARE
  target_canonical TEXT;
  target_aliases   TEXT[];
  source_canonical TEXT;
  source_aliases   TEXT[];
  merged_aliases   TEXT[];
  affected  INT;
  affected2 INT;
  dropped   INT;
  dropped_total INT;
BEGIN
  IF target_id = source_id THEN
    RAISE EXCEPTION 'target_id 和 source_id 不能相同'
      USING ERRCODE = '22023', HINT = 'merge needs two different entity ids';
  END IF;

  SELECT canonical_name, aliases INTO target_canonical, target_aliases
    FROM content_entities WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target entity % not found', target_id USING ERRCODE = '02000';
  END IF;

  SELECT canonical_name, aliases INTO source_canonical, source_aliases
    FROM content_entities WHERE id = source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source entity % not found', source_id USING ERRCODE = '02000';
  END IF;

  -- ===== content_entity_relations: UNIQUE(entity_a_id, entity_b_id), CASCADE =====
  dropped_total := 0;

  -- (i) 删 source↔target 直接配对（重指向后会成 target-target 自环）+ source 自环
  DELETE FROM content_entity_relations
   WHERE (entity_a_id = source_id AND entity_b_id = target_id)
      OR (entity_a_id = target_id AND entity_b_id = source_id)
      OR (entity_a_id = source_id AND entity_b_id = source_id);
  GET DIAGNOSTICS dropped = ROW_COUNT;
  dropped_total := dropped_total + dropped;

  -- (ii) entity_a_id 侧：删 reassign 后会与现有 (target, X) 撞 UNIQUE 的 source 行，再重指向
  DELETE FROM content_entity_relations r
   WHERE r.entity_a_id = source_id
     AND EXISTS (
       SELECT 1 FROM content_entity_relations t
        WHERE t.entity_a_id = target_id AND t.entity_b_id = r.entity_b_id
     );
  GET DIAGNOSTICS dropped = ROW_COUNT;
  dropped_total := dropped_total + dropped;
  UPDATE content_entity_relations SET entity_a_id = target_id WHERE entity_a_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- (iii) entity_b_id 侧
  DELETE FROM content_entity_relations r
   WHERE r.entity_b_id = source_id
     AND EXISTS (
       SELECT 1 FROM content_entity_relations t
        WHERE t.entity_b_id = target_id AND t.entity_a_id = r.entity_a_id
     );
  GET DIAGNOSTICS dropped = ROW_COUNT;
  dropped_total := dropped_total + dropped;
  UPDATE content_entity_relations SET entity_b_id = target_id WHERE entity_b_id = source_id;
  GET DIAGNOSTICS affected2 = ROW_COUNT;
  affected := affected + affected2;

  table_name := 'content_entity_relations'; rows_reassigned := affected; rows_dropped := dropped_total;
  RETURN NEXT;

  -- ===== mn_people.content_entity_id 重指向（无 CASCADE，必须删 source 前做）=====
  UPDATE mn_people SET content_entity_id = target_id WHERE content_entity_id = source_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  table_name := 'mn_people'; rows_reassigned := affected; rows_dropped := 0;
  RETURN NEXT;

  -- ===== 合并 aliases：target.aliases ∪ {source.canonical} ∪ source.aliases，去重、排除 target.canonical =====
  merged_aliases := ARRAY(
    SELECT DISTINCT a FROM unnest(
      COALESCE(target_aliases, '{}') || ARRAY[source_canonical]::text[] || COALESCE(source_aliases, '{}')
    ) AS a
    WHERE a IS NOT NULL AND a <> '' AND a <> target_canonical
  );
  UPDATE content_entities SET aliases = merged_aliases, updated_at = NOW() WHERE id = target_id;

  -- ===== 删 source（此时 content_entity_relations 与 mn_people 已无 source 引用）=====
  DELETE FROM content_entities WHERE id = source_id;
  table_name := 'content_entities (source deleted)'; rows_reassigned := 0; rows_dropped := 1;
  RETURN NEXT;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS merge_content_entities(uuid, uuid);
-- ============================================================
```

- [ ] **Step 2: 注册迁移**

在 `api/src/db/ensureMeetingNotesSchema.ts` 的 `FILES` 数组末尾（`'032-unresolved-mentions.sql'` 之后）追加：

```typescript
  '033-merge-content-entities.sql',
```

- [ ] **Step 3: 写失败测试** `api/tests/unit/meeting-notes/merge-content-entities-migration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

function sql(): string {
  const p = fileURLToPath(new URL(
    '../../../src/modules/meeting-notes/migrations/033-merge-content-entities.sql', import.meta.url));
  return readFileSync(p, 'utf8');
}

describe('033-merge-content-entities migration', () => {
  it('已登记进 FILES 列表', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('033-merge-content-entities.sql');
  });
  it('定义 merge_content_entities 函数并返回审计 TABLE', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION merge_content_entities\(target_id UUID, source_id UUID\)/);
    expect(s).toMatch(/RETURNS TABLE\s*\(\s*table_name VARCHAR/);
  });
  it('校验 target≠source 且两者存在', () => {
    const s = sql();
    expect(s).toMatch(/IF target_id = source_id THEN/);
    expect(s).toMatch(/22023/);
    expect(s).toMatch(/02000/);
    expect(s).toMatch(/FOR UPDATE/);
  });
  it('重指向 content_entity_relations 两侧且处理 UNIQUE 冲突/自环', () => {
    const s = sql();
    expect(s).toMatch(/UPDATE content_entity_relations SET entity_a_id = target_id WHERE entity_a_id = source_id/);
    expect(s).toMatch(/UPDATE content_entity_relations SET entity_b_id = target_id WHERE entity_b_id = source_id/);
    // 自环删除：source↔target 直接配对
    expect(s).toMatch(/entity_a_id = source_id AND entity_b_id = target_id/);
  });
  it('重指向 mn_people.content_entity_id 且删除 source 实体', () => {
    const s = sql();
    expect(s).toMatch(/UPDATE mn_people SET content_entity_id = target_id WHERE content_entity_id = source_id/);
    expect(s).toMatch(/DELETE FROM content_entities WHERE id = source_id/);
  });
  it('合并 aliases（含 source canonical，去重排除 target canonical）', () => {
    const s = sql();
    expect(s).toMatch(/ARRAY\[source_canonical\]/);
    expect(s).toMatch(/a <> target_canonical/);
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/merge-content-entities-migration.test.ts`
Expected: FAIL（迁移文件 / FILES 登记不存在）

- [ ] **Step 5: 运行确认通过**

（Step 1/2 已写好文件与登记）Run: `cd api && npx vitest run tests/unit/meeting-notes/merge-content-entities-migration.test.ts`
Expected: PASS（6 tests）。`npx tsc --noEmit` exit 0（迁移是 .sql，tsc 只校验 ensureMeetingNotesSchema.ts 改动）。

- [ ] **Step 6: Commit**

```bash
git add api/src/modules/meeting-notes/migrations/033-merge-content-entities.sql \
        api/src/db/ensureMeetingNotesSchema.ts \
        api/tests/unit/meeting-notes/merge-content-entities-migration.test.ts
git commit -m "feat(content-library): merge_content_entities 通用实体合并函数 (P3c-1)"
```

---

## Task 2: mergeContentEntities TS 包装

**Files:**
- Create: `api/src/modules/content-library/consolidation/mergeEntities.ts`
- Test: `api/tests/unit/content-library/merge-content-entities.test.ts`

**Interfaces:**
- Consumes: Task 1 的 SQL 函数 `merge_content_entities`；`DatabaseAdapter`（content-library `types.ts`）。
- Produces: `export interface EntityMergeRow { table: string; reassigned: number; dropped: number }`；`export async function mergeContentEntities(deps: { db: DatabaseAdapter }, targetId: string, sourceId: string): Promise<EntityMergeRow[]>`。

- [ ] **Step 1: 写失败测试** `api/tests/unit/content-library/merge-content-entities.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mergeContentEntities } from '../../../src/modules/content-library/consolidation/mergeEntities.js';

describe('mergeContentEntities', () => {
  it('调用 SQL 函数并映射审计行', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        return { rows: [
          { table_name: 'content_entity_relations', rows_reassigned: 3, rows_dropped: 1 },
          { table_name: 'mn_people', rows_reassigned: 2, rows_dropped: 0 },
          { table_name: 'content_entities (source deleted)', rows_reassigned: 0, rows_dropped: 1 },
        ] };
      }),
    };
    const rows = await mergeContentEntities({ db } as any, 'tgt-1', 'src-1');
    // 调了合并函数，带 target/source 参数
    expect(calls[0].sql).toMatch(/merge_content_entities\(\$1::uuid, \$2::uuid\)/);
    expect(calls[0].params).toEqual(['tgt-1', 'src-1']);
    // 映射成 {table, reassigned, dropped}
    expect(rows).toEqual([
      { table: 'content_entity_relations', reassigned: 3, dropped: 1 },
      { table: 'mn_people', reassigned: 2, dropped: 0 },
      { table: 'content_entities (source deleted)', reassigned: 0, dropped: 1 },
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/content-library/merge-content-entities.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `api/src/modules/content-library/consolidation/mergeEntities.ts`

```typescript
// content_entities 通用合并的薄包装：调用 SQL 函数 merge_content_entities，返回审计行。
// 供 P4 自动/人工合并调用；SQL 函数保证事务内重指向引用 + 去重 + 删源。
import type { DatabaseAdapter } from '../types.js';

export interface EntityMergeRow {
  table: string;
  reassigned: number;
  dropped: number;
}

export async function mergeContentEntities(
  deps: { db: DatabaseAdapter },
  targetId: string,
  sourceId: string,
): Promise<EntityMergeRow[]> {
  const res = await deps.db.query(
    `SELECT table_name, rows_reassigned, rows_dropped FROM merge_content_entities($1::uuid, $2::uuid)`,
    [targetId, sourceId],
  );
  return (res.rows ?? []).map((r: any) => ({
    table: String(r.table_name),
    reassigned: Number(r.rows_reassigned),
    dropped: Number(r.rows_dropped),
  }));
}
```

> 实现者：确认 `content-library/types.ts` 导出 `DatabaseAdapter`（Explore 已证 `EmbeddingAdapter` 在 `types.ts:31`，`DatabaseAdapter` 同文件）；若名称/路径不同，Read `types.ts` 用真实名。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/content-library/merge-content-entities.test.ts`
Expected: PASS（1 test）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/content-library/consolidation/mergeEntities.ts \
        api/tests/unit/content-library/merge-content-entities.test.ts
git commit -m "feat(content-library): mergeContentEntities TS 包装调用合并函数 (P3c-2)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** 对应总 spec §4.6 / §5 P3 的「content_entities 版通用合并函数（reassign content_facts / entity_relations 等）」。**明确收敛**：`content_facts` 是 TEXT 键无 FK，按 `mn_merge_people` 先例不做文本改写（alias 解析覆盖按名查询）；实际重指向的 FK 只有 `content_entity_relations` 两侧 + `mn_people.content_entity_id`。P4 = 自动合并任务（cosine 配对后调 `mergeContentEntities`）+ unresolved 复核 UI，另出计划。

**类型一致：** SQL 函数名 `merge_content_entities` 在迁移、迁移测试、TS 包装 SQL 串三处一致；`RETURN TABLE(table_name, rows_reassigned, rows_dropped)` 与包装的 `SELECT table_name, rows_reassigned, rows_dropped` 及映射 `{table, reassigned, dropped}` 对齐；`mergeContentEntities(deps,{db}, targetId, sourceId): Promise<EntityMergeRow[]>` 自洽。

**Placeholder 扫描：** 无 TBD；SQL 与 TS 均给全量代码。一处「实现者：确认 DatabaseAdapter 导出名」是校验指令。

**已知边界（明确记录）：**
1. **SQL 正确性靠迁移文件断言 + 逻辑评审**：单测不连真库（沿用 031/032 先例），`content_entity_relations` 的 UNIQUE 冲突/自环 SQL 需评审重点看 (i)(ii)(iii) 三段的删-再-重指向顺序。
2. **content_facts 文本不改写**：刻意 YAGNI 边界，见 Global Constraints。
3. **迁移 ordering**：`033` 引用 `content_entity_relations`（content-library 表）；依赖 `setupContentLibrarySchema` 先于 meeting-notes 迁移运行（与 `031` 引用 content_entities 同前提，已在生产成立）。实现者若疑虑可在 runEngine/connection 初始化处确认调用顺序。
4. **无自动配对**：本计划只给「怎么合并」，不含「合并谁」（后者 = P4 的 cosine 自动配对 / 人工点选）。
