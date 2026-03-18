// 情感分析仪表盘 - 恢复原版 HTML 的 v3.2 功能
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sentimentApi, type SentimentAnalysis as SentimentType, type SentimentStats } from '../api/client';
import './SentimentAnalysis.css';

// 热点洞察Tab导航
function HotTopicsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: 'topics', label: '热点列表', icon: '🔥', path: '/hot-topics' },
    { id: 'insights', label: '专家解读', icon: '👨‍💼', path: '/hot-topics/insights' },
    { id: 'sentiment', label: '情感分析', icon: '😊', path: '/sentiment' },
    { id: 'prediction', label: '预测分析', icon: '🔮', path: '/prediction' },
  ];
  
  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || 'sentiment';
  
  return (
    <div className="hot-topics-tabs">
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

export function SentimentAnalysisPage() {
  const [sentiments, setSentiments] = useState<SentimentType[]>([]);
  const [stats, setStats] = useState<SentimentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sentimentsRes, statsRes] = await Promise.all([
        sentimentApi.getAll({ limit: 50 }),
        sentimentApi.getStats(),
      ]);
      setSentiments(sentimentsRes.items || []);
      setStats(statsRes);
    } catch (error) {
      console.error('Failed to fetch sentiment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSentiments = sentiments.filter((s) =>
    filter === 'all' ? true : s.polarity === filter
  );

  const getPolarityIcon = (polarity: string) => {
    switch (polarity) {
      case 'positive':
        return '😊';
      case 'negative':
        return '😔';
      default:
        return '😐';
    }
  };

  const getPolarityColor = (polarity: string) => {
    switch (polarity) {
      case 'positive':
        return '#22c55e';
      case 'negative':
        return '#ef4444';
      default:
        return '#f59e0b';
    }
  };

  const getMSIColor = (msi: number) => {
    if (msi >= 60) return '#22c55e';
    if (msi >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="sentiment-analysis">
      <div className="page-header">
        <h1>😊 情感分析 (v3.2)</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchData}>
            🔄 刷新
          </button>
        </div>
      </div>

      {/* MSI 市场情绪指数 */}
      {stats && (
        <div className="msi-dashboard">
          <div className="msi-card">
            <div className="msi-title">MSI 市场情绪指数</div>
            <div className="msi-value" style={{ color: getMSIColor(stats.msiIndex) }}>
              {stats.msiIndex.toFixed(1)}
            </div>
            <div className="msi-trend">
              趋势:
              <span className={`trend-${stats.trendDirection}`}>
                {stats.trendDirection === 'up' ? '📈 上升' : stats.trendDirection === 'down' ? '📉 下降' : '➡️ 稳定'}
              </span>
            </div>
          </div>

          <div className="sentiment-distribution">
            <div className="dist-item">
              <span className="dist-icon">😊</span>
              <span className="dist-label">正面</span>
              <span className="dist-value" style={{ color: '#22c55e' }}>
                {stats.positive} ({((stats.positive / stats.total) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="dist-item">
              <span className="dist-icon">😐</span>
              <span className="dist-label">中性</span>
              <span className="dist-value" style={{ color: '#f59e0b' }}>
                {stats.neutral} ({((stats.neutral / stats.total) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="dist-item">
              <span className="dist-icon">😔</span>
              <span className="dist-label">负面</span>
              <span className="dist-value" style={{ color: '#ef4444' }}>
                {stats.negative} ({((stats.negative / stats.total) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="filter-bar">
        <span>情感筛选:</span>
        {(['all', 'positive', 'neutral', 'negative'] as const).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && '全部'}
            {f === 'positive' && '😊 正面'}
            {f === 'neutral' && '😐 中性'}
            {f === 'negative' && '😔 负面'}
          </button>
        ))}
      </div>

      {/* 情感列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : filteredSentiments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">暂无情感分析数据</div>
          <p>系统正在分析内容情感倾向...</p>
        </div>
      ) : (
        <div className="sentiment-list">
          {filteredSentiments.map((item) => (
            <div key={item.id} className="sentiment-card">
              <div className="sentiment-header">
                <span className="sentiment-icon" style={{ background: getPolarityColor(item.polarity) }}>
                  {getPolarityIcon(item.polarity)}
                </span>
                <div className="sentiment-info">
                  <span className="sentiment-polarity">
                    {item.polarity === 'positive' ? '正面' : item.polarity === 'negative' ? '负面' : '中性'}
                  </span>
                  <span className="sentiment-source">来源: {item.sourceType}</span>
                </div>
                <div className="sentiment-confidence">
                  <span className="confidence-label">置信度</span>
                  <span className="confidence-value">{(item.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="sentiment-intensity">
                <span className="intensity-label">情感强度</span>
                <div className="intensity-bar">
                  <div
                    className="intensity-fill"
                    style={{
                      width: `${item.intensity}%`,
                      background: getPolarityColor(item.polarity),
                    }}
                  />
                </div>
                <span className="intensity-value">{item.intensity}%</span>
              </div>

              {item.keywords && item.keywords.length > 0 && (
                <div className="sentiment-keywords">
                  {item.keywords.map((keyword, i) => (
                    <span key={i} className="keyword-tag">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              <div className="sentiment-time">
                分析时间: {new Date(item.analyzedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
