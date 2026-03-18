// RSS源管理页面 - v3.4 内容质量输入 + 进度追踪
import { useState, useEffect, useCallback } from 'react';
import { rssSourcesApi, type RSSSource, type RSSCollectionProgress } from '../api/client';
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

  // 进度追踪状态
  const [progress, setProgress] = useState<RSSCollectionProgress | null>(null);
  const [hasRunningJob, setHasRunningJob] = useState(false);
  const [showProgressPanel, setShowProgressPanel] = useState(false);
  const [history, setHistory] = useState<Array<{
    jobId: string;
    status: string;
    startedAt: string;
    totalSources: number;
    totalFetched: number;
    totalImported: number;
  }>>([]);

  // 统计
  const [stats, setStats] = useState({
    totalItems: 0,
    todayItems: 0,
    hotTopicsCount: 0,
    todayHotTopics: 0,
  });

  // 加载数据源
  const loadSources = async () => {
    try {
      setLoading(true);
      const data = await rssSourcesApi.getAll();
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

  // 加载进度
  const loadProgress = useCallback(async () => {
    try {
      const data = await rssSourcesApi.getProgress();
      setHasRunningJob(data.hasRunningJob);
      setProgress(data.progress);
      
      // 如果有运行中的任务，自动显示进度面板
      if (data.hasRunningJob && data.progress) {
        setShowProgressPanel(true);
      }
    } catch (error) {
      console.error('加载进度失败:', error);
    }
  }, []);

  // 加载统计
  const loadStats = async () => {
    try {
      const data = await rssSourcesApi.getStats();
      setStats({
        totalItems: data.totalItems || 0,
        todayItems: data.todayItems || 0,
        hotTopicsCount: data.hotTopicsCount || 0,
        todayHotTopics: data.todayHotTopics || 0,
      });
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 加载历史
  const loadHistory = async () => {
    try {
      const data = await rssSourcesApi.getHistory(5);
      setHistory(data.items || []);
    } catch (error) {
      console.error('加载历史失败:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadSources();
    loadStats();
    loadHistory();
    loadProgress();
  }, []);

  // 定时轮询进度
  useEffect(() => {
    if (!hasRunningJob) return;

    const interval = setInterval(() => {
      loadProgress();
      // 任务完成时刷新数据
      if (hasRunningJob && progress?.status === 'running') {
        loadSources();
        loadStats();
        loadHistory();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [hasRunningJob, loadProgress]);

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
      
      if (result.success) {
        alert(result.message);
        setShowProgressPanel(true);
        // 立即查询进度
        await loadProgress();
      } else {
        alert(result.message);
      }
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
      news: '新闻',
      research: '研究',
      industry: '行业',
      dev: '开发者',
      science: '科学',
      international: '国际',
    };
    return map[category || ''] || '其他';
  };

  const getCategoryColor = (category?: string) => {
    const map: Record<string, string> = {
      tech: '#6366f1',
      finance: '#22c55e',
      news: '#f59e0b',
      research: '#ec4899',
      industry: '#06b6d4',
      dev: '#8b5cf6',
      science: '#14b8a6',
      international: '#f97316',
    };
    return map[category || ''] || '#6b7280';
  };

  const getStatusColor = (status?: string) => {
    const map: Record<string, string> = {
      completed: '#22c55e',
      running: '#3b82f6',
      failed: '#ef4444',
      pending: '#6b7280',
    };
    return map[status || ''] || '#6b7280';
  };

  return (
    <div className="rss-sources-page">
      <div className="page-header">
        <h1>📡 RSS源管理</h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowProgressPanel(!showProgressPanel)}
          >
            {showProgressPanel ? '隐藏进度' : '查看进度'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleTriggerCrawl()}
            disabled={crawling || hasRunningJob}
          >
            {hasRunningJob ? '⏳ 采集中...' : crawling ? '启动中...' : '🔄 全部采集'}
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
          <span className="stat-value">{stats.totalItems}</span>
          <span className="stat-label">总文章</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#22c55e' }}>{stats.todayItems}</span>
          <span className="stat-label">今日新增</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats.hotTopicsCount}</span>
          <span className="stat-label">热点话题</span>
        </div>
      </div>

      {/* 进度追踪面板 */}
      {showProgressPanel && (
        <div className="progress-panel">
          <div className="progress-panel-header">
            <h3>📊 采集进度</h3>
            <button className="btn-close" onClick={() => setShowProgressPanel(false)}>×</button>
          </div>
          
          {hasRunningJob && progress ? (
            <div className="progress-content">
              <div className="progress-overview">
                <div className="progress-status">
                  <span className={`status-badge ${progress.status}`}>
                    {progress.status === 'running' ? '🔄 采集中' : 
                     progress.status === 'completed' ? '✅ 完成' : 
                     progress.status === 'failed' ? '❌ 失败' : '⏸️ 空闲'}
                  </span>
                  <span className="progress-time">
                    开始于: {new Date(progress.startedAt).toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="progress-bar-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <span className="progress-percent">{progress.percent}%</span>
                </div>

                {progress.currentSource && (
                  <div className="current-source">
                    正在采集: <strong>{progress.currentSource}</strong>
                    <span className="source-counter">
                      ({progress.processedSources + 1} / {progress.totalSources})
                    </span>
                  </div>
                )}
              </div>

              <div className="progress-stats">
                <div className="stat-box">
                  <span className="stat-label">已获取</span>
                  <span className="stat-value">{progress.totalFetched}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">已导入</span>
                  <span className="stat-value" style={{ color: '#22c55e' }}>{progress.totalImported}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">重复</span>
                  <span className="stat-value" style={{ color: '#f59e0b' }}>{progress.duplicates}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">错误</span>
                  <span className="stat-value" style={{ color: '#ef4444' }}>{progress.errors}</span>
                </div>
              </div>

              {/* 源详情进度 */}
              {progress.sourceProgress.length > 0 && (
                <div className="source-progress-list">
                  <h4>各源进度</h4>
                  <div className="source-progress-items">
                    {progress.sourceProgress.map((source) => (
                      <div key={source.sourceId} className={`source-progress-item ${source.status}`}>
                        <div className="source-info">
                          <span className="source-name">{source.sourceName}</span>
                          <span className={`source-status-badge ${source.status}`}>
                            {source.status === 'processing' ? '🔄' : 
                             source.status === 'completed' ? '✅' : 
                             source.status === 'failed' ? '❌' : '⏳'}
                          </span>
                        </div>
                        <div className="source-numbers">
                          <span>获取: {source.fetched}</span>
                          <span>导入: {source.imported}</span>
                          {source.duplicates > 0 && <span>重复: {source.duplicates}</span>}
                        </div>
                        {source.error && (
                          <div className="source-error">{source.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="progress-empty">
              <p>暂无运行中的采集任务</p>
              {history.length > 0 && (
                <div className="recent-history">
                  <h4>最近任务</h4>
                  {history.slice(0, 3).map((job) => (
                    <div key={job.jobId} className="history-item">
                      <span className="history-time">
                        {new Date(job.startedAt).toLocaleString()}
                      </span>
                      <span className={`history-status ${job.status}`}>
                        {job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '⏳'}
                      </span>
                      <span className="history-stats">
                        {job.totalSources}源 / {job.totalFetched}条 / 导入{job.totalImported}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                  disabled={crawling || hasRunningJob}
                >
                  🔄 采集
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
                  <option value="news">新闻</option>
                  <option value="research">研究</option>
                  <option value="dev">开发者</option>
                  <option value="science">科学</option>
                  <option value="international">国际</option>
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
