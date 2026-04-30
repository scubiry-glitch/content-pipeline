// MeetingDetailWorkbench — 变体 B · 三栏工作台
// 页面 5/12

import { Pill } from '../../components/meeting-notes/shared';

export function MeetingDetailWorkbench({ meetingId, data }: { meetingId: string; data: any }) {
  const left = data?.left ?? {};
  const center = data?.center ?? {};
  const right = data?.right ?? {};
  return (
    <div className="grid grid-cols-[280px_1fr_340px] gap-4 h-[calc(100vh-80px)]">
      {/* Left: 结构 + 发言者 */}
      <aside className="bg-white border rounded p-4 overflow-auto">
        <div className="text-xs font-mono uppercase text-gray-400 mb-2">结构</div>
        <div className="flex flex-col gap-1 mb-6">
          {(left.structure ?? []).slice(0, 15).map((d: any) => (
            <div key={d.id} className="text-sm px-2 py-1 border-l-2 border-teal-400">
              {d.title}
            </div>
          ))}
        </div>
        <div className="text-xs font-mono uppercase text-gray-400 mb-2">发言者</div>
        <div className="flex flex-col gap-1">
          {(left.speakers ?? []).slice(0, 20).map((s: any) => (
            <div key={s.person_id} className="text-xs flex items-center justify-between px-2 py-1 hover:bg-gray-50">
              <span>{s.person_id?.slice(0, 8)}</span>
              <span className="font-mono text-gray-400">{Number(s.quality_score).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: claims / tensions */}
      <main className="bg-white border rounded p-4 overflow-auto">
        <div className="text-xs font-mono uppercase text-gray-400 mb-2">断言 / 假设</div>
        <ul className="flex flex-col gap-2 mb-6">
          {(center.claims ?? []).slice(0, 30).map((c: any) => (
            <li key={c.id} className="text-sm border-l-2 border-teal-500 pl-3 py-1">
              <div className="flex items-center gap-2 mb-1">
                <Pill className="bg-amber-50 text-amber-800 border-amber-200">{c.evidence_grade}</Pill>
                <Pill className="bg-gray-100">{c.verification_state}</Pill>
              </div>
              <div>{c.text}</div>
            </li>
          ))}
        </ul>

        <div className="text-xs font-mono uppercase text-gray-400 mb-2">张力点（认知偏误）</div>
        <ul className="flex flex-col gap-2">
          {(center.tensions ?? []).slice(0, 15).map((t: any) => (
            <li key={t.id} className="text-sm border-l-2 border-red-400 pl-3 py-1">
              <div className="text-xs font-mono text-red-600">{t.bias_type}</div>
              <div className="text-gray-600">{t.where_excerpt || ''}</div>
            </li>
          ))}
        </ul>
      </main>

      {/* Right: 承诺 + 开放问题 */}
      <aside className="bg-white border rounded p-4 overflow-auto">
        <div className="text-xs font-mono uppercase text-gray-400 mb-2">承诺</div>
        <ul className="flex flex-col gap-2 mb-6">
          {(right.commitments ?? []).slice(0, 15).map((c: any) => (
            <li key={c.id} className="text-xs border-l-2 border-amber-400 pl-2 py-1">
              <div className="flex gap-2 items-center mb-0.5">
                <Pill className="bg-gray-100">{c.state}</Pill>
                {c.due_at && <span className="text-gray-400">{new Date(c.due_at).toLocaleDateString()}</span>}
              </div>
              <div>{c.text}</div>
            </li>
          ))}
        </ul>
        <div className="text-xs font-mono uppercase text-gray-400 mb-2">开放问题</div>
        <ul className="flex flex-col gap-2">
          {(right.openQuestions ?? []).slice(0, 15).map((q: any) => (
            <li key={q.id} className="text-xs border-l-2 border-indigo-400 pl-2 py-1">
              <div className="flex gap-2 items-center mb-0.5">
                <Pill className="bg-gray-100">{q.status}</Pill>
                <span className="text-gray-400">×{q.times_raised}</span>
              </div>
              <div>{q.text}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
