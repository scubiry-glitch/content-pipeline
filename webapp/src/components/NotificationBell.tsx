import { useState } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationBell.css';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [showPanel, setShowPanel] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
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

  return (
    <div className="notification-bell-wrapper">
      <button
        className="notification-bell"
        onClick={() => setShowPanel(!showPanel)}
        title="通知"
      >
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {showPanel && (
        <>
          <div className="notification-overlay" onClick={() => setShowPanel(false)} />
          <div className="notification-panel">
            <div className="notification-header">
              <h3>通知</h3>
              {unreadCount > 0 && (
                <button className="mark-all-read" onClick={markAllAsRead}>
                  全部已读
                </button>
              )}
            </div>

            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="notification-empty">
                  <span>📭</span>
                  <p>暂无通知</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`notification-item ${n.read ? 'read' : 'unread'}`}
                    onClick={() => {
                      markAsRead(n.id);
                      if (n.link) {
                        window.location.href = n.link;
                      }
                    }}
                  >
                    <span className="notification-icon">{getIcon(n.type)}</span>
                    <div className="notification-content">
                      <div className="notification-title">{n.title}</div>
                      <div className="notification-message">{n.message}</div>
                      <div className="notification-time">{formatTime(n.timestamp)}</div>
                    </div>
                    <button
                      className="notification-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(n.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
