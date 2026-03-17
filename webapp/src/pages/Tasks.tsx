import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TaskList } from '../components/TaskList';
import { CreateTaskModal, type CreateTaskData } from '../components/CreateTaskModal';
import { ExportButton } from '../components/ExportButton';
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
  const { tasks, createTask } = useTasks();
  const location = useLocation();

  // 处理从其他页面导航过来的创建任务请求
  useEffect(() => {
    const state = location.state as { createTask?: boolean; topic?: string };
    if (state?.createTask) {
      setShowCreateModal(true);
      // 清除 state 避免刷新后再次触发
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const handleCreateTask = async (data: CreateTaskData) => {
    try {
      // Convert output formats object to array
      const formats = Object.entries(data.outputFormats)
        .filter(([, checked]) => checked)
        .map(([key]) => key);

      // Build enriched topic with context and source materials
      let enrichedTopic = data.topic;

      if (data.context) {
        enrichedTopic += `\n\n[背景资料]\n${data.context}`;
      }

      // Add source materials info
      if (data.sourceMaterials && data.sourceMaterials.length > 0) {
        enrichedTopic += `\n\n[参考素材]\n`;
        data.sourceMaterials.forEach((material, index) => {
          enrichedTopic += `${index + 1}. ${material.title}\n`;
        });
      }

      await createTask(enrichedTopic, formats);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === 'all') return true;
    return task.status === activeFilter;
  });

  return (
    <div className="tasks-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">任务管理</h1>
        <div className="page-actions">
          <ExportButton
            type="tasks"
            data={filteredTasks}
            filename="tasks_export"
          />
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <span>+</span> 新建任务
          </button>
        </div>
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
