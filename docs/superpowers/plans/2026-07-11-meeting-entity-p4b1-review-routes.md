# P4b-1 会议实体统一 · 复核 API（服务层 + 路由）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 P4b 复核 UI 提供后端 API：列出/审批/拒绝 `content_entity_merge_candidates`（合并候选）与列出/解决 `mn_unresolved_mentions`（未解析人名）。逻辑放在可单测的服务层，路由是薄封装。

**Architecture:** 纯 db-query 逻辑抽成服务函数（mock `db.query` 即可 TDD，绕开 Fastify createRouter 的 authenticate 集成 harness）；`modules/meeting-notes/router.ts` 加薄 handler 调服务。非 person 候选审批调 P3c 的 `mergeContentEntities`；**person 候选审批本期不做**（服务抛特定错，路由映射 422），因为 person 合并要经 `mn_merge_people` 且 content_entity→mn_people 路由 I1-adjacent，留人工/后续。

**Tech Stack:** TypeScript (ESM, `.js` 后缀) · Fastify · PostgreSQL · vitest（mock `db.query` + `mergeContentEntities`，不连真库）。

## Global Constraints

- **服务层承载逻辑、路由只做薄封装**：每个端点的 SQL/分支写在 `review/` 下的服务函数里，单测覆盖；router.ts 的 handler 只解析入参、调服务、映射状态码。
- **person 候选不在本期审批**：`approveMergeCandidate` 遇 `entity_type='person'` → 抛 `Error` 且 `code='PERSON_MERGE_MANUAL'`（或等价可辨识信号）；路由映射 HTTP 422 + `{code:'PERSON_MERGE_MANUAL'}`。非 person → 调 `mergeContentEntities(deps, target, source)` 后置候选 `status='approved'`。理由：person 合并须经 `mn_merge_people`（workspace 语义）人工确认，规避 I1。
- **列表联表取名**：候选列表 LEFT JOIN `content_entities` 取 `canonical_name`（target/source 两侧）；`status` 过滤默认 `pending`，支持 `all`。
- **拒绝/解决只改状态**：`rejectMergeCandidate` → `status='rejected'`；`resolveUnresolvedMention` → `status='resolved'`。均 `RETURNING id`，未命中返回 false（路由映射 404）。
- **只加不改**：不改动 `modules/meeting-notes/router.ts` 现有路由；只新增 handler。`mergeContentEntities` 需在 router.ts import（当前未 import）。
- **路由前缀**：这些路由挂在 `createRouter` 内，最终 URL 前缀 `/api/v1/meeting-notes`（`server.ts:301`）。新集合段 `entity-merge-candidates`/`unresolved-mentions` 不在 workspace 守卫的 `meetings/scopes/people/runs/schedules` 列表内 → 守卫 `default: return` 跳过，无需额外处理。
- ESM `.js` 后缀。一 task 一 commit，message 结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Create** `api/src/modules/meeting-notes/review/entityReviewService.ts` — `listMergeCandidates` / `approveMergeCandidate` / `rejectMergeCandidate`。
- **Create** `api/src/modules/meeting-notes/review/unresolvedReviewService.ts` — `listUnresolvedMentions` / `resolveUnresolvedMention`。
- **Modify** `api/src/modules/meeting-notes/router.ts` — import `mergeContentEntities` + 5 个薄 handler。
- **Create tests** — `entity-review-service.test.ts`、`unresolved-review-service.test.ts`。

---

## Task 1: entityReviewService（候选列表/审批/拒绝）

**Files:**
- Create: `api/src/modules/meeting-notes/review/entityReviewService.ts`
- Test: `api/tests/unit/meeting-notes/entity-review-service.test.ts`

**Interfaces:**
- Consumes: `mergeContentEntities`（`../../content-library/consolidation/mergeEntities.js`）；一个 `Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> }` 结构类型。
- Produces:
  - `export interface MergeCandidateRow { id; targetEntityId; sourceEntityId; entityType; similarity; status; createdAt; targetName: string|null; sourceName: string|null }`
  - `export async function listMergeCandidates(db, opts?: { status?: string; limit?: number }): Promise<MergeCandidateRow[]>`
  - `export async function approveMergeCandidate(db, id: string): Promise<{ approved: boolean; entityType: string; affected: any[] }>`（person → throw `Object.assign(new Error('person 候选需人工经 people merge'), { code: 'PERSON_MERGE_MANUAL' })`）
  - `export async function rejectMergeCandidate(db, id: string): Promise<boolean>`

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/entity-review-service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  listMergeCandidates, approveMergeCandidate, rejectMergeCandidate,
} from '../../../src/modules/meeting-notes/review/entityReviewService.js';

describe('listMergeCandidates', () => {
  it('按 status 过滤、联表取名、映射行', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [{
        id: 'c1', target_entity_id: 't1', source_entity_id: 's1', entity_type: 'organization',
        similarity: 0.95, status: 'pending', created_at: '2026-07-11',
        target_canonical_name: '腾讯', source_canonical_name: '腾讯控股',
      }] };
    }) };
    const rows = await listMergeCandidates(db as any, { status: 'pending', limit: 20 });
    expect(calls[0].sql).toMatch(/FROM content_entity_merge_candidates/i);
    expect(calls[0].sql).toMatch(/LEFT JOIN content_entities/i);
    expect(calls[0].params).toEqual(['pending', 20]);
    expect(rows[0]).toMatchObject({
      id: 'c1', targetEntityId: 't1', sourceEntityId: 's1', entityType: 'organization',
      similarity: 0.95, status: 'pending', targetName: '腾讯', sourceName: '腾讯控股',
    });
  });
});

describe('approveMergeCandidate', () => {
  it('非 person → 调 merge_content_entities 并置 approved', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/SELECT .* FROM content_entity_merge_candidates WHERE id/i.test(sql))
        return { rows: [{ id: 'c1', target_entity_id: 't1', source_entity_id: 's1', entity_type: 'product' }] };
      if (/merge_content_entities/i.test(sql))
        return { rows: [{ table_name: 'x', rows_reassigned: 1, rows_dropped: 1 }] };
      return { rows: [] };
    }) };
    const r = await approveMergeCandidate(db as any, 'c1');
    expect(r.approved).toBe(true);
    expect(r.entityType).toBe('product');
    expect(calls.some(c => /merge_content_entities/i.test(c.sql))).toBe(true);
    expect(calls.some(c => /UPDATE content_entity_merge_candidates\s+SET status = 'approved'/i.test(c.sql))).toBe(true);
  });

  it('person 候选 → 抛 PERSON_MERGE_MANUAL，不合并', async () => {
    const db = { query: vi.fn(async (sql: string) => {
      if (/FROM content_entity_merge_candidates WHERE id/i.test(sql))
        return { rows: [{ id: 'c1', target_entity_id: 't1', source_entity_id: 's1', entity_type: 'person' }] };
      return { rows: [] };
    }) };
    await expect(approveMergeCandidate(db as any, 'c1')).rejects.toMatchObject({ code: 'PERSON_MERGE_MANUAL' });
    expect(db.query).not.toHaveBeenCalledWith(expect.stringMatching(/merge_content_entities/i), expect.anything());
  });

  it('候选不存在 → 抛 NOT_FOUND', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(approveMergeCandidate(db as any, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('rejectMergeCandidate', () => {
  it('置 rejected；命中返回 true', async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ id: 'c1' }] })) };
    expect(await rejectMergeCandidate(db as any, 'c1')).toBe(true);
  });
  it('未命中返回 false', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await rejectMergeCandidate(db as any, 'x')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/entity-review-service.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `api/src/modules/meeting-notes/review/entityReviewService.ts`

```typescript
// P4b-1: content_entity_merge_candidates 复核服务（列表/审批/拒绝）。
// person 候选本期不审批（须经 mn_merge_people 人工，规避 I1）。
import { mergeContentEntities } from '../../content-library/consolidation/mergeEntities.js';

type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

export interface MergeCandidateRow {
  id: string;
  targetEntityId: string;
  sourceEntityId: string;
  entityType: string;
  similarity: number;
  status: string;
  createdAt: string;
  targetName: string | null;
  sourceName: string | null;
}

export async function listMergeCandidates(
  db: Db,
  opts?: { status?: string; limit?: number },
): Promise<MergeCandidateRow[]> {
  const status = opts?.status ?? 'pending';
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  const res = await db.query(
    `SELECT c.id, c.target_entity_id, c.source_entity_id, c.entity_type,
            c.similarity, c.status, c.created_at,
            t.canonical_name AS target_canonical_name,
            s.canonical_name AS source_canonical_name
       FROM content_entity_merge_candidates c
       LEFT JOIN content_entities t ON t.id = c.target_entity_id
       LEFT JOIN content_entities s ON s.id = c.source_entity_id
      WHERE ($1 = 'all' OR c.status = $1)
      ORDER BY c.similarity DESC, c.created_at ASC
      LIMIT $2`,
    [status, limit],
  );
  return (res.rows ?? []).map((r: any) => ({
    id: String(r.id),
    targetEntityId: String(r.target_entity_id),
    sourceEntityId: String(r.source_entity_id),
    entityType: String(r.entity_type),
    similarity: Number(r.similarity),
    status: String(r.status),
    createdAt: String(r.created_at),
    targetName: r.target_canonical_name ?? null,
    sourceName: r.source_canonical_name ?? null,
  }));
}

export async function approveMergeCandidate(
  db: Db,
  id: string,
): Promise<{ approved: boolean; entityType: string; affected: any[] }> {
  const cand = await db.query(
    `SELECT id, target_entity_id, source_entity_id, entity_type
       FROM content_entity_merge_candidates WHERE id = $1`,
    [id],
  );
  if ((cand.rows?.length ?? 0) === 0) {
    throw Object.assign(new Error('候选不存在'), { code: 'NOT_FOUND' });
  }
  const c = cand.rows[0];
  if (c.entity_type === 'person') {
    throw Object.assign(new Error('person 候选需人工经 people merge 处理'), { code: 'PERSON_MERGE_MANUAL' });
  }
  const affected = await mergeContentEntities({ db }, c.target_entity_id, c.source_entity_id);
  await db.query(
    `UPDATE content_entity_merge_candidates SET status = 'approved' WHERE id = $1`,
    [id],
  );
  return { approved: true, entityType: String(c.entity_type), affected };
}

export async function rejectMergeCandidate(db: Db, id: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE content_entity_merge_candidates SET status = 'rejected' WHERE id = $1 RETURNING id`,
    [id],
  );
  return (r.rows?.length ?? 0) > 0;
}
```

> 实现者：`mergeContentEntities` 的 deps 形参是 `{ db: DatabaseAdapter }`（content-library 类型）；本文件的 `Db` 结构类型与之字段一致，`{ db }` 结构兼容应可直接传。若 tsc 报类型不兼容，改为 import content-library 的 `DatabaseAdapter` 作 `Db` 别名。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/entity-review-service.test.ts`
Expected: PASS（全部）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/review/entityReviewService.ts \
        api/tests/unit/meeting-notes/entity-review-service.test.ts
git commit -m "feat(meeting-notes): entityReviewService 合并候选列表/审批/拒绝 (P4b1-1)"
```

---

## Task 2: unresolvedReviewService（未解析人名列表/解决）

**Files:**
- Create: `api/src/modules/meeting-notes/review/unresolvedReviewService.ts`
- Test: `api/tests/unit/meeting-notes/unresolved-review-service.test.ts`

**Interfaces:**
- Produces:
  - `export interface UnresolvedMentionRow { id; meetingId: string|null; rawName; normalizedName; occurrences; status; createdAt }`
  - `export async function listUnresolvedMentions(db, opts?: { status?: string; limit?: number }): Promise<UnresolvedMentionRow[]>`
  - `export async function resolveUnresolvedMention(db, id: string): Promise<boolean>`

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/unresolved-review-service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  listUnresolvedMentions, resolveUnresolvedMention,
} from '../../../src/modules/meeting-notes/review/unresolvedReviewService.js';

describe('listUnresolvedMentions', () => {
  it('按 status 过滤、按 occurrences 排序、映射行', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [{
        id: 'u1', meeting_id: 'm1', raw_name: '张总', normalized_name: '张总',
        occurrences: 3, status: 'pending', created_at: '2026-07-11',
      }] };
    }) };
    const rows = await listUnresolvedMentions(db as any, { status: 'pending', limit: 50 });
    expect(calls[0].sql).toMatch(/FROM mn_unresolved_mentions/i);
    expect(calls[0].sql).toMatch(/ORDER BY occurrences DESC/i);
    expect(calls[0].params).toEqual(['pending', 50]);
    expect(rows[0]).toMatchObject({ id: 'u1', meetingId: 'm1', rawName: '张总', occurrences: 3, status: 'pending' });
  });
});

describe('resolveUnresolvedMention', () => {
  it('置 resolved；命中 true / 未命中 false', async () => {
    const hit = { query: vi.fn(async () => ({ rows: [{ id: 'u1' }] })) };
    expect(await resolveUnresolvedMention(hit as any, 'u1')).toBe(true);
    const miss = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await resolveUnresolvedMention(miss as any, 'x')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/unresolved-review-service.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `api/src/modules/meeting-notes/review/unresolvedReviewService.ts`

```typescript
// P4b-1: mn_unresolved_mentions 复核服务（列表/解决）。
type Db = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };

export interface UnresolvedMentionRow {
  id: string;
  meetingId: string | null;
  rawName: string;
  normalizedName: string;
  occurrences: number;
  status: string;
  createdAt: string;
}

export async function listUnresolvedMentions(
  db: Db,
  opts?: { status?: string; limit?: number },
): Promise<UnresolvedMentionRow[]> {
  const status = opts?.status ?? 'pending';
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  const res = await db.query(
    `SELECT id, meeting_id, raw_name, normalized_name, occurrences, status, created_at
       FROM mn_unresolved_mentions
      WHERE ($1 = 'all' OR status = $1)
      ORDER BY occurrences DESC, created_at ASC
      LIMIT $2`,
    [status, limit],
  );
  return (res.rows ?? []).map((r: any) => ({
    id: String(r.id),
    meetingId: r.meeting_id ?? null,
    rawName: String(r.raw_name),
    normalizedName: String(r.normalized_name),
    occurrences: Number(r.occurrences),
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
}

export async function resolveUnresolvedMention(db: Db, id: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE mn_unresolved_mentions SET status = 'resolved' WHERE id = $1 RETURNING id`,
    [id],
  );
  return (r.rows?.length ?? 0) > 0;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/unresolved-review-service.test.ts`
Expected: PASS。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/review/unresolvedReviewService.ts \
        api/tests/unit/meeting-notes/unresolved-review-service.test.ts
git commit -m "feat(meeting-notes): unresolvedReviewService 未解析人名列表/解决 (P4b1-2)"
```

---

## Task 3: 路由薄封装（5 个端点）

**Files:**
- Modify: `api/src/modules/meeting-notes/router.ts`

**Interfaces:**
- Consumes: Task 1/2 的服务函数。
- Produces: 5 个路由（挂 `/api/v1/meeting-notes` 前缀下）：
  - `GET /entity-merge-candidates?status=&limit=` → `{ items }`
  - `POST /entity-merge-candidates/:id/approve` → `{ ok, entityType, affected }`；person → 422 `{code:'PERSON_MERGE_MANUAL'}`；不存在 → 404
  - `POST /entity-merge-candidates/:id/reject` → `{ ok }`；未命中 → 404
  - `GET /unresolved-mentions?status=&limit=` → `{ items }`
  - `POST /unresolved-mentions/:id/resolve` → `{ ok }`；未命中 → 404

- [ ] **Step 1: import 服务 + mergeContentEntities**

在 `router.ts` 顶部 import 区加：

```typescript
import {
  listMergeCandidates, approveMergeCandidate, rejectMergeCandidate,
} from './review/entityReviewService.js';
import {
  listUnresolvedMentions, resolveUnresolvedMention,
} from './review/unresolvedReviewService.js';
```

> `mergeContentEntities` 由服务内部 import，router.ts 不需直接引。

- [ ] **Step 2: 加 5 个 handler**

在 `createRouter` 的 `meetingNotesRouter` 函数体内（与其它 `fastify.get/post` 并列，`/people/:id/merge` 附近）加：

```typescript
    // ===== P4b 复核：实体合并候选 =====
    fastify.get('/entity-merge-candidates', { preHandler: authenticate }, async (request) => {
      const q = request.query as { status?: string; limit?: string };
      const items = await listMergeCandidates(engine.deps.db, {
        status: q.status,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return { items };
    });

    fastify.post('/entity-merge-candidates/:id/approve', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const r = await approveMergeCandidate(engine.deps.db, id);
        return { ok: true, entityType: r.entityType, affected: r.affected };
      } catch (e: any) {
        if (e?.code === 'NOT_FOUND') { reply.status(404); return { error: 'Not Found', code: 'NOT_FOUND' }; }
        if (e?.code === 'PERSON_MERGE_MANUAL') { reply.status(422); return { error: 'Unprocessable', code: 'PERSON_MERGE_MANUAL', message: e.message }; }
        request.log.error({ err: e, id }, 'approve merge candidate failed');
        reply.status(500); return { error: 'Internal Server Error', message: e?.message };
      }
    });

    fastify.post('/entity-merge-candidates/:id/reject', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await rejectMergeCandidate(engine.deps.db, id);
      if (!ok) { reply.status(404); return { error: 'Not Found' }; }
      return { ok: true };
    });

    // ===== P4b 复核：未解析人名 =====
    fastify.get('/unresolved-mentions', { preHandler: authenticate }, async (request) => {
      const q = request.query as { status?: string; limit?: string };
      const items = await listUnresolvedMentions(engine.deps.db, {
        status: q.status,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return { items };
    });

    fastify.post('/unresolved-mentions/:id/resolve', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await resolveUnresolvedMention(engine.deps.db, id);
      if (!ok) { reply.status(404); return { error: 'Not Found' }; }
      return { ok: true };
    });
```

> 实现者：Read `router.ts` 确认 (a) `authenticate` 的 import 名与既有 `fastify.post('/people/:id/merge', { preHandler: authenticate }` 一致；(b) `engine.deps.db` 是既有 handler 访问 DB 的方式；(c) 这 5 个路由的 `:id` 段（集合名 `entity-merge-candidates`/`unresolved-mentions`）不在 workspace 守卫 switch 的 `meetings/scopes/people/runs/schedules` 里 → 守卫跳过，无需改守卫。放在任意现有路由之间即可。

- [ ] **Step 3: tsc 校验**

Run: `cd api && npx tsc --noEmit`，Expected: exit 0。

> 本 task 是路由 wiring；逻辑已在 Task 1/2 单测覆盖。可选：若既有 createRouter 有可用 inject harness 再加路由级测试；否则以 tsc + 服务层测试为准（webapp 无前端测试基建，路由 harness 涉及 authenticate 集成，本期不新建）。

- [ ] **Step 4: Commit**

```bash
git add api/src/modules/meeting-notes/router.ts
git commit -m "feat(meeting-notes): 复核 API 路由薄封装（候选审批/拒绝、未解析解决）(P4b1-3)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** 对应总 spec §4.4(b)「人工复核队列」的**后端**。UI（React 页面 + api client）= P4b-2（另出计划，因 webapp 无测试基建、需 build+目测）。

**类型一致：** 服务函数签名（`listMergeCandidates`/`approveMergeCandidate`/`rejectMergeCandidate`/`listUnresolvedMentions`/`resolveUnresolvedMention`）Task1/2 定义、Task3 路由一致引用；行映射字段（camelCase）与列名对齐；`approveMergeCandidate` 的 `PERSON_MERGE_MANUAL`/`NOT_FOUND` code 与路由状态码映射（422/404）一致。

**Placeholder 扫描：** 无 TBD；服务/路由全量给出。三处「实现者：确认类型兼容 / authenticate import / 守卫段」是校验指令。

**已知边界（明确记录）：**
1. **person 候选审批本期不做**：抛 `PERSON_MERGE_MANUAL`→422；UI 侧对 person 行禁用审批按钮。真正 person 合并走人工 `mn_merge_people`。
2. **resolveUnresolvedMention 只置 resolved**：不含「attach 到某 person / 建新 person 并回链」——那需重跑或补列，留 P4b-2/后续。MVP 先让人工把名字移出队列。
3. **路由无新 inject 测试**：逻辑在服务层单测；createRouter 的 authenticate 集成 harness 不在本期新建（webapp 也无前端测试）。tsc 保证 wiring 类型正确。
4. **候选 CASCADE 消失**：P4a 已知——端点实体被后续合并删掉时候选行 CASCADE 消失，列表自然不再出现，无需特殊处理。
