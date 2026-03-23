// v2.2 情感分析面板 - Sentiment Dashboard
// SA-001 ~ SA-005: 情感分析增强前端界面

import { useState, useEffect } from 'react';
import { sentimentApi, type MSIResult, type SentimentAlert, type SentimentTrend } from '../api/sentiment';
import './SentimentDashboard.css';

export function SentimentDashboard() {
  const [msi, setMsi] = useState<MSIResult | null>(null);
  const [alerts, setAlerts] = useState<SentimentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'analyzer'>('overview');
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [msiData, alertsData] = await Promise.all([
        sentimentApi.getMSI(),
        sentimentApi.getAlerts()
      ]);
      setMsi(msiData.data);
      setAlerts(alertsData.data || []);
    } catch (error) {
      console.error('加载情感数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeText.trim()) return;
    try {
      setAnalyzing(true);
      const result = await sentimentApi.analyze(analyzeText);
      setAnalyzeResult(result.data);
    } catch (error) {
      console.error('分析失败:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const getMSILevelColor = (level: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      extreme_fear: { bg: '#C75B5B', text: 'white' },
      fear: { bg: '#D4A574', text: 'white' },
      neutral: { bg: '#6B9FB8', text: 'white' },
      greed: { bg: '#7A9E6B', text: 'white' },
      extreme_greed: { bg: '#C75B5B', text: 'white' }
    };
    return colors[level] || colors.neutral;
  };

  const getMSILevelText = (level: string) => {
    const texts: Record<string, string> = {
      extreme_fear: '极度恐惧',
      fear: '恐惧',
      neutral: '中性',
      greed: '贪婪',
      extreme_greed: '极度贪婪'
    };
    return texts[level] || level;
  };

  const getAlertIcon = (type: string) => {
    const icons: Record<string, string> = {
      extreme_positive: '🚀',
      extreme_negative: '⚠️',
      sudden_change: '📈'
    };
    return icons[type] || 'ℹ️';
  };

  if (loading) {
    return (
      <div className="sentiment-dashboard">
        <div className="loading">
          <span className="loading-spinner"></span>
          加载情感分析数据...
        </div>
      </div>
    );
  }

  return (
    <div className="sentiment-dashboard">
      {/* 头部 */}
      <div className="dashboard-header">
        <h1 className="page-title">📊 情感分析中心</h1>
        <p className="page-subtitle">实时监控市场情绪，识别投资风险与机遇</p>
      </div>

      {/* 标签切换 */}
      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📈 市场概览
        </button>
        <button
          className={`tab-btn ${activeTab === 'analyzer' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyzer')}
        >
          🔍 文本分析
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* MSI 市场情绪指数 */}
          {msi && (
            <div className="msi-section">
              <h2 className="section-title">市场情绪指数 (MSI)</h2>
              <div className="msi-card">
                <div
                  className="msi-gauge"
                  style={{
                    background: `conic-gradient(
                      ${getMSILevelColor(msi.level).bg} ${msi.value * 3.6}deg,
                      var(--cream-dark) ${msi.value * 3.6}deg
                    )`
                  }}
                >
                  <div className="gauge-inner">
                    <span className="msi-value">{msi.value}</span>
                    <span
                      className="msi-level"
                      style={{ color: getMSILevelColor(msi.level).bg }}
                    >
                      {getMSILevelText(msi.level)}
                    </span>
                  </div>
                </div>

                <div className="msi-details">
                  <div className="msi-changes">
                    <div className={`change-item ${msi.change24h >= 0 ? 'up' : 'down'}`}>
                      <span className="change-label">24小时</span>
                      <span className="change-value">
                        {msi.change24h >= 0 ? '+' : ''}{msi.change24h}
                      </span>
                    </div>
                    <div className={`change-item ${msi.change7d >= 0 ? 'up' : 'down'}`}>
                      <span className="change-label">7天</span>
                      <span className="change-value">
                        {msi.change7d >= 0 ? '+' : ''}{msi.change7d}
                      </span>
                    </div>
                  </div>

                  <div className="msi-components">
                    <h4>指数构成</h4>
                    <div className="component-bars">
                      <div className="component-bar">
                        <span className="comp-label">新闻情感</span>
                        <div className="comp-progress">
                          <div
                            className="comp-fill"
                            style={{ width: `${msi.components.newsSentiment}%` }}
                          ></div>
                        </div>
                        <span className="comp-value">{msi.components.newsSentiment}</span>
                      </div>
                      <div className="component-bar">
                        <span className="comp-label">社交媒体</span>
                        <div className="comp-progress">
                          <div
                            className="comp-fill"
                            style={{ width: `${msi.components.socialSentiment}%` }}
                          ></div>
                        </div>
                        <span className="comp-value">{msi.components.socialSentiment}</span>
                      </div>
                      <div className="component-bar">
                        <span className="comp-label">专家观点</span>
                        <div className="comp-progress">
                          <div
                            className="comp-fill"
                            style={{ width: `${msi.components.expertSentiment}%` }}
                          ></div>
                        </div>
                        <span className="comp-value">{msi.components.expertSentiment}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 预警列表 */}
          <div className="alerts-section">
            <h2 className="section-title">⚠️ 情感异常预警</h2>
            {alerts.length > 0 ? (
              <div className="alerts-grid">
                {alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`alert-card severity-${alert.severity}`}
                  >
                    <div className="alert-icon">{getAlertIcon(alert.alertType)}</div>
                    <div className="alert-content">
                      <h4 className="alert-topic">{alert.topicTitle}</h4>
                      <p className="alert-message">{alert.message}</p>
                      <span className={`alert-type type-${alert.alertType}`}>
                        {alert.alertType === 'extreme_positive' ? '极度乐观' :
                         alert.alertType === 'extreme_negative' ? '极度悲观' : ' sudden_change'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-alerts">
                <span className="empty-icon">✅</span>
                <p>暂无异常预警，市场情绪平稳</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'analyzer' && (
        <div className="analyzer-section">
          <h2 className="section-title">文本情感分析</h2>
          <div className="analyzer-card">
            <textarea
              className="analyze-input"
              placeholder="输入要分析的文本，例如：公司业绩增长强劲，市场前景乐观..."
              value={analyzeText}
              onChange={(e) => setAnalyzeText(e.target.value)}
              rows={6}
            />
            <button
              className="btn btn-primary analyze-btn"
              onClick={handleAnalyze}
              disabled={analyzing || !analyzeText.trim()}
            >
              {analyzing ? '分析中...' : '🔍 分析情感'}
            </button>

            {analyzeResult && (
              <div className="analyze-result">
                <h3 className="result-title">分析结果</h3>
                <div className="result-grid">
                  <div className="result-item">
                    <span className="result-label">情感极性</span>
                    <span className={`result-value polarity-${analyzeResult.polarity}`}>
                      {analyzeResult.polarity === 'positive' ? '😊 正面' :
                       analyzeResult.polarity === 'negative' ? '😔 负面' : '😐 中性'}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">情感强度</span>
                    <div className="intensity-bar">
                      <div
                        className="intensity-fill"
                        style={{ width: `${analyzeResult.intensity}%` }}
                      ></div>
                      <span className="intensity-value">{analyzeResult.intensity}%</span>
                    </div>
                  </div>
                  <div className="result-item">
                    <span className="result-label">置信度</span>
                    <span className="result-value">{(analyzeResult.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {analyzeResult.keywords?.length > 0 && (
                  <div className="keywords-section">
                    <span className="keywords-label">关键词：</span>
                    <div className="keywords-list">
                      {analyzeResult.keywords.map((kw: string, idx: number) => (
                        <span key={idx} className="keyword-tag">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
