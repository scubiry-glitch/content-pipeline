import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hotTopicsApi, rssSourcesApi, type HotTopic, type RSSSource } from '../api/client';
import './HotTopics.css';

type HotTopicsTab = 'topics' | 'insights' | 'stats' | 'sources';

export function HotTopics() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HotTopicsTab>('topics');
  const [filter, setFilter] = useState<'all' | 'up' | 'stable' | 'down'>('all');

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

  const handleFollow = async (topicId: string, isFollowed: boolean) => {
    try {
      if (isFollowed) {
        await hotTopicsApi.unfollow(topicId);
      } else {
        await hotTopicsApi.follow(topicId);
      }
      // Update local state
      setTopics(prev => prev.map(t =>
        t.id === topicId ? { ...t, isFollowed: !isFollowed } : t
      ));
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
    }
  };

  const filteredTopics = topics.filter((t) =>
    filter === 'all' ? true : t.trend === filter
  );

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return '#52c41a';
      case 'negative':
        return '#ff4d4f';
      default:
        return '#faad14';
    }
  };

  const getHotScoreWidth = (score: number) => {
    return `${Math.min(score, 100)}%`;
  };

  return (
    <div className="hot-topics">
      <div className="page-header">
        <h1>🔥 热点追踪</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleTriggerCrawl}>
            🔄 立即抓取
          </button>
          <button className="btn btn-secondary" onClick={fetchData}>
            🔄 刷新
          </button>
        </div>
      </div>

      {/* Tab导航 */}
      <div className="hot-topics-tabs">
        <button
          className={`tab-btn ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => setActiveTab('topics')}
        >
          <span className="tab-icon">🔥</span>
          <span className="tab-label">热点列表</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => navigate('/hot-topics/insights')}
        >
          <span className="tab-icon">👨‍💼</span>
          <span className="tab-label">专家解读</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">趋势统计</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
          onClick={() => setActiveTab('sources')}
        >
          <span className="tab-icon">📡</span>
          <span className="tab-label">RSS源管理</span>
        </button>
      </div>

      {activeTab === 'topics' && (
        <>
          <div className="filter-bar">
            <span>趋势筛选:</span>
            {(['all', 'up', 'stable', 'down'] as const).map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' && '全部'}
                {f === 'up' && '📈 上升'}
                {f === 'stable' && '➡️ 稳定'}
                {f === 'down' && '📉 下降'}
              </button>
            ))}
          </div>

          <div className="topics-stats">
            <div className="stat-item">
              <span className="stat-value">{topics.length}</span>
              <span className="stat-label">总热点</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">
                {topics.filter((t) => t.trend === 'up').length}
              </span>
              <span className="stat-label">上升中</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">
                {topics.filter((t) => t.sentiment === 'positive').length}
              </span>
              <span className="stat-label">正面</span>
            </div>
          </div>

          {loading ? (
            <div className="loading">加载中...</div>
          ) : filteredTopics.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">暂无热点数据</div>
              <p>点击"立即抓取"获取最新热点</p>
            </div>
          ) : (
            <div className="topics-list">
              {filteredTopics.map((topic) => (
                <div key={topic.id} className="topic-card" onClick={() => navigate(`/hot-topics/${topic.id}`)} style={{ cursor: 'pointer' }}>
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
                      >
                        查看原文 ↗
                      </a>
                    )}
                    <button
                      className={`btn ${topic.isFollowed ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFollow(topic.id, topic.isFollowed);
                      }}
                    >
                      {topic.isFollowed ? '⭐ 已关注' : '☆ 关注'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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
            <div className="sources-list">
              {sources.map((source) => (
                <div key={source.id} className="source-card">
                  <div className="source-info">
                    <h4 className="source-name">{source.name}</h4>
                    <span className="source-category">{source.category || '未分类'}</span>
                    <span
                      className={`source-status ${source.isActive ? 'active' : 'inactive'}`}
                    >
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
    </div>
  );
}
