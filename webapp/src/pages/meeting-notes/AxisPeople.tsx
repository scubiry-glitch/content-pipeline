// AxisPeople — 人物轴（承诺兑现 / 角色演化 / 发言质量 / 沉默信号）
// 页面 7/12

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill, CrossAxisLink, PersonChip } from '../../components/meeting-notes/shared';
import { AxisRegeneratePanel } from './AxisRegeneratePanel';

export function AxisPeople() {
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
      try {
        const r = await meetingNotesApi.getMeetingAxes(meetingId);
        setAxes(r);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [meetingId]);

  const people = axes?.people ?? {};

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="人物轴"
        subtitle="承诺兑现 · 角色演化 · 发言质量 · 沉默信号"
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
            <h3 className="font-semibold mb-3 flex items-center justify-between">
              承诺兑现
              <span className="text-xs font-mono text-gray-400">{people.commitments?.length ?? 0}</span>
            </h3>
            {(people.commitments ?? []).slice(0, 20).map((c: any) => (
              <div key={c.id} className="border-b last:border-0 py-2 flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <PersonChip id={c.person_id} />
                    <Pill className="bg-gray-100">{c.state}</Pill>
                  </div>
                  <div className="text-sm">{c.text}</div>
                </div>
                <CrossAxisLink axis="people" itemId={c.person_id} />
              </div>
            ))}
          </section>

          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">角色演化</h3>
            {(people.role_trajectory ?? []).slice(0, 20).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <PersonChip id={r.person_id} />
                <Pill className="bg-indigo-50 text-indigo-800">{r.role_label}</Pill>
                <span className="text-xs font-mono text-gray-400">{Number(r.confidence).toFixed(2)}</span>
              </div>
            ))}
          </section>

          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">发言质量</h3>
            {(people.speech_quality ?? []).slice(0, 20).map((s: any) => (
              <div key={s.person_id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <PersonChip id={s.person_id} />
                <div className="flex gap-2 text-xs font-mono text-gray-500">
                  <span>熵 {Number(s.entropy_pct).toFixed(0)}</span>
                  <span>跟进 {s.followed_up_count}</span>
                  <span className="font-semibold text-stone-900">Q {Number(s.quality_score).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white border rounded p-5">
            <h3 className="font-semibold mb-3">沉默信号 · 异常</h3>
            {(people.silence_signals ?? []).slice(0, 20).map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <PersonChip id={s.person_id} />
                <span className="font-mono text-xs text-gray-500">{s.topic_id}</span>
                <Pill className="bg-red-50 text-red-700">{s.state}</Pill>
              </div>
            ))}
          </section>
        </div>
      )}

      {regenOpen && (
        <AxisRegeneratePanel
          axis="people"
          meetingId={meetingId}
          scopeId={scopeId}
          onClose={() => setRegenOpen(false)}
        />
      )}
    </div>
  );
}
