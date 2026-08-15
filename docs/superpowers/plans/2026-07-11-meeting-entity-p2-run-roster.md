# P2 会议实体统一 · Run 花名册（源头治理）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每个 meeting run 只在一处造人（roster builder），~11 个 axis computer 改为对 workspace 花名册做只读解析（canonical/alias/embedding），命不中不造人而是入队 `mn_unresolved_mentions`，整个行为经 `MN_PERSON_ROSTER` flag 灰度。

**Architecture:** run 解析完成后，`PersonRoster.build(deps, meetingId)` 一次性把当前 workspace 的 `mn_people`（含 parse 阶段已 mint 的参会人）连同其 `content_entities.embedding` 载入内存。axis computer 拿到的 `ComputeArgs.personRoster` 提供 `resolve(rawName)`：精确 canonical → alias → embedding 余弦，命中返回 `mn_people.id`，命不中**只入队不造人**。flag 关闭时全部回退到现有 `ensurePersonByName` 逐调用行为，零风险。唯一造人点仍是 parse 阶段的 `meetingParser`（参会人）——花名册的种子来源。

**Tech Stack:** TypeScript (ESM, `.js` import 后缀) · Node.js · PostgreSQL (pgvector `vector(768)`) · vitest（单测 mock `deps.db.query` / `deps.embedding`，不连真库）。

## Global Constraints

- **Flag：`process.env.MN_PERSON_ROSTER === '1'`** 开启花名册路径；未开启时所有 axis computer 走原 `ensurePersonByName`，行为逐字节不变。（现有 flag 惯例见 `runs/runEngine.ts` 的 `MN_MULTIAXIS_TOKEN_STREAM`、`scheduler.ts` 的 `MN_PROJECT_AUTO_INCREMENTAL`。）
- **唯一造人点 = roster 种子（parse 阶段 `meetingParser` 的参会人 `ensurePersonByName`）**。`PersonRoster.resolve` 绝不 `INSERT INTO mn_people`。
- **workspace 权威**：花名册按 `assets.workspace_id` 限定（承接 I1 决策：`content_entities` 保持全局、person 身份由 `mn_people.workspace_id` 区分；跨 workspace 同名塌缩推迟到 P3/P4）。
- **embedding 在生产当前为 noop**（`createNoopEmbeddingAdapter` 返回 `[]`，C1 修复后 `content_entities.embedding` 落 `null`）。故 embedding 余弦分支在生产**休眠**，P2 只实打实交付 exact+alias 归一 + 「不再散造人」硬约束；真正模糊归一待 P3 接真 embedding。**代码要写全，测试用 mock 向量驱动**。
- **claude-cli / api-oneshot 路径不动**（`persistClaudeAxes` 的 `cliPersonMap`/`resolvePersonId` 本就干净）。
- ESM：所有本地 import 带 `.js` 后缀。commit 粒度：一个 task 一个 commit。commit message 结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Create** `api/src/modules/meeting-notes/runs/personRoster.ts` — `PersonRoster` 类（build / resolve / flushUnresolved），纯内存解析 + 一次性种子查询 + 一次性 flush。
- **Create** `api/src/modules/meeting-notes/migrations/032-unresolved-mentions.sql` — `mn_unresolved_mentions` 停放表。
- **Modify** `api/src/modules/meeting-notes/parse/participantExtractor.ts` — 导出 `normalizeName`（roster 复用，DRY）。
- **Modify** `api/src/db/ensureMeetingNotesSchema.ts` — `FILES` 追加 `032-...`。
- **Modify** `api/src/modules/meeting-notes/axes/_shared.ts` — `ComputeArgs` 加 `personRoster?: PersonRoster | null`。
- **Modify** `api/src/modules/meeting-notes/runs/runEngine.ts` — parse 后 flag 门内 build roster、注入 `runAxisAll` 的 args、axes 结束后 flush。
- **Modify** 11 个 axis computer（people×4 / knowledge×4 / projects×2 / tension×1）— 调用点换 roster-or-fallback。
- **Create/Modify tests** — `personRoster.test.ts`、`unresolved-mentions-migration.test.ts`、扩 `engine-lifecycle.test.ts`、扩 `commitments-computer.test.ts`（代表 people 轴）、新增各轴代表性断言、`p2-roster-integration.test.ts`。

---

## Task 1: PersonRoster 类（内存解析，永不造人）

**Files:**
- Create: `api/src/modules/meeting-notes/runs/personRoster.ts`
- Modify: `api/src/modules/meeting-notes/parse/participantExtractor.ts`（导出 `normalizeName`）
- Test: `api/tests/unit/meeting-notes/personRoster.test.ts`

**Interfaces:**
- Consumes: `MeetingNotesDeps`（`types.ts:114`）；`normalizeName`（本 task 导出）。
- Produces:
  - `export function normalizeName(raw: string): string`（从 `participantExtractor.ts` 导出）
  - `export interface RosterMember { id: string; canonicalName: string; aliases: string[]; contentEntityId: string | null; embedding: number[] | null }`
  - `export class PersonRoster` with:
    - `static async build(deps: MeetingNotesDeps, meetingId: string): Promise<PersonRoster>`
    - `resolve(rawName: string): string | null`（返回 `mn_people.id`；命不中记 unresolved 并返回 `null`；**永不写库**）
    - `get unresolved(): { normalized: string; raw: string; count: number }[]`
    - `async flushUnresolved(deps: MeetingNotesDeps, meetingId: string): Promise<number>`（Task 2 落实现，Task 1 先留桩返回 0）
    - `get size(): number`

- [ ] **Step 1: 导出 normalizeName**

修改 `api/src/modules/meeting-notes/parse/participantExtractor.ts:10`，把 `function normalizeName` 改为 `export function normalizeName`：

```typescript
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[（(].*?[)）]/g, '') // 去掉括号注释
    .trim();
}
```

- [ ] **Step 2: 写失败测试** `api/tests/unit/meeting-notes/personRoster.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PersonRoster } from '../../../src/modules/meeting-notes/runs/personRoster.js';

function depsWithMembers(rows: any[]) {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (/FROM mn_people/i.test(sql)) return { rows };
      return { rows: [] };
    }),
  };
  const embedding = { embed: vi.fn(async () => new Array(768).fill(0)), embedBatch: vi.fn() };
  return { db, embedding } as any;
}

describe('PersonRoster', () => {
  it('build 载入 workspace 成员并按 canonical 精确解析', async () => {
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '张伟', aliases: ['张总'], content_entity_id: 'ce-1', embedding: null },
    ]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.size).toBe(1);
    expect(roster.resolve('张伟')).toBe('mp-1');
  });

  it('alias 命中', async () => {
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '张伟', aliases: ['张总', '张总监'], content_entity_id: null, embedding: null },
    ]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.resolve('张总监')).toBe('mp-1');
  });

  it('embedding 余弦命中（mock 向量）', async () => {
    const vec = (n: number) => { const a = new Array(768).fill(0); a[0] = n; return a; };
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '王芳', aliases: [], content_entity_id: 'ce-9', embedding: JSON.stringify(vec(1)) },
    ]);
    (deps.embedding.embed as any).mockResolvedValue(vec(1)); // query 名字 embed 与成员同向
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(await roster.resolveAsync('小王')).toBe('mp-1');
  });

  it('命不中：不返回 id、记入 unresolved、绝不 INSERT mn_people', async () => {
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '张伟', aliases: [], content_entity_id: null, embedding: null },
    ]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.resolve('陌生人')).toBeNull();
    expect(roster.unresolved).toEqual([{ normalized: '陌生人', raw: '陌生人', count: 1 }]);
    const inserted = (deps.db.query as any).mock.calls.some((c: any[]) => /INSERT INTO mn_people/i.test(c[0]));
    expect(inserted).toBe(false);
  });

  it('空名归一为空 → 返回 null 且不记 unresolved', async () => {
    const deps = depsWithMembers([]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.resolve('（列席）')).toBeNull();
    expect(roster.unresolved).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/personRoster.test.ts`
Expected: FAIL（`personRoster.js` 模块不存在）

- [ ] **Step 4: 实现** `api/src/modules/meeting-notes/runs/personRoster.ts`

> 说明：`resolve()` 是同步 exact+alias 快路径（生产主力）；`resolveAsync()` 额外做 embedding 余弦（生产休眠，测试用 mock 驱动）。axis computer 用 `resolveAsync`（见 Task 4-6），因为需要 await embed。exact/alias 命中时 `resolveAsync` 不发 embed 调用。

```typescript
// runs/personRoster.ts — 每 run 一份 workspace 花名册，唯一目的是「只读解析、绝不造人」
import type { MeetingNotesDeps } from '../types.js';
import { normalizeName } from '../parse/participantExtractor.js';

export interface RosterMember {
  id: string;
  canonicalName: string;
  aliases: string[];
  contentEntityId: string | null;
  embedding: number[] | null;
}

const EMBED_MATCH_THRESHOLD = 0.86;

function parseVec(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { const a = JSON.parse(v); return Array.isArray(a) && a.length > 0 ? a : null; } catch { return null; }
  }
  return null;
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class PersonRoster {
  private members: RosterMember[] = [];
  private byExact = new Map<string, string>(); // normalized canonical/alias → mn_people.id
  private unresolvedMap = new Map<string, { normalized: string; raw: string; count: number }>();

  private constructor(
    private readonly deps: MeetingNotesDeps,
    members: RosterMember[],
  ) {
    this.members = members;
    for (const m of members) {
      this.byExact.set(normalizeName(m.canonicalName), m.id);
      for (const a of m.aliases ?? []) {
        const na = normalizeName(a);
        if (na && !this.byExact.has(na)) this.byExact.set(na, m.id);
      }
    }
  }

  static async build(deps: MeetingNotesDeps, meetingId: string): Promise<PersonRoster> {
    const res = await deps.db.query(
      `SELECT p.id, p.canonical_name, p.aliases, p.content_entity_id, e.embedding
         FROM mn_people p
         LEFT JOIN content_entities e ON e.id = p.content_entity_id
        WHERE p.workspace_id = (SELECT workspace_id FROM assets WHERE id::text = $1::text LIMIT 1)`,
      [meetingId],
    );
    const members: RosterMember[] = res.rows.map((r: any) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      contentEntityId: r.content_entity_id ?? null,
      embedding: parseVec(r.embedding),
    }));
    return new PersonRoster(deps, members);
  }

  get size(): number { return this.members.length; }

  private record(normalized: string, raw: string): void {
    const cur = this.unresolvedMap.get(normalized);
    if (cur) cur.count += 1;
    else this.unresolvedMap.set(normalized, { normalized, raw, count: 1 });
  }

  /** 同步快路径：exact canonical + alias。命不中记 unresolved 返回 null。永不造人。 */
  resolve(rawName: string): string | null {
    const norm = normalizeName(rawName ?? '');
    if (!norm) return null;
    const hit = this.byExact.get(norm);
    if (hit) return hit;
    this.record(norm, rawName);
    return null;
  }

  /** 全路径：exact/alias 命中即返回；否则 embedding 余弦（生产休眠）。命不中记 unresolved。永不造人。 */
  async resolveAsync(rawName: string): Promise<string | null> {
    const norm = normalizeName(rawName ?? '');
    if (!norm) return null;
    const exact = this.byExact.get(norm);
    if (exact) return exact;

    const candidates = this.members.filter((m) => m.embedding && m.embedding.length > 0);
    if (candidates.length > 0) {
      const qv = parseVec(await this.deps.embedding.embed(norm));
      if (qv && qv.length > 0) {
        let best: { id: string; score: number } | null = null;
        for (const m of candidates) {
          const s = cosine(qv, m.embedding as number[]);
          if (!best || s > best.score) best = { id: m.id, score: s };
        }
        if (best && best.score >= EMBED_MATCH_THRESHOLD) return best.id;
      }
    }
    this.record(norm, rawName);
    return null;
  }

  get unresolved(): { normalized: string; raw: string; count: number }[] {
    return [...this.unresolvedMap.values()];
  }

  // Task 2 落实现
  async flushUnresolved(_deps: MeetingNotesDeps, _meetingId: string): Promise<number> {
    return 0;
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/personRoster.test.ts`
Expected: PASS（5 tests）
再跑 `npx tsc --noEmit`，Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add api/src/modules/meeting-notes/runs/personRoster.ts \
        api/src/modules/meeting-notes/parse/participantExtractor.ts \
        api/tests/unit/meeting-notes/personRoster.test.ts
git commit -m "feat(meeting-notes): PersonRoster 内存花名册，只读解析绝不造人 (P2-1)"
```

---

## Task 2: mn_unresolved_mentions 停放表 + flushUnresolved

**Files:**
- Create: `api/src/modules/meeting-notes/migrations/032-unresolved-mentions.sql`
- Modify: `api/src/db/ensureMeetingNotesSchema.ts`（`FILES` 追加）
- Modify: `api/src/modules/meeting-notes/runs/personRoster.ts`（实现 `flushUnresolved`）
- Test: `api/tests/unit/meeting-notes/unresolved-mentions-migration.test.ts`；扩 `personRoster.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PersonRoster.unresolved`。
- Produces: `mn_unresolved_mentions(meeting_id, normalized_name, raw_name, occurrences, status, created_at)`；`flushUnresolved` upsert 后返回落库条数。

- [ ] **Step 1: 写迁移** `api/src/modules/meeting-notes/migrations/032-unresolved-mentions.sql`

```sql
-- P2: 未解析人名停放队列（roster 命不中的名字入此，供 P4 复核 UI 消费）
CREATE TABLE IF NOT EXISTS mn_unresolved_mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      UUID,
  raw_name        TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  occurrences     INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_mn_unresolved_status ON mn_unresolved_mentions(status);
```

- [ ] **Step 2: 注册迁移**

在 `api/src/db/ensureMeetingNotesSchema.ts` 的 `FILES` 数组末尾（`031-...` 之后）追加：

```typescript
  '032-unresolved-mentions.sql',
```

- [ ] **Step 3: 写失败测试**

新建 `api/tests/unit/meeting-notes/unresolved-mentions-migration.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

describe('032-unresolved-mentions migration', () => {
  it('已登记进 FILES 列表', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('032-unresolved-mentions.sql');
  });
  it('建表且 (meeting_id, normalized_name) 唯一', () => {
    const p = fileURLToPath(new URL(
      '../../../src/modules/meeting-notes/migrations/032-unresolved-mentions.sql', import.meta.url));
    const sql = readFileSync(p, 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS mn_unresolved_mentions/);
    expect(sql).toMatch(/UNIQUE \(meeting_id, normalized_name\)/);
  });
});
```

追加到 `personRoster.test.ts`（flush 行为）：

```typescript
  it('flushUnresolved 把未解析名字 upsert 进 mn_unresolved_mentions', async () => {
    const deps = depsWithMembers([{ id: 'mp-1', canonical_name: '张伟', aliases: [], content_entity_id: null, embedding: null }]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    roster.resolve('陌生甲');
    roster.resolve('陌生甲'); // count=2
    roster.resolve('陌生乙');
    const n = await roster.flushUnresolved(deps, 'meeting-1');
    expect(n).toBe(2);
    const upserts = (deps.db.query as any).mock.calls.filter((c: any[]) => /INSERT INTO mn_unresolved_mentions/i.test(c[0]));
    expect(upserts.length).toBe(2);
    expect(upserts[0][0]).toMatch(/ON CONFLICT \(meeting_id, normalized_name\)/i);
  });
```

- [ ] **Step 4: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/unresolved-mentions-migration.test.ts tests/unit/meeting-notes/personRoster.test.ts`
Expected: FAIL（flush 桩返回 0；断言 upsert 调用不存在）

- [ ] **Step 5: 实现 flushUnresolved**

替换 `personRoster.ts` 里 Task 1 的 `flushUnresolved` 桩：

```typescript
  async flushUnresolved(deps: MeetingNotesDeps, meetingId: string): Promise<number> {
    const items = this.unresolved;
    for (const it of items) {
      await deps.db.query(
        `INSERT INTO mn_unresolved_mentions (meeting_id, raw_name, normalized_name, occurrences)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (meeting_id, normalized_name)
         DO UPDATE SET occurrences = mn_unresolved_mentions.occurrences + EXCLUDED.occurrences`,
        [meetingId, it.raw, it.normalized, it.count],
      );
    }
    return items.length;
  }
```

- [ ] **Step 6: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/unresolved-mentions-migration.test.ts tests/unit/meeting-notes/personRoster.test.ts`
Expected: PASS。`npx tsc --noEmit` exit 0。

- [ ] **Step 7: Commit**

```bash
git add api/src/modules/meeting-notes/migrations/032-unresolved-mentions.sql \
        api/src/db/ensureMeetingNotesSchema.ts \
        api/src/modules/meeting-notes/runs/personRoster.ts \
        api/tests/unit/meeting-notes/unresolved-mentions-migration.test.ts \
        api/tests/unit/meeting-notes/personRoster.test.ts
git commit -m "feat(meeting-notes): mn_unresolved_mentions 停放表 + flushUnresolved 入队 (P2-2)"
```

---

## Task 3: 把 roster 接入 run 生命周期（flag 门控）

**Files:**
- Modify: `api/src/modules/meeting-notes/axes/_shared.ts`（`ComputeArgs` 加字段）
- Modify: `api/src/modules/meeting-notes/runs/runEngine.ts`（build / 注入 / flush）
- Test: 扩 `api/tests/unit/meeting-notes/engine-lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 1/2 的 `PersonRoster`。
- Produces: `ComputeArgs.personRoster?: PersonRoster | null`，被 `runAxisAll` 经 `enrichedArgs = { ...args }` 自动透传给每个 computer（`registry.ts:270` 已验证）。

- [ ] **Step 1: ComputeArgs 加字段**

`api/src/modules/meeting-notes/axes/_shared.ts` 顶部 import：

```typescript
import type { PersonRoster } from '../runs/personRoster.js';
```

`ComputeArgs` 接口（`_shared.ts:19`）加一行：

```typescript
export interface ComputeArgs {
  meetingId?: string;
  scopeId?: string | null;
  scopeKind?: 'library' | 'project' | 'client' | 'topic' | 'meeting';
  replaceExisting?: boolean;
  scopeDecisionHistory?: ScopeDecisionRef[];
  personRoster?: PersonRoster | null;
}
```

- [ ] **Step 2: 写失败测试**（扩 `engine-lifecycle.test.ts`）

在 `engine-lifecycle.test.ts` 增加一个 dispatch 断言：flag 开启时 `runAxisAll` 收到的 `args.personRoster` 非空；flag 关闭时为空/undefined。（沿用该文件既有 mock 风格；核心断言如下，具体 harness 复用文件内现有 `makeEngine`/dispatch 辅助。）

```typescript
  it('MN_PERSON_ROSTER=1 时 build 花名册并注入 args；关闭时不注入', async () => {
    // 用 vi.stubEnv 切换 flag，spy runAxisAll（或 registry.resolveComputer 拿到的 args）
    // 断言：开启 → 某 computer 收到的 args.personRoster instanceof PersonRoster
    //       关闭 → args.personRoster == null/undefined
    // （实现者：参照本文件已有对 execute() 的驱动方式补齐 mock；关键是捕获传入 computer 的 args）
    expect(true).toBe(true); // 占位：实现者替换为真实捕获断言
  });
```

> 实现者注意：`engine-lifecycle.test.ts` 已有对 `computeAxis`/dispatch 的 mock（见文件 line 120–148）。用同样手法 spy 一个 computer，读取其收到的 `args.personRoster`。**不要**留占位断言进 commit——RED 阶段先让它按真实捕获失败。

- [ ] **Step 3: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/engine-lifecycle.test.ts`
Expected: FAIL（roster 尚未注入，捕获到的 `args.personRoster` 为 undefined 即使 flag 开）

- [ ] **Step 4: 实现 runEngine 接线**

在 `runs/runEngine.ts` 顶部 import：

```typescript
import { PersonRoster } from './personRoster.js';
```

在 `execute()` 内，`parseMeeting` 完成之后（`~line 2183` 之后）、axes 分发循环之前（`~line 2353` 之前）插入：

```typescript
    // P2 源头治理：flag 门控，每 run 一份 workspace 花名册（种子 = parse 阶段已 mint 的参会人）
    const usePersonRoster = process.env.MN_PERSON_ROSTER === '1';
    let personRoster: PersonRoster | null = null;
    if (usePersonRoster && payload.meetingId) {
      try {
        personRoster = await PersonRoster.build(this.deps, payload.meetingId);
      } catch (e) {
        console.warn('[runEngine] PersonRoster.build 失败，本 run 回退逐调用造人:', (e as Error).message);
        personRoster = null;
      }
    }
```

把 `personRoster` 塞进 `runAxisAll` 的 args（`~line 2358` 的 `runAxisAll(this.deps, ax, {...})`）：

```typescript
          () => runAxisAll(this.deps, ax, {
            meetingId: mid,
            scopeId: payload.scope.id ?? null,
            scopeKind: payload.scope.kind,
            replaceExisting: true,
            personRoster,
          }, payload.axis === 'all' ? undefined : payload.subDims),
```

axes 全部结束后（分发循环之后）flush：

```typescript
    if (personRoster && payload.meetingId) {
      try {
        const parked = await personRoster.flushUnresolved(this.deps, payload.meetingId);
        if (parked > 0) console.info(`[runEngine] ${parked} 个未解析人名已入队 mn_unresolved_mentions`);
      } catch (e) {
        console.warn('[runEngine] flushUnresolved 失败:', (e as Error).message);
      }
    }
```

> 实现者：`mid` 在多会议循环里逐个变化，但花名册按 `payload.meetingId` 的 workspace 构建（同 run 同 workspace）。若 `mid` 与 `payload.meetingId` 可能跨 workspace，按 `payload.meetingId` 构建即可（workspace 一致）；确认循环内 `mid` 均属同一 workspace，否则在循环内按 `mid` 重建（读代码定夺，默认按 payload.meetingId 单次构建）。

- [ ] **Step 5: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/engine-lifecycle.test.ts`
Expected: PASS。`npx tsc --noEmit` exit 0。

- [ ] **Step 6: Commit**

```bash
git add api/src/modules/meeting-notes/axes/_shared.ts \
        api/src/modules/meeting-notes/runs/runEngine.ts \
        api/tests/unit/meeting-notes/engine-lifecycle.test.ts
git commit -m "feat(meeting-notes): flag 门控 build/注入/flush run 花名册 (P2-3)"
```

---

## Task 4: people 轴 4 个 computer 换 roster-or-fallback

**Files:**
- Modify: `axes/people/commitmentsComputer.ts:64`、`axes/people/roleTrajectoryComputer.ts:65`、`axes/people/speechQualityComputer.ts:74`、`axes/people/silenceSignalComputer.ts:56`
- Test: 扩 `api/tests/unit/meeting-notes/commitments-computer.test.ts`（people 轴代表）

**Interfaces:**
- Consumes: `ComputeArgs.personRoster`（Task 3）；`PersonRoster.resolveAsync`（Task 1）。
- Produces: 无新导出；行为——flag 路径下 personId 来自 roster，命不中 `skipped += 1`（与现有 null→skip 语义一致）。

**统一替换规则**（对上述 4 处逐一套用；字段名各异见下表）：

原：
```typescript
const personId = await ensurePersonByName(deps, <NAME>, undefined, undefined, args.meetingId);
```
改为：
```typescript
const personId = args.personRoster
  ? await args.personRoster.resolveAsync(<NAME>)
  : await ensurePersonByName(deps, <NAME>, undefined, undefined, args.meetingId);
```

| 文件 | 行 | `<NAME>` |
|---|---|---|
| commitmentsComputer.ts | 64 | `item.who` |
| roleTrajectoryComputer.ts | 65 | `item.who` |
| speechQualityComputer.ts | 74 | `item.who` |
| silenceSignalComputer.ts | 56 | `item.who` |

> `ensurePersonByName` 的 import 保留（fallback 仍用）。

- [ ] **Step 1: 写失败测试**（扩 `commitments-computer.test.ts`）

```typescript
  it('提供 personRoster 时经花名册解析，命中走 roster、不再逐调用造人', async () => {
    const { deps, query } = makeDeps();
    const roster = {
      resolveAsync: vi.fn(async (n: string) => (n === '张三' ? 'mp-hit' : null)),
    } as any;
    const result = await computeCommitments(deps, { meetingId: 'm1', personRoster: roster });
    expect(roster.resolveAsync).toHaveBeenCalledWith('张三');
    expect(result.created).toBe(1);
    const insert = query.mock.calls.find((c: any) => c[0].includes('INSERT INTO mn_commitments'));
    expect(insert[1][1]).toBe('mp-hit'); // person_id 来自 roster
    // 未走 ensurePersonByName 造人路径
    const minted = query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]));
    expect(minted).toBe(false);
  });

  it('roster 命不中 → skipped，不插 commitment', async () => {
    const { deps } = makeDeps();
    const roster = { resolveAsync: vi.fn(async () => null) } as any;
    const result = await computeCommitments(deps, { meetingId: 'm1', personRoster: roster });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/commitments-computer.test.ts`
Expected: FAIL（computer 尚未读 `args.personRoster`）

- [ ] **Step 3: 套用替换规则到 4 个文件**（见上表，逐行改）

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/commitments-computer.test.ts`
Expected: PASS（含原有 6 + 新增 2）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/axes/people/*.ts \
        api/tests/unit/meeting-notes/commitments-computer.test.ts
git commit -m "feat(meeting-notes): people 轴 4 computer 走 roster 解析 (P2-4)"
```

---

## Task 5: knowledge 轴 4 个 computer 换 roster-or-fallback

**Files:**
- Modify: `axes/knowledge/counterfactualsComputer.ts:54`、`axes/knowledge/reusableJudgmentsComputer.ts:49`、`axes/knowledge/cognitiveBiasesComputer.ts:54`、`axes/knowledge/mentalModelsComputer.ts:56`
- Test: 新增 `api/tests/unit/meeting-notes/knowledge-roster.test.ts`（代表 counterfactuals）

**Interfaces:** 同 Task 4。

**统一替换规则**（同 Task 4 的 roster-or-fallback 模板）：

| 文件 | 行 | `<NAME>` |
|---|---|---|
| counterfactualsComputer.ts | 54 | `item.rejected_by` |
| reusableJudgmentsComputer.ts | 49 | `item.author` |
| cognitiveBiasesComputer.ts | 54 | `item.by` |
| mentalModelsComputer.ts | 56 | `item.by` |

> 注意：这几处原为三元表达式（`item.rejected_by ? await ensurePersonByName(...) : null` 之类）。改写时保留「字段为空则 null」的外层判断，只把内层 `ensurePersonByName(...)` 换成 `args.personRoster ? args.personRoster.resolveAsync(<NAME>) : ensurePersonByName(...)`。实现者先 Read 每个文件确认该三元结构再替换。

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/knowledge-roster.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { computeCounterfactuals } from '../../../src/modules/meeting-notes/axes/knowledge/counterfactualsComputer.js';

function makeDeps(llmResponse: string) {
  const query = vi.fn(async (sql: string) => {
    if (/FROM assets/i.test(sql)) return { rows: [{ id: 'm1', title: 't', content: 'c', metadata: {} }] };
    if (/INSERT INTO mn_counterfactuals/i.test(sql)) return { rows: [{ id: 'cf1' }] };
    return { rows: [] };
  });
  const deps: any = {
    db: { query },
    llm: { complete: vi.fn(), completeWithSystem: vi.fn().mockResolvedValue(llmResponse) },
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    expertApplication: { resolveForMeetingKind: vi.fn(() => null), shouldSkipExpertAnalysis: vi.fn(() => false) },
  };
  return { deps, query };
}

describe('counterfactuals · roster', () => {
  it('personRoster 命中 → 用 roster id，不造人', async () => {
    const { deps, query } = makeDeps(JSON.stringify([{ rejected_by: '李四', claim: 'x', reason: 'y' }]));
    const roster = { resolveAsync: vi.fn(async () => 'mp-x') } as any;
    await computeCounterfactuals(deps, { meetingId: 'm1', personRoster: roster });
    expect(roster.resolveAsync).toHaveBeenCalledWith('李四');
    expect(query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]))).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/knowledge-roster.test.ts`
Expected: FAIL。

- [ ] **Step 3: 套用替换到 4 个 knowledge 文件**（保留外层空值三元）

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/knowledge-roster.test.ts`
Expected: PASS。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/axes/knowledge/*.ts \
        api/tests/unit/meeting-notes/knowledge-roster.test.ts
git commit -m "feat(meeting-notes): knowledge 轴 4 computer 走 roster 解析 (P2-5)"
```

---

## Task 6: projects + tension 轴 3 个 computer 换 roster-or-fallback

**Files:**
- Modify: `axes/projects/decisionProvenanceComputer.ts:73`、`axes/projects/openQuestionsComputer.ts:52`、`axes/tension/tensionComputer.ts:76`
- Test: 新增 `api/tests/unit/meeting-notes/tension-roster.test.ts`（tension 在循环里解析多名参与者，值得单测）

**Interfaces:** 同 Task 4。

**统一替换规则**：

| 文件 | 行 | `<NAME>` | 备注 |
|---|---|---|---|
| decisionProvenanceComputer.ts | 73 | `item.proposer` | 原为三元（空则 null），保留外层判断 |
| openQuestionsComputer.ts | 52 | `item.owner` | 原为三元，保留外层判断 |
| tensionComputer.ts | 76 | `name` | 在 `for (const name of ...)` 循环内 |

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/tension-roster.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { computeTensions } from '../../../src/modules/meeting-notes/axes/tension/tensionComputer.js';

function makeDeps(llmResponse: string) {
  const query = vi.fn(async (sql: string) => {
    if (/FROM assets/i.test(sql)) return { rows: [{ id: 'm1', title: 't', content: 'c', metadata: {} }] };
    return { rows: [{ id: 'row1' }] };
  });
  const deps: any = {
    db: { query },
    llm: { complete: vi.fn(), completeWithSystem: vi.fn().mockResolvedValue(llmResponse) },
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    expertApplication: { resolveForMeetingKind: vi.fn(() => null), shouldSkipExpertAnalysis: vi.fn(() => false) },
  };
  return { deps, query };
}

describe('tension · roster', () => {
  it('循环内每个 participant 走 roster，命不中不造人', async () => {
    const { deps, query } = makeDeps(JSON.stringify([{ participants: ['张三', '陌生人'], topic: 't', summary: 's' }]));
    const roster = { resolveAsync: vi.fn(async (n: string) => (n === '张三' ? 'mp-a' : null)) } as any;
    await computeTensions(deps, { meetingId: 'm1', personRoster: roster });
    expect(roster.resolveAsync).toHaveBeenCalledWith('张三');
    expect(roster.resolveAsync).toHaveBeenCalledWith('陌生人');
    expect(query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]))).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/tension-roster.test.ts`
Expected: FAIL。

- [ ] **Step 3: 套用替换到 3 个文件**（Read 确认 tension 循环变量名 `name` 后替换）

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/tension-roster.test.ts`
Expected: PASS。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/axes/projects/*.ts \
        api/src/modules/meeting-notes/axes/tension/*.ts \
        api/tests/unit/meeting-notes/tension-roster.test.ts
git commit -m "feat(meeting-notes): projects+tension 轴 3 computer 走 roster 解析 (P2-6)"
```

---

## Task 7: 集成与回归

**Files:**
- Test: 新建 `api/tests/unit/meeting-notes/p2-roster-integration.test.ts`

**Interfaces:** 无新代码，只加断言级保障。

- [ ] **Step 1: 写集成回归测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PersonRoster } from '../../../src/modules/meeting-notes/runs/personRoster.js';

describe('P2 roster 集成/回归', () => {
  it('多轴引用同一花名册成员 → 零重复造人（跨轴归一）', async () => {
    const db = { query: vi.fn(async (sql: string) => {
      if (/FROM mn_people/i.test(sql)) return { rows: [
        { id: 'mp-1', canonical_name: '张伟', aliases: ['张总'], content_entity_id: null, embedding: null },
      ] };
      return { rows: [] };
    }) };
    const embedding = { embed: vi.fn(async () => []), embedBatch: vi.fn() };
    const roster = await PersonRoster.build({ db, embedding } as any, 'm1');
    // 三个轴分别用 张伟/张总/张伟 引用同一人
    expect(roster.resolve('张伟')).toBe('mp-1');
    expect(roster.resolve('张总')).toBe('mp-1');
    expect(roster.resolveAsync ? await roster.resolveAsync('张伟') : null).toBe('mp-1');
    // 全程零 INSERT INTO mn_people
    expect(db.query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]))).toBe(false);
  });

  it('回归：flag 关闭时 axis computer 行为不变（走 ensurePersonByName）', async () => {
    // commitments-computer.test.ts 既有用例已覆盖「无 personRoster → 原路径」；
    // 此处显式断言 personRoster 缺省时不触发 roster
    const roster = new (PersonRoster as any)({ db: { query: vi.fn() }, embedding: { embed: vi.fn() } }, []);
    expect(typeof roster.resolve).toBe('function');
    expect(roster.resolve('任何人')).toBeNull(); // 空花名册 → null（park），不抛错
  });
});
```

- [ ] **Step 2: 运行**

Run: `cd api && npx vitest run tests/unit/meeting-notes/p2-roster-integration.test.ts`
Expected: PASS。

- [ ] **Step 3: 全量 P2 相关回归**

Run:
```bash
cd api && npx vitest run \
  tests/unit/meeting-notes/personRoster.test.ts \
  tests/unit/meeting-notes/unresolved-mentions-migration.test.ts \
  tests/unit/meeting-notes/engine-lifecycle.test.ts \
  tests/unit/meeting-notes/commitments-computer.test.ts \
  tests/unit/meeting-notes/knowledge-roster.test.ts \
  tests/unit/meeting-notes/tension-roster.test.ts \
  tests/unit/meeting-notes/p2-roster-integration.test.ts \
  tests/unit/meeting-notes/participant-extractor.test.ts
```
Expected: 全 PASS。`npx tsc --noEmit` exit 0。

> 注意基线：`engine-lifecycle.test.ts` 在 main 上已有 1 个既存失败（`axis=people limits to 4 sub-dims`，与本 plan 无关）。实现者只需保证**不新增**失败，勿被既存红项误导。

- [ ] **Step 4: Commit**

```bash
git add api/tests/unit/meeting-notes/p2-roster-integration.test.ts
git commit -m "test(meeting-notes): P2 roster 集成/回归断言 (P2-7)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** spec §4.3（run 花名册单点造人）→ Task 1；§4.3「命不中不造人、park 入队」→ Task 1 + Task 2；§5 P2「~8 axis computer 换 roster.resolve + flag 灰度」→ Task 3–6（实为 11 个 computer）；§6 测试策略（同 run 归一、roster 外只 park、cli 路径回归）→ Task 1/4/7。

**类型一致：** `PersonRoster.resolveAsync(rawName): Promise<string|null>` 与 computer 调用一致；`ComputeArgs.personRoster?: PersonRoster|null`（Task 3 定义）在 Task 4–6 一致引用；`MEETING_NOTES_MIGRATION_FILES`（P1 已导出）Task 2 复用。

**已知边界（非缺陷，明确记录）：**
1. **embedding 生产休眠**：noop adapter → `content_entities.embedding=null` → `resolveAsync` 的余弦分支不触发，P2 生产实际只交付 exact+alias 归一 + 「不散造人」。真模糊归一（"张总/张伟/张总监"）待 P3 接真 embedding adapter。测试用 mock 向量已覆盖余弦逻辑正确性。
2. **召回 vs 散乱权衡**：非参会人的新名字不再即时造人，改入 `mn_unresolved_mentions`（P4 复核 UI 消费）。这是 spec §7.3 已确认的取舍。
3. **I1 跨 workspace 同名**：本 plan 承接「全局共享」决策，花名册按 `assets.workspace_id` 限定，不解决跨 ws 塌缩（P3/P4）。
