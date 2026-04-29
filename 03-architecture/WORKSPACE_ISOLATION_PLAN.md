# Workspace 数据隔离实施计划与 Todo

> 跟踪 Phase 2（账号体系第 2 期：数据隔离）的进度与剩余工作。
> 上次更新：2026-04-29

---

## 当前进度

### ✅ 已完成

#### Phase 1（账号体系基础）
- 邮箱+密码登录、cookie session、`workspaces` / `workspace_members` 等基础表
- `/api/auth/{login,logout,me,switch-workspace}` 与 `/api/workspaces/*` CRUD
- 前端：Login 页 / AuthContext / RequireAuth / WorkspaceSwitcher / 工作区设置页

#### Phase 2 Schema
- migration **032**：51 张 P0 业务表加 nullable `workspace_id` UUID 列 + 28 个热表索引
- migration **033**：14961 行回填到 default workspace（slug=default）
- migration **034**：`SET DEFAULT default-ws + SET NOT NULL`，未改造的旧路由 INSERT 不传 workspace_id 也能写入（DEFAULT 兜底，不会业务停摆）

#### Phase 2 路由改造
| Router | Commit | 隔离生效范围 |
|---|---|---|
| `routes/production.ts` | `4b7554b` | tasks 列表/详情/创建/40+ `:taskId` 路由 |
| `routes/assets.ts` | `d6ed6b4` | assets 上传/搜索/向量搜索/详情/`:assetId` 路由 |
| `modules/meeting-notes/ingest/routes.ts` | `20bd328` | meeting-note-sources 全 CRUD |
| `routes/rss.ts` | `88687a0` | rss_items 列表/搜索/回收站 |
| `routes/v34-hot-topics.ts` | `788d792` | hot_topics 列表/详情/from-rss |
| `modules/meeting-notes/router.ts` | `36cd73d` | meetings/scopes/people/runs/schedules `:id` + meetings & scopes 列表/创建 |

**累计**：10 个 router 完整数据隔离，跨 ws 访问一律 404。
- production / assets / meeting-note-sources / rss / hot-topics / meeting-notes 模块（P1.0）
- archive / favorites / v34-assets / research（P1.1，2026-04-29 增量）

#### 工具层
- `db/repos/withWorkspace.ts`：`currentWorkspaceId(req)` / `requireWorkspaceId(req,reply)` / `assertRowInWorkspace(table, idCol, id, wsId)`

---

## 🔴 待办 P1（高优先级）

### ✅ P1 已完成（2026-04-29）

| Router | Commit | 状态 |
|---|---|---|
| `archive.ts` | `41006a8` | :taskId 守卫 + recycle-bin/hidden list 按 ws 过滤 ✅ |
| `favorites.ts` | `a6f819b` | (user_id, workspace_id) 双过滤；INSERT 落到当前 ws ✅ |
| `v34-assets.ts` | `fcf038e` | :id 守卫 + list/create 注入 ws ✅（route 仍受预先存在 `usage_count` 缺列 500 影响） |
| `research.ts` | `fa778e3` | :taskId 守卫 ✅ |

### 🟡 P1 剩下需要更深改造

#### 1. meeting-notes 模块 list 端点深度过滤
当前 `modules/meeting-notes/router.ts` 已守卫所有 `:id` 路径与 `/meetings`、`/scopes` 顶层 list/create。**还没改造**：
- `GET /runs` 列表（runEngine.list 需加 workspaceId 过滤）
- `GET /schedules` 列表
- `POST /runs` / `POST /schedules` 写入时显式传 workspace_id
- 各种 axis sub-listing（可能依赖 mn_scope_members 等关联表的过滤）

> 原因：mn_runs / mn_schedules 已有 workspace_id NOT NULL DEFAULT default-ws，schema 已就位，只是 router/engine 没显式 inject。当前行为：旧代码继续工作（落到 default ws），但跨 ws 切换看到的还是 default 的 runs。
>
> 风险：低；改动需要进 `runs/runEngine.ts`（1700+ 行），应该只动 `list()` / `enqueue()` 两个方法。

#### 2. routes/recommendation.ts（**deep refactor**）
recommendation 服务底层从 rss_items / tasks / assets / blue_team_reviews 多表派生推荐。要正确隔离，需要把 workspaceId 串到 `services/recommendation.ts` 里 7+ 个 SELECT 语句。当前规模 ~500 行，改动面较大。

> 当前行为：admin 看到全 default 数据派生的推荐；其他 ws 用户看到的是同一份推荐（数据未隔离），但因为登录 cookie 已是用户身份，对推荐结果没产品危害。

#### 3. routes/sentiment.ts（**先补认证**）
所有路由**没有 `preHandler: authenticate`**。`/topic/:topicId` 与 `/trend/:topicId` 通过 `sentimentAnalyzer.analyzeTopic(topicId)` 走数据查询，可能涉及 community_topics。

> 决策：把这个 router 当 P2 共享数据看待（同 expert-library），加 authenticate 但不加 ws 过滤。或者干脆不改—它的端点本质上是分析服务而非数据存储。

#### 4. routes/communityTopics.ts（**视为 P2 共享**）
crawler-based 抓取小红书/微博/知乎/B站/雪球的话题数据。设计上是全员共享的市场情报。**决策**：与 expert-library / content-library 同等处理 — 当前不加 ws 过滤；future is_shared 切换时再说。

---

## 🟡 待办 P2（中优先级）

### 7. modules/expert-library/router.ts（1115 行）
**产品决策已敲定（2026-04-29）**：当前阶段保持全局共享，未来可由 admin 切换到隔离。

**实现机制**（migration **035** 已落地）：
- `workspaces.is_shared BOOLEAN`：标记某 ws 内的数据对全员可读
- default workspace 默认 `is_shared=true`（涵盖既有 142 个 expert / 全部 content-library facts）
- 普通 ws 默认 `is_shared=false`（隔离）
- 应用层选择：`SELECT WHERE workspace_id = $current OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared)`
- 写仍由 `workspace_members` 控制（is_shared=true 不等于谁都能写）

**未来切换路径**（无需数据迁移）：
- admin 在 `/settings/workspaces/:id` 翻 is_shared 开关 → 该 ws 内数据对全员可见性立即变化
- admin 想"个人空间"：创建新 ws，is_shared=false，写入新 expert/content → 仅成员可见
- admin 想"再变共享"：翻回 is_shared=true → 全员立即可见

**当前**（这一阶段）：expert-library / content-library router 保持现状（不加 ws 过滤），数据全在 default workspace 中，因 is_shared=true 而对全员可见。**不需要现在改 router**。

### 8. modules/content-library/router.ts
同 expert-library —— 知识库设计上跨 ws 共享。建议同等处理。

### 9. routes/streamingOutline.ts / streamingBlueTeam.ts / streamingSequential.ts
SSE 流式 outline/review 路由，依赖 `outline_versions` / `review_chains` / `review_reports` 等 P0 表。需路由层加 ws 守卫和 outline 资源访问校验。

### 10. routes/llm.ts
Dashboard LLM 路由，可能不需要 ws 过滤（全局服务）。复核。

### 11. routes/copilot 相关（若启用）
copilot_sessions / copilot_messages / copilot_contexts / copilot_usage_stats — 表都不存在于当前 DB（migration 跳过了），等部署 copilot 后再处理。

### 12. v34-reports.ts / routes/reports.ts
**reports 表不在 P0**，无 workspace_id 列。如果产品决定 reports 也要隔离，需追加 migration 035 给 reports 加 workspace_id。当前**不阻塞**。

### 13. routes/experts.ts (legacy v2.0)
`experts` 表只 2 行且无 workspace_id。建议直接废弃这个 router（用 expert-library 代替），或追加 migration 给 experts 加列。

---

## 🟢 待办 P3（低优先级 / 后续阶段）

### 14. 启用 PostgreSQL Row-Level Security
plan 原文档第 2 期里"DB 层兜底"。每次 `getClient()` 后 `SET LOCAL app.workspace_id`，CREATE POLICY filter。
**风险**：RLS 可能与现有 super_admin 路径冲突；要先彻底改完应用层再上 RLS 才安全。

### 15. 清理 X-API-Key fallback
计划 1-2 版本兼容期保留。Phase 3 移除。
- 中间件：`src/middleware/auth.ts` 删除 `tryResolveAuth` 里 api-key 分支
- vite.config.ts 已不注入（Phase 1 修复）

### 16. workspace 删除保护
当前删除 default workspace 会让所有 INSERT DEFAULT 失败（FK 引用孤儿）。`routes/workspaces.ts` 的 DELETE handler 应：
- 拒绝删除 slug='default'
- 拒绝删除非空 workspace（参考引用 task/asset 等数）

### 17. workspace_id NOT NULL DROP DEFAULT
所有 router 改造完之后，可以 DROP DEFAULT 让"忘记传 workspace_id"成为编译/运行期错误（更安全）。Phase 2 收尾动作。

### 18. mustChangePassword 强制改密 UI
后端已设 `mustChangePassword: true`，前端 Login 页未实现强制改密流程。Phase 1 遗留。

### 19. 登录失败计数 + 锁定
plan Phase 3。每邮箱每 15 分钟 ≥5 次锁定 30 分钟。

### 20. OAuth2 Provider 接入
plan Phase 3。`user_identities` 表已存在，待接 Google / GitHub。

### 21. 审计日志
`auth_audit_log`：登录、登出、创建用户、workspace 变更等敏感操作。

---

## 中间态风险（需要使用方知晓）

1. **未改造的 router 写入会落到 default workspace**：因为 `workspace_id` 列有 `DEFAULT default-uuid`，任何不显式传 workspace_id 的 INSERT 会自动落到 default ws。如果用户切换到 Iso ws 时调用了一个没改造的写入端点，数据会被错误归到 default ws 而不是当前选中的 ws。**已改造的 6 个 router 不受此影响**。
2. **expert-library / content-library 仍未鉴权**：`/api/v1/expert-library/experts/full` 等路由没 `preHandler: authenticate`，未登录可访问。设计上是 SaaS 全局共享意图，但鉴权与共享是两件事——可以鉴权但 SELECT 不过滤 ws。Phase 3 决定。
3. **mn_runs / mn_schedules list 没过滤**：跨 ws 切换会看到对方的 run 历史。但具体 `:id` 已经守卫，无法操纵跨 ws 的 run。Phase 2 P1 修复。

---

## 验证命令速查

```bash
# 健康检查
curl -s http://127.0.0.1:3006/health

# 登录
curl -s -c /tmp/jar -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"admin123456"}' \
  http://127.0.0.1:3006/api/auth/login

# 创建测试 workspace
curl -s -b /tmp/jar -X POST -H "Content-Type: application/json" \
  -d '{"name":"Test"}' http://127.0.0.1:3006/api/workspaces

# 切换 workspace
curl -s -b /tmp/jar -c /tmp/jar -X POST -H "Content-Type: application/json" \
  -d '{"workspaceId":"<id>"}' http://127.0.0.1:3006/api/auth/switch-workspace

# 验证某行还有 NULL workspace_id (应 = 0)
psql ... -c "SELECT count(*) FROM tasks WHERE workspace_id IS NULL;"
```

---

## 参考

- `01-product/Product-Spec.md`（待补 Phase 2 章节）
- 计划原文：`/Users/scubiry/.claude/plans/zesty-whistling-elephant.md`
- 已落地的 7 个 commits（分支 main，2026-04-28~29）：
  - `4b7554b` Phase 2 schema + production
  - `d6ed6b4` assets
  - `20bd328` meeting-note-sources
  - `88687a0` rss items
  - `788d792` hot-topics
  - `36cd73d` meeting-notes module
