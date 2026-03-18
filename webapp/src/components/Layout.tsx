import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { ThemeSwitcher, ThemeSwitcherMini } from './ThemeSwitcher';
import { useTheme } from '../themes';
import './Layout.css';

// 导航项配置
interface NavItem {
  to: string;
  label: string;
  icon?: string;
  children?: NavItem[];
}

const mainNavItems: NavItem[] = [
  { to: '/', label: '仪表盘', icon: '📊' },
  { to: '/tasks', label: '任务中心', icon: '📋' },
  { to: '/assets', label: '内容资产', icon: '📚' },
  { to: '/expert-library', label: '专家体系', icon: '👥' },
  { to: '/hot-topics', label: '热点洞察', icon: '🔥' },
];

const systemNavItems: NavItem[] = [
  { to: '/settings', label: '设置', icon: '⚙️' },
  { to: '/notifications', label: '通知', icon: '🔔' },
  { to: '/copilot', label: 'Copilot', icon: '🤖' },
  { to: '/compliance', label: '合规', icon: '🛡️' },
  { to: '/i18n', label: '国际化', icon: '🌍' },
];

// 检查当前路径是否匹配导航项
const isActivePath = (pathname: string, item: NavItem): boolean => {
  if (pathname === item.to) return true;
  if (item.children) {
    return item.children.some(child => pathname.startsWith(child.to));
  }
  // 特殊处理：专家体系相关页面
  if (item.to === '/expert-library' && 
      ['/expert-comparison', '/expert-network', '/expert-knowledge-graph'].some(p => pathname.startsWith(p))) {
    return true;
  }
  // 特殊处理：热点洞察相关页面
  if (item.to === '/hot-topics' && 
      ['/hot-topics/insights'].some(p => pathname.startsWith(p))) {
    return true;
  }
  return false;
};

export function Layout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isThemeSwitcherOpen, setIsThemeSwitcherOpen] = useState(false);
  const [isSystemMenuOpen, setIsSystemMenuOpen] = useState(false);
  const { currentTheme, setTheme } = useTheme();
  const location = useLocation();

  // 监听 Command/Ctrl + K 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      // 主题切换快捷键 Cmd/Ctrl + Shift + T
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setIsThemeSwitcherOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-container">
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <ThemeSwitcher
        isOpen={isThemeSwitcherOpen}
        onClose={() => setIsThemeSwitcherOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={setTheme}
      />
      <header className="app-header">
        <div className="header-content">
          <h1 className="header-title">内容生产流水线</h1>
          <button
            className="search-trigger"
            onClick={() => setIsSearchOpen(true)}
            title="搜索 (⌘K / Ctrl+K)"
          >
            🔍 搜索
            <span className="shortcut">⌘K</span>
          </button>
          <ThemeSwitcherMini currentTheme={currentTheme} onThemeChange={setTheme} />
          <NotificationBell />
        </div>
        <div className="header-content">
          <h1 className="header-title">内容生产流水线</h1>
          <nav className="header-nav">
            {mainNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => 
                  `nav-link ${isActivePath(location.pathname, item) ? 'active' : ''}`
                }
                end={item.to === '/'}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
            
            {/* 系统管理下拉菜单 */}
            <div className="nav-dropdown">
              <button 
                className={`nav-link dropdown-trigger ${systemNavItems.some(item => location.pathname.startsWith(item.to)) ? 'active' : ''}`}
                onClick={() => setIsSystemMenuOpen(!isSystemMenuOpen)}
                onBlur={() => setTimeout(() => setIsSystemMenuOpen(false), 200)}
              >
                <span className="nav-icon">⚙️</span>
                <span className="nav-label">系统管理</span>
                <span className="dropdown-arrow">{isSystemMenuOpen ? '▲' : '▼'}</span>
              </button>
              {isSystemMenuOpen && (
                <div className="dropdown-menu">
                  {systemNavItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => 
                        `dropdown-item ${isActive ? 'active' : ''}`
                      }
                      onClick={() => setIsSystemMenuOpen(false)}
                    >
                      <span className="item-icon">{item.icon}</span>
                      <span className="item-label">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
