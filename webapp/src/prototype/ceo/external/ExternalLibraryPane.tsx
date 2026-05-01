// External · 库 — 外部世界 · 三轴库摘要面板
// 来源: 07-archive/会议纪要 (20260501)/world-shell.jsx ExternalLibraryPane

import { useNavigate } from 'react-router-dom';

interface AxisCard {
  axis: string;
  sub: string;
  c: string;
  tabs: string[];
  to: string;
}

const AXES: AxisCard[] = [
  {
    axis: '人物轴',
    sub: '7 个子 tab',
    c: '#D64545',
    to: '/meeting/axes/people',
    tabs: [
      '承诺与兑现',
      '角色画像演化',
      '发言质量',
      '沉默信号(+RASIC)',
      '信念轨迹',
      '阵型 · 新',
      '盲区档案 · 新',
    ],
  },
  {
    axis: '项目轴',
    sub: '6 个子 tab',
    c: '#7BA7C4',
    to: '/meeting/axes/projects',
    tabs: [
      '决策溯源(链+树)',
      '假设清单(强化)',
      '未解问题',
      '风险与收益',
      '责任盘点 · 新',
      '对外影响 · 新',
    ],
  },
  {
    axis: '知识轴',
    sub: '8 个子 tab',
    c: '#D9B88E',
    to: '/meeting/axes/knowledge',
    tabs: [
      '认知沉淀',
      '心智模型',
      '证据层级',
      '反事实/未走的路',
      '共识与分歧 · 新',
      '概念辨析 · 新',
      '议题谱系与健康 · 新',
      '外脑批注 · 新',
    ],
  },
];

export function ExternalLibraryPane() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: '32px 44px' }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          color: '#8A7C6A',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        External · 库
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
        人物 · 项目 · 知识
      </h1>
      <p
        style={{
          color: '#5A5146',
          fontSize: 14,
          maxWidth: 720,
          lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        同一批会议数据的三种投射。子 tab 清单 7 / 6 / 8 已就位。
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 18,
          maxWidth: 1100,
        }}
      >
        {AXES.map((a, i) => (
          <button
            key={i}
            onClick={() => navigate(a.to)}
            style={{
              textAlign: 'left',
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderLeft: `3px solid ${a.c}`,
              borderRadius: 5,
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
                color: a.c,
                letterSpacing: 0.3,
              }}
            >
              {a.sub}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 19,
                fontWeight: 600,
                marginTop: 6,
                marginBottom: 12,
              }}
            >
              {a.axis}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {a.tabs.map((t, ti) => {
                const isNew =
                  t.includes('新') || t.includes('RASIC') || t.includes('强化');
                return (
                  <div
                    key={ti}
                    style={{
                      fontSize: 12,
                      color: '#3A3228',
                      padding: '5px 9px',
                      background: isNew ? 'rgba(214,69,69,0.06)' : 'rgba(0,0,0,0.02)',
                      borderRadius: 3,
                      borderLeft: isNew ? `2px solid ${a.c}` : '2px solid transparent',
                    }}
                  >
                    {t}
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ExternalLibraryPane;
