import { useActivity, type Activity } from '../contexts/ActivityContext';
import './ActivityHistory.css';

interface ActivityHistoryProps {
  entityType?: string;
  entityId?: string;
  limit?: number;
  showTitle?: boolean;
}

export function ActivityHistory({
  entityType,
  entityId,
  limit = 20,
  showTitle = true,
}: ActivityHistoryProps) {
  const { activities, getActivitiesByEntity, getRecentActivities } = useActivity();

  const displayActivities = entityType && entityId
    ? getActivitiesByEntity(entityType, entityId).slice(0, limit)
    : getRecentActivities(limit);

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'create': return '➕';
      case 'update': return '✏️';
      case 'delete': return '🗑️';
      case 'status_change': return '🔄';
      case 'review': return '👁️';
      case 'export': return '📤';
      case 'import': return '📥';
      default: return '📝';
    }
  };

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'create': return '#7A9E6B';
      case 'update': return '#C67B5C';
      case 'delete': return '#ff4d4f';
      case 'status_change': return '#D46648';
      case 'review': return '#8A9A5B';
      case 'export': return '#1890ff';
      case 'import': return '#722ed1';
      default: return '#B88A6B';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(date).toLocaleDateString('zh-CN');
  };

  if (displayActivities.length === 0) {
    return (
      <div className="activity-history-empty">
        <span>📭</span>
        <p>暂无操作记录</p>
      </div>
    );
  }

  return (
    <div className="activity-history">
      {showTitle && <h3 className="activity-title">📋 操作历史</h3>}
      <div className="activity-list">
        {displayActivities.map((activity) => (
          <div key={activity.id} className="activity-item">
            <div
              className="activity-icon"
              style={{ backgroundColor: `${getActivityColor(activity.type)}20`, color: getActivityColor(activity.type) }}
            >
              {getActivityIcon(activity.type)}
            </div>
            <div className="activity-content">
              <div className="activity-header">
                <span className="activity-details">{activity.details}</span>
                <span className="activity-time">{formatTime(activity.timestamp)}</span>
              </div>
              {activity.entityName && (
                <div className="activity-entity">
                  {activity.entityType === 'task' && '任务: '}
                  {activity.entityType === 'asset' && '素材: '}
                  {activity.entityType === 'report' && '研报: '}
                  {activity.entityType === 'expert' && '专家: '}
                  {activity.entityName}
                </div>
              )}
              {activity.user && (
                <div className="activity-user">
                  操作人: {activity.user}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
