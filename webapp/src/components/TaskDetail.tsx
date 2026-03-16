// 任务详情面板 - 恢复原版 HTML 的详细功能
import { useState, useEffect } from 'react';
import { tasksApi } from '../api/client';
import type { Task, BlueTeamReview } from '../types';
import './TaskDetail.css';

interface TaskDetailProps {
  taskId: string | null;
  onClose: () => void;
}

type DetailTab = 'overview' | 'planning' | 'research' | 'writing' | 'review' | 'versions';

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [reviews, setReviews] = useState<BlueTeamReview[]>([]);

  useEffect(() => {
    if (taskId) {
      loadTaskDetail(taskId);
    }
  }, [taskId]);

  const loadTaskDetail = async (id: string) => {
    setLoading(true);
    try {
      const data = await tasksApi.getById(id);
      setTask(data);
      // 加载蓝军评审数据
      if (data.status === 'reviewing' || data.status === 'awaiting_approval') {
        loadReviews(id);
      }
    } catch (err) {
      console.error('Failed to load task detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async (id: string) => {
    try {
      const data = await tasksApi.getReviews(id);
      setReviews(data);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (!task) return;
    try {
      await tasksApi.approve(task.id, approved);
      loadTaskDetail(task.id);
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const formatTime = (time: string) => {
    return new Date(time).toLocaleString('zh-CN');
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '待处理',
      planning: '选题策划中',
      researching: '深度研究中',
      writing: '文稿生成中',
      reviewing: '蓝军评审中',
      awaiting_approval: '待确认',
      converting: '多态转换中',
      completed: '已完成',
      failed: '失败',
    };
    return map[status] || status;
  };

  const getStatusClass = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-pending',
      planning: 'badge-planning',
      researching: 'badge-researching',
      writing: 'badge-writing',
      reviewing: 'badge-reviewing',
      awaiting_approval: 'badge-reviewing',
      converting: 'badge-converting',
      completed: 'badge-completed',
      failed: 'badge-failed',
    };
    return map[status] || 'badge-pending';
  };

  if (!taskId) return null;

  return (
    <>
      <div className={`detail-overlay ${taskId ? 'active' : ''}`} onClick={onClose} />
      <div className={`detail-panel ${taskId ? 'open' : ''}`}>
        <div className="detail-header">
          <h3 className="detail-title">任务详情</h3>
          <button className="detail-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="detail-loading">加载中...</div>
        ) : task ? (
          <div className="detail-content">
            {/* Tab 导航 */}
            <div className="detail-tabs">
              <button
                className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                概览
              </button>
              <button
                className={`detail-tab ${activeTab === 'planning' ? 'active' : ''}`}
                onClick={() => setActiveTab('planning')}
              >
                💡 选题策划
              </button>
              <button
                className={`detail-tab ${activeTab === 'research' ? 'active' : ''}`}
                onClick={() => setActiveTab('research')}
              >
                🔍 深度研究
              </button>
              <button
                className={`detail-tab ${activeTab === 'writing' ? 'active' : ''}`}
                onClick={() => setActiveTab('writing')}
              >
                ✍️ 文稿生成
              </button>
              <button
                className={`detail-tab ${activeTab === 'review' ? 'active' : ''}`}
                onClick={() => setActiveTab('review')}
              >
                👥 蓝军评审
              </button>
              <button
                className={`detail-tab ${activeTab === 'versions' ? 'active' : ''}`}
                onClick={() => setActiveTab('versions')}
              >
                📄 版本对比
              </button>
            </div>

            {/* Tab 内容 */}
            <div className="detail-tab-content">
              {activeTab === 'overview' && (
                <OverviewTab
                  task={task}
                  formatTime={formatTime}
                  getStatusText={getStatusText}
                  getStatusClass={getStatusClass}
                  onApprove={handleApprove}
                />
              )}
              {activeTab === 'planning' && <PlanningTab task={task} />}
              {activeTab === 'research' && <ResearchTab task={task} />}
              {activeTab === 'writing' && <WritingTab task={task} />}
              {activeTab === 'review' && (
                <ReviewTab task={task} reviews={reviews} onRefresh={() => task && loadReviews(task.id)} />
              )}
              {activeTab === 'versions' && <VersionsTab task={task} />}
            </div>
          </div>
        ) : (
          <div className="detail-error">加载失败</div>
        )}
      </div>
    </>
  );
}

// 概览 Tab
function OverviewTab({
  task,
  formatTime,
  getStatusText,
  getStatusClass,
  onApprove,
}: {
  task: Task;
  formatTime: (t: string) => string;
  getStatusText: (s: string) => string;
  getStatusClass: (s: string) => string;
  onApprove: (approved: boolean) => void;
}) {
  const stages = [
    { id: 1, name: '选题策划', icon: '💡', status: 'completed' },
    { id: 2, name: '深度研究', icon: '🔍', status: 'completed' },
    { id: 3, name: '文稿生成', icon: '✍️', status: 'in_progress' },
    { id: 4, name: '多态转换', icon: '🎯', status: 'pending' },
  ];

  return (
    <>
      {/* 基本信息 */}
      <div className="detail-section">
        <div className="detail-section-title">基本信息</div>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">状态</div>
            <div className="info-value">
              <span className={`badge ${getStatusClass(task.status)}`}>
                {getStatusText(task.status)}
              </span>
            </div>
          </div>
          <div className="info-item">
            <div className="info-label">进度</div>
            <div className="info-value">{task.progress || 0}%</div>
          </div>
          <div className="info-item">
            <div className="info-label">创建时间</div>
            <div className="info-value">{formatTime(task.created_at)}</div>
          </div>
          <div className="info-item">
            <div className="info-label">更新时间</div>
            <div className="info-value">{formatTime(task.updated_at)}</div>
          </div>
        </div>
      </div>

      {/* 生产流水线 */}
      <div className="detail-section">
        <div className="detail-section-title">生产流水线</div>
        <div className="stage-progress-list">
          {stages.map((stage) => (
            <div key={stage.id} className={`stage-progress-item ${stage.status}`}>
              <div className="stage-progress-icon">{stage.icon}</div>
              <div className="stage-progress-info">
                <div className="stage-progress-name">阶段 {stage.id}: {stage.name}</div>
                <div className="stage-progress-status">
                  {stage.status === 'completed' ? '✓ 已完成' : stage.status === 'in_progress' ? '⏳ 进行中' : '⏸ 待开始'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 知识库洞见 */}
      {task.outline?.knowledgeInsights && task.outline.knowledgeInsights.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">💡 知识库洞见</div>
          <div className="insight-list">
            {task.outline.knowledgeInsights.map((insight, i) => (
              <div key={i} className="insight-card">
                <div className="insight-header">
                  <span className="insight-type">
                    {insight.type === 'trend' ? '📈 趋势洞见' : insight.type === 'gap' ? '🔍 研究空白' : '📖 历史演变'}
                  </span>
                  <span className="insight-relevance">相关度: {(insight.relevance * 100).toFixed(0)}%</span>
                </div>
                <p className="insight-content">{insight.content}</p>
                {insight.source && <p className="insight-source">来源: {insight.source}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 待确认操作 */}
      {task.status === 'awaiting_approval' && (
        <div className="detail-section approval-section">
          <div className="detail-section-title">✋ 人工确认</div>
          <p className="approval-desc">蓝军评审已完成，请审核稿件并决定下一步操作。</p>
          <div className="approval-actions">
            <button className="btn btn-success" onClick={() => onApprove(true)}>
              ✓ 确认发布
            </button>
            <button className="btn btn-danger" onClick={() => onApprove(false)}>
              ✕ 打回修改
            </button>
            <button className="btn btn-primary" onClick={() => {}}>
              ✏️ 编辑终稿
            </button>
          </div>
        </div>
      )}

      {/* 产出物 */}
      {task.output_ids && task.output_ids.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">产出物</div>
          <div className="output-chips">
            {task.output_ids.map((id, i) => (
              <span key={id} className="output-chip">
                ⬇️ {task.target_formats?.[i] || '下载'}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// 选题策划 Tab
function PlanningTab({ task }: { task: Task }) {
  const evaluation = task.evaluation;
  const competitorAnalysis = task.competitor_analysis;

  return (
    <div className="detail-section">
      <div className="detail-section-title">💡 选题评估</div>

      {evaluation ? (
        <>
          <div className="evaluation-score">
            <div className="score-circle">{evaluation.score}</div>
            <div className="score-label">综合评分</div>
          </div>

          <div className="evaluation-dimensions">
            <div className="dimension-item">
              <span className="dimension-name">数据可得性</span>
              <div className="dimension-bar">
                <div className="dimension-fill" style={{ width: `${evaluation.dimensions.dataAvailability * 10}%` }} />
              </div>
              <span className="dimension-value">{evaluation.dimensions.dataAvailability}/10</span>
            </div>
            <div className="dimension-item">
              <span className="dimension-name">新颖性</span>
              <div className="dimension-bar">
                <div className="dimension-fill" style={{ width: `${evaluation.dimensions.novelty * 10}%` }} />
              </div>
              <span className="dimension-value">{evaluation.dimensions.novelty}/10</span>
            </div>
            <div className="dimension-item">
              <span className="dimension-name">时效性</span>
              <div className="dimension-bar">
                <div className="dimension-fill" style={{ width: `${evaluation.dimensions.timeliness * 10}%` }} />
              </div>
              <span className="dimension-value">{evaluation.dimensions.timeliness}/10</span>
            </div>
            <div className="dimension-item">
              <span className="dimension-name">专业匹配</span>
              <div className="dimension-bar">
                <div className="dimension-fill" style={{ width: `${evaluation.dimensions.expertiseMatch * 10}%` }} />
              </div>
              <span className="dimension-value">{evaluation.dimensions.expertiseMatch}/10</span>
            </div>
          </div>

          {evaluation.suggestions.length > 0 && (
            <div className="suggestions-list">
              <div className="suggestions-title">💬 优化建议</div>
              {evaluation.suggestions.map((s, i) => (
                <div key={i} className="suggestion-item">• {s}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="empty-state-small">暂无评估数据</div>
      )}

      {/* 竞品分析 */}
      {competitorAnalysis && competitorAnalysis.similarReports.length > 0 && (
        <div className="competitor-section">
          <div className="detail-section-title">📊 竞品分析</div>
          <div className="competitor-list">
            {competitorAnalysis.similarReports.map((report, i) => (
              <div key={i} className="competitor-item">
                <div className="competitor-title">{report.title}</div>
                <div className="competitor-meta">
                  <span>{report.source}</span>
                  <span className={`similarity-score ${report.similarity_score > 0.7 ? 'high' : 'medium'}`}>
                    相似度: {(report.similarity_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 深度研究 Tab
function ResearchTab({ task }: { task: Task }) {
  const researchData = task.research_data;

  return (
    <div className="detail-section">
      <div className="detail-section-title">🔍 研究成果</div>

      {!researchData ? (
        <div className="empty-state-small">研究数据尚未生成</div>
      ) : (
        <>
          {/* 研究洞察 */}
          {researchData.insights.length > 0 && (
            <div className="research-section">
              <div className="research-section-title">💡 核心洞察 ({researchData.insights.length})</div>
              <div className="insight-cards">
                {researchData.insights.map((insight) => (
                  <div key={insight.id} className={`insight-card-small type-${insight.type}`}>
                    <div className="insight-card-header">
                      <span className="insight-type-badge">
                        {insight.type === 'data' ? '📊' : insight.type === 'trend' ? '📈' : insight.type === 'case' ? '💼' : '👤'} {insight.type}
                      </span>
                      <span className="insight-confidence">可信度: {(insight.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="insight-content-small">{insight.content}</p>
                    <p className="insight-source-small">来源: {insight.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 研究来源 */}
          {researchData.sources.length > 0 && (
            <div className="research-section">
              <div className="research-section-title">📚 参考来源 ({researchData.sources.length})</div>
              <div className="source-list">
                {researchData.sources.map((source, i) => (
                  <div key={i} className="source-item">
                    <span className="source-name">{source.name}</span>
                    <span className="source-reliability">可靠度: {(source.reliability * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// 文稿生成 Tab
function WritingTab({ task }: { task: Task }) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">✍️ 文稿内容</div>

      {task.status === 'writing' || task.status === 'reviewing' || task.status === 'awaiting_approval' || task.status === 'completed' ? (
        <>
          <div className="outline-section">
            <div className="outline-title">📋 大纲结构</div>
            {task.outline?.sections ? (
              <div className="outline-tree">
                {task.outline.sections.map((section, i) => (
                  <div key={i} className="outline-item">
                    <div className="outline-item-title">{i + 1}. {section.title}</div>
                    <div className="outline-item-points">
                      {section.key_points.map((point, j) => (
                        <div key={j} className="outline-point">• {point}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-small">大纲数据未加载</div>
            )}
          </div>

          {/* 蓝军评审摘要 */}
          {task.approval_feedback && (
            <div className="feedback-section">
              <div className="feedback-title">💬 评审反馈</div>
              <div className="feedback-content">{task.approval_feedback}</div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state-small">文稿尚未开始生成</div>
      )}
    </div>
  );
}

// 蓝军评审 Tab
function ReviewTab({
  task,
  reviews,
  onRefresh,
}: {
  task: Task;
  reviews: BlueTeamReview[];
  onRefresh: () => void;
}) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">👥 蓝军评审</div>

      {reviews.length === 0 ? (
        <div className="empty-state-small">暂无评审数据</div>
      ) : (
        <div className="reviews-list">
          {reviews.map((review) => (
            <div key={review.id} className="review-round">
              <div className="review-round-header">
                <span className="review-round-title">第 {review.round} 轮评审</span>
                <span className={`review-status ${review.status}`}>{review.status === 'completed' ? '已完成' : '进行中'}</span>
              </div>

              <div className="review-expert">
                <span className="review-expert-role">{review.expert_role}</span>
                {review.expert_name && <span className="review-expert-name">{review.expert_name}</span>}
              </div>

              <div className="review-questions">
                {review.questions.map((q) => (
                  <div key={q.id} className={`review-question-card severity-${q.severity}`}>
                    <div className="question-header">
                      <span className={`severity-badge ${q.severity}`}>
                        {q.severity === 'high' ? '🔴 严重' : q.severity === 'medium' ? '🟡 中等' : q.severity === 'low' ? '🟢 轻微' : '✅ 表扬'}
                      </span>
                      {q.location && <span className="question-location">📍 {q.location}</span>}
                    </div>
                    <div className="question-text">{q.question}</div>
                    <div className="question-suggestion">💡 建议: {q.suggestion}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 版本对比 Tab
function VersionsTab({ task }: { task: Task }) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">📄 版本历史</div>
      <div className="empty-state-small">版本对比功能开发中...</div>
    </div>
  );
}
