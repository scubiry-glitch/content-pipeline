// RSS源管理页面 - 优化版
import { useState, useEffect, useCallback, useRef } from 'react';
import { rssSourcesApi, type RSSSource, type RSSCollectionProgress } from '../api/client';
import './RSSSources.css';

interface SourceProgress {
  sourceId: string;
  sourceName: string;
  status: string;
  fetched: number;
  imported: number;
  duplicates: number;
}

export function RSSSources() {
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  
  // 进度状态
  const [jobStatus, setJobStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState<RSSCollectionProgress | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // 统计
  const [stats, setStats] = useState({
    totalItems: 0,
    todayItems: 0,
    totalSources: 0,
  });

  // 加载数据
  const loadData = async () => {
    try {
      const [sourcesData, statsData] = await Promise.all([
        rssSourcesApi.getAll(),
        rssSourcesApi.getStats(),
      ]);
      
      setSources(sourcesData.items || []);
      setStats({
        totalItems: statsData.totalItems || 0,
        todayItems: statsData.todayItems || 0,
        totalSources: statsData.totalSources || 0,
      });
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  // 加载进度
  const loadProgress = useCallback(async () => {
    try {
      const data = await rssSourcesApi.getProgress();
      
      if (data.progress) {
        setProgress(data.progress);
        setJobStatus(data.progress.status);
        
        // 任务完成时刷新数据
        if (data.progress.status === 'completed' || data.progress.status === 'failed') {
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
          }
          setCrawling(false);
          loadData(); // 刷新统计数据
        }
      } else {
        setJobStatus('idle');
      }
    } catch (error) {
      console.error('加载进度失败:', error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadData();
    loadProgress();
    
    // 定期刷新
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // 任务运行时轮询进度
  useEffect(() => {
    if (jobStatus === 'running' && !pollInterval.current) {
      pollInterval.current = setInterval(loadProgress, 1000);
      setShowProgress(true);
    }
    
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
    };
  }, [jobStatus, loadProgress]);

  // 触发采集
  const handleCrawl = async () => {
    if (crawling) return;
    
    try {
      setCrawling(true);
      setJobStatus('running');
      setShowProgress(true);
      
      const result = await rssSourcesApi.triggerCrawl();
      console.log('采集启动:', result);
      
      // 立即查询进度
      await loadProgress();
    } catch (error) {
      console.error('启动采集失败:', error);
      alert('启动采集失败');
      setCrawling(false);
      setJobStatus('idle');
    }
  };

  // 计算进度百分比
  const getProgressPercent = () => {
    if (!progress) return 0;
    if (progress.totalSources === 0) return 0;
    return Math.round((progress.processedSources / progress.totalSources) * 100);
  };

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      running: '#3b82f6',
      completed: '#22c55e',
      failed: '#ef4444',
      idle: '#6b7280',
    };
    return colors[status] || '#6b7280';
  };

  // 获取状态文本
  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      running: '采集中...',
      completed: '已完成',
      failed: '失败',
      idle: '空闲',
    };
    return texts[status] || status;
  };

  return (
    <div className="rss-page">
      <div className="rss-header">
        <h1>📡 RSS 采集管理</h1>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={handleCrawl}
            disabled={crawling}
          >
            {crawling ? '⏳ 采集中...' : '🚀 开始采集'}
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
          <div className="stat-value">{stats.totalSources}</div>
          <div className="stat-label">RSS源总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sources.filter(s => s.isActive).length}</div>
          <div className="stat-label">启用中</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalItems}</div>
          <div className="stat-label">已采集文章</div>
        </div>
        <div className="stat-card highlight">
          <div className="stat-value" style={{ color: '#22c55e' }}>{stats.todayItems}</div>
          <div className="stat-label">今日新增</div>
        </div>
      </div>

      {/* 进度面板 */}
      {showProgress && (
        <div className="progress-section">
          <div className="progress-header">
            <h3>📊 采集进度</h3>
            <span 
              className="status-tag"
              style={{ background: getStatusColor(jobStatus) }}
            >
              {getStatusText(jobStatus)}
            </span>
          </div>

          {progress ? (
            <div className="progress-body">
              {/* 总体进度 */}
              <div className="overall-progress">
                <div className="progress-bar-bg">
                  <div 
                    className="progress-bar-fill"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>
                <span className="progress-text">{getProgressPercent()}%</span>
              </div>

              {/* 当前源 */}
              {progress.currentSource && (
                <div className="current-source">
                  正在采集: <strong>{progress.currentSource}</strong>
                  <span className="source-count">
                    ({progress.processedSources + 1} / {progress.totalSources})
                  </span>
                </div>
              )}

              {/* 统计数字 */}
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
                <div className="number-box error">
                  <span className="number-value">{progress.errors.length}</span>
                  <span className="number-label">错误</span>
                </div>
              </div>

              {/* 各源详情 */}
              {progress.sourceProgress && progress.sourceProgress.length > 0 && (
                <div className="source-list">
                  <h4>各源进度</h4>
                  <div className="source-items">
                    {Array.from(progress.sourceProgress.values()).map((sp: SourceProgress) => (
                      <div key={sp.sourceId} className={`source-item ${sp.status}`}>
                        <div className="source-row">
                          <span className="source-name">{sp.sourceName}</span>
                          <span className={`source-status ${sp.status}`}>
                            {sp.status === 'processing' && '🔄'}
                            {sp.status === 'completed' && '✅'}
                            {sp.status === 'failed' && '❌'}
                            {sp.status === 'pending' && '⏳'}
                          </span>
                        </div>
                        <div className="source-stats">
                          <span>获取: {sp.fetched}</span>
                          <span>导入: {sp.imported}</span>
                          {sp.duplicates > 0 && <span>重复: {sp.duplicates}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 错误信息 */}
              {progress.errors.length > 0 && (
                <div className="error-section">
                  <h4>❌ 错误 ({progress.errors.length})</h4>
                  <div className="error-list">
                    {progress.errors.slice(0, 3).map((err, idx) => (
                      <div key={idx} className="error-item">{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="progress-empty">
              <p>暂无运行中的采集任务</p>
              <p className="hint">点击"开始采集"按钮启动</p>
            </div>
          )}
        </div>
      )}

      {/* RSS源列表 */}
      <div className="sources-section">
        <h3>📡 RSS 源列表 ({sources.length}个)</h3>
        {loading ? (
          <div className="loading">加载中...</div>
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
                <span className="category-tag" style={{ 
                  background: getCategoryColor(source.category) 
                }}>
                  {getCategoryLabel(source.category)}
                </span>
                <span className={`status-badge ${source.isActive ? 'active' : 'inactive'}`}>
                  {source.isActive ? '● 启用' : '○ 停用'}
                </span>
                <span className="last-crawl">
                  {source.lastCrawledAt 
                    ? new Date(source.lastCrawledAt).toLocaleString() 
                    : '从未'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getCategoryLabel(category?: string) {
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
}

function getCategoryColor(category?: string) {
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
}
