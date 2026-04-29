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

**累计**：10 个 router 完整数据隔离 + 2 个深度服务/引擎过滤，跨 ws 访问一律 404。
- production / assets / meeting-note-sources / rss / hot-topics / meeting-notes 模块（P1.0）
- archive / favorites / v34-assets / research（P1.1，2026-04-29 增量）
- mn-runs / mn-schedules engine list 与写入；recommendation 服务 4 个表的 SELECT 按 ws 过滤（P1.2，深度改造）

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

### ✅ P1 深度改造已完成（2026-04-29）

| 项 | Commit | 范围 |
|---|---|---|
| **mn_runs / mn_schedules** | `b6929f3` | runEngine.list/enqueue 接受 workspaceId; router /runs /schedules GET+POST 全部按 ws 过滤/写入 |
| **recommendation deep refactor** | `150d832` | RecommendationRequest 透传 workspaceId; rss_items / tasks / assets 与 identifyKnowledgeGaps 全部按 ws 过滤; expert 推荐保持全局 (blue_team_reviews 无 workspace_id) |

### 🟡 P1 剩下

#### 1. routes/sentiment.ts（**先补认证**）
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

## ✅ Phase 3 已完成（2026-04-29）

| 项 | Commit | 状态 |
|---|---|---|
| **18. mustChangePassword UI** | `534760b` | ChangePasswordGate 全屏遮罩, RequireAuth 接入 ✅ |
| **16. workspace 删除保护** | `07f7240` | default 不可删 (409); 非空 ws 拒绝并列出 counts ✅ |
| **19+21. 审计日志 + 登录失败锁定** | `ae42391` | migration 036 + audit service; login/logout/password.{change,reset}/user.{create,disable}/workspace.delete 全审计; 15min 内 5 次失败锁 30min (423 + Retry-After) ✅ |
| **20. OAuth2 Google** | `da47ec1` | PKCE 流程 + find-or-create user_identities; env-gated 优雅 501; 前端按 /auth/oauth/status 动态激活按钮; setup 文档完整 ✅ |

## ✅ Phase 3 残留收尾（2026-04-29）

### 14. PostgreSQL Row-Level Security ✅ **生效中**（2026-04-29）
- migration 039 ✅: 51 张 P0 表 ENABLE + FORCE RLS, ws_isolation policy 默认放行 + SET 后限制 (current ws ∪ is_shared ws)
- helper `withWorkspaceTx` ✅: BEGIN + SET LOCAL + COMMIT 模式, UUID 校验防注入
- 角色切换 ✅: `pipeline_app` (rolsuper=false rolbypassrls=false) 已建好, pg_hba.conf 已加条目, api 已切到此用户连接
- 真实生效验证 ✅: 关掉 default is_shared + SET 不存在 ws → tasks count 从 24 → 0; 还原 is_shared 后 → 24
- `setupAuthSchema` 在表已存在时静默跳过 CREATE (避免 pipeline_app 触发 "permission denied for schema public" 警告)

### 17. workspace_id DROP DEFAULT
- migration 037 ✅: 32 张子表加 BEFORE INSERT trigger 从父表 (assets/mn_scopes/tasks/meeting_note_sources) 派生 workspace_id
- migration 038 ✅: 同 32 张子表 DROP DEFAULT
- 51 → 19 张表保留 DEFAULT (独立表 + 5 张孤儿如 mn_judgments)
- 烟雾测试: INSERT draft_versions 不传 workspace_id → trigger 从 task_id 派生 ✅
- 业务回归: production/assets/hot-topics/meetings/runs 5 个端点 200 ✅

## 🟢 Phase 3 仍**有意延后**

### 15. 清理 X-API-Key fallback（**已具备开关，硬删除延后**）
代码里已有 `AUTH_DISABLE_API_KEY=true` env 开关；想要严格只 cookie 时设这个即可。硬删除代码路径会断掉外部 cron / CI 脚本（如 RSS 抓取触发）。

**触发条件**：所有 cron/CI 都走 cookie session 之后再删代码。

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
