import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTasks } from '../contexts/TasksContext';
import { STATUS_MAP, STAGES } from '../types';
import { StageConfig } from '../components/StageConfig';
import { SidebarStats } from '../components/SidebarStats';
import './Dashboard.css';

const QUICK_ACTIONS = [
  { icon: '➕', label: '新建任务', path: '/tasks', color: '#1890ff' },
  { icon: '📄', label: '上传研报', path: '/reports', color: '#52c41a' },
  { icon: '🔥', label: '查看热点', path: '/hot-topics', color: '#fa8c16' },
  { icon: '✏️', label: '开始写作', path: '/tasks', color: '#722ed1' },
];

export function Dashboard() {
  const { tasks } = useTasks();
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState<number | null>(null);

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

  return (
    <div className="dashboard dashboard-with-sidebar">
      {/* Main Content */}
      <div className="dashboard-main">
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
