import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * 路由守卫: 仅 super_admin 可进 /admin/users 与 /admin/audit
 * 非 super_admin 直接 403 提示页
 */
export function AdminGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperAdmin) {
    return (
      <div style={{ padding: 48, maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
          权限不足
        </h1>
        <p style={{ fontSize: 14, color: '#64748b' }}>
          这是 super_admin 专用页面。如需访问请联系管理员将你的账号设为 super_admin。
        </p>
      </div>
    );
  }
  return <Outlet />;
}
