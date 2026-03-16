import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { archiveApi, type ArchivedTask } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import './Tasks.css';

export function HiddenTasks() {
  const navigate = useNavigate();
  const [hiddenTasks, setHiddenTasks] = useState<ArchivedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmUnhide, setConfirmUnhide] = useState<string | null>(null);

  useEffect(() => {
    loadHiddenTasks();
  }, []);

  const loadHiddenTasks = async () => {
    setLoading(true);
    try {
      const response = await archiveApi.getHidden();
      setHiddenTasks(response.items || []);
    } catch (error) {
      console.error('加载隐藏任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnhide = async (id: string) => {
    try {
      await archiveApi.restoreTask(id);
      setHiddenTasks((prev) => prev.filter((t) => t.id !== id));
      setConfirmUnhide(null);
    } catch (error) {
      console.error('取消隐藏任务失败:', error);
      alert('取消隐藏任务失败');
    }
  };

  const handleBatchUnhide = async () => {
    if (!confirm('确定要取消隐藏所有任务吗？')) {
      return;
    }
    try {
      const taskIds = hiddenTasks.map((t) => t.id);
      await Promise.all(taskIds.map((id) => archiveApi.restoreTask(id)));
      setHiddenTasks([]);
    } catch (error) {
      console.error('批量取消隐藏失败:', error);
      alert('批量取消隐藏失败');
    }
  };

  return (
    <div className="tasks-page">
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-title">🙈 隐藏任务</h1>
          <p className="page-subtitle">管理已隐藏的任务，取消隐藏后可恢复正常显示</p>
        </div>
        <div className="header-actions">
          {hiddenTasks.length > 0 && (
            <button className="btn btn-primary" onClick={handleBatchUnhide}>
              全部取消隐藏
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/tasks')}>
            ← 返回任务列表
          </button>
        </div>
      </div>

      <div className="info-card">
        <span className="info-icon">ℹ️</span>
        <span>隐藏的任务不会出现在常规列表中，但仍保留所有数据和进度</span>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <span>加载隐藏任务...⏳</span>
        </div>
      ) : hiddenTasks.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-state">
            <div className="empty-icon">🙈</div>
            <div className="empty-title">没有隐藏的任务</div>
            <p>您隐藏的任务将显示在这里</p>
          </div>
        </div>
      ) : (
        <div className="hidden-tasks-list">
          {hiddenTasks.map((task) => (
            <div key={task.id} className="hidden-task-item">
              <div className="item-info">
                <h3 className="item-title">{task.topic}</h3>
                <div className="item-meta">
                  <span>状态: {task.status}</span>
                  <span>隐藏时间: {new Date(task.deletedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="item-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setConfirmUnhide(task.id)}
                >
                  取消隐藏
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmUnhide}
        title="确认取消隐藏"
        message="取消隐藏后任务将重新出现在任务列表中。"
        confirmText="取消隐藏"
        cancelText="取消"
        confirmVariant="primary"
        onConfirm={() => confirmUnhide && handleUnhide(confirmUnhide)}
        onCancel={() => setConfirmUnhide(null)}
      />
    </div>
  );
}
