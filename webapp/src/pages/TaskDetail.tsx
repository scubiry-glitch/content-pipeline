// 任务详情页 - Task Detail Page
// v2.0 核心功能：展示任务完整信息、阶段进度、操作按钮

import { useState, useEffect } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { tasksApi, blueTeamApi, type BlueTeamReview } from '../api/client';
import type { Task } from '../types';
import './TaskDetail.css';

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [reviews, setReviews] = useState<BlueTeamReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'research' | 'reviews'>('overview');

  useEffect(() => {
    if (id) {
      loadTask();
    }
  }, [id]);

  const loadTask = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getById(id!);
      setTask(data);

      // 加载蓝军评审
      if (data.status === 'reviewing' || data.status === 'completed') {
        const reviewsData = await blueTeamApi.getReviews(id!);
        setReviews(reviewsData.items || []);
      }
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (approved: boolean) => {
    try {
      await tasksApi.approve(id!, approved);
      loadTask();
    } catch (error) {
      console.error('审批失败:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这个任务吗？')) return;
    try {
      await tasksApi.delete(id!);
      navigate('/tasks');
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const getStageProgress = (status: string) => {
    const stageMap: Record<string, number> = {
      pending: 0,
      planning: 25,
      researching: 50,
      writing: 75,
      reviewing: 90,
      converting: 95,
      completed: 100,
    };
    return stageMap[status] || 0;
  };

  const getStageName = (status: string) => {
    const nameMap: Record<string, string> = {
      pending: '待处理',
      planning: '选题策划',
      researching: '深度研究',
      writing: '文稿生成',
      reviewing: '蓝军评审',
      converting: '多态转换',
      completed: '已完成',
      failed: '失败',
    };
    return nameMap[status] || status;
  };

  if (loading) {
    return (
      <div className="task-detail">
        <div className="loading">
          <span className="loading-spinner"></span>
          加载中...
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="task-detail">
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">任务不存在</div>
          <button className="btn btn-primary" onClick={() => navigate('/tasks')}>
            返回任务列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-detail">
      {/* 头部导航 */}
      <div className="detail-header">
        <div className="header-breadcrumb">
          <NavLink to="/tasks">任务管理</NavLink>
          <span className="separator">/</span>
          <span className="current">任务详情</span>
        </div>
        <div className="header-actions">
          {task.status === 'reviewing' && (
            <>
              <button
                className="btn btn-primary"
                onClick={() => handleApprove(true)}
              >
                ✅ 通过
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleApprove(false)}
              >
                ❌ 驳回
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={handleDelete}>
            🗑️ 删除
          </button>
        </div>
      </div>

      {/* 任务标题区 */}
      <div className="task-title-section">
        <h1 className="task-topic">{task.topic}</h1>
        <div className="task-meta">
          <span className={`status-badge status-${task.status}`}>
            {getStageName(task.status)}
          </span>
          <span className="task-id">ID: {task.id}</span>
          <span className="task-date">
            创建于 {new Date(task.created_at).toLocaleDateString('zh-CN')}
          </span>
        </div>
      </div>

      {/* 阶段进度条 */}
      <div className="stage-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getStageProgress(task.status)}%` }}
          ></div>
        </div>
        <div className="stage-steps">
          {['待处理', '选题策划', '深度研究', '文稿生成', '蓝军评审', '已完成'].map(
            (stage, index) => {
              const progress = getStageProgress(task.status);
              const stepProgress = (index / 5) * 100;
              const isActive = progress >= stepProgress;
              const isCurrent =
                progress >= stepProgress && progress < stepProgress + 20;

              return (
                <div
                  key={stage}
                  className={`stage-step ${isActive ? 'active' : ''} ${
                    isCurrent ? 'current' : ''
                  }`}
                >
                  <div className="step-dot"></div>
                  <span className="step-name">{stage}</span>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* 标签切换 */}
      <div className="detail-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📋 概览
        </button>
        <button
          className={`tab-btn ${activeTab === 'research' ? 'active' : ''}`}
          onClick={() => setActiveTab('research')}
        >
          🔍 深度研究
        </button>
        <button
          className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          👥 蓝军评审 {reviews.length > 0 && `(${reviews.length})`}
        </button>
      </div>

      {/* 内容区 */}
      <div className="detail-content">
        {activeTab === 'overview' && (
          <div className="tab-panel overview-panel">
            <div className="panel-grid">
              {/* 基础信息 */}
              <div className="info-card">
                <h3 className="card-title">📊 基础信息</h3>
                <div className="info-list">
                  <div className="info-item">
                    <span className="label">目标格式</span>
                    <span className="value">
                      {task.target_formats?.join(', ') || 'markdown'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="label">进度</span>
                    <span className="value">{task.progress}%</span>
                  </div>
                  <div className="info-item">
                    <span className="label">当前阶段</span>
                    <span className="value">{task.current_stage || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 选题评估 */}
              {task.evaluation && (
                <div className="info-card">
                  <h3 className="card-title">🎯 选题评估</h3>
                  <div className="score-display">
                    <div className="score-circle">
                      <span className="score-value">{task.evaluation.score}</span>
                      <span className="score-label">分</span>
                    </div>
                  </div>
                  <div className="dimension-bars">
                    {Object.entries(task.evaluation.dimensions).map(
                      ([key, value]) => (
                        <div key={key} className="dimension-bar">
                          <span className="dim-name">
                            {key === 'dataAvailability'
                              ? '数据可得性'
                              : key === 'novelty'
                              ? '新颖性'
                              : key === 'timeliness'
                              ? '时效性'
                              : key === 'expertiseMatch'
                              ? '专业匹配'
                              : key}
                          </span>
                          <div className="dim-progress">
                            <div
                              className="dim-fill"
                              style={{ width: `${value}%` }}
                            ></div>
                          </div>
                          <span className="dim-value">{value}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* 大纲预览 */}
              {task.outline && (
                <div className="info-card full-width">
                  <h3 className="card-title">📝 文章大纲</h3>
                  <div className="outline-preview">
                    {task.outline.sections.map((section, idx) => (
                      <div key={idx} className="outline-section">
                        <h4 className="section-title">
                          {idx + 1}. {section.title}
                        </h4>
                        <ul className="key-points">
                          {section.key_points.map((point, pidx) => (
                            <li key={pidx}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'research' && (
          <div className="tab-panel research-panel">
            {task.research_data ? (
              <div className="research-content">
                {/* 研究洞察 */}
                {task.research_data.insights?.length > 0 && (
                  <div className="info-card">
                    <h3 className="card-title">💡 研究洞察</h3>
                    <div className="insights-list">
                      {task.research_data.insights.map((insight) => (
                        <div key={insight.id} className="insight-item">
                          <div className="insight-header">
                            <span
                              className={`insight-type type-${insight.type}`}
                            >
                              {insight.type === 'data'
                                ? '数据'
                                : insight.type === 'trend'
                                ? '趋势'
                                : insight.type === 'case'
                                ? '案例'
                                : '专家'}
                            </span>
                            <span className="insight-source">
                              来源: {insight.source}
                            </span>
                          </div>
                          <p className="insight-content">{insight.content}</p>
                          <div className="insight-confidence">
                            置信度: {(insight.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 引用来源 */}
                {task.research_data.sources?.length > 0 && (
                  <div className="info-card">
                    <h3 className="card-title">📚 引用来源</h3>
                    <div className="sources-list">
                      {task.research_data.sources.map((source, idx) => (
                        <div key={idx} className="source-item">
                          <span className="source-name">{source.name}</span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-link"
                          >
                            查看原文 →
                          </a>
                          <span className="source-reliability">
                            可靠度: {(source.reliability * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <div className="empty-title">暂无研究数据</div>
                <p>任务进入深度研究阶段后将自动采集相关内容</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="tab-panel reviews-panel">
            {reviews.length > 0 ? (
              <div className="reviews-list">
                {reviews.map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-header">
                      <div className="reviewer-info">
                        <span className="reviewer-role">
                          {review.expert_role === 'fact_checker'
                            ? '🔍 事实核查员'
                            : review.expert_role === 'logic_analyst'
                            ? '🧠 逻辑分析师'
                            : review.expert_role === 'style_editor'
                            ? '✍️ 风格编辑'
                            : review.expert_role === 'structure_consultant'
                            ? '🏗️ 结构顾问'
                            : review.expert_role}
                        </span>
                        <span
                          className={`review-status status-${review.status}`}
                        >
                          {review.status === 'pending' ? '待处理' : '已完成'}
                        </span>
                      </div>
                      <span className="review-round">第 {review.round} 轮</span>
                    </div>

                    {review.questions?.length > 0 && (
                      <div className="questions-list">
                        {review.questions.map((q) => (
                          <div
                            key={q.id}
                            className={`question-item severity-${q.severity}`}
                          >
                            <div className="question-header">
                              <span
                                className={`severity-badge ${q.severity}`}
                              >
                                {q.severity === 'high'
                                  ? '🔴 严重'
                                  : q.severity === 'medium'
                                  ? '🟡 中等'
                                  : q.severity === 'low'
                                  ? '🟢 轻微'
                                  : '✅ 表扬'}
                              </span>
                              {q.location && (
                                <span className="question-location">
                                  📍 {q.location}
                                </span>
                              )}
                            </div>
                            <p className="question-text">{q.question}</p>
                            <div className="suggestion-box">
                              <strong>建议:</strong> {q.suggestion}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {review.user_decision && (
                      <div
                        className={`decision-box decision-${review.user_decision}`}
                      >
                        <strong>用户决策:</strong>
                        {review.user_decision === 'accept'
                          ? ' ✅ 接受'
                          : review.user_decision === 'revise'
                          ? ' 📝 修改'
                          : ' ❌ 忽略'}
                        {review.decision_note && (
                          <p className="decision-note">{review.decision_note}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">👥</div>
                <div className="empty-title">暂无评审记录</div>
                <p>任务进入评审阶段后将显示蓝军评审意见</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
