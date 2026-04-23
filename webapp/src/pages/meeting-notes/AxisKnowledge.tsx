// AxisKnowledge — 知识轴（判断 / 心智模型 / 偏误 / 反事实 / 证据）
// 页面 9/12

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill } from '../../components/meeting-notes/shared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';

export function AxisKnowledge() {
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

  const k = axes?.knowledge ?? {};
  const eg = k.evidence_grades;
  const totalEvidence = eg ? (eg.dist_a + eg.dist_b + eg.dist_c + eg.dist_d) : 0;

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="知识轴"
        subtitle="可复用判断 · 心智模型 · 认知偏误 · 反事实 · 证据分级"
        actions={
          <button onClick={() => setRegenOpen(true)} className="px-3 py-1 bg-stone-900 text-white rounded text-sm">★ 快捷重算</button>
        }
      />
      {!meetingId && <div className="text-sm text-gray-500">请在 URL 提供 ?meetingId=...</div>}
      {loading && <div className="text-gray-400">loading…</div>}

      {axes && (
        <div className="grid grid-cols-2 gap-6">
          {/* 可复用判断 */}
          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">可复用判断</h3>
            {(k.judgments ?? []).slice(0, 15).map((j: any) => (
              <div key={j.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill className="bg-amber-50 text-amber-800">{j.domain || 'general'}</Pill>
                  <span className="text-xs font-mono text-gray-400">通用 {Number(j.generality_score).toFixed(2)} · 复用 {j.reuse_count}</span>
                </div>
                <div>{j.text}</div>
              </div>
            ))}
          </section>

          {/* 心智模型 */}
          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">心智模型激活</h3>
            {(k.mental_models ?? []).slice(0, 15).map((m: any) => (
              <div key={m.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium">{m.model_name}</span>
                  {m.correctly_used === true && <Pill className="bg-green-50 text-green-800">✓</Pill>}
                  {m.correctly_used === false && <Pill className="bg-red-50 text-red-700">×</Pill>}
                </div>
                {m.outcome && <div className="text-xs text-gray-500">{m.outcome}</div>}
              </div>
            ))}
          </section>

          {/* 认知偏误 */}
          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">认知偏误</h3>
            {(k.cognitive_biases ?? []).slice(0, 15).map((b: any) => (
              <div key={b.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill className="bg-red-50 text-red-700">{b.bias_type}</Pill>
                  <Pill className="bg-gray-100">{b.severity}</Pill>
                  {b.mitigated && <Pill className="bg-green-50 text-green-800">mitigated</Pill>}
                </div>
                {b.where_excerpt && <div className="text-xs text-gray-500 italic">「{b.where_excerpt}」</div>}
              </div>
            ))}
          </section>

          {/* 反事实 */}
          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">反事实</h3>
            {(k.counterfactuals ?? []).slice(0, 15).map((c: any) => (
              <div key={c.id} className="border-b last:border-0 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill className="bg-gray-100">{c.current_validity}</Pill>
                  {c.next_validity_check_at && (
                    <span className="text-xs text-gray-400 font-mono">
                      复核 {new Date(c.next_validity_check_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div>{c.rejected_path}</div>
                {c.tracking_note && <div className="text-xs text-gray-500">追踪：{c.tracking_note}</div>}
              </div>
            ))}
          </section>

          {/* 证据分级 */}
          <section className="bg-white border rounded p-5 col-span-2">
            <h3 className="font-semibold mb-3">证据分级（本会议聚合）</h3>
            {eg ? (
              <div className="flex items-center gap-6">
                {[
                  { k: 'A', color: 'bg-green-400', n: eg.dist_a },
                  { k: 'B', color: 'bg-lime-400', n: eg.dist_b },
                  { k: 'C', color: 'bg-amber-400', n: eg.dist_c },
                  { k: 'D', color: 'bg-red-400', n: eg.dist_d },
                ].map((b) => (
                  <div key={b.k}>
                    <div className="text-xs font-mono text-gray-500 mb-1">{b.k} · {b.n}</div>
                    <div className="h-2 w-24 bg-gray-100 rounded overflow-hidden">
                      <div className={`h-full ${b.color}`} style={{ width: `${totalEvidence ? (b.n / totalEvidence * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
                <div className="ml-auto text-right">
                  <div className="text-xs text-gray-400 font-mono">加权分</div>
                  <div className="text-2xl font-semibold">{Number(eg.weighted_score).toFixed(2)}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">暂无证据聚合数据</div>
            )}
          </section>
        </div>
      )}

      {regenOpen && (
        <AxisRegeneratePanel axis="knowledge" meetingId={meetingId} scopeId={scopeId} onClose={() => setRegenOpen(false)} />
      )}
    </div>
  );
}
