import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { authClient, setOnUnauthorized, setOnWorkspaceForbidden } from '../api/client';
import { showApiError } from '../components/ApiErrorToast';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
}

interface MeResponse {
  user: AuthUser | null;
  currentWorkspace: AuthWorkspace | null;
  workspaces: AuthWorkspace[];
  via?: 'session' | 'api-key';
  sessionExpiresAt?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  currentWorkspace: AuthWorkspace | null;
  workspaces: AuthWorkspace[];
  loading: boolean;
  via: 'session' | 'api-key' | null;
  sessionExpiresAt: Date | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  switchWorkspace(workspaceId: string): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<AuthWorkspace | null>(null);
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [via, setVia] = useState<'session' | 'api-key' | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const initRanRef = useRef(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const refresh = useCallback(async () => {
    const fetchMe = async () => (await authClient.get('/auth/me')) as MeResponse;
    try {
      let res: MeResponse;
      try {
        res = await fetchMe();
      } catch (e: any) {
        const isTimeout = e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT';
        // 后端偶发慢查询会让 /auth/me 超过 30s；这里做一次轻量重试，避免误判未登录。
        if (!isTimeout) throw e;
        await sleep(500);
        res = await fetchMe();
      }
      setUser(res.user || null);
      setCurrentWorkspace(res.currentWorkspace || null);
      setWorkspaces(res.workspaces || []);
      setVia((res.via as 'session' | 'api-key') || null);
      setSessionExpiresAt(res.sessionExpiresAt ? new Date(res.sessionExpiresAt) : null);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        setUser(null);
        setCurrentWorkspace(null);
        setWorkspaces([]);
        setVia(null);
        setSessionExpiresAt(null);
      } else {
        console.error('[Auth] refresh failed:', e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRanRef.current) return;
    initRanRef.current = true;
    refresh();
  }, [refresh]);

  // Wire 401 handler — 强制刷新身份；UI 由 RequireAuth 跳 /login
  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setVia(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  // Wire 403 WORKSPACE_FORBIDDEN — 弹专属 toast 而不是默默吞
  useEffect(() => {
    setOnWorkspaceForbidden((message) => {
      showApiError('无权访问该工作区', message || '请切换到有权限的 workspace 后重试');
    });
    return () => setOnWorkspaceForbidden(null);
  }, []);

  // ─────────────────────────────────────────────────────────
  // 自动续期: 多触发点 + 节流
  //   - 首次登录 (user.id 变) → 立即调一次
  //   - tab 重新可见 (visibilitychange visible) → 调一次
  //   - 窗口 focus → 调一次
  //   - 每 1h 定时 → 调一次 (app 长时间开着不动)
  //   节流: 同一 5min 窗口内只发一次, 防多事件叠触发刷屏
  //   后端是 smart refresh: 剩余 > 7d 不写 DB, 只更 last_seen.
  // ─────────────────────────────────────────────────────────
  const lastRefreshRef = useRef(0);
  const THROTTLE_MS = 5 * 60 * 1000;

  useEffect(() => {
    if (!user || via !== 'session') return;

    const tryRefresh = async (reason: string) => {
      const now = Date.now();
      if (now - lastRefreshRef.current < THROTTLE_MS) return;
      lastRefreshRef.current = now;
      try {
        const r = (await authClient.post('/auth/refresh')) as { ok: boolean; expiresAt?: string; refreshed?: boolean };
        if (r?.expiresAt) setSessionExpiresAt(new Date(r.expiresAt));
        if (r?.refreshed) {
          console.log(`[Auth] session refreshed (${reason}), new expiresAt: ${r.expiresAt}`);
        }
      } catch { /* 静默 */ }
    };

    // 立即一次
    tryRefresh('mount/login');

    // visibility / focus
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryRefresh('visibility');
    };
    const onFocus = () => tryRefresh('focus');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    // 1h timer
    const id = setInterval(() => tryRefresh('1h-timer'), 60 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      clearInterval(id);
    };
  }, [user?.id, via]);

  const login = useCallback(async (email: string, password: string) => {
    await authClient.post('/auth/login', { email, password });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await authClient.post('/auth/logout');
    } catch (e) {
      // 即使后端报错也清前端状态
      console.warn('[Auth] logout error:', e);
    }
    setUser(null);
    setCurrentWorkspace(null);
    setWorkspaces([]);
    setVia(null);
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    await authClient.post('/auth/switch-workspace', { workspaceId });
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    user, currentWorkspace, workspaces, loading, via, sessionExpiresAt,
    login, logout, switchWorkspace, refresh,
  }), [user, currentWorkspace, workspaces, loading, via, sessionExpiresAt, login, logout, switchWorkspace, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
