# e2e: Meeting Notes · Upload → Parse → Four Axes

端到端手工 e2e 验证清单 —— 在本地跑完 DB migrations 与 API 后按步骤执行。

## 前置条件

1. 启动 Postgres + pgvector
2. 跑所有 meeting-notes migrations（按顺序）：
   ```
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/001-scope-and-memberships.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/002-people-axis.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/003-projects-axis.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/004-knowledge-axis.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/005-meta-axis.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/006-runs-and-versions.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/007-longitudinal.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/008-cross-axis-links.sql
   psql $DATABASE_URL < api/src/modules/meeting-notes/migrations/009-migrate-existing.sql
   ```
3. `pnpm --filter @content-pipeline/api dev`（嵌入模式）或独立模式：
   ```ts
   // tsx api/src/modules/meeting-notes/standalone.ts
   const s = await createStandalone({ port: 8787, dbConnectionString: process.env.DATABASE_URL!,
     llm: { provider: 'claude', apiKey: process.env.CLAUDE_API_KEY! } });
   await s.start();
   ```

## 步骤

### 1. 上传会议
```
# 创建采集源（kind=manual）
curl -X POST http://localhost:3000/api/v1/meeting-notes/sources \
  -H 'X-API-Key: dev-api-key' -H 'Content-Type: application/json' \
  -d '{"name":"e2e 手动","kind":"manual","config":{}}'
# → { id: "source-123", ... }

# 上传 .docx / .txt
curl -X POST http://localhost:3000/api/v1/meeting-notes/sources/source-123/upload \
  -H 'X-API-Key: dev-api-key' \
  -F 'file=@sample-meeting.docx'
# → { itemsImported: 1, assetIds: ["m-xxx"], ... }
```

**预期**：`assets` 表多一行 `asset_type='meeting_minutes'`，metadata.meeting_kind 被 classifier 自动识别。

### 2. 单会议 parse + 四轴
```
curl -X POST http://localhost:3000/api/v1/meeting-notes/ingest/parse \
  -H 'X-API-Key: dev-api-key' -H 'Content-Type: application/json' \
  -d '{"assetId":"m-xxx"}'
# → { ok: true, participantCount: N }
```

**预期**：`mn_people` 按参会人列表 upsert；`mn.meeting.parsed` 事件发布。

### 3. 触发 axis=all run
```
curl -X POST http://localhost:3000/api/v1/meeting-notes/runs \
  -H 'X-API-Key: dev-api-key' -H 'Content-Type: application/json' \
  -d '{"scope":{"kind":"meeting","id":"m-xxx"},"axis":"all","preset":"standard"}'
# → { ok: true, runId: "r-yyy" }
```

**预期**：
- `mn_runs` 一条 queued → running → succeeded
- 16 个 axis 表各有新行
- `mn_axis_versions` 一条 v1 snapshot
- `mn_cross_axis_links` 按规则产出若干行
- `mn.run.completed` 事件触发 longitudinal 重算（若有 project scope 绑定）

### 4. 四轴读取
```
curl http://localhost:3000/api/v1/meeting-notes/meetings/m-xxx/axes \
  -H 'X-API-Key: dev-api-key'
```

**预期**：返回 `{ people: { commitments:[], ... }, projects: {...}, knowledge: {...}, meta: {...} }` 四轴聚合。

### 5. 三变体详情
```
curl 'http://localhost:3000/api/v1/meeting-notes/meetings/m-xxx/detail?view=A' -H 'X-API-Key: dev-api-key'
curl 'http://localhost:3000/api/v1/meeting-notes/meetings/m-xxx/detail?view=B' -H 'X-API-Key: dev-api-key'
curl 'http://localhost:3000/api/v1/meeting-notes/meetings/m-xxx/detail?view=C' -H 'X-API-Key: dev-api-key'
```

**预期**：三个响应共享同一份底层数据，结构不同：
- A: `{ sections: [{ id, title, body }] }`
- B: `{ left, center, right }`
- C: `{ nodes, threads, influence }`

### 6. Project 自动增量
```
# 先创建 project scope
curl -X POST http://localhost:3000/api/v1/meeting-notes/scopes \
  -d '{"kind":"project","slug":"e2e-proj","name":"E2E 项目"}' \
  -H 'Content-Type: application/json' -H 'X-API-Key: dev-api-key'
# → { id: "s-proj-xxx" }

# 绑定 meeting
curl -X POST http://localhost:3000/api/v1/meeting-notes/scopes/s-proj-xxx/bindings \
  -d '{"meetingId":"m-xxx"}' -H 'Content-Type: application/json' -H 'X-API-Key: dev-api-key'

# 再上传一份新会议到同一 project（重复步骤 1-2 但 bind 到 s-proj-xxx）
# 观察 scheduler 是否自动入队 project scope 的 run
curl http://localhost:3000/api/v1/meeting-notes/runs?scopeKind=project&scopeId=s-proj-xxx -H 'X-API-Key: dev-api-key'
```

**预期**：scheduler 订阅 `mn.meeting.parsed` → 3 秒内自动 enqueue project scope 的 axis=all run。

### 7. Library 手动重算
```
curl -X POST http://localhost:3000/api/v1/meeting-notes/runs \
  -d '{"scope":{"kind":"library"},"axis":"all","preset":"standard"}' \
  -H 'Content-Type: application/json' -H 'X-API-Key: dev-api-key'
```

**预期**：不自动触发，只在手动 POST 时入队；成功后更新 library-level longitudinal。

### 8. 跨轴链接
```
curl 'http://localhost:3000/api/v1/meeting-notes/crosslinks?axis=people&itemId=<person_id>' \
  -H 'X-API-Key: dev-api-key'
```

**预期**：返回指向 projects/knowledge 的若干条链接。

### 9. Longitudinal
```
curl http://localhost:3000/api/v1/meeting-notes/scopes/s-proj-xxx/longitudinal/belief_drift \
  -H 'X-API-Key: dev-api-key'
curl http://localhost:3000/api/v1/meeting-notes/scopes/s-proj-xxx/longitudinal/decision_tree \
  -H 'X-API-Key: dev-api-key'
curl http://localhost:3000/api/v1/meeting-notes/scopes/s-proj-xxx/longitudinal/model_hit_rate \
  -H 'X-API-Key: dev-api-key'
```

**预期**：三类跨会议分析均有非空结果（belief_drift points 数组；decision_tree nodes 数组；model_hit_rate 含 flag 列）。

### 10. 前端
访问 `http://localhost:5173/meeting-notes` —— 主壳可见；点四轴任一 → 可见抽取的数据；生成中心可见运行历史。

---

## 失败排查

- 若 `POST /runs` 返回 200 但无新行：检查 `mn_runs.state = 'failed'` 并读 `error_message`；常见是 LLM adapter 未配置。
- 若 axis 返回空：确认 asset.content 非空 + expertApplication.shouldSkipExpertAnalysis(meetingKind) 非 true（internal_ops 会跳过）。
- 若 cross_axis_links 空：确认 scope 绑定已建立且 commitments/decisions 至少有若干行。

## 自动化 CI（未来）

上述每一步都可以 testcontainers + pgvector + 固定 LLM mock 回放实现 e2e 自动测试。
当前 PR 只提供手工清单，自动化留待后续 PR。
