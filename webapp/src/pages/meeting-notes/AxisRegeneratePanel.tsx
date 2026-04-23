// AxisRegeneratePanel — 轴内快捷重算 Dialog，被四轴页面共享
// 页面 11/12

import { useState } from 'react';
import { meetingNotesApi } from '../../api/meetingNotes';
import { Pill } from '../../components/meeting-notes/shared';

const SUBDIMS: Record<string, string[]> = {
  people:    ['commitments', 'role_trajectory', 'speech_quality', 'silence_signal'],
  projects:  ['decision_provenance', 'assumptions', 'open_questions', 'risk_heat'],
  knowledge: ['reusable_judgments', 'mental_models', 'cognitive_biases', 'counterfactuals', 'evidence_grading'],
  meta:      ['decision_quality', 'meeting_necessity', 'affect_curve'],
};

export function AxisRegeneratePanel({
  axis,
  meetingId,
  scopeId,
  onClose,
}: {
  axis: 'people' | 'projects' | 'knowledge' | 'meta';
  meetingId?: string;
  scopeId?: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(SUBDIMS[axis] ?? []);
  const [preset, setPreset] = useState<'lite' | 'standard' | 'max'>('standard');
  const [scopeKind, setScopeKind] = useState<'meeting' | 'project' | 'client' | 'topic' | 'library'>(
    meetingId ? 'meeting' : 'project',
  );
  const [submitting, setSubmitting] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  const toggle = (d: string) => {
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const scope = { kind: scopeKind, id: scopeKind === 'meeting' ? meetingId : scopeId };
      const r = await meetingNotesApi.enqueueRun({
        scope,
        axis,
        subDims: selected,
        preset,
        triggeredBy: 'manual',
      });
      setRunId(r.runId ?? null);
    } catch (e) {
      alert('提交失败：' + (e as Error).message);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-[520px] p-6 rounded shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-mono text-gray-400">Axis regenerate</div>
            <h2 className="text-lg font-semibold">{axis} 轴 · 快捷重算</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>

        <section className="mb-4">
          <div className="text-xs font-mono uppercase text-gray-400 mb-2">子维度</div>
          <div className="flex flex-wrap gap-2">
            {(SUBDIMS[axis] ?? []).map((d) => (
              <button
                key={d}
                onClick={() => toggle(d)}
                className={`text-sm px-3 py-1 border rounded ${
                  selected.includes(d) ? 'bg-stone-900 text-white' : 'hover:bg-gray-50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <div className="text-xs font-mono uppercase text-gray-400 mb-2">作用域</div>
          <select
            className="border rounded px-3 py-1 text-sm w-full"
            value={scopeKind}
            onChange={(e) => setScopeKind(e.target.value as any)}
          >
            <option value="meeting" disabled={!meetingId}>本会议 {meetingId ? `(${meetingId.slice(0, 8)})` : '(N/A)'}</option>
            <option value="project" disabled={!scopeId}>当前 project {scopeId ? `(${scopeId.slice(0, 8)})` : '(N/A)'}</option>
            <option value="library">全库（需手动触发，耗时较长）</option>
          </select>
        </section>

        <section className="mb-4">
          <div className="text-xs font-mono uppercase text-gray-400 mb-2">Preset</div>
          <div className="flex gap-1 p-1 bg-gray-50 border rounded">
            {(['lite', 'standard', 'max'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`flex-1 px-3 py-1 text-sm rounded ${preset === p ? 'bg-white shadow-sm font-semibold' : ''}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-2 font-mono">
            {preset === 'lite' && '~1× cost · 单专家 + failure_check + emm_iterative'}
            {preset === 'standard' && '~5× cost · debate + evidence_anchored + calibrated_confidence ...'}
            {preset === 'max' && '~25× cost · mental_model_rotation + 全 9 decorators'}
          </div>
        </section>

        <div className="flex items-center justify-between">
          {runId ? (
            <div className="text-sm text-green-700">
              已入队 <span className="font-mono">{runId.slice(0, 8)}</span>
            </div>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1 border rounded text-sm">关闭</button>
            <button
              onClick={submit}
              disabled={submitting || selected.length === 0}
              className="px-4 py-1 bg-stone-900 text-white rounded text-sm disabled:opacity-50"
            >
              {submitting ? '提交中…' : '入队 run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
