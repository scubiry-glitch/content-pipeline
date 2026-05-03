// MeetingShell — 会议纪要 v2 原型外壳
// 来源：/tmp/mn-proto/main-shell.jsx MainShell（骨架版）
// 所有子路由通过 <Outlet /> 渲染；根元素加 className="meeting-proto" 启用 _tokens.css 色板

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, MonoMeta, Chip } from './_atoms';
import type { IconName } from './_atoms';
import { MeetingScopeProvider, useMeetingScope } from './_scopeContext';
import { MockToggleProvider, MockToggleBar } from './_mockToggle';
import { ScopePill } from './_axisShared';
import './_tokens.css';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  group?: string;
}

const NAV: NavItem[] = [
  { to: '/meeting/today',              label: '今天',          icon: 'sparkle',  group: '做什么' },
  { to: '/meeting/library',            label: '库',            icon: 'folder',   group: '做什么' },
  // R3-A · 改动一：四轴 → 三轴。会议本身（meta）不再做全局轴入口，
  // 单场体征下沉到 /meeting/:id/{a,b,c} 顶部 4 徽章（VariantsHealthBadges），
  // 跨会聚合（健康度趋势）下沉到 /meeting/longitudinal?tab=health。
  { to: '/meeting/axes/people',        label: '人物轴',        icon: 'users',    group: '三轴视图' },
  { to: '/meeting/axes/projects',      label: '项目轴',        icon: 'network',  group: '三轴视图' },
  { to: '/meeting/axes/knowledge',     label: '知识轴',        icon: 'book',     group: '三轴视图' },
  { to: '/meeting/longitudinal',       label: '纵向视图',      icon: 'layers',   group: '跨会议' },
  { to: '/meeting/scopes',             label: '调用配置',      icon: 'scale',    group: '专家系统' },
  { to: '/meeting/strategies',         label: '策略 / 装饰器', icon: 'git',      group: '专家系统' },
  { to: '/meeting/generation-center',  label: '生成中心',      icon: 'play',     group: '专家系统' },
];

// 每个导航项的 1-char 收起标签
const NAV_SHORT: Record<string, string> = {
  '今天': '今', '库': '库', '人物轴': '人', '项目轴': '项', '知识轴': '知',
  '纵向视图': '纵', '调用配置': '调', '策略 / 装饰器': '策', '生成中心': '生',
};

export function MeetingShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = (matches: boolean) => {
      setIsMobile(matches);
      if (matches) setCollapsed(false); // mobile uses overlay, not icon-only
    };
    update(mq.matches);
    const handler = (e: MediaQueryListEvent) => update(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const groups = NAV.reduce<Record<string, NavItem[]>>((acc, it) => {
    const g = it.group ?? '其他';
    (acc[g] ??= []).push(it);
    return acc;
  }, {});

  const onDetailPage = /^\/meeting\/[^/]+\/(a|b|c)/.test(location.pathname);
  const isCollapsed = !isMobile && collapsed;

  const sidebar = (
    <aside style={{
      width: isMobile ? 240 : (isCollapsed ? 56 : 240),
      transition: isMobile ? 'none' : 'width 0.2s ease',
      borderRight: isMobile ? 'none' : '1px solid var(--line-2)',
      background: 'var(--paper)',
      padding: isCollapsed ? '20px 4px' : '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: isCollapsed ? 10 : 18,
      flexShrink: 0,
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6,
          background: 'var(--ink)', color: 'var(--paper)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 500, fontSize: 18,
          flexShrink: 0,
        }}>M</div>
        {!isCollapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 15 }}>Minutes</div>
            <MonoMeta>会议纪要 v2</MonoMeta>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} style={{
            marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer',
            color: 'var(--ink-3)', padding: 4, display: 'flex',
          }}>
            <Icon name="x" size={18} />
          </button>
        )}
      </div>

      {/* New meeting button */}
      <button
        onClick={() => { navigate('/meeting/new'); if (isMobile) setMobileOpen(false); }}
        title="新建会议纪要"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: isCollapsed ? '9px' : '9px 12px', borderRadius: 6,
          background: 'var(--accent)', color: 'var(--paper)',
          border: '1px solid var(--accent)', fontSize: 13, fontWeight: 500,
          fontFamily: 'var(--sans)', cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={isCollapsed ? 16 : 14} stroke={2} />
        {!isCollapsed && '新建会议纪要'}
      </button>

      {/* Nav items */}
      {isCollapsed ? (
        // Collapsed: icon + 1 char
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              title={it.label}
              style={({ isActive }) => ({
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '8px 4px', borderRadius: 4,
                color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                textDecoration: 'none',
              })}
            >
              <Icon name={it.icon} size={18} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, lineHeight: 1 }}>
                {NAV_SHORT[it.label] ?? it.label[0]}
              </span>
            </NavLink>
          ))}
        </div>
      ) : (
        Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
            }}>
              {group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => { if (isMobile) setMobileOpen(false); }}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 4,
                    fontSize: 13,
                    fontFamily: 'var(--sans)',
                    color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    fontWeight: isActive ? 600 : 450,
                    textDecoration: 'none',
                  })}
                >
                  <Icon name={it.icon} size={14} />
                  {it.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))
      )}

      {!isCollapsed && <ScopeShortcuts onNavigate={() => isMobile && setMobileOpen(false)} />}

      {/* Collapse toggle — desktop only */}
      {!isMobile && (
        <div style={{ marginTop: isCollapsed ? 'auto' : 0, borderTop: '1px solid var(--line-2)', paddingTop: 8 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '6px', border: 0, background: 'transparent',
              cursor: 'pointer', color: 'var(--ink-4)', borderRadius: 4, gap: 4,
            }}
          >
            <Icon
              name="chevron"
              size={13}
              style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}
            />
            {!collapsed && <span style={{ fontSize: 11, fontFamily: 'var(--sans)' }}>收起</span>}
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <MockToggleProvider>
    <MeetingScopeProvider>
    <div className="meeting-proto" style={{ display: 'flex', minHeight: '100vh' }}>

      {/* Mobile: backdrop */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
        />
      )}

      {/* Desktop: inline sidebar — width transitions on the aside itself */}
      {!isMobile && sidebar}

      {/* Mobile: off-canvas overlay */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
          width: 240,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s ease',
          boxShadow: mobileOpen ? '4px 0 24px rgba(0,0,0,0.18)' : 'none',
        }}>
          {sidebar}
        </div>
      )}

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!onDetailPage && (
          <header style={{
            borderBottom: '1px solid var(--line-2)',
            background: 'var(--paper)',
            padding: '10px 28px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                title="打开导航"
                style={{
                  border: 0, background: 'transparent', cursor: 'pointer',
                  color: 'var(--ink-3)', padding: '2px 4px', display: 'flex',
                }}
              >
                {/* 三横线 icon */}
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <MonoMeta>/meeting{location.pathname === '/meeting' ? '' : location.pathname.replace('/meeting', '')}</MonoMeta>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <ScopePill />
            </div>
          </header>
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          <Outlet />
        </div>
      </main>
      <MockToggleBar />
    </div>
    </MeetingScopeProvider>
    </MockToggleProvider>
  );
}

// 动态作用域快捷——从 MeetingScopeProvider 读取，点击设全局 scope
function ScopeShortcuts({ onNavigate }: { onNavigate?: () => void }) {
  const scope = useMeetingScope();
  const projectGroup = scope.kinds.find((g) => g.id === 'project');
  const items = projectGroup?.instances.slice(0, 3) ?? [];
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 'auto' }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
      }}>
        作用域快捷
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((s) => {
          const active = scope.kindId === 'project' && scope.instanceId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => { scope.setInstance('project', s.id); onNavigate?.(); }}
              style={{
                textAlign: 'left', padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                background: active ? 'var(--paper-2)' : 'transparent',
                border: active ? '1px solid var(--line-2)' : '1px solid transparent',
                fontFamily: 'var(--sans)',
              }}
            >
              <MonoMeta style={{ color: active ? 'var(--teal)' : undefined }}>project</MonoMeta>
              <div style={{ fontSize: 12.5, color: active ? 'var(--ink)' : 'var(--ink-2)', fontWeight: active ? 600 : 450 }}>
                {s.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MeetingShell;
