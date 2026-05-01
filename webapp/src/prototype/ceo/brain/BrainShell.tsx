// Internal · 外脑图书馆 · 子壳
// 5 子页面: tasks / content-library / expert-library / assets / hot-topics
// 完整实现见 PR11

import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const SUB_PAGES = [
  { slug: 'tasks', label: '任务队列', icon: '📋', sub: '跨模块运行任务' },
  { slug: 'expert-library', label: '专家库', icon: '👥', sub: '认知数字孪生' },
  { slug: 'content-library', label: '内容库', icon: '📚', sub: '结构化记忆' },
  { slug: 'assets', label: '素材市集', icon: '📦', sub: '研报 / 资产' },
  { slug: 'hot-topics', label: '热议题', icon: '🔥', sub: '议题谱系' },
];

export function BrainShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSlug = pathname.split('/').pop();

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '24px 44px 60px',
        color: '#F3ECDD',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: '#D9B88E',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          opacity: 0.8,
        }}
      >
        Internal · 外脑图书馆
      </div>
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 32,
          fontWeight: 500,
          margin: '4px 0 18px',
          letterSpacing: '-0.015em',
        }}
      >
        永久的认知资产
      </h1>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        {SUB_PAGES.map((p) => {
          const isActive = activeSlug === p.slug;
          return (
            <button
              key={p.slug}
              onClick={() => navigate(`/ceo/internal/brain/${p.slug}`)}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: `1px solid ${isActive ? '#D9B88E' : 'rgba(217,184,142,0.2)'}`,
                background: isActive ? 'rgba(217,184,142,0.15)' : 'transparent',
                color: isActive ? '#F3ECDD' : 'rgba(232,227,216,0.65)',
                fontFamily: 'var(--serif)',
                fontStyle: isActive ? 'normal' : 'italic',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{p.icon}</span>
              {p.label}
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  opacity: 0.6,
                  fontStyle: 'normal',
                  fontWeight: 400,
                  marginLeft: 4,
                }}
              >
                {p.sub}
              </span>
            </button>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}

export default BrainShell;
