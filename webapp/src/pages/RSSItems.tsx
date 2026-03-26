// RSS文章列表页面 - 支持打分和删除
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
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'published_at' | 'relevance_score' | 'manual_score'>('published_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoringItem, setScoringItem] = useState<RSSItem | null>(null);
  const [scoreValue, setScoreValue] = useState(0.5);

  useEffect(() => {
    loadItems();
    loadStats();
  }, [pagination.offset, viewMode, sortBy, sortOrder]);

  const loadItems = async () => {
    try {
      setLoading(true);
      let data;
      if (viewMode === 'trash') {
        data = await rssSourcesApi.getTrash({
          limit: pagination.limit,
          offset: pagination.offset,
        });
      } else {
        data = await rssSourcesApi.getItems({
          limit: pagination.limit,
          offset: pagination.offset,
          showDeleted: false,
          sortBy,
          sortOrder,
        });
      }
      const normalizedItems = (data.items || []).map(item => ({
        ...item,
        relevance_score: typeof item.relevance_score === 'string' 
          ? parseFloat(item.relevance_score) 
          : item.relevance_score,
        manual_score: typeof item.manual_score === 'string'
          ? parseFloat(item.manual_score)
          : item.manual_score,
      }));
      setItems(normalizedItems);
      setPagination((prev) => ({ ...prev, total: data.pagination?.total || 0 }));
      setSelectedItems(new Set());
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

  // 删除文章（软删除）
  const handleDelete = async (itemId: string) => {
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await rssSourcesApi.deleteItem(itemId, false);
      await loadItems();
      await loadStats();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedItems.size} 篇文章吗？`)) return;
    try {
      await rssSourcesApi.batchDeleteItems(Array.from(selectedItems), false);
      await loadItems();
      await loadStats();
    } catch (error) {
      console.error('批量删除失败:', error);
      alert('批量删除失败');
    }
  };

  // 恢复文章
  const handleRestore = async (itemId: string) => {
    try {
      await rssSourcesApi.restoreItem(itemId);
      await loadItems();
      await loadStats();
    } catch (error) {
      console.error('恢复失败:', error);
      alert('恢复失败');
    }
  };

  // 永久删除
  const handlePermanentDelete = async (itemId: string) => {
    if (!confirm('确定要永久删除这篇文章吗？此操作不可恢复！')) return;
    try {
      await rssSourcesApi.deleteItem(itemId, true);
      await loadItems();
      await loadStats();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  // 清空回收站
  const handleEmptyTrash = async () => {
    if (!confirm('确定要清空回收站吗？所有已删除的文章将被永久删除！')) return;
    try {
      await rssSourcesApi.emptyTrash();
      await loadItems();
      await loadStats();
    } catch (error) {
      console.error('清空回收站失败:', error);
      alert('清空回收站失败');
    }
  };

  // 打分开门
  const openScoreModal = (item: RSSItem) => {
    setScoringItem(item);
    setScoreValue(item.manual_score ?? item.relevance_score ?? 0.5);
    setShowScoreModal(true);
  };

  // 提交打分
  const handleScore = async () => {
    if (!scoringItem) return;
    try {
      await rssSourcesApi.scoreItem(scoringItem.id, scoreValue);
      setShowScoreModal(false);
      setScoringItem(null);
      await loadItems();
    } catch (error) {
      console.error('打分失败:', error);
      alert('打分失败');
    }
  };

  // 选择/取消选择
  const toggleSelect = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.id)));
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

  // 获取有效分数（优先使用人工打分）
  const getEffectiveScore = (item: RSSItem) => {
    return item.manual_score ?? item.relevance_score ?? 0;
  };

  return (
    <div className="rss-items-page">
      <div className="page-header">
        <h1>📰 RSS文章列表</h1>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`btn ${viewMode === 'active' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('active')}
            >
              正常
            </button>
            <button
              className={`btn ${viewMode === 'trash' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('trash')}
            >
              回收站
            </button>
          </div>
          {viewMode === 'active' && selectedItems.size > 0 && (
            <button className="btn btn-danger" onClick={handleBatchDelete}>
              删除选中 ({selectedItems.size})
            </button>
          )}
          {viewMode === 'trash' && (
            <button className="btn btn-danger" onClick={handleEmptyTrash}>
              清空回收站
            </button>
          )}
          <button className="btn btn-primary" onClick={loadItems}>
            🔄 刷新
          </button>
        </div>
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

      {/* 排序控制 */}
      {viewMode === 'active' && (
        <div className="sort-controls">
          <span>排序:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="published_at">发布时间</option>
            <option value="relevance_score">自动评分</option>
            <option value="manual_score">人工评分</option>
          </select>
          <button 
            className="btn btn-sm btn-secondary"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
          </button>
        </div>
      )}

      {/* 文章列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">
            {viewMode === 'trash' ? '回收站是空的' : '暂无RSS文章'}
          </div>
          <p>{viewMode === 'trash' ? '已删除的文章会显示在这里' : '请前往 RSS源管理 页面触发抓取'}</p>
        </div>
      ) : (
        <>
          {/* 全选 */}
          {viewMode === 'active' && (
            <div className="select-all-bar">
              <label>
                <input
                  type="checkbox"
                  checked={selectedItems.size === items.length && items.length > 0}
                  onChange={toggleSelectAll}
                />
                全选 ({selectedItems.size}/{items.length})
              </label>
            </div>
          )}

          <div className="rss-items-list">
            {items.map((item) => (
              <div key={item.id} className={`rss-item-card ${item.is_deleted ? 'deleted' : ''}`}>
                <div className="rss-item-header">
                  <div className="header-left">
                    {viewMode === 'active' && (
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="item-checkbox"
                      />
                    )}
                    <span
                      className="rss-item-source"
                      style={{ background: getSourceColor(item.source_name) }}
                    >
                      {item.source_name}
                    </span>
                    <span className="rss-item-date">{formatDate(item.published_at)}</span>
                  </div>
                  <div className="header-actions">
                    {viewMode === 'active' ? (
                      <>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openScoreModal(item)}
                          title="打分"
                        >
                          ⭐ 打分
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(item.id)}
                          title="删除"
                        >
                          🗑️ 删除
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleRestore(item.id)}
                          title="恢复"
                        >
                          ↩️ 恢复
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handlePermanentDelete(item.id)}
                          title="永久删除"
                        >
                          ❌ 彻底删除
                        </button>
                      </>
                    )}
                  </div>
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
                  <div className="rss-item-scores">
                    <span
                      className="rss-item-score"
                      style={{ color: getScoreColor(getEffectiveScore(item)) }}
                      title={item.manual_score !== undefined ? '人工评分' : '自动评分'}
                    >
                      {item.manual_score !== undefined ? '👤 ' : '🤖 '}
                      相关度: {(getEffectiveScore(item) * 100).toFixed(0)}%
                    </span>
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

      {/* 打分解模态框 */}
      {showScoreModal && scoringItem && (
        <div className="modal-overlay" onClick={() => setShowScoreModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>为文章打分</h3>
            <p className="modal-item-title">{scoringItem.title}</p>
            <div className="score-input">
              <label>评分 (0-100):</label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(scoreValue * 100)}
                onChange={(e) => setScoreValue(parseInt(e.target.value) / 100)}
              />
              <span className="score-value">{Math.round(scoreValue * 100)}%</span>
            </div>
            <div className="score-presets">
              <button className="btn btn-sm btn-secondary" onClick={() => setScoreValue(0.2)}>低 (20%)</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setScoreValue(0.5)}>中 (50%)</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setScoreValue(0.8)}>高 (80%)</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setScoreValue(1.0)}>优 (100%)</button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowScoreModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleScore}>
                确认打分
              </button>
            </div>
          </div>
        </div>
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
