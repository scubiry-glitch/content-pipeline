import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { ThemeSwitcher, ThemeSwitcherMini } from './ThemeSwitcher';
import { useTheme } from '../themes';
import './Layout.css';

export function Layout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isThemeSwitcherOpen, setIsThemeSwitcherOpen] = useState(false);
  const { currentTheme, setTheme } = useTheme();

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
            <NavLink to="/" className="nav-link" end>
              仪表盘
            </NavLink>
            <NavLink to="/tasks" className="nav-link">
              任务管理
            </NavLink>
            <NavLink to="/assets" className="nav-link">
              素材库
            </NavLink>
            <NavLink to="/expert-library" className="nav-link">
              专家库 (v5.1)
            </NavLink>
            <NavLink to="/reports" className="nav-link">
              研报 (v3.3)
            </NavLink>
            <NavLink to="/hot-topics" className="nav-link">
              热点 (v3.4)
            </NavLink>
            <NavLink to="/rss-sources" className="nav-link">
              RSS (v3.4)
            </NavLink>
            <NavLink to="/quality-dashboard" className="nav-link">
              质量仪表盘
            </NavLink>
            <NavLink to="/sentiment" className="nav-link">
              情感 (v3.2)
            </NavLink>
            <NavLink to="/compliance" className="nav-link">
              合规 (v4.0)
            </NavLink>
            <NavLink to="/orchestrator" className="nav-link">
              编排 (v4.1)
            </NavLink>
            <NavLink to="/prediction" className="nav-link">
              预测 (v4.3)
            </NavLink>
            <NavLink to="/copilot" className="nav-link">
              Copilot (v4.4)
            </NavLink>
            <NavLink to="/i18n" className="nav-link">
              国际化 (v4.5)
            </NavLink>
            <NavLink to="/archive/hidden" className="nav-link">
              隐藏任务
            </NavLink>
            <NavLink to="/archive/recycle-bin" className="nav-link">
              回收站
            </NavLink>
            <NavLink to="/settings" className="nav-link">
              ⚙️ 设置
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
