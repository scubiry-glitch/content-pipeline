import { useNavigate } from 'react-router-dom';
import { TaskList } from '../components/TaskList';
import './Tasks.css';

export function HiddenTasks() {
  const navigate = useNavigate();

  return (
    <div className="tasks-page">
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-title">🙈 隐藏任务</h1>
          <p className="page-subtitle">管理已隐藏的任务，取消隐藏后可恢复正常显示</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/tasks')}>
          ← 返回任务列表
        </button>
      </div>

      <div className="info-card">
        <span className="info-icon">ℹ️</span>
        <span>隐藏的任务不会出现在常规列表中，但仍保留所有数据和进度</span>
      </div>

      <TaskList showHidden={true} />
    </div>
  );
}
