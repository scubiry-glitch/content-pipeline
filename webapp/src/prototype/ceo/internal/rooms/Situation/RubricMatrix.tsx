// Situation · ③ Rubric 矩阵
// 数据源: /api/v1/ceo/situation/rubric → { dimensions: string[], rows: [{stakeholderName, kind, scores, avg}] }
// fallback: forceMock=true 或 API 空 / 单行无 stakeholder 时, 用 _situationFixtures.RUBRIC_*

import { useEffect, useMemo, useState } from 'react';
import { RUBRIC_DIMS, RUBRIC_ROWS } from './_situationFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface RubricApi {
  dimensions: string[];
  rows: Array<{ stakeholderName: string; kind: string; scores: Record<string, number>; avg: number }>;
}

function scoreClass(s: number): { bg: string; ink: string } {
  if (s >= 7.5) return { bg: 'rgba(95,163,158,0.5)', ink: '#A5DDD7' };
  if (s >= 6) return { bg: 'rgba(196,155,77,0.5)', ink: '#FFE7BA' };
  return { bg: 'rgba(196,106,80,0.5)', ink: '#FFB89A' };
}

export function RubricMatrix() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [api, setApi] = useState<RubricApi | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/situation/rubric${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setApi(d as RubricApi); })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const { dims, rows } = useMemo(() => {
    // API 数据可用条件: 有 dimensions + rows 且至少 1 行有具名 stakeholder
    const hasNamedActor = api?.rows?.some((r) => r.stakeholderName && r.stakeholderName !== '匿名') ?? false;
    if (forceMock || !api?.rows || api.rows.length === 0 || !hasNamedActor) {
      // fixture 路径: scores ∈ [0..10]
      return {
        dims: RUBRIC_DIMS,
        rows: RUBRIC_ROWS.map((r) => ({
          who: r.who,
          sub: r.sub,
          scores: r.scores,
          avg: r.scores.reduce((a, b) => a + b, 0) / r.scores.length,
        })),
      };
    }
    // API 路径: scores ∈ [0..1], 转 [0..10] 显示
    const dimsApi = api.dimensions ?? [];
    return {
      dims: dimsApi,
      rows: api.rows.map((r) => ({
        who: r.stakeholderName,
        sub: r.kind,
        scores: dimsApi.map((d) => Number(((r.scores[d] ?? 0) * 10).toFixed(1))),
        avg: Number((r.avg * 10).toFixed(1)),
      })),
    };
  }, [forceMock, api]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(253,243,212,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,200,87,0.18)', width: '20%' }}>
              利益方
            </th>
            {dims.map((d, i) => (
              <th key={i} style={{ textAlign: 'center', padding: '8px 6px', fontFamily: 'var(--mono)', fontSize: 9.5, color: '#FFC857', letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,200,87,0.18)' }}>
                {d}
              </th>
            ))}
            <th style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(253,243,212,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,200,87,0.18)', width: '8%' }}>
              均分
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: '10px 10px', fontSize: 12.5, color: '#FDF3D4', borderBottom: '1px solid rgba(255,200,87,0.08)' }}>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 600 }}>{r.who}</div>
                <div style={{ fontSize: 10, color: 'rgba(253,243,212,0.5)', marginTop: 2 }}>{r.sub}</div>
              </td>
              {r.scores.map((s, j) => {
                const cls = scoreClass(s);
                return (
                  <td key={j} style={{ padding: '6px 6px', textAlign: 'center', borderBottom: '1px solid rgba(255,200,87,0.08)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: cls.ink, fontWeight: 600, marginBottom: 3 }}>
                      {s.toFixed(1)}
                    </div>
                    <div style={{ height: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 99, overflow: 'hidden' }}>
                      <i style={{ display: 'block', height: '100%', width: `${s * 10}%`, background: cls.bg }} />
                    </div>
                  </td>
                );
              })}
              <td style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: scoreClass(r.avg).ink, borderBottom: '1px solid rgba(255,200,87,0.08)' }}>
                {r.avg.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
