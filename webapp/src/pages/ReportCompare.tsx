import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { reportsApi } from '../api/client';
import type { Report } from '../types';
import './ReportCompare.css';

// 研报中心Tab导航
function ReportsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: 'list', label: '研报列表', icon: '📄', path: '/reports' },
    { id: 'compare', label: '研报对比', icon: '⚖️', path: '/reports/compare' },
  ];
  
  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || 'compare';
  
  return (
    <div className="reports-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ReportCompare() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reportIds = searchParams.get('ids')?.split(',') || [];

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    if (reportIds.length < 2) {
      setError('请至少选择2篇研报进行对比');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const allReports = await Promise.all(
        reportIds.map(id => reportsApi.getById(id))
      );
      setReports(allReports);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载研报失败');
    } finally {
      setLoading(false);
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const getRatingColor = (rating: string) => {
    const colors: Record<string, string> = {
      '买入': '#52c41a',
      '增持': '#52c41a',
      '中性': '#faad14',
      '减持': '#ff4d4f',
      '卖出': '#ff4d4f',
    };
    return colors[rating] || '#666';
  };

  if (loading) {
    return (
      <div className="report-compare-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <span>加载研报数据...⏳</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-compare-page">
        <div className="error-card">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button className="btn btn-primary" onClick={() => navigate('/reports')}>
            返回研报列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="report-compare-page">
      {/* Tab导航 */}
      <ReportsTabs />
      <div className="page-header">
        <div className="header-left">
          <h1 className="page-title">📊 研报对比</h1>
          <p className="page-subtitle">对比{reports.length}篇研报的关键信息</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/reports')}>
          ← 返回列表
        </button>
      </div>

      <div className="compare-table-container">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="compare-label">对比维度</th>
              {reports.map(report => (
                <th key={report.id} className="report-column">
                  <div className="report-header-cell">
                    <div className="report-title">{report.title || '未命名研报'}</div>
                    <div className="report-institution">{report.institution}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="compare-label">🏢 机构</td>
              {reports.map(report => (
                <td key={report.id}>{report.institution || '-'}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">👤 作者</td>
              {reports.map(report => (
                <td key={report.id}>{report.authors?.join(', ') || '-'}</td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">📅 发布日期</td>
              {reports.map(report => (
                <td key={report.id}>
                  {report.publishDate ? new Date(report.publishDate).toLocaleDateString() : '-'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">📄 页数</td>
              {reports.map(report => (
                <td key={report.id}>{report.pageCount || '-'}页</td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">📊 评级</td>
              {reports.map(report => (
                <td key={report.id}>
                  {report.rating ? (
                    <span
                      className="rating-badge"
                      style={{ background: getRatingColor(report.rating) }}
                    >
                      {report.rating}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">🎯 目标价</td>
              {reports.map(report => (
                <td key={report.id}>
                  {report.targetPrice ? (
                    <span className="target-price">¥{report.targetPrice}</span>
                  ) : (
                    '-'
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">⭐ 质量评分</td>
              {reports.map(report => (
                <td key={report.id}>
                  <span
                    className="quality-score"
                    style={{ color: getQualityColor(report.qualityScore) }}
                  >
                    {report.qualityScore || '--'}
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">🏷️ 标签</td>
              {reports.map(report => (
                <td key={report.id}>
                  <div className="tags-cell">
                    {report.tags?.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    )) || '-'}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">💡 核心观点</td>
              {reports.map(report => (
                <td key={report.id}>
                  <div className="keypoints-cell">
                    {report.keyPoints?.length > 0 ? (
                      <ul>
                        {report.keyPoints.map((point, idx) => (
                          <li key={idx}>{point}</li>
                        ))}
                      </ul>
                    ) : (
                      '-'
                    )}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">⚠️ 风险提示</td>
              {reports.map(report => (
                <td key={report.id}>
                  <div className="risks-cell">
                    {report.riskFactors?.length > 0 ? (
                      <ul>
                        {report.riskFactors.map((risk, idx) => (
                          <li key={idx}>{risk}</li>
                        ))}
                      </ul>
                    ) : (
                      '-'
                    )}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="compare-label">📝 摘要</td>
              {reports.map(report => (
                <td key={report.id}>
                  <div className="summary-cell">
                    {report.summary || '-'}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 观点冲突检测 */}
      {reports.length >= 2 && (
        <div className="conflict-analysis">
          <h3>🔍 观点差异分析</h3>
          <div className="conflict-list">
            {reports.map((report, idx) => {
              const nextReport = reports[(idx + 1) % reports.length];
              const hasConflict = report.rating && nextReport.rating &&
                ((report.rating.includes('买入') && nextReport.rating.includes('卖出')) ||
                 (report.rating.includes('卖出') && nextReport.rating.includes('买入')));

              if (!hasConflict) return null;

              return (
                <div key={report.id} className="conflict-item">
                  <div className="conflict-header">
                    <span className="conflict-badge">观点冲突</span>
                  </div>
                  <div className="conflict-content">
                    <div className="conflict-side">
                      <strong>{report.institution}</strong>:
                      <span style={{ color: getRatingColor(report.rating || '') }}>
                        {report.rating}
                      </span>
                    </div>
                    <div className="conflict-vs">VS</div>
                    <div className="conflict-side">
                      <strong>{nextReport.institution}</strong>:
                      <span style={{ color: getRatingColor(nextReport.rating || '') }}>
                        {nextReport.rating}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
