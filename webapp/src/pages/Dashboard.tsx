import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTasks } from '../contexts/TasksContext';
import { STATUS_MAP, STAGES } from '../types';
import { StageConfig } from '../components/StageConfig';
import { SidebarStats } from '../components/SidebarStats';
import { DashboardCharts } from '../components/DashboardCharts';
import { AISummary } from '../components/AISummary';
import { ExpertInsights } from '../components/ExpertInsights';
import './Dashboard.css';

// 仪表盘Tab导航
function DashboardTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: 'overview', label: '概览', icon: '📊', path: '/' },
    { id: 'quality', label: '质量看板', icon: '✨', path: '/quality-dashboard' },
    { id: 'sentiment', label: '情感分析', icon: '😊', path: '/sentiment' },
  ];
  
  const activeTab = tabs.find(t => location.pathname === t.path)?.id || 'overview';
  
  return (
    <div className="dashboard-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

const QUICK_ACTIONS = [
  { icon: '➕', label: '新建任务', path: '/tasks', color: '#1890ff' },
  { icon: '📄', label: '上传研报', path: '/reports', color: '#52c41a' },
  { icon: '🔥', label: '查看热点', path: '/hot-topics', color: '#fa8c16' },
  { icon: '✏️', label: '开始写作', path: '/tasks', color: '#722ed1' },
];

// 格式化相对时间
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  return `${Math.floor(minutes / 60)}小时前`;
}

export function Dashboard() {
  const { tasks, loading, fetchTasks, isOffline } = useTasks();
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 手动刷新数据
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchTasks();
    setLastRefresh(new Date());
    setIsRefreshing(false);
  };

  // 监听自动刷新（通过 SWR 自动处理，这里只更新时间显示）
  useEffect(() => {
    if (!loading) {
      setLastRefresh(new Date());
    }
  }, [tasks, loading]);

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    processing: tasks.filter((t) =>
      ['planning', 'researching', 'writing', 'reviewing', 'converting'].includes(t.status)
    ).length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  const stageTasks = [
    {
      stage: STAGES[1],
      count: tasks.filter((t) => STATUS_MAP[t.status]?.stage === 1).length,
      description: '选题策划与评估',
    },
    {
      stage: STAGES[2],
      count: tasks.filter((t) => STATUS_MAP[t.status]?.stage === 2).length,
      description: '深度研究与资料收集',
    },
    {
      stage: STAGES[3],
      count: tasks.filter((t) => STATUS_MAP[t.status]?.stage === 3).length,
      description: '文稿生成与评审',
    },
    {
      stage: STAGES[4],
      count: tasks.filter((t) => STATUS_MAP[t.status]?.stage === 4).length,
      description: '多态转换与发布',
    },
  ];

  // 生成智能预警
  const generateAlerts = () => {
    const alerts: Array<{
      type: 'warning' | 'info' | 'danger';
      message: string;
      action?: string;
      path?: string;
    }> = [];

    // 逾期任务预警
    const overdueTasks = tasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.due_date &&
        new Date(t.due_date) < new Date()
    );
    if (overdueTasks.length > 0) {
      alerts.push({
        type: 'danger',
        message: `有 ${overdueTasks.length} 个任务已逾期，请尽快处理`,
        action: '查看任务',
        path: '/tasks',
      });
    }

    // 待处理任务过多预警
    if (stats.pending > 5) {
      alerts.push({
        type: 'warning',
        message: `待处理任务积压 (${stats.pending} 个)，建议及时分配`,
        action: '去处理',
        path: '/tasks',
      });
    }

    // 热点爆发预警（模拟）
    if (Math.random() > 0.7) {
      alerts.push({
        type: 'info',
        message: '🔥 "保租房政策" 相关热点热度上升 150%，建议关注',
        action: '查看热点',
        path: '/hot-topics',
      });
    }

    // 素材质量预警
    const lowQualityAssets = tasks.filter(
      (t) => t.status === 'reviewing' && t.quality_score && t.quality_score < 60
    );
    if (lowQualityAssets.length > 0) {
      alerts.push({
        type: 'warning',
        message: `${lowQualityAssets.length} 个任务质量评分较低，需要改进`,
        action: '查看详情',
        path: '/tasks',
      });
    }

    return alerts.slice(0, 3); // 最多显示3条
  };

  const alerts = generateAlerts();

  return (
    <div className="dashboard dashboard-with-sidebar">
      {/* Main Content */}
      <div className="dashboard-main">
      {/* Refresh Status Bar */}
      <div className="refresh-status-bar">
        <div className="refresh-info">
          {isOffline ? (
            <span className="offline-indicator">⚠️ 离线模式 - 使用缓存数据</span>
          ) : (
            <span className="last-refresh">
              {isRefreshing ? '🔄 刷新中...' : `✅ 上次更新: ${formatRelativeTime(lastRefresh)}`}
            </span>
          )}
        </div>
        <button
          className={`refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
          onClick={handleManualRefresh}
          disabled={isRefreshing || isOffline}
          title="立即刷新数据"
        >
          {isRefreshing ? '⟳' : '↻'} 刷新
        </button>
      </div>

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">总任务</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-pending">{stats.pending}</div>
          <div className="stat-label">待处理</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-processing">{stats.processing}</div>
          <div className="stat-label">进行中</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-completed">{stats.completed}</div>
          <div className="stat-label">已完成</div>
        </div>
      </div>

      {/* AI智能摘要 */}
      <AISummary />

      {/* 数据可视化图表 */}
      <DashboardCharts />

      {/* Quick Actions */}
      <div className="card">
        <h2 className="card-title">⚡ 快捷操作</h2>
        <div className="quick-actions-grid">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="quick-action-btn"
              style={{ '--action-color': action.color } as React.CSSProperties}
              onClick={() => navigate(action.path)}
            >
              <span className="quick-action-icon">{action.icon}</span>
              <span className="quick-action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 专家洞察 */}
      <ExpertInsights />

      {/* 智能预警面板 */}
      {alerts.length > 0 && (
        <div className="card alerts-panel">
          <h2 className="card-title">🚨 智能预警</h2>
          <div className="alerts-list">
            {alerts.map((alert, index) => (
              <div key={index} className={`alert-item ${alert.type}`}>
                <div className="alert-content">
                  <span className="alert-icon">
                    {alert.type === 'danger' ? '🔴' : alert.type === 'warning' ? '⚠️' : 'ℹ️'}
                  </span>
                  <span className="alert-message">{alert.message}</span>
                </div>
                {alert.action && alert.path && (
                  <button className="alert-action" onClick={() => navigate(alert.path!)}>
                    {alert.action} →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Stages */}
      <div className="card">
        <h2 className="card-title">🔄 内容生产流水线</h2>
        <div className="pipeline-grid">
          {stageTasks.map(({ stage, count, description }) => (
            <div
              key={stage.id}
              className="pipeline-card"
              style={{ borderTopColor: stage.color, cursor: 'pointer' }}
              onClick={() => setSelectedStage(stage.id)}
            >
              <div className="pipeline-icon" style={{ background: stage.color }}>
                {stage.icon}
              </div>
              <div className="pipeline-info">
                <div className="pipeline-name">{stage.name}</div>
                <div className="pipeline-desc">{description}</div>
                <div className="pipeline-count">
                  {count > 0 ? `${count} 个任务` : '无任务'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="card">
        <h2 className="card-title">📝 最近任务</h2>
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-title">暂无任务</div>
            <p>前往任务管理页面创建新任务</p>
          </div>
        ) : (
          <div className="recent-tasks">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="recent-task-item">
                <span className="recent-task-topic">{task.topic}</span>
                <span className={`badge ${STATUS_MAP[task.status]?.className ?? 'badge-pending'}`}>
                  {STATUS_MAP[task.status]?.text ?? task.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stage Config Panel */}
      <StageConfig
        stage={selectedStage}
        isOpen={selectedStage !== null}
        onClose={() => setSelectedStage(null)}
      />
      </div>

      {/* Sidebar */}
      <SidebarStats />
    </div>
  );
}
