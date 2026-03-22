import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { hotTopicsApi, rssSourcesApi, type HotTopic, type RSSSource } from '../api/client';
import './HotTopics.css';

type HotTopicsTab = 'topics' | 'insights' | 'stats' | 'sources';

// 二级导航配置
const TABS = [
  { id: 'topics', label: '🔥 热点列表', icon: '🔥', description: '查看当前热门话题' },
  { id: 'insights', label: '👨‍💼 专家解读', icon: '👨‍💼', description: '专家观点与解读' },
  { id: 'stats', label: '📊 趋势统计', icon: '📊', description: '数据分析与统计' },
  { id: 'sources', label: '📡 RSS源管理', icon: '📡', description: '管理数据源' },
];

// 趋势筛选器
const TREND_FILTERS = [
  { key: 'all', label: '全部热点' },
  { key: 'up', label: '📈 上升' },
  { key: 'stable', label: '➡️ 稳定' },
  { key: 'down', label: '📉 下降' },
];

// Tab导航组件
function HotTopicsTabs({ activeTab, onTabChange }: { activeTab: HotTopicsTab; onTabChange: (tab: HotTopicsTab) => void }) {
  const navigate = useNavigate();
  
  const handleTabClick = (tabId: HotTopicsTab) => {
    if (tabId === 'insights') {
      navigate('/hot-topics/insights');
    } else {
      onTabChange(tabId);
    }
  };

  return (
    <div className="hot-topics-tabs">
      <div className="tabs-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id as HotTopicsTab)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {activeTab === tab.id && (
              <span className="tab-description">{tab.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HotTopics() {
  const navigate = useNavigate();
  const location = useLocation();
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HotTopicsTab>('topics');
  const [activeFilter, setActiveFilter] = useState<'all' | 'up' | 'stable' | 'down'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [topicsRes, sourcesRes] = await Promise.all([
        hotTopicsApi.getAll({ limit: 50 }),
        rssSourcesApi.getAll(),
      ]);
      setTopics(topicsRes.items || []);
      setSources(sourcesRes.items || []);
    } catch (error) {
      console.error('Failed to fetch hot topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCrawl = async () => {
    try {
      await rssSourcesApi.triggerCrawl();
      alert('RSS抓取已触发');
      fetchData();
    } catch (error) {
      console.error('Failed to trigger crawl:', error);
    }
  };

  const handleFollow = async (topicId: string, isFollowed: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isFollowed) {
        await hotTopicsApi.unfollow(topicId);
      } else {
        await hotTopicsApi.follow(topicId);
      }
      setTopics(prev => prev.map(t =>
        t.id === topicId ? { ...t, isFollowed: !isFollowed } : t
      ));
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
    }
  };

  const filteredTopics = topics.filter((t) =>
    activeFilter === 'all' ? true : t.trend === activeFilter
  );

  const getFilterCount = (key: string) => {
    if (key === 'all') return topics.length;
    return topics.filter(t => t.trend === key).length;
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '#52c41a';
      case 'negative': return '#ff4d4f';
      default: return '#faad14';
    }
  };

  const getHotScoreWidth = (score: number) => {
    return `${Math.min(score, 100)}%`;
  };

  // 统计
  const stats = {
    total: topics.length,
    up: topics.filter(t => t.trend === 'up').length,
    positive: topics.filter(t => t.sentiment === 'positive').length,
  };

  return (
    <div className="hot-topics-layout">
      {/* 左侧边栏 */}
      <aside className="hot-topics-sidebar">
        {/* 立即抓取按钮 */}
        <button className="btn btn-primary btn-crawl" onClick={handleTriggerCrawl}>
          <span>🔄</span>
          <span>立即抓取</span>
        </button>

        {/* 趋势筛选器 */}
        <div className="sidebar-filters">
          <div className="nav-section-title">趋势筛选</div>
          <ul className="filter-list">
            {TREND_FILTERS.map((filter) => (
              <li key={filter.key}>
                <button
                  className={`filter-item ${activeFilter === filter.key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter.key as any)}
                >
                  <span className="filter-label">{filter.label}</span>
                  <span className="filter-count">{getFilterCount(filter.key)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 统计概览 */}
        <div className="sidebar-stats">
          <div className="nav-section-title">数据概览</div>
          <div className="stats-grid-mini">
            <div className="stat-mini">
              <span className="stat-mini-value">{stats.total}</span>
              <span className="stat-mini-label">总热点</span>
            </div>
            <div className="stat-mini">
              <span className="stat-mini-value up">{stats.up}</span>
              <span className="stat-mini-label">上升中</span>
            </div>
            <div className="stat-mini">
              <span className="stat-mini-value positive">{stats.positive}</span>
              <span className="stat-mini-label">正面</span>
            </div>
          </div>
        </div>

        {/* 刷新按钮 */}
        <div className="sidebar-footer">
          <button className="btn btn-secondary btn-refresh" onClick={fetchData}>
            🔄 刷新数据
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="hot-topics-main">
        {/* 页面头部 */}
        <header className="hot-topics-header">
          <div className="header-title">
            <h1>🔥 热点追踪</h1>
            <span className="topic-count">
              共 {filteredTopics.length} 个热点
              {activeFilter !== 'all' && (
                <span className="filter-tag">
                  {TREND_FILTERS.find(f => f.key === activeFilter)?.label}
                </span>
              )}
            </span>
          </div>
        </header>

        {/* 二级导航 */}
        <HotTopicsTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* 内容区域 */}
        {activeTab === 'topics' && (
          <div className="topics-content">
            {loading ? (
              <div className="loading">加载中...</div>
            ) : filteredTopics.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <div className="empty-title">暂无热点数据</div>
                <p>点击左侧"立即抓取"获取最新热点</p>
              </div>
            ) : (
              <div className="topics-grid">
                {filteredTopics.map((topic) => (
                  <div 
                    key={topic.id} 
                    className="topic-card" 
                    onClick={() => navigate(`/hot-topics/${topic.id}`)}
                  >
                    <div className="topic-header">
                      <h3 className="topic-title">{topic.title}</h3>
                      <span className={`trend-badge ${topic.trend}`}>
                        {getTrendIcon(topic.trend)}
                      </span>
                    </div>

                    <div className="topic-meta">
                      <span className="source">来源: {topic.source}</span>
                      <span className="time">
                        {topic.publishedAt
                          ? new Date(topic.publishedAt).toLocaleString()
                          : new Date(topic.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="hot-score">
                      <div className="score-label">
                        <span>热度</span>
                        <span className="score-value">{topic.hotScore}</span>
                      </div>
                      <div className="score-bar">
                        <div
                          className="score-fill"
                          style={{
                            width: getHotScoreWidth(topic.hotScore),
                            background:
                              topic.hotScore >= 80
                                ? '#ff4d4f'
                                : topic.hotScore >= 60
                                ? '#faad14'
                                : '#52c41a',
                          }}
                        />
                      </div>
                    </div>

                    <div className="topic-sentiment">
                      <span
                        className="sentiment-dot"
                        style={{ background: getSentimentColor(topic.sentiment) }}
                      />
                      <span className="sentiment-text">
                        {topic.sentiment === 'positive'
                          ? '正面'
                          : topic.sentiment === 'negative'
                          ? '负面'
                          : '中性'}
                      </span>
                    </div>

                    <div className="topic-actions">
                      {topic.sourceUrl && (
                        <a
                          href={topic.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          查看原文 ↗
                        </a>
                      )}
                      <button
                        className={`btn ${topic.isFollowed ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={(e) => handleFollow(topic.id, !!topic.isFollowed, e)}
                      >
                        {topic.isFollowed ? '⭐ 已关注' : '☆ 关注'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="stats-section">
            <div className="stats-grid">
              {/* 情感分布饼图 */}
              <div className="stat-card">
                <h3>😊 情感分布</h3>
                <div className="sentiment-chart">
                  {(() => {
                    const sentimentCounts = topics.reduce((acc, t) => {
                      acc[t.sentiment] = (acc[t.sentiment] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);
                    const total = topics.length || 1;
                    const positive = sentimentCounts['positive'] || 0;
                    const negative = sentimentCounts['negative'] || 0;
                    const neutral = sentimentCounts['neutral'] || 0;
                    return (
                      <div className="pie-chart">
                        <svg viewBox="0 0 100 100" className="pie-svg">
                          <circle cx="50" cy="50" r="40" fill="transparent" stroke="#e5e7eb" strokeWidth="20" />
                          <circle
                            cx="50" cy="50" r="40" fill="transparent"
                            stroke="#52c41a" strokeWidth="20"
                            strokeDasharray={`${(positive / total) * 251.2} 251.2`}
                            strokeDashoffset="0"
                            transform="rotate(-90 50 50)"
                          />
                          <circle
                            cx="50" cy="50" r="40" fill="transparent"
                            stroke="#ff4d4f" strokeWidth="20"
                            strokeDasharray={`${(negative / total) * 251.2} 251.2`}
                            strokeDashoffset={`-${(positive / total) * 251.2}`}
                            transform="rotate(-90 50 50)"
                          />
                          <circle
                            cx="50" cy="50" r="40" fill="transparent"
                            stroke="#faad14" strokeWidth="20"
                            strokeDasharray={`${(neutral / total) * 251.2} 251.2`}
                            strokeDashoffset={`-${((positive + negative) / total) * 251.2}`}
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="pie-legend">
                          <span style={{ color: '#52c41a' }}>🟢 正面 {positive}</span>
                          <span style={{ color: '#ff4d4f' }}>🔴 负面 {negative}</span>
                          <span style={{ color: '#faad14' }}>🟡 中性 {neutral}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 趋势分布 */}
              <div className="stat-card">
                <h3>📈 趋势分布</h3>
                <div className="trend-chart">
                  {(() => {
                    const trendCounts = topics.reduce((acc, t) => {
                      acc[t.trend] = (acc[t.trend] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);
                    const max = Math.max(...Object.values(trendCounts), 1);
                    return (
                      <div className="bar-chart">
                        {[
                          { key: 'up', label: '📈 上升', color: '#52c41a' },
                          { key: 'stable', label: '➡️ 稳定', color: '#faad14' },
                          { key: 'down', label: '📉 下降', color: '#ff4d4f' }
                        ].map(({ key, label, color }) => (
                          <div key={key} className="bar-item">
                            <span className="bar-label">{label}</span>
                            <div className="bar-wrapper">
                              <div
                                className="bar-fill"
                                style={{
                                  width: `${((trendCounts[key] || 0) / max) * 100}%`,
                                  background: color
                                }}
                              />
                            </div>
                            <span className="bar-value">{trendCounts[key] || 0}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 热度排行 */}
              <div className="stat-card full-width">
                <h3>🔥 热度排行 TOP5</h3>
                <div className="hot-ranking">
                  {topics
                    .sort((a, b) => b.hotScore - a.hotScore)
                    .slice(0, 5)
                    .map((topic, idx) => (
                      <div key={topic.id} className="rank-item" onClick={() => navigate(`/hot-topics/${topic.id}`)}>
                        <span className="rank-number">{idx + 1}</span>
                        <span className="rank-title">{topic.title}</span>
                        <div className="rank-bar">
                          <div
                            className="rank-fill"
                            style={{
                              width: `${(topic.hotScore / 100) * 100}%`,
                              background: topic.hotScore >= 80 ? '#ff4d4f' : topic.hotScore >= 60 ? '#faad14' : '#52c41a'
                            }}
                          />
                        </div>
                        <span className="rank-score">{topic.hotScore}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="sources-section">
            <div className="sources-header">
              <h2>RSS源列表</h2>
              <span className="source-count">共 {sources.length} 个源</span>
            </div>

            {sources.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📡</div>
                <div className="empty-title">暂无RSS源</div>
              </div>
            ) : (
              <div className="sources-grid">
                {sources.map((source) => (
                  <div key={source.id} className="source-card">
                    <div className="source-info">
                      <h4 className="source-name">{source.name}</h4>
                      <span className="source-category">{source.category || '未分类'}</span>
                      <span className={`source-status ${source.isActive ? 'active' : 'inactive'}`}>
                        {source.isActive ? '● 启用' : '○ 停用'}
                      </span>
                    </div>
                    <div className="source-url">{source.url}</div>
                    {source.lastCrawledAt && (
                      <div className="source-last-crawl">
                        上次抓取: {new Date(source.lastCrawledAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
