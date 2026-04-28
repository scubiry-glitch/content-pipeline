// Compact expert dropdown for drawer's Expert mode.
// Different from /expert-chat's full sidebar list — this is a single-line select-like.

import { useState, useEffect, useRef, useMemo } from 'react';

export interface ExpertPickerExpert {
  expert_id?: string;
  id?: string;
  name: string;
  domain?: string[];
  persona?: { style?: string; tone?: string };
}

function expertKey(e: ExpertPickerExpert): string {
  return (e.expert_id ?? e.id ?? '').trim();
}

interface Props {
  experts: ExpertPickerExpert[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function ExpertPicker({ experts, selectedId, onSelect, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => experts.find((e) => expertKey(e) === selectedId) ?? null,
    [experts, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return experts;
    return experts.filter((e) => {
      const name = (e.name || '').toLowerCase();
      const id = expertKey(e).toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [experts, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="meeting-chat-expert-picker">
      <button
        type="button"
        className="meeting-chat-expert-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="meeting-chat-expert-name">
          {loading ? '加载中…' : selected ? selected.name : '选择专家'}
        </span>
        <span className="meeting-chat-expert-id">{selected ? expertKey(selected) : ''}</span>
        <span className="meeting-chat-expert-caret" aria-hidden>▾</span>
      </button>
      {open && !loading && (
        <div className="meeting-chat-expert-menu" role="listbox">
          <input
            type="search"
            className="meeting-chat-expert-search"
            placeholder="筛选专家…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="meeting-chat-expert-list">
            {filtered.length === 0 ? (
              <li className="meeting-chat-expert-empty">无匹配</li>
            ) : (
              filtered.map((e) => {
                const id = expertKey(e);
                const active = id === selectedId;
                return (
                  <li
                    key={id || `expert-${e.name}`}
                    role="option"
                    aria-selected={active}
                    className={`meeting-chat-expert-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      if (id) onSelect(id);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <div className="meeting-chat-expert-item-name">{e.name || id || '专家'}</div>
                    {e.persona?.style && (
                      <div className="meeting-chat-expert-item-style">{e.persona.style}</div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
