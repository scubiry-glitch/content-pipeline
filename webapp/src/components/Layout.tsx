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
  { 
    to: '/assets', 
    label: '内容资产', 
    icon: '📚',
    children: [
      { to: '/assets', label: '素材库', icon: '📁' },
      { to: '/assets/reports', label: '研报', icon: '📊' },
      { to: '/assets/popular', label: '热门素材', icon: '🔥' },
      { to: '/assets/rss', label: 'RSS订阅', icon: '📡' },
      { to: '/assets/bindings', label: '目录绑定', icon: '📂' },
    ]
  },
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
      <header className="sticky top-0 z-50 flex justify-between items-center w-full px-6 h-16 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between w-full mx-auto max-w-[1600px]">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight font-headline" style={{ margin: 0 }}>Editorial Pipeline</h1>
          </div>

          <nav className="header-nav hidden md:flex gap-6 items-center">
            {mainNavItems.map((item) => (
              <div key={item.to} className="nav-item-wrapper relative group">
                <NavLink
                  to={item.to}
                  className={({ isActive }) => 
                    `nav-link font-['Manrope'] font-semibold text-sm transition-colors ${isActivePath(location.pathname, item) ? 'text-primary' : 'text-slate-500 hover:text-blue-500'}`
                  }
                  end={item.to === '/'}
                  style={{ textDecoration: 'none', background: 'transparent', border: 'none' }}
                >
                  <span className="nav-label">{item.label}</span>
                </NavLink>
                {/* 子导航菜单 */}
                {item.children && isActivePath(location.pathname, item) && (
                  <div className="sub-nav absolute top-full left-0 mt-2 bg-white shadow-lg rounded-lg border border-slate-100 p-2 z-50 min-w-max hidden group-hover:block">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) => 
                          `sub-nav-link block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-primary rounded ${isActive ? 'bg-slate-50 text-primary font-bold' : ''}`
                        }
                        end={child.to === item.to}
                      >
                        <span className="sub-nav-label">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="header-right flex items-center gap-4">
            <div className="relative hidden sm:block">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
              <input 
                className="pl-10 pr-4 py-1.5 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-1 focus:ring-primary w-64 transition-all" 
                placeholder="Search topics... (⌘K)" 
                type="text"
                onClick={() => setIsSearchOpen(true)}
              />
            </div>
            
            <ThemeSwitcherMini currentTheme={currentTheme} onThemeChange={setTheme} />
            <NotificationBell />
            
            {/* 系统管理下拉菜单 (移至右上角) */}
            <div className="nav-dropdown relative">
              <button 
                className={`p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all flex items-center justify-center`}
                onClick={() => setIsSystemMenuOpen(!isSystemMenuOpen)}
                onBlur={() => setTimeout(() => setIsSystemMenuOpen(false), 200)}
                title="系统管理"
              >
                <span className="text-xl" style={{ margin: 0 }}>⚙️</span>
              </button>
              {isSystemMenuOpen && (
                <div className="dropdown-menu absolute right-0 mt-2 bg-white shadow-lg rounded-lg border border-slate-100 p-2 z-50 min-w-[180px]">
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
          </div>
        </div>
      </header>
      <main className="app-main animate-fade-in ${location.pathname.startsWith('/tasks/') ? 'app-main-fullwidth' : 'app-main'}`}>
        <Outlet />
      </main>
    </div>
  );
}
