// War Room · ④/⑤ 阵型分析 (Tabs)
// 来源: 07-archive/会议纪要 (20260501)/war-room.html .gaps + .sparks
// R2-5: Sparks tab 升级为 3D 翻面卡 + reroll 骰子动画 + 后端真数据

import { useEffect, useState } from 'react';
import { GAPS, type GapCard } from './_warRoomFixtures';
import { SparkCard, type SparkRow } from './SparkCardComponent';

interface Props {
  gaps?: GapCard[];
}

const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function FormationAnalysis({ gaps = GAPS }: Props) {
  const [tab, setTab] = useState<'gaps' | 'sparks'>('gaps');
  const [sparks, setSparks] = useState<SparkRow[]>([]);
  const [seed, setSeed] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [diceFace, setDiceFace] = useState(2);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'sparks') return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/ceo/war-room/sparks?seed=${seed}&limit=4`)
      .then((r) => r.json())
      .then((d: { items: SparkRow[] }) => {
        if (cancelled) return;
        setSparks(d.items ?? []);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, seed]);

  const reroll = () => {
    if (rolling) return;
    setRolling(true);
    let i = 0;
    const id = setInterval(() => {
      setDiceFace(i % 6);
      i++;
      if (i > 11) {
        clearInterval(id);
        setRolling(false);
        setSeed((s) => s + 1);
      }
    }, 80);
  };

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: 'rgba(245,217,217,0.5)',
                letterSpacing: 0.2,
              }}
            >
              基于 12 位专家批注 · 87 场会议 · 34 个心智模型 · 第 {(seed % 3) + 1}/3 组
            </span>
            <button
              onClick={reroll}
              disabled={rolling}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                background: 'rgba(200,161,92,0.1)',
                border: '1px solid rgba(200,161,92,0.5)',
                color: '#C8A15C',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                borderRadius: 4,
                cursor: rolling ? 'wait' : 'pointer',
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  display: 'inline-block',
                  transition: 'transform 0.1s',
                  transform: rolling ? 'rotate(45deg)' : 'rotate(0)',
                }}
              >
                {DICE[diceFace]}
              </span>
              {rolling ? '骰中…' : '再来一组'}
            </button>
          </div>

          {loading && (
            <div
              style={{
                padding: '20px',
                color: 'rgba(245,217,217,0.5)',
                fontStyle: 'italic',
                textAlign: 'center',
                fontSize: 12,
              }}
            >
              加载灵光…
            </div>
          )}

          {!loading && sparks.length === 0 && (
            <div
              style={{
                padding: '20px',
                color: 'rgba(245,217,217,0.55)',
                fontStyle: 'italic',
                textAlign: 'center',
                fontSize: 12,
                background: 'rgba(214,69,69,0.05)',
                border: '1px dashed rgba(214,69,69,0.3)',
                borderRadius: 4,
              }}
            >
              无候选。先 seed: cd api && npm run ceo:seed-demo
            </div>
          )}

          {!loading && sparks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {sparks.map((s) => (
                <SparkCard
                  key={s.id}
                  spark={s}
                  onAdopt={(id) => {
                    const t = document.createElement('div');
                    t.textContent = `✓ 采纳: ${id.slice(0, 8)} (后续接入议程系统)`;
                    t.style.cssText =
                      'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:#1A0E0E;color:#C8A15C;border:1px solid #C8A15C;padding:10px 18px;border-radius:4px;font-family:var(--serif);font-style:italic;font-size:13px;z-index:9999';
                    document.body.appendChild(t);
                    setTimeout(() => t.remove(), 2500);
                  }}
                  onReplace={() => setSeed((s) => s + 1)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
