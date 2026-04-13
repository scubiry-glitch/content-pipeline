// 顶部 5 指标条：MSI / 24h / 7d / 今日分析 / 预警数
import type { MSIResult, SentimentAlert } from '../../api/sentiment';
import type { SentimentStats } from '../../api/client';
import { msiValueToColor, MSI_LEVEL_LABELS } from './colors';

interface Props {
  msi: MSIResult | null;
  stats: SentimentStats | null;
  alerts: SentimentAlert[];
}

function ChangeIndicator({ value, label }: { value: number; label: string }) {
  const up = value >= 0;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div
        className="kpi-value"
        style={{ color: up ? 'var(--sage)' : '#C75B5B' }}
      >
        {up ? '▲' : '▼'} {up ? '+' : ''}
        {value.toFixed(1)}
      </div>
    </div>
  );
}

export function KpiStrip({ msi, stats, alerts }: Props) {
  const msiVal = msi?.value ?? stats?.msiIndex ?? 0;
  const msiColor = msi
    ? (msi.level && { extreme_fear: '#C75B5B', fear: '#D4A574', neutral: '#6B9FB8', greed: '#7A9E6B', extreme_greed: '#9CC17B' })[msi.level] ?? msiValueToColor(msiVal)
    : msiValueToColor(msiVal);
  const levelLabel = msi?.level ? MSI_LEVEL_LABELS[msi.level] : undefined;
  const highSeverityAlerts = alerts.filter((a) => a.severity === 'high').length;

  return (
    <div className="kpi-strip">
      <div className="kpi-card kpi-hero">
        <div className="kpi-label">MSI 市场情绪指数</div>
        <div className="kpi-value kpi-value-hero" style={{ color: msiColor }}>
          {msiVal.toFixed(1)}
        </div>
        {levelLabel && (
          <div className="kpi-sub" style={{ color: msiColor }}>
            {levelLabel}
          </div>
        )}
      </div>

      <ChangeIndicator value={msi?.change24h ?? 0} label="24 小时变化" />
      <ChangeIndicator value={msi?.change7d ?? 0} label="7 天变化" />

      <div className="kpi-card">
        <div className="kpi-label">今日分析量</div>
        <div className="kpi-value">{stats?.total ?? 0}</div>
        <div className="kpi-sub">
          正面 {stats?.positive ?? 0} · 负面 {stats?.negative ?? 0}
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">异常预警</div>
        <div
          className="kpi-value"
          style={{
            color: highSeverityAlerts > 0 ? '#C75B5B' : 'var(--sage)',
          }}
        >
          {alerts.length}
        </div>
        <div className="kpi-sub">高危 {highSeverityAlerts}</div>
      </div>
    </div>
  );
}
