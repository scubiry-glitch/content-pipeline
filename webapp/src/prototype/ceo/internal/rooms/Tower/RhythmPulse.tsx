// Tower · ④ 节奏脉搏 (8 周双折线)
// 数据源: /api/v1/ceo/tower/pulse?weeks=8 → weeks: [{weekStart, mainHours, firefightingHours}], planLine
// fallback: forceMock=true 或 API 空时, 用 _towerFixtures.PULSE_WEEKS

import { useEffect, useMemo, useState } from 'react';
import { PULSE_WEEKS } from './_towerFixtures';
import { useGlobalScope } from '../../../shared/GlobalScopeFilter';
import { buildScopeQuery } from '../../../_apiAdapters';
import { useForceMock } from '../../../../meeting/_mockToggle';

interface PulseApi {
  weeks: Array<{ weekStart: string; mainHours: number; firefightingHours: number }>;
  planLine: number;
}

/** 把 hours 数组映射到 SVG 的 y 坐标 (越小越靠上). y 范围 [10, 130]. */
function hoursToY(h: number, maxH: number): number {
  if (maxH <= 0) return 70;
  // 110h 对齐 fixture 顶部 (y=30 区间), 0h → y=130
  const norm = Math.min(1, Math.max(0, h / maxH));
  return Math.round(130 - norm * 100);
}

export function RhythmPulse() {
  const forceMock = useForceMock();
  const { scopeIds } = useGlobalScope();
  const scopeKey = scopeIds.join(',');
  const [api, setApi] = useState<PulseApi | null>(null);

  useEffect(() => {
    if (forceMock) return;
    let cancelled = false;
    // 后端 weeks 参数缺省 = 8, 不传以兼容 buildScopeQuery 只生成 ? 前缀
    fetch(`/api/v1/ceo/tower/pulse${buildScopeQuery(scopeIds)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setApi(d as PulseApi); })
      .catch(() => { /* keep null → fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, forceMock]);

  const view = useMemo(() => {
    const xs = [20, 65, 110, 155, 200, 245, 290, 335];
    const useFallback = forceMock || !api || !api.weeks || api.weeks.length === 0;

    if (useFallback) {
      return {
        xs,
        mainPoints: PULSE_WEEKS.main.map((y, i) => `${xs[i]},${y}`).join(' '),
        firePoints: PULSE_WEEKS.firefighting.map((y, i) => `${xs[i]},${y}`).join(' '),
        planY: PULSE_WEEKS.plan,
        lastMainY: PULSE_WEEKS.main[7],
        lastFireY: PULSE_WEEKS.firefighting[7],
        warning: '战略主线本周飙升,但救火也在升 — 总工时 +12h,精力账户在透支。',
        planLabel: 'PLAN 20h',
      };
    }

    // 取最后 8 周; 如果不足 8 周, 前面补空 (空 = y=130 即底部)
    const last8 = api.weeks.slice(-8);
    const padN = 8 - last8.length;
    const main = [...Array(padN).fill(0), ...last8.map((w) => w.mainHours)];
    const fire = [...Array(padN).fill(0), ...last8.map((w) => w.firefightingHours)];
    const allH = [...main, ...fire];
    const maxH = Math.max(20, ...allH);
    const planLine = api.planLine ?? 20;

    const lastMainH = main[7] ?? 0;
    const lastFireH = fire[7] ?? 0;
    const prevMainH = main[6] ?? lastMainH;
    const prevFireH = fire[6] ?? lastFireH;
    const dMain = lastMainH - prevMainH;
    const dFire = lastFireH - prevFireH;

    let warning: string;
    if (lastFireH >= lastMainH * 0.5) {
      warning = `救火 ${lastFireH.toFixed(1)}h ≈ 主线 ${lastMainH.toFixed(1)}h 的 ${Math.round((lastFireH / Math.max(1, lastMainH)) * 100)}%, 救火占比偏高。`;
    } else if (dMain > 5 && dFire > 3) {
      warning = `战略主线本周 +${dMain.toFixed(1)}h, 救火也升 +${dFire.toFixed(1)}h, 精力账户在透支。`;
    } else if (lastMainH < planLine * 0.6) {
      warning = `本周战略主线仅 ${lastMainH.toFixed(1)}h, 远低于 PLAN ${planLine}h, 主线被稀释。`;
    } else {
      warning = `本周主线 ${lastMainH.toFixed(1)}h, 救火 ${lastFireH.toFixed(1)}h, 节奏在掌控内。`;
    }

    return {
      xs,
      mainPoints: main.map((h, i) => `${xs[i]},${hoursToY(h, maxH)}`).join(' '),
      firePoints: fire.map((h, i) => `${xs[i]},${hoursToY(h, maxH)}`).join(' '),
      planY: hoursToY(planLine, maxH),
      lastMainY: hoursToY(lastMainH, maxH),
      lastFireY: hoursToY(lastFireH, maxH),
      warning,
      planLabel: `PLAN ${planLine}h`,
    };
  }, [forceMock, api]);

  return (
    <div>
      <svg viewBox="0 0 360 140" style={{ width: '100%', height: 140 }} preserveAspectRatio="none">
        <g stroke="rgba(180,200,210,0.08)" strokeWidth="0.6">
          <line x1="0" y1="35" x2="360" y2="35" />
          <line x1="0" y1="70" x2="360" y2="70" />
          <line x1="0" y1="105" x2="360" y2="105" />
        </g>
        <polyline fill="none" stroke="#5FA39E" strokeWidth="2" points={view.mainPoints} />
        <polyline
          fill="none"
          stroke="#C46A50"
          strokeWidth="2"
          strokeDasharray="4 3"
          points={view.firePoints}
        />
        <line
          x1="0"
          y1={view.planY}
          x2="360"
          y2={view.planY}
          stroke="rgba(196,155,77,0.5)"
          strokeWidth="0.8"
          strokeDasharray="2 3"
        />
        <text x="6" y={view.planY - 2} fontFamily="var(--mono)" fontSize="7" fill="rgba(196,155,77,0.7)">
          {view.planLabel}
        </text>
        <g fill="#5FA39E">
          <circle cx={view.xs[view.xs.length - 1]} cy={view.lastMainY} r="3.5" />
        </g>
        <g fill="#C46A50">
          <circle cx={view.xs[view.xs.length - 1]} cy={view.lastFireY} r="3.5" />
        </g>
        <g fontFamily="var(--mono)" fontSize="7" fill="rgba(232,239,242,0.42)" letterSpacing="0.08em">
          <text x="20" y="135" textAnchor="middle">W-7</text>
          <text x="155" y="135" textAnchor="middle">W-3</text>
          <text x="335" y="135" textAnchor="middle">本周</text>
        </g>
      </svg>

      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 8,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(232,239,242,0.6)',
        }}
      >
        <span>
          <i style={{ display: 'inline-block', width: 12, height: 2, background: '#5FA39E', marginRight: 4, verticalAlign: 'middle' }} />
          战略主线
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 12, height: 2, background: '#C46A50', marginRight: 4, verticalAlign: 'middle' }} />
          救火
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 12, height: 0, borderTop: '1px dashed #C49B4D', marginRight: 4, verticalAlign: 'middle' }} />
          计划线
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(196,106,80,0.08)',
          borderLeft: '2px solid #C46A50',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 12.5,
          color: '#FFCFB7',
        }}
      >
        {view.warning}
      </div>
    </div>
  );
}
