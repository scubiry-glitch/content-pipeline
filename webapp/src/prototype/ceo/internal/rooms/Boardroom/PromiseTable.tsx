// Boardroom · ④ 上次董事会承诺追踪
// 数据源: GET /api/v1/ceo/boardroom/promises (无 briefId 时 union mn_commitments + ceo_board_promises)
// 显示 source pill (mn 蓝 / ceo 金) 区分来源

import { useEffect, useState } from 'react';
import { PROMISES } from './_boardroomFixtures';
import { useSelectedScopes } from '../../../shared/ScopePicker';
import { PersonChip } from '../../../shared/PersonChip';

interface ApiPromise {
  id: string;
  what: string;
  owner: string | null;
  due_at: string | null;
  status: string;
  source: 'mn' | 'ceo';
  person_id: string | null;
  person_role: string | null;
  progress?: number;
}

const STATUS_TONE = (status: string): { bg: string; ink: string; border: string; label: string } => {
  // 兼容 mn (on_track/at_risk/done/slipped) + ceo (in_progress/done/late/dropped)
  if (status === 'done' || status === 'completed') {
    return { bg: 'rgba(106,154,92,0.2)', ink: '#A6CC9A', border: 'rgba(106,154,92,0.5)', label: '已完成' };
  }
  if (status === 'late' || status === 'slipped') {
    return { bg: 'rgba(168,69,30,0.18)', ink: '#FFB89A', border: 'rgba(168,69,30,0.5)', label: '延期' };
  }
  if (status === 'at_risk') {
    return { bg: 'rgba(196,155,77,0.18)', ink: '#F3D27A', border: 'rgba(196,155,77,0.5)', label: '风险中' };
  }
  if (status === 'on_track') {
    return { bg: 'rgba(95,163,158,0.18)', ink: '#A6E0D8', border: 'rgba(95,163,158,0.5)', label: '进行中' };
  }
  if (status === 'in_progress') {
    return { bg: 'rgba(212,168,75,0.18)', ink: '#F3D27A', border: 'rgba(212,168,75,0.5)', label: '进行中' };
  }
  if (status === 'dropped') {
    return { bg: 'rgba(180,180,180,0.15)', ink: 'rgba(232,239,242,0.55)', border: 'rgba(180,180,180,0.4)', label: '放弃' };
  }
  return { bg: 'rgba(180,180,180,0.15)', ink: 'rgba(232,239,242,0.55)', border: 'rgba(180,180,180,0.4)', label: status };
};

const SOURCE_TONE: Record<'mn' | 'ceo', { bg: string; ink: string; label: string }> = {
  mn: { bg: 'rgba(123,167,196,0.15)', ink: '#7BA7C4', label: 'mn · 人物轴' },
  ceo: { bg: 'rgba(212,168,75,0.15)', ink: '#D4A84B', label: 'ceo · 自填' },
};

export function PromiseTable() {
  const scopeIds = useSelectedScopes();
  const [items, setItems] = useState<ApiPromise[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const q = scopeIds.length > 0 ? `?scopes=${scopeIds.join(',')}` : '';
    fetch(`/api/v1/ceo/boardroom/promises${q}`)
      .then((r) => r.json())
      .then((d: { items: ApiPromise[] }) => {
        if (cancelled) return;
        setItems(d.items ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scopeIds.join(',')]);

  // API 空时回退 fixture (做演示)
  const display: Array<{ what: string; owner: string; status: string; source: 'mn' | 'ceo'; person_id?: string | null; person_role?: string | null; statusText?: string }> =
    items && items.length > 0
      ? items.map((p) => ({
          what: p.what,
          owner: p.owner ?? '—',
          status: p.status,
          source: p.source,
          person_id: p.person_id,
          person_role: p.person_role,
        }))
      : PROMISES.map((p) => ({
          what: p.what,
          owner: p.owner,
          status: p.status,
          source: 'ceo' as const,
          statusText: p.statusText,
        }));

  return (
    <div>
      {loading && (
        <div style={{ fontSize: 11, color: 'rgba(240,232,214,0.5)', fontStyle: 'italic', marginBottom: 8 }}>
          加载承诺…
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 10,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(240,232,214,0.55)',
        }}
      >
        <span>共 {display.length} 条</span>
        <span style={{ color: '#7BA7C4' }}>
          mn 来源 {display.filter((d) => d.source === 'mn').length}
        </span>
        <span style={{ color: '#D4A84B' }}>
          ceo 来源 {display.filter((d) => d.source === 'ceo').length}
        </span>
        {scopeIds.length > 0 && (
          <span style={{ marginLeft: 'auto' }}>scope 过滤: {scopeIds.length} 项</span>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['来源', '承诺', '责任人', '状态'].map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: 'left',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'rgba(240,232,214,0.45)',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  padding: '8px 10px',
                  borderBottom: '1px solid rgba(212,168,75,0.15)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((p, i) => {
            const tone = STATUS_TONE(p.status);
            const src = SOURCE_TONE[p.source];
            return (
              <tr key={i}>
                <td style={{ padding: '10px 10px', borderBottom: '1px solid rgba(212,168,75,0.08)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      padding: '2px 8px',
                      background: src.bg,
                      color: src.ink,
                      borderRadius: 99,
                      letterSpacing: 0.2,
                    }}
                  >
                    {src.label}
                  </span>
                </td>
                <td
                  style={{
                    padding: '10px 10px',
                    fontSize: 13,
                    color: '#F0E8D6',
                    fontFamily: 'var(--serif)',
                    borderBottom: '1px solid rgba(212,168,75,0.08)',
                  }}
                >
                  {p.what}
                </td>
                <td
                  style={{
                    padding: '10px 10px',
                    fontSize: 12,
                    color: 'rgba(240,232,214,0.7)',
                    borderBottom: '1px solid rgba(212,168,75,0.08)',
                  }}
                >
                  {p.owner === '—' ? (
                    <span>—</span>
                  ) : (
                    <PersonChip
                      personId={p.person_id ?? null}
                      name={p.owner}
                      role={p.person_role ?? null}
                      tone="#D4A84B"
                      size="sm"
                    />
                  )}
                </td>
                <td
                  style={{
                    padding: '10px 10px',
                    borderBottom: '1px solid rgba(212,168,75,0.08)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10.5,
                      padding: '3px 9px',
                      background: tone.bg,
                      color: tone.ink,
                      border: `1px solid ${tone.border}`,
                      borderRadius: 99,
                      letterSpacing: 0.3,
                    }}
                  >
                    {p.statusText ?? tone.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
