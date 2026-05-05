// Boardroom · ② 预读包草稿 (paper TOC)
// 数据源: /api/v1/ceo/boardroom/briefs → items[0].toc (boardroom-brief-toc 写入)
// fallback: forceMock=true 或 API 空时, 用 _boardroomFixtures.PREBRIEF

import { useEffect, useMemo, useState } from 'react';
import { PREBRIEF } from './_boardroomFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface BriefItem {
  id: string;
  scope_id: string;
  board_session: string | null;
  page_count: number | null;
  status: string | null;
  toc: any;
  body_md: string | null;
  generated_at: string | null;
}

interface PrebriefSection {
  num: string;
  title: string;
  pages: string;
  highlight?: boolean;
}

interface PrebriefView {
  meta: string;
  title: string;
  sections: PrebriefSection[];
  footer: string;
}

function adapt(brief: BriefItem): PrebriefView {
  // toc 形态可能为 string 或数组; 数组中元素含 section/title/pages/summary
  let toc: any[] = [];
  if (Array.isArray(brief.toc)) toc = brief.toc;
  else if (typeof brief.toc === 'string') {
    try { toc = JSON.parse(brief.toc); } catch { /* ignore */ }
  }
  const sections: PrebriefSection[] = toc.slice(0, 8).map((t, i) => {
    const num = String(i + 1).padStart(2, '0');
    const title = String(t.section ?? t.title ?? '?');
    const pages = String(t.pages ?? `p.${i * 2 + 2}-${i * 2 + 3}`);
    // 命中关键词标 highlight
    const highlight = /兜底|风险|悬空|拍板|矛盾|裸奔/.test(title);
    return { num, title, pages, highlight };
  });
  const meta = `${brief.board_session ?? '?'} · ${(brief.status ?? 'DRAFT').toUpperCase()} v0.${(toc.length || 1)}`;
  const totalPages = brief.page_count ?? toc.length * 2;
  return {
    meta,
    title: `下次董事会预读包 · 自动汇编自 ${toc.length} 章 / ${totalPages} 页`,
    sections,
    footer: `${totalPages} PAGES · ${toc.length} CHAPTERS`,
  };
}

export function PrebriefDraft() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [brief, setBrief] = useState<BriefItem | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/boardroom/briefs${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const items = (d?.items as BriefItem[]) ?? [];
        // 取第一个有 toc 且非空的 brief
        const first = items.find((b) => b.toc && (Array.isArray(b.toc) ? b.toc.length > 0 : true)) ?? items[0] ?? null;
        setBrief(first);
      })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const view = useMemo<PrebriefView>(() => {
    if (forceMock || !brief) return PREBRIEF;
    const adapted = adapt(brief);
    if (adapted.sections.length === 0) return PREBRIEF;
    return adapted;
  }, [forceMock, brief]);

  return (
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
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#D4A84B' }} />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.25em', color: 'rgba(26,20,16,0.55)', textTransform: 'uppercase' }}>
        {view.meta}
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 16, fontWeight: 600, marginTop: 6, marginBottom: 14, lineHeight: 1.4 }}>
        {view.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {view.sections.map((s) => (
          <div
            key={s.num}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '6px 0',
              borderBottom: '1px dotted rgba(26,20,16,0.18)',
              fontWeight: s.highlight ? 700 : 500,
              color: s.highlight ? '#A8451E' : 'inherit',
            }}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#D4A84B', fontWeight: 600, width: 22 }}>
              {s.num}
            </span>
            <span style={{ flex: 1, fontSize: 13 }}>{s.title}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(26,20,16,0.45)' }}>
              {s.pages}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(26,20,16,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'rgba(26,20,16,0.5)', letterSpacing: '0.15em' }}>
          {view.footer}
        </span>
        <a href="#edit" onClick={(e) => e.preventDefault()} style={{ fontStyle: 'italic', fontSize: 12, color: '#A8451E', textDecoration: 'none' }}>
          → 编辑预读包
        </a>
      </div>
    </div>
  );
}
