import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TaskList } from '../components/TaskList';
import { CreateTaskModal, type CreateTaskData } from '../components/CreateTaskModal';
import { ExportButton } from '../components/ExportButton';
import { useTasks } from '../contexts/TasksContext';
import './Tasks.css';

// 二级导航配置
const TABS = [
  { id: 'tasks', label: '📋 任务列表', path: '/tasks', description: '查看所有任务的状态和进度' },
  { id: 'hidden', label: '🙈 隐藏任务', path: '/archive/hidden', description: '管理已隐藏的任务' },
  { id: 'recycle', label: '🗑️ 回收站', path: '/archive/recycle-bin', description: '恢复或永久删除任务' },
  { id: 'orchestrator', label: '🎼 编排器', path: '/orchestrator', description: '配置工作流程规则' },
];

// 状态筛选器
const STATUS_FILTERS = [
  { key: 'all', label: '全部任务' },
  { key: 'pending', label: '待处理' },
  { key: 'planning', label: '选题中' },
  { key: 'researching', label: '研究中' },
  { key: 'writing', label: '写作中' },
  { key: 'reviewing', label: '评审中' },
  { key: 'completed', label: '已完成' },
];

// Tab导航组件 - 横向样式
function TasksTabs() {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.startsWith('/archive/hidden')) return 'hidden';
    if (path.startsWith('/archive/recycle-bin')) return 'recycle';
    if (path.startsWith('/orchestrator')) return 'orchestrator';
    return 'tasks';
  };

  const activeTab = getActiveTab();

  return (
    <div className="tasks-tabs">
      <div className="tabs-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="tab-label">{tab.label}</span>
            {activeTab === tab.id && (
              <span className="tab-description">{tab.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Tasks() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { tasks, createTask } = useTasks();
  const location = useLocation();

  // 计算各状态任务数量
  const statusCounts = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 处理从其他页面导航过来的创建任务请求
  useEffect(() => {
    const state = location.state as { createTask?: boolean; topic?: string };
    if (state?.createTask) {
      setShowCreateModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const handleCreateTask = async (data: CreateTaskData) => {
    if (isCreating) return; // 防止重复提交
    
    setIsCreating(true);
    try {
      const formats = Object.entries(data.outputFormats)
        .filter(([, checked]) => checked)
        .map(([key]) => key);

      let enrichedTopic = data.topic;
      if (data.context) {
        enrichedTopic += `\n\n[背景资料]\n${data.context}`;
      }
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
    } finally {
      setIsCreating(false);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === 'all') return true;
    return task.status === activeFilter;
  });

  const getFilterCount = (key: string) => {
    if (key === 'all') return tasks.length;
    return statusCounts[key] || 0;
  };

  return (
    <div className="tasks-layout">
      {/* 左侧边栏 - 只保留状态筛选 */}
      <aside className="tasks-sidebar">
        {/* 新建任务按钮 */}
        <button
          className="btn btn-primary btn-create"
          onClick={() => setShowCreateModal(true)}
        >
          <span className="plus-icon">+</span>
          <span>新建任务</span>
        </button>

        {/* 状态筛选器 */}
        <div className="sidebar-filters">
          <div className="nav-section-title">状态筛选</div>
          <ul className="filter-list">
            {STATUS_FILTERS.map((filter) => (
              <li key={filter.key}>
                <button
                  className={`filter-item ${activeFilter === filter.key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  <span className="filter-label">{filter.label}</span>
                  <span className="filter-count">{getFilterCount(filter.key)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 导出按钮 */}
        <div className="sidebar-footer">
          <ExportButton
            type="tasks"
            data={filteredTasks}
            filename="tasks_export"
          />
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="tasks-main">
        {/* 页面头部 */}
        <header className="tasks-header">
          <div className="header-title">
            <h1>任务中心</h1>
            <span className="task-count">
              共 {filteredTasks.length} 个任务
              {activeFilter !== 'all' && (
                <span className="filter-tag">
                  {STATUS_FILTERS.find(f => f.key === activeFilter)?.label}
                </span>
              )}
            </span>
          </div>
        </header>

        {/* 二级导航 - 横向Tab样式 */}
        <TasksTabs />

        {/* 任务列表 */}
        <TaskList filter={activeFilter} />
      </main>

      {/* 创建任务弹窗 */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateTask}
        isCreating={isCreating}
      />
    </div>
  );
}
