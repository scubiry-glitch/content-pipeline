// LangGraph Task Detail Page
// 展示 pipeline 状态、Graph 可视化、交互面板

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { langgraphApi, type LGTaskDetail, type LGTaskState, type LGGraphData } from '../api/langgraph';
import { GraphVisualization } from '../components/GraphVisualization';
import './LangGraphTasks.css';

export function LangGraphTaskDetail() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<LGTaskDetail | null>(null);
  const [state, setState] = useState<LGTaskState | null>(null);
  const [graphData, setGraphData] = useState<LGGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'outline' | 'research' | 'draft' | 'reviews'>('overview');

  // 表单状态
  const [feedback, setFeedback] = useState('');

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

  // 恢复执行（大纲确认/最终审批）
  const handleResume = useCallback(async (approved: boolean) => {
    if (!threadId) return;
    setResuming(true);
    setError(null);

    try {
      await langgraphApi.resumeTask(threadId, {
        approved,
        feedback: feedback.trim() || undefined,
      });
      setFeedback('');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Resume failed');
    } finally {
      setResuming(false);
    }
  }, [threadId, feedback, loadData]);

  // 判断当前需要的人工交互类型
  const getPendingAction = () => {
    if (!state?.next || state.next.length === 0) return null;
    const nextNode = state.next[0];
    if (detail?.status === 'outline_pending' || nextNode === 'human_outline') return 'outline_review';
    if (detail?.status === 'awaiting_approval' || nextNode === 'human_approve') return 'final_approval';
    return null;
  };

  const pendingAction = getPendingAction();

  if (loading) {
    return (
      <div className="lg-detail-page">
        <div className="lg-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="lg-detail-page">
      {/* 顶部导航 */}
      <div className="lg-detail-header">
        <button className="lg-btn lg-btn-ghost" onClick={() => navigate('/lg-tasks')}>
          ← 返回列表
        </button>
        <div className="lg-detail-title-area">
          <h1 className="lg-detail-title">{detail?.topic || 'Loading...'}</h1>
          <div className="lg-detail-meta">
            <span className={`lg-status-badge lg-status--${detail?.status}`}>
              {detail?.status || 'unknown'}
            </span>
            <span className="lg-progress-text">{detail?.progress || 0}%</span>
          </div>
        </div>
        <button className="lg-btn lg-btn-secondary" onClick={loadData}>
          刷新
        </button>
      </div>

      {error && <div className="lg-error">{error}</div>}

      {/* 进度条 */}
      <div className="lg-progress-bar">
        <div
          className="lg-progress-fill"
          style={{ width: `${detail?.progress || 0}%` }}
        />
      </div>

      {/* Graph 可视化 */}
      {graphData && (
        <GraphVisualization
          mermaidCode={graphData.graph}
          currentNode={detail?.currentNode}
          className="lg-detail-graph"
        />
      )}

      {/* 人工交互面板 */}
      {pendingAction && (
        <div className="lg-action-panel">
          <h3 className="lg-action-title">
            {pendingAction === 'outline_review' ? '大纲确认' : '最终审批'}
          </h3>
          <p className="lg-action-desc">
            {pendingAction === 'outline_review'
              ? '请查看生成的大纲，确认后将进入研究阶段'
              : '内容已通过蓝军评审，请最终确认发布'
            }
          </p>
          <div className="lg-form-group">
            <textarea
              className="lg-textarea"
              placeholder="反馈意见（可选）"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={2}
            />
          </div>
          <div className="lg-action-buttons">
            <button
              className="lg-btn lg-btn-danger"
              onClick={() => handleResume(false)}
              disabled={resuming}
            >
              {resuming ? '处理中...' : pendingAction === 'outline_review' ? '退回修改' : '打回修改'}
            </button>
            <button
              className="lg-btn lg-btn-primary"
              onClick={() => handleResume(true)}
              disabled={resuming}
            >
              {resuming ? '处理中...' : pendingAction === 'outline_review' ? '确认大纲' : '批准发布'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="lg-tabs">
        {(['overview', 'outline', 'research', 'draft', 'reviews'] as const).map(tab => (
          <button
            key={tab}
            className={`lg-tab ${activeTab === tab ? 'lg-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {{
              overview: '概览',
              outline: '大纲',
              research: '研究',
              draft: '草稿',
              reviews: '评审',
            }[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="lg-tab-content">
        {activeTab === 'overview' && (
          <div className="lg-overview">
            <div className="lg-info-grid">
              <InfoItem label="Thread ID" value={threadId || '-'} />
              <InfoItem label="Task ID" value={detail?.taskId || '-'} />
              <InfoItem label="状态" value={detail?.status || '-'} />
              <InfoItem label="当前节点" value={detail?.currentNode || '-'} />
              <InfoItem label="大纲确认" value={detail?.outlineApproved ? '已确认' : '待确认'} />
              <InfoItem label="评审通过" value={detail?.reviewPassed ? '通过' : '未通过'} />
              <InfoItem label="评审轮数" value={`${detail?.blueTeamRounds?.length || 0}`} />
              <InfoItem label="最终审批" value={detail?.finalApproved ? '已批准' : '待审批'} />
            </div>
            {detail?.evaluation && (
              <div className="lg-evaluation">
                <h4>选题评估</h4>
                <p>评分: {detail.evaluation.score} 分 {detail.evaluation.passed ? '✓ 通过' : '✗ 建议调整'}</p>
              </div>
            )}
            {(detail?.errors?.length ?? 0) > 0 && (
              <div className="lg-errors-list">
                <h4>错误信息</h4>
                {detail!.errors.map((err, i) => (
                  <div key={i} className="lg-error-item">{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'outline' && (
          <div className="lg-outline">
            {detail?.outline ? (
              <pre className="lg-json-view">{JSON.stringify(detail.outline, null, 2)}</pre>
            ) : (
              <p className="lg-empty-text">大纲尚未生成</p>
            )}
          </div>
        )}

        {activeTab === 'research' && (
          <div className="lg-research">
            {detail?.researchData ? (
              <div>
                <h4>研究分析</h4>
                <pre className="lg-json-view">{JSON.stringify(detail.researchData, null, 2)}</pre>
              </div>
            ) : (
              <p className="lg-empty-text">研究数据尚未生成</p>
            )}
          </div>
        )}

        {activeTab === 'draft' && (
          <div className="lg-draft">
            {detail?.draftContent ? (
              <div className="lg-draft-content">
                {detail.draftContent}
              </div>
            ) : (
              <p className="lg-empty-text">草稿尚未生成</p>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="lg-reviews">
            {(detail?.blueTeamRounds?.length ?? 0) > 0 ? (
              detail!.blueTeamRounds.map((round: any, i: number) => (
                <div key={i} className="lg-review-round">
                  <h4>第 {round.round} 轮评审</h4>
                  <p className="lg-review-summary">{round.revisionSummary}</p>
                  <div className="lg-questions-list">
                    {round.questions?.map((q: any, j: number) => (
                      <div key={j} className={`lg-question lg-question--${q.severity}`}>
                        <span className="lg-question-expert">{q.expertName}</span>
                        <span className={`lg-severity lg-severity--${q.severity}`}>{q.severity}</span>
                        <p className="lg-question-text">{q.question}</p>
                        {q.suggestion && <p className="lg-question-suggestion">建议: {q.suggestion}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="lg-empty-text">评审记录尚未生成</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="lg-info-item">
      <span className="lg-info-label">{label}</span>
      <span className="lg-info-value">{value}</span>
    </div>
  );
}
