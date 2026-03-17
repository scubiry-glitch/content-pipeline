import './Dashboard.css';

interface Alert {
  type: 'freshness' | 'credibility' | 'differentiation' | 'audience';
  severity: 'warning' | 'info' | 'error';
  message: string;
  suggestion: string;
}

interface AlertsProps {
  alerts: Alert[];
}

const alertTypeNames: Record<string, string> = {
  freshness: '时效性',
  credibility: '可信度',
  differentiation: '差异化',
  audience: '受众匹配',
};

export function Alerts({ alerts }: AlertsProps) {
  if (!alerts || alerts.length === 0) {
    return <div className="alert-placeholder">✅ 暂无预警</div>;
  }

  return (
    <div className="alerts-list">
      {alerts.map((alert, index) => (
        <div key={index} className={`alert alert-${alert.severity}`}>
          <span className="alert-type">{alertTypeNames[alert.type] || alert.type}</span>
          <span className="alert-message">{alert.message}</span>
          <span className="alert-suggestion">💡 建议: {alert.suggestion}</span>
        </div>
      ))}
    </div>
  );
}
