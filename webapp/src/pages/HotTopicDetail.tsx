import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { hotTopicsApi, type HotTopic } from '../api/client';
import './HotTopicDetail.css';

export function HotTopicDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<HotTopic | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    if (id) {
      loadTopicDetail();
    }
  }, [id]);

  const loadTopicDetail = async () => {
    setLoading(true);
    try {
      const [topicRes, trendRes] = await Promise.all([
        hotTopicsApi.getById(id!),
        hotTopicsApi.getTrends(id!, 7),
      ]);
      setTopic(topicRes);
      setTrendData(trendRes.items || []);
    } catch (error) {
      console.error('Failed to load topic detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!topic) return;
    try {
      if (isFollowing) {
        await hotTopicsApi.unfollow(topic.id);
        setIsFollowing(false);
      } else {
        await hotTopicsApi.follow(topic.id);
        setIsFollowing(true);
      }
    } catch (error) {
      console.error('Follow action failed:', error);
    }
  };

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

  if (loading) {
    return <div className="hot-topic-detail loading">加载中...</div>;
  }

  if (!topic) {
    return <div className="hot-topic-detail empty">热点不存在</div>;
  }

  return (
    <div className="hot-topic-detail">
      <div className="detail-header">
        <button className="btn btn-link back-btn" onClick={() => navigate('/hot-topics')}>
          ← 返回热点列表
        </button>
      </div>

      <div className="topic-hero">
        <div className="topic-title-section">
          <h1>{topic.title}</h1>
          <div className="topic-badges">
            <span className={`trend-badge ${topic.trend}`}>
              {getTrendIcon(topic.trend)} {topic.trend === 'up' ? '上升' : topic.trend === 'down' ? '下降' : '稳定'}
            </span>
            <span
              className="sentiment-badge"
              style={{ background: getSentimentColor(topic.sentiment) }}
            >
              {topic.sentiment === 'positive' ? '😊 正面' : topic.sentiment === 'negative' ? '😔 负面' : '😐 中性'}
            </span>
          </div>
        </div>

        <div className="topic-actions">
          <button className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`} onClick={handleFollow}>
            {isFollowing ? '已关注' : '+ 关注'}
          </button>
          {topic.sourceUrl && (
            <a href={topic.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-link">
              查看原文 ↗
            </a>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="info-card">
            <h3>基本信息</h3>
            <div className="info-row">
              <span className="label">来源:</span>
              <span className="value">{topic.source}</span>
            </div>
            <div className="info-row">
              <span className="label">发布时间:</span>
              <span className="value">
                {topic.publishedAt ? new Date(topic.publishedAt).toLocaleString() : '未知'}
              </span>
            </div>
            <div className="info-row">
              <span className="label">热度分数:</span>
              <span className="value hot-score">{topic.hotScore}</span>
            </div>
          </div>

          <div className="trend-card">
            <h3>热度趋势 (7天)</h3>
            {trendData.length > 0 ? (
              <div className="trend-chart">
                <div className="chart-bars">
                  {trendData.map((item, idx) => (
                    <div key={idx} className="bar-item">
                      <div
                        className="bar"
                        style={{
                          height: `${(item.score / 100) * 200}px`,
                          background: item.score >= 80 ? '#ff4d4f' : item.score >= 60 ? '#faad14' : '#52c41a',
                        }}
                      />
                      <span className="bar-label">{item.date?.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-chart">暂无趋势数据</div>
            )}
          </div>
        </div>

        <div className="detail-sidebar">
          <div className="related-reports-card">
            <h3>关联研报</h3>
            <div className="empty-state">暂无关联研报</div>
          </div>

          <div className="related-topics-card">
            <h3>相关热点</h3>
            <div className="empty-state">暂无相关热点</div>
          </div>
        </div>
      </div>
    </div>
  );
}
