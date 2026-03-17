import { useState } from 'react';
import { TaskList } from '../components/TaskList';
import { CreateTaskModal, type CreateTaskData } from '../components/CreateTaskModal';
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

  const handleCreateTask = async (data: CreateTaskData) => {
    try {
      // Convert output formats object to array
      const formats = Object.entries(data.outputFormats)
        .filter(([, checked]) => checked)
        .map(([key]) => key);

      // Pass additional data via context or description
      const enrichedTopic = data.context
        ? `${data.topic}\n\n[背景资料]\n${data.context}`
        : data.topic;

      await createTask(enrichedTopic, formats);
      setShowCreateModal(false);
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
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateTask}
      />
    </div>
  );
}
