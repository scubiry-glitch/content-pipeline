// RSS文章列表页面
import { useState, useEffect } from 'react';
import { rssSourcesApi, type RSSItem } from '../api/client';
import './RSSItems.css';

export function RSSItems() {
  const [items, setItems] = useState<RSSItem[]>([]);
  const [stats, setStats] = useState({
    totalItems: 0,
    todayItems: 0,
    totalSources: 0,
    activeSources: 0,
    avgRelevance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
  });

  useEffect(() => {
    loadItems();
    loadStats();
  }, [pagination.offset]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await rssSourcesApi.getItems({
        limit: pagination.limit,
        offset: pagination.offset,
      });
      setItems(data.items || []);
      setPagination((prev) => ({ ...prev, total: data.pagination?.total || 0 }));
    } catch (error) {
      console.error('加载RSS文章失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await rssSourcesApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('加载RSS统计失败:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return '#22c55e';
    if (score >= 0.4) return '#f59e0b';
    return '#6b7280';
  };

  return (
    <div className="rss-items-page">
      <div className="page-header">
        <h1>📰 RSS文章列表</h1>
        <button className="btn btn-primary" onClick={loadItems}>
          🔄 刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.totalItems}</div>
          <div className="stat-label">总文章数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.todayItems}</div>
          <div className="stat-label">今日新增</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalSources}</div>
          <div className="stat-label">RSS源数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.avgRelevance.toFixed(2)}</div>
          <div className="stat-label">平均相关度</div>
        </div>
      </div>

      {/* 文章列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">暂无RSS文章</div>
          <p>请前往 RSS源管理 页面触发抓取</p>
        </div>
      ) : (
        <>
          <div className="rss-items-list">
            {items.map((item) => (
              <div key={item.id} className="rss-item-card">
                <div className="rss-item-header">
                  <span
                    className="rss-item-source"
                    style={{ background: getSourceColor(item.source_name) }}
                  >
                    {item.source_name}
                  </span>
                  <span className="rss-item-date">{formatDate(item.published_at)}</span>
                </div>
                <h3 className="rss-item-title">
                  <a href={item.link} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h3>
                <p className="rss-item-summary">{item.summary}</p>
                <div className="rss-item-footer">
                  <div className="rss-item-tags">
                    {item.tags?.slice(0, 5).map((tag, idx) => (
                      <span key={idx} className="rss-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div
                    className="rss-item-score"
                    style={{ color: getScoreColor(item.relevance_score) }}
                  >
                    相关度: {(item.relevance_score * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          <div className="pagination">
            <button
              className="btn btn-secondary"
              disabled={pagination.offset === 0}
              onClick={() =>
                setPagination((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))
              }
            >
              上一页
            </button>
            <span className="pagination-info">
              第 {Math.floor(pagination.offset / pagination.limit) + 1} 页 / 共{' '}
              {Math.ceil(pagination.total / pagination.limit)} 页
            </span>
            <button
              className="btn btn-secondary"
              disabled={pagination.offset + pagination.limit >= pagination.total}
              onClick={() =>
                setPagination((prev) => ({ ...prev, offset: prev.offset + prev.limit }))
              }
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function getSourceColor(sourceName: string): string {
  const colors: Record<string, string> = {
    Slashdot: '#006666',
    'BBC Technology': '#bb1919',
    'The Verge': '#e2127a',
    'MIT Tech Review': '#000000',
    'Ars Technica': '#ff4e00',
    'Tech Review': '#ff6b6b',
    'Nature News': '#9c27b0',
    'GitHub Blog': '#24292e',
  };
  return colors[sourceName] || '#6366f1';
}
