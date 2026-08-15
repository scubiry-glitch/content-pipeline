# P3b 会议实体统一 · 多类实体注册 + wiki 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 meeting 产出的 org/product/event/location 实体经 `EntityResolver.resolveAndRegister` 注册进全局 `content_entities`（person 已在 P1 做），并修 `persistClaudeWiki`：新契约写 wiki 页时顺带注册实体，旧契约不再因 `content_entities` 未命中就放弃写页（改为 best-effort 注册后继续）。

**Architecture:** 新增纯函数 `entityTypeForSubtype(subtype)` 把 wiki 的 `subtype` 映射到 content-library 的 `EntityType`（person→person / org→organization / product→product / event→event / location→location；其余一律 null=不注册）。`handleNewEntityUpdate` 拿到 deps 后，对映射非 null 的 subtype 做 best-effort `resolveAndRegister`（try/catch 降级，绝不因实体解析失败而丢 wiki 页）。`handleLegacyEntityUpdate` 把「content_entities 未命中→return false」改为「best-effort 注册后继续」。所有 fs 写页逻辑不变。

**Tech Stack:** TypeScript (ESM, `.js` import 后缀) · Node.js · PostgreSQL · vitest（mock `deps.db.query`/`deps.embedding`，fs 用 `mkdtemp` 临时目录，不连真库）。

## Global Constraints

- **subtype→EntityType 映射（唯一权威，Task 1 定义，2/3 复用）**：`person→'person'`、`org→'organization'`、`product→'product'`、`event→'event'`、`location→'location'`；**其它全部 → `null`（= 不注册 content_entities）**。
- **`project` 不进 content_entities**：证据——项目在本仓库是 `mn_scopes.scope_kind='project'`（无 `mn_projects` 表），`EntityType` union 无 `'project'`，给 union 加 'project' 会把 content-library 耦合到 meeting-notes。故 project subtype 只写 wiki 页、不注册。（**注意：这偏离原 spec §5 把 project 列进 5 类；按代码事实收敛为 org/product/event/location 四类 + 已完成的 person。**）
- **概念 subtype 不进 content_entities**：`mental-model/judgment/bias/counterfactual/metric/technology/...` 是 meeting 内部概念（`mn_*` 表、wiki `concepts/` 目录），映射返回 null。
- **best-effort 降级（承接 P1/P3a）**：`new EntityResolver(deps.db, deps.embedding)` + `resolveAndRegister({canonicalName, aliases, entityType, metadata:{}})` 全程 try/catch，失败 `console.warn` 且**继续写 wiki 页**，绝不抛穿。`metadata` 是必填，传 `{}`。
- **wiki 页照写**：注册与否都不改变 fs 写页行为——实体解析是「附带注册」，不是写页的前置门。
- **org→organization（非 company）**：语义中立，company 隐含营利。
- ESM `.js` 后缀。测试 fs 用 `mkdtemp` 临时目录、mock db/embedding，不写真 `data/content-wiki/`。commit：一 task 一 commit，结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Modify** `api/src/modules/meeting-notes/runs/persistClaudeWiki.ts` — 加导出 `entityTypeForSubtype`；`handleNewEntityUpdate` 加 `deps` 形参 + best-effort 注册；`handleLegacyEntityUpdate` 未命中改注册后继续；`persistClaudeWiki` 主体把 `deps` 传进 `handleNewEntityUpdate`。
- **Create** `api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts` — 覆盖映射、新契约注册/不注册、旧契约不再 skip。

---

## Task 1: subtype→EntityType 映射纯函数

**Files:**
- Modify: `api/src/modules/meeting-notes/runs/persistClaudeWiki.ts`（加导出函数）
- Test: `api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`（本 task 建文件，只放映射测试）

**Interfaces:**
- Consumes: `EntityType`（`content-library/types.ts`，`import type`）。
- Produces: `export function entityTypeForSubtype(subtype: string): EntityType | null`。

- [ ] **Step 1: 写失败测试** `api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { entityTypeForSubtype } from '../../../src/modules/meeting-notes/runs/persistClaudeWiki.js';

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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`
Expected: FAIL（`entityTypeForSubtype` 未导出）

- [ ] **Step 3: 实现**

在 `persistClaudeWiki.ts` 顶部 import（与现有 import 并列）：

```typescript
import type { EntityType } from '../../content-library/types.js';
```

在文件靠上位置（`ENTITY_SUBTYPES` 常量附近）新增导出：

```typescript
/**
 * wiki subtype → 全局 content_entities.EntityType。
 * 仅 person/org/product/event/location 是全局实体；project(=scope) 与概念类返回 null=不注册。
 */
export function entityTypeForSubtype(subtype: string): EntityType | null {
  switch (subtype) {
    case 'person': return 'person';
    case 'org': return 'organization';
    case 'product': return 'product';
    case 'event': return 'event';
    case 'location': return 'location';
    default: return null;
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`
Expected: PASS（2 tests）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/runs/persistClaudeWiki.ts \
        api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts
git commit -m "feat(meeting-notes): entityTypeForSubtype 映射（project/概念→null）(P3b-1)"
```

---

## Task 2: 新契约写页时 best-effort 注册实体

**Files:**
- Modify: `api/src/modules/meeting-notes/runs/persistClaudeWiki.ts`（`handleNewEntityUpdate` 加 `deps` + 注册；主体传 `deps`）
- Test: 扩 `api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `entityTypeForSubtype`；`EntityResolver`（`content-library/consolidation/entityResolver.js`）；`MeetingNotesDeps`。
- Produces: `handleNewEntityUpdate` 新签名 `(deps: MeetingNotesDeps, wikiRoot, upd, meetingId, blockId, now)`。

- [ ] **Step 1: 写失败测试**（追加到测试文件）

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistClaudeWiki } from '../../../src/modules/meeting-notes/runs/persistClaudeWiki.js';

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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`
Expected: FAIL（新契约尚未注册 → 无 INSERT content_entities）

- [ ] **Step 3: 实现**

在 `persistClaudeWiki.ts` 顶部 import：

```typescript
import { EntityResolver } from '../../content-library/consolidation/entityResolver.js';
```

改 `handleNewEntityUpdate` 签名，把 `deps: MeetingNotesDeps` 作为**第一个**形参：

```typescript
async function handleNewEntityUpdate(
  deps: MeetingNotesDeps,
  wikiRoot: string,
  upd: {
    type: 'entity' | 'concept';
    subtype: string;
    canonicalName: string;
    aliases?: string[];
    initialContent?: string;
    blockContent: string;
  },
  meetingId: string,
  blockId: string,
  now: string,
): Promise<'created' | 'updated' | 'skipped'> {
```

在该函数体内、subtype 校验通过之后、`resolveEntityPath(...)` 之前，插入 best-effort 注册：

```typescript
  // P3b: 实体类 subtype 顺带注册到全局 content_entities（best-effort，失败不影响写页）
  const entityType = entityTypeForSubtype(upd.subtype);
  if (entityType) {
    try {
      const resolver = new EntityResolver(deps.db, deps.embedding);
      await resolver.resolveAndRegister({
        canonicalName: upd.canonicalName,
        aliases: upd.aliases ?? [],
        entityType,
        metadata: {},
      });
    } catch (err) {
      console.warn(`[persistClaudeWiki] content_entities 注册失败(降级不影响写页): ${upd.canonicalName}`, err);
    }
  }
```

更新 `handleNewEntityUpdate` 的调用点（`persistClaudeWiki` 主体内，Explore 报告在 ~line 180-192），把 `deps` 作为第一个实参传入：

```typescript
      const result = await handleNewEntityUpdate(deps, root, u as ..., meetingId, blockId, now);
```

> 实现者：Read `persistClaudeWiki.ts` 确认 `handleNewEntityUpdate` 的**唯一调用点**并同步改实参顺序；确认 `persistClaudeWiki` 主体作用域内 `deps`、`root`、`meetingId` 变量名。若有多处调用一并改。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`
Expected: PASS（Task1 的 2 + 本 task 的 3）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/runs/persistClaudeWiki.ts \
        api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts
git commit -m "feat(meeting-notes): 新契约写 wiki 页时 best-effort 注册实体 (P3b-2)"
```

---

## Task 3: 旧契约未命中改为注册后继续（不再放弃写页）

**Files:**
- Modify: `api/src/modules/meeting-notes/runs/persistClaudeWiki.ts`（`handleLegacyEntityUpdate`）
- Test: 扩 `api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`

**Interfaces:**
- Consumes: `EntityResolver`、`entityTypeForSubtype`（旧契约无 subtype，注册用 `entityType='concept'` 兜底）。
- Produces: `handleLegacyEntityUpdate` 未命中不再 `return false`；改为 best-effort 注册后继续原有文件流程。

- [ ] **Step 1: 写失败测试**（追加）

```typescript
describe('persistClaudeWiki · 旧契约未命中不再放弃', () => {
  it('content_entities 未命中 → best-effort 注册（不因未命中直接 return false）', async () => {
    const { deps, calls } = makeDeps(); // SELECT 返回 [] = 未命中；INSERT 成功
    const root = await mkdtemp(join(tmpdir(), 'p3b-legacy-'));
    await persistClaudeWiki(deps, 'm1', {
      entityUpdates: [{ entityName: '未注册公司', appendMarkdown: '## 追加内容' }],
    }, root);
    // 关键断言：未命中时发生了注册（INSERT content_entities），而非直接跳过
    expect(calls.some(c => /INSERT INTO content_entities/i.test(c.sql))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd api && npx vitest run tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`
Expected: FAIL（旧契约当前未命中直接 `return false`，无 INSERT）

- [ ] **Step 3: 实现**

在 `handleLegacyEntityUpdate` 里，把原本的 content_entities 命中检查块——

```typescript
  // a) content_entities 命中
  let exists = false;
  try {
    const r = await deps.db.query(
      `SELECT id FROM content_entities WHERE canonical_name = $1 OR name = $1 LIMIT 1`,
      [trimmedName],
    );
    exists = (r.rows?.length ?? 0) > 0;
  } catch (e: any) {
    console.warn('[persistClaudeWiki/legacy] content_entities check failed:', e?.message);
    return false;
  }
  if (!exists) return false;  // ← 删除这条「未命中放弃」
```

——改为「未命中则 best-effort 注册后继续」：

```typescript
  // a) content_entities：未命中不再放弃，改 best-effort 注册后继续（P3b）
  let exists = false;
  try {
    const r = await deps.db.query(
      `SELECT id FROM content_entities WHERE canonical_name = $1 OR name = $1 LIMIT 1`,
      [trimmedName],
    );
    exists = (r.rows?.length ?? 0) > 0;
  } catch (e: any) {
    console.warn('[persistClaudeWiki/legacy] content_entities check failed:', e?.message);
    exists = false;
  }
  if (!exists) {
    try {
      const resolver = new EntityResolver(deps.db, deps.embedding);
      await resolver.resolveAndRegister({
        canonicalName: trimmedName,
        aliases: [],
        entityType: 'concept', // 旧契约无 subtype，用中性 concept 兜底
        metadata: {},
      });
    } catch (err) {
      console.warn('[persistClaudeWiki/legacy] 注册失败(继续写页):', trimmedName, err);
    }
  }
```

> 实现者：保留后续 `b) 文件存在检查` 与 `c) 追加 block` 原逻辑不动。本改动只把「content_entities 未命中→return false」换成「注册后继续」。文件不存在时仍 `return false`（那是「无页可追加」，与 content_entities 无关）。

- [ ] **Step 4: 运行确认通过**

Run: `cd api && npx vitest run tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts`
Expected: PASS（全部）。`npx tsc --noEmit` exit 0。

- [ ] **Step 5: Commit**

```bash
git add api/src/modules/meeting-notes/runs/persistClaudeWiki.ts \
        api/tests/unit/meeting-notes/persist-claude-wiki-entity.test.ts
git commit -m "fix(meeting-notes): 旧契约 content_entities 未命中改注册后继续 (P3b-3)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** 对应总 spec §5 P3 的「org/product 等类走 resolver + 修 persistClaudeWiki」子块。**明确偏离**：spec 原列 project 为 5 类之一，但代码事实（project=`mn_scopes`，非 content_entities，EntityType 无 'project'）令本计划收敛为 person(已做)/org/product/event/location。此偏离在 Global Constraints 记录，供执行期复核；若确需 project 成为全局实体，另起改 EntityType union 的计划。content_entities 通用合并函数 = P3c（另出计划）。

**类型一致：** `entityTypeForSubtype(subtype): EntityType|null` Task1 定义、Task2/3 引用一致；`handleNewEntityUpdate` 新签名首参 `deps` Task2 内自洽并同步调用点；`resolveAndRegister({canonicalName,aliases,entityType,metadata:{}})` 三处一致，`metadata` 必填已带 `{}`。

**Placeholder 扫描：** 无 TBD；每个 code step 给全代码。两处「实现者：Read 确认调用点/变量名」是校验指令（`handleNewEntityUpdate` 调用点位置与 `handleLegacyEntityUpdate` 后续块需对齐现有代码），非占位。

**已知边界（明确记录）：**
1. **注册质量依赖 P3a 的真 embedding**：本计划只保证 org/product/event/location 被写入 content_entities；同名归并的模糊能力仍取决于生产是否配了真 embedding provider（见 P3a）。exact+alias 归并始终有效。
2. **概念 subtype / project 保持 wiki-only**：不进 content_entities，是本计划刻意的 YAGNI 边界。
3. **旧契约兜底 entityType='concept'**：legacy `entityName` 无 subtype，用中性 concept；若日后 legacy 契约弃用可整体移除该分支。
4. **测试用 mkdtemp 临时目录**：不写真 `data/content-wiki/`；实现者须确保测试后无残留（可选 rm，但 tmp 目录系统会回收）。
