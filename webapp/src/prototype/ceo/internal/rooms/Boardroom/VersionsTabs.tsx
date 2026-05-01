// Boardroom · ⑥ versions Tabs
// 两个版本: 一页纸版 vs 完整套版
// 接 ceo_briefs 真数据，按 toc 长度切分

import { useEffect, useState } from 'react';

interface Brief {
  id: string;
  scope_id: string | null;
  board_session: string | null;
  version: number;
  toc: Array<{ num?: string; title?: string; pages?: string; future_tagged?: boolean }>;
  page_count: number | null;
  status: string;
  generated_at: string | null;
  read_at: string | null;
  updated_at: string;
}

export function VersionsTabs() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [tab, setTab] = useState<'onepager' | 'deck'>('onepager');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ceo/boardroom/briefs')
      .then((r) => r.json())
      .then((d: { items: Brief[] }) => {
        if (cancelled) return;
        setBrief(d.items[0] ?? null);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div style={{ fontSize: 13, color: 'rgba(240,232,214,0.5)', fontStyle: 'italic' }}>加载…</div>;
  }
  if (!brief) {
    return (
      <div
        style={{
          padding: '20px 18px',
          background: 'rgba(212,168,75,0.05)',
          border: '1px dashed rgba(212,168,75,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'rgba(240,232,214,0.6)',
          lineHeight: 1.7,
        }}
      >
        无简报数据。Seed 后会有一份草稿。
      </div>
    );
  }

  const toc = brief.toc ?? [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['onepager', 'deck'] as const).map((id) => {
          const isActive = tab === id;
          const label = id === 'onepager' ? '📄 一页纸版' : `📚 完整套版 (${brief.page_count ?? '?'} 页)`;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '7px 14px',
                border: `1px solid ${isActive ? '#D4A84B' : 'rgba(212,168,75,0.2)'}`,
                background: isActive ? 'rgba(212,168,75,0.15)' : 'transparent',
                color: isActive ? '#F0E8D6' : 'rgba(240,232,214,0.6)',
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

      {tab === 'onepager' && (
        <div
          style={{
            background: 'linear-gradient(180deg, #F3ECDD 0%, #E8DDC2 100%)',
            color: '#1A1410',
            padding: '20px 24px',
            borderRadius: 4,
            fontFamily: 'var(--serif)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: '#D4A84B',
            }}
          />
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              letterSpacing: '0.25em',
              color: 'rgba(26,20,16,0.55)',
              textTransform: 'uppercase',
            }}
          >
            {brief.board_session ?? 'BOARD'} · v{brief.version} · 一页纸版
          </div>
          <div
            style={{
              fontStyle: 'italic',
              fontSize: 18,
              fontWeight: 600,
              margin: '6px 0 16px',
              lineHeight: 1.4,
            }}
          >
            本季要董事会盖章的事:三件 — 节奏 / 退出 / Stellar
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Section title="① 主要进展">
              <p>Halycon Q1 ARR +47%，新签 2 单战略客户。Beacon 退出协议主体条款达成，5 月签字。</p>
            </Section>
            <Section title="② 主要风险">
              <p>Stellar 估值反复 5 次（流程层）。Crucible 创始人失联第 4 周（已建议止损）。</p>
            </Section>
            <Section title="③ 决定与承诺">
              <p>《估值锚定五条》本月内书面化。Halycon 团队补员 3 人于 Q2 内完成。</p>
            </Section>
            <Section title="④ 下次议题">
              <p>退出路径年度路线图。LP 反馈闭环机制（已逾期 28 天，须明确责任人）。</p>
            </Section>
          </div>
        </div>
      )}

      {tab === 'deck' && (
        <div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(240,232,214,0.5)',
              marginBottom: 10,
              letterSpacing: 0.2,
            }}
          >
            完整版目录 · {toc.length} 章节 · {brief.page_count ?? '?'} 页
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {toc.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  padding: '8px 12px',
                  background: s.future_tagged ? 'rgba(168,69,30,0.08)' : 'rgba(212,168,75,0.04)',
                  border: '1px solid rgba(212,168,75,0.18)',
                  borderLeft: s.future_tagged ? '3px solid #FFB89A' : '3px solid rgba(212,168,75,0.4)',
                  borderRadius: '0 3px 3px 0',
                  fontSize: 12.5,
                  color: '#F0E8D6',
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: '#D4A84B',
                    fontWeight: 600,
                    width: 22,
                  }}
                >
                  {s.num}
                </span>
                <span style={{ flex: 1 }}>{s.title}</span>
                {s.future_tagged && (
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      padding: '2px 8px',
                      background: 'rgba(255,184,154,0.18)',
                      color: '#FFB89A',
                      border: '1px solid rgba(255,184,154,0.4)',
                      borderRadius: 99,
                      letterSpacing: 0.2,
                    }}
                  >
                    future
                  </span>
                )}
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'rgba(240,232,214,0.5)',
                  }}
                >
                  {s.pages}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          color: '#D4A84B',
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: 'rgba(26,20,16,0.85)' }}>{children}</div>
    </div>
  );
}
