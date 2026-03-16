import { useState } from 'react';
import { TaskList } from '../components/TaskList';
import { useTasks } from '../contexts/TasksContext';
import './Tasks.css';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'planning', label: '选题中' },
  { key: 'researching', label: '研究中' },
  { key: 'writing', label: '写作中' },
  { key: 'reviewing', label: '评审中' },
  { key: 'completed', label: '已完成' },
];

export function Tasks() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { createTask } = useTasks();

  const [newTask, setNewTask] = useState({
    topic: '',
    formats: ['markdown'],
  });

  const handleCreateTask = async () => {
    if (!newTask.topic.trim()) return;
    try {
      await createTask(newTask.topic, newTask.formats);
      setShowCreateModal(false);
      setNewTask({ topic: '', formats: ['markdown'] });
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  return (
    <div className="tasks-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">任务管理</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <span>+</span> 新建任务
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            className={`filter-btn ${activeFilter === filter.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Task List */}
      <TaskList filter={activeFilter} />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">新建任务</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">研究主题 *</label>
                <input
                  type="text"
                  className="form-input"
                  value={newTask.topic}
                  onChange={(e) =>
                    setNewTask({ ...newTask, topic: e.target.value })
                  }
                  placeholder="输入研究主题"
                />
              </div>
              <div className="form-group">
                <label className="form-label">输出格式</label>
                <div className="format-options">
                  {['markdown', 'pdf', 'docx'].map((format) => (
                    <label key={format} className="format-option">
                      <input
                        type="checkbox"
                        checked={newTask.formats.includes(format)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewTask({
                              ...newTask,
                              formats: [...newTask.formats, format],
                            });
                          } else {
                            setNewTask({
                              ...newTask,
                              formats: newTask.formats.filter((f) => f !== format),
                            });
                          }
                        }}
                      />
                      <span>{format.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateTask}
                disabled={!newTask.topic.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
