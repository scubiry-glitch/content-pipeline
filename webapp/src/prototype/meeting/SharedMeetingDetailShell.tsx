// SharedMeetingDetailShell — /meeting/shared/:token/detail/{a,b,c}
// 与 MeetingDetailShell 结构完全一致，但：
//   · 通过 share_token 公开 API 取数（无需登录）
//   · 隐藏「返回库」按钮、「分享」按钮、Mock 开关

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Icon, MonoMeta, Chip } from './_atoms';
import { meetingNotesApi } from '../../api/meetingNotes';
import { useAuth } from '../../contexts/AuthContext';
import { ImportConfirm, importErrorMessage } from './ImportConfirm';
import './_tokens.css';

export type MeetingShellContext = {
  shellTitle: string;
  meetingDetail: any | null;
  detailState: 'loading' | 'ok' | 'error' | 'skipped';
  health: any | null;
};

export function useMeetingShellTitleShared(fallback?: string): string {
  const ctx = useOutletContext<MeetingShellContext | undefined>();
  return ctx?.shellTitle ?? fallback ?? '';
}

export function useMeetingDetailShared(): { detail: any | null; state: 'loading' | 'ok' | 'error' | 'skipped' } {
  const ctx = useOutletContext<MeetingShellContext | undefined>();
  return { detail: ctx?.meetingDetail ?? null, state: ctx?.detailState ?? 'skipped' };
}

const views = [
  { to: 'a', label: 'A · Editorial', sub: '文档精读' },
  { to: 'b', label: 'B · Workbench', sub: '三栏工作台' },
  { to: 'c', label: 'C · Threads',   sub: '人物编织' },
];

export function SharedMeetingDetailShell() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, currentWorkspace } = useAuth();

  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [apiDate, setApiDate] = useState<string | null>(null);
  const [apiDetail, setApiDetail] = useState<any | null>(null);
  const [apiHealth, setApiHealth] = useState<any | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'ok' | 'error' | 'skipped'>('loading');
  const [meetingId, setMeetingId] = useState<string>('');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [sharedRunSource, setSharedRunSource] = useState<{ runId?: string; state?: string } | null>(null);
  const [triggering, setTriggering] = useState(false);

  // 当前 url 末段对应的 view (a/b/c → A/B/C); 默认 A
  const location = useLocation();
  const currentView: 'A' | 'B' | 'C' = (() => {
    const seg = (location.pathname.split('/').pop() ?? '').toLowerCase();
    return seg === 'b' ? 'B' : seg === 'c' ? 'C' : 'A';
  })();

  const onImport = async () => {
    if (importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const r = await meetingNotesApi.importSharedMeeting(token);
      navigate(`/meeting/${r.meetingId}/a`);
    } catch (e: any) {
      setImportError(importErrorMessage(e));
      setImporting(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!meetingId || triggering) return;
    setTriggering(true);
    try {
      const res = await meetingNotesApi.enqueueRun({
        scope: { kind: 'meeting', id: meetingId },
        axis: 'all',
        preset: 'standard',
        triggeredBy: 'manual',
      });
      if (res.ok) {
        setSharedRunSource({ runId: res.runId ?? '', state: 'queued' });
      }
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    if (!token) { setApiState('error'); return; }
    setApiState('loading');
    meetingNotesApi.getSharedMeeting(token, currentView)
      .then((res: any) => {
        const m = res?.meeting ?? {};
        setMeetingId(m.meetingId ?? '');
        if (m.title) setApiTitle(String(m.title));
        if (m.date) setApiDate(String(m.date).slice(0, 10));
        setSharedRunSource(m.runSource ?? null);
        // Variants 读 data.analysis 才是真正内容; 内部 /meetings/:id/detail 返回
        // { analysis: {...} }, 而 /shared/:token 把 meeting body 摊平为 res.meeting.
        // 这里包一层对齐, 让 SharedMeetingDetail 的 C 视图复用同一个 Variants.
        setApiDetail({ analysis: m });
        setApiHealth(res?.health ?? null);  // C 视图情绪温度曲线 / 顶部 4 徽章用
        setApiState('ok');
      })
      .catch(() => setApiState('error'));
  }, [token, currentView]);

  const effectiveTitle = apiTitle ?? (apiState === 'loading' ? '加载中…' : '—');

  if (apiState === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontSize: 15 }}>链接无效或已过期</p>
      </div>
    );
  }

  return (
    <div className="meeting-proto" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top bar — same layout as MeetingDetailShell, minus 返回库 + 分享 */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line-2)',
        padding: '12px 28px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 520,
          }}>
            {effectiveTitle}
          </div>
          {apiDate && <MonoMeta>{apiDate}</MonoMeta>}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {meetingId && (
            <Chip tone="ghost">{meetingId}</Chip>
          )}

          {/* 只读分享标签 */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 4,
            background: 'oklch(0.95 0.03 200)', color: 'oklch(0.38 0.09 200)',
            border: '1px solid oklch(0.82 0.07 200)',
            fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: 'oklch(0.55 0.14 200)' }} />
            只读分享
          </span>

          {user && (
            <button
              onClick={() => setShowImport(true)}
              title={currentWorkspace ? `复制到工作区:${currentWorkspace.name}` : '需要先选择一个工作区'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'var(--paper-2)', color: 'var(--ink)',
                fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 500,
              }}
            >
              📥 添加到我的工作区
            </button>
          )}

          <div style={{
            display: 'flex', gap: 2, border: '1px solid var(--line)',
            borderRadius: 6, padding: 3, background: 'var(--paper-2)',
          }}>
            {views.map((v) => (
              <NavLink
                key={v.to}
                to={v.to}
                title={v.sub}
                style={({ isActive }) => ({
                  padding: '5px 12px', borderRadius: 4, fontSize: 12.5,
                  fontFamily: 'var(--sans)', textDecoration: 'none',
                  fontWeight: isActive ? 600 : 450,
                  background: isActive ? 'var(--ink)' : 'transparent',
                  color: isActive ? 'var(--paper)' : 'var(--ink-2)',
                })}
              >
                {v.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      {/* 尚未成功运行时的分析启动横幅 */}
      {meetingId && apiState === 'ok' && sharedRunSource?.state !== 'succeeded' && (
        <SharedStartAnalysisBanner
          runState={sharedRunSource?.state ?? null}
          triggering={triggering}
          onStart={() => { void handleStartAnalysis(); }}
        />
      )}

      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet context={{
          shellTitle: effectiveTitle,
          meetingDetail: apiDetail,
          detailState: apiState,
          health: apiHealth,
        } satisfies MeetingShellContext} />
      </main>

      {showImport && (
        <ImportConfirm
          targetWorkspaceName={currentWorkspace?.name ?? '当前工作区'}
          meetingTitle={apiTitle ?? '会议'}
          importing={importing}
          error={importError}
          onCancel={() => { setShowImport(false); setImportError(null); }}
          onConfirm={onImport}
        />
      )}
      {/* MockToggleBar 不渲染 — 分享视图不需要 */}
    </div>
  );
}

function SharedStartAnalysisBanner({
  runState,
  triggering,
  onStart,
}: {
  runState: string | null;
  triggering: boolean;
  onStart: () => void;
}) {
  const inProgress = runState === 'running' || runState === 'queued';
  const label =
    runState === 'running'     ? '分析进行中，请稍候…'
    : runState === 'queued'    ? '分析已排队，等待执行…'
    : runState === 'failed'    ? '上次分析失败，可重新生成'
    : runState === 'cancelled' ? '上次分析已取消，可重新生成'
    : '此素材尚未完成分析';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 28px',
      background: inProgress ? 'oklch(0.96 0.04 75)' : 'oklch(0.96 0.03 250)',
      borderBottom: '1px solid var(--line-2)',
      gap: 12,
    }}>
      <span style={{
        fontFamily: 'var(--sans)', fontSize: 12,
        color: inProgress ? 'oklch(0.38 0.09 75)' : 'oklch(0.38 0.08 250)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {inProgress && (
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: 99,
            background: 'oklch(0.60 0.14 75)',
          }} />
        )}
        {label}
      </span>
      {!inProgress && (
        <button
          onClick={onStart}
          disabled={triggering}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12.5,
            fontFamily: 'var(--sans)', fontWeight: 600, cursor: triggering ? 'wait' : 'pointer',
            border: 0,
            background: triggering ? 'var(--ink-3)' : 'var(--ink)',
            color: 'var(--paper)',
            opacity: triggering ? 0.7 : 1,
            flexShrink: 0,
          }}
        >
          {triggering ? '启动中…' : '开始分析生成'}
        </button>
      )}
    </div>
  );
}

export default SharedMeetingDetailShell;
