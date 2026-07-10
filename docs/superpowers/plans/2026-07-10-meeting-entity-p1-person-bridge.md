# P1：mn_people ↔ content_entities 桥接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每条 `mn_people` 通过 content-library 的 `EntityResolver` 关联到全局 `content_entities`，使 person 从"两套规范源各存一份"变为"互链"，为后续源头治理（P2）铺路。

**Architecture:** 不折表迁移。`mn_people` 新增 `content_entity_id` 外键；`ensurePersonByName` 内部先过 `EntityResolver.resolveAndRegister({entity_type:'person'})` 拿全局 id 再写 mn_people；`mn_merge_people` 扩展为合并时归一 `content_entity_id`；一次性脚本回填历史行。全程非破坏性、可回滚。

**Tech Stack:** TypeScript + Node.js (ESM, `.js` import 后缀) + PostgreSQL (pgvector) + vitest。迁移经 `api/src/db/ensureMeetingNotesSchema.ts` 的 `FILES` 数组注册后按序 apply。

## Global Constraints

- 语言/模块：ESM，import 一律带 `.js` 后缀（如 `'../parse/participantExtractor.js'`）。
- 迁移 SQL 幂等：一律 `IF NOT EXISTS` / `CREATE OR REPLACE`；新增列可空，不设 NOT NULL。
- 新迁移必须追加进 `api/src/db/ensureMeetingNotesSchema.ts` 的 `FILES` 数组末尾，否则不会被 apply。
- 单测用 vitest + `vi.fn()` mock `deps.db.query` 与 `deps.embedding.embed`，**不连真库**。
- 实体入口唯一：person 的注册只能经 `EntityResolver.resolveAndRegister`，不得在 participantExtractor 里另写 `INSERT INTO content_entities`。
- `entity_type` 取值用 `'person'`。
- 提交信息格式：`<type>(meeting-notes): <subject>`，结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

### Task 1: 迁移 030 — mn_people 加 content_entity_id 列

**Files:**
- Create: `api/src/modules/meeting-notes/migrations/030-people-content-entity-link.sql`
- Modify: `api/src/db/ensureMeetingNotesSchema.ts`（`FILES` 数组末尾追加）
- Test: `api/tests/unit/meeting-notes/people-content-entity-migration.test.ts`

**Interfaces:**
- Consumes: 无（依赖 content-library 的 `content_entities` 表已由 content-library schema 建好）。
- Produces: `mn_people.content_entity_id UUID NULL REFERENCES content_entities(id)`；`FILES` 含 `'030-people-content-entity-link.sql'`。

- [ ] **Step 1: 写失败测试** — 断言迁移已注册且 SQL 含目标列

Create `api/tests/unit/meeting-notes/people-content-entity-migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

const MIG_DIR = join(process.cwd(), 'src/modules/meeting-notes/migrations');

describe('migration 030 · mn_people.content_entity_id', () => {
  it('is registered in FILES array', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('030-people-content-entity-link.sql');
  });

  it('sql adds nullable content_entity_id FK to content_entities', () => {
    const sql = readFileSync(join(MIG_DIR, '030-people-content-entity-link.sql'), 'utf8');
    expect(sql).toMatch(/ALTER TABLE mn_people/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS content_entity_id UUID/i);
    expect(sql).toMatch(/REFERENCES content_entities\s*\(\s*id\s*\)/i);
    expect(existsSync(join(MIG_DIR, '030-people-content-entity-link.sql'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/people-content-entity-migration.test.ts`
Expected: FAIL — `MEETING_NOTES_MIGRATION_FILES` 未导出 / 文件不存在。

- [ ] **Step 3: 导出 FILES 数组**（若尚未导出）

Modify `api/src/db/ensureMeetingNotesSchema.ts`：把 `const FILES = [` 改为具名导出别名，在文件末尾附加：

```ts
// 供测试与外部工具读取迁移清单（值等同内部 FILES）
export const MEETING_NOTES_MIGRATION_FILES = FILES;
```

并在 `FILES` 数组的 `'029-runs-axis-widen.sql',` 之后追加一行：

```ts
  '030-people-content-entity-link.sql',
```

- [ ] **Step 4: 写迁移 SQL**

Create `api/src/modules/meeting-notes/migrations/030-people-content-entity-link.sql`:

```sql
-- Meeting Notes Module · 030 — mn_people ↔ content_entities 桥接
-- 为每条 mn_people 关联全局规范实体（content-library 的 content_entities）。
-- 可空、可回滚；不改动既有 11 张 person 外键表。
ALTER TABLE mn_people
  ADD COLUMN IF NOT EXISTS content_entity_id UUID REFERENCES content_entities(id);

CREATE INDEX IF NOT EXISTS idx_mn_people_content_entity
  ON mn_people(content_entity_id);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/people-content-entity-migration.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 6: 提交**

```bash
git add api/src/modules/meeting-notes/migrations/030-people-content-entity-link.sql \
        api/src/db/ensureMeetingNotesSchema.ts \
        api/tests/unit/meeting-notes/people-content-entity-migration.test.ts
git commit -m "feat(meeting-notes): mn_people 加 content_entity_id 桥接列 (P1-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ensurePersonByName 经 EntityResolver 注册并回填 content_entity_id

**Files:**
- Modify: `api/src/modules/meeting-notes/parse/participantExtractor.ts`
- Test: `api/tests/unit/meeting-notes/ensure-person-content-entity.test.ts`

**Interfaces:**
- Consumes: `EntityResolver` from `../../content-library/consolidation/entityResolver.js`，构造 `new EntityResolver(deps.db, deps.embedding)`；方法 `resolveAndRegister({ canonicalName: string, aliases: string[], entityType: 'person', taxonomyDomainId?: string, metadata?: object }) => Promise<{ id: string }>`。
- Produces: `ensurePersonByName` 返回值签名不变（`Promise<string | null>`，仍是 mn_people.id）；副作用新增：mn_people 行的 `content_entity_id` 被填充。

- [ ] **Step 1: 写失败测试**

Create `api/tests/unit/meeting-notes/ensure-person-content-entity.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ensurePersonByName } from '../../../src/modules/meeting-notes/parse/participantExtractor.js';

function makeDeps() {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // content_entities 解析：先查不到，再 INSERT 返回 id
      if (/FROM content_entities/i.test(sql)) return { rows: [] };
      if (/INSERT INTO content_entities/i.test(sql)) return { rows: [{ id: 'ce-1', canonical_name: '张伟', aliases: [], entity_type: 'person' }] };
      // mn_people 查重：不存在
      if (/SELECT id FROM mn_people/i.test(sql)) return { rows: [] };
      // mn_people 插入：返回 id
      if (/INSERT INTO mn_people/i.test(sql)) return { rows: [{ id: 'mp-1' }] };
      return { rows: [] };
    }),
  };
  const embedding = { embed: vi.fn(async () => new Array(768).fill(0)) };
  return { deps: { db, embedding } as any, calls };
}

describe('ensurePersonByName · content_entity 桥接', () => {
  it('注册 content_entities 并把 content_entity_id 写进 mn_people INSERT', async () => {
    const { deps, calls } = makeDeps();
    const id = await ensurePersonByName(deps, '张伟', undefined, undefined, 'meeting-1');
    expect(id).toBe('mp-1');

    const insertPerson = calls.find(c => /INSERT INTO mn_people/i.test(c.sql));
    expect(insertPerson).toBeTruthy();
    expect(insertPerson!.sql).toMatch(/content_entity_id/);
    expect(insertPerson!.params).toContain('ce-1');
  });

  it('已存在 mn_people 时也回填 content_entity_id', async () => {
    const { deps, calls } = makeDeps();
    (deps.db.query as any).mockImplementation(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/FROM content_entities/i.test(sql)) return { rows: [{ id: 'ce-9', canonical_name: '张伟', aliases: [], entity_type: 'person' }] };
      if (/SELECT id FROM mn_people/i.test(sql)) return { rows: [{ id: 'mp-9' }] };
      return { rows: [] };
    });
    const id = await ensurePersonByName(deps, '张伟', undefined, undefined, 'meeting-1');
    expect(id).toBe('mp-9');
    const backfill = calls.find(c => /UPDATE mn_people SET content_entity_id/i.test(c.sql));
    expect(backfill).toBeTruthy();
    expect(backfill!.params).toContain('ce-9');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/ensure-person-content-entity.test.ts`
Expected: FAIL — INSERT 不含 `content_entity_id`；无回填 UPDATE。

- [ ] **Step 3: 实现桥接**

Modify `api/src/modules/meeting-notes/parse/participantExtractor.ts`：

顶部 import 追加：

```ts
import { EntityResolver } from '../../content-library/consolidation/entityResolver.js';
```

在 `ensurePersonByName` 内，`const canonical = normalizeName(rawName); if (!canonical) return null;` 之后插入：

```ts
  // 唯一实体 seam：先注册/解析到全局 content_entities，拿 canonical id
  const resolver = new EntityResolver(deps.db, deps.embedding);
  const entity = await resolver.resolveAndRegister({
    canonicalName: canonical,
    aliases: [],
    entityType: 'person',
  });
  const contentEntityId = entity.id;
```

把"已存在分支"改为回填：将

```ts
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id as string;
    if (role) {
      await deps.db.query(
        `UPDATE mn_people SET role = COALESCE(role, $2) WHERE id = $1`,
        [id, role],
      );
    }
    return id;
  }
```

改为：

```ts
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id as string;
    await deps.db.query(
      `UPDATE mn_people SET content_entity_id = $2 WHERE id = $1 AND content_entity_id IS DISTINCT FROM $2`,
      [id, contentEntityId],
    );
    if (role) {
      await deps.db.query(
        `UPDATE mn_people SET role = COALESCE(role, $2) WHERE id = $1`,
        [id, role],
      );
    }
    return id;
  }
```

把两处 `INSERT INTO mn_people` 都加上 `content_entity_id`。带 meetingId 分支：

```ts
        `INSERT INTO mn_people (canonical_name, role, org, first_seen_meeting_id, content_entity_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [canonical, role ?? null, org ?? null, meetingId, contentEntityId],
```

不带 meetingId 分支：

```ts
        `INSERT INTO mn_people (canonical_name, role, org, content_entity_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [canonical, role ?? null, org ?? null, contentEntityId],
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/ensure-person-content-entity.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 回归 — participantExtractor 既有测试不破**

Run: `cd api && npx vitest run tests/unit/meeting-notes`
Expected: 全绿（若既有测试 mock 未覆盖 content_entities/embedding，按本 Task 的 mock 模式补齐这些既有用例的 deps，再跑一次至绿）。

- [ ] **Step 6: 提交**

```bash
git add api/src/modules/meeting-notes/parse/participantExtractor.ts \
        api/tests/unit/meeting-notes/ensure-person-content-entity.test.ts
git commit -m "feat(meeting-notes): ensurePersonByName 经 EntityResolver 桥接 content_entity_id (P1-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 迁移 031 — mn_merge_people 合并时归一 content_entity_id

**Files:**
- Create: `api/src/modules/meeting-notes/migrations/031-merge-content-entity-link.sql`
- Modify: `api/src/db/ensureMeetingNotesSchema.ts`（`FILES` 末尾追加）
- Test: `api/tests/unit/meeting-notes/merge-content-entity-migration.test.ts`

**Interfaces:**
- Consumes: 现有 `mn_merge_people(target_id UUID, source_id UUID)`（migration 016）与 Task 1 的 `mn_people.content_entity_id`。
- Produces: `CREATE OR REPLACE FUNCTION mn_merge_people` 内在删除 source 前，若 target.content_entity_id 为空而 source 非空，则把 source 的值补给 target。`FILES` 含 `'031-merge-content-entity-link.sql'`。

- [ ] **Step 1: 写失败测试**

Create `api/tests/unit/meeting-notes/merge-content-entity-migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

const MIG_DIR = join(process.cwd(), 'src/modules/meeting-notes/migrations');

describe('migration 031 · merge 归一 content_entity_id', () => {
  it('registered', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('031-merge-content-entity-link.sql');
  });
  it('CREATE OR REPLACE mn_merge_people 且触及 content_entity_id', () => {
    const sql = readFileSync(join(MIG_DIR, '031-merge-content-entity-link.sql'), 'utf8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION mn_merge_people/i);
    expect(sql).toMatch(/content_entity_id/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/merge-content-entity-migration.test.ts`
Expected: FAIL — 未注册 / 文件不存在。

- [ ] **Step 3: 注册迁移**

Modify `api/src/db/ensureMeetingNotesSchema.ts`：在 `'030-people-content-entity-link.sql',` 之后追加：

```ts
  '031-merge-content-entity-link.sql',
```

- [ ] **Step 4: 写迁移 SQL**（基于 016 复制函数体，仅在 source DELETE 前插入归一逻辑）

Create `api/src/modules/meeting-notes/migrations/031-merge-content-entity-link.sql`。以 migration 016 的 `mn_merge_people` 全文为基底（`CREATE OR REPLACE FUNCTION mn_merge_people(target_id UUID, source_id UUID) RETURNS TABLE(...) AS $$ ... $$`），在函数体"合并 aliases、DELETE source 行"**之前**插入以下语句块，其余保持与 016 完全一致：

```sql
  -- 031: 归一 content_entity_id —— target 缺失则继承 source 的
  UPDATE mn_people
     SET content_entity_id = COALESCE(
           (SELECT content_entity_id FROM mn_people WHERE id = target_id),
           (SELECT content_entity_id FROM mn_people WHERE id = source_id))
   WHERE id = target_id;
```

（注：016 函数体隐式事务，任一步失败整体回滚；此块沿用同一事务，无需额外处理。函数完整内容以 016 为准逐行照抄，只多这一块。）

- [ ] **Step 5: 跑测试确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/merge-content-entity-migration.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 6: 提交**

```bash
git add api/src/modules/meeting-notes/migrations/031-merge-content-entity-link.sql \
        api/src/db/ensureMeetingNotesSchema.ts \
        api/tests/unit/meeting-notes/merge-content-entity-migration.test.ts
git commit -m "feat(meeting-notes): mn_merge_people 合并时归一 content_entity_id (P1-3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 历史回填脚本

**Files:**
- Create: `api/src/modules/meeting-notes/scripts/backfillPeopleContentEntity.ts`（核心函数，可单测）
- Create: `api/src/scripts/backfill-people-content-entity.ts`（CLI 入口，装配 deps 后调核心函数）
- Test: `api/tests/unit/meeting-notes/backfill-people-content-entity.test.ts`

**Interfaces:**
- Consumes: `EntityResolver`（同 Task 2）、`MeetingNotesDeps`。
- Produces: `export async function backfillPeopleContentEntity(deps: MeetingNotesDeps): Promise<{ scanned: number; linked: number }>` —— 遍历 `content_entity_id IS NULL` 的 mn_people，逐条 `resolveAndRegister({entityType:'person'})` 并 `UPDATE ... SET content_entity_id`。

- [ ] **Step 1: 写失败测试**

Create `api/tests/unit/meeting-notes/backfill-people-content-entity.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { backfillPeopleContentEntity } from '../../../src/modules/meeting-notes/scripts/backfillPeopleContentEntity.js';

describe('backfillPeopleContentEntity', () => {
  it('为每条缺失 content_entity_id 的 person 解析并回填', async () => {
    const updates: any[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        if (/SELECT id, canonical_name, aliases FROM mn_people/i.test(sql))
          return { rows: [
            { id: 'mp-1', canonical_name: '张伟', aliases: [] },
            { id: 'mp-2', canonical_name: '李娜', aliases: ['小李'] },
          ] };
        if (/FROM content_entities/i.test(sql)) return { rows: [] };
        if (/INSERT INTO content_entities/i.test(sql))
          return { rows: [{ id: `ce-${params[0]}`, canonical_name: params[0], aliases: [], entity_type: 'person' }] };
        if (/UPDATE mn_people SET content_entity_id/i.test(sql)) { updates.push(params); return { rows: [] }; }
        return { rows: [] };
      }),
    };
    const embedding = { embed: vi.fn(async () => new Array(768).fill(0)) };
    const deps: any = { db, embedding };

    const res = await backfillPeopleContentEntity(deps);
    expect(res).toEqual({ scanned: 2, linked: 2 });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual(['mp-1', 'ce-张伟']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/backfill-people-content-entity.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现核心函数**

Create `api/src/modules/meeting-notes/scripts/backfillPeopleContentEntity.ts`:

```ts
import type { MeetingNotesDeps } from '../types.js';
import { EntityResolver } from '../../content-library/consolidation/entityResolver.js';

/** 回填历史 mn_people 的 content_entity_id。幂等：只处理 IS NULL 的行。 */
export async function backfillPeopleContentEntity(
  deps: MeetingNotesDeps,
): Promise<{ scanned: number; linked: number }> {
  const resolver = new EntityResolver(deps.db, deps.embedding);
  const { rows } = await deps.db.query(
    `SELECT id, canonical_name, aliases FROM mn_people WHERE content_entity_id IS NULL`,
  );
  let linked = 0;
  for (const r of rows as Array<{ id: string; canonical_name: string; aliases: string[] }>) {
    const entity = await resolver.resolveAndRegister({
      canonicalName: r.canonical_name,
      aliases: r.aliases ?? [],
      entityType: 'person',
    });
    await deps.db.query(
      `UPDATE mn_people SET content_entity_id = $2 WHERE id = $1`,
      [r.id, entity.id],
    );
    linked += 1;
  }
  return { scanned: rows.length, linked };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/backfill-people-content-entity.test.ts`
Expected: PASS（1 passed）。

- [ ] **Step 5: 写 CLI 入口**（装配现有 deps，参照 `src/scripts/` 其它脚本的 deps 装配方式）

Create `api/src/scripts/backfill-people-content-entity.ts`:

```ts
// 用法：cd api && npx tsx src/scripts/backfill-people-content-entity.ts
import { getMeetingNotesSingleton } from '../modules/meeting-notes/singleton.js';
import { backfillPeopleContentEntity } from '../modules/meeting-notes/scripts/backfillPeopleContentEntity.js';

async function main() {
  const engine = await getMeetingNotesSingleton();
  const res = await backfillPeopleContentEntity(engine.deps);
  console.log(`[backfill] scanned=${res.scanned} linked=${res.linked}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> 装配校验：确认 `getMeetingNotesSingleton` 的返回对象暴露 `deps`（`MeetingNotesDeps`）。若单例导出的属性名不同，改用该模块实际导出的装配函数取得含 `db`+`embedding` 的 deps；本步只做装配，无独立单测（核心逻辑已在 Step 1–4 覆盖）。

- [ ] **Step 6: 提交**

```bash
git add api/src/modules/meeting-notes/scripts/backfillPeopleContentEntity.ts \
        api/src/scripts/backfill-people-content-entity.ts \
        api/tests/unit/meeting-notes/backfill-people-content-entity.test.ts
git commit -m "feat(meeting-notes): 历史 mn_people content_entity_id 回填脚本 (P1-4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## P1 验收

- [ ] `cd api && npx vitest run tests/unit/meeting-notes` 全绿。
- [ ] `cd api && npx tsc --noEmit` 无类型错误。
- [ ] 新 run 产生的 mn_people 行 `content_entity_id` 非空（P2 依赖此前提）。
- [ ] 回填脚本在预发库跑一次，`linked == scanned`，抽查若干 person 的 content_entity_id 指向正确的 content_entities 行。

## 交接给 P2

P1 完成后，`ensurePersonByName` 已保证每个 person 有全局 id。P2 将引入 run 花名册，把 ~8 个 axis computer 的 `ensurePersonByName(item.who)` 换成 `roster.resolve(name)`（命不中不造人），另起一份 plan。

## 待执行时确认的两个实现细节（不阻塞计划）

1. `EntityResolver.resolveAndRegister` 入参字段名以 content-library 的 `ContentEntity` 类型为准（本计划用 `canonicalName`/`aliases`/`entityType`）；实现前 Read `content-library/consolidation/entityResolver.ts` 与其 `types.ts` 核对确切属性名，若不同按实际调整（Task 2/4 同步）。
2. `content_entities` 若对 `entity_type` 有 CHECK 约束，确认 `'person'` 在允许集合内；否则在 Task 1 迁移里附带放宽约束。
