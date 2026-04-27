// 原型原子组件 — 来自 /tmp/mn-proto/shared.jsx 直译
// 保留原型 inline style + oklch，不向 Tailwind 翻译

import type { CSSProperties, ReactNode } from 'react';

// ── Icon ─────────────────────────────────────────────────────
export type IconName =
  | 'upload' | 'folder' | 'sparkle' | 'users' | 'scale' | 'compass'
  | 'target' | 'git' | 'network' | 'arrow' | 'check' | 'x' | 'dot'
  | 'expand' | 'play' | 'mic' | 'clock' | 'bolt' | 'chevron'
  | 'chevronDown' | 'layers' | 'search' | 'plus' | 'wand' | 'book' | 'ledger'
  | 'info';

export function Icon({
  name, size = 16, stroke = 1.5, style,
}: { name: IconName; size?: number; stroke?: number; style?: CSSProperties }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style,
  };
  const paths: Record<IconName, ReactNode> = {
    upload:      (<><path d="M12 3v13" /><path d="M7 8l5-5 5 5" /><path d="M4 21h16" /></>),
    folder:      (<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>),
    sparkle:     (<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></>),
    users:       (<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M21 20c0-2.5-1.8-4-4-4" /></>),
    scale:       (<><path d="M12 4v16" /><path d="M4 9h16" /><path d="M4 9l-2 5a4 4 0 0 0 8 0z" /><path d="M20 9l2 5a4 4 0 0 1-8 0z" /></>),
    compass:     (<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>),
    target:      (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>),
    git:         (<><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8" /><path d="M8 6h4a4 4 0 0 1 4 4v0" /></>),
    network:     (<><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10" /><path d="M6 8l5 8" /><path d="M18 8l-5 8" /></>),
    arrow:       (<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>),
    check:       (<><path d="M5 13l4 4L19 7" /></>),
    x:           (<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>),
    dot:         (<><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>),
    expand:      (<><path d="M4 10V4h6" /><path d="M20 14v6h-6" /><path d="M4 4l6 6" /><path d="M20 20l-6-6" /></>),
    play:        (<><path d="M6 4l14 8-14 8z" fill="currentColor" /></>),
    mic:         (<><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>),
    clock:       (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    bolt:        (<><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></>),
    chevron:     (<><path d="M9 6l6 6-6 6" /></>),
    chevronDown: (<><path d="M6 9l6 6 6-6" /></>),
    layers:      (<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 18l9 5 9-5" /></>),
    search:      (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>),
    plus:        (<><path d="M12 5v14" /><path d="M5 12h14" /></>),
    wand:        (<><path d="M3 21l12-12" /><path d="M15 3v3" /><path d="M19 7h3" /><path d="M17 5l2 2" /><path d="M13 1v2" /></>),
    book:        (<><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" /><path d="M5 4v12" /></>),
    ledger:      (<><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16" /><path d="M9 4v16" /></>),
    info:        (<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v5h1" /></>),
  };
  return <svg {...common}>{paths[name] || null}</svg>;
}

// ── Moment normalize ─────────────────────────────────────────
// mn_tensions.moments 字段在 mock 里是字符串 "永邦：「...」"，从 API 拉过来时
// 是 { who, text } 对象。React 不能直接渲染对象 → 4 处使用都得统一 normalize。
// 这里给一个 helper：保留 string 形态、把 object 拼成 "who：text"。
export type Moment = string | { who?: string; text?: string } | null | undefined;

export function momentToText(m: Moment): string {
  if (m == null) return '';
  if (typeof m === 'string') return m;
  if (typeof m !== 'object') return String(m);
  const who = (m as any).who ? String((m as any).who) : '';
  const text = (m as any).text ? String((m as any).text) : '';
  return who ? `${who}：${text}` : text;
}

/** 用法等价：moment = { who: '永邦', text: '...' } → "永邦" / "永邦：..."  */
export function momentSpeaker(m: Moment): string {
  if (m == null) return '';
  if (typeof m === 'string') {
    const colon = m.search(/[:：]/);
    return colon > 0 ? m.slice(0, colon).trim() : '';
  }
  if (typeof m === 'object') return String((m as any).who ?? '').trim();
  return '';
}

/** 用法等价：moment = { who: '永邦', text: '...' } → 文字部分（不含 speaker） */
export function momentBody(m: Moment): string {
  if (m == null) return '';
  if (typeof m === 'string') {
    const colon = m.search(/[:：]/);
    return colon > 0 ? m.slice(colon + 1).trim() : m.trim();
  }
  if (typeof m === 'object') return String((m as any).text ?? '').trim();
  return String(m);
}

// ── Avatar ───────────────────────────────────────────────────
export type Tone = 'warm' | 'cool' | 'neutral';

export const TONE: Record<Tone, { bg: string; fg: string }> = {
  warm:    { bg: 'oklch(0.92 0.04 40)',  fg: 'oklch(0.38 0.1 40)' },
  cool:    { bg: 'oklch(0.93 0.03 200)', fg: 'oklch(0.38 0.08 200)' },
  neutral: { bg: 'oklch(0.92 0.008 75)', fg: 'oklch(0.32 0.01 60)' },
};

export function Avatar({
  p, size = 28, radius = 6, style,
}: {
  p: { initials: string; tone: Tone };
  size?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: TONE[p.tone].bg, color: TONE[p.tone].fg,
      fontFamily: 'var(--sans)', fontWeight: 600,
      fontSize: size * 0.42,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      letterSpacing: p.initials.length > 1 ? '-0.02em' : 0,
      flexShrink: 0,
      ...style,
    }}>
      {p.initials}
    </div>
  );
}

// ── Chip ─────────────────────────────────────────────────────
export type ChipTone = 'ink' | 'accent' | 'teal' | 'amber' | 'ghost';

export function Chip({
  children, tone = 'ink', style,
}: { children: ReactNode; tone?: ChipTone; style?: CSSProperties }) {
  const tones: Record<ChipTone, { bg: string; fg: string; bd: string }> = {
    ink:    { bg: 'oklch(0.94 0.005 75)', fg: 'var(--ink-2)',              bd: 'var(--line)' },
    accent: { bg: 'var(--accent-soft)',   fg: 'oklch(0.35 0.1 40)',        bd: 'oklch(0.85 0.07 40)' },
    teal:   { bg: 'var(--teal-soft)',     fg: 'oklch(0.32 0.08 200)',      bd: 'oklch(0.85 0.05 200)' },
    amber:  { bg: 'var(--amber-soft)',    fg: 'oklch(0.38 0.09 75)',       bd: 'oklch(0.85 0.07 75)' },
    ghost:  { bg: 'transparent',          fg: 'var(--ink-3)',              bd: 'var(--line)' },
  };
  const t = tones[tone] || tones.ink;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontFamily: 'var(--sans)', letterSpacing: 0.1, ...style,
    }}>
      {children}
    </span>
  );
}

// ── Dot ──────────────────────────────────────────────────────
export function Dot({
  color = 'var(--accent)', size = 6, style,
}: { color?: string; size?: number; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: 99, background: color, ...style,
    }} />
  );
}

// ── MonoMeta ─────────────────────────────────────────────────
export function MonoMeta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 11,
      color: 'var(--ink-3)', letterSpacing: 0.2, ...style,
    }}>
      {children}
    </span>
  );
}

// ── SectionLabel ─────────────────────────────────────────────
export function SectionLabel({
  children, num, style,
}: { children: ReactNode; num?: string; style?: CSSProperties }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'var(--ink-3)', ...style,
    }}>
      {num && <span style={{ color: 'var(--ink-4)' }}>§{num}</span>}
      {children}
    </div>
  );
}

// ── StatTile（原型里 dimensions-meta.jsx 高频复用） ──────────
export function StatTile({
  label, value, sub, tone,
}: { label: string; value: ReactNode; sub?: string; tone?: ChipTone }) {
  const bg = tone === 'accent' ? 'var(--accent-soft)'
           : tone === 'teal'   ? 'var(--teal-soft)'
           : tone === 'amber'  ? 'var(--amber-soft)'
           : 'var(--paper-2)';
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8, background: bg,
      border: '1px solid var(--line-2)', minWidth: 120,
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
        letterSpacing: 0.3, textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600,
        marginTop: 4, color: 'var(--ink)',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── MockBadge（[mock] 角标） ─────────────────────────────────
export function MockBadge({ style }: { style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 6px', borderRadius: 3, fontSize: 9.5,
      fontFamily: 'var(--mono)', letterSpacing: 0.4,
      background: 'oklch(0.93 0.05 80)', color: 'oklch(0.42 0.1 70)',
      border: '1px solid oklch(0.82 0.06 75)',
      textTransform: 'uppercase', ...style,
    }}>
      mock
    </span>
  );
}
