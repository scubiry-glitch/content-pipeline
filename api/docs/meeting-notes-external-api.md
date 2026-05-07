# Meeting Notes 外部上传 API 对接文档

适用场景：外部系统通过 API 上传会议文件，触发解析，并在任务完成后通过回调 URL 收到报告链接。

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
  - `file`：必填，支持 `.md/.txt/.docx`（其他类型按 UTF-8 文本读）
  - `sourceId`：可选，指定已有 source UUID
  - `workspaceId`：可选，指定任务目标工作区 UUID（适用于 API Key 多租户场景）
  - `userId`：可选，业务侧用户 ID（用于审计/回调透传）
  - `scopeKind`：可选，业务 scope 类型（如 `project/client/topic/meeting`）
  - `scopeId`：可选，业务 scope ID（UUID，与你的业务对象一一对应）
  - `callbackUrl`：可选，任务完成后异步回调
  - `callbackSecret`：可选，用于回调签名

说明：
- 若未传 `sourceId`，系统会自动选择当前 workspace 的 `upload/manual` source；
- 若当前 workspace 无任何 source，系统会自动创建 `默认上传来源`（kind=`upload`）。

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
  -F "callbackSecret=your-shared-secret"

# 备用入口（HTTP）
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
  "callback": {
    "sentAsync": true,
    "callbackUrl": "https://partner.example.com/webhooks/meeting-report"
  }
}
```

## 3. 传统上传接口（兼容）

- 方法：`POST /api/v1/meeting-notes/sources/:id/upload`
- 鉴权：必需
- 表单字段：
  - `file`：必填
  - `callbackUrl`：可选
  - `callbackSecret`：可选

## 4. 定时回调（schedule + webhook）

当 source 配置了 `scheduleCron` 且 `config.callbackUrl` 时，系统每次定时导入成功/失败后都会触发回调。

source config 示例：

```json
{
  "callbackUrl": "https://partner.example.com/webhooks/meeting-report",
  "callbackSecret": "your-shared-secret"
}
```

## 5. 回调协议

### 5.1 回调触发时机

- 上传任务完成后（`upload-task` 或 `:id/upload` 且传了 `callbackUrl`）
- 定时任务完成后（source.config 配置了 callback）

### 5.2 请求

- 方法：`POST <callbackUrl>`
- Header：
  - `Content-Type: application/json`
  - `X-CP-Event: meeting_notes.import.completed`
  - `X-CP-Signature: sha256=<hex>`（仅当配置了 `callbackSecret`）

签名规则：
- `rawBody` = 回调 JSON 原文字符串
- `signature` = `HMAC_SHA256(callbackSecret, rawBody)` 的 hex

### 5.3 回调体

```json
{
  "event": "meeting_notes.import.completed",
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
  "reports": [
    {
      "assetId": "f66b09d2-eaf0-4422-b9b8-2f8185f7d0df",
      "sharedUrl": "https://note.meizu.life/api/v1/meeting-notes/shared/06e4b9b0-bf68-4d92-8f4d-bc31ac8c426d"
    }
  ]
}
```

说明：
- `reports[].sharedUrl` 为系统自动创建的 7 天有效公开分享链接；
- 若分享链接创建失败，`sharedUrl` 可能为 `null`，但 `assetId` 仍可用于内部追踪。

## 6. 错误码（常见）

- `400 Bad Request`：参数错误（如 `sourceId` 非 UUID、文件为空）
- `401 Unauthorized`：缺失/错误 API Key
- `404 Not Found`：source 不存在
- `415 Unsupported Media Type`：未使用 multipart/form-data
- `500 Internal Server Error`：服务内部异常

## 7. 对接建议

- 回调接收端返回 `2xx` 即视为接收成功；
- 建议记录 `import.id` 做幂等去重；
- 必须校验 `X-CP-Signature`（若启用 secret）；
- 建议对 `sharedUrl` 立即探活并落库，避免过期前未消费。

