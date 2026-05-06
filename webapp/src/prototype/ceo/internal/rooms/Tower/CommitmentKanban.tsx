// Tower · ① 承诺看板 (4 列 kanban)
// 数据源: /api/v1/ceo/tower/commitments → 按 status 分组到 4 列
// fallback: forceMock=true 或 API 空时, 用 _towerFixtures.KANBAN

import { useEffect, useMemo, useState } from 'react';
import { KANBAN, type KanbanCard } from './_towerFixtures';
import { PersonChip } from '../../../shared/PersonChip';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface ApiCommitment {
  id: string;
  owner_name: string | null;
  beneficiary_name: string | null;
  what: string;
  due_at: string | null;
  days_overdue: number;
  status: string; // on_track | at_risk | done | slipped
  source_meeting_title: string | null;
  created_at?: string;
}

type ColName = '○ 提出' | '◐ 进行中' | '⊗ 逾期' | '✓ 完成';
const COLUMN_DEFS: { name: ColName; tone: string }[] = [
  { name: '○ 提出', tone: '#7BA9C2' },
  { name: '◐ 进行中', tone: '#C49B4D' },
  { name: '⊗ 逾期', tone: '#C46A50' },
  { name: '✓ 完成', tone: '#5FA39E' },
];

/** 把 "林雾 → 陈汀" / "陈汀 欠 董事会" 拆出两个名字 */
function splitOwnerLine(text: string): { from: string; sep: string; to: string } | null {
  for (const sep of [' → ', ' 欠 ', ' -> ']) {
    if (text.includes(sep)) {
      const [from, to] = text.split(sep);
      return { from: from.trim(), sep, to: to.trim() };
    }
  }
  return null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(5, 10);
}

function fmtDueLabel(c: ApiCommitment): string {
  if (c.status === 'done') return '已完成';
  if (c.status === 'slipped' || c.days_overdue > 0) return `逾期 ${c.days_overdue} 天`;
  if (!c.due_at) return '未排期';
  return c.due_at.slice(0, 10);
}

function adaptToKanban(items: ApiCommitment[]): { name: ColName; tone: string; count: number; cards: KanbanCard[] }[] {
  const groups: Record<ColName, KanbanCard[]> = { '○ 提出': [], '◐ 进行中': [], '⊗ 逾期': [], '✓ 完成': [] };
  for (const c of items) {
    const owner = c.owner_name ?? '?';
    const beneficiary = c.beneficiary_name ?? '?';
    const card: KanbanCard = {
      from: `${owner} → ${beneficiary}`,
      date: fmtDate(c.created_at ?? null),
      text: c.what,
      due: fmtDueLabel(c),
      late: c.status === 'slipped' || c.days_overdue > 7,
      warn: c.days_overdue > 0 && c.days_overdue <= 7,
      done: c.status === 'done',
    };
    if (c.status === 'done') groups['✓ 完成'].push(card);
    else if (c.status === 'slipped' || c.days_overdue > 7) groups['⊗ 逾期'].push(card);
    else if (!c.due_at) groups['○ 提出'].push(card);
    else groups['◐ 进行中'].push(card);
  }
  return COLUMN_DEFS.map((d) => ({
    name: d.name,
    tone: d.tone,
    count: groups[d.name].length,
    cards: groups[d.name].slice(0, 5),
  }));
}

export function CommitmentKanban() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [items, setItems] = useState<ApiCommitment[] | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/tower/commitments${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setItems((d?.items as ApiCommitment[]) ?? []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const columns = useMemo(() => {
    if (forceMock) return KANBAN;
    if (!items) return KANBAN; // 加载中, 临时显示 fixture 占位
    if (items.length === 0) {
      // 真有 0 条承诺, 给 4 个空列
      return COLUMN_DEFS.map((d) => ({ name: d.name, tone: d.tone, count: 0, cards: [] }));
    }
    return adaptToKanban(items);
  }, [forceMock, items]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
      }}
    >
      {columns.map((col) => (
        <div
          key={col.name}
          style={{
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(95,163,158,0.18)',
            borderTop: `2px solid ${col.tone}`,
            borderRadius: 4,
            padding: '12px 12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 8,
              borderBottom: `1px solid ${col.tone}30`,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: col.tone,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              {col.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: col.tone,
                fontWeight: 600,
              }}
            >
              {col.count}
            </span>
          </div>
          {col.cards.length === 0 && (
            <div style={{ fontSize: 11, color: 'rgba(232,239,242,0.4)', fontStyle: 'italic', padding: '8px 4px' }}>—</div>
          )}
          {col.cards.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                background: c.late
                  ? 'rgba(196,106,80,0.1)'
                  : c.warn
                  ? 'rgba(196,155,77,0.1)'
                  : c.done
                  ? 'rgba(95,163,158,0.06)'
                  : 'rgba(0,0,0,0.15)',
                border: `1px solid ${c.late ? 'rgba(196,106,80,0.4)' : c.warn ? 'rgba(196,155,77,0.4)' : 'rgba(95,163,158,0.18)'}`,
                borderRadius: 3,
                fontSize: 11.5,
                color: '#E8EFF2',
                opacity: c.done ? 0.65 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: 'rgba(232,239,242,0.55)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {(() => {
                    const split = splitOwnerLine(c.from);
                    if (!split) return <span>{c.from}</span>;
                    return (
                      <>
                        <PersonChip name={split.from} tone="#5FA39E" size="sm" />
                        <span style={{ opacity: 0.5 }}>{split.sep.trim()}</span>
                        <PersonChip name={split.to} tone="#5FA39E" size="sm" />
                      </>
                    );
                  })()}
                </span>
                <span>{c.date}</span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 12.5,
                  marginBottom: 4,
                  lineHeight: 1.4,
                }}
              >
                {c.text}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  color: c.late ? '#FFB89A' : 'rgba(232,239,242,0.5)',
                  fontWeight: c.late ? 600 : 400,
                }}
              >
                {c.due}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
