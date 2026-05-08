---
name: meeting-notes-upload
description: This skill should be used when the user wants to upload a meeting recording, transcript, or notes file to the pipeline system, asks to "submit meeting notes", "upload meeting transcript", "process meeting file", "send meeting recording to the system", "上传会议记录", "提交会议纪要", or mentions uploading to the meeting notes API. Also activate when the user wants to configure the meeting notes upload settings or reset the skill config. Supports default analysis mode `api-oneshot` and two-stage webhook (uploaded → analysis.completed).
version: 1.3.0
---

# Meeting Notes Upload Skill

Upload meeting transcripts or notes to the content pipeline. Processing happens in **two stages**, each notified via a webhook (Feishu bot card or generic HTTP):

1. **Stage 1 — `meeting_notes.uploaded`**：上传完成 + 分析任务排队成功（飞书卡片标题「📋 会议纪要已上传」）。
2. **Stage 2 — `meeting_notes.analysis.completed`**：分析 run 跑完（飞书卡片标题「🧠 会议分析已完成」，含报告链接）。

---

## Step 0 — Config Check (always run first)

Before doing anything else, check whether the config file exists:

```
.claude/skills/meeting-notes-upload/config.json
```

### If config does NOT exist

**已为你预设以下默认值，无需重复输入：**
- `baseUrl`: `http://paper.morning.rocks`
- `apiKey`: `dev-api-key`
- `callbackUrl`: `https://open.feishu.cn/open-apis/bot/v2/hook/31410ee3-1f9d-4d3e-847a-a9bcfa003dd8`（飞书机器人）

只问以下可选项（用户可全部回车跳过，全部走默认）：

> 已为你预设默认 baseUrl / apiKey / 飞书 webhook。如需自定义其他参数，请回复以下内容（可空）：
>
> 1. **Workspace ID**（可选）— 目标工作区 UUID，多租户场景下使用
> 2. **默认 User ID**（可选）— 用于审计追踪的用户标识（如员工号、邮箱）
> 3. **默认 Scope Kind**（可选）— 业务场景分类，留空默认 `meeting`，可填 `project` / `client` / `topic` / `meeting`
> 4. **固定 Source ID**（可选）— 高级用法：指定已有上传来源 UUID，留空由系统自动选择

写入文件（用 `null` 表示"未设置"）：

```json
{
  "baseUrl": "http://paper.morning.rocks",
  "apiKey": "dev-api-key",
  "callbackUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/31410ee3-1f9d-4d3e-847a-a9bcfa003dd8",
  "callbackSecret": null,
  "workspaceId": null,
  "defaultUserId": null,
  "defaultScopeKind": "meeting",
  "sourceId": null,
  "defaultMode": "api-oneshot",
  "defaultPreset": "standard"
}
```

Save to: `.claude/skills/meeting-notes-upload/config.json`

Confirm to the user: "配置已保存，后续上传将走 paper.morning.rocks + 飞书机器人通知。如需修改，回复 '重置配置'。"

### If config EXISTS

Read the file and use its values silently. No need to show the config to the user unless they ask.

To reset config, the user can say "重置配置" or "reset meeting notes config" — delete the file and re-run Step 0.

---

## Step 1 — Collect Upload Parameters

Ask the user (if not already provided in their message):

- **文件路径**（必填）— 本地 `.txt`、`.md` 或 `.docx` 文件的绝对路径
- **scopeId**（可选）— 关联业务对象的 UUID；如需生成，运行 `uuidgen | tr '[:upper:]' '[:lower:]'`
- **scopeKind**（可选）— 若与 config 中 `defaultScopeKind` 不同才需要询问，否则直接用 config 值
- **mode**（可选）— 仅在用户明确要求 `multi-axis` / `claude-cli` 时询问；默认走 config 的 `defaultMode`（即 `api-oneshot`）

---

## Step 2 — Build & Run the curl Command

Construct the command from config + parameters:

```bash
curl -s -X POST "<baseUrl>/api/v1/meeting-notes/sources/upload-task" \
  -H "X-API-Key: <apiKey>" \
  -F "file=@<filePath>" \
  -F "userId=<defaultUserId>"          `# omit if null` \
  -F "scopeKind=<defaultScopeKind>"    `# omit if null` \
  -F "scopeId=<scopeId>"               `# omit if not provided` \
  -F "workspaceId=<workspaceId>"       `# omit if null` \
  -F "sourceId=<sourceId>"             `# omit if null` \
  -F "callbackUrl=<callbackUrl>"       `# omit if null` \
  -F "callbackSecret=<callbackSecret>" `# omit if null or Feishu webhook` \
  -F "mode=<defaultMode>"              `# omit if matches server default api-oneshot` \
  -F "preset=<defaultPreset>"          `# omit if matches server default standard`
```

**Rules:**
- Omit any `-F` field whose value is null or empty
- `mode` / `preset` 默认服务端就是 `api-oneshot` / `standard`，与 config 一致时可直接省略，减少噪音
- `scopeId` 和 `workspaceId` 必须是合法 UUID v1–v5；非法格式时用 `uuidgen` 重新生成并告知用户
- 不要手动设置 `Content-Type`，curl `-F` 会自动处理

Run the command with Bash and capture the full JSON response.

---

## Step 3 — Interpret and Report the Response

### Success (HTTP 202)

Show the user a concise summary（在飞书 Openclaw 里要短，因为机器人会另外推卡片）：

```
✅ 上传成功
- 状态: succeeded
- 导入: <itemsImported> 条 (重复跳过: <duplicates> 条)
- Asset ID: <assetIds[0]>
- Run ID: <runs[0].id>  (mode=<runs[0].mode>, state=queued)
- 耗时: <finishedAt - startedAt>
- 飞书机器人会先发"📋 会议纪要已上传"，分析跑完（约 30-90 秒）后再发"🧠 会议分析已完成"
```

If `duplicates > 0` and `itemsImported === 0`: inform the user this file was already imported previously (identical content). No action needed.

If `runs` is empty 数组（`autoParse=false` 时）：仅会有上传通知，不会有分析通知。

### Errors

| HTTP | Message | Action |
|------|---------|--------|
| 401 | Authentication required | Ask user to verify API key; offer to update config |
| 400 invalid scopeId / workspaceId | UUID format error | Regenerate with `uuidgen` and retry |
| 400 invalid mode / preset | mode/preset 值不在白名单 | 用 `api-oneshot` / `standard` 重试，或检查用户输入 |
| 400 invalid expertRoles | expertRoles JSON 解析失败 | 检查格式应为 `{"people":["uuid"],"projects":["uuid"]}` |
| 400 no file | File field missing | Check file path exists |
| 415 | multipart/form-data required | Never set Content-Type header manually |
| 500 | Internal server error | Show full response; suggest retrying |

> 失败路径下飞书机器人**不会**自动发卡片，所以 skill 的回退文案要明显，让飞书用户能一眼看到错误。

---

## Webhook Behavior

### Feishu Bot (`https://open.feishu.cn/open-apis/bot/...`)

The server auto-detects Feishu webhook URLs and sends **two interactive cards** for `upload-task`：

**Card 1 — 上传完成：**
- Title: `📋 会议纪要已上传`
- Header color: 🔵 blue（成功）/ 🟠 orange（部分错误）/ 🔴 red（失败）
- Body: 来源 / 状态 / 导入条数 / 已排队的分析 run 数 / 耗时 / 用户 / 关联
- 无按钮（此时报告还没准备好）

**Card 2 — 分析完成（约 30-90 秒后）：**
- Title: `🧠 会议分析已完成`（成功）/ `❌ 会议分析失败`（失败）
- Header color: 🟢 green（成功）/ 🔴 red（失败）
- Body 顶部：摘要 + 决议 + 待办（前 3 条）
- Body 底部：Run ID / 模式 / 耗时 / Tokens
- 按钮：「查看会议纪要报告」→ 7 天有效的 sharedUrl（仅成功时出现）

No `callbackSecret` is needed for Feishu webhooks（飞书自有签名机制）。

### Generic HTTP Endpoint

标准 JSON 回调，两个事件名：
- `meeting_notes.uploaded` — Stage 1，含 `assets[i].runId`
- `meeting_notes.analysis.completed` — Stage 2，含 `report.sharedUrl` + `run.summary`

支持 `callbackSecret` 做 HMAC-SHA256 签名校验（`X-CP-Signature` header）。

详细回调体见 `api/docs/meeting-notes-external-api.md` §5。

---

## Config File Reference

Location: `.claude/skills/meeting-notes-upload/config.json`

```json
{
  "baseUrl": "http://paper.morning.rocks",
  "apiKey": "dev-api-key",
  "callbackUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/31410ee3-1f9d-4d3e-847a-a9bcfa003dd8",
  "callbackSecret": null,
  "workspaceId": null,
  "defaultUserId": null,
  "defaultScopeKind": "meeting",
  "sourceId": null,
  "defaultMode": "api-oneshot",
  "defaultPreset": "standard"
}
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `baseUrl` | 是 | 默认 `http://paper.morning.rocks` |
| `apiKey` | 是 | 默认 `dev-api-key`；生产环境需替换为 `ADMIN_API_KEY` |
| `callbackUrl` | 否 | 默认飞书机器人 URL；自动走卡片格式 |
| `callbackSecret` | 否 | 非飞书 Webhook 的 HMAC 签名 secret；飞书无需此项 |
| `workspaceId` | 否 | 多租户场景下的目标工作区 UUID |
| `defaultUserId` | 否 | 审计用用户标识（员工号、邮箱等） |
| `defaultScopeKind` | 否 | 默认业务场景分类，缺省 `meeting` |
| `sourceId` | 否 | 固定上传来源 UUID；留 `null` 由系统自动选择或创建 |
| `defaultMode` | 否 | 默认分析模式；推荐 `api-oneshot`（一次 LLM 调用出 16 轴 JSON，速度快） |
| `defaultPreset` | 否 | 默认 `standard`；`lite` 更快、`max` 更深 |

To update a single field, read the file, modify the value, and write it back.
