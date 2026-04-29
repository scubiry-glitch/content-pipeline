# Workspace 隔离工程总结

> 配套 `WORKSPACE_ISOLATION_PLAN.md`（实施过程的逐项追踪）。本文是最终的回顾、技术债清单、TODO 与下一步建议。
>
> 最后更新：2026-04-29

---

## 一、做了什么

```
30+ commits / 10 migrations (031-040) / 4 phases 落地
```

| 阶段 | 范围 | 关键交付 |
|---|---|---|
| **Phase 1** 账号基础 | 计划第 1 期 | cookie session + bcrypt + workspaces CRUD + Login/AuthContext/RequireAuth/WorkspaceSwitcher |
| **Phase 2** 数据隔离 | 计划第 2 期 | 51 张 P0 表加 `workspace_id` + 14961 行回填 + 13 个 router + 2 个深度服务隔离 |
| **Phase 3** 安全治理 | 计划第 3 期 | OAuth Google PKCE + 审计日志 + 5/15→30min 锁定 + RLS + super_admin 后台 |
| **Phase 3.5/4** 巩固 | 计划之外 | trigger 派生 + DROP DEFAULT + smart refresh + 多触发点续期 + 共享 ws 兜底 |

### 当前 DB 状态

```
workspace_id 列:        52 张表 (workspace_members + 51 业务表)
RLS-enabled:            51 张 (ENABLE + FORCE 模式)
trigger 派生 (037+040): 36 个 BEFORE INSERT
保留 DEFAULT:           15 张顶层独立表 (兜底防漏写)
pipeline_app 角色:      已生效 (rolsuper=false rolbypassrls=false)
auth_audit_log:         记录登录/登出/改密/创建/禁用/ws 删除等 8 类事件
```

### 三层防御架构

```
┌──────────────────────────────────────────────────────────────┐
│  应用层显式过滤 (Primary)                                      │
│  13 个 router + 2 个深度服务都按 currentWorkspaceId() filter  │
│  read 路径 union "is_shared workspaces" 兜底                  │
├──────────────────────────────────────────────────────────────┤
│  DB Trigger 派生 (Defense-in-depth Layer 1)                  │
│  36 个 BEFORE INSERT trigger 自动从父表派生 workspace_id     │
│  漏传时填充而不是 NULL → 防 NOT NULL 报错的同时不静默落 default│
├──────────────────────────────────────────────────────────────┤
│  PostgreSQL RLS (Defense-in-depth Layer 2)                   │
│  pipeline_app 非 SUPERUSER 连接, FORCE 模式                  │
│  policy: app.workspace_id 未 SET 时放行, SET 后强制隔离      │
│  当前 opt-in 状态 (无 router 用 withWorkspaceTx),             │
│  策略已就位等触发                                             │
└──────────────────────────────────────────────────────────────┘
```

任意一层失守其他兜底，代价是写代码要 mind 多个一致点。

---

## 二、技术债清单

### 🔴 P0 — 隐性脆弱（架构性）

#### 1. 15 张顶层表保留 DEFAULT
**列表**：tasks / assets / hot_topics / rss_items / mn_runs / mn_scopes / mn_schedules / unified_topics / community_topics / meeting_note_sources / expert_profiles / favorite_reports / compliance_logs / rss_sources / user_hot_topic_follows

**原因**：50+ 处 INSERT 站点散落在 langgraph / agents / services / 后台 job / 种子脚本里，无 request 上下文，没法显式传 ws。当前 `is_shared=true` 兜底掩盖了影响。

**风险**：开发者新加无 ws 的 INSERT 静默落 default 而不报错。

**触发修复条件**：所有 INSERT 站点显式传 ws 后才能 DROP。

#### 2. expert-library / content-library 全局共享硬编码
路由不带 `preHandler: authenticate`，多数 query 不过滤 ws。要切"per-workspace 隔离"需重写 router + 写入路径，~15-20 commits 量级。

#### 3. `withWorkspaceTx` 写了没人用
RLS 是"opt-in"模式（policy 默认放行）。要让 RLS "强制隔离"需要把所有 SELECT 路径切到 `withWorkspaceTx`。

### 🟠 P1 — 已知 bug 但不阻塞

#### 4. 9 张未部署 P0 表
`copilot_sessions / copilot_messages / copilot_contexts / copilot_usage_stats / draft_annotations / draft_change_logs / draft_chat_sessions / content_predictions / scheduled_publishes`

migration 032 用 `IF EXISTS` 跳过；功能上线时必须先补 `workspace_id` migration。

#### 5. 预先存在的 schema 漂移
`assets.usage_count` / `assets.source_url` 列缺失（migration 001 部分没跑），导致：
- `/api/v1/quality/assets` → 500
- `/api/v1/recommendations?type=material` → 500

与 ws 工程无关但污染了回归测试基线。

#### 6. X-API-Key fallback 代码还在
env `AUTH_DISABLE_API_KEY=true` 可关，但代码路径未删。**风险**：环境变量误改 / 部署用错配置 → fallback 突然激活 → 任何持有 ADMIN_API_KEY 的人 = super admin。

### 🟡 P2 — 缺自动化保障

#### 7. 零单元/集成测试
13 个路由 + 6 期改动全靠手工 `curl` 烟雾。每次合并都靠人工记忆"该测哪些 ws 隔离场景"。

#### 8. 没有"漏档监控"
trigger 派生失败、有人手工 INSERT 漏传、孤儿表数据流向，目前无任何报警。

#### 9. mn_runs 队列 in-memory
多实例部署会重复执行。和 ws 隔离无关，是会议生成功能的真正瓶颈。

### 🟢 P3 — UX/治理可改善

10. **审计日志无限增长**：18 行现在无所谓，半年后可能 10万+。加 90 天保留 cron。
11. **临时密码靠 admin 手动发送**：邮箱邀请链接 + 自助设密更体面。
12. **没有 workspace 转让 / 用户退出**：当前 owner 退出 ws = 数据无主。
13. **没有 rate limiting**（除了 5/15min 登录锁定）：API 整体没限流。
14. **没有 business audit trail**：知道谁登录但不知道谁删了 task / 改了 expert。

---

## 三、显性 TODO（plan 标记的）

1. **P1 全局表**（taxonomy_*/ai_*/compliance_rules）的"共享"语义正式确认
2. **9 张未部署 P0 表**：上线时补 workspace_id
3. **X-API-Key 代码硬删除**：等所有 cron / CI 切 cookie
4. **15 张顶层表 DROP DEFAULT**：等所有 INSERT 站点显式传 ws
5. **`withWorkspaceTx` 全面接入**：RLS 真正强制隔离

---

## 四、下一步值得做的（按 ROI）

### 🔥 立刻（一晚就能搞）

#### A. 自动化隔离测试
13 个路由 + trigger + RLS + smart refresh 已经复杂到记忆负担很重。

```ts
// vitest + setupTwoWsFixture() helper
// 每个路由 4 个测试:
//   1. list 隔离: ws=A 用户看不到 ws=B 数据
//   2. 跨 ws GET 404: ws=A 用户访问 ws=B 实体
//   3. 写入归属: ws=A 创建数据 workspace_id=A
//   4. shared 兜底: is_shared 工作区数据全员可见
```

工作量：1 晚搭框架，单测试用例 ~20 行。维护成本极低。

#### B. NULL workspace_id 守卫 cron
每天扫一次：
```sql
SELECT table_name, count(*) FROM (
  -- 51 张表 UNION ALL 各自 NULL 行数
) WHERE n > 0;
```
有结果就告警。trigger / DEFAULT 失效都能第一时间发现。

工作量：半天，写一个 service + node-cron schedule。

### 🌿 中期（1-2 周）

#### C. 邀请流程
admin 在 UI 输邮箱 → 后端发 magic link（含 token，1 小时有效）→ 用户点链接 → 自助设密 → 自动加入指定 ws + 角色。比"admin 发临时密码"体面，也减少 admin 工作量。

#### D. expert-library / content-library `is_shared` 灰度切换
- admin UI 加开关（默认关 = 全局共享，打开 = per-ws 隔离）
- 打开后 SELECT/INSERT 自动按 ws 过滤
- 配合现有 `is_shared` 设计，提供可逆的灰度路径

#### E. 审计日志归档 cron
90 天前的 `auth_audit_log` 移到 `auth_audit_log_archive`（或直接删）。

### 🌳 长期（按需）

- **F. business audit trail**：扩 `auth_audit_log` 为 `audit_log`，trigger 记录所有 mutation
- **G. mn_runs 队列改 BullMQ**：多实例 + 容灾重试
- **H. 邮件验证 + 找回密码**：原计划不在范围，扩展外部用户时必须做
- **I. RLS 强制隔离模式**：所有 SELECT 切 `withWorkspaceTx`，DROP DEFAULT 全表，RLS 接管。架构终极清洁版本，代价大

---

## 五、关键设计决策回顾

### 为什么用 trigger 派生而不是改全部 INSERT
- 50+ INSERT 站点散落，逐个改成本高
- trigger 是 declarative 的，零代码改动得到全覆盖
- 32 张子表 + 4 张孤儿表加起来 36 个 trigger，全部从父表派生

### 为什么 RLS 用"默认放行 + opt-in 强制"模式而不是直接强制
- pg.Pool 连接复用：`SET app.workspace_id` 会跨用户泄漏
- 需要先把所有路径切到 `withWorkspaceTx`（每请求 BEGIN/SET LOCAL/COMMIT）才能强制
- 当前 opt-in 状态：策略已部署，等基础设施成熟时翻开开关

### 为什么 `currentWorkspaceId` 区分 api-key 与 session-no-ws
- api-key 是 admin 全局视图凭证（cron / CI / 直连 curl）→ 应该跳过 ws 过滤看全部
- session 用户没加入任何 ws 是异常态（admin 刚创建，未分配）→ 不应"晋升"为全局视图
- 用 `NO_WORKSPACE_SENTINEL = '00000000-...'` impossible UUID 让 SQL 过滤为空

### 为什么 smart refresh 加 7d 阈值
- pg.Pool + bcrypt 12 round + 30 天 TTL = 频繁 UPDATE 是热点
- visibility/focus/1h 多触发点本来想给"用户感知"，但每次都 UPDATE 浪费
- 阈值：剩余 > 7d 不写 DB 只更 last_seen，剩余 ≤ 7d 才推后到 30d
- 节流：5min 内多触发只发一次，避免 visibility+focus 同时触发刷屏

### 为什么 mn_people 选 first_seen_meeting_id 而不是保留 DEFAULT
- 选项 A（保留 DEFAULT）：人物全局唯一，admin 的"人物词典"，所有用户共享
- 选项 B（first_seen_meeting_id）：同一姓名在两个 ws 是两条记录，per-ws 隔离
- 用户选 B 的语义更清晰：跨用户内容不该有任何形式的合并

---

## 六、一句话总结

> **三层防御**让 ws 隔离在每一层都有兜底，**应用层显式过滤** 是主防线，**DB trigger** 防漏写，**RLS** 是终极闸门。
>
> **最值得做的下一步**：自动化测试（1 晚） > 漏档监控 cron（半天） > 邀请流程（2 天）。
