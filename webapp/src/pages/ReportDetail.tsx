import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi, type Report } from '../api/client';
import './ReportDetail.css';

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'quality' | 'matches'>('overview');

  useEffect(() => {
    if (id) {
      loadReport();
    }
  }, [id]);

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
            <div className="empty-state">暂无匹配数据</div>
          </div>
        )}
      </div>
    </div>
  );
}
