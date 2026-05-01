// Brain · 任务队列 (跨模块 mn + ceo)
// 来源: 07-archive/会议纪要 (20260501)/brain-rooms.jsx tasks 页

import { useEffect, useState } from 'react';
import { fetchBrainTasks, fetchBrainOverview, type BrainTask, type BrainOverview } from './_brainApi';

const STATE_TONES: Record<string, { ink: string; bg: string }> = {
  queued: { ink: 'rgba(232,227,216,0.6)', bg: 'rgba(232,227,216,0.06)' },
  running: { ink: '#D9B88E', bg: 'rgba(217,184,142,0.12)' },
  succeeded: { ink: '#A6CC9A', bg: 'rgba(106,154,92,0.12)' },
  failed: { ink: '#FFB89A', bg: 'rgba(196,106,80,0.12)' },
  cancelled: { ink: 'rgba(232,227,216,0.4)', bg: 'rgba(232,227,216,0.04)' },
};

export function TasksRoom() {
  const [tasks, setTasks] = useState<BrainTask[]>([]);
  const [overview, setOverview] = useState<BrainOverview>({ byModule: {}, recentLlmCalls: 0 });
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [t, o] = await Promise.all([
        fetchBrainTasks({ module: moduleFilter === 'all' ? undefined : moduleFilter, limit: 30 }),
        fetchBrainOverview(),
      ]);
      if (!cancelled) {
        setTasks(t);
        setOverview(o);
      }
    };
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [moduleFilter]);

  const moduleStats = Object.entries(overview.byModule);

  return (
    <div>
      {/* Overview */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 18,
          padding: '14px 16px',
          background: 'rgba(217,184,142,0.05)',
          border: '1px solid rgba(217,184,142,0.18)',
          borderRadius: 6,
          flexWrap: 'wrap',
        }}
      >
        {moduleStats.length === 0 ? (
          <span style={{ fontSize: 12, color: 'rgba(232,227,216,0.5)', fontStyle: 'italic' }}>
            14 天内暂无 run — 触发一次会议轴重算或 CEO 简报即可看到记录
          </span>
        ) : (
          moduleStats.map(([m, s]) => (
            <div key={m} style={{ flex: '1 1 200px' }}>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: '#D9B88E',
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                module {m}
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(232,227,216,0.85)' }}>
                <span>排队 <b>{s.queued}</b></span>
                <span style={{ color: '#D9B88E' }}>运行 <b>{s.running}</b></span>
                <span style={{ color: '#A6CC9A' }}>完成 <b>{s.succeeded}</b></span>
                <span style={{ color: '#FFB89A' }}>失败 <b>{s.failed}</b></span>
              </div>
            </div>
          ))
        )}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'rgba(232,227,216,0.5)',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            7 天 LLM 调用
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24, color: '#D9B88E', fontWeight: 600 }}>
            {overview.recentLlmCalls}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { id: 'all', label: '全部' },
          { id: 'mn', label: 'meeting-notes' },
          { id: 'ceo', label: 'CEO' },
        ].map((f) => {
          const active = moduleFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setModuleFilter(f.id)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${active ? '#D9B88E' : 'rgba(217,184,142,0.2)'}`,
                background: active ? 'rgba(217,184,142,0.12)' : 'transparent',
                color: active ? '#F3ECDD' : 'rgba(232,227,216,0.6)',
                fontFamily: 'var(--serif)',
                fontStyle: active ? 'normal' : 'italic',
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            background: 'rgba(217,184,142,0.04)',
            border: '1px dashed rgba(217,184,142,0.25)',
            borderRadius: 6,
            textAlign: 'center',
            color: 'rgba(232,227,216,0.55)',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 13,
          }}
        >
          当前队列为空 (8 秒自动刷新)
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map((t) => {
            const tone = STATE_TONES[t.state] ?? STATE_TONES.queued;
            const moduleColor = t.module === 'ceo' ? '#D9B88E' : '#7BA7C4';
            return (
              <div
                key={t.id}
                style={{
                  padding: '10px 14px',
                  background: tone.bg,
                  border: '1px solid rgba(217,184,142,0.15)',
                  borderLeft: `3px solid ${moduleColor}`,
                  borderRadius: '0 4px 4px 0',
                  fontSize: 12,
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr auto auto auto',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9.5,
                    color: moduleColor,
                    letterSpacing: 0.2,
                    textTransform: 'uppercase',
                  }}
                >
                  {t.module}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontStyle: 'italic',
                    color: '#E8E3D8',
                  }}
                >
                  <b>{t.axis}</b>
                  <span style={{ marginLeft: 6, opacity: 0.6, fontFamily: 'var(--mono)' }}>
                    {t.scope_kind}{t.scope_id ? `/${t.scope_id.slice(0, 8)}` : ''}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'rgba(232,227,216,0.55)',
                  }}
                >
                  {t.preset ?? '—'}
                </span>
                {t.progress_pct != null && t.state === 'running' && (
                  <span
                    style={{
                      width: 60,
                      height: 4,
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: 99,
                      overflow: 'hidden',
                    }}
                  >
                    <i
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${t.progress_pct}%`,
                        background: '#D9B88E',
                      }}
                    />
                  </span>
                )}
                {(t.progress_pct == null || t.state !== 'running') && <span />}
                <span
                  style={{
                    padding: '3px 9px',
                    background: tone.bg,
                    color: tone.ink,
                    border: `1px solid ${tone.ink}33`,
                    borderRadius: 99,
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    letterSpacing: 0.2,
                  }}
                >
                  {t.state}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TasksRoom;
