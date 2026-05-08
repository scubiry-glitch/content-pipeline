# Meeting Notes 外部上传 API 对接文档

适用场景：外部系统通过 API 上传会议文件，触发解析 + 16 轴分析，并通过两个回调依次收到「上传完成」和「分析完成」通知。

> **变更历史（2026-05-08）**
> - `upload-task` 默认会自动触发 16 轴分析 run（默认 `mode=api-oneshot`）。
> - Stage 1 webhook 事件名由 `meeting_notes.import.completed` 重命名为 `meeting_notes.uploaded`，飞书卡片标题改为「📋 会议纪要已上传」，附带 `assets[i].runId`。
> - 新增 Stage 2 webhook `meeting_notes.analysis.completed`（飞书标题「🧠 会议分析已完成」），分析 run 落库为 `succeeded` / `failed` 时推送，含 `sharedUrl` + 摘要。
> - 老接口 `POST /sources/:id/upload` **保持不变**：仍然只发送一条 `meeting_notes.import.completed`，不参与新两段式分析回调。

## 1. 鉴权与基础信息

- **可用 Base URL**（任选其一，API 路径均为 `/api/v1/...`）：
  - `http://paper.morning.rocks`
  - `https://note.meizu.life`
  - `http://localhost:5173`：本地开发；Web 前端 Vite 默认端口，已将 `/api` **代理**到后端（与 `webapp/vite.config.ts` 中 `proxy['/api']` 一致），可直接用 `http://localhost:5173/api/v1/...` 调接口（外网对接请用前两项域名）。
- 完整接口示例：`https://note.meizu.life/api/v1/meeting-notes/sources/upload-task`（将域名换成上表任一即可；本地则为 `http://localhost:5173/api/v1/meeting-notes/sources/upload-task`）
- 服务端生成回调里的 `sharedUrl` 时，依赖环境变量 `PUBLIC_API_BASE_URL`（或 `API_BASE_URL` / `PUBLIC_BASE_URL`）指向**当前对外可访问的 API 根**（线上建议与 `paper.morning.rocks` / `note.meizu.life` 一致；本地可设为 `http://localhost:5173` 或实际 API 地址），否则分享链接可能不完整。
- **鉴权头（明文，与请求头一致即可）**  
  - 服务端**未**设置 `ADMIN_API_KEY` 时（代码兜底，见 `api/src/middleware/auth.ts`）：`X-API-Key: dev-api-key-change-in-production`  
  - 若服务端 `.env` 已配置 `ADMIN_API_KEY=dev-api-key`，则必须使用：`X-API-Key: dev-api-key`  
  - 生产环境一般由运维单独下发密钥，以实际 `ADMIN_API_KEY` 为准；若 `401`，请核对环境与上两项是否一致。
- Content-Type：`multipart/form-data`（上传文件接口）
- 所有时间为 ISO8601（UTC）

## 2. 一键上传任务（推荐）

### 2.1 创建上传任务

- 方法：`POST /api/v1/meeting-notes/sources/upload-task`
- 鉴权：必需（`X-API-Key`）
- 表单字段：

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `file` | 是 | — | 支持 `.md/.txt/.docx`（其他类型按 UTF-8 文本读） |
| `sourceId` | 否 | 自动 | 指定已有 source UUID |
| `workspaceId` | 否 | API Key 默认 ws | 多租户场景下指定目标工作区 UUID |
| `userId` | 否 | — | 业务侧用户 ID，用于审计 / 回调透传 |
| `scopeKind` | 否 | — | `project` / `client` / `topic` / `meeting` |
| `scopeId` | 否 | — | 业务 scope UUID |
| `callbackUrl` | 否 | — | 回调地址；推荐填飞书机器人 URL，自动走卡片格式 |
| `callbackSecret` | 否 | — | 非飞书场景用于 HMAC-SHA256 回调签名 |
| `autoParse` | 否 | `true` | true：上传成功后自动触发解析 + 分析 run；false：仅入库，不分析 |
| `mode` | 否 | `api-oneshot` | 分析模式：`api-oneshot` / `multi-axis` / `claude-cli` |
| `preset` | 否 | `standard` | `lite` / `standard` / `max` |
| `axis` | 否 | `all` | 分析轴；通常用 `all`（16 轴全量），高级用法可指定单轴 |
| `expertRoles` | 否 | — | JSON 字符串，如 `{"people":["uuid"],"projects":["uuid"]}`，可选 |

说明：
- 若未传 `sourceId`，系统会自动选择当前 workspace 的 `upload/manual` source；
- 若当前 workspace 无任何 source，系统会自动创建 `默认上传来源`（kind=`upload`）；
- `mode` / `preset` / `axis` / `expertRoles` 也可以通过 source.config.defaults 设置默认值，请求级参数优先。

#### cURL 示例

```bash
# 生产常用（HTTPS）
curl -X POST "https://note.meizu.life/api/v1/meeting-notes/sources/upload-task" \
  -H "X-API-Key: dev-api-key-change-in-production" \
  -F "file=@/path/to/meeting.docx" \
  -F "workspaceId=8f4d7e1b-8ff5-438a-b1d7-1efad8a6f8f9" \
  -F "userId=partner-user-10001" \
  -F "scopeKind=project" \
  -F "scopeId=0f9c6f17-7af0-4738-b90b-ec5538c314f2" \
  -F "callbackUrl=https://partner.example.com/webhooks/meeting-report" \
  -F "callbackSecret=your-shared-secret" \
  -F "autoParse=true" \
  -F "mode=api-oneshot" \
  -F "preset=standard"

# 备用入口（HTTP，最少参数）
curl -X POST "http://paper.morning.rocks/api/v1/meeting-notes/sources/upload-task" \
  -H "X-API-Key: dev-api-key-change-in-production" \
  -F "file=@/path/to/meeting.docx" \
  -F "callbackUrl=https://partner.example.com/webhooks/meeting-report"

# 本地开发（Vite :5173，/api 代理到后端）
curl -X POST "http://localhost:5173/api/v1/meeting-notes/sources/upload-task" \
  -H "X-API-Key: dev-api-key-change-in-production" \
  -F "file=@/path/to/meeting.docx"
```

#### 成功响应（202）

```json
{
  "sourceId": "0b82c02e-8e40-4b20-9117-7f16b7b6de50",
  "context": {
    "workspaceId": "8f4d7e1b-8ff5-438a-b1d7-1efad8a6f8f9",
    "userId": "partner-user-10001",
    "scopeKind": "project",
    "scopeId": "0f9c6f17-7af0-4738-b90b-ec5538c314f2"
  },
  "import": {
    "id": "0f9c6f17-7af0-4738-b90b-ec5538c314f2",
    "sourceId": "0b82c02e-8e40-4b20-9117-7f16b7b6de50",
    "status": "succeeded",
    "startedAt": "2026-05-07T03:01:02.123Z",
    "finishedAt": "2026-05-07T03:01:03.456Z",
    "itemsDiscovered": 1,
    "itemsImported": 1,
    "duplicates": 0,
    "errors": 0,
    "errorMessage": null,
    "assetIds": ["f66b09d2-eaf0-4422-b9b8-2f8185f7d0df"],
    "triggeredBy": "upload"
  },
  "runs": [
    {
      "id": "9b3c7f17-1234-5678-90ab-ec5538c314f2",
      "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df",
      "state": "queued",
      "mode": "api-oneshot"
    }
  ],
  "callback": {
    "sentAsync": true,
    "callbackUrl": "https://partner.example.com/webhooks/meeting-report"
  }
}
```

> 当 `autoParse=false` 时，`runs` 数组为空 `[]`，仅会推送 Stage 1 webhook，不会有 Stage 2。

## 3. 传统上传接口（兼容）

- 方法：`POST /api/v1/meeting-notes/sources/:id/upload`
- 鉴权：必需
- 表单字段：
  - `file`：必填
  - `callbackUrl`：可选
  - `callbackSecret`：可选
  - `autoParse`：可选，上传成功后是否自动触发会议纪要 **解析**（默认 `true`），**不会**自动触发 16 轴分析 run
- 回调：仅会发送一次 `meeting_notes.import.completed`（旧事件名 + 旧字段，回调体见 §5.4）。**不参与**新两段式分析回调。如需分析回调，请使用 `upload-task` 接口。

## 4. 定时回调（schedule + webhook）

当 source 配置了 `scheduleCron` 且 `config.callbackUrl` 时，系统每次定时导入成功/失败后都会触发 `meeting_notes.import.completed` 回调（与传统接口一致）。

source config 示例：

```json
{
  "callbackUrl": "https://partner.example.com/webhooks/meeting-report",
  "callbackSecret": "your-shared-secret",
  "defaults": {
    "mode": "api-oneshot",
    "preset": "standard"
  }
}
```

## 5. 回调协议

### 5.1 回调触发时机（`upload-task`）

| 时机 | 事件 | 说明 |
|------|------|------|
| 上传 + 入库完成（自动触发分析后立即推送） | `meeting_notes.uploaded` | 通知文件已上传，分析任务已排队，可记录 `runId` |
| 分析 run 结束（succeeded / failed） | `meeting_notes.analysis.completed` | 通知分析已完成，含 `sharedUrl` + `summary`；失败时 `state='failed'` + `errorMessage` |

`autoParse=false` 时不会推送 Stage 2。老接口 `:id/upload` 与定时任务仅推送 `meeting_notes.import.completed`。

### 5.2 请求 Header 通用

- 方法：`POST <callbackUrl>`
- Header：
  - `Content-Type: application/json`
  - `X-CP-Event: <event-name>`（飞书 webhook 不带）
  - `X-CP-Signature: sha256=<hex>`（仅当配置了 `callbackSecret` 且非飞书 webhook）

签名规则：
- `rawBody` = 回调 JSON 原文字符串
- `signature` = `HMAC_SHA256(callbackSecret, rawBody)` 的 hex

### 5.3 Stage 1 回调体：`meeting_notes.uploaded`

```json
{
  "event": "meeting_notes.uploaded",
  "at": "2026-05-07T03:01:03.567Z",
  "source": {
    "id": "0b82c02e-8e40-4b20-9117-7f16b7b6de50",
    "name": "默认上传来源"
  },
  "triggeredBy": "upload",
  "context": {
    "workspaceId": "8f4d7e1b-8ff5-438a-b1d7-1efad8a6f8f9",
    "userId": "partner-user-10001",
    "scopeKind": "project",
    "scopeId": "0f9c6f17-7af0-4738-b90b-ec5538c314f2"
  },
  "import": {
    "id": "0f9c6f17-7af0-4738-b90b-ec5538c314f2",
    "status": "succeeded",
    "itemsDiscovered": 1,
    "itemsImported": 1,
    "duplicates": 0,
    "errors": 0,
    "errorMessage": null,
    "assetIds": ["f66b09d2-eaf0-4422-b9b8-2f8185f7d0df"],
    "startedAt": "2026-05-07T03:01:02.123Z",
    "finishedAt": "2026-05-07T03:01:03.456Z"
  },
  "assets": [
    {
      "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df",
      "runId": "9b3c7f17-1234-5678-90ab-ec5538c314f2",
      "mode": "api-oneshot"
    }
  ]
}
```

> Stage 1 体内**不**带 `sharedUrl`（此时分析未完成、报告尚不可用）；`runId` 是 Stage 2 的去重键。

### 5.4 Stage 2 回调体：`meeting_notes.analysis.completed`

```json
{
  "event": "meeting_notes.analysis.completed",
  "at": "2026-05-07T03:02:31.892Z",
  "run": {
    "id": "9b3c7f17-1234-5678-90ab-ec5538c314f2",
    "state": "succeeded",
    "mode": "api-oneshot",
    "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df",
    "scope": { "kind": "meeting", "id": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df" },
    "startedAt": "2026-05-07T03:01:05.000Z",
    "finishedAt": "2026-05-07T03:02:31.000Z",
    "costMs": 86000,
    "costTokens": 6789,
    "errorMessage": null,
    "summary": {
      "tldr": "本次会议明确了下季度 OKR 优先级与责任人。",
      "decision": "聚焦 3 个核心 OKR，每月 review 一次。",
      "actionItems": [
        { "text": "PM 输出 OKR 责任矩阵", "owner": "Alice", "due": "2026-05-15" }
      ],
      "risks": ["数据源接入延迟可能影响 Key Result 度量"]
    }
  },
  "report": {
    "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df",
    "sharedUrl": "https://note.meizu.life/meeting/shared/06e4b9b0-bf68-4d92-8f4d-bc31ac8c426d"
  },
  "context": {
    "workspaceId": "8f4d7e1b-8ff5-438a-b1d7-1efad8a6f8f9",
    "userId": "partner-user-10001",
    "scopeKind": "project",
    "scopeId": "0f9c6f17-7af0-4738-b90b-ec5538c314f2"
  }
}
```

失败示例：

```json
{
  "event": "meeting_notes.analysis.completed",
  "at": "2026-05-07T03:02:00.000Z",
  "run": {
    "id": "9b3c7f17-1234-5678-90ab-ec5538c314f2",
    "state": "failed",
    "mode": "api-oneshot",
    "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df",
    "scope": { "kind": "meeting", "id": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df" },
    "startedAt": "2026-05-07T03:01:05.000Z",
    "finishedAt": "2026-05-07T03:02:00.000Z",
    "costMs": 55000,
    "costTokens": 1024,
    "errorMessage": "LLM JSON parse failed after 2 retries",
    "summary": null
  },
  "report": { "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df", "sharedUrl": null },
  "context": { ... }
}
```

说明：
- `report.sharedUrl` 为系统自动创建的 7 天有效公开分享链接；分享链接创建失败或 run 失败时为 `null`，但 `assetId` 仍可用于内部追踪。
- `run.summary` 来自 `assets.metadata.analysis.summary`；run 失败时为 `null`。

### 5.5 老接口回调体：`meeting_notes.import.completed`（仅 `:id/upload` + 定时任务）

```json
{
  "event": "meeting_notes.import.completed",
  "at": "2026-05-07T03:01:03.567Z",
  "source": { "id": "...", "name": "默认上传来源" },
  "triggeredBy": "upload",
  "context": { ... },
  "import": { ... 同 Stage 1 ... },
  "reports": [
    { "assetId": "f66b09d2-...", "sharedUrl": "https://.../meeting/shared/<token>" }
  ]
}
```

## 6. 错误码（常见）

- `400 Bad Request`：参数错误（如 `sourceId` 非 UUID、文件为空、`mode` / `preset` 不在白名单、`expertRoles` JSON 解析失败）
- `401 Unauthorized`：缺失/错误 API Key
- `404 Not Found`：source 不存在
- `415 Unsupported Media Type`：未使用 multipart/form-data
- `500 Internal Server Error`：服务内部异常

## 7. 对接建议

- 回调接收端返回 `2xx` 即视为接收成功；
- **去重幂等**：
  - Stage 1 (`uploaded`) 用 `import.id` 做幂等；
  - Stage 2 (`analysis.completed`) 用 `run.id` 做幂等。
- 必须校验 `X-CP-Signature`（若启用 secret，飞书 webhook 不需要）；
- 建议对 `report.sharedUrl` 立即探活并落库，避免 7 天过期前未消费；
- Stage 2 回调到达时间取决于 LLM 响应耗时（`api-oneshot` 通常 30-90 秒）；如长时间未到，可凭 Stage 1 的 `runId` 调 `GET /api/v1/meeting-notes/runs/:id` 主动查询。
