// LangGraph Tasks Page
// 独立任务列表页，管理 LangGraph 流水线任务

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { langgraphApi, type LGTaskCreateInput, type LGTaskCreateResult } from '../api/langgraph';
import './LangGraphTasks.css';

// 保存 threadId 列表到 localStorage
function getSavedThreads(): Array<{ threadId: string; taskId: string; topic: string; status: string; createdAt: string }> {
  try {
    return JSON.parse(localStorage.getItem('lg-threads') || '[]');
  } catch { return []; }
}

function saveThread(data: { threadId: string; taskId: string; topic: string; status: string }) {
  const threads = getSavedThreads();
  threads.unshift({ ...data, createdAt: new Date().toISOString() });
  localStorage.setItem('lg-threads', JSON.stringify(threads.slice(0, 50)));
}

export function LangGraphTasks() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState(getSavedThreads);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 创建任务表单
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [maxRounds, setMaxRounds] = useState(2);

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

      saveThread({
        threadId: result.threadId,
        taskId: result.taskId,
        topic: topic.trim(),
        status: result.status,
      });

      setThreads(getSavedThreads());
      setShowCreate(false);
      setTopic('');
      setContext('');

      // 跳转到详情
      navigate(`/lg-tasks/${result.threadId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }, [topic, context, maxRounds, navigate]);

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

  return (
    <div className="lg-tasks-page">
      <div className="lg-tasks-header">
        <div>
          <h1 className="lg-tasks-title">LangGraph 流水线</h1>
          <p className="lg-tasks-subtitle">基于 LangGraph 的声明式内容生产工作流</p>
        </div>
        <button className="lg-btn lg-btn-primary" onClick={() => setShowCreate(true)}>
          + 创建任务
        </button>
      </div>

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

      {/* 任务列表 */}
      <div className="lg-tasks-list">
        {threads.length === 0 ? (
          <div className="lg-empty">
            <div className="lg-empty-icon">🔗</div>
            <h3>暂无 LangGraph 任务</h3>
            <p>点击「创建任务」开始使用 LangGraph 流水线</p>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.threadId}
              className="lg-task-card"
              onClick={() => navigate(`/lg-tasks/${thread.threadId}`)}
            >
              <div className="lg-task-card-main">
                <h3 className="lg-task-topic">{thread.topic}</h3>
                <span className={`lg-status-badge lg-status--${thread.status}`}>
                  {statusLabel(thread.status)}
                </span>
              </div>
              <div className="lg-task-card-meta">
                <span className="lg-task-id">{thread.threadId.slice(0, 20)}...</span>
                <span className="lg-task-date">
                  {new Date(thread.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
