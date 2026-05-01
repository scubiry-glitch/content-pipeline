// Compass · ⑦ Archives Tabs
// 历史档案 — 按 board_session 分组列出 ceo_briefs 全部版本

import { useEffect, useState } from 'react';

interface Brief {
  id: string;
  board_session: string | null;
  version: number;
  page_count: number | null;
  status: string;
  generated_at: string | null;
  updated_at: string;
}

export function ArchivesTabs() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ceo/boardroom/briefs')
      .then((r) => r.json())
      .then((d: { items: Brief[] }) => {
        if (cancelled) return;
        setBriefs(d.items);
        const first = d.items.find((b) => b.board_session)?.board_session ?? null;
        setActiveSession(first);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div style={{ fontSize: 13, color: 'rgba(26,46,61,0.5)', fontStyle: 'italic' }}>加载…</div>;
  }

  // 按 session 分组
  const sessions: Record<string, Brief[]> = {};
  for (const b of briefs) {
    const k = b.board_session ?? '未分类';
    (sessions[k] ??= []).push(b);
  }
  const sessionKeys = Object.keys(sessions);

  if (sessionKeys.length === 0) {
    return (
      <div
        style={{
          padding: '16px 18px',
          background: 'rgba(62,110,140,0.04)',
          border: '1px dashed rgba(62,110,140,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'rgba(26,46,61,0.62)',
        }}
      >
        无历史档案。每一份董事会预读包定稿后会出现在这里。
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {sessionKeys.map((k) => {
          const isActive = k === activeSession;
          return (
            <button
              key={k}
              onClick={() => setActiveSession(k)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${isActive ? '#3E6E8C' : '#D8CFBF'}`,
                background: isActive ? 'rgba(62,110,140,0.08)' : 'transparent',
                color: isActive ? '#1A2E3D' : 'rgba(26,46,61,0.65)',
                fontFamily: 'var(--serif)',
                fontStyle: isActive ? 'normal' : 'italic',
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {k}
              <span
                style={{
                  marginLeft: 6,
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  fontStyle: 'normal',
                  fontWeight: 400,
                  opacity: 0.6,
                }}
              >
                {sessions[k].length}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(activeSession ? sessions[activeSession] : []).map((b) => (
          <div
            key={b.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr auto auto',
              gap: 14,
              alignItems: 'center',
              padding: '8px 12px',
              background: '#FAF7F0',
              border: '1px solid #D8CFBF',
              borderLeft: `3px solid ${b.status === 'sent' ? '#6A9A5C' : b.status === 'draft' ? '#B89348' : '#D8CFBF'}`,
              borderRadius: '0 3px 3px 0',
              fontSize: 12,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: '#3E6E8C',
                fontWeight: 600,
              }}
            >
              v{b.version}
            </span>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                color: '#1A2E3D',
              }}
            >
              {b.page_count ?? '?'} 页 · {new Date(b.updated_at).toLocaleDateString('zh-CN')}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: 'rgba(26,46,61,0.5)',
              }}
            >
              {b.generated_at ? '已生成' : '草稿'}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                padding: '2px 9px',
                background:
                  b.status === 'sent'
                    ? 'rgba(106,154,92,0.15)'
                    : b.status === 'draft'
                    ? 'rgba(184,147,72,0.15)'
                    : 'rgba(216,207,191,0.4)',
                color:
                  b.status === 'sent'
                    ? '#5A8A4C'
                    : b.status === 'draft'
                    ? '#8A6F30'
                    : 'rgba(26,46,61,0.5)',
                borderRadius: 99,
                letterSpacing: 0.2,
              }}
            >
              {b.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
