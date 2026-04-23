// AxisProjects — 项目轴（决议溯源 / 假设清单 / 开放问题 / 风险热度）
// 页面 8/12

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill, CrossAxisLink } from '../../components/meeting-notes/shared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';

export function AxisProjects() {
  const [params] = useSearchParams();
  const meetingId = params.get('meetingId') ?? '';
  const scopeId = params.get('scopeId') ?? undefined;
  const [axes, setAxes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [regenOpen, setRegenOpen] = useState(false);

  useEffect(() => {
    if (!meetingId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try { setAxes(await meetingNotesApi.getMeetingAxes(meetingId)); } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [meetingId]);

  const p = axes?.projects ?? {};

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="项目轴"
        subtitle="决议溯源 · 假设清单 · 开放问题 · 风险热度"
        actions={
          <button onClick={() => setRegenOpen(true)} className="px-3 py-1 bg-stone-900 text-white rounded text-sm">
            ★ 快捷重算
          </button>
        }
      />
      {!meetingId && <div className="text-sm text-gray-500">请在 URL 提供 ?meetingId=...</div>}
      {loading && <div className="text-gray-400">loading…</div>}

      {axes && (
        <div className="grid grid-cols-2 gap-6">
          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">决议溯源</h3>
            {(p.decisions ?? []).slice(0, 15).map((d: any) => (
              <div key={d.id} className="border-l-2 border-teal-500 pl-3 py-2 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Pill className="bg-teal-50 text-teal-800">conf {Number(d.confidence).toFixed(2)}</Pill>
                  {d.is_current ? <Pill className="bg-green-50 text-green-800">current</Pill> : <Pill className="bg-gray-100">superseded</Pill>}
                  <CrossAxisLink axis="projects" itemId={d.id} />
                </div>
                <div className="font-medium text-sm">{d.title}</div>
                {d.rationale && <div className="text-xs text-gray-500 mt-1">{d.rationale}</div>}
              </div>
            ))}
          </section>

          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">假设清单</h3>
            {(p.assumptions ?? []).slice(0, 20).map((a: any) => (
              <div key={a.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill className="bg-amber-50 text-amber-800 border-amber-200">{a.evidence_grade}</Pill>
                  <Pill className="bg-gray-100">{a.verification_state}</Pill>
                  <span className="text-xs font-mono text-gray-400">conf {Number(a.confidence).toFixed(2)}</span>
                </div>
                <div>{a.text}</div>
              </div>
            ))}
          </section>

          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">开放问题</h3>
            {(p.open_questions ?? []).slice(0, 15).map((q: any) => (
              <div key={q.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill className="bg-gray-100">{q.status}</Pill>
                  <Pill className="bg-indigo-50 text-indigo-800">{q.category}</Pill>
                  <span className="text-xs font-mono text-gray-400">×{q.times_raised}</span>
                </div>
                <div>{q.text}</div>
              </div>
            ))}
          </section>

          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">风险热度</h3>
            {(p.risks ?? []).slice(0, 15).map((r: any) => (
              <div key={r.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill className={
                    r.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    r.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    r.severity === 'med' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100'
                  }>{r.severity}</Pill>
                  <span className="text-xs font-mono text-gray-400">heat {Number(r.heat_score).toFixed(0)}</span>
                  <Pill className="bg-gray-100">{r.trend}</Pill>
                </div>
                <div>{r.text}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {regenOpen && (
        <AxisRegeneratePanel axis="projects" meetingId={meetingId} scopeId={scopeId} onClose={() => setRegenOpen(false)} />
      )}
    </div>
  );
}
