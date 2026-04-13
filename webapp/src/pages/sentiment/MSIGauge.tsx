// MSI 环形仪表盘（ECharts gauge）+ 三分量横向进度条
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import type { MSIResult } from '../../api/sentiment';
import { MSI_LEVEL_COLORS, MSI_LEVEL_LABELS, msiValueToColor } from './colors';

interface Props {
  msi: MSIResult | null;
  fallbackValue?: number; // 当 msi 缺失时用 stats.msiIndex
}

export function MSIGauge({ msi, fallbackValue }: Props) {
  const value = msi?.value ?? fallbackValue ?? 0;
  const color = msi?.level ? MSI_LEVEL_COLORS[msi.level] : msiValueToColor(value);
  const levelText = msi?.level
    ? MSI_LEVEL_LABELS[msi.level]
    : value >= 60
      ? '乐观'
      : value >= 40
        ? '中性'
        : '悲观';

  const option = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          splitNumber: 10,
          radius: '92%',
          axisLine: {
            lineStyle: {
              width: 22,
              color: [
                [0.25, MSI_LEVEL_COLORS.extreme_fear],
                [0.45, MSI_LEVEL_COLORS.fear],
                [0.55, MSI_LEVEL_COLORS.neutral],
                [0.75, MSI_LEVEL_COLORS.greed],
                [1.0, MSI_LEVEL_COLORS.extreme_greed],
              ],
            },
          },
          pointer: {
            length: '60%',
            width: 6,
            itemStyle: { color },
          },
          axisTick: { distance: -26, length: 6, lineStyle: { color: '#fff', width: 1 } },
          splitLine: { distance: -28, length: 10, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: {
            distance: -14,
            fontSize: 11,
            color: 'var(--pebble, #94a3b8)',
          },
          detail: {
            valueAnimation: true,
            formatter: (v: number) => `${v.toFixed(1)}\n{label|${levelText}}`,
            rich: {
              label: {
                fontSize: 14,
                color: color,
                padding: [6, 0, 0, 0],
                fontWeight: 600,
              },
            },
            offsetCenter: [0, '20%'],
            fontSize: 36,
            fontWeight: 'bold',
            color: color,
          },
          data: [{ value }],
        },
      ],
    }),
    [value, color, levelText]
  );

  return (
    <div className="msi-gauge-wrap">
      <div className="msi-gauge-chart">
        <ReactECharts option={option} style={{ height: 280, width: '100%' }} />
      </div>
      {msi?.components && (
        <div className="msi-components">
          <h4>指数构成</h4>
          <ComponentBar label="新闻情感" value={msi.components.newsSentiment} />
          <ComponentBar label="社交媒体" value={msi.components.socialSentiment} />
          <ComponentBar label="专家观点" value={msi.components.expertSentiment} />
        </div>
      )}
    </div>
  );
}

function ComponentBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="component-bar">
      <span className="comp-label">{label}</span>
      <div className="comp-progress">
        <div
          className="comp-fill"
          style={{
            width: `${pct}%`,
            background: msiValueToColor(pct),
          }}
        />
      </div>
      <span className="comp-value">{pct.toFixed(0)}</span>
    </div>
  );
}
