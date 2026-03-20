// AssetsLayout.tsx
// v3.0.3: 内容资产模块布局组件 - 包含子导航

import { NavLink, Outlet, useLocation } from 'react-router-dom';
import './Assets.css';

const tabs = [
  { to: '/assets', icon: '📁', label: '素材库', exact: true },
  { to: '/assets/reports', icon: '📊', label: '研报' },
  { to: '/assets/popular', icon: '🔥', label: '热门素材' },
  { to: '/assets/rss', icon: '📡', label: 'RSS订阅' },
  { to: '/assets/bindings', icon: '📂', label: '目录绑定' },
];

export function AssetsLayout() {
  const location = useLocation();

  return (
    <div className="assets-page">
      <div className="assets-header">
        <h1>内容资产</h1>
        <p className="subtitle">管理素材、研报和订阅源</p>
      </div>

      <div className="assets-tabs">
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            className={({ isActive }) => 
              `tab-btn ${isActive ? 'active' : ''}`
            }
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="assets-content">
        <Outlet />
      </div>
    </div>
  );
}

export default AssetsLayout;
