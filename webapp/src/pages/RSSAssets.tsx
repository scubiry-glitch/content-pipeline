// RSSAssets.tsx - RSS订阅独立页面 (支持打分和删除)
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  rssSourcesApi, 
  type RSSSource, 
  type RSSItem,
  type RSSCollectionProgress 
} from '../api/client';
import './RSSAssets.css';

export function RSSAssets() {
  const navigate = useNavigate();
  
  // Tab 状态
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'sources'>('items');
  
  // 数据状态
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [items, setItems] = useState<RSSItem[]>([]);
  const [stats, setStats] = useState({ 
    totalItems: 0, 
    todayItems: 0, 
    totalSources: 0,
    activeSources: 0 
  });
  
  // UI 状态
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [jobStatus, setJobStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState<RSSCollectionProgress | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  
  // 打分弹窗状态
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoringItem, setScoringItem] = useState<RSSItem | null>(null);
  const [scoreValue, setScoreValue] = useState(0.5);
  
  // 分页
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
  });

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [sourcesRes, statsRes] = await Promise.all([
        rssSourcesApi.getAll(),
        rssSourcesApi.getStats(),
      ]);
      setSources(sourcesRes.items || []);
      setStats({
        totalItems: statsRes.totalItems || 0,
        todayItems: statsRes.todayItems || 0,
        totalSources: statsRes.totalSources || 0,
        activeSources: statsRes.activeSources || 0,
      });
    } catch (err) {
      console.error('Failed to load RSS data:', err);
    } finally {
      setLoading(false);
    }
  };

  // 加载文章列表
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const itemsRes = await rssSourcesApi.getItems({
        limit: pagination.limit,
        offset: pagination.offset,
      });
      // 转换数据类型
      const normalizedItems = (itemsRes.items || []).map(item => ({
        ...item,
        relevance_score: typeof item.relevance_score === 'string' 
          ? parseFloat(item.relevance_score) 
          : item.relevance_score,
        manual_score: typeof item.manual_score === 'string'
          ? parseFloat(item.manual_score)
          : item.manual_score,
      }));
      setItems(normalizedItems);
      setPagination(prev => ({ ...prev, total: itemsRes.pagination?.total || 0 }));
    } catch (err) {
      console.error('Failed to load RSS items:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.offset]);

  // 加载进度
  const loadProgress = useCallback(async () => {
    try {
      const data = await rssSourcesApi.getProgress();
      if (data.progress) {
        setProgress(data.progress);
        setJobStatus(data.progress.status);
        if (data.progress.status === 'completed' || data.progress.status === 'failed') {
          setCrawling(false);
          loadData();
          loadItems();
        }
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  }, [loadItems]);

  // 初始加载
  useEffect(() => {
    loadData();
    loadItems();
  }, [loadItems]);

  // 定时刷新进度
  useEffect(() => {
    if (jobStatus !== 'running') return;
    const interval = setInterval(loadProgress, 2000);
    return () => clearInterval(interval);
  }, [jobStatus, loadProgress]);

  // 触发采集
  const handleCrawl = async () => {
    if (crawling) return;
    try {
      setCrawling(true);
      setJobStatus('running');
      setShowProgress(true);
      await rssSourcesApi.triggerCrawl();
      await loadProgress();
    } catch (error) {
      console.error('启动采集失败:', error);
      alert('启动采集失败');
      setCrawling(false);
      setJobStatus('idle');
    }
  };

  // 删除文章
  const handleDelete = async (itemId: string) => {
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await rssSourcesApi.deleteItem(itemId, false);
      await loadItems();
      await loadData();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
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

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取源颜色
  const getSourceColor = (sourceName: string): string => {
    const colors: Record<string, string> = {
      'Slashdot': '#006666',
      'BBC Technology': '#bb1919',
      'The Verge': '#e2127a',
      'MIT Technology Review': '#000000',
      'Ars Technica': '#ff4e00',
      'Nature News': '#9c27b0',
      'GitHub Blog': '#24292e',
    };
    return colors[sourceName] || '#6366f1';
  };

  // 获取相关度颜色
  const getScoreColor = (score: number) => {
    if (score >= 0.7) return '#22c55e';
    if (score >= 0.4) return '#f59e0b';
    return '#6b7280';
  };

  // 获取有效分数
  const getEffectiveScore = (item: RSSItem) => {
    return item.manual_score ?? item.relevance_score ?? 0;
  };

  // 计算进度百分比
  const getProgressPercent = () => {
    if (!progress || progress.totalSources === 0) return 0;
    return Math.round((progress.processedSources / progress.totalSources) * 100);
  };

  return (
    <div className="rss-assets-page">
      {/* 页面标题 */}
      <div className="page-header">
        <h1>📡 RSS 订阅</h1>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={handleCrawl}
            disabled={crawling}
          >
            {crawling ? '⏳ 采集中...' : '🔄 立即采集'}
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowProgress(!showProgress)}
          >
            {showProgress ? '隐藏进度' : '查看进度'}
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
          <div className="stat-value">{stats.activeSources}</div>
          <div className="stat-label">启用中</div>
        </div>
      </div>

      {/* 进度面板 */}
      {showProgress && progress && (
        <div className="progress-section">
          <div className="progress-header">
            <h3>📊 采集进度</h3>
            <span className={`status-tag ${jobStatus}`}>
              {jobStatus === 'running' ? '采集中' : jobStatus === 'completed' ? '已完成' : jobStatus === 'failed' ? '失败' : '空闲'}
            </span>
          </div>
          <div className="progress-body">
            <div className="overall-progress">
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${getProgressPercent()}%` }} />
              </div>
              <span className="progress-text">{getProgressPercent()}%</span>
            </div>
            {progress.currentSource && (
              <div className="current-source">
                正在采集: <strong>{progress.currentSource}</strong>
                <span className="source-count">({progress.processedSources + 1} / {progress.totalSources})</span>
              </div>
            )}
            <div className="progress-numbers">
              <div className="number-box">
                <span className="number-value">{progress.totalFetched}</span>
                <span className="number-label">已获取</span>
              </div>
              <div className="number-box success">
                <span className="number-value">{progress.totalImported}</span>
                <span className="number-label">已导入</span>
              </div>
              <div className="number-box warning">
                <span className="number-value">{progress.duplicates}</span>
                <span className="number-label">重复</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="sub-tabs">
        <button
          className={`sub-tab-btn ${activeSubTab === 'items' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('items')}
        >
          📰 文章列表 ({stats.totalItems})
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'sources' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('sources')}
        >
          📡 源管理 ({sources.length})
        </button>
      </div>

      {/* 内容区域 */}
      {activeSubTab === 'items' ? (
        <div className="items-section">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">暂无RSS文章</div>
              <p>点击"立即采集"按钮获取最新文章</p>
            </div>
          ) : (
            <>
              <div className="rss-items-list">
                {items.map((item) => (
                  <div key={item.id} className="rss-item-card">
                    <div className="rss-item-header">
                      <div className="header-left">
                        <span
                          className="rss-item-source"
                          style={{ background: getSourceColor(item.source_name) }}
                        >
                          {item.source_name}
                        </span>
                        <span className="rss-item-date">{formatDate(item.published_at)}</span>
                      </div>
                      <div className="header-actions">
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
                          <span key={idx} className="rss-tag">{tag}</span>
                        ))}
                      </div>
                      <div
                        className="rss-item-score"
                        style={{ color: getScoreColor(getEffectiveScore(item)) }}
                        title={item.manual_score !== undefined ? '人工评分' : '自动评分'}
                      >
                        {item.manual_score !== undefined ? '👤 ' : '🤖 '}
                        相关度: {(getEffectiveScore(item) * 100).toFixed(0)}%
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
                  onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                >
                  上一页
                </button>
                <span className="pagination-info">
                  第 {Math.floor(pagination.offset / pagination.limit) + 1} 页
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={items.length < pagination.limit}
                  onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                >
                  下一页
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="sources-section">
          {sources.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📡</div>
              <div className="empty-title">暂无RSS源</div>
              <p>请前往 RSS源管理 页面添加源</p>
              <button className="btn btn-primary" onClick={() => navigate('/rss-sources')}>
                前往管理 →
              </button>
            </div>
          ) : (
            <div className="sources-table">
              <div className="table-header">
                <span>名称</span>
                <span>分类</span>
                <span>状态</span>
                <span>上次采集</span>
              </div>
              {sources.map(source => (
                <div key={source.id} className="table-row">
                  <div className="source-info">
                    <div className="source-name">{source.name}</div>
                    <div className="source-url">{source.url}</div>
                  </div>
                  <span className="category-tag">{source.category || '其他'}</span>
                  <span className={`status-badge ${source.isActive ? 'active' : 'inactive'}`}>
                    {source.isActive ? '● 启用' : '○ 停用'}
                  </span>
                  <span className="last-crawl">
                    {source.lastCrawledAt 
                      ? formatDate(source.lastCrawledAt)
                      : '从未'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
