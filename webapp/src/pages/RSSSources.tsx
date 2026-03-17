// RSS源管理页面 - v3.4 内容质量输入
import { useState, useEffect } from 'react';
import { rssSourcesApi, type RSSSource } from '../api/client';
import './RSSSources.css';

export function RSSSources() {
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [newSource, setNewSource] = useState({
    name: '',
    url: '',
    category: 'tech',
  });

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      setLoading(true);
      const data = await rssSourcesApi.getAll();
      // 后端返回格式: { items: [] }
      const sources = (data.items || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        category: s.category,
        isActive: s.isActive !== false,
        lastCrawledAt: s.lastCrawledAt,
      }));
      setSources(sources);
    } catch (error) {
      console.error('加载RSS源失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newSource.name.trim() || !newSource.url.trim()) return;
    try {
      await rssSourcesApi.create(newSource);
      setShowCreateModal(false);
      setNewSource({ name: '', url: '', category: 'tech' });
      loadSources();
    } catch (error) {
      console.error('创建RSS源失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个RSS源吗？')) return;
    try {
      await rssSourcesApi.delete(id);
      loadSources();
    } catch (error) {
      console.error('删除RSS源失败:', error);
    }
  };

  const handleTriggerCrawl = async (id?: string) => {
    try {
      setCrawling(true);
      const result = await rssSourcesApi.triggerCrawl(id);
      alert(result.message || (id ? 'RSS源抓取已启动（后台执行）' : '全部RSS源抓取已启动（后台执行）'));
      // 3秒后刷新列表，看是否有新数据
      setTimeout(() => {
        loadSources();
      }, 3000);
    } catch (error) {
      console.error('触发抓取失败:', error);
      alert('抓取启动失败，请检查网络或后端服务');
    } finally {
      setCrawling(false);
    }
  };

  const getCategoryLabel = (category?: string) => {
    const map: Record<string, string> = {
      tech: '科技',
      finance: '财经',
      research: '研究',
      industry: '行业',
    };
    return map[category || ''] || '其他';
  };

  const getCategoryColor = (category?: string) => {
    const map: Record<string, string> = {
      tech: '#6366f1',
      finance: '#22c55e',
      research: '#f59e0b',
      industry: '#ec4899',
    };
    return map[category || ''] || '#6b7280';
  };

  return (
    <div className="rss-sources-page">
      <div className="page-header">
        <h1>📡 RSS源管理</h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleTriggerCrawl()}
            disabled={crawling}
          >
            {crawling ? '⏳ 抓取中...' : '🔄 全部抓取'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + 添加RSS源
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{sources.length}</span>
          <span className="stat-label">总源数</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{sources.filter((s) => s.isActive).length}</span>
          <span className="stat-label">启用中</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">
            {sources.filter((s) => s.lastCrawledAt).length}
          </span>
          <span className="stat-label">已抓取</span>
        </div>
      </div>

      {/* RSS源列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : sources.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📡</div>
          <div className="empty-title">暂无RSS源</div>
          <p>点击"添加RSS源"按钮创建第一个源</p>
        </div>
      ) : (
        <div className="sources-grid">
          {sources.map((source) => (
            <div key={source.id} className={`source-card ${!source.isActive ? 'inactive' : ''}`}>
              <div className="source-header">
                <div className="source-info">
                  <h3 className="source-name">{source.name}</h3>
                  <span
                    className="source-category"
                    style={{ background: getCategoryColor(source.category) }}
                  >
                    {getCategoryLabel(source.category)}
                  </span>
                </div>
                <div className="source-status">
                  <span className={`status-badge ${source.isActive ? 'active' : 'inactive'}`}>
                    {source.isActive ? '● 启用' : '○ 停用'}
                  </span>
                </div>
              </div>

              <div className="source-url">
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.url}
                </a>
              </div>

              {source.lastCrawledAt && (
                <div className="source-last-crawl">
                  上次抓取: {new Date(source.lastCrawledAt).toLocaleString('zh-CN')}
                </div>
              )}

              <div className="source-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleTriggerCrawl(source.id)}
                  disabled={crawling}
                >
                  🔄 抓取
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(source.id)}
                >
                  🗑️ 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加RSS源</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>源名称 *</label>
                <input
                  type="text"
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  placeholder="例如：36氪"
                />
              </div>
              <div className="form-group">
                <label>RSS地址 *</label>
                <input
                  type="url"
                  value={newSource.url}
                  onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                  placeholder="https://example.com/feed.xml"
                />
              </div>
              <div className="form-group">
                <label>分类</label>
                <select
                  value={newSource.category}
                  onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                >
                  <option value="tech">科技</option>
                  <option value="finance">财经</option>
                  <option value="research">研究</option>
                  <option value="industry">行业</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!newSource.name.trim() || !newSource.url.trim()}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
