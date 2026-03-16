import { useState, useEffect, useCallback } from 'react';
import { reportsApi } from '../api/client';
import type { Report, ReportMatch } from '../types';
import './Reports.css';

export function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [matches, setMatches] = useState<ReportMatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportsApi.getAll({ limit: 50 });
      setReports(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await reportsApi.upload(file);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleParse = async (id: string) => {
    try {
      await reportsApi.parse(id);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败');
    }
  };

  const handleGetMatches = async (report: Report) => {
    setSelectedReport(report);
    try {
      const response = await reportsApi.getMatches(report.id);
      setMatches(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取关联失败');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await loadReports();
      return;
    }
    try {
      const response = await reportsApi.search(searchQuery);
      setReports(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    }
  };

  const getStatusLabel = (status: Report['status']) => {
    const labels: Record<string, string> = {
      pending: '待解析',
      parsed: '已解析',
      matched: '已关联',
      completed: '已完成',
    };
    return labels[status] || status;
  };

  const getStatusClass = (status: Report['status']) => {
    const classes: Record<string, string> = {
      pending: 'status-pending',
      parsed: 'status-parsed',
      matched: 'status-matched',
      completed: 'status-completed',
    };
    return classes[status] || '';
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  return (
    <div className="reports-page">
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-title">📊 研报管理 (v3.3)</h1>
          <p className="page-subtitle">研报自动关联系统 - 解析、标签提取、智能匹配</p>
        </div>
        <div className="header-actions">
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索研报..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn btn-secondary" onClick={handleSearch}>
              🔍
            </button>
          </div>

          <label className="btn btn-primary upload-btn">
            <span>{uploading ? '⏳ 上传中...' : '+ 上传研报'}</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              disabled={uploading}
              hidden
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <span>加载研报列表...⏳</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <div className="empty-title">暂无研报</div>
            <p>上传PDF或Word格式的研报，系统将自动解析并关联相关内容</p>
            <div className="empty-features">
              <div className="feature-item">
                <span className="feature-icon">🔍</span>
                <span>自动解析PDF内容</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🏷️</span>
                <span>智能标签提取</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🔗</span>
                <span>关联RSS热点</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">📊</span>
                <span>质量评估打分</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="reports-layout">
          <div className="reports-list">
            {reports.map((report) => (
              <div
                key={report.id}
                className={`report-card ${selectedReport?.id === report.id ? 'selected' : ''}`}
                onClick={() => handleGetMatches(report)}
              >
                <div className="report-header">
                  <h3 className="report-title">{report.title || '未命名研报'}</h3>
                  <span className={`report-status ${getStatusClass(report.status)}`}>
                    {getStatusLabel(report.status)}
                  </span>
                </div>

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

                <div className="report-footer">
                  <div className="quality-score" style={{ color: getQualityColor(report.qualityScore) }}>
                    <span className="score-label">质量分</span>
                    <span className="score-value">{report.qualityScore || '--'}</span>
                  </div>

                  <div className="report-actions">
                    {report.status === 'pending' && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleParse(report.id);
                        }}
                      >
                        🔍 解析
                      </button>
                    )}
                    {report.status !== 'pending' && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGetMatches(report);
                        }}
                      >
                        🔗 关联
                      </button>
                    )}
                  </div>
                </div>

                {report.keyPoints?.length > 0 && (
                  <div className="report-keypoints">
                    <div className="keypoints-title">💡 核心观点</div>
                    <ul>
                      {report.keyPoints.slice(0, 3).map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedReport && matches.length > 0 && (
            <div className="matches-panel">
              <div className="matches-header">
                <h3>🔗 智能关联推荐</h3>
                <span className="matches-count">{matches.length}个匹配</span>
              </div>

              <div className="matches-list">
                {matches.map((match) => (
                  <div key={match.id} className="match-item">
                    <div className="match-type">
                      {match.matchType === 'rss' && '📰 RSS'}
                      {match.matchType === 'asset' && '📚 素材'}
                      {match.matchType === 'topic' && '🔥 热点'}
                    </div>

                    <div className="match-content">
                      <div className="match-title">{match.matchedItem?.title || '未知内容'}</div>
                      <div className="match-reason">{match.matchReason}</div>

                      {match.matchedItem?.source && (
                        <div className="match-source">来源: {match.matchedItem.source}</div>
                      )}
                    </div>

                    <div className="match-score">
                      <div
                        className="score-bar"
                        style={{
                          background: `conic-gradient(#667eea ${match.matchScore * 3.6}deg, #e8e8e8 0deg)`,
                        }}
                      >
                        <span>{Math.round(match.matchScore)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
