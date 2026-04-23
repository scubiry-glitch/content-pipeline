// MeetingLibrary — 会议纪要库（按 project / client / topic 分组切换）
// 页面 2/12

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill } from '../../components/meeting-notes/shared';

type GroupKind = 'project' | 'client' | 'topic';

export function MeetingLibrary() {
  const [groupKind, setGroupKind] = useState<GroupKind>('project');
  const [scopes, setScopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await meetingNotesApi.listScopes({ kind: groupKind });
        setScopes(r.items ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [groupKind]);

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="会议纪要库"
        subtitle="按 项目 / 客户 / 主题 三种分组维度浏览同一批会议"
        actions={
          <div className="flex gap-1 p-1 bg-white border rounded">
            {(['project', 'client', 'topic'] as GroupKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setGroupKind(k)}
                className={`px-3 py-1 text-sm rounded ${
                  groupKind === k ? 'bg-stone-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {k === 'project' ? '项目' : k === 'client' ? '客户' : '主题'}
              </button>
            ))}
          </div>
        }
      />

      {loading && <div className="text-gray-400">loading…</div>}
      {!loading && scopes.length === 0 && (
        <div className="text-sm text-gray-500 p-10 text-center border border-dashed rounded">
          此分组下暂无记录。通过 scope 管理页面创建 {groupKind}，或从会议详情页绑定。
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 max-w-6xl">
        {scopes.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/meeting-notes/scopes/${s.id}`)}
            className="text-left bg-white border-l-2 border-amber-500 p-5 rounded hover:shadow transition"
          >
            <div className="text-xs font-mono text-gray-400 uppercase mb-1">{s.kind}</div>
            <div className="text-lg font-serif mb-2">{s.name}</div>
            <div className="flex items-center gap-2">
              <Pill className="bg-gray-100">{s.status}</Pill>
              <span className="text-xs text-gray-400 font-mono">{s.slug}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
