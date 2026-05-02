// _mockToggle.tsx — 全局 Mock 开关 + 慢 API 检测
// 放在 MeetingShell 顶层；所有 API 探测的页面读 useForceMock() 决定是否跳过 fetch

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'meeting-proto.forceMock';

interface MockToggleValue {
  forceMock: boolean;
  setForceMock: (v: boolean) => void;
  /** 组件成功拿到 API 数据后调用，取消 5s 慢 API 提示 */
  reportApiSuccess: () => void;
}

const Ctx = createContext<MockToggleValue | null>(null);

export function MockToggleProvider({ children }: { children: ReactNode }) {
  const [forceMock, setForceMockState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });
  const [slowVisible, setSlowVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiSucceededRef = useRef(false);

  const setForceMock = useCallback((v: boolean) => {
    setForceMockState(v);
    try {
      if (v) window.localStorage.setItem(STORAGE_KEY, '1');
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }, []);

  // 进入 API 模式时启动 5s 计时；任意组件报告成功则取消
  useEffect(() => {
    if (forceMock) {
      setSlowVisible(false);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }
    apiSucceededRef.current = false;
    timerRef.current = setTimeout(() => {
      if (!apiSucceededRef.current) setSlowVisible(true);
    }, 5000);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [forceMock]);

  const reportApiSuccess = useCallback(() => {
    apiSucceededRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setSlowVisible(false);
  }, []);

  const value = useMemo(
    () => ({ forceMock, setForceMock, reportApiSuccess }),
    [forceMock, setForceMock, reportApiSuccess],
  );

  return (
    <Ctx.Provider value={value}>
      <>
        {children}
        {slowVisible && !forceMock && (
          <SlowApiPrompt
            onSwitch={() => { setForceMock(true); setSlowVisible(false); }}
            onDismiss={() => setSlowVisible(false)}
          />
        )}
      </>
    </Ctx.Provider>
  );
}

export function useForceMock(): boolean {
  const v = useContext(Ctx);
  return v?.forceMock ?? false;
}

export function useMockToggle(): MockToggleValue {
  const v = useContext(Ctx);
  if (!v) return { forceMock: false, setForceMock: () => {}, reportApiSuccess: () => {} };
  return v;
}

// ── 慢 API 提示 ─────────────────────────────────────────────────────────────

function SlowApiPrompt({ onSwitch, onDismiss }: { onSwitch: () => void; onDismiss: () => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 64, right: 12, zIndex: 61,
      background: 'var(--paper)', border: '1px solid var(--amber)',
      borderRadius: 8, padding: '12px 14px', maxWidth: 280,
      boxShadow: '0 8px 24px -8px rgba(0,0,0,0.22)',
      fontFamily: 'var(--sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 20, height: 20, borderRadius: 5, background: 'var(--amber-soft)',
          border: '1px solid var(--amber)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, color: 'oklch(0.38 0.09 75)', flexShrink: 0,
        }}>⏱</span>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>API 响应超过 5 秒</div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.55 }}>
        服务器可能不可用。切换到 Mock 模式可使用演示数据继续浏览。
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onSwitch} style={{
          flex: 1, padding: '6px 10px', fontSize: 11.5,
          background: 'var(--amber)', color: 'var(--paper)',
          border: '1px solid var(--amber)', borderRadius: 4, cursor: 'pointer',
          fontFamily: 'var(--sans)', fontWeight: 600,
        }}>切换到 Mock</button>
        <button onClick={onDismiss} style={{
          padding: '6px 10px', fontSize: 11.5,
          background: 'transparent', color: 'var(--ink-3)',
          border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer',
          fontFamily: 'var(--sans)',
        }}>继续等待</button>
      </div>
    </div>
  );
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
          background: forceMock ? 'var(--amber)' : 'var(--teal)',
          color: 'var(--paper)', border: 0, cursor: 'pointer',
          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
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
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 99,
        boxShadow: '0 6px 18px -6px rgba(0,0,0,0.18)',
        padding: 4, display: 'flex', alignItems: 'center', gap: 2,
        fontFamily: 'var(--sans)', fontSize: 11.5,
      }}
    >
      <button
        onClick={() => setForceMock(false)}
        title="尝试真实 API · 失败自动降级 mock"
        style={{
          border: 0, cursor: 'pointer', padding: '5px 11px', borderRadius: 99,
          background: !forceMock ? 'var(--teal)' : 'transparent',
          color: !forceMock ? 'var(--paper)' : 'var(--ink-2)',
          fontWeight: !forceMock ? 600 : 500, fontFamily: 'var(--sans)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 99,
          background: !forceMock ? 'var(--paper)' : 'var(--teal)',
        }} />
        API
      </button>
      <button
        onClick={() => setForceMock(true)}
        title="强制 Mock · 忽略所有 API 响应；用于 UI demo / 离线"
        style={{
          border: 0, cursor: 'pointer', padding: '5px 11px', borderRadius: 99,
          background: forceMock ? 'var(--amber)' : 'transparent',
          color: forceMock ? 'var(--paper)' : 'var(--ink-2)',
          fontWeight: forceMock ? 600 : 500, fontFamily: 'var(--sans)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 99,
          background: forceMock ? 'var(--paper)' : 'var(--amber)',
        }} />
        Mock
      </button>
      <div style={{ width: 1, height: 16, background: 'var(--line-2)', margin: '0 4px' }} />
      <span
        title="Alt+M 切换"
        style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-4)', padding: '0 4px', letterSpacing: 0.3 }}
      >
        ⌥M
      </span>
      <button
        onClick={() => setCollapsed(true)}
        title="收起"
        style={{
          border: 0, background: 'transparent', cursor: 'pointer',
          color: 'var(--ink-4)', padding: '3px 6px', fontSize: 12,
        }}
      >
        ×
      </button>
    </div>
  );
}
