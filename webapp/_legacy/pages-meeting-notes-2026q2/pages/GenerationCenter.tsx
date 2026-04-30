// GenerationCenter — 运行中心（queue / versions / schedule）
// 页面 12/12

import { useEffect, useState } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill, RunBadge } from '../../components/meeting-notes/shared';

export function GenerationCenter() {
  const [runs, setRuns] = useState<any[]>([]);
  const [state, setState] = useState<string>('');
  const [axis, setAxis] = useState<string>('');
  const [scopeKind, setScopeKind] = useState<string>('');
  const [loading, setLoading] = useState(true);
  /** meetingId → title 反查表，让 meeting-scope 的 run 显示真名而不是 UUID8 */
  const [meetingTitles, setMeetingTitles] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await meetingNotesApi.listRuns({
        state: state || undefined,
        axis: axis || undefined,
        scopeKind: scopeKind || undefined,
        limit: 50,
      });
      setRuns(r.items ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  // 拉一次 meetings 列表做 id → title 反查；新会议一般 30 条够用，过期重刷靠 10s 轮询
  useEffect(() => {
    let cancelled = false;
    meetingNotesApi.listMeetings({ limit: 100 })
      .then((r: any) => {
        if (cancelled) return;
        const items: any[] = Array.isArray(r) ? r : (r.items ?? []);
        const map: Record<string, string> = {};
        for (const m of items) if (m?.id) map[m.id] = m.title || '(未命名)';
        setMeetingTitles(map);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { load(); }, [state, axis, scopeKind]);
  useEffect(() => {
    const t = setInterval(load, 10_000);   // 每 10 秒刷新
    return () => clearInterval(t);
  }, [state, axis, scopeKind]);

  const cancel = async (id: string) => {
    await meetingNotesApi.cancelRun(id);
    load();
  };

  const quickLibrary = async () => {
    const r = await meetingNotesApi.enqueueRun({
      scope: { kind: 'library' },
      axis: 'all',
      preset: 'standard',
      triggeredBy: 'manual',
    });
    alert(`已入队 library run: ${r.runId?.slice(0, 8) || ''}`);
    load();
  };

  const counts = {
    queued:    runs.filter((r) => r.state === 'queued').length,
    running:   runs.filter((r) => r.state === 'running').length,
    succeeded: runs.filter((r) => r.state === 'succeeded').length,
    failed:    runs.filter((r) => r.state === 'failed').length,
  };

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="生成中心"
        subtitle="queue / versions / schedule · project auto 自动增量 · library 需手动触发"
        actions={
          <button onClick={quickLibrary} className="px-3 py-1 bg-stone-900 text-white rounded text-sm">
            全库重算 →
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['queued', 'running', 'succeeded', 'failed'] as const).map((k) => (
          <div key={k} className="bg-white border rounded p-4">
            <div className="text-xs font-mono uppercase text-gray-400">{k}</div>
            <div className="text-3xl font-semibold">{counts[k]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <select value={state} onChange={(e) => setState(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="">all states</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <select value={scopeKind} onChange={(e) => setScopeKind(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="">all scopes</option>
          <option value="meeting">📄 meeting</option>
          <option value="project">📁 project</option>
          <option value="topic">🏷 topic</option>
          <option value="client">🏢 client</option>
          <option value="library">📚 library</option>
        </select>
        <select value={axis} onChange={(e) => setAxis(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="">all axes</option>
          <option value="people">people</option>
          <option value="projects">projects</option>
          <option value="knowledge">knowledge</option>
          <option value="meta">meta</option>
          <option value="longitudinal">longitudinal</option>
          <option value="all">all</option>
        </select>
        <button onClick={load} className="text-sm px-3 py-1 border rounded">刷新</button>
        {loading && <span className="text-xs text-gray-400">loading…</span>}
      </div>

      {/* List */}
      <div className="bg-white border rounded divide-y">
        {runs.length === 0 && <div className="p-6 text-sm text-gray-400">暂无匹配的 run</div>}
        {runs.map((r) => {
          const isMeeting = r.scope?.kind === 'meeting';
          const meetingTitle = isMeeting && r.scope?.id ? meetingTitles[r.scope.id] : null;
          const isRunning = r.state === 'running' || r.state === 'queued';
          const pct = typeof r.progressPct === 'number' ? r.progressPct : 0;
          return (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-gray-400">{r.id.slice(0, 8)}</span>
                <RunBadge run={r} />
                <Pill className="bg-gray-100">{r.axis}</Pill>
                <span className="text-xs font-mono text-gray-500">
                  {r.scope?.kind === 'meeting' && '📄 '}
                  {r.scope?.kind === 'project' && '📁 '}
                  {r.scope?.kind === 'topic' && '🏷 '}
                  {r.scope?.kind === 'library' && '📚 '}
                  {meetingTitle ? (
                    <span className="text-gray-700 font-sans">{meetingTitle}</span>
                  ) : (
                    <>
                      {r.scope?.kind}
                      {r.scope?.id ? ` · ${r.scope.id.slice(0, 8)}` : ''}
                    </>
                  )}
                </span>
                <span className="text-xs font-mono text-gray-400">{r.preset}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {r.llmCalls ? `${r.llmCalls} calls · ` : ''}
                  {r.costMs ? `${(r.costMs / 1000).toFixed(1)}s` : ''}
                </span>
                {(r.state === 'queued' || r.state === 'running') && (
                  <button onClick={() => cancel(r.id)} className="text-xs text-red-600 hover:underline">取消</button>
                )}
              </div>
              {isRunning && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all ${r.state === 'queued' ? 'bg-gray-400' : 'bg-blue-500'}`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-gray-500 w-10 text-right">{pct}%</span>
                  {r.currentStep && (
                    <span className="text-[11px] text-gray-500 truncate max-w-md">· {r.currentStep}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
