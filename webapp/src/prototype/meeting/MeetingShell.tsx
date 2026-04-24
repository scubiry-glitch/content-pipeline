// MeetingShell — 会议纪要 v2 原型外壳
// 来源：/tmp/mn-proto/main-shell.jsx MainShell（骨架版）
// 所有子路由通过 <Outlet /> 渲染；根元素加 className="meeting-proto" 启用 _tokens.css 色板

import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, MonoMeta, Chip } from './_atoms';
import type { IconName } from './_atoms';
import { SCOPES } from './_fixtures';
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
  { to: '/meeting/axes/people',        label: '人物轴',        icon: 'users',    group: '三轴视图' },
  { to: '/meeting/axes/projects',      label: '项目轴',        icon: 'network',  group: '三轴视图' },
  { to: '/meeting/axes/knowledge',     label: '知识轴',        icon: 'book',     group: '三轴视图' },
  { to: '/meeting/axes/meta',          label: '会议本身',      icon: 'target',   group: '三轴视图' },
  { to: '/meeting/longitudinal',       label: '纵向视图',      icon: 'layers',   group: '跨会议' },
  { to: '/meeting/scopes',             label: '调用配置',      icon: 'scale',    group: '专家系统' },
  { to: '/meeting/strategies',         label: '策略 / 装饰器', icon: 'git',      group: '专家系统' },
  { to: '/meeting/generation-center',  label: '生成中心',      icon: 'play',     group: '专家系统' },
];

export function MeetingShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const groups = NAV.reduce<Record<string, NavItem[]>>((acc, it) => {
    const g = it.group ?? '其他';
    (acc[g] ??= []).push(it);
    return acc;
  }, {});

  const onDetailPage = /^\/meeting\/[^/]+\/(a|b|c)/.test(location.pathname);

  return (
    <div className="meeting-proto" style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 240,
        borderRight: '1px solid var(--line-2)',
        background: 'var(--paper)',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'var(--ink)', color: 'var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 500, fontSize: 18,
          }}>
            M
          </div>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 15 }}>Minutes</div>
            <MonoMeta>会议纪要 v2</MonoMeta>
          </div>
        </div>

        <button
          onClick={() => navigate('/meeting/new')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '9px 12px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--paper)',
            border: '1px solid var(--accent)', fontSize: 13, fontWeight: 500,
            fontFamily: 'var(--sans)', cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={14} stroke={2} />
          新建会议纪要
        </button>

        {Object.entries(groups).map(([group, items]) => (
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
        ))}

        <div style={{ marginTop: 'auto' }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
          }}>
            作用域快捷
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SCOPES.project.slice(0, 3).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/meeting/library?scope=${s.id}`)}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px', borderRadius: 4,
                  background: 'transparent', border: '1px solid transparent',
                  fontFamily: 'var(--sans)', cursor: 'pointer',
                }}
              >
                <MonoMeta>project</MonoMeta>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{s.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10, marginTop: 4 }}>
          <a
            href="/meeting-notes"
            style={{
              fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)',
              textDecoration: 'none', letterSpacing: 0.3,
            }}
          >
            ← 旧版 /meeting-notes
          </a>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!onDetailPage && (
          <header style={{
            borderBottom: '1px solid var(--line-2)',
            background: 'var(--paper)',
            padding: '10px 28px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <MonoMeta>/meeting{location.pathname === '/meeting' ? '' : location.pathname.replace('/meeting', '')}</MonoMeta>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Chip tone="ghost">原型 · 阶段 1</Chip>
            </div>
          </header>
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default MeetingShell;
