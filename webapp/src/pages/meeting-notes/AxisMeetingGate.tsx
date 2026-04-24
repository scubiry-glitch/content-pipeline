// 四轴页共用：无 meetingId 时的说明 / scope 下单会议自动跳转 / 多会议选择
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { meetingNotesApi } from '../../api/meetingNotes';

type GateState =
  | { kind: 'hidden' }
  | { kind: 'loading_scope' }
  | { kind: 'pick'; ids: string[] }
  | { kind: 'empty_scope' }
  | { kind: 'no_params' };

export function AxisMeetingGate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const meetingId = searchParams.get('meetingId') ?? '';
  const scopeId = searchParams.get('scopeId') ?? undefined;
  const [gate, setGate] = useState<GateState>({ kind: 'hidden' });

  useEffect(() => {
    if (meetingId) {
      setGate({ kind: 'hidden' });
      return;
    }
    if (!scopeId) {
      setGate({ kind: 'no_params' });
      return;
    }
    let cancelled = false;
    setGate({ kind: 'loading_scope' });
    (async () => {
      try {
        const { meetingIds } = await meetingNotesApi.listScopeMeetings(scopeId);
        if (cancelled) return;
        if (meetingIds.length === 1) {
          setSearchParams({ meetingId: meetingIds[0], scopeId }, { replace: true });
          setGate({ kind: 'hidden' });
        } else if (meetingIds.length > 1) {
          setGate({ kind: 'pick', ids: meetingIds });
        } else {
          setGate({ kind: 'empty_scope' });
        }
      } catch {
        if (!cancelled) setGate({ kind: 'empty_scope' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId, scopeId, setSearchParams]);

  if (gate.kind === 'hidden') return null;

  if (gate.kind === 'loading_scope') {
    return (
      <div className="mb-6 rounded border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
        正在载入该作用域下的会议…
      </div>
    );
  }

  if (gate.kind === 'pick') {
    return (
      <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-stone-800">
        <div className="font-medium mb-2">该作用域下有多场会议，请选择一场查看本轴：</div>
        <div className="flex flex-wrap gap-2">
          {gate.ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                setSearchParams(
                  { meetingId: id, ...(scopeId ? { scopeId } : {}) },
                  { replace: true },
                )
              }
              className="rounded border border-stone-300 bg-white px-3 py-1.5 font-mono text-xs hover:border-amber-500"
            >
              {id.slice(0, 12)}…
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (gate.kind === 'empty_scope') {
    return (
      <div className="mb-6 rounded border border-dashed border-stone-300 bg-white px-4 py-4 text-sm text-stone-600">
        当前作用域下还没有绑定任何会议。请先到{' '}
        <button type="button" onClick={() => navigate('/meeting-notes/library')} className="text-amber-800 underline">
          会议纪要库
        </button>
        或 scope 详情里绑定会议。
      </div>
    );
  }

  // no_params
  return (
    <div className="mb-6 max-w-xl rounded border border-stone-200 bg-white px-4 py-4 text-sm text-stone-600 leading-relaxed">
      <p className="font-medium text-stone-800 mb-2">需要先指定一场会议</p>
      <p className="mb-3">
        本页数据按单场会议的资产 ID（<span className="font-mono">meetingId</span>）加载。请从会议详情页通过横幅进入四轴，或在 URL 末尾加上{' '}
        <code className="rounded bg-stone-100 px-1 font-mono text-xs">?meetingId=资产ID</code>。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate('/meeting-notes/library')}
          className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-800"
        >
          打开会议纪要库
        </button>
        <button
          type="button"
          onClick={() => navigate('/meeting-notes')}
          className="rounded border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
        >
          返回 Minutes 主页
        </button>
      </div>
    </div>
  );
}
