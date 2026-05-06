// Situation · ① 利益相关方热力图
// 数据源: /api/v1/ceo/situation/stakeholders → items: [{id, name, kind, heat, signals_30d_count, last_signal_summary, ...}]
// fallback: forceMock=true 或 API 空时, 用 _situationFixtures.HEATMAP_NODES + STAKEHOLDERS

import { useEffect, useMemo, useState } from 'react';
import { HEATMAP_NODES, STAKEHOLDERS, type StakeholderNode, type StakeholderRow } from './_situationFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface ApiStakeholder {
  id: string;
  scope_id: string | null;
  name: string;
  kind: string;
  heat: number;
  last_signal_at: string | null;
  description: string | null;
  escalation_path: string | null;
  signals_30d_count: number;
  last_signal_summary: string | null;
}

/** 由 kind 决定颜色 + 形状 */
function kindStyle(kind: string): { fill: string; stroke: string; arrowColor: string } {
  const k = (kind ?? '').toLowerCase();
  if (/lp|investor|funder|主投|出资|股东/.test(k)) return { fill: 'rgba(196,106,80,0.7)', stroke: '#C46A50', arrowColor: '#C46A50' };
  if (/board|director|董/.test(k))                    return { fill: 'rgba(196,155,77,0.5)',  stroke: '#C49B4D', arrowColor: '#C49B4D' };
  if (/regulat|监管|合规/.test(k))                     return { fill: 'rgba(102,121,181,0.4)', stroke: '#6679B5', arrowColor: '#8B9BC8' };
  if (/peer|同行|友|partner|上下游/.test(k))           return { fill: 'rgba(196,155,77,0.45)', stroke: '#C49B4D', arrowColor: '#C49B4D' };
  if (/team|员工|内部/.test(k))                       return { fill: 'rgba(95,163,158,0.5)',  stroke: '#5FA39E', arrowColor: '#5FA39E' };
  if (/press|media|媒体/.test(k))                     return { fill: 'rgba(102,121,181,0.4)', stroke: '#6679B5', arrowColor: '#8B9BC8' };
  if (/customer|client|租客|业主|客户/.test(k))         return { fill: 'rgba(95,163,158,0.5)',  stroke: '#5FA39E', arrowColor: '#5FA39E' };
  return { fill: 'rgba(102,121,181,0.4)', stroke: '#6679B5', arrowColor: '#8B9BC8' };
}

/** 由 heat 推导箭头方向与文字 */
function heatArrow(heat: number, signals30d: number): string {
  if (heat >= 0.8 && signals30d >= 5) return '↑↑↑';
  if (heat >= 0.6 || signals30d >= 3) return '↑↑';
  if (heat >= 0.4 || signals30d >= 1) return '↑';
  if (heat >= 0.25)                    return '↗';
  return '→';
}

/** 由 heat 推导温度文字 (右栏) */
function heatTemp(heat: number, signals30d: number): { temp: string; hot?: boolean; warm?: boolean; calm?: boolean } {
  if (heat >= 0.7) return { temp: `温度 ↑↑↑ · ${signals30d} 信号/30 天`, hot: true };
  if (heat >= 0.45) return { temp: `温度 ↑↑ · ${signals30d} 信号/30 天`, warm: true };
  if (heat >= 0.25) return { temp: `温度 ↑ · ${signals30d} 信号/30 天`, warm: true };
  if (heat >= 0.1)  return { temp: `温度 ↗ · ${signals30d} 信号/30 天`, calm: true };
  return { temp: `温度 → · 平稳`, calm: true };
}

/** 极坐标布局: heat 高 → 离 CEO 近. 6+ 个均匀分布角度. */
function placeNodes(items: ApiStakeholder[]): StakeholderNode[] {
  const n = items.length;
  if (n === 0) return [];
  const stepAngle = (Math.PI * 2) / n;
  return items.map((s, i) => {
    const heat = Math.max(0.1, Math.min(1, s.heat));
    const radius = 100 - heat * 60;          // heat=1 → 40, heat=0.1 → 94
    const angle = -Math.PI / 2 + stepAngle * i;
    const cx = Math.round(radius * Math.cos(angle));
    const cy = Math.round(radius * Math.sin(angle));
    const r = 12 + Math.round(heat * 10);    // 12..22
    const style = kindStyle(s.kind);
    return {
      id: s.id,
      name: s.name.length > 4 ? s.name.slice(0, 3) + '…' : s.name,
      cx, cy, r,
      fill: style.fill,
      stroke: style.stroke,
      arrow: heatArrow(heat, s.signals_30d_count),
      arrowColor: style.arrowColor,
    };
  });
}

/** 右栏富文本行 */
function makeRows(items: ApiStakeholder[]): StakeholderRow[] {
  return items.map((s) => {
    const t = heatTemp(s.heat, s.signals_30d_count);
    return {
      name: s.name,
      scope: s.kind + (s.description ? ` · ${s.description.slice(0, 28)}` : ''),
      temp: t.temp,
      text: s.last_signal_summary ?? s.escalation_path ?? '尚无 30 天内外部信号',
      hot: t.hot,
      warm: t.warm,
      calm: t.calm,
    };
  });
}

export function StakeholderHeatmap() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [items, setItems] = useState<ApiStakeholder[] | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/situation/stakeholders${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setItems((d?.items as ApiStakeholder[]) ?? []); })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const { nodes, rows } = useMemo(() => {
    if (forceMock || !items) return { nodes: HEATMAP_NODES, rows: STAKEHOLDERS };
    if (items.length === 0) return { nodes: HEATMAP_NODES, rows: STAKEHOLDERS }; // 空 = 用 fixture 占位
    return { nodes: placeNodes(items.slice(0, 8)), rows: makeRows(items) };
  }, [forceMock, items]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
      <div style={{ width: 320, height: 300 }}>
        <svg viewBox="0 0 320 300" style={{ width: '100%', height: '100%' }}>
          <g transform="translate(160 150)">
            <circle r="125" fill="none" stroke="rgba(178,195,220,0.1)" strokeWidth="0.8" />
            <circle r="90" fill="none" stroke="rgba(178,195,220,0.1)" strokeWidth="0.8" />
            <circle r="55" fill="none" stroke="rgba(178,195,220,0.1)" strokeWidth="0.8" />
            <text x="0" y="-128" textAnchor="middle" fontFamily="var(--mono)" fontSize="8" fill="rgba(230,236,245,0.42)" letterSpacing="0.15em">远</text>
            <text x="0" y="-58"  textAnchor="middle" fontFamily="var(--mono)" fontSize="8" fill="rgba(230,236,245,0.42)" letterSpacing="0.15em">近</text>
            <circle r="14" fill="rgba(102,121,181,0.2)" stroke="#6679B5" strokeWidth="1.5" />
            <text x="0" y="3" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="11" fill="#8B9BC8">你</text>
            {nodes.map((n) => (
              <g key={n.id}>
                <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} stroke={n.stroke} strokeWidth="1.5" />
                <text x={n.cx} y={n.cy + 3} textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize={n.r >= 18 ? 11 : 9.5} fill="#fff">
                  {n.name}
                </text>
                <text x={n.cx} y={n.cy + n.r + 12} textAnchor="middle" fontFamily="var(--mono)" fontSize="8" fill={n.arrowColor}>
                  {n.arrow}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((s, i) => (
          <div
            key={i}
            style={{
              padding: '8px 12px',
              background: s.hot ? 'rgba(196,106,80,0.1)' : s.warm ? 'rgba(196,155,77,0.08)' : s.calm ? 'rgba(95,163,158,0.06)' : 'rgba(102,121,181,0.05)',
              border: `1px solid ${s.hot ? 'rgba(196,106,80,0.4)' : s.warm ? 'rgba(196,155,77,0.3)' : 'rgba(102,121,181,0.2)'}`,
              borderLeft: `3px solid ${s.hot ? '#C46A50' : s.warm ? '#C49B4D' : s.calm ? '#5FA39E' : '#6679B5'}`,
              borderRadius: '0 3px 3px 0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 12.5, color: '#FDF3D4' }}>
                <b>{s.name}</b>
                <span style={{ opacity: 0.65, marginLeft: 4 }}>· {s.scope}</span>
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: s.hot ? '#FFB89A' : s.warm ? '#FFE7BA' : 'rgba(253,243,212,0.6)' }}>
                {s.temp}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(253,243,212,0.7)', lineHeight: 1.45 }}>
              {s.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
