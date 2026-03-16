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
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
