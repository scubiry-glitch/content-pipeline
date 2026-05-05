// _mockToggle.tsx — 全局 Mock 开关（仅手动切换）
// 放在 MeetingShell 顶层；所有 API 探测的页面读 useForceMock() 决定是否跳过 fetch

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'meeting-proto.forceMock';

interface MockToggleValue {
  forceMock: boolean;
  setForceMock: (v: boolean) => void;
}

const Ctx = createContext<MockToggleValue | null>(null);

export function MockToggleProvider({ children }: { children: ReactNode }) {
  const [forceMock, setForceMockState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  const setForceMock = useCallback((v: boolean) => {
    setForceMockState(v);
    try {
      if (v) window.localStorage.setItem(STORAGE_KEY, '1');
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }, []);

  const value = useMemo(
    () => ({ forceMock, setForceMock }),
    [forceMock, setForceMock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useForceMock(): boolean {
  const v = useContext(Ctx);
  return v?.forceMock ?? false;
}

export function useMockToggle(): MockToggleValue {
  const v = useContext(Ctx);
  if (!v) return { forceMock: false, setForceMock: () => {} };
  return v;
}

// ── MockToggleBar · 右下角收纳开关 ──────────────────────────────────────────

/**
 * 固定在视口右下角的 pill 开关。
 * 默认收起；绿色 API / 琥珀色 Mock；点击切换。
 * 键盘快捷键 Alt+M 切换。
 */
export function MockToggleBar() {
  const { forceMock, setForceMock } = useMockToggle();
  const [collapsed, setCollapsed] = useState(true);  // 默认收起

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setForceMock(!forceMock);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [forceMock, setForceMock]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="展开 Mock 开关"
        style={{
          position: 'fixed', right: 12, bottom: 12, zIndex: 60,
          width: 30, height: 30, borderRadius: 99,
          background: forceMock ? 'var(--amber, #D6A36A)' : 'var(--teal, #4B8E96)',
          color: 'var(--paper, #FAF7F0)', border: 0, cursor: 'pointer',
          fontFamily: 'var(--mono, "JetBrains Mono", ui-monospace, monospace)', fontSize: 11, fontWeight: 700,
          boxShadow: '0 4px 12px -4px rgba(0,0,0,0.25)',
        }}
      >
        {forceMock ? 'M' : 'A'}
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 60,
        background: 'var(--paper, #FAF7F0)', border: '1px solid var(--line, rgba(0,0,0,0.08))', borderRadius: 99,
        boxShadow: '0 6px 18px -6px rgba(0,0,0,0.18)',
        padding: 4, display: 'flex', alignItems: 'center', gap: 2,
        fontFamily: 'var(--sans, Inter, system-ui, sans-serif)', fontSize: 11.5,
      }}
    >
      <button
        onClick={() => setForceMock(false)}
        title="使用真实 API"
        style={{
          border: 0, cursor: 'pointer', padding: '5px 11px', borderRadius: 99,
          background: !forceMock ? 'var(--teal, #4B8E96)' : 'transparent',
          color: !forceMock ? 'var(--paper, #FAF7F0)' : 'var(--ink-2, #5A5146)',
          fontWeight: !forceMock ? 600 : 500, fontFamily: 'var(--sans, Inter, system-ui, sans-serif)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 99,
          background: !forceMock ? 'var(--paper, #FAF7F0)' : 'var(--teal, #4B8E96)',
        }} />
        API
      </button>
      <button
        onClick={() => setForceMock(true)}
        title="强制 Mock · 忽略所有 API 响应；用于 UI demo / 离线"
        style={{
          border: 0, cursor: 'pointer', padding: '5px 11px', borderRadius: 99,
          background: forceMock ? 'var(--amber, #D6A36A)' : 'transparent',
          color: forceMock ? 'var(--paper, #FAF7F0)' : 'var(--ink-2, #5A5146)',
          fontWeight: forceMock ? 600 : 500, fontFamily: 'var(--sans, Inter, system-ui, sans-serif)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 99,
          background: forceMock ? 'var(--paper, #FAF7F0)' : 'var(--amber, #D6A36A)',
        }} />
        Mock
      </button>
      <div style={{ width: 1, height: 16, background: 'var(--line-2, rgba(0,0,0,0.06))', margin: '0 4px' }} />
      <span
        title="Alt+M 切换"
        style={{ fontFamily: 'var(--mono, "JetBrains Mono", ui-monospace, monospace)', fontSize: 9.5, color: 'var(--ink-4, #8A7C6A)', padding: '0 4px', letterSpacing: 0.3 }}
      >
        ⌥M
      </span>
      <button
        onClick={() => setCollapsed(true)}
        title="收起"
        style={{
          border: 0, background: 'transparent', cursor: 'pointer',
          color: 'var(--ink-4, #8A7C6A)', padding: '3px 6px', fontSize: 12,
        }}
      >
        ×
      </button>
    </div>
  );
}
