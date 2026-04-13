// 异常预警网格
import type { SentimentAlert } from '../../api/sentiment';
import { ALERT_ICONS, ALERT_LABELS } from './colors';

interface Props {
  alerts: SentimentAlert[];
}

export function AlertsGrid({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="empty-alerts">
        <span className="empty-icon">✅</span>
        <p>暂无异常预警，市场情绪平稳</p>
      </div>
    );
  }

  return (
    <div className="alerts-grid">
      {alerts.map((alert, idx) => (
        <div key={idx} className={`alert-card severity-${alert.severity}`}>
          <div className="alert-icon">{ALERT_ICONS[alert.alertType] ?? 'ℹ️'}</div>
          <div className="alert-content">
            <h4 className="alert-topic">{alert.topicTitle}</h4>
            <p className="alert-message">{alert.message}</p>
            <span className={`alert-type type-${alert.alertType}`}>
              {ALERT_LABELS[alert.alertType] ?? alert.alertType}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
