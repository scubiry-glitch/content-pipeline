import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { reportsApi, tasksApi, type Report, type ReportMatch, type Task } from '../api/client';
import './ReportDetail.css';

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [matches, setMatches] = useState<ReportMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'quality' | 'matches' | 'citations'>('overview');
  const [citations, setCitations] = useState<Task[]>([]);
  const [citationsLoading, setCitationsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadReport();
    }
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'matches' && matches.length === 0) {
      loadMatches();
    }
    if (id && activeTab === 'citations' && citations.length === 0) {
      loadCitations();
    }
  }, [id, activeTab]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getById(id!);
      setReport(res);
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    if (!id) return;
    setMatchesLoading(true);
    try {
      const response = await reportsApi.getMatches(id);
      setMatches(response.items);
    } catch (error) {
      console.error('Failed to load matches:', error);
    } finally {
      setMatchesLoading(false);
    }
  };

  const loadCitations = async () => {
    if (!id) return;
    setCitationsLoading(true);
    try {
      // 获取所有任务并筛选引用了该研报的任务
      const response = await tasksApi.getAll({ limit: 100 });
      const tasksWithReport = response.items.filter((task: Task) =>
        task.report_ids?.includes(id) ||
        task.references?.some((ref: any) => ref.reportId === id)
      );
      setCitations(tasksWithReport);
    } catch (error) {
      console.error('Failed to load citations:', error);
    } finally {
      setCitationsLoading(false);
    }
  };

  const handleParse = async () => {
    if (!report) return;
    try {
      await reportsApi.parse(report.id);
      await loadReport();
    } catch (error) {
      console.error('Parse failed:', error);
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  if (loading) {
    return <div className="report-detail loading">加载中...</div>;
  }

  if (!report) {
    return <div className="report-detail empty">研报不存在</div>;
  }

  return (
    <div className="report-detail">
      <div className="detail-header">
        <button className="btn btn-link back-btn" onClick={() => navigate('/reports')}>
          ← 返回研报库
        </button>
      </div>

      <div className="report-hero">
        <h1>{report.title || '未命名研报'}</h1>
        <div className="report-meta">
          <span>🏢 {report.institution || '未知机构'}</span>
          <span>👤 {report.authors?.join(', ') || '未知作者'}</span>
          <span>📅 {new Date(report.publishDate).toLocaleDateString()}</span>
          <span>📄 {report.pageCount}页</span>
        </div>
        <div className="report-tags">
          {report.tags?.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        {report.status === 'pending' && (
          <button className="btn btn-primary parse-btn" onClick={handleParse}>
            🔍 开始解析
          </button>
        )}
      </div>

      <div className="detail-tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          📄 概览
        </button>
        <button className={`tab ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveTab('quality')}>
          📊 质量分析
        </button>
        <button className={`tab ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}>
          🔗 智能匹配
        </button>
        <button className={`tab ${activeTab === 'citations' ? 'active' : ''}`} onClick={() => setActiveTab('citations')}>
          📚 引用统计 ({citations.length})
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'overview' && (
          <div className="overview-panel">
            {report.keyPoints && report.keyPoints.length > 0 && (
              <div className="section">
                <h3>💡 核心观点</h3>
                <ul>
                  {report.keyPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.summary && (
              <div className="section">
                <h3>📝 摘要</h3>
                <p>{report.summary}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="quality-panel">
            <div className="quality-overview">
              <div className="overall-score" style={{ color: getQualityColor(report.qualityScore || 0) }}>
                <div className="score-value">{report.qualityScore || '--'}</div>
                <div className="score-label">综合质量分</div>
              </div>
            </div>
            <div className="quality-dimensions">
              <h3>维度评分</h3>
              {report.qualityDimensions && Object.entries(report.qualityDimensions).map(([dim, score]) => (
                <div key={dim} className="dimension-row">
                  <span className="dim-name">{dim}</span>
                  <div className="dim-bar">
                    <div className="dim-fill" style={{ width: `${score}%`, background: getQualityColor(score) }} />
                  </div>
                  <span className="dim-score">{score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'matches' && (
          <div className="matches-panel">
            {matchesLoading ? (
              <div className="loading-state">加载匹配数据中...</div>
            ) : matches.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔗</div>
                <div className="empty-title">暂无匹配数据</div>
                <p>该研报尚未与RSS热点、素材或话题进行关联</p>
              </div>
            ) : (
              <div className="matches-list">
                <div className="matches-summary">
                  <span className="matches-count">共找到 {matches.length} 个关联</span>
                  <button className="btn btn-sm btn-secondary" onClick={loadMatches}>
                    🔄 刷新
                  </button>
                </div>
                {matches.map((match) => (
                  <div key={match.id} className="match-card">
                    <div className="match-header">
                      <span className={`match-type-badge ${match.matchType}`}>
                        {match.matchType === 'rss' && '📰 RSS'}
                        {match.matchType === 'asset' && '📚 素材'}
                        {match.matchType === 'topic' && '🔥 热点'}
                        {match.matchType === 'report' && '📊 研报'}
                      </span>
                      <span className="match-score-badge" style={{ color: getQualityColor(match.matchScore) }}>
                        {Math.round(match.matchScore)}分
                      </span>
                    </div>

                    <div className="match-content">
                      <h4 className="match-title">
                        {match.matchedItem?.title || '未知内容'}
                      </h4>
                      <p className="match-reason">{match.matchReason}</p>
                      {match.matchedItem?.source && (
                        <span className="match-source">来源: {match.matchedItem.source}</span>
                      )}
                    </div>

                    <div className="match-actions">
                      {match.matchType === 'rss' && match.matchedItem?.id && (
                        <Link to={`/hot-topics/${match.matchedItem.id}`} className="btn btn-sm btn-link">
                          查看热点 →
                        </Link>
                      )}
                      {match.matchType === 'topic' && match.matchedItem?.id && (
                        <Link to={`/hot-topics/${match.matchedItem.id}`} className="btn btn-sm btn-link">
                          查看话题 →
                        </Link>
                      )}
                      {match.matchType === 'asset' && match.matchedItem?.id && (
                        <Link to={`/assets/${match.matchedItem.id}`} className="btn btn-sm btn-link">
                          查看素材 →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'citations' && (
          <div className="citations-panel">
            {citationsLoading ? (
              <div className="loading-state">加载引用数据中...</div>
            ) : (
              <>
                <div className="citations-summary">
                  <div className="summary-card">
                    <div className="summary-value">{citations.length}</div>
                    <div className="summary-label">引用次数</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-value">
                      {citations.filter(t => t.status === 'completed').length}
                    </div>
                    <div className="summary-label">已完成任务</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-value">
                      {citations.filter(t => ['planning', 'researching', 'writing'].includes(t.status)).length}
                    </div>
                    <div className="summary-label">进行中任务</div>
                  </div>
                </div>

                {citations.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📚</div>
                    <div className="empty-title">暂无引用记录</div>
                    <p>该研报尚未被任何任务引用</p>
                  </div>
                ) : (
                  <div className="citations-list">
                    <h3>引用该研报的任务</h3>
                    {citations.map((task) => (
                      <div key={task.id} className="citation-card">
                        <div className="citation-header">
                          <h4 className="citation-title">{task.topic}</h4>
                          <span className={`status-badge ${task.status}`}>{task.status}</span>
                        </div>
                        <div className="citation-meta">
                          <span>阶段: {task.current_stage || '-'}</span>
                          <span>进度: {task.progress}%</span>
                          <span>创建: {new Date(task.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="citation-actions">
                          <Link to={`/tasks/${task.id}`} className="btn btn-sm btn-link">
                            查看任务 →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
