// 共享 UI 原子 — 从 /tmp/meeting_review/shared.jsx 精简提炼
// 只保留 webapp 层真正会复用的几个原子，避免重复样式

import React from 'react';

export const AXIS_COLOR: Record<string, string> = {
  people:    'bg-amber-100 text-amber-800',
  projects:  'bg-teal-100 text-teal-800',
  knowledge: 'bg-indigo-100 text-indigo-800',
  meta:      'bg-gray-100 text-gray-700',
};

export const RUN_STATE_COLOR: Record<string, string> = {
  queued:    'bg-gray-200 text-gray-700',
  running:   'bg-blue-100 text-blue-800 animate-pulse',
  succeeded: 'bg-green-100 text-green-800',
  failed:    'bg-red-100 text-red-800',
  cancelled: 'bg-gray-300 text-gray-500',
};

export function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${className}`}>
      {children}
    </span>
  );
}

export function RunBadge({ run }: { run?: { id?: string; state?: string; versionLabel?: string; startedAt?: string | null } }) {
  if (!run) return null;
  const st = run.state ?? 'queued';
  return (
    <div className="inline-flex items-center gap-2">
      <Pill className={RUN_STATE_COLOR[st] ?? 'bg-gray-100 text-gray-700'}>
        {st}{run.versionLabel ? ` · ${run.versionLabel}` : ''}
      </Pill>
      {run.startedAt && (
        <span className="text-xs text-gray-500 font-mono">
          {new Date(run.startedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

export function ScopePill({
  scope,
  onClick,
}: {
  scope: { kind: string; label: string; meta?: string };
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1 border rounded-full text-sm hover:bg-gray-50"
    >
      <span className="text-xs font-mono uppercase tracking-wide text-gray-500 border px-1.5 py-0.5 rounded">
        {scope.kind}
      </span>
      <span className="font-semibold">{scope.label}</span>
      {scope.meta && <span className="text-xs text-gray-400 font-mono">{scope.meta}</span>}
    </button>
  );
}

export function CrossAxisLink({
  axis,
  itemId,
}: {
  axis: string;
  itemId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [links, setLinks] = React.useState<any[]>([]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && links.length === 0) {
      try {
        const r = await fetch(
          `/api/v1/meeting-notes/crosslinks?axis=${encodeURIComponent(axis)}&itemId=${encodeURIComponent(itemId)}`,
          { headers: { 'X-API-Key': (import.meta as any).env?.VITE_API_KEY || 'dev-api-key' } },
        );
        if (r.ok) {
          const data = await r.json();
          setLinks(data.items ?? []);
        }
      } catch { /* ignore */ }
    }
  };

  return (
    <div className="inline-block relative">
      <button
        onClick={toggle}
        className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50"
      >
        相关 {links.length > 0 ? <span className="text-gray-500 ml-1">{links.length}</span> : null}
      </button>
      {open && (
        <div className="absolute z-10 top-full right-0 mt-1 w-72 bg-white border rounded shadow-lg p-2 text-xs">
          {links.length === 0 ? (
            <div className="text-gray-400">无跨轴关联</div>
          ) : (
            links.map((l, i) => (
              <div key={i} className="p-1.5 hover:bg-gray-50 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Pill className={AXIS_COLOR[l.targetAxis] ?? 'bg-gray-100'}>{l.targetAxis}</Pill>
                  <span className="font-mono text-gray-500">{l.relationship}</span>
                </div>
                <div className="text-gray-600 mt-0.5">→ {l.targetItemType}: {l.targetItemId.slice(0, 8)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function PersonChip({ id, name }: { id?: string; name?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 rounded text-sm">
      <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 flex items-center justify-center text-xs">
        {(name || id || '?').slice(0, 1).toUpperCase()}
      </span>
      {name || (id ? id.slice(0, 8) : '未知')}
    </span>
  );
}

export function AxisHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6 pb-4 border-b">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
