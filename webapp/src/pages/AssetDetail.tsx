import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assetsApi, type Asset } from '../api/client';
import './AssetDetail.css';

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'meta' | 'citations'>('content');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadAsset();
    }
  }, [id]);

  const loadAsset = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await assetsApi.getById(id!);
      setAsset(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleQuote = async () => {
    if (!id) return;
    setQuoteLoading(true);
    try {
      const result = await assetsApi.quote(id);
      setQuoteResult(result);
      setTimeout(() => setQuoteResult(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '引用失败');
    } finally {
      setQuoteLoading(false);
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const getContentTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      'text/plain': '文本',
      'text/markdown': 'Markdown',
      'text/html': 'HTML',
      'application/pdf': 'PDF',
      'image/png': 'PNG图片',
      'image/jpeg': 'JPEG图片',
      'text/rss': 'RSS',
    };
    return map[type] || type;
  };

  if (loading) {
    return <div className="asset-detail loading">加载中...</div>;
  }

  if (error) {
    return (
      <div className="asset-detail error">
        <div className="error-message">⚠️ {error}</div>
        <button className="btn btn-primary" onClick={loadAsset}>
          重试
        </button>
      </div>
    );
  }

  if (!asset) {
    return <div className="asset-detail empty">素材不存在</div>;
  }

  return (
    <div className="asset-detail">
      <div className="detail-header">
        <button className="btn btn-link back-btn" onClick={() => navigate('/assets')}>
          ← 返回素材库
        </button>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handleQuote}
            disabled={quoteLoading}
          >
            {quoteLoading ? '⏳ 生成中...' : '📋 一键引用'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/assets/${id}/edit`)}
          >
            ✏️ 编辑
          </button>
        </div>
      </div>

      {quoteResult && (
        <div className="quote-toast success">
          <span>✅ 引用已生成</span>
          <button onClick={() => setQuoteResult(null)}>✕</button>
        </div>
      )}

      <div className="asset-hero">
        <div className="asset-title-section">
          <h1>{asset.title}</h1>
          <div className="asset-badges">
            <span className="content-type-badge">{getContentTypeLabel(asset.content_type)}</span>
            {asset.is_pinned && <span className="pinned-badge">📌 置顶</span>}
          </div>
        </div>

        <div className="asset-meta-bar">
          <span>🏢 {asset.source || '未知来源'}</span>
          <span>📅 {new Date(asset.created_at).toLocaleDateString()}</span>
          <span>👁️ {asset.view_count || 0} 次查看</span>
          {asset.quality_score !== undefined && (
            <span className="quality-badge" style={{ color: getQualityColor(asset.quality_score) }}>
              ⭐ 质量分 {asset.quality_score}
            </span>
          )}
        </div>

        <div className="asset-tags">
          {asset.tags?.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
          {asset.auto_tags?.map((tag) => (
            <span key={tag} className="tag auto">🤖 {tag}</span>
          ))}
        </div>
      </div>

      <div className="detail-tabs">
        <button
          className={`tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          📝 内容
        </button>
        <button
          className={`tab ${activeTab === 'meta' ? 'active' : ''}`}
          onClick={() => setActiveTab('meta')}
        >
          📊 元数据
        </button>
        <button
          className={`tab ${activeTab === 'citations' ? 'active' : ''}`}
          onClick={() => setActiveTab('citations')}
        >
          📚 引用统计
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'content' && (
          <div className="content-panel">
            {asset.content ? (
              <div className="content-body">
                {asset.content_type?.includes('image') ? (
                  <img src={asset.content} alt={asset.title} className="content-image" />
                ) : (
                  <pre className="content-text">{asset.content}</pre>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <div className="empty-title">暂无内容</div>
                <p>该素材暂无文本内容</p>
              </div>
            )}

            {asset.summary && (
              <div className="summary-section">
                <h3>🤖 AI摘要</h3>
                <p>{asset.summary}</p>
              </div>
            )}

            {asset.key_points && asset.key_points.length > 0 && (
              <div className="keypoints-section">
                <h3>💡 关键要点</h3>
                <ul>
                  {asset.key_points.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'meta' && (
          <div className="meta-panel">
            <div className="meta-section">
              <h3>基本信息</h3>
              <div className="meta-grid">
                <div className="meta-item">
                  <span className="meta-label">ID</span>
                  <span className="meta-value code">{asset.id}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">内容类型</span>
                  <span className="meta-value">{asset.content_type}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">来源</span>
                  <span className="meta-value">{asset.source || '未知'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">来源URL</span>
                  <a href={asset.source_url} target="_blank" rel="noopener noreferrer" className="meta-value link">
                    {asset.source_url || '无'}
                  </a>
                </div>
                <div className="meta-item">
                  <span className="meta-label">主题ID</span>
                  <span className="meta-value">{asset.theme_id || '未分类'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">创建时间</span>
                  <span className="meta-value">{new Date(asset.created_at).toLocaleString()}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">更新时间</span>
                  <span className="meta-value">{new Date(asset.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="meta-section">
              <h3>质量评估</h3>
              <div className="quality-overview">
                <div
                  className="quality-score-circle"
                  style={{ '--score-color': getQualityColor(asset.quality_score || 0) } as any}
                >
                  <span className="score-number">{asset.quality_score || '--'}</span>
                  <span className="score-label">质量分</span>
                </div>
              </div>
              {asset.quality_dimensions && (
                <div className="quality-dimensions">
                  {Object.entries(asset.quality_dimensions).map(([dim, score]) => (
                    <div key={dim} className="dimension-row">
                      <span className="dim-name">{dim}</span>
                      <div className="dim-bar">
                        <div
                          className="dim-fill"
                          style={{ width: `${score}%`, background: getQualityColor(score) }}
                        />
                      </div>
                      <span className="dim-score">{score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {asset.embedding && (
              <div className="meta-section">
                <h3>🔢 向量嵌入</h3>
                <p className="embedding-info">该素材已生成向量嵌入，可用于语义搜索</p>
                <div className="embedding-preview">
                  <code>维度: {Array.isArray(asset.embedding) ? asset.embedding.length : 'N/A'}</code>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'citations' && (
          <div className="citations-panel">
            <div className="citations-stats">
              <div className="stat-card primary">
                <span className="stat-value">{asset.citation_count || 0}</span>
                <span className="stat-label">被引用次数</span>
                <span className="stat-trend">{(asset.citation_count || 0) > 5 ? '🔥 热门素材' : ''}</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{asset.view_count || 0}</span>
                <span className="stat-label">查看次数</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{(asset.quality_score || 0) > 80 ? '高' : (asset.quality_score || 0) > 60 ? '中' : '低'}</span>
                <span className="stat-label">引用质量</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{asset.influence_score || '--'}</span>
                <span className="stat-label">影响力分</span>
              </div>
            </div>

            {/* 引用任务列表 */}
            <div className="citation-tasks">
              <h3>📋 引用该素材的任务</h3>
              <div className="citation-tasks-list">
                {/* 模拟数据 - 实际应从API获取 */}
                {(asset.citation_count || 0) > 0 ? (
                  <div className="citation-task-item">
                    <span className="task-name">保租房REITs市场分析</span>
                    <span className="task-status completed">已完成</span>
                    <span className="citation-date">2026-03-15</span>
                  </div>
                ) : (
                  <div className="empty-citations">暂无任务引用该素材</div>
                )}
              </div>
            </div>

            <div className="citation-actions">
              <h3>快速引用</h3>
              <div className="citation-formats">
                <div className="citation-format">
                  <span className="format-label">GB/T 7714</span>
                  <code className="format-content">
                    {asset.source || '未知作者'}. {asset.title}[{getContentTypeLabel(asset.content_type)}].
                    {asset.source ? `${asset.source}, ` : ''}{new Date(asset.created_at).getFullYear()}.
                  </code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`${asset.source || '未知作者'}. ${asset.title}[${getContentTypeLabel(asset.content_type)}]. ${asset.source ? `${asset.source}, ` : ''}${new Date(asset.created_at).getFullYear()}.`)}
                  >
                    复制
                  </button>
                </div>
                <div className="citation-format">
                  <span className="format-label">APA</span>
                  <code className="format-content">
                    {asset.source || 'Unknown'}. ({new Date(asset.created_at).getFullYear()}). {asset.title}.
                  </code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`${asset.source || 'Unknown'}. (${new Date(asset.created_at).getFullYear()}). ${asset.title}.`)}
                  >
                    复制
                  </button>
                </div>
                <div className="citation-format">
                  <span className="format-label">MLA</span>
                  <code className="format-content">
                    {asset.source || '"Unknown"'}. "{asset.title}." {asset.source || 'Web'}, {new Date(asset.created_at).getFullYear()}.
                  </code>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`${asset.source || '"Unknown"'}. "${asset.title}." ${asset.source || 'Web'}, ${new Date(asset.created_at).getFullYear()}.`)}
                  >
                    复制
                  </button>
                </div>
              </div>
            </div>

            <div className="usage-tips">
              <h3>💡 使用建议</h3>
              <ul>
                <li>高质量素材（质量分&gt;80）适合作为核心论据引用</li>
                <li>引用时请注意核实内容的时效性和准确性</li>
                <li>建议在引用时添加自己的分析和观点</li>
                <li>可以通过"一键引用"功能快速生成标准引用格式</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
