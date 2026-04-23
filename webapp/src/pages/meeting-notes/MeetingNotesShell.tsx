// MeetingNotesShell — 模块主壳（今天 / 库 / 轴 三 tab + Scope 切换）
// 页面 1/12

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { Pill, ScopePill } from '../../components/meeting-notes/shared';

type Tab = 'today' | 'library' | 'axes';

export function MeetingNotesShell() {
  const [tab, setTab] = useState<Tab>('today');
  const [scopes, setScopes] = useState<any[]>([]);
  const [activeScope, setActiveScope] = useState<{ kind: string; id?: string; label: string; meta?: string }>({
    kind: 'library',
    label: '全库',
  });
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<{ runs: any[]; meetingsCount: number }>({ runs: [], meetingsCount: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [sr, rr] = await Promise.all([
          meetingNotesApi.listScopes(),
          meetingNotesApi.listRuns({ limit: 10 }),
        ]);
        setScopes(sr.items ?? []);
        setToday({ runs: rr.items ?? [], meetingsCount: 0 });
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-900">
      {/* Left rail */}
      <aside className="w-60 border-r bg-white p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-stone-900 text-white flex items-center justify-center font-serif italic">M</div>
          <div>
            <div className="font-semibold">Minutes</div>
            <div className="text-xs text-gray-500 font-mono">会议纪要</div>
          </div>
        </div>

        <div>
          <div className="text-xs font-mono uppercase text-gray-400 mb-2">做什么</div>
          <div className="flex flex-col gap-1">
            {(['today', 'library', 'axes'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-left px-3 py-2 rounded text-sm ${
                  tab === t ? 'bg-amber-50 border-l-2 border-amber-600 font-semibold' : 'hover:bg-gray-50'
                }`}
              >
                {t === 'today' ? '今天' : t === 'library' ? '库' : '轴'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-mono uppercase text-gray-400 mb-2">作用域</div>
          <ScopePill scope={activeScope} />
          <div className="mt-2 flex flex-col gap-1">
            {scopes.slice(0, 8).map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveScope({ kind: s.kind, id: s.id, label: s.name })}
                className={`text-left text-sm px-2 py-1 rounded ${
                  activeScope.id === s.id ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <div className="text-xs font-mono text-gray-400">{s.kind}</div>
                <div>{s.name}</div>
              </button>
            ))}
            {scopes.length === 0 && <div className="text-xs text-gray-400">暂无 project/client/topic</div>}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-1">
          <button onClick={() => navigate('/meeting-notes/generation-center')} className="text-xs text-gray-500 hover:text-gray-900 text-left">生成中心 →</button>
          <button onClick={() => navigate('/meeting-notes/scopes')} className="text-xs text-gray-500 hover:text-gray-900 text-left">scope 管理 →</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-10 max-w-5xl">
        {loading && <div className="text-gray-400">loading…</div>}
        {!loading && tab === 'today' && <TodayPane today={today} onOpen={(id) => navigate(`/meeting-notes/${id}`)} />}
        {!loading && tab === 'library' && <LibraryQuick onOpen={() => navigate('/meeting-notes/library')} />}
        {!loading && tab === 'axes' && <AxesQuick scope={activeScope} onOpen={(axis) => navigate(`/meeting-notes/axes/${axis}${activeScope.id ? `?scopeId=${activeScope.id}` : ''}`)} />}
      </main>
    </div>
  );
}

function TodayPane({ today, onOpen }: { today: { runs: any[]; meetingsCount: number }; onOpen: (id: string) => void }) {
  return (
    <div>
      <div className="text-xs font-mono uppercase text-gray-400 tracking-widest">{new Date().toISOString().slice(0, 10)}</div>
      <h1 className="text-3xl font-serif mt-2 mb-8">今天，值得关注</h1>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">最近 run</h2>
        <div className="flex flex-col gap-2">
          {today.runs.slice(0, 5).map((r) => (
            <div key={r.id} className="bg-white border-l-2 border-amber-500 p-3 rounded text-sm">
              <div className="flex items-center gap-2">
                <Pill className="bg-gray-100">{r.state}</Pill>
                <span className="font-mono text-xs text-gray-500">{r.axis}</span>
                <span className="text-gray-400 text-xs font-mono">· {r.scope?.kind}</span>
                {r.scope?.id && <span className="text-gray-400 text-xs font-mono">{r.scope.id.slice(0, 8)}</span>}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {r.startedAt && new Date(r.startedAt).toLocaleString()}
              </div>
            </div>
          ))}
          {today.runs.length === 0 && <div className="text-sm text-gray-400">近期无 run 任务</div>}
        </div>
      </section>
    </div>
  );
}

function LibraryQuick({ onOpen }: { onOpen: () => void }) {
  return (
    <div>
      <h1 className="text-3xl font-serif mb-4">会议纪要库</h1>
      <p className="text-sm text-gray-500 mb-6">按项目 / 客户 / 主题 三种分组维度切换</p>
      <button onClick={onOpen} className="bg-stone-900 text-white px-4 py-2 rounded text-sm">打开完整库视图 →</button>
    </div>
  );
}

function AxesQuick({ scope, onOpen }: { scope: any; onOpen: (axis: string) => void }) {
  const axes = [
    { id: 'people',    title: '人物轴',   sub: '承诺 · 角色 · 发言质量 · 沉默信号' },
    { id: 'projects',  title: '项目轴',   sub: '决议溯源 · 假设 · 开放问题 · 风险' },
    { id: 'knowledge', title: '知识轴',   sub: '可复用判断 · 心智模型 · 偏误 · 反事实 · 证据' },
    { id: 'meta',      title: '会议本身', sub: '决策质量 · 必要性 · 情绪热力' },
  ];
  return (
    <div>
      <h1 className="text-3xl font-serif mb-1">轴视图</h1>
      <p className="text-sm text-gray-500 mb-6">
        当前作用域：<span className="font-mono">{scope.kind}</span> {scope.label}
      </p>
      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        {axes.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            className="text-left p-5 bg-white border rounded hover:border-amber-500 transition"
          >
            <div className="text-lg font-serif mb-1">{a.title}</div>
            <div className="text-xs text-gray-500">{a.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
