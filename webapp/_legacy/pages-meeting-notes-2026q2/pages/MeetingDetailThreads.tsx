// MeetingDetailThreads — 变体 C · 人物编织
// 页面 6/12

import { PersonChip, Pill } from '../../components/meeting-notes/shared';

export function MeetingDetailThreads({ meetingId, data }: { meetingId: string; data: any }) {
  const nodes: any[] = data?.nodes ?? [];
  const threads: any[] = data?.threads ?? [];
  const influence: any[] = data?.influence ?? [];

  const byPerson = new Map<string, { person_id: string; role?: string; quality?: number; commitments: any[] }>();
  for (const n of nodes) {
    byPerson.set(n.person_id, { person_id: n.person_id, role: n.role_label, commitments: [] });
  }
  for (const i of influence) {
    const entry = byPerson.get(i.person_id) ?? { person_id: i.person_id, commitments: [] };
    entry.quality = Number(i.quality_score);
    byPerson.set(i.person_id, entry);
  }
  for (const t of threads) {
    const entry = byPerson.get(t.person_id) ?? { person_id: t.person_id, commitments: [] };
    entry.commitments.push(t);
    byPerson.set(t.person_id, entry);
  }
  const people = Array.from(byPerson.values());

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-xs font-mono uppercase text-gray-400 mb-4">
        meeting · {meetingId.slice(0, 8)} · threads view
      </div>
      {people.length === 0 && <div className="text-sm text-gray-400">尚无参会人数据</div>}
      <div className="grid grid-cols-2 gap-4">
        {people.map((p) => (
          <div key={p.person_id} className="bg-white border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <PersonChip id={p.person_id} />
              {p.role && <Pill className="bg-indigo-50 text-indigo-800">{p.role}</Pill>}
            </div>
            {p.quality !== undefined && (
              <div className="text-xs text-gray-500 font-mono mb-2">
                质量分 {p.quality.toFixed(0)}
              </div>
            )}
            <div className="flex flex-col gap-1">
              {p.commitments.slice(0, 5).map((c: any) => (
                <div key={c.id} className="text-xs border-l-2 border-amber-400 pl-2 py-0.5">
                  <span className="text-gray-400 font-mono mr-1">{c.state}</span>
                  {c.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
