// BindExpertModal — 从专家库挑选已有专家绑定到 Boardroom 外脑批注摘要
//
// 替代原来的 "+ 新建专家" 入口（CreateExpertModal）。优先复用专家库已有专家，
// 避免每次为同一类外脑都新建一份记录。
//
// 数据来源：GET /api/v1/expert-library/experts （domain 可选过滤）
// 选中 → 通过 onBound(expertId, expertName) 回调把 id 抛回去，由父组件决定如何使用。
// 二次入口：footer 的"+ 仍要新建一位专家"按钮可降级到 CreateExpertModal 流程。

import { useEffect, useMemo, useState } from 'react';
import { CreateExpertModal } from './CreateExpertModal';

interface ExpertSummary {
  expert_id: string;
  name: string;
  domain: string[] | string;
  persona?: { style?: string; tone?: string };
  method?: { frameworks?: string[] };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 已经在 Boardroom 中绑定过的 expert_id，用于隐藏重复 / 标记 ✓ */
  alreadyBound?: string[];
  onBound: (expertId: string, expertName: string) => void;
}

export function BindExpertModal({ open, onClose, alreadyBound = [], onBound }: Props) {
  const [list, setList] = useState<ExpertSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setList(null);
    setError(null);
    fetch('/api/v1/expert-library/experts')
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const items: ExpertSummary[] = Array.isArray(data?.experts) ? data.experts : [];
        setList(items);
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [open]);

  const boundSet = useMemo(() => new Set(alreadyBound), [alreadyBound]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const dom = Array.isArray(e.domain) ? e.domain.join(',') : (e.domain ?? '');
      return e.name.toLowerCase().includes(q)
        || e.expert_id.toLowerCase().includes(q)
        || String(dom).toLowerCase().includes(q);
    });
  }, [list, filter]);

  if (!open) return null;

  return (
    <>
      <CreateExpertModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          // 新建后直接当成绑定，关掉两层 modal
          const created = list?.find((x) => x.expert_id === id);
          onBound(id, created?.name ?? id);
          setCreateOpen(false);
          onClose();
        }}
      />

      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000,
      }} />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 560, maxWidth: '92vw', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: '#1A1410', color: '#F0E8D6',
          border: '1px solid #D4A84B', borderRadius: 6,
          fontFamily: 'var(--sans)', zIndex: 9001,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 22px 12px',
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: '#D4A84B',
            letterSpacing: '0.25em', textTransform: 'uppercase',
          }}>
            🔗 绑定专家
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid rgba(212,168,75,0.3)',
            color: 'rgba(240,232,214,0.7)', padding: '3px 8px', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11,
          }}>✕</button>
        </div>

        <h2 style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic',
          fontSize: 18, fontWeight: 600, margin: '0 22px 4px',
        }}>
          从专家库挑一位绑定
        </h2>
        <div style={{
          margin: '0 22px 12px', fontSize: 11.5, lineHeight: 1.55,
          color: 'rgba(240,232,214,0.6)',
        }}>
          复用 expert_library 已有人格，避免为同一类外脑反复新建记录。绑定后该专家可参与 g4 批注 / 调试 / 评审。
        </div>

        <div style={{ padding: '0 22px 8px' }}>
          <input
            placeholder="搜索 name / id / domain…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'rgba(0,0,0,0.3)', color: '#F0E8D6',
              border: '1px solid rgba(212,168,75,0.25)', borderRadius: 4,
              fontFamily: 'var(--mono)', fontSize: 12, boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 6px' }}>
          {!list && !error && (
            <div style={{ padding: 24, color: 'rgba(240,232,214,0.55)', fontSize: 12 }}>载入专家库…</div>
          )}
          {error && (
            <div style={{
              margin: '6px 8px', padding: '8px 12px',
              background: 'rgba(196,106,80,0.12)', border: '1px solid rgba(196,106,80,0.4)',
              color: '#FFB89A', fontSize: 11, borderRadius: 3,
            }}>
              加载失败：{error}
            </div>
          )}
          {list && filtered.length === 0 && !error && (
            <div style={{ padding: 24, color: 'rgba(240,232,214,0.55)', fontSize: 12 }}>
              {list.length === 0 ? '专家库为空，先在下方"新建一位"。' : '没有匹配的专家，换个关键词试试。'}
            </div>
          )}
          {filtered.map((e) => {
            const bound = boundSet.has(e.expert_id);
            const dom = Array.isArray(e.domain) ? e.domain.join(', ') : String(e.domain ?? '');
            return (
              <button
                key={e.expert_id}
                onClick={() => {
                  if (bound) return;
                  onBound(e.expert_id, e.name);
                  onClose();
                }}
                disabled={bound}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'grid', gridTemplateColumns: '1fr auto',
                  alignItems: 'center', gap: 10,
                  padding: '9px 12px', margin: '3px 0',
                  background: bound ? 'rgba(212,168,75,0.08)' : 'rgba(212,168,75,0.04)',
                  border: '1px solid rgba(212,168,75,0.18)', borderRadius: 4,
                  color: '#F0E8D6', cursor: bound ? 'default' : 'pointer',
                  opacity: bound ? 0.55 : 1,
                  fontFamily: 'var(--sans)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    color: 'rgba(240,232,214,0.55)', marginTop: 2,
                  }}>
                    {e.expert_id}{dom ? ` · ${dom}` : ''}
                    {e.persona?.style ? ` · ${e.persona.style}` : ''}
                    {e.persona?.tone ? `/${e.persona.tone}` : ''}
                  </div>
                </div>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: bound ? '#A6CC9A' : '#D4A84B',
                  whiteSpace: 'nowrap',
                }}>
                  {bound ? '✓ 已绑定' : '绑定 →'}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{
          padding: '10px 22px 16px', borderTop: '1px solid rgba(212,168,75,0.18)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10,
            color: 'rgba(240,232,214,0.55)',
          }}>
            {list ? `${filtered.length}/${list.length} 位` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setCreateOpen(true)} style={{
            padding: '6px 12px', borderRadius: 4,
            background: 'transparent', color: 'rgba(240,232,214,0.7)',
            border: '1px dashed rgba(212,168,75,0.4)',
            fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
          }}>+ 仍要新建一位专家</button>
        </div>
      </div>
    </>
  );
}

export default BindExpertModal;
