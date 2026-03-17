import { useNotifications } from '../contexts/NotificationContext';
import './Notifications.css';

export function Notifications() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredNotifications = notifications; // Could add filtering here

  return (
    <div className="notifications-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔔 通知中心</h1>
          <p className="page-subtitle">
            共 {notifications.length} 条通知，{unreadCount} 条未读
          </p>
        </div>
        <div className="page-actions">
          {unreadCount > 0 && (
            <button className="btn btn-secondary" onClick={markAllAsRead}>
              全部已读
            </button>
          )}
          {notifications.length > 0 && (
            <button className="btn btn-danger" onClick={clearAll}>
              清空全部
            </button>
          )}
        </div>
      </div>

      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-title">暂无通知</div>
            <p>当有新消息时会在这里显示</p>
          </div>
        ) : (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              className={`notification-card ${n.read ? 'read' : 'unread'}`}
            >
              <div className="notification-main">
                <span className="notification-type-icon">{getIcon(n.type)}</span>
                <div className="notification-body">
                  <h3 className="notification-card-title">{n.title}</h3>
                  <p className="notification-card-message">{n.message}</p>
                  <span className="notification-card-time">{formatTime(n.timestamp)}</span>
                </div>
              </div>
              <div className="notification-card-actions">
                {!n.read && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => markAsRead(n.id)}
                  >
                    标记已读
                  </button>
                )}
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => deleteNotification(n.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
