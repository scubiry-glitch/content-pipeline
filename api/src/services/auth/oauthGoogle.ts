// OAuth2 Google · Authorization Code + PKCE
//
// 启用条件:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   OAUTH_CALLBACK_BASE       (e.g. https://api.your-host)
//   OAUTH_FRONTEND_REDIRECT   (登录成功后回到的前端 URL, 默认 '/')
// 全部未配置时 routes 返回 501; 部分配置触发启动校验抛错的设计后续可加.
//
// 流程概要:
//   GET /oauth/google/start
//     生成 state + code_verifier; 写到短期 signed cookie (5min);
//     302 跳到 Google authorize URL (含 code_challenge=S256(verifier))
//
//   GET /oauth/google/callback?code&state
//     验 state; 用 code+verifier 调 token endpoint 拿 access_token + id_token
//     调 userinfo 拿 email/name/sub/picture
//     find-or-create user_identities(provider='google', provider_user_id=sub)
//     create session; 302 到 OAUTH_FRONTEND_REDIRECT

import crypto from 'node:crypto';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackBase: string;        // e.g. https://api.host  (callback URL = base + /api/auth/oauth/google/callback)
  frontendRedirect: string;    // e.g. http://localhost:5173/
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const callbackBase = process.env.OAUTH_CALLBACK_BASE;
  if (!clientId || !clientSecret || !callbackBase) return null;
  return {
    clientId,
    clientSecret,
    callbackBase,
    frontendRedirect: process.env.OAUTH_FRONTEND_REDIRECT || '/',
  };
}

export function callbackUrl(cfg: GoogleOAuthConfig): string {
  return `${cfg.callbackBase.replace(/\/$/, '')}/api/auth/oauth/google/callback`;
}

export function buildAuthorizeUrl(cfg: GoogleOAuthConfig, state: string, codeChallenge: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', callbackUrl(cfg));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('access_type', 'online');
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export function generatePkce(): { state: string; verifier: string; challenge: string } {
  const state = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { state, verifier, challenge };
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  scope: string;
  token_type: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export async function exchangeCodeForToken(
  cfg: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: callbackUrl(cfg),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google userinfo failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<GoogleUserInfo>;
}
