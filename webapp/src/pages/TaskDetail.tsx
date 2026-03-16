// 任务详情页 - Task Detail Page
// v2.0 核心功能：展示任务完整信息、阶段进度、操作按钮

import { useState, useEffect } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { tasksApi, blueTeamApi, hotTopicsApi, sentimentApi, type BlueTeamReview, type HotTopic } from '../api/client';
import type { Task } from '../types';
import './TaskDetail.css';

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [reviews, setReviews] = useState<BlueTeamReview[]>([]);
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [alerts, setAlerts] = useState<Array<{type: string; severity: string; message: string; suggestion?: string}>>([]);
  const [suggestions, setSuggestions] = useState<Array<{area: string; suggestion: string; priority: string; impact: string}>>([]);
  const [sentiment, setSentiment] = useState<{msiIndex: number; trendDirection: string; positive: number; negative: number; neutral: number} | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'research' | 'reviews' | 'quality'>('overview');
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);

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

      // 加载热点话题
      try {
        const topicsData = await hotTopicsApi.getAll({ limit: 5 });
        setHotTopics(topicsData.items || []);
      } catch (e) { /* 忽略错误 */ }

      // 加载情感分析
      try {
        const sentimentData = await sentimentApi.getStats();
        setSentiment(sentimentData);
      } catch (e) { /* 忽略错误 */ }

      // 生成优化建议
      generateSuggestions(data);

      // 生成预警
      generateAlerts(data);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSuggestions = (taskData: Task) => {
    const newSuggestions: Array<{area: string; suggestion: string; priority: string; impact: string}> = [];

    if (!taskData.outline) {
      newSuggestions.push({
        area: '大纲',
        suggestion: '任务尚未生成大纲，建议进入选题策划阶段',
        priority: 'high',
        impact: '明确写作方向'
      });
    }

    if (!taskData.research_data?.sources?.length) {
      newSuggestions.push({
        area: '研究',
        suggestion: '缺少引用来源，建议进行深度研究收集资料',
        priority: 'medium',
        impact: '提升内容可信度'
      });
    }

    if (taskData.evaluation && taskData.evaluation.score < 70) {
      newSuggestions.push({
        area: '质量',
        suggestion: '选题评分较低，建议优化选题或寻找差异化角度',
        priority: 'high',
        impact: '提高内容竞争力'
      });
    }

    setSuggestions(newSuggestions);
  };

  const generateAlerts = (taskData: Task) => {
    const newAlerts: Array<{type: string; severity: string; message: string; suggestion?: string}> = [];

    // 检查任务是否长时间未更新
    const lastUpdate = new Date(taskData.updated_at);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 7) {
      newAlerts.push({
        type: 'freshness',
        severity: 'warning',
        message: `任务已${daysDiff}天未更新`,
        suggestion: '建议检查任务状态或更新进度'
      });
    }

    // 检查是否有评审意见未处理
    const pendingReviews = reviews.filter(r => r.status === 'pending');
    if (pendingReviews.length > 0) {
      newAlerts.push({
        type: 'review',
        severity: 'info',
        message: `有${pendingReviews.length}条评审意见待处理`,
        suggestion: '请及时处理蓝军评审意见'
      });
    }

    setAlerts(newAlerts);
  };

  const handleAnalyzeContent = async () => {
    if (!analyzeText.trim()) return;
    try {
      const result = await sentimentApi.analyze('temp', analyzeText);
      setAnalyzeResult(result);
    } catch (error) {
      console.error('分析失败:', error);
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
        <button
          className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          📊 质量分析 {alerts.length > 0 && `(${alerts.length})`}
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

        {/* 质量分析标签页 */}
        {activeTab === 'quality' && (
          <div className="tab-panel quality-panel">
            <div className="quality-grid">
              {/* 情感分析 (MSI) */}
              {sentiment && (
                <div className="info-card sentiment-card">
                  <h3 className="card-title">📊 市场情绪指数 (MSI)</h3>
                  <div className="sentiment-display">
                    <div className="msi-gauge-small">
                      <span className="msi-value-small">{sentiment.msiIndex}</span>
                      <span className="msi-level-small">MSI</span>
                    </div>
                    <div className="msi-change">
                      <span className={`change-badge ${sentiment.trendDirection === 'up' ? 'up' : sentiment.trendDirection === 'down' ? 'down' : ''}`}>
                        趋势 {sentiment.trendDirection === 'up' ? '📈 上升' : sentiment.trendDirection === 'down' ? '📉 下降' : '➡️ 稳定'}
                      </span>
                    </div>
                  </div>
                  <div className="sentiment-distribution">
                    <div className="dist-bar">
                      <span className="dist-label">😊 正面</span>
                      <div className="dist-progress">
                        <div className="dist-fill positive" style={{ width: `${(sentiment.positive / (sentiment.positive + sentiment.negative + sentiment.neutral)) * 100}%` }}></div>
                      </div>
                      <span className="dist-percent">{sentiment.positive}</span>
                    </div>
                    <div className="dist-bar">
                      <span className="dist-label">😐 中性</span>
                      <div className="dist-progress">
                        <div className="dist-fill neutral" style={{ width: `${(sentiment.neutral / (sentiment.positive + sentiment.negative + sentiment.neutral)) * 100}%` }}></div>
                      </div>
                      <span className="dist-percent">{sentiment.neutral}</span>
                    </div>
                    <div className="dist-bar">
                      <span className="dist-label">😔 负面</span>
                      <div className="dist-progress">
                        <div className="dist-fill negative" style={{ width: `${(sentiment.negative / (sentiment.positive + sentiment.negative + sentiment.neutral)) * 100}%` }}></div>
                      </div>
                      <span className="dist-percent">{sentiment.negative}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 热点话题 */}
              <div className="info-card hot-topics-card">
                <h3 className="card-title">🔥 相关热点话题</h3>
                {hotTopics.length > 0 ? (
                  <ul className="hot-topics-list">
                    {hotTopics.map((topic) => (
                      <li key={topic.id} className="hot-topic-item">
                        <span className="topic-title">{topic.title}</span>
                        <span className="topic-score">{topic.hotScore}</span>
                        <span className={`topic-trend trend-${topic.trend}`}>
                          {topic.trend === 'up' ? '📈' : topic.trend === 'down' ? '📉' : '➡️'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-mini">暂无相关热点</div>
                )}
              </div>

              {/* 实时预警 */}
              <div className="info-card alerts-card">
                <h3 className="card-title">⚠️ 实时预警</h3>
                {alerts.length > 0 ? (
                  <div className="alerts-list">
                    {alerts.map((alert, idx) => (
                      <div key={idx} className={`alert-item severity-${alert.severity}`}>
                        <span className="alert-type">{alert.type === 'freshness' ? '⏰' : alert.type === 'review' ? '👥' : '⚠️'}</span>
                        <div className="alert-content">
                          <p className="alert-message">{alert.message}</p>
                          {alert.suggestion && <p className="alert-suggestion">💡 {alert.suggestion}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-mini">✅ 暂无预警</div>
                )}
              </div>

              {/* 优化建议 */}
              <div className="info-card suggestions-card">
                <h3 className="card-title">💡 优化建议</h3>
                {suggestions.length > 0 ? (
                  <div className="suggestions-list">
                    {suggestions.map((s, idx) => (
                      <div key={idx} className={`suggestion-item priority-${s.priority}`}>
                        <span className="suggestion-area">{s.area}</span>
                        <p className="suggestion-text">{s.suggestion}</p>
                        <span className="suggestion-impact">📈 {s.impact}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-mini">暂无优化建议</div>
                )}
              </div>

              {/* 内容分析器 */}
              <div className="info-card full-width analyzer-card">
                <h3 className="card-title">📝 内容分析器</h3>
                <div className="analyzer-input-section">
                  <textarea
                    className="analyzer-textarea"
                    placeholder="粘贴文章内容进行实时分析..."
                    value={analyzeText}
                    onChange={(e) => setAnalyzeText(e.target.value)}
                    rows={4}
                  />
                  <button className="btn btn-primary analyze-btn" onClick={handleAnalyzeContent}>
                    🔍 分析内容
                  </button>
                </div>
                {analyzeResult && (
                  <div className="analyzer-result">
                    <h4>分析结果</h4>
                    <div className="result-metrics">
                      <div className="result-metric">
                        <span className="metric-label">情感倾向</span>
                        <span className={`metric-value polarity-${analyzeResult.polarity}`}>
                          {analyzeResult.polarity === 'positive' ? '😊 正面' : analyzeResult.polarity === 'negative' ? '😔 负面' : '😐 中性'}
                        </span>
                      </div>
                      <div className="result-metric">
                        <span className="metric-label">置信度</span>
                        <span className="metric-value">{((analyzeResult.confidence || 0) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    {analyzeResult.keywords && analyzeResult.keywords.length > 0 && (
                      <div className="result-keywords">
                        <span className="keywords-label">关键词：</span>
                        {analyzeResult.keywords.map((kw: string, i: number) => (
                          <span key={i} className="keyword-tag">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
