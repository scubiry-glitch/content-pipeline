// PopularAssets.tsx
// v3.0.2: 热门素材Top10页面

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetUsageService, type PopularAsset } from '../services/assetUsageService';
import './PopularAssets.css';

export function PopularAssets() {
  const navigate = useNavigate();
  const [popularAssets, setPopularAssets] = useState<PopularAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPopularAssets();
  }, []);

  const loadPopularAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const assets = await assetUsageService.getPopularAssets(10);
      setPopularAssets(assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const getAssetTypeIcon = (type?: string) => {
    switch (type) {
      case 'report': return '📄';
      case 'data': return '📊';
      case 'quote': return '💬';
      case 'news': return '📰';
      default: return '📎';
    }
  };

  if (loading) {
    return (
      <div className="popular-assets loading">
        <div className="loading-spinner">⏳ 加载热门素材...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="popular-assets error">
        <div className="error-message">⚠️ {error}</div>
        <button className="btn btn-primary" onClick={loadPopularAssets}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="popular-assets">
      <div className="page-header">
        <h1>🔥 热门素材Top10</h1>
        <p className="subtitle">按引用次数排序，发现最有价值的素材</p>
      </div>

      {popularAssets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">暂无热门素材</div>
          <p>还没有素材被引用，快去使用素材吧！</p>
        </div>
      ) : (
        <div className="popular-list">
          {popularAssets.map((item, index) => (
            <div
              key={item.asset.id}
              className={`popular-item rank-${index + 1}`}
              onClick={() => navigate(`/assets/${item.asset.id}`)}
            >
              <div className="rank-badge">
                {index < 3 ? (
                  <span className={`medal rank-${index + 1}`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                  </span>
                ) : (
                  <span className="rank-number">{index + 1}</span>
                )}
              </div>

              <div className="asset-icon">
                {getAssetTypeIcon(item.asset.type)}
              </div>

              <div className="asset-info">
                <h3 className="asset-title" title={item.asset.title}>
                  {item.asset.title}
                </h3>
                <div className="asset-meta">
                  <span className="source">{item.asset.source || '未知来源'}</span>
                  {item.asset.tags && item.asset.tags.length > 0 && (
                    <span className="tags">
                      {item.asset.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="tag">#{tag}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>

              <div className="usage-stats">
                <div className="stat quote-count">
                  <span className="stat-value">{item.quoteCount}</span>
                  <span className="stat-label">次引用</span>
                </div>
                <div className="stat last-used">
                  <span className="stat-value">
                    {item.lastUsedAt
                      ? new Date(item.lastUsedAt).toLocaleDateString()
                      : '--'}
                  </span>
                  <span className="stat-label">最后使用</span>
                </div>
              </div>

              <div className="asset-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/assets/${item.asset.id}`);
                  }}
                >
                  查看
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PopularAssets;
