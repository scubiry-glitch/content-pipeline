// Tower · ⑤ 透支预警 (gauge)
// 数据源: /api/v1/ceo/tower/deficit → { weekStart, energyGauge, metrics: [{key, actual, budget, unit, status, delta}] }
// fallback: forceMock=true 或 API 空时, 用 _towerFixtures.DEFICIT

import { useEffect, useMemo, useState } from 'react';
import { DEFICIT } from './_towerFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface DeficitApi {
  weekStart: string;
  energyGauge: { value: number; label: string; color: string };
  metrics: Array<{ key: string; actual: number; budget: number; unit: string; status: string; delta: string }>;
}

export function DeficitAlert() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();           // 仅用于触发 re-fetch; deficit endpoint 不接 scope
  const scopeKey = scopeIds.join(',');
  const [api, setApi] = useState<DeficitApi | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    fetch(`/api/v1/ceo/tower/deficit`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setApi(d as DeficitApi); })
      .catch(() => { /* fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const view = useMemo(() => {
    if (forceMock || !api?.metrics) {
      return {
        pct: DEFICIT.pct,
        totalH: DEFICIT.totalH,
        budgetH: DEFICIT.budgetH,
        warning: DEFICIT.warning,
        color: '#C46A50',
      };
    }
    const work = api.metrics.find((m) => m.key.includes('工时')) ?? api.metrics[0];
    const totalH = Math.round(work?.actual ?? 0);
    const budgetH = Math.round(work?.budget ?? 50);
    const pct = budgetH > 0 ? Math.round((totalH / budgetH) * 100) : 0;
    const overH = totalH - budgetH;
    const energy = api.energyGauge?.label ?? '';
    let warning: string;
    if (overH >= 6) warning = `透支 ${overH}h ≈ ${(overH / 4).toFixed(1)} 个工作日。${energy}.`;
    else if (overH > 0) warning = `本周轻度透支 ${overH}h。${energy}.`;
    else if (overH < 0) warning = `本周节余 ${-overH}h，状态：${energy}.`;
    else warning = `本周打平 (${totalH}h / ${budgetH}h budget)，${energy}.`;
    return { pct, totalH, budgetH, warning, color: api.energyGauge?.color ?? '#C46A50' };
  }, [forceMock, api]);

  const pctClamped = Math.min(150, view.pct);
  const dashLen = Math.round(2 * Math.PI * 42 * (pctClamped / 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg viewBox="0 0 100 100" style={{ width: 130, height: 130 }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(180,200,210,0.1)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={view.color}
          strokeWidth="8"
          strokeDasharray={`${dashLen} 264`}
          strokeDashoffset="0"
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
        />
        <text x="50" y="48" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="18" fill={view.color} fontWeight="600">
          {view.pct}%
        </text>
        <text x="50" y="62" textAnchor="middle" fontFamily="var(--mono)" fontSize="6" fill="rgba(232,239,242,0.42)" letterSpacing="0.15em">
          {view.pct >= 100 ? '透支' : '占用'}
        </text>
      </svg>
      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.7, color: 'rgba(232,239,242,0.85)' }}>
        本周总工时 <b style={{ color: view.color }}>{view.totalH}h</b>，预算 {view.budgetH}h。
        <div
          style={{
            marginTop: 8,
            padding: '7px 11px',
            background: 'rgba(196,106,80,0.08)',
            borderLeft: `2px solid ${view.color}`,
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 12,
            color: '#FFCFB7',
          }}
        >
          {view.warning}
        </div>
      </div>
    </div>
  );
}
