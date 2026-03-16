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
      const data = await assetsApi.getAll();
      setAssets(data);
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
                {asset.fileType?.startsWith('image/') ? (
                  <img src={asset.filePath} alt={asset.title} />
                ) : (
                  <div className="asset-icon">📄</div>
                )}
              </div>
              <div className="asset-info">
                <div className="asset-title">{asset.title}</div>
                <div className="asset-meta">
                  <span>{asset.fileType}</span>
                  <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
