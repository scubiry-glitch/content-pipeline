// _axisShared.tsx — DimShell + helpers shared across the 4 axis pages
// 原型来源：/tmp/mn-proto/dimensions-people.jsx DimShell / CalloutCard 等

import { type ReactNode } from 'react';
import { Icon, MonoMeta, SectionLabel } from './_atoms';
import type { IconName } from './_atoms';

export type AxisName = '人物' | '项目' | '知识' | '会议本身';

export interface TabDef {
  id: string;
  label: string;
  sub: string;
  icon: IconName;
}

function axisColorFor(axis: string): string {
  if (axis === '人物') return 'var(--accent)';
  if (axis === '项目') return 'var(--teal)';
  if (axis === '知识') return 'var(--amber)';
  return 'var(--ink)';
}

function CrossAxisLink({ axis }: { axis: string }) {
  void axis;
  return (
    <button style={{
      border: '1px solid var(--line)', background: 'transparent', borderRadius: 5,
      padding: '4px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--ink-3)',
      display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--sans)',
    }}>
      <Icon name="network" size={11} /> 跨轴
    </button>
  );
}

function ScopePill() {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)',
      background: 'var(--paper-2)', border: '1px solid var(--line-2)',
      borderRadius: 99, padding: '3px 10px',
    }}>远翎 Q2</span>
  );
}

function RunBadge({ axis }: { axis: string }) {
  void axis;
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
      background: 'var(--paper-3)', border: '1px solid var(--line-2)',
      borderRadius: 4, padding: '2px 7px',
    }}>上次: 今天</span>
  );
}

export function DimShell({ axis, tabs, tab, setTab, children }: {
  axis: AxisName;
  tabs: TabDef[];
  tab: string;
  setTab: (id: string) => void;
  children: ReactNode;
}) {
  const axisColor = axisColorFor(axis);
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--paper)',
      display: 'grid', gridTemplateRows: '64px 1fr', color: 'var(--ink)',
      fontFamily: 'var(--sans)', overflow: 'hidden',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px',
        borderBottom: '1px solid var(--line-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 7,
            background: 'var(--paper-2)', border: '1px solid var(--line-2)',
            borderLeft: `3px solid ${axisColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, color: 'var(--ink)',
          }}>{axis[0]}</div>
          <div>
            <MonoMeta style={{ fontSize: 10 }}>AXIS · 一库多视图</MonoMeta>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.005em', marginTop: -2 }}>
              {axis}轴
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', marginLeft: 18, gap: 2, border: '1px solid var(--line)', borderRadius: 6, padding: 2 }}>
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} title={t.sub} style={{
                padding: '6px 13px', border: 0, borderRadius: 4, fontSize: 12.5,
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--paper)' : 'var(--ink-2)',
                cursor: 'pointer', fontWeight: active ? 600 : 450,
                fontFamily: 'var(--sans)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Icon name={t.icon} size={12} />{t.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {tabs.map((t) => t.id === tab ? (
            <span key={t.id} style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.sub}</span>
          ) : null)}
          <CrossAxisLink axis={axis} />
          <ScopePill />
          <button title="重新生成此轴数据" style={{
            border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 5,
            padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', color: 'var(--ink-2)',
            display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--sans)',
          }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span> 重算
          </button>
          <RunBadge axis={axis + '轴'} />
        </div>
      </header>

      <div style={{ overflow: 'auto' }}>{children}</div>
    </div>
  );
}

export function CalloutCard({ title, children, tone = 'ink' }: {
  title: string;
  children: ReactNode;
  tone?: 'ink' | 'accent' | 'teal';
}) {
  const bg = tone === 'accent' ? 'var(--accent-soft)' : tone === 'teal' ? 'var(--teal-soft)' : 'var(--paper-2)';
  const bd = tone === 'accent' ? 'oklch(0.85 0.07 40)' : tone === 'teal' ? 'oklch(0.85 0.05 200)' : 'var(--line-2)';
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 6, padding: '14px 16px' }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, color: 'var(--ink-2)', fontFamily: 'var(--serif)' }}>
        {children}
      </div>
    </div>
  );
}

export function StatCell({ l, v }: { l: string; v: string | number }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 5 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{l}</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, marginTop: 2, letterSpacing: '-0.01em' }}>{v}</div>
    </div>
  );
}

export function BigStat({ label, v, accent }: { label: string; v: string | number; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <MonoMeta style={{ fontSize: 9.5 }}>{label}</MonoMeta>
      <div style={{
        fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600,
        color: accent ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.01em',
      }}>{v}</div>
    </div>
  );
}
