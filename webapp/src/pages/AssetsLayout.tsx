// AssetsLayout.tsx
// v3.1.0: 内容资产模块布局组件 - 二级导航已移至全局Layout

import { Outlet } from 'react-router-dom';
import './Assets.css';

export function AssetsLayout() {
  return (
    <div className="assets-layout-wrapper">
      <div className="assets-content-area">
        <Outlet />
      </div>
    </div>
  );
}

export default AssetsLayout;
