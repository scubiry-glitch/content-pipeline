// War Room · ① 阵型图 (battle table)
// 数据源: /api/v1/ceo/war-room/formation → snapshot.formation_data {nodes, links, conflict_temp, gaps}
// fallback: forceMock=true 或 API 空时, 用 _warRoomFixtures.NODES + LINES

import { useEffect, useMemo, useState } from 'react';
import { NODES, LINES, type FormationLine, type FormationNode } from './_warRoomFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface ApiNode {
  id: string;
  label: string;
  role?: string;
  weight?: number;
  [k: string]: unknown;
}

interface ApiLink {
  source: string;
  target: string;
  kind: 'supports' | 'conflicts' | 'silent' | 'reports';
  temp: number;
  [k: string]: unknown;
}

interface FormationData {
  nodes: ApiNode[];
  links: ApiLink[];
  conflict_temp?: number;
  gaps?: Array<{ text: string; action: string; severity: string }>;
  conflict_kinds?: Record<string, number>;
}

const NODE_FILL: Record<string, string> = {
  self: '#1A0E0E',
  ally: '#2A1818',
  advisor: '#2A1818',
  edge: '#1A0E0E',
};

const NODE_STROKE: Record<string, { color: string; width: number; dash?: string }> = {
  self: { color: '#D64545', width: 2 },
  ally: { color: '#C8A15C', width: 1.5 },
  advisor: { color: 'rgba(245,217,217,0.4)', width: 1.2, dash: '3 3' },
  edge: { color: 'rgba(160,150,140,0.4)', width: 1, dash: '1 3' },
};

const LINE_STYLE: Record<FormationLine['kind'], { color: string; width: number; dash?: string; opacity?: number }> = {
  support: { color: '#C8A15C', width: 1.5 },
  advisor: { color: 'rgba(245,217,217,0.4)', width: 1.2, dash: '4 4' },
  tension: { color: '#D64545', width: 1, dash: '6 3', opacity: 0.5 },
  silent: { color: 'rgba(160,150,140,0.25)', width: 1, dash: '1 4' },
};

const KIND_MAP: Record<ApiLink['kind'], FormationLine['kind']> = {
  supports: 'support',
  conflicts: 'tension',
  silent: 'silent',
  reports: 'advisor',
};

/** 把 API node 数组按 weight 分到 self/ally/advisor/edge, 极坐标布局 (CEO 居中). */
function adaptToFixture(formation: FormationData): { nodes: FormationNode[]; lines: FormationLine[] } {
  const apiNodes = formation.nodes ?? [];
  const apiLinks = formation.links ?? [];
  if (apiNodes.length === 0) return { nodes: [], lines: [] };

  // 选一个 "self" 节点: 优先 role 含 CEO/创始/founder/principal, 否则 weight 最大那个
  const findSelf = (n: ApiNode) =>
    /CEO|创始|founder|principal|partner|主理|GP/i.test(`${n.role ?? ''} ${n.label ?? ''}`);
  let selfNode = apiNodes.find(findSelf);
  if (!selfNode) {
    selfNode = [...apiNodes].sort((a, b) => (b.weight ?? 0.5) - (a.weight ?? 0.5))[0];
  }
  const selfId = selfNode?.id;

  const classify = (n: ApiNode): FormationNode['variant'] => {
    if (n.id === selfId) return 'self';
    const w = n.weight ?? 0.5;
    const role = (n.role ?? '').toLowerCase();
    if (/lp|外部|external|press|媒体|监管|regulat|peer|同行/i.test(role)) return 'edge';
    if (/独立|独董|advisor|顾问|investor/i.test(role)) return 'advisor';
    if (w >= 0.5) return 'ally';
    return 'advisor';
  };

  const variants = apiNodes.map((n) => ({ n, variant: classify(n) }));
  const allies = variants.filter((x) => x.variant === 'ally');
  const advisors = variants.filter((x) => x.variant === 'advisor');
  const edges = variants.filter((x) => x.variant === 'edge');
  const cx0 = 300;
  const cy0 = 250;

  const placeRing = (group: typeof variants, r: number, startAngle: number): Array<[ApiNode, number, number]> => {
    if (group.length === 0) return [];
    const step = (Math.PI * 2) / Math.max(group.length, 4);
    return group.map((x, i) => {
      const ang = startAngle + step * i;
      return [x.n, cx0 + r * Math.cos(ang), cy0 + r * Math.sin(ang)];
    });
  };

  const allyPos = placeRing(allies, 120, -Math.PI / 2);          // 120 半径环
  const advisorPos = placeRing(advisors, 180, -Math.PI / 4);     // 180 环
  const edgePos = placeRing(edges, 220, Math.PI / 4);            // 220 远环

  const layout: Record<string, { cx: number; cy: number; r: number }> = {};
  if (selfNode) layout[selfNode.id] = { cx: cx0, cy: cy0, r: 28 };
  for (const [n, x, y] of allyPos) layout[n.id] = { cx: x, cy: y, r: 22 };
  for (const [n, x, y] of advisorPos) layout[n.id] = { cx: x, cy: y, r: 20 };
  for (const [n, x, y] of edgePos) layout[n.id] = { cx: x, cy: y, r: 18 };

  const fnodes: FormationNode[] = variants.map(({ n, variant }) => {
    const lay = layout[n.id] ?? { cx: cx0, cy: cy0, r: 18 };
    // label 保留真实姓名 (中文 2-3 字 / 英文 First Last 全名都直接展示),
    // SVG text 自动溢出. 之前 split + slice(4) 把 "Wei Zhao" 截成 "Wei", 不合预期.
    const fullName = String(n.label ?? n.id).trim();
    return {
      id: n.id,
      name: fullName,
      role: n.role ?? '',
      cx: lay.cx,
      cy: lay.cy,
      r: lay.r,
      variant,
    };
  });

  // 仅保留两端都在 nodes 中的 link; kind 映射
  const validIds = new Set(apiNodes.map((n) => n.id));
  const flines: FormationLine[] = apiLinks
    .filter((l) => validIds.has(l.source) && validIds.has(l.target))
    .map((l) => ({ from: l.source, to: l.target, kind: KIND_MAP[l.kind] ?? 'silent' }));

  return { nodes: fnodes, lines: flines };
}

export function FormationMap() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [api, setApi] = useState<{ snapshot: { formation_data: FormationData } | null } | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/war-room/formation${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setApi(d); })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const { displayNodes, displayLines } = useMemo(() => {
    const formationData = api?.snapshot?.formation_data;
    if (forceMock || !formationData || (formationData.nodes ?? []).length === 0) {
      return { displayNodes: NODES, displayLines: LINES };
    }
    const adapted = adaptToFixture(formationData);
    if (adapted.nodes.length === 0) return { displayNodes: NODES, displayLines: LINES };
    return { displayNodes: adapted.nodes, displayLines: adapted.lines };
  }, [forceMock, api]);

  return (
    <div>
      <div
        style={{
          background:
            'radial-gradient(circle at center, rgba(214,69,69,0.08) 0%, transparent 70%), #0F0707',
          border: '1px solid rgba(214,69,69,0.18)',
          borderRadius: 4,
          padding: 12,
        }}
      >
        <svg viewBox="0 0 600 500" style={{ width: '100%', height: 480 }}>
          <circle cx="300" cy="250" r="40" fill="none" stroke="rgba(214,69,69,0.18)" strokeDasharray="2 4" />
          <circle cx="300" cy="250" r="120" fill="none" stroke="rgba(214,69,69,0.12)" strokeDasharray="2 6" />
          <circle cx="300" cy="250" r="200" fill="none" stroke="rgba(214,69,69,0.08)" strokeDasharray="2 8" />

          {displayLines.map((l, i) => {
            const a = displayNodes.find((n) => n.id === l.from);
            const b = displayNodes.find((n) => n.id === l.to);
            if (!a || !b) return null;
            const s = LINE_STYLE[l.kind];
            return (
              <line
                key={i}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                opacity={s.opacity}
              />
            );
          })}

          {displayNodes.map((n) => {
            const stroke = NODE_STROKE[n.variant];
            return (
              <g key={n.id} style={{ cursor: 'default' }}>
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={n.r}
                  fill={NODE_FILL[n.variant]}
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeDasharray={stroke.dash}
                />
                <text
                  x={n.cx}
                  y={n.cy + 5}
                  textAnchor="middle"
                  fontFamily="var(--serif)"
                  fontStyle="italic"
                  fontSize={n.r >= 24 ? 13 : 11}
                  fill={n.variant === 'edge' ? 'rgba(245,217,217,0.6)' : '#F5D9D9'}
                >
                  {n.name}
                </text>
                <text
                  x={n.cx}
                  y={n.variant === 'self' ? n.cy + 45 : n.variant === 'ally' || n.variant === 'edge' ? n.cy - n.r - 8 : n.cy - n.r - 5}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize="9.5"
                  fill="rgba(245,217,217,0.7)"
                >
                  {n.role}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          marginTop: 12,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(245,217,217,0.7)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 2, background: '#C8A15C', marginRight: 6, verticalAlign: 'middle' }} />
          共识/支持
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 0, borderTop: '1.5px dashed rgba(245,217,217,0.6)', marginRight: 6, verticalAlign: 'middle' }} />
          智囊/弱联结
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 0, borderTop: '1.5px dashed #D64545', marginRight: 6, verticalAlign: 'middle' }} />
          张力/冲突
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 14, height: 1, background: 'rgba(160,150,140,0.5)', marginRight: 6, verticalAlign: 'middle' }} />
          沉默/边缘
        </span>
      </div>
    </div>
  );
}
