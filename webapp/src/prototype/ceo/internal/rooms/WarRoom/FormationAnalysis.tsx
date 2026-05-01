// War Room · ④/⑤ 阵型分析 (Tabs)
// 来源: 07-archive/会议纪要 (20260501)/war-room.html .gaps + .sparks

import { useState } from 'react';
import { GAPS, SPARKS, type GapCard, type SparkCard } from './_warRoomFixtures';

interface Props {
  gaps?: GapCard[];
  sparks?: SparkCard[];
}

export function FormationAnalysis({ gaps = GAPS, sparks = SPARKS }: Props) {
  const [tab, setTab] = useState<'gaps' | 'sparks'>('gaps');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['gaps', 'sparks'] as const).map((id) => {
          const isActive = tab === id;
          const label = id === 'gaps' ? '⚠️ 阵型缺口 · 现状诊断' : '💡 灵光一闪 · 未来组合';
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '7px 14px',
                border: `1px solid ${isActive ? '#D64545' : 'rgba(214,69,69,0.2)'}`,
                background: isActive ? 'rgba(214,69,69,0.15)' : 'transparent',
                color: isActive ? '#F5D9D9' : 'rgba(245,217,217,0.6)',
                fontFamily: 'var(--serif)',
                fontStyle: isActive ? 'normal' : 'italic',
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'gaps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gaps.map((g, i) => (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                background: 'rgba(214,69,69,0.05)',
                border: '1px solid rgba(214,69,69,0.18)',
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  color: '#F5D9D9',
                  lineHeight: 1.55,
                  marginBottom: 6,
                }}
                dangerouslySetInnerHTML={{
                  __html: g.text.replace(/<b>(.+?)<\/b>/g, '<b style="color:#FFB89A;font-weight:600;">$1</b>'),
                }}
              />
              <a
                href="#action"
                onClick={(e) => e.preventDefault()}
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 11.5,
                  color: '#D64545',
                  textDecoration: 'none',
                }}
              >
                → {g.action}
              </a>
            </div>
          ))}
        </div>
      )}

      {tab === 'sparks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'rgba(245,217,217,0.5)',
              marginBottom: 4,
              letterSpacing: 0.2,
            }}
          >
            基于 12 位专家批注 · 87 场会议 · 34 个心智模型
          </div>
          {sparks.map((s, i) => (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                background: 'rgba(200,161,92,0.06)',
                border: '1px solid rgba(200,161,92,0.25)',
                borderLeft: '3px solid #C8A15C',
                borderRadius: '0 4px 4px 0',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: '#C8A15C',
                  letterSpacing: 0.2,
                  marginBottom: 4,
                }}
              >
                {s.tag}
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: '#F5D9D9',
                  lineHeight: 1.5,
                  marginBottom: 6,
                }}
              >
                {s.headline}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(245,217,217,0.6)',
                  lineHeight: 1.5,
                }}
              >
                {s.evidence}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
