import { useState } from 'react';
import { useTasks } from '../contexts/TasksContext';
import { STATUS_MAP, type Task } from '../types';
import { TaskDetail } from './TaskDetail';
import { ConfirmModal } from './ConfirmModal';
import './TaskList.css';

interface TaskListProps {
  filter?: string;
  showHidden?: boolean;
}

export function TaskList({ filter = 'all', showHidden = false }: TaskListProps) {
  const { tasks, loading, deleteTask, hideTask, unhideTask } = useTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmHide, setConfirmHide] = useState<string | null>(null);
  const [confirmUnhide, setConfirmUnhide] = useState<string | null>(null);

  const filteredTasks = tasks.filter((task) => {
    if (showHidden) return task.is_hidden;
    if (filter === 'all') return !task.is_hidden;
    if (filter === 'hidden') return task.is_hidden;
    return task.status === filter && !task.is_hidden;
  });

  const handleDelete = async (id: string) => {
    try {
      await deleteTask(id);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('删除失败，请重试');
    }
  };

  const handleHide = async (id: string) => {
    try {
      await hideTask(id);
      setConfirmHide(null);
    } catch (err) {
      console.error('Failed to hide task:', err);
      alert('隐藏失败，请重试');
    }
  };

  const handleUnhide = async (id: string) => {
    try {
      await unhideTask(id);
      setConfirmUnhide(null);
    } catch (err) {
      console.error('Failed to unhide task:', err);
      alert('取消隐藏失败，请重试');
    }
  };

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
          <TaskCard
            key={task.id}
            task={task}
            showHidden={showHidden}
            onClick={() => setSelectedTaskId(task.id)}
            onDelete={() => setConfirmDelete(task.id)}
            onHide={() => setConfirmHide(task.id)}
            onUnhide={() => setConfirmUnhide(task.id)}
          />
        ))}
      </div>
      <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="确认删除"
        message="删除后任务将进入回收站，您可以在回收站中恢复或永久删除。"
        confirmText="删除"
        cancelText="取消"
        confirmVariant="danger"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        isOpen={!!confirmHide}
        title="确认隐藏"
        message="隐藏后任务将不在列表中显示，您可以在隐藏任务中查看。"
        confirmText="隐藏"
        cancelText="取消"
        confirmVariant="warning"
        onConfirm={() => confirmHide && handleHide(confirmHide)}
        onCancel={() => setConfirmHide(null)}
      />

      <ConfirmModal
        isOpen={!!confirmUnhide}
        title="确认取消隐藏"
        message="取消隐藏后任务将重新显示在列表中。"
        confirmText="取消隐藏"
        cancelText="取消"
        confirmVariant="primary"
        onConfirm={() => confirmUnhide && handleUnhide(confirmUnhide)}
        onCancel={() => setConfirmUnhide(null)}
      />
    </>
  );
}

function TaskCard({
  task,
  showHidden,
  onClick,
  onDelete,
  onHide,
  onUnhide,
}: {
  task: Task;
  showHidden?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}) {
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
        {!showHidden && (
          <>
            <button className="btn btn-sm btn-warning" onClick={onHide}>隐藏</button>
            <button className="btn btn-sm btn-danger" onClick={onDelete}>删除</button>
          </>
        )}
        {showHidden && (
          <button className="btn btn-sm btn-primary" onClick={onUnhide}>取消隐藏</button>
        )}
      </div>
    </div>
  );
}
