// MeetingDetail — 三变体外层（A Editorial / B Workbench / C Threads 切换头）
// 页面 3/12

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { MeetingDetailEditorial } from './MeetingDetailEditorial';
import { MeetingDetailWorkbench } from './MeetingDetailWorkbench';
import { MeetingDetailThreads } from './MeetingDetailThreads';

type View = 'A' | 'B' | 'C';

export function MeetingDetail() {
  const { id = '' } = useParams();
  const [view, setView] = useState<View>('A');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const justParsed = (location.state as any)?.justParsed === true;
  const justParsedRunId = (location.state as any)?.runId as string | undefined;
  const [bannerOpen, setBannerOpen] = useState(justParsed);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      try {
        const r = await meetingNotesApi.getMeetingDetail(id, view);
        setData(r);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
    })();
  }, [id, view]);

  const views: { id: View; label: string; sub: string }[] = [
    { id: 'A', label: 'A · Editorial', sub: '文档精读' },
    { id: 'B', label: 'B · Workbench', sub: '三栏工作台' },
    { id: 'C', label: 'C · Threads',   sub: '人物编织' },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 px-6 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/meeting-notes/library')} className="text-sm text-gray-500 hover:text-gray-900">← 返回库</button>
        <div className="font-serif font-semibold">Meeting · {id.slice(0, 8)}</div>
        <div className="ml-auto flex items-center gap-1 p-1 bg-gray-50 border rounded">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`px-3 py-1 text-sm rounded ${
                view === v.id ? 'bg-stone-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={v.sub}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {/* Just-parsed banner · 承接 NewMeeting 的 Multi-view 入口 */}
      {bannerOpen && (
        <div className="border-b border-orange-200 bg-gradient-to-r from-orange-50 via-stone-50 to-stone-50 px-6 py-3 flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center flex-shrink-0">✓</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">「{id.slice(0, 8)}」解析完成</div>
            {justParsedRunId && (
              <div className="text-xs text-gray-500 font-mono mt-0.5">run-{justParsedRunId.slice(0, 8)}</div>
            )}
          </div>
          <div className="h-6 w-px bg-orange-200" />
          <div className="flex-1 text-xs text-gray-600 leading-snug">
            <div><b>下游已自动入队：</b>项目轴增量 · 人物轴承诺追踪</div>
            <div className="text-gray-400 mt-0.5">
              library 轴（全库判断库 / 心智命中率）需手动触发 ——
              <button onClick={() => navigate('/meeting-notes/generation-center')} className="text-orange-700 hover:underline ml-1">去生成中心 →</button>
            </div>
          </div>
          <div className="flex gap-2">
            {(['people', 'projects', 'knowledge', 'meta'] as const).map((a) => (
              <button
                key={a}
                onClick={() =>
                  navigate(`/meeting-notes/axes/${a}?meetingId=${encodeURIComponent(id)}`)
                }
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded hover:border-orange-300"
              >
                {a === 'people' ? '人物轴' : a === 'projects' ? '项目轴' : a === 'knowledge' ? '知识轴' : '会议本身'}
              </button>
            ))}
          </div>
          <button onClick={() => setBannerOpen(false)} className="text-gray-400 hover:text-gray-700 pl-2">×</button>
        </div>
      )}

      {/* Body */}
      <main className="p-6">
        {loading && <div className="text-gray-400">loading…</div>}
        {error && <div className="text-red-600">加载失败：{error}</div>}
        {data && view === 'A' && <MeetingDetailEditorial meetingId={id} data={data} />}
        {data && view === 'B' && <MeetingDetailWorkbench meetingId={id} data={data} />}
        {data && view === 'C' && <MeetingDetailThreads meetingId={id} data={data} />}
      </main>
    </div>
  );
}
