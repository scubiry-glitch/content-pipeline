// LangGraph Task Detail Layout
// Tab 路由容器，复用 TaskDetailLayout 的布局模式
// 所有子 tab 通过 useOutletContext 获取共享数据

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, NavLink, Outlet } from 'react-router-dom';
import { langgraphApi, type LGTaskDetail, type LGTaskState, type LGGraphData } from '../api/langgraph';
import { GraphVisualization } from '../components/GraphVisualization';
import './TaskDetailLayout.css';
import './TaskDetail.css';
import './LangGraphTasks.css';

// Tab 配置 — 映射为左侧边导航
const LG_TABS = [
  { id: 'overview', label: '概览', materialIcon: 'dashboard', path: 'overview' },
  { id: 'planning', label: '选题策划', materialIcon: 'lightbulb', path: 'planning' },
  { id: 'research', label: '深度研究', materialIcon: 'search', path: 'research' },
  { id: 'writing', label: '文稿生成', materialIcon: 'edit_note', path: 'writing' },
  { id: 'reviews', label: '蓝军评审', materialIcon: 'fact_check', path: 'reviews' },
  { id: 'quality', label: '质量分析', materialIcon: 'analytics', path: 'quality' },
];

// 状态标签映射
const STATUS_LABELS: Record<string, string> = {
  created: '已创建',
  outline_pending: '待确认大纲',
  outline_confirmed: '大纲已确认',
  outline_rejected: '大纲已退回',
  researching: '研究中',
  researching_complete: '研究完成',
  writing: '写作中',
  writing_complete: '写作完成',
  reviewing: '评审中',
  review_passed: '评审通过',
  review_needs_revision: '需要修订',
  awaiting_approval: '待最终审批',
  approved: '已批准',
  revision_needed: '需要修改',
  completed: '已完成',
  failed: '失败',
  planning_failed: '策划失败',
  research_failed: '研究失败',
  writing_failed: '写作失败',
  review_failed: '评审失败',
};

// 终态 — 不需要轮询
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'planning_failed', 'research_failed', 'writing_failed', 'review_failed']);
// 等待人工操作 — 不需要轮询
const HUMAN_PENDING_STATUSES = new Set(['outline_pending', 'outline_rejected', 'awaiting_approval']);

export interface LGTaskContext {
  detail: LGTaskDetail | null;
  state: LGTaskState | null;
  graphData: LGGraphData | null;
  loading: boolean;
  error: string | null;
  pendingAction: 'outline_review' | 'final_approval' | null;
  onResume: (approved: boolean, feedback?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  resuming: boolean;
}

export function LGTaskDetailLayout() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<LGTaskDetail | null>(null);
  const [state, setState] = useState<LGTaskState | null>(null);
  const [graphData, setGraphData] = useState<LGGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!threadId) return;
    try {
      const [detailRes, stateRes, graphRes] = await Promise.all([
        langgraphApi.getTaskDetail(threadId).catch(() => null),
        langgraphApi.getTaskState(threadId).catch(() => null),
        langgraphApi.getGraph().catch(() => null),
      ]);
      if (detailRes) setDetail(detailRes);
      if (stateRes) setState(stateRes);
      if (graphRes) setGraphData(graphRes);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 自动轮询：非终态且非等待人工时，每 5s 刷新
  useEffect(() => {
    const status = detail?.status || '';
    if (TERMINAL_STATUSES.has(status) || HUMAN_PENDING_STATUSES.has(status)) return;
    if (!status) return;

    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [detail?.status, loadData]);

  // 判断当前需要的人工交互
  const getPendingAction = useCallback((): 'outline_review' | 'final_approval' | null => {
    if (!state?.next || state.next.length === 0) return null;
    const nextNode = state.next[0];
    if (detail?.status === 'outline_pending' || nextNode === 'human_outline') return 'outline_review';
    if (detail?.status === 'awaiting_approval' || nextNode === 'human_approve') return 'final_approval';
    return null;
  }, [state, detail]);

  const pendingAction = getPendingAction();

  // 恢复执行
  const handleResume = useCallback(async (approved: boolean, feedback?: string) => {
    if (!threadId) return;
    setResuming(true);
    setError(null);
    try {
      await langgraphApi.resumeTask(threadId, {
        approved,
        feedback: feedback?.trim() || undefined,
      });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Resume failed');
    } finally {
      setResuming(false);
    }
  }, [threadId, loadData]);

  // Context 传递给子 tab
  const contextValue: LGTaskContext = {
    detail,
    state,
    graphData,
    loading,
    error,
    pendingAction,
    onResume: handleResume,
    onRefresh: loadData,
    resuming,
  };

  if (loading) {
    return (
      <div className="task-detail-layout">
        <div className="task-sidebar-new">
          <div style={{ padding: '24px', color: 'var(--text-muted)' }}>加载中...</div>
        </div>
        <div className="task-main-content-new">
          <div style={{ padding: '32px', color: 'var(--text-muted)' }}>正在加载任务数据...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-detail-layout">
      {/* 左侧边栏 */}
      <aside className="task-sidebar-new">
        {/* 返回按钮 */}
        <div style={{ marginBottom: '16px' }}>
          <a className="back-link" onClick={() => navigate('/lg-tasks')} style={{ cursor: 'pointer' }}>
            <span className="material-icons-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
            返回列表
          </a>
        </div>

        {/* 任务标题 */}
        <div className="sidebar-brand">
          <h2 className="brand-title" style={{ fontSize: '15px' }}>LangGraph 流水线</h2>
          <p className="task-topic-preview">{detail?.topic || 'Loading...'}</p>
        </div>

        {/* 状态 + 进度 */}
        <div style={{ padding: '0 8px', marginBottom: '8px' }}>
          <span className={`status-value status-${getStatusClass(detail?.status || '')}`}>
            {STATUS_LABELS[detail?.status || ''] || detail?.status || 'unknown'}
          </span>
          <div className="lg-progress-bar" style={{ marginTop: '8px', height: '4px', borderRadius: '2px' }}>
            <div className="lg-progress-fill" style={{ width: `${detail?.progress || 0}%`, height: '100%', borderRadius: '2px' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{detail?.progress || 0}%</span>
        </div>

        {/* Tab 导航 */}
        <nav className="sidebar-nav-menu">
          {LG_TABS.map(tab => (
            <NavLink
              key={tab.id}
              to={tab.path}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="material-icons-outlined nav-item-icon">{tab.materialIcon}</span>
              {tab.label}
              {tab.id === 'planning' && pendingAction === 'outline_review' && (
                <span className="nav-item-badge">!</span>
              )}
              {tab.id === 'reviews' && pendingAction === 'final_approval' && (
                <span className="nav-item-badge">!</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Graph 可视化（紧凑版） */}
        {graphData && (
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--divider)' }}>
            <GraphVisualization
              mermaidCode={graphData.graph}
              currentNode={detail?.currentNode}
              className="lg-sidebar-graph"
            />
          </div>
        )}
      </aside>

      {/* 右侧内容区 */}
      <main className="task-main-content-new">
        {error && (
          <div className="lg-error" style={{ margin: '16px 32px 0' }}>{error}</div>
        )}
        <div className="tab-content-wrapper-new" style={{ padding: '32px' }}>
          <Outlet context={contextValue} />
        </div>
      </main>
    </div>
  );
}

// 将 LG status 映射到现有 CSS class
function getStatusClass(status: string): string {
  if (status.includes('pending') || status === 'created') return 'pending';
  if (status.includes('planning') || status.includes('outline')) return 'planning';
  if (status.includes('research')) return 'researching';
  if (status.includes('writing') || status.includes('revision')) return 'writing';
  if (status.includes('review') || status.includes('approv')) return 'reviewing';
  if (status === 'completed') return 'completed';
  return 'pending';
}
