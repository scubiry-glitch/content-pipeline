// 智能推荐面板 - Recommendation Panel
import { useState, useEffect } from 'react';

interface RecommendedItem {
  id: string;
  title: string;
  category: string;
  score: number;
  reason: string;
  hotScore: number;
  trend?: 'up' | 'down' | 'stable';
}

interface RecommendationPanelProps {
  recommendations?: RecommendedItem[];
  onItemClick?: (item: RecommendedItem) => void;
  onRefresh?: () => void;
}

export function RecommendationPanel({
  recommendations = [],
  onItemClick,
  onRefresh,
}: RecommendationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 模拟加载推荐数据
  const handleRefresh = async () => {
    setLoading(true);
    // 模拟API调用延迟
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLoading(false);
    onRefresh?.();
  };

  // 初始加载
  useEffect(() => {
    if (recommendations.length === 0) {
      handleRefresh();
    }
  }, []);

  const categories = ['all', 'tech', 'finance', 'policy', 'industry'];

  const filteredRecommendations =
    selectedCategory === 'all'
      ? recommendations
      : recommendations.filter((item) => item.category === selectedCategory);

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      all: '全部',
      tech: '科技',
      finance: '金融',
      policy: '政策',
      industry: '产业',
    };
    return labels[cat] || cat;
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#10b981';
    if (score >= 70) return '#3b82f6';
    if (score >= 50) return '#f59e0b';
    return '#6b7280';
  };

  return (
    <div className="recommendation-panel">
      {/* 头部 */}
      <div className="recommendation-header">
        <div className="header-title">
          <span className="title-icon">💡</span>
          <h3>智能推荐</h3>
          <span className="subtitle">基于您的阅读偏好</span>
        </div>
        <button
          className="btn-refresh"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? '🔄' : '↻'} 刷新
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="category-filter">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* 推荐列表 */}
      <div className="recommendation-list">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>正在分析您的兴趣...</p>
          </div>
        ) : filteredRecommendations.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📊</span>
            <p>暂无推荐内容</p>
            <span className="empty-hint">多阅读一些话题，我们会为您推荐相关内容</span>
          </div>
        ) : (
          filteredRecommendations.map((item, index) => (
            <div
              key={item.id}
              className="recommendation-item"
              onClick={() => onItemClick?.(item)}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="item-rank">{index + 1}</div>
              <div className="item-content">
                <div className="item-title-row">
                  <h4 className="item-title">{item.title}</h4>
                  <span
                    className="item-score"
                    style={{ color: getScoreColor(item.score) }}
                  >
                    {item.score}分
                  </span>
                </div>
                <p className="item-reason">{item.reason}</p>
                <div className="item-meta">
                  <span className="item-category">
                    {getCategoryLabel(item.category)}
                  </span>
                  <span className="item-hot">
                    🔥 {item.hotScore.toFixed(1)}
                  </span>
                  {item.trend && (
                    <span className="item-trend">{getTrendIcon(item.trend)}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 推荐说明 */}
      <div className="recommendation-footer">
        <span className="footer-icon">🤖</span>
        <span className="footer-text">
          推荐算法基于您的阅读历史、收藏偏好和热门趋势综合计算
        </span>
      </div>
    </div>
  );
}
