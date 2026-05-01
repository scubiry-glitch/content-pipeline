// External · Meetings — 外部世界 · 会议摘要面板
// 来源: 07-archive/会议纪要 (20260501)/world-shell.jsx ExternalMeetingsPane
// 与现有 /meeting/* 原型保持深链接关系，不复制其复杂功能

import { useNavigate } from 'react-router-dom';

interface SummaryCard {
  t: string;
  sub: string;
  c: string;
  n: string;
  to: string;
}

const CARDS: SummaryCard[] = [
  {
    t: '今天',
    sub: '3 件事值得注意 · 待回复 2 / 待审批 1',
    c: '#D64545',
    n: '3',
    to: '/meeting/today',
  },
  {
    t: '本周关键会面',
    sub: '5 场高权重会议 · 2 场董事级',
    c: '#D9B88E',
    n: '5',
    to: '/meeting/library',
  },
  {
    t: '最近 48 场',
    sub: '可按项目 / 客户 / 主题分组筛选',
    c: '#7BA7C4',
    n: '48',
    to: '/meeting/library',
  },
];

export function ExternalMeetingsPane() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: '32px 44px', maxWidth: 1100 }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: '#8A7C6A',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        External · 会议
      </div>
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 34,
          fontWeight: 500,
          margin: '4px 0 18px',
          letterSpacing: '-0.015em',
        }}
      >
        与世界的会面
      </h1>
      <p
        style={{
          color: '#5A5146',
          fontSize: 14,
          maxWidth: 600,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        今天值得关注的会议 / 本周关键会面 / 最近 48 场 —— 从时间维度进入单场纪要。
        <br />
        <span style={{ fontStyle: 'italic', color: '#9A8C78' }}>
          (三轴/库视图请切换到右侧「📚 库」tab)
        </span>
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          maxWidth: 900,
        }}
      >
        {CARDS.map((g, i) => (
          <button
            key={i}
            onClick={() => navigate(g.to)}
            style={{
              textAlign: 'left',
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderLeft: `2px solid ${g.c}`,
              borderRadius: 4,
              padding: '18px 20px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: 'inherit',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: '#8A7C6A',
                letterSpacing: 0.3,
              }}
            >
              {g.n}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 17,
                fontWeight: 500,
                marginTop: 6,
              }}
            >
              {g.t}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: '#5A5146',
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {g.sub}
            </div>
            <div
              style={{
                marginTop: 10,
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 12,
                color: g.c,
              }}
            >
              进入 →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ExternalMeetingsPane;
