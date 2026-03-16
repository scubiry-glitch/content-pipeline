import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { reportsApi, type Report, type ReportMatch } from '../api/client';
import './ReportDetail.css';

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [matches, setMatches] = useState<ReportMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'quality' | 'matches'>('overview');

  useEffect(() => {
    if (id) {
      loadReport();
    }
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'matches' && matches.length === 0) {
      loadMatches();
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
                      {match.matchType === 'asset' && (
                        <button className="btn btn-sm btn-link" onClick={() => alert('素材详情页开发中')}>
                          查看素材 →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
