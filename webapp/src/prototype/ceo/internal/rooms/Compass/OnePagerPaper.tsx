// Compass · ⑥ 一页纸摘要
// 数据源: ceo_briefs 最新版本，渲染 toc 前 5 条 + 元信息
// PR12 接 LLM 后由 g4 自动写入 body_md

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
}

export function OnePagerPaper() {
  const [brief, setBrief] = useState<Brief | null>(null);
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
    return <div style={{ fontSize: 13, color: 'rgba(26,46,61,0.5)', fontStyle: 'italic' }}>加载…</div>;
  }
  if (!brief) {
    return (
      <div
        style={{
          padding: '20px 18px',
          background: 'rgba(62,110,140,0.04)',
          border: '1px dashed rgba(62,110,140,0.3)',
          borderRadius: 4,
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'rgba(26,46,61,0.62)',
          lineHeight: 1.7,
        }}
      >
        无简报数据。Seed 后会有一份 BOARD #14 v3 草稿 (16 页 / 6 章节 / 2 章 future-tagged)。
      </div>
    );
  }

  const toc = (brief.toc ?? []).slice(0, 5);
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #F3ECDD 0%, #E8DDC2 100%)',
        color: '#1A1410',
        padding: '16px 18px',
        borderRadius: 4,
        fontFamily: 'var(--serif)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          letterSpacing: '0.25em',
          color: 'rgba(26,20,16,0.55)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {brief.board_session ?? 'BOARD'} · v{brief.version} · {brief.status}
      </div>
      <div
        style={{
          fontStyle: 'italic',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 10,
          lineHeight: 1.4,
        }}
      >
        本季要董事会盖章的事:三件 — 节奏 / 退出 / Stellar
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {toc.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              fontSize: 11.5,
              color: s.future_tagged ? '#A8451E' : 'inherit',
              fontWeight: s.future_tagged ? 600 : 500,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: '#D4A84B',
                width: 18,
              }}
            >
              {s.num}
            </span>
            <span style={{ flex: 1 }}>{s.title}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(26,20,16,0.45)' }}>
              {s.pages}
            </span>
          </div>
        ))}
      </div>
      {brief.toc.length > 5 && (
        <div
          style={{
            marginTop: 8,
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'rgba(26,20,16,0.5)',
            letterSpacing: 0.2,
          }}
        >
          共 {brief.toc.length} 章节 · {brief.page_count ?? '?'} 页 · 完整版见 Boardroom ②
        </div>
      )}
    </div>
  );
}
