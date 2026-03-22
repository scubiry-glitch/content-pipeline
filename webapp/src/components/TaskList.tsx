import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTasks } from '../contexts/TasksContext';
import { STATUS_MAP, type Task } from '../types';
import { ConfirmModal } from './ConfirmModal';
import './TaskList.css';
import { PriorityBadge, PriorityFilter, PrioritySortButton } from './PriorityBadge';
import { sortTasksByPriority, calculatePriority } from '../utils/priority';

interface EditTaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Task>) => Promise<void>;
}

function EditTaskModal({ task, isOpen, onClose, onSave }: EditTaskModalProps) {
  const [topic, setTopic] = useState('');
  const [formats, setFormats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTopic(task.topic);
      setFormats(task.target_formats || ['markdown']);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setSaving(true);
    try {
      await onSave(task.id, { topic, target_formats: formats });
      onClose();
    } catch (err) {
      console.error('Failed to update task:', err);
      alert('更新失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const formatOptions = [
    { value: 'markdown', label: 'Markdown' },
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'Word' },
    { value: 'html', label: 'HTML' },
    { value: 'txt', label: '纯文本' },
  ];

  const toggleFormat = (format: string) => {
    setFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format]
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>编辑任务</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>主题 *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="输入任务主题"
                required
              />
            </div>
            <div className="form-group">
              <label>目标格式</label>
              <div className="format-options">
                {formatOptions.map((option) => (
                  <label key={option.value} className="checkbox-label format-checkbox">
                    <input
                      type="checkbox"
                      checked={formats.includes(option.value)}
                      onChange={() => toggleFormat(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !topic.trim()}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TaskListProps {
  filter?: string;
  showHidden?: boolean;
}

export function TaskList({ filter = 'all', showHidden = false }: TaskListProps) {
  const navigate = useNavigate();
  const { tasks, loading, deleteTask, hideTask, unhideTask, updateTask } = useTasks();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmHide, setConfirmHide] = useState<string | null>(null);
  const [confirmUnhide, setConfirmUnhide] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // 批量操作状态
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchActionModal, setBatchActionModal] = useState<'delete' | 'hide' | 'stage' | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // 优先级筛选和排序
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortByPriority, setSortByPriority] = useState(false);

  let filteredTasks = tasks.filter((task) => {
    if (showHidden) return task.is_hidden;
    if (filter === 'all') return !task.is_hidden;
    if (filter === 'hidden') return task.is_hidden;
    return task.status === filter && !task.is_hidden;
  });

  // 优先级筛选
  if (priorityFilter !== 'all') {
    filteredTasks = filteredTasks.filter((task) => {
      const priority = calculatePriority(task);
      return priority.level === priorityFilter;
    });
  }

  // 智能优先级排序
  if (sortByPriority) {
    filteredTasks = sortTasksByPriority(filteredTasks);
  }

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

  const handleEdit = async (id: string, data: Partial<Task>) => {
    await updateTask(id, data);
  };

  // 批量操作函数
  const toggleTaskSelection = (id: string) => {
    setSelectedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const clearSelection = () => {
    setSelectedTasks(new Set());
    setBatchMode(false);
  };

  const handleBatchDelete = async () => {
    setBatchProcessing(true);
    try {
      for (const id of selectedTasks) {
        await deleteTask(id);
      }
      setSelectedTasks(new Set());
      setBatchMode(false);
    } catch (err) {
      console.error('Batch delete failed:', err);
      alert('批量删除失败，请重试');
    } finally {
      setBatchProcessing(false);
      setBatchActionModal(null);
    }
  };

  const handleBatchHide = async () => {
    setBatchProcessing(true);
    try {
      for (const id of selectedTasks) {
        await hideTask(id);
      }
      setSelectedTasks(new Set());
      setBatchMode(false);
    } catch (err) {
      console.error('Batch hide failed:', err);
      alert('批量隐藏失败，请重试');
    } finally {
      setBatchProcessing(false);
      setBatchActionModal(null);
    }
  };

  const handleBatchStageChange = async (newStatus: string) => {
    setBatchProcessing(true);
    try {
      for (const id of selectedTasks) {
        await updateTask(id, { status: newStatus });
      }
      setSelectedTasks(new Set());
      setBatchMode(false);
    } catch (err) {
      console.error('Batch stage change failed:', err);
      alert('批量修改阶段失败，请重试');
    } finally {
      setBatchProcessing(false);
      setBatchActionModal(null);
    }
  };

  // 批量操作工具栏
  const BatchToolbar = () => (
    <div className="batch-toolbar">
      <div className="batch-info">
        <input
          type="checkbox"
          checked={selectedTasks.size === filteredTasks.length && filteredTasks.length > 0}
          onChange={toggleAllSelection}
        />
        <span>已选择 {selectedTasks.size} 个任务</span>
      </div>
      <div className="batch-actions">
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => setBatchActionModal('stage')}
          disabled={selectedTasks.size === 0}
        >
          修改阶段
        </button>
        <button
          className="btn btn-sm btn-warning"
          onClick={() => setBatchActionModal('hide')}
          disabled={selectedTasks.size === 0}
        >
          隐藏
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => setBatchActionModal('delete')}
          disabled={selectedTasks.size === 0}
        >
          删除
        </button>
        <button className="btn btn-sm btn-secondary" onClick={clearSelection}>
          取消
        </button>
      </div>
    </div>
  );

  // 条件渲染
  if (loading && tasks.length === 0) {
    return <div className="loading">加载中...</div>;
  }

  if (filteredTasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📭</div>
        <div className="empty-title">暂无任务</div>
        <p>点击上方按钮创建新任务</p>
      </div>
    );
  }

  return (
    <>
      {/* 优先级筛选和排序 */}
      <div className="task-list-controls">
        <PriorityFilter value={priorityFilter} onChange={setPriorityFilter} />
        <PrioritySortButton
          onSort={() => setSortByPriority(!sortByPriority)}
          isActive={sortByPriority}
        />
      </div>

      {/* 批量模式切换 */}
      <div className="batch-mode-toggle">
        <label className="batch-mode-label">
          <input
            type="checkbox"
            checked={batchMode}
            onChange={(e) => {
              setBatchMode(e.target.checked);
              if (!e.target.checked) {
                setSelectedTasks(new Set());
              }
            }}
          />
          <span>批量操作模式</span>
        </label>
      </div>

      {/* 批量操作工具栏 */}
      {batchMode && <BatchToolbar />}

      <div className="task-list">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            showHidden={showHidden}
            selected={selectedTasks.has(task.id)}
            batchMode={batchMode}
            onClick={() => batchMode ? toggleTaskSelection(task.id) : navigate('/tasks/' + task.id)}
            onSelect={() => toggleTaskSelection(task.id)}
            onDelete={() => setConfirmDelete(task.id)}
            onHide={() => setConfirmHide(task.id)}
            onUnhide={() => setConfirmUnhide(task.id)}
            onEdit={() => setEditingTask(task)}
          />
        ))}
      </div>

      <EditTaskModal
        task={editingTask}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleEdit}
      />

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

      {/* 批量删除确认 */}
      <ConfirmModal
        isOpen={batchActionModal === 'delete'}
        title="确认批量删除"
        message={`确定要删除选中的 ${selectedTasks.size} 个任务吗？删除后任务将进入回收站。`}
        confirmText={batchProcessing ? '删除中...' : '确认删除'}
        cancelText="取消"
        confirmVariant="danger"
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchActionModal(null)}
        disabled={batchProcessing}
      />

      {/* 批量隐藏确认 */}
      <ConfirmModal
        isOpen={batchActionModal === 'hide'}
        title="确认批量隐藏"
        message={`确定要隐藏选中的 ${selectedTasks.size} 个任务吗？`}
        confirmText={batchProcessing ? '隐藏中...' : '确认隐藏'}
        cancelText="取消"
        confirmVariant="warning"
        onConfirm={handleBatchHide}
        onCancel={() => setBatchActionModal(null)}
        disabled={batchProcessing}
      />

      {/* 批量修改阶段弹窗 */}
      {batchActionModal === 'stage' && (
        <BatchStageModal
          isOpen={true}
          count={selectedTasks.size}
          onConfirm={handleBatchStageChange}
          onCancel={() => setBatchActionModal(null)}
          processing={batchProcessing}
        />
      )}
    </>
  );
}

// 批量修改阶段弹窗
function BatchStageModal({
  isOpen,
  count,
  onConfirm,
  onCancel,
  processing,
}: {
  isOpen: boolean;
  count: number;
  onConfirm: (status: string) => void;
  onCancel: () => void;
  processing: boolean;
}) {
  const [selectedStatus, setSelectedStatus] = useState('planning');

  if (!isOpen) return null;

  const statusOptions = [
    { key: 'pending', label: '待处理' },
    { key: 'planning', label: '选题中' },
    { key: 'researching', label: '研究中' },
    { key: 'writing', label: '写作中' },
    { key: 'reviewing', label: '评审中' },
    { key: 'completed', label: '已完成' },
  ];

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>批量修改阶段</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p>将选中的 {count} 个任务修改为以下阶段：</p>
          <div className="status-options">
            {statusOptions.map((opt) => (
              <label key={opt.key} className="radio-label">
                <input
                  type="radio"
                  name="status"
                  value={opt.key}
                  checked={selectedStatus === opt.key}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={processing}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(selectedStatus)}
            disabled={processing}
          >
            {processing ? '处理中...' : '确认修改'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  showHidden,
  selected,
  batchMode,
  onClick,
  onSelect,
  onDelete,
  onHide,
  onUnhide,
  onEdit,
}: {
  task: Task;
  showHidden?: boolean;
  selected?: boolean;
  batchMode?: boolean;
  onClick: () => void;
  onSelect?: () => void;
  onDelete?: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
  onEdit?: () => void;
}) {
  const status = STATUS_MAP[task.status] ?? { className: 'badge-pending', text: task.status };

  return (
    <div
      className={`task-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="task-header">
        {batchMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            className="task-checkbox"
          />
        )}
        <h3 className="task-title">{task.topic}</h3>
        <div className="task-badges">
          <PriorityBadge task={task} />
          <span className={`badge ${status.className}`}>{status.text}</span>
        </div>
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
        {!showHidden && (
          <button className="btn btn-sm btn-info" onClick={onEdit}>编辑</button>
        )}
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
