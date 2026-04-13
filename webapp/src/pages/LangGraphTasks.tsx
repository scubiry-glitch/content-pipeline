// LangGraph Tasks Page
// 任务列表页 — 状态筛选侧边栏 + 增强卡片 + 删除/刷新 + API 状态同步

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { langgraphApi, type LGTaskCreateInput, type LGTaskCreateResult } from '../api/langgraph';
import './LangGraphTasks.css';

interface LGThread {
  threadId: string;
  taskId: string;
  topic: string;
  status: string;
  progress?: number;
  currentNode?: string;
  createdAt: string;
  updatedAt?: string;
}

// localStorage 工具
function getSavedThreads(): LGThread[] {
  try {
    return JSON.parse(localStorage.getItem('lg-threads') || '[]');
  } catch { return []; }
}

function saveThreads(threads: LGThread[]) {
  localStorage.setItem('lg-threads', JSON.stringify(threads.slice(0, 50)));
}

function addThread(data: { threadId: string; taskId: string; topic: string; status: string }) {
  const threads = getSavedThreads();
  threads.unshift({ ...data, createdAt: new Date().toISOString() });
  saveThreads(threads);
}

function removeThread(threadId: string) {
  const threads = getSavedThreads().filter(t => t.threadId !== threadId);
  saveThreads(threads);
}

function updateThread(threadId: string, patch: Partial<LGThread>) {
  const threads = getSavedThreads();
  const idx = threads.findIndex(t => t.threadId === threadId);
  if (idx >= 0) {
    threads[idx] = { ...threads[idx], ...patch, updatedAt: new Date().toISOString() };
    saveThreads(threads);
  }
}

// 状态筛选定义
const STATUS_FILTERS = [
  { key: 'all', label: '全部任务' },
  { key: 'outline_pending', label: '待确认大纲' },
  { key: 'researching', label: '研究中' },
  { key: 'writing', label: '写作中' },
  { key: 'reviewing', label: '评审中' },
  { key: 'awaiting_approval', label: '待审批' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
];

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    outline_pending: '待确认大纲',
    outline_confirmed: '大纲已确认',
    researching: '研究中',
    writing: '写作中',
    reviewing: '评审中',
    awaiting_approval: '待审批',
    completed: '已完成',
    failed: '失败',
  };
  return map[status] || status;
};

export function LangGraphTasks() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<LGThread[]>(getSavedThreads);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 创建任务表单
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [maxRounds, setMaxRounds] = useState(2);

  // 从 API 同步所有任务的最新状态
  const syncStatuses = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const current = getSavedThreads();
    if (current.length === 0) {
      if (!silent) setRefreshing(false);
      return;
    }
    try {
      const results = await Promise.allSettled(
        current.map(t => langgraphApi.getTaskState(t.threadId).catch(() => null))
      );
      const updated = current.map((t, i) => {
        const r = results[i];
        if (r.status === 'fulfilled' && r.value) {
          const v = r.value.values;
          return {
            ...t,
            status: v.status || t.status,
            progress: v.progress,
            currentNode: v.currentNode,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      });
      saveThreads(updated);
      setThreads(updated);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  // 初次加载时同步一次状态
  useEffect(() => {
    syncStatuses(true);
    // 30s 自动刷新
    const interval = setInterval(() => syncStatuses(true), 30000);
    return () => clearInterval(interval);
  }, [syncStatuses]);

  const handleCreate = useCallback(async () => {
    if (!topic.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const result = await langgraphApi.createTask({
        topic: topic.trim(),
        context: context.trim() || undefined,
        maxReviewRounds: maxRounds,
      });

      addThread({
        threadId: result.threadId,
        taskId: result.taskId,
        topic: topic.trim(),
        status: result.status,
      });

      setThreads(getSavedThreads());
      setShowCreate(false);
      setTopic('');
      setContext('');

      navigate(`/lg-tasks/${result.threadId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }, [topic, context, maxRounds, navigate]);

  const handleDelete = (threadId: string) => {
    removeThread(threadId);
    setThreads(getSavedThreads());
    setConfirmDelete(null);
  };

  // 状态计数
  const statusCounts = useMemo(() => {
    return threads.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [threads]);

  const getFilterCount = (key: string) => {
    if (key === 'all') return threads.length;
    return statusCounts[key] || 0;
  };

  // 筛选后的任务列表
  const filteredThreads = useMemo(() => {
    if (activeFilter === 'all') return threads;
    return threads.filter(t => t.status === activeFilter);
  }, [threads, activeFilter]);

  // 导出 CSV
  const exportCSV = () => {
    const headers = ['Thread ID', 'Task ID', '主题', '状态', '进度', '创建时间', '更新时间'];
    const rows = filteredThreads.map(t => [
      t.threadId,
      t.taskId,
      `"${(t.topic || '').replace(/"/g, '""')}"`,
      statusLabel(t.status),
      t.progress ? `${t.progress}%` : '-',
      new Date(t.createdAt).toLocaleString('zh-CN'),
      t.updatedAt ? new Date(t.updatedAt).toLocaleString('zh-CN') : '-',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lg-tasks-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lg-tasks-layout">
      {/* 左侧筛选栏 */}
      <aside className="lg-tasks-sidebar">
        <button
          className="lg-btn lg-btn-primary lg-btn-create"
          onClick={() => setShowCreate(true)}
          style={{ width: '100%', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          创建任务
        </button>

        <div className="lg-sidebar-section">
          <div className="lg-sidebar-title">状态筛选</div>
          <ul className="lg-filter-list">
            {STATUS_FILTERS.map(filter => (
              <li key={filter.key}>
                <button
                  className={`lg-filter-item ${activeFilter === filter.key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  <span>{filter.label}</span>
                  <span className="lg-filter-count">{getFilterCount(filter.key)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg-sidebar-section">
          <button
            type="button"
            className="lg-btn lg-btn-secondary"
            onClick={() => syncStatuses()}
            disabled={refreshing}
            style={{ width: '100%', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
            {refreshing ? '刷新中...' : '同步状态'}
          </button>
          <button
            type="button"
            className="lg-btn lg-btn-secondary"
            onClick={exportCSV}
            disabled={filteredThreads.length === 0}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
            导出 CSV
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="lg-tasks-main">
        <div className="lg-tasks-header">
          <div>
            <h1 className="lg-tasks-title">LangGraph 流水线</h1>
            <p className="lg-tasks-subtitle">
              基于 LangGraph 的声明式内容生产工作流 · 共 {filteredThreads.length} 个任务
              {activeFilter !== 'all' && (
                <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '12px', background: 'var(--primary-alpha)', color: 'var(--primary)', fontSize: '11px' }}>
                  {STATUS_FILTERS.find(f => f.key === activeFilter)?.label}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="lg-tasks-list">
          {threads.length === 0 ? (
            <div className="lg-empty">
              <div className="lg-empty-icon">🔗</div>
              <h3>暂无 LangGraph 任务</h3>
              <p>点击「创建任务」开始使用 LangGraph 流水线</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="lg-empty">
              <div className="lg-empty-icon">📭</div>
              <h3>该状态下暂无任务</h3>
              <p>切换其他状态筛选或创建新任务</p>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <div key={thread.threadId} className="lg-task-card lg-task-card-enhanced">
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => navigate(`/lg-tasks/${thread.threadId}`)}
                >
                  <div className="lg-task-card-main">
                    <h3 className="lg-task-topic">{thread.topic}</h3>
                    <span className={`lg-status-badge lg-status--${thread.status}`}>
                      {statusLabel(thread.status)}
                    </span>
                  </div>

                  {/* 进度条 */}
                  {typeof thread.progress === 'number' && thread.progress > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <div style={{ flex: 1, height: '4px', background: 'var(--surface-alt, #f5f5f5)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${thread.progress}%`,
                            height: '100%',
                            background: 'var(--primary)',
                            borderRadius: '2px',
                            transition: 'width 0.3s',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '30px', textAlign: 'right' }}>
                        {thread.progress}%
                      </span>
                    </div>
                  )}

                  <div className="lg-task-card-meta">
                    <span className="lg-task-id">{thread.threadId.slice(0, 20)}...</span>
                    {thread.currentNode && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        · {thread.currentNode}
                      </span>
                    )}
                    <span className="lg-task-date">
                      {new Date(thread.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="lg-task-actions" style={{ display: 'flex', gap: '6px', marginLeft: '12px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="lg-btn lg-btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/lg-tasks/${thread.threadId}`); }}
                  >
                    查看
                  </button>
                  <button
                    type="button"
                    className="lg-btn lg-btn-danger"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(thread.threadId); }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* 创建任务模态 */}
      {showCreate && (
        <div className="lg-modal-overlay" onClick={() => !creating && setShowCreate(false)}>
          <div className="lg-modal" onClick={e => e.stopPropagation()}>
            <h2 className="lg-modal-title">创建 LangGraph 任务</h2>

            <div className="lg-form-group">
              <label className="lg-label">选题 *</label>
              <input
                className="lg-input"
                placeholder="输入研究选题..."
                value={topic}
                onChange={e => setTopic(e.target.value)}
                autoFocus
              />
            </div>

            <div className="lg-form-group">
              <label className="lg-label">背景说明</label>
              <textarea
                className="lg-textarea"
                placeholder="提供选题的背景信息（可选）"
                value={context}
                onChange={e => setContext(e.target.value)}
                rows={3}
              />
            </div>

            <div className="lg-form-group">
              <label className="lg-label">最大评审轮数</label>
              <select
                className="lg-select"
                value={maxRounds}
                onChange={e => setMaxRounds(Number(e.target.value))}
              >
                <option value={1}>1 轮</option>
                <option value={2}>2 轮（推荐）</option>
                <option value={3}>3 轮</option>
              </select>
            </div>

            {error && <div className="lg-error">{error}</div>}

            <div className="lg-modal-actions">
              <button className="lg-btn lg-btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
                取消
              </button>
              <button className="lg-btn lg-btn-primary" onClick={handleCreate} disabled={creating || !topic.trim()}>
                {creating ? '创建中...' : '创建并生成大纲'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <div className="lg-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="lg-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2 className="lg-modal-title">确认删除任务？</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
              此操作将从本地列表中移除该任务。注意：后端 LangGraph checkpoint 数据不会被删除，可通过 thread ID 重新访问。
            </p>
            <div className="lg-modal-actions">
              <button className="lg-btn lg-btn-secondary" onClick={() => setConfirmDelete(null)}>
                取消
              </button>
              <button className="lg-btn lg-btn-danger" onClick={() => handleDelete(confirmDelete)}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
