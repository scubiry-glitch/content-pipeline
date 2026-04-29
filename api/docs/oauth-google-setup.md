# Google OAuth 接入说明

## 前提

后端代码已就绪 (services/auth/oauthGoogle.ts + routes/auth.ts /oauth/google/*)。
启用只需配置环境变量 + 在 Google Cloud Console 注册应用。

## 步骤

### 1. Google Cloud Console 申请凭证

1. 进 https://console.cloud.google.com/apis/credentials
2. 创建项目 (或用已有的) → 创建 "OAuth 2.0 Client ID"
3. Application type 选 **Web application**
4. **Authorized redirect URIs** 加上:
   - 生产: `https://api.your-host/api/auth/oauth/google/callback`
   - 本地开发: `http://localhost:3006/api/auth/oauth/google/callback`
5. 拿到 `Client ID` 与 `Client secret`

### 2. 后端 env 配置

在 `api/.env` 加:

```
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
OAUTH_CALLBACK_BASE=http://localhost:3006        # 生产换成 https://api.your-host
OAUTH_FRONTEND_REDIRECT=http://localhost:5173/   # 生产换成 https://your-host/
```

重启 API → `GET /api/auth/oauth/status` 应返回 `{google: {enabled: true}}`,
前端 Login 页 Google 按钮自动激活.

### 3. 流程

1. 用户点 Login 页 Google 按钮 → 跳 `/api/auth/oauth/google/start`
2. 后端写短期 cookie (state + PKCE verifier) → 302 跳 Google
3. 用户授权后 Google 跳回 `/oauth/google/callback?code&state`
4. 后端验 state, 用 code+verifier 换 token + userinfo
5. find-or-create user; 绑定 user_identities(provider='google', provider_user_id=sub)
6. 创建 cookie session, 跳回 OAUTH_FRONTEND_REDIRECT
7. 前端检测到 user 已登录, 进主界面

## 用户合并语义

- 已绑定: 同 google sub 的用户直接登录
- email 已存在但未绑定: 自动绑定到现有用户 (隐含信任 google 已校验邮箱;
  google 未校验邮箱时返回 403 EMAIL_UNVERIFIED)
- 全新: 创建新用户 (无密码 hash, must_change_password=false)

## 安全特性

- PKCE S256 (无需在前端存 client_secret)
- state 防 CSRF (短期 signed cookie 双因子校验)
- email_verified 强制要求
- 失败原因都进审计日志 (event=login.success / metadata.provider='google')

## 移除已绑定的 Google 账号

目前未提供 UI; 直接 SQL:

```sql
DELETE FROM user_identities
  WHERE user_id = '<user-id>' AND provider = 'google';
```

下次登录用密码即可.
