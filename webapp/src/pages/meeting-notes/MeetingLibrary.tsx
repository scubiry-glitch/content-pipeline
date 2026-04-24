// MeetingLibrary — 会议纪要库
// 四标签：全部（meeting列表 + scope编辑）/ 项目 / 客户 / 主题

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';
import { AxisHeader, Pill } from '../../components/meeting-notes/shared';

type GroupKind = 'all' | 'project' | 'client' | 'topic';

// ─── State badge ─────────────────────────────────────────────────────────────
function RunBadge({ state }: { state?: string }) {
  if (!state) return null;
  const map: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
    running:   'bg-blue-100 text-blue-700',
    queued:    'bg-gray-100 text-gray-500',
    cancelled: 'bg-gray-100 text-gray-400',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${map[state] ?? 'bg-gray-100 text-gray-400'}`}>
      {state}
    </span>
  );
}

// ─── Scope chip (removable) ───────────────────────────────────────────────────
function ScopeChip({
  scope, meetingId, onRemove,
}: {
  scope: { scopeId: string; kind: string; name: string };
  meetingId: string;
  onRemove: () => void;
}) {
  const kindColor: Record<string, string> = {
    project: 'bg-blue-50 border-blue-200 text-blue-700',
    client:  'bg-amber-50 border-amber-200 text-amber-700',
    topic:   'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-medium ${kindColor[scope.kind] ?? 'bg-gray-50 border-gray-200 text-gray-600'}`}>
      <span className="opacity-60">{scope.kind[0].toUpperCase()}</span>
      {scope.name}
      <button
        className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
        title="移除"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        ×
      </button>
    </span>
  );
}

// ─── Scope binding popover ────────────────────────────────────────────────────
function BindPopover({
  meetingId, onBound, onClose,
}: {
  meetingId: string;
  onBound: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<'project' | 'client' | 'topic'>('project');
  const [scopes, setScopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    meetingNotesApi.listScopes({ kind }).then((r) => {
      setScopes(r.items ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [kind]);

  const bindTo = async (scopeId: string) => {
    setCreating(true);
    try {
      await meetingNotesApi.bindMeeting(scopeId, meetingId);
      onBound();
    } catch (e: any) { setError(e.message); }
    setCreating(false);
  };

  const createAndBind = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const slug = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const scope = await meetingNotesApi.createScope({ kind, slug, name: newName.trim() });
      await meetingNotesApi.bindMeeting(scope.id, meetingId);
      onBound();
    } catch (e: any) { setError(e.message); }
    setCreating(false);
  };

  const kinds: { id: 'project' | 'client' | 'topic'; label: string }[] = [
    { id: 'project', label: '项目' },
    { id: 'client',  label: '客户' },
    { id: 'topic',   label: '主题' },
  ];

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">绑定到</div>
      <div className="flex gap-1 mb-3">
        {kinds.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`px-2.5 py-1 text-xs rounded border ${kind === k.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400 py-2">加载中…</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto mb-3">
          {scopes.map((s) => (
            <button
              key={s.id}
              disabled={creating}
              onClick={() => bindTo(s.id)}
              className="text-left text-xs px-2.5 py-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 truncate"
            >
              {s.name}
            </button>
          ))}
          {scopes.length === 0 && (
            <div className="text-xs text-gray-400 py-1">暂无{kinds.find(k => k.id === kind)?.label}</div>
          )}
        </div>
      )}

      <div className="border-t pt-2">
        <div className="text-[10px] text-gray-400 mb-1">新建并绑定</div>
        <div className="flex gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void createAndBind(); }}
            placeholder={`${kinds.find(k => k.id === kind)?.label}名称`}
            className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            disabled={!newName.trim() || creating}
            onClick={createAndBind}
            className="text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded disabled:opacity-40"
          >
            {creating ? '…' : '建'}
          </button>
        </div>
        {error && <div className="text-[10px] text-red-600 mt-1">{error}</div>}
      </div>
    </div>
  );
}

// ─── Meeting card ─────────────────────────────────────────────────────────────
function MeetingCard({
  meeting, onRefresh,
}: {
  meeting: any;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [showBind, setShowBind] = useState(false);

  const handleRemoveScope = async (scopeId: string) => {
    try {
      await meetingNotesApi.unbindScope(scopeId, meeting.id);
      onRefresh();
    } catch { /* ignore */ }
  };

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition cursor-pointer relative"
      onClick={() => navigate(`/meeting-notes/${meeting.id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-serif font-medium text-sm leading-snug line-clamp-2 flex-1">
          {meeting.title}
        </div>
        <RunBadge state={meeting.last_run?.state} />
      </div>

      <div className="text-[10px] text-gray-400 font-mono mb-3">
        {meeting.meeting_kind && <span className="mr-2">{meeting.meeting_kind}</span>}
        {new Date(meeting.created_at).toLocaleDateString('zh-CN')}
      </div>

      <div
        className="flex flex-wrap gap-1.5 items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {(meeting.scope_bindings ?? []).map((s: any) => (
          <ScopeChip
            key={s.scopeId}
            scope={s}
            meetingId={meeting.id}
            onRemove={() => handleRemoveScope(s.scopeId)}
          />
        ))}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowBind((v) => !v); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600"
            title="绑定项目/客户/主题"
          >
            ＋ 绑定
          </button>
          {showBind && (
            <BindPopover
              meetingId={meeting.id}
              onBound={() => { setShowBind(false); onRefresh(); }}
              onClose={() => setShowBind(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Library run row (library-scoped runs without meeting context) ─────────────
function LibRunRow({ run }: { run: any }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
      <RunBadge state={run.state} />
      <span className="font-mono text-xs text-gray-400">{run.id.slice(0, 8)}</span>
      <span className="text-gray-600 flex-1">全库分析 · {run.axis}</span>
      <span className="text-[11px] text-gray-400 font-mono">
        {new Date(run.created_at).toLocaleDateString('zh-CN')}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function MeetingLibrary() {
  const [groupKind, setGroupKind] = useState<GroupKind>('all');
  const [scopes, setScopes] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [libraryRuns, setLibraryRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      if (groupKind === 'all') {
        const r = await meetingNotesApi.listMeetings({ limit: 50 });
        setMeetings(r.items ?? []);
        setLibraryRuns(r.libraryRuns ?? []);
      } else {
        const r = await meetingNotesApi.listScopes({ kind: groupKind });
        setScopes(r.items ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [groupKind]);

  const tabs: { id: GroupKind; label: string }[] = [
    { id: 'all',     label: '全部' },
    { id: 'project', label: '项目' },
    { id: 'client',  label: '客户' },
    { id: 'topic',   label: '主题' },
  ];

  return (
    <div className="p-10 bg-stone-50 min-h-screen">
      <AxisHeader
        title="会议纪要库"
        subtitle="全部会议 / 按项目·客户·主题分组浏览"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex gap-1 p-1 bg-white border rounded">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setGroupKind(t.id)}
                  className={`px-3 py-1 text-sm rounded ${
                    groupKind === t.id ? 'bg-stone-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate('/meeting-notes/new')}
              className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded shadow-sm flex items-center gap-1.5"
            >
              <span className="text-base leading-none">＋</span> 新建会议纪要
            </button>
          </div>
        }
      />

      {loading && <div className="text-gray-400 text-sm">loading…</div>}

      {/* ── 全部 tab ── */}
      {!loading && groupKind === 'all' && (
        <>
          {meetings.length === 0 && libraryRuns.length === 0 && (
            <div className="text-sm text-gray-500 p-10 text-center border border-dashed rounded">
              还没有会议纪要。点击「新建会议纪要」上传第一份。
            </div>
          )}

          {meetings.length > 0 && (
            <div className="max-w-5xl">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
                会议 · {meetings.length} 条
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {meetings.map((m) => (
                  <MeetingCard key={m.id} meeting={m} onRefresh={load} />
                ))}
              </div>
            </div>
          )}

          {libraryRuns.length > 0 && (
            <div className="max-w-5xl mt-8">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
                全库分析记录（未关联具体会议）
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {libraryRuns.map((r) => <LibRunRow key={r.id} run={r} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 项目 / 客户 / 主题 tab ── */}
      {!loading && groupKind !== 'all' && (
        <>
          {scopes.length === 0 && (
            <div className="text-sm text-gray-500 p-10 text-center border border-dashed rounded">
              此分组下暂无记录。在「全部」视图里从会议卡片点击「＋ 绑定」。
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
        </>
      )}
    </div>
  );
}
