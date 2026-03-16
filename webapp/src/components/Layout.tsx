import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

export function Layout() {
  return (
    <div className="app-container">
      <header className="app-header">
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
            <NavLink to="/experts" className="nav-link">
              专家库
            </NavLink>
            <NavLink to="/reports" className="nav-link">
              研报 (v3.3)
            </NavLink>
            <NavLink to="/hot-topics" className="nav-link">
              热点 (v3.4)
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
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
