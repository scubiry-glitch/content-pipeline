import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../components/ConfirmModal';
import './Tasks.css';

interface DeletedTask {
  id: string;
  topic: string;
  status: string;
  deletedAt: string;
  originalCreatedAt: string;
}

export function RecycleBin() {
  const navigate = useNavigate();
  const [deletedTasks, setDeletedTasks] = useState<DeletedTask[]>([]);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<string | null>(null);

  // Note: 实际项目中应该从 API 获取已删除的任务
  // 这里使用本地状态作为演示

  const handleRestore = (id: string) => {
    // TODO: 调用恢复 API
    console.log('Restore task:', id);
    setDeletedTasks((prev) => prev.filter((t) => t.id !== id));
    setConfirmRestore(null);
  };

  const handlePermanentDelete = (id: string) => {
    // TODO: 调用永久删除 API
    console.log('Permanently delete task:', id);
    setDeletedTasks((prev) => prev.filter((t) => t.id !== id));
    setConfirmPermanentDelete(null);
  };

  const handleEmptyRecycleBin = () => {
    // TODO: 调用清空回收站 API
    if (confirm('确定要清空回收站吗？所有任务将被永久删除，无法恢复。')) {
      setDeletedTasks([]);
    }
  };

  return (
    <div className="tasks-page">
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-title">🗑️ 回收站</h1>
          <p className="page-subtitle">管理已删除的任务，可恢复或永久删除</p>
        </div>
        <div className="header-actions">
          {deletedTasks.length > 0 && (
            <button className="btn btn-danger" onClick={handleEmptyRecycleBin}>
              清空回收站
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/tasks')}>
            ← 返回任务列表
          </button>
        </div>
      </div>

      <div className="info-card warning">
        <span className="info-icon">⚠️</span>
        <span>回收站中的任务将在 30 天后自动永久删除</span>
      </div>

      {deletedTasks.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-state">
            <div className="empty-icon">🗑️</div>
            <div className="empty-title">回收站为空</div>
            <p>删除的任务将显示在这里，您可以在 30 天内恢复它们</p>
          </div>
        </div>
      ) : (
        <div className="recycle-bin-list">
          {deletedTasks.map((task) => (
            <div key={task.id} className="recycle-bin-item">
              <div className="item-info">
                <h3 className="item-title">{task.topic}</h3>
                <div className="item-meta">
                  <span>状态: {task.status}</span>
                  <span>删除时间: {new Date(task.deletedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="item-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setConfirmRestore(task.id)}
                >
                  恢复
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => setConfirmPermanentDelete(task.id)}
                >
                  永久删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmRestore}
        title="确认恢复"
        message="恢复后任务将重新出现在任务列表中。"
        confirmText="恢复"
        cancelText="取消"
        confirmVariant="primary"
        onConfirm={() => confirmRestore && handleRestore(confirmRestore)}
        onCancel={() => setConfirmRestore(null)}
      />

      <ConfirmModal
        isOpen={!!confirmPermanentDelete}
        title="确认永久删除"
        message="此操作不可撤销，任务将被永久删除。"
        confirmText="永久删除"
        cancelText="取消"
        confirmVariant="danger"
        onConfirm={() => confirmPermanentDelete && handlePermanentDelete(confirmPermanentDelete)}
        onCancel={() => setConfirmPermanentDelete(null)}
      />
    </div>
  );
}
