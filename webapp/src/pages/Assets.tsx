import { useState, useEffect } from 'react';
import { assetsApi } from '../api/client';
import type { Asset } from '../types';
import './Assets.css';

export function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const response = await assetsApi.getAll();
      setAssets(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="assets-page">
      <div className="page-header">
        <h1 className="page-title">素材库</h1>
        <button className="btn btn-primary">
          <span>+</span> 添加素材
        </button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : assets.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <div className="empty-title">暂无素材</div>
            <p>素材库用于管理研究过程中收集的图片、图表、文档等资料</p>
          </div>
        </div>
      ) : (
        <div className="assets-grid">
          {assets.map((asset) => (
            <div key={asset.id} className="asset-card">
              <div className="asset-preview">
                {asset.content_type?.startsWith('image/') ? (
                  <img src={asset.filename} alt={asset.title} />
                ) : (
                  <div className="asset-icon">📄</div>
                )}
              </div>
              <div className="asset-info">
                <div className="asset-title">{asset.title}</div>
                <div className="asset-meta">
                  <span>{asset.content_type}</span>
                  <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                </div>
                <div className="asset-stats">
                  <div className="stat-item quality">
                    <span className="stat-label">质量分</span>
                    <span className="stat-value" style={{ color: asset.quality_score >= 80 ? '#52c41a' : asset.quality_score >= 60 ? '#faad14' : '#ff4d4f' }}>
                      {asset.quality_score || '--'}
                    </span>
                  </div>
                  <div className="stat-item citations">
                    <span className="stat-label">引用</span>
                    <span className="stat-value">{asset.citation_count || 0}</span>
                  </div>
                </div>
                {asset.auto_tags?.length > 0 && (
                  <div className="asset-tags">
                    {asset.auto_tags.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="tag">{tag.tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
