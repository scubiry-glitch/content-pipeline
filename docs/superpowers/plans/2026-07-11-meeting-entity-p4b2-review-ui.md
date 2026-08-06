# P4b-2 会议实体统一 · 复核 React UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 webapp（React18+Vite）给 P4b-1 的复核 API 配两个页面：`/meeting/review/merges`（实体合并候选：审批/拒绝，person 行禁用审批）与 `/meeting/review/unresolved`（未解析人名：标记已解决），加对应 api client 方法与导航入口。

**Architecture:** 镜像现有 `pages/admin/AdminAudit.tsx` 的「列表 + 行内动作 + confirm/alert」模式（内联样式、`useState`/`useEffect`/`loadX`/`onAction` 后 reload）。数据经 `webapp/src/api/meetingNotes.ts` 的 `meetingNotesApi`（`jget`/`jpost`，错误对象带 `.code`/`.status`）。页面放 `src/prototype/meeting/`，路由挂 `/meeting/*` 子路由，导航加进 `MeetingShell` 的 `NAV` 数组。

**Tech Stack:** React 18 · TypeScript · Vite · react-router-dom 6 · 内联样式（无 UI 库依赖）。**webapp 无测试基建**（无 vitest/RTL）→ 验收 = `cd webapp && npx tsc -b` 通过 + 代码评审对照 AdminAudit 模式；人工目测留最后。

## Global Constraints

- **无前端单测**：每个 task 的验证 = `cd webapp && npx tsc -b` exit 0（类型检查兜住 api 形状/props 错误）。不写 `*.test.tsx`（无 runner）。评审对照 AdminAudit 模式 + api 契约。
- **后端返回 camelCase**：P4b-1 服务层已映射——候选行字段 `id/targetEntityId/sourceEntityId/entityType/similarity/status/createdAt/targetName/sourceName`；未解析行 `id/meetingId/rawName/normalizedName/occurrences/status/createdAt`。前端类型照此，**不要**写 snake_case。
- **API 路径（P4b-1 已实现）**：`GET /entity-merge-candidates?status=&limit=`、`POST /entity-merge-candidates/:id/approve`、`POST /entity-merge-candidates/:id/reject`、`GET /unresolved-mentions?status=&limit=`、`POST /unresolved-mentions/:id/resolve`。均挂 `/api/v1/meeting-notes`（`meetingNotesApi` 的 `API_BASE` 已是此前缀）。三个 POST **无 body**（`jpost(path)` 不传第二参 → 只发 X-API-Key，符合 Fastify 空 body 规则）。
- **person 候选禁审批**：`entityType==='person'` 的行，审批按钮禁用（disabled + 标注「人工 people merge」）；即便点了，后端返回 422 `code:'PERSON_MERGE_MANUAL'`，前端 catch `e.code` 弹提示、不崩。
- **只审批 pending**：非 `pending` 状态的行审批/拒绝按钮禁用（已审批/已拒绝不可再操作）。
- **镜像 AdminAudit**：内联样式常量（`tableStyle/th/td/smallBtn`）风格照抄；loading/空态/错误 alert 一致。用 `confirm()` 二次确认破坏性动作（审批=合并不可逆）。
- ESM/TS：pages 用命名导出 `export function XxxReview()`；import 路径 `../../api/meetingNotes`（从 `prototype/meeting/` 到 `api/`）。
- 一 task 一 commit，message 结尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

- **Modify** `webapp/src/api/meetingNotes.ts` — `meetingNotesApi` 加 5 方法 + 导出 2 个行类型。
- **Create** `webapp/src/prototype/meeting/EntityMergeReview.tsx` — 合并候选复核页。
- **Create** `webapp/src/prototype/meeting/UnresolvedReview.tsx` — 未解析人名复核页。
- **Modify** `webapp/src/App.tsx` — import 两页 + `/meeting` 下加 2 子路由。
- **Modify** `webapp/src/prototype/meeting/MeetingShell.tsx` — `NAV` 数组加 2 导航项。

---

## Task 1: api client 方法 + 类型

**Files:**
- Modify: `webapp/src/api/meetingNotes.ts`

**Interfaces:**
- Produces（导出到 `meetingNotesApi` 与命名类型）：
  - `export interface MergeCandidate { id; targetEntityId; sourceEntityId; entityType; similarity: number; status: string; createdAt: string; targetName: string|null; sourceName: string|null }`
  - `export interface UnresolvedMention { id; meetingId: string|null; rawName; normalizedName; occurrences: number; status: string; createdAt: string }`
  - `meetingNotesApi.listMergeCandidates(q?: {status?: string; limit?: number}): Promise<{items: MergeCandidate[]}>`
  - `meetingNotesApi.approveMergeCandidate(id: string): Promise<{ok: boolean; entityType: string; affected: any[]}>`
  - `meetingNotesApi.rejectMergeCandidate(id: string): Promise<{ok: boolean}>`
  - `meetingNotesApi.listUnresolvedMentions(q?: {status?: string; limit?: number}): Promise<{items: UnresolvedMention[]}>`
  - `meetingNotesApi.resolveUnresolvedMention(id: string): Promise<{ok: boolean}>`

- [ ] **Step 1: 加类型 + 方法**

在 `webapp/src/api/meetingNotes.ts` 里，`export const meetingNotesApi = {` 之前加两个导出接口：

```typescript
export interface MergeCandidate {
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
export interface UnresolvedMention {
  id: string;
  meetingId: string | null;
  rawName: string;
  normalizedName: string;
  occurrences: number;
  status: string;
  createdAt: string;
}
```

在 `meetingNotesApi` 对象里（任意现有方法之间，逗号分隔）加 5 个方法：

```typescript
  // ===== P4b 复核 =====
  listMergeCandidates: (q: { status?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') acc[k] = String(v);
        return acc;
      }, {}),
    ).toString();
    return jget<{ items: MergeCandidate[] }>(`/entity-merge-candidates${qs ? '?' + qs : ''}`);
  },
  approveMergeCandidate: (id: string) =>
    jpost<{ ok: boolean; entityType: string; affected: any[] }>(`/entity-merge-candidates/${id}/approve`),
  rejectMergeCandidate: (id: string) =>
    jpost<{ ok: boolean }>(`/entity-merge-candidates/${id}/reject`),
  listUnresolvedMentions: (q: { status?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') acc[k] = String(v);
        return acc;
      }, {}),
    ).toString();
    return jget<{ items: UnresolvedMention[] }>(`/unresolved-mentions${qs ? '?' + qs : ''}`);
  },
  resolveUnresolvedMention: (id: string) =>
    jpost<{ ok: boolean }>(`/unresolved-mentions/${id}/resolve`),
```

> 实现者：`jget`/`jpost` 已在文件顶部定义；三个 POST 不传 body（符合文件顶部注释的空 body 规则）。放进 `meetingNotesApi` 对象字面量内，注意保持逗号合法。

- [ ] **Step 2: 类型检查**

Run: `cd webapp && npx tsc -b`
Expected: exit 0（无类型错误）。

- [ ] **Step 3: Commit**

```bash
git add webapp/src/api/meetingNotes.ts
git commit -m "feat(webapp): meetingNotesApi 复核 5 方法 + 行类型 (P4b2-1)"
```

---

## Task 2: EntityMergeReview 合并候选复核页 + 路由 + 导航

**Files:**
- Create: `webapp/src/prototype/meeting/EntityMergeReview.tsx`
- Modify: `webapp/src/App.tsx`（import + 路由）
- Modify: `webapp/src/prototype/meeting/MeetingShell.tsx`（NAV 项）

**Interfaces:**
- Consumes: Task 1 的 `meetingNotesApi.listMergeCandidates/approveMergeCandidate/rejectMergeCandidate`、`MergeCandidate`。
- Produces: `export function EntityMergeReview()`。

- [ ] **Step 1: 写页面** `webapp/src/prototype/meeting/EntityMergeReview.tsx`

```typescript
import { useEffect, useState } from 'react';
import { meetingNotesApi, type MergeCandidate } from '../../api/meetingNotes';

const STATUS_FILTERS = [
  { value: 'pending', label: '待复核' },
  { value: 'approved', label: '已合并' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'all', label: '全部' },
];

export function EntityMergeReview() {
  const [items, setItems] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listMergeCandidates({ status, limit: 100 });
      setItems(r.items || []);
    } catch (e: any) {
      alert(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const onApprove = async (row: MergeCandidate) => {
    if (row.entityType === 'person') return; // person 禁审批
    if (!confirm(`合并「${row.sourceName ?? row.sourceEntityId}」→「${row.targetName ?? row.targetEntityId}」？此操作不可逆。`)) return;
    setBusyId(row.id);
    try {
      await meetingNotesApi.approveMergeCandidate(row.id);
      await load();
    } catch (e: any) {
      if (e?.code === 'PERSON_MERGE_MANUAL') alert('person 候选请人工经 people merge 处理');
      else alert(e?.message || '合并失败');
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (row: MergeCandidate) => {
    if (!confirm(`拒绝该合并候选？`)) return;
    setBusyId(row.id);
    try {
      await meetingNotesApi.rejectMergeCandidate(row.id);
      await load();
    } catch (e: any) {
      alert(e?.message || '拒绝失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>实体合并复核</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            向量相似的实体对；非 person 可一键合并（不可逆），person 需人工经 people merge。
          </p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
          {STATUS_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
        </select>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>无候选</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>目标（保留）</th>
                <th style={th}>来源（删除）</th>
                <th style={th}>类型</th>
                <th style={th}>相似度</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const isPerson = it.entityType === 'person';
                const canAct = it.status === 'pending' && busyId !== it.id;
                return (
                  <tr key={it.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={td}>{it.targetName ?? it.targetEntityId}</td>
                    <td style={td}>{it.sourceName ?? it.sourceEntityId}</td>
                    <td style={td}><span style={badge}>{it.entityType}</span></td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{(it.similarity * 100).toFixed(1)}%</td>
                    <td style={{ ...td, fontSize: 12, color: '#64748b' }}>{it.status}</td>
                    <td style={td}>
                      <button
                        onClick={() => onApprove(it)}
                        disabled={!canAct || isPerson}
                        title={isPerson ? 'person 需人工 people merge' : '合并（不可逆）'}
                        style={{ ...smallBtn, ...(!canAct || isPerson ? disabledBtn : approveBtn) }}>
                        合并
                      </button>
                      <button
                        onClick={() => onReject(it)}
                        disabled={!canAct}
                        style={{ ...smallBtn, marginLeft: 6, ...(!canAct ? disabledBtn : {}) }}>
                        拒绝
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0f172a' };
const smallBtn: React.CSSProperties = { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: '#f1f5f9', color: '#475569' };
const approveBtn: React.CSSProperties = { background: '#3b82f6', color: 'white', borderColor: '#3b82f6' };
const disabledBtn: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const badge: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: '#e0e7ff', color: '#3730a3' };
```

- [ ] **Step 2: 挂路由**（`webapp/src/App.tsx`）

顶部 import 区（与其它 `prototype/meeting` import 并列，约 line 79 后）加：

```typescript
import { EntityMergeReview } from './prototype/meeting/EntityMergeReview';
```

在 `<Route path="/meeting" element={<MeetingShell />}>` 块内（`axes/meta-legacy` 那行之前）加：

```typescript
              <Route path="review/merges" element={<EntityMergeReview />} />
```

- [ ] **Step 3: 加导航项**（`webapp/src/prototype/meeting/MeetingShell.tsx`）

在 `NAV` 数组（约 line 23-34）末尾加：

```typescript
  { to: '/meeting/review/merges',      label: '实体合并复核',  icon: 'git',      group: '复核' },
```

> 实现者：`icon` 复用现有值（如 `'git'`）避免图标缺失；`group` 用新值 `'复核'`（MeetingShell 按 group 分组渲染，新 group 会自动出现）。若 group 渲染需要预登记，改用现有 group 名（如 `'专家系统'`）。Read `MeetingShell.tsx` 的 group 渲染确认。

- [ ] **Step 4: 类型检查**

Run: `cd webapp && npx tsc -b`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add webapp/src/prototype/meeting/EntityMergeReview.tsx webapp/src/App.tsx webapp/src/prototype/meeting/MeetingShell.tsx
git commit -m "feat(webapp): 实体合并复核页 + 路由/导航（person 禁审批）(P4b2-2)"
```

---

## Task 3: UnresolvedReview 未解析人名复核页 + 路由 + 导航

**Files:**
- Create: `webapp/src/prototype/meeting/UnresolvedReview.tsx`
- Modify: `webapp/src/App.tsx`（import + 路由）
- Modify: `webapp/src/prototype/meeting/MeetingShell.tsx`（NAV 项）

**Interfaces:**
- Consumes: Task 1 的 `meetingNotesApi.listUnresolvedMentions/resolveUnresolvedMention`、`UnresolvedMention`。
- Produces: `export function UnresolvedReview()`。

- [ ] **Step 1: 写页面** `webapp/src/prototype/meeting/UnresolvedReview.tsx`

```typescript
import { useEffect, useState } from 'react';
import { meetingNotesApi, type UnresolvedMention } from '../../api/meetingNotes';

const STATUS_FILTERS = [
  { value: 'pending', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'all', label: '全部' },
];

export function UnresolvedReview() {
  const [items, setItems] = useState<UnresolvedMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listUnresolvedMentions({ status, limit: 200 });
      setItems(r.items || []);
    } catch (e: any) {
      alert(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const onResolve = async (row: UnresolvedMention) => {
    if (!confirm(`把「${row.rawName}」标记为已解决（移出待处理队列）？`)) return;
    setBusyId(row.id);
    try {
      await meetingNotesApi.resolveUnresolvedMention(row.id);
      await load();
    } catch (e: any) {
      alert(e?.message || '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>待认领人名</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            会议里没匹配到花名册的人名；确认处理后标记已解决、移出队列。
          </p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
          {STATUS_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
        </select>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>队列为空</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>原始名</th>
                <th style={th}>归一名</th>
                <th style={th}>出现次数</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const canAct = it.status === 'pending' && busyId !== it.id;
                return (
                  <tr key={it.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{it.rawName}</td>
                    <td style={{ ...td, color: '#64748b' }}>{it.normalizedName}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{it.occurrences}</td>
                    <td style={{ ...td, fontSize: 12, color: '#64748b' }}>{it.status}</td>
                    <td style={td}>
                      <button onClick={() => onResolve(it)} disabled={!canAct}
                        style={{ ...smallBtn, ...(!canAct ? disabledBtn : {}) }}>
                        标记已解决
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0f172a' };
const smallBtn: React.CSSProperties = { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: '#f1f5f9', color: '#475569' };
const disabledBtn: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
```

- [ ] **Step 2: 挂路由**（`webapp/src/App.tsx`）

import 区加：

```typescript
import { UnresolvedReview } from './prototype/meeting/UnresolvedReview';
```

`/meeting` 块内（`review/merges` 那行之后）加：

```typescript
              <Route path="review/unresolved" element={<UnresolvedReview />} />
```

- [ ] **Step 3: 加导航项**（`MeetingShell.tsx` 的 `NAV`，`review/merges` 项之后）

```typescript
  { to: '/meeting/review/unresolved',  label: '待认领人名',    icon: 'users',    group: '复核' },
```

- [ ] **Step 4: 类型检查 + 全量 build**

Run: `cd webapp && npx tsc -b`，Expected: exit 0。
再 Run: `cd webapp && npm run build`，Expected: 构建成功（`tsc -b && vite build` 全过）。

- [ ] **Step 5: Commit**

```bash
git add webapp/src/prototype/meeting/UnresolvedReview.tsx webapp/src/App.tsx webapp/src/prototype/meeting/MeetingShell.tsx
git commit -m "feat(webapp): 待认领人名复核页 + 路由/导航 (P4b2-3)"
```

---

## Self-Review（作者已核对）

**Spec 覆盖：** 对应总 spec §4.4(b) 人工复核 UI。至此 P4（自动合并 + 复核）后端与前端全覆盖。attach-到-person 的重跑仍是后续（本 UI 的「标记已解决」只移出队列，与 P4b-1 后端一致）。

**类型一致：** `MergeCandidate`/`UnresolvedMention` 字段与 P4b-1 服务层 camelCase 输出逐一对齐；5 个 api 方法签名 Task1 定义、Task2/3 页面一致引用；`e.code === 'PERSON_MERGE_MANUAL'` 与后端 422 body 一致。

**Placeholder 扫描：** 无 TBD；页面/api/路由/导航全量代码。三处「实现者：确认 group 渲染 / import 位置」是校验指令。

**已知边界（明确记录）：**
1. **无前端单测**：webapp 无 runner，验收靠 `tsc -b` + `npm run build` + 评审 + 人工目测。风险：视觉/交互问题类型检查兜不住——建议合并后 `npm run dev` 连本地后端目测一轮（需后端起 + DB）。
2. **person 行禁审批**：UI 层 disabled + 后端 422 双保险。
3. **「标记已解决」仅移出队列**：不含建新人/回链重跑，与后端一致，留后续。
4. **候选可能 CASCADE 消失**（P4a 已知）：刷新后自然不再出现，UI 无需特殊处理。
5. **导航 group 「复核」**：若 `MeetingShell` 的 group 渲染是硬编码顺序表，新 group 可能不显示——实现者 Read 确认，必要时并入现有 group。
