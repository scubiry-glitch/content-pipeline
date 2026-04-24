// AxisMeta — 会议本身轴（决策质量 / 必要性 / 情绪热力）
// 页面 10/12

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill } from '../../components/meeting-notes/shared';
import { AxisMeetingGate } from './AxisMeetingGate';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';

export function AxisMeta() {
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

  const m = axes?.meta ?? {};
  const dq = m.decision_quality;
  const mn = m.meeting_necessity;
  const af = m.affect_curve;

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="会议本身"
        subtitle="决策质量 · 必要性审计 · 情绪热力曲线"
        actions={
          <button onClick={() => setRegenOpen(true)} className="px-3 py-1 bg-stone-900 text-white rounded text-sm">★ 快捷重算</button>
        }
      />
      <AxisMeetingGate />
      {loading && <div className="text-gray-400">loading…</div>}

      {axes && (
        <div className="grid grid-cols-3 gap-6">
          {/* Decision quality */}
          <section className="bg-white border rounded p-5 col-span-2">
            <h3 className="font-semibold mb-3">决策质量 5 维</h3>
            {dq ? (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-4xl font-semibold">{Number(dq.overall).toFixed(2)}</div>
                  <div className="text-sm text-gray-500">综合分（0-1）</div>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { k: 'clarity',     label: '清晰' },
                    { k: 'actionable',  label: '可落地' },
                    { k: 'traceable',   label: '可溯源' },
                    { k: 'falsifiable', label: '可证伪' },
                    { k: 'aligned',     label: '一致' },
                  ].map((d) => (
                    <div key={d.k}>
                      <div className="text-xs text-gray-400 mb-1">{d.label}</div>
                      <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-teal-500" style={{ width: `${Number(dq[d.k]) * 100}%` }} />
                      </div>
                      <div className="text-xs font-mono mt-1">{Number(dq[d.k]).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="text-sm text-gray-400">暂无</div>}
          </section>

          {/* Necessity */}
          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">必要性审计</h3>
            {mn ? (
              <div>
                <Pill className={
                  mn.verdict === 'needed' ? 'bg-green-50 text-green-800' :
                  mn.verdict === 'partial' ? 'bg-amber-50 text-amber-800' :
                  'bg-red-50 text-red-700'
                }>{mn.verdict}</Pill>
                {mn.suggested_duration_min && (
                  <div className="mt-3 text-sm">
                    建议时长 <span className="font-semibold">{mn.suggested_duration_min}</span> 分钟
                  </div>
                )}
                <ul className="mt-3 flex flex-col gap-1 text-xs">
                  {(mn.reasons ?? []).map((r: any, i: number) => (
                    <li key={i} className="border-l-2 border-amber-400 pl-2">
                      <span className="font-mono text-gray-500">{r.k}</span> — {r.t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : <div className="text-sm text-gray-400">暂无</div>}
          </section>

          {/* Affect curve */}
          <section className="bg-white border rounded p-5 col-span-3">
            <h3 className="font-semibold mb-3">情绪热力曲线</h3>
            {af && (af.samples?.length ?? 0) > 0 ? (
              <MiniAffect samples={af.samples} peaks={af.tension_peaks} insights={af.insight_points} />
            ) : <div className="text-sm text-gray-400">暂无</div>}
          </section>
        </div>
      )}

      {regenOpen && (
        <AxisRegeneratePanel axis="meta" meetingId={meetingId} scopeId={scopeId} onClose={() => setRegenOpen(false)} />
      )}
    </div>
  );
}

function MiniAffect({ samples, peaks, insights }: { samples: any[]; peaks: any[]; insights: any[] }) {
  const W = 800, H = 120, P = 10;
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const xs = samples.map((s: any) => s.t_sec);
  const maxT = Math.max(...xs, 1);
  const pt = (s: any) => ({
    x: P + (s.t_sec / maxT) * (W - 2 * P),
    y: H / 2 - (Number(s.valence) || 0) * (H / 2 - P),
  });
  const poly = samples.map(pt).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32">
      <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#e5e7eb" strokeDasharray="2 2" />
      <polyline points={poly} fill="none" stroke="#f59e0b" strokeWidth="2" />
      {(peaks ?? []).map((p: any, i: number) => {
        const x = P + (p.t_sec / maxT) * (W - 2 * P);
        return <circle key={`p${i}`} cx={x} cy={H / 2 + H / 2 - P} r="3" fill="#ef4444"><title>{p.note}</title></circle>;
      })}
      {(insights ?? []).map((p: any, i: number) => {
        const x = P + (p.t_sec / maxT) * (W - 2 * P);
        return <circle key={`i${i}`} cx={x} cy={H / 2 - (H / 2 - P)} r="3" fill="#10b981"><title>{p.note}</title></circle>;
      })}
    </svg>
  );
}
