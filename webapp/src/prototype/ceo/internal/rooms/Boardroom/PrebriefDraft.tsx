// Boardroom · ② 预读包草稿 (paper TOC)
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html .prebrief-paper

import { PREBRIEF } from './_boardroomFixtures';

export function PrebriefDraft() {
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
        {PREBRIEF.meta}
      </div>
      <div
        style={{
          fontStyle: 'italic',
          fontSize: 16,
          fontWeight: 600,
          marginTop: 6,
          marginBottom: 14,
          lineHeight: 1.4,
        }}
      >
        {PREBRIEF.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PREBRIEF.sections.map((s) => (
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
            <span style={{ flex: 1, fontSize: 13 }}>{s.title}</span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'rgba(26,20,16,0.45)',
              }}
            >
              {s.pages}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid rgba(26,20,16,0.12)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            color: 'rgba(26,20,16,0.5)',
            letterSpacing: '0.15em',
          }}
        >
          {PREBRIEF.footer}
        </span>
        <a
          href="#edit"
          onClick={(e) => e.preventDefault()}
          style={{
            fontStyle: 'italic',
            fontSize: 12,
            color: '#A8451E',
            textDecoration: 'none',
          }}
        >
          → 编辑预读包
        </a>
      </div>
    </div>
  );
}
