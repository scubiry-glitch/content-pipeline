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
}

interface AuthContextValue {
  user: AuthUser | null;
  currentWorkspace: AuthWorkspace | null;
  workspaces: AuthWorkspace[];
  loading: boolean;
  via: 'session' | 'api-key' | null;
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
  const [loading, setLoading] = useState(true);
  const initRanRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = (await authClient.get('/auth/me')) as MeResponse;
      setUser(res.user || null);
      setCurrentWorkspace(res.currentWorkspace || null);
      setWorkspaces(res.workspaces || []);
      setVia((res.via as 'session' | 'api-key') || null);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        setUser(null);
        setCurrentWorkspace(null);
        setWorkspaces([]);
        setVia(null);
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

  // 已登录时主动调一次 /auth/refresh 把 30 天 expires_at 推后, 防止长时间不操作被踢
  useEffect(() => {
    if (!user || via !== 'session') return;
    authClient.post('/auth/refresh').catch(() => { /* 静默 */ });
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
    user, currentWorkspace, workspaces, loading, via,
    login, logout, switchWorkspace, refresh,
  }), [user, currentWorkspace, workspaces, loading, via, login, logout, switchWorkspace, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
