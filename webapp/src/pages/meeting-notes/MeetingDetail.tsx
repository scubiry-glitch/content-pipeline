// MeetingDetail — 三变体外层（A Editorial / B Workbench / C Threads 切换头）
// 页面 3/12

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
