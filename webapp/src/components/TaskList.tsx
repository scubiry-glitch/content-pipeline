import { useState } from 'react';
import { useTasks } from '../contexts/TasksContext';
import { STATUS_MAP, type Task } from '../types';
import { TaskDetail } from './TaskDetail';
import './TaskList.css';

interface TaskListProps {
  filter?: string;
}

export function TaskList({ filter = 'all' }: TaskListProps) {
  const { tasks, loading } = useTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return !task.is_hidden;
    if (filter === 'hidden') return task.is_hidden;
    return task.status === filter && !task.is_hidden;
  });

  if (loading && tasks.length === 0) {
    return <div className="loading">加载中...</div>;
  }

  if (filteredTasks.length === 0) {
    return (
      <>
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">暂无任务</div>
          <p>点击上方按钮创建新任务</p>
        </div>
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      </>
    );
  }

  return (
    <>
      <div className="task-list">
        {filteredTasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
        ))}
      </div>
      <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </>
  );
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const status = STATUS_MAP[task.status] ?? { className: 'badge-pending', text: task.status };

  return (
    <div className="task-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="task-header">
        <h3 className="task-title">{task.topic}</h3>
        <span className={`badge ${status.className}`}>{status.text}</span>
      </div>

      <div className="task-meta">
        <span>📄 {task.target_formats?.join(', ') || 'markdown'}</span>
        <span>📅 {new Date(task.created_at).toLocaleDateString()}</span>
      </div>

      {task.progress > 0 && (
        <div className="task-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="progress-text">{task.progress}%</span>
        </div>
      )}

      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-secondary" onClick={onClick}>查看详情</button>
        {task.status === 'reviewing' && (
          <button className="btn btn-sm btn-primary">处理评审</button>
        )}
      </div>
    </div>
  );
}
