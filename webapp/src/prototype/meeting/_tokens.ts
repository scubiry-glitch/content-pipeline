// 会议纪要原型 style 片段 + 语义色常量
// 配合 _tokens.css 使用；组件里直接用 style={{ color: 'var(--ink)' }} 或 style={serifHeadingStyle}

import type { CSSProperties } from 'react';

// 语义色名（仅作为文档/类型，CSS 变量才是真相源）
export const SEMANTIC = {
  ink:       'var(--ink)',
  ink2:      'var(--ink-2)',
  ink3:      'var(--ink-3)',
  ink4:      'var(--ink-4)',
  paper:     'var(--paper)',
  paper2:    'var(--paper-2)',
  paper3:    'var(--paper-3)',
  line:      'var(--line)',
  line2:     'var(--line-2)',
  accent:    'var(--accent)',
  accentSoft:'var(--accent-soft)',
  teal:      'var(--teal)',
  tealSoft:  'var(--teal-soft)',
  amber:     'var(--amber)',
  amberSoft: 'var(--amber-soft)',
  sans:      'var(--sans)',
  serif:     'var(--serif)',
  mono:      'var(--mono)',
} as const;

// 常用 style 片段
export const serifHeadingStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  margin: 0,
};

export const monoMetaStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  color: 'var(--ink-3)',
  letterSpacing: 0.2,
};

export const paperCardStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  padding: '16px 18px',
};

export const sectionLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontFamily: 'var(--mono)',
  fontSize: 10.5,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
};

// 按钮样式（原型里 btnPrimary / btnGhost）
export const btnPrimary: CSSProperties = {
  padding: '9px 18px',
  border: '1px solid var(--ink)',
  background: 'var(--ink)',
  color: 'var(--paper)',
  borderRadius: 5,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
};

export const btnGhost: CSSProperties = {
  padding: '9px 18px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  color: 'var(--ink-2)',
  borderRadius: 5,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
};

// 轴 → 色系（替代 components/meeting-notes/shared.tsx 的 AXIS_COLOR）
export const AXIS_TONE = {
  people:    'accent' as const,
  projects:  'teal' as const,
  knowledge: 'amber' as const,
  meta:      'ink' as const,
};

// run 状态 → 语义
export const RUN_TONE = {
  queued:    { bg: 'var(--line-2)', fg: 'var(--ink-3)' },
  running:   { bg: 'var(--teal-soft)', fg: 'oklch(0.32 0.08 200)' },
  succeeded: { bg: 'var(--accent-soft)', fg: 'oklch(0.35 0.1 40)' },
  failed:    { bg: 'oklch(0.92 0.05 30)', fg: 'oklch(0.42 0.18 25)' },
  cancelled: { bg: 'var(--paper-3)', fg: 'var(--ink-4)' },
};
