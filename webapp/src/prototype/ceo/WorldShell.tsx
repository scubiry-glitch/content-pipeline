// WorldShell — 外部/内部世界双模主壳
// 来源: 07-archive/会议纪要 (20260501)/world-shell.jsx
// 路由感知改造: 模式 (external/internal) 与子 tab (meetings/library/ceo/brain) 由 URL path 驱动

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import './_tokens.css';
import { PersonDrawerProvider } from './shared/PersonDrawerProvider';
import { PersonDrawer } from './shared/PersonDrawer';
import { useIsMobile } from '../_useIsMobile';
import { WorkspacePill } from '../../components/WorkspacePill';
// 复用 meeting prototype 的 mock 开关 (右下角 pill, Alt+M 切换);
// CEO 各房间 fixture 兜底改成"只有 forceMock=true 时显示", 默认 API 空就空.
import { MockToggleProvider, MockToggleBar } from '../meeting/_mockToggle';

type Mode = 'external' | 'internal';
type ExtTab = 'meetings' | 'library';
type IntTab = 'ceo' | 'brain';

function useModeFromPath(): { mode: Mode; extTab: ExtTab; intTab: IntTab } {
  const { pathname } = useLocation();
  const isInternal = pathname.startsWith('/ceo/internal');
  const mode: Mode = isInternal ? 'internal' : 'external';
  const extTab: ExtTab = pathname.includes('/external/library') ? 'library' : 'meetings';
  const intTab: IntTab = pathname.includes('/internal/brain') ? 'brain' : 'ceo';
  return { mode, extTab, intTab };
}

const MODE_DEFAULTS = {
  external: '/ceo/external/meetings',
  internal: '/ceo/internal/ceo',
} as const;

export function WorldShell() {
  const navigate = useNavigate();
  const { mode, extTab, intTab } = useModeFromPath();
  const isExternal = mode === 'external';

  const themeBg = isExternal ? 'var(--ext-paper)' : 'var(--int-paper)';
  const themeInk = isExternal ? 'var(--ext-ink)' : 'var(--int-ink)';
  const themeAccent = isExternal ? 'var(--ext-accent)' : 'var(--int-accent)';

  const switchMode = () => {
    navigate(MODE_DEFAULTS[isExternal ? 'internal' : 'external']);
  };

  return (
    <MockToggleProvider>
    <PersonDrawerProvider>
    <PersonDrawer />
    <MockToggleBar />
    <div
      className={`ceo-proto ${isExternal ? '' : 'ceo-proto-internal'}`}
      style={{
        width: '100%',
        maxWidth: '100vw',
        minHeight: '100vh',
        height: '100vh',
        background: themeBg,
        color: themeInk,
        fontFamily: 'var(--sans)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'background 600ms ease, color 600ms ease',
      }}
    >
      <WorldSwitcher mode={mode} onSwitch={switchMode} />

      {isExternal ? (
        <>
          <SubNav
            items={[
              { id: 'meetings', label: '📅 会议', sub: '与世界的会面', path: '/ceo/external/meetings' },
              { id: 'library', label: '📚 库', sub: '人物 · 项目 · 知识', path: '/ceo/external/library' },
            ]}
            active={extTab}
            tone={themeAccent}
            ink={themeInk}
            mode={mode}
          />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Outlet />
          </div>
        </>
      ) : (
        <>
          <SubNav
            items={[
              { id: 'ceo', label: '👤 CEO 主页', sub: '六棱镜六房间', path: '/ceo/internal/ceo' },
              { id: 'brain', label: '🧠 外脑图书馆', sub: '永久的认知资产', path: '/ceo/internal/brain' },
            ]}
            active={intTab}
            tone={themeAccent}
            ink={themeInk}
            mode={mode}
          />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Outlet />
          </div>
        </>
      )}
    </div>
    </PersonDrawerProvider>
    </MockToggleProvider>
  );
}

interface SwitcherProps {
  mode: Mode;
  onSwitch: () => void;
}

function WorldSwitcher({ mode, onSwitch }: SwitcherProps) {
  const isEx = mode === 'external';
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        flexShrink: 0,
        borderBottom: isEx
          ? '1px solid rgba(0,0,0,0.08)'
          : '1px solid rgba(217,184,142,0.15)',
        background: isEx
          ? 'linear-gradient(90deg, #FAF7F0 0%, #F0E9DC 100%)'
          : 'linear-gradient(90deg, #1A1420 0%, #0F0E15 100%)',
        transition: 'background 600ms ease',
      }}
    >
      <div
        style={{
          padding: isMobile ? '8px 10px' : '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 10,
          borderRight: isEx
            ? '1px solid rgba(0,0,0,0.06)'
            : '1px solid rgba(217,184,142,0.1)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: isMobile ? 26 : 30,
            height: isMobile ? 26 : 30,
            borderRadius: 7,
            background: isEx ? '#D64545' : '#D9B88E',
            color: isEx ? '#FAF7F0' : '#0F0E15',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: isMobile ? 13 : 15,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          M
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: isMobile ? 12 : 13, color: isEx ? '#1F1B16' : '#F3ECDD' }}>
            Minutes
          </div>
          {/* mobile: 副标题省略，节省空间 */}
          {!isMobile && (
            <div
              style={{
                fontSize: 10,
                color: isEx ? '#7A6E5E' : 'rgba(232,227,216,0.55)',
                fontFamily: 'var(--mono)',
              }}
            >
              v0.5 · {isEx ? '外部世界' : '内部世界'}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: isMobile ? 4 : 0 }} />

      <div
        onClick={onSwitch}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSwitch()}
        style={{
          alignSelf: 'center',
          margin: isMobile ? '0 6px' : '0 20px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: isMobile ? 168 : 360,
          height: isMobile ? 36 : 44,
          flexShrink: 0,
          borderRadius: 99,
          background: isEx
            ? 'linear-gradient(90deg, #FFF5D9 0%, #EBDBAE 100%)'
            : 'linear-gradient(90deg, #1C1A2A 0%, #0A0912 100%)',
          border: isEx ? '1px solid #D9C07F' : '1px solid rgba(217,184,142,0.3)',
          cursor: 'pointer',
          boxShadow: isEx
            ? 'inset 0 1px 2px rgba(0,0,0,0.05)'
            : 'inset 0 1px 2px rgba(0,0,0,0.5)',
          transition: 'all 600ms ease',
          overflow: 'hidden',
        }}
      >
        {!isEx &&
          [...Array(12)].map((_, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${(i * 29) % 100}%`,
                top: `${(i * 17) % 100}%`,
                width: 1.5,
                height: 1.5,
                background: '#F3ECDD',
                borderRadius: 99,
                opacity: 0.5,
              }}
            />
          ))}

        <div
          style={{
            padding: '0 16px 0 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: isEx ? '#8A5A1A' : 'rgba(217,184,142,0.4)',
            fontFamily: 'var(--serif)',
            fontStyle: isEx ? 'normal' : 'italic',
            fontWeight: isEx ? 600 : 500,
            fontSize: 13,
            zIndex: 2,
            position: 'relative',
          }}
        >
          <span style={{ fontSize: 16 }}>☀️</span> 外部世界
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: '0 18px 0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: !isEx ? '#D9B88E' : 'rgba(120,90,40,0.4)',
            fontFamily: 'var(--serif)',
            fontStyle: !isEx ? 'italic' : 'normal',
            fontWeight: !isEx ? 600 : 500,
            fontSize: 13,
            zIndex: 2,
            position: 'relative',
          }}
        >
          内部世界 <span style={{ fontSize: 16 }}>🌙</span>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: isEx ? 3 : 'calc(50% + 3px)',
            right: isEx ? 'calc(50% + 3px)' : 3,
            borderRadius: 99,
            background: isEx
              ? 'linear-gradient(135deg, #FFE08A, #FFB545)'
              : 'linear-gradient(135deg, #3A3555, #1A1628)',
            boxShadow: isEx
              ? '0 2px 8px rgba(255,181,69,0.4), inset 0 -1px 2px rgba(0,0,0,0.1)'
              : '0 2px 8px rgba(217,184,142,0.3), inset 0 -1px 2px rgba(217,184,142,0.2)',
            transition: 'all 500ms cubic-bezier(.5,.1,.3,1)',
            zIndex: 1,
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        padding: isMobile ? '8px 10px' : '12px 22px',
        display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12,
        flexShrink: 0,
      }}>
        <WorkspacePill tone={isEx ? 'light' : 'dark'} size="xs" />
        {/* mobile: 时间 / 问候语隐藏，节省横向空间，仅保留 🦉 入口 */}
        {!isMobile && (
          <div
            style={{
              fontSize: 11,
              color: isEx ? '#7A6E5E' : 'rgba(232,227,216,0.55)',
              fontFamily: 'var(--mono)',
              letterSpacing: 0.3,
            }}
          >
            {isEx ? '09:42 · 周六' : '晚安 · 本周已亮灯'}
          </div>
        )}
        <button
          style={{
            width: isMobile ? 28 : 30,
            height: isMobile ? 28 : 30,
            borderRadius: 99,
            border: 0,
            cursor: 'pointer',
            background: isEx ? 'rgba(0,0,0,0.05)' : 'rgba(217,184,142,0.15)',
            color: isEx ? '#1F1B16' : '#D9B88E',
            fontSize: isMobile ? 13 : 14,
            flexShrink: 0,
          }}
        >
          🦉
        </button>
      </div>
    </div>
  );
}

interface SubNavProps {
  items: { id: string; label: string; sub: string; path: string }[];
  active: string;
  tone: string;
  ink: string;
  mode: Mode;
}

function SubNav({ items, active, tone, ink, mode }: SubNavProps) {
  const navigate = useNavigate();
  const isEx = mode === 'external';
  const isMobile = useIsMobile();
  return (
    <div
      className={isMobile ? 'ceo-scroll-h' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: isMobile ? '6px 12px' : '10px 22px',
        borderBottom: isEx
          ? '1px solid rgba(0,0,0,0.06)'
          : '1px solid rgba(217,184,142,0.1)',
        ...(isMobile ? {
          overflowX: 'auto' as const,
          WebkitOverflowScrolling: 'touch' as const,
        } : {}),
      }}
    >
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => navigate(it.path)}
            style={{
              padding: isMobile ? '6px 10px' : '7px 14px',
              border: 0,
              borderRadius: 6,
              cursor: 'pointer',
              background: isActive
                ? isEx
                  ? 'rgba(0,0,0,0.05)'
                  : 'rgba(217,184,142,0.1)'
                : 'transparent',
              color: isActive ? ink : isEx ? '#7A6E5E' : 'rgba(232,227,216,0.55)',
              fontFamily: 'var(--serif)',
              fontSize: isMobile ? 13 : 14,
              fontWeight: isActive ? 600 : 500,
              fontStyle: isActive ? 'normal' : 'italic',
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? 6 : 8,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
            {/* mobile: 副标题（如"与世界的会面"）隐藏，只保留 emoji + 主标签 */}
            {!isMobile && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  letterSpacing: 0.3,
                  opacity: 0.7,
                  fontStyle: 'normal',
                  fontWeight: 400,
                }}
              >
                {it.sub}
              </span>
            )}
            {isActive && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  background: tone,
                  marginLeft: 4,
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default WorldShell;
