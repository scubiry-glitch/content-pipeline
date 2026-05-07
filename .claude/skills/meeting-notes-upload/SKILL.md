---
name: meeting-notes-upload
description: This skill should be used when the user wants to upload a meeting recording, transcript, or notes file to the pipeline system, asks to "submit meeting notes", "upload meeting transcript", "process meeting file", "send meeting recording to the system", "上传会议记录", "提交会议纪要", or mentions uploading to the meeting notes API. Also activate when the user wants to configure the meeting notes upload settings or reset the skill config.
version: 1.2.0
---

# Meeting Notes Upload Skill

Upload meeting transcripts or notes to the content pipeline. Processing results are pushed to a configured webhook (supports Feishu bot and generic HTTP endpoints).

---

## Step 0 — Config Check (always run first)

Before doing anything else, check whether the config file exists:

```
.claude/skills/meeting-notes-upload/config.json
```

### If config does NOT exist

Ask the user for the following in a single prompt:

> 首次使用会议纪要上传服务，请提供以下配置（直接回复即可，留空跳过可选项）：
>
> 1. **API Key**（必填）— 服务鉴权密钥
> 2. **Webhook 地址**（可选）— 任务完成后接收通知，支持飞书机器人（`https://open.feishu.cn/...`）或其他 HTTP 端点
> 3. **Webhook Secret**（可选）— 仅限非飞书 Webhook；用于 HMAC-SHA256 回调签名验证，飞书机器人无需填写
> 4. **Workspace ID**（可选）— 目标工作区 UUID，多租户场景下使用
> 5. **默认 User ID**（可选）— 用于审计追踪的用户标识（如员工号、邮箱）
> 6. **默认 Scope Kind**（可选）— 业务场景分类，留空默认 `meeting`，可填 `project` / `client` / `topic` / `meeting`
> 7. **固定 Source ID**（可选）— 高级用法：指定已有上传来源 UUID，留空由系统自动选择

After the user replies, write the config file. Use `null` for any field the user left blank:

```json
{
  "baseUrl": "http://paper.morning.rocks",
  "apiKey": "<user-provided>",
  "callbackUrl": "<user-provided or null>",
  "callbackSecret": "<user-provided or null>",
  "workspaceId": "<user-provided or null>",
  "defaultUserId": "<user-provided or null>",
  "defaultScopeKind": "<user-provided or 'meeting'>",
  "sourceId": "<user-provided or null>"
}
```

Save to: `.claude/skills/meeting-notes-upload/config.json`

Confirm to the user: "配置已保存，后续上传将自动使用以上设置。"

### If config EXISTS

Read the file and use its values silently. No need to show the config to the user unless they ask.

To reset config, the user can say "重置配置" or "reset meeting notes config" — delete the file and re-run Step 0.

---

## Step 1 — Collect Upload Parameters

Ask the user (if not already provided in their message):

- **文件路径**（必填）— 本地 `.txt`、`.md` 或 `.docx` 文件的绝对路径
- **scopeId**（可选）— 关联业务对象的 UUID；如需生成，运行 `uuidgen | tr '[:upper:]' '[:lower:]'`
- **scopeKind**（可选）— 若与 config 中 `defaultScopeKind` 不同才需要询问，否则直接用 config 值

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
  -F "callbackSecret=<callbackSecret>" `# omit if null or Feishu webhook`
```

**Rules:**
- Omit any `-F` field whose value is null or empty
- `scopeId` and `workspaceId` must be valid UUID v1–v5. If the user provides an invalid format, generate one with `uuidgen` and inform them
- Do NOT manually set `Content-Type` — curl sets it automatically with `-F`

Run the command with Bash and capture the full JSON response.

---

## Step 3 — Interpret and Report the Response

### Success (HTTP 202)

Show the user a concise summary:

```
✅ 上传成功
- 状态: succeeded
- 导入: <itemsImported> 条  (重复跳过: <duplicates> 条)
- Asset ID: <assetIds[0]>
- 耗时: <finishedAt - startedAt>
- Webhook: <callbackUrl 已配置 → 异步推送中 | 未配置>
```

If `duplicates > 0` and `itemsImported === 0`: inform the user this file was already imported previously (identical content). No action needed.

If `callbackUrl` was sent: explain that the webhook will fire shortly with the report link (`sharedUrl`).

### Errors

| HTTP | Message | Action |
|------|---------|--------|
| 401 | Authentication required | Ask user to verify API key; offer to update config |
| 400 invalid scopeId / workspaceId | UUID format error | Regenerate with `uuidgen` and retry |
| 400 no file | File field missing | Check file path exists |
| 415 | multipart/form-data required | Never set Content-Type header manually |
| 500 | Internal server error | Show full response; suggest retrying |

---

## Webhook Behavior

### Feishu Bot (`https://open.feishu.cn/open-apis/bot/...`)

The server auto-detects Feishu webhook URLs and sends an **interactive message card**:

- Header color: 🔵 blue (success) / 🔴 red (failure)
- Body: source name, import count, duplicates, duration, user/scope info
- Button: "查看会议纪要报告" → links to the 7-day `sharedUrl`

No `callbackSecret` is needed for Feishu webhooks.

### Generic HTTP Endpoint

Standard JSON callback (see API docs). Supports `callbackSecret` for HMAC-SHA256 signature verification via `X-CP-Signature` header.

---

## Config File Reference

Location: `.claude/skills/meeting-notes-upload/config.json`

```json
{
  "baseUrl": "http://paper.morning.rocks",
  "apiKey": "dev-api-key",
  "callbackUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/...",
  "callbackSecret": null,
  "workspaceId": null,
  "defaultUserId": null,
  "defaultScopeKind": "meeting",
  "sourceId": null
}
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `baseUrl` | 是 | 固定为 `http://paper.morning.rocks` |
| `apiKey` | 是 | 服务鉴权密钥 |
| `callbackUrl` | 否 | Webhook 通知地址；飞书机器人 URL 自动走卡片格式 |
| `callbackSecret` | 否 | 非飞书 Webhook 的 HMAC 签名 secret；飞书无需此项 |
| `workspaceId` | 否 | 多租户场景下的目标工作区 UUID |
| `defaultUserId` | 否 | 审计用用户标识（员工号、邮箱等） |
| `defaultScopeKind` | 否 | 默认业务场景分类，缺省 `meeting` |
| `sourceId` | 否 | 固定上传来源 UUID；留 `null` 由系统自动选择或创建 |

To update a single field, read the file, modify the value, and write it back.
