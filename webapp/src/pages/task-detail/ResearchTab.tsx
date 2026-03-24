// 任务详情 - 深度研究 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DataReviewTable } from '../../components/DataReviewTable';
import { ExternalLinksList } from '../../components/ExternalLinksList';
import { AssetLinksList } from '../../components/AssetLinksList';
import { DataCleaningPanel } from '../../components/DataCleaningPanel';
import { CrossValidationPanel } from '../../components/CrossValidationPanel';
import { rssSourcesApi, hotTopicsApi, assetsApi, researchApi } from '../../api/client';
import type { Task } from '../../types';
import type { ResearchConfig, RSSItem, HotTopic, Asset } from '../../api/client';

interface TaskContext {
  task: Task;
  researchConfig: ResearchConfig;
  showResearchConfig: boolean;
  actionLoading: string | null;
  onShowResearchConfigChange: (show: boolean) => void;
  onResearchConfigChange: (config: ResearchConfig) => void;
  onSaveResearchConfig: () => void;
  onCollectResearch: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review') => void;
  onAddExternalLink: () => void;
}

export function ResearchTab() {
  const {
    task,
    researchConfig,
    showResearchConfig,
    actionLoading,
    onShowResearchConfigChange,
    onResearchConfigChange,
    onSaveResearchConfig,
    onCollectResearch,
    onRedoStage,
    onAddExternalLink,
  } = useOutletContext<TaskContext>();

  const hasResearchData = !!task.research_data;
  const researchData = task.research_data as any;

  // ===== Multi-Source Engine 状态 =====
  // RSS 数据
  const [rssItems, setRssItems] = useState<RSSItem[]>([]);
  const [rssLoading, setRssLoading] = useState(false);
  const [selectedRssItems, setSelectedRssItems] = useState<Set<string>>(new Set());
  
  // Web Search 数据
  const [webSearchResults, setWebSearchResults] = useState<HotTopic[]>([]);
  const [webSearchLoading, setWebSearchLoading] = useState(false);
  const [selectedWebItems, setSelectedWebItems] = useState<Set<string>>(new Set());
  
  // Private Assets 数据
  const [privateAssets, setPrivateAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

  // ===== 加载数据 =====
  const loadRssData = useCallback(async () => {
    if (!researchConfig.sources.includes('rss')) return;
    setRssLoading(true);
    try {
      const result = await rssSourcesApi.getItems({ limit: 5 });
      setRssItems(result.items || []);
    } catch (error) {
      console.error('Failed to load RSS items:', error);
    } finally {
      setRssLoading(false);
    }
  }, [researchConfig.sources]);

  const loadWebSearchData = useCallback(async () => {
    if (!researchConfig.sources.includes('web')) return;
    setWebSearchLoading(true);
    try {
      // 使用 Tavily 实时搜索预览
      const result = await researchApi.previewSearch(task.id, { limit: 5 });
      setWebSearchResults(result.items || []);
    } catch (error) {
      console.error('Failed to load web search results:', error);
      // 出错时回退到热点话题 API
      try {
        const result = await hotTopicsApi.getAll({ limit: 5 });
        setWebSearchResults(result.items || []);
      } catch {
        setWebSearchResults([]);
      }
    } finally {
      setWebSearchLoading(false);
    }
  }, [researchConfig.sources, task.id]);

  const loadAssetsData = useCallback(async () => {
    if (!researchConfig.sources.includes('asset')) return;
    setAssetsLoading(true);
    try {
      const result = await assetsApi.getAll({ limit: 5 });
      setPrivateAssets(result.items || []);
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setAssetsLoading(false);
    }
  }, [researchConfig.sources]);

  // ===== 重试功能 =====
  const handleRetryWebSearch = async () => {
    await loadWebSearchData();
  };

  const handleRetryRss = async () => {
    await loadRssData();
  };

  const handleRetryAssets = async () => {
    await loadAssetsData();
  };

  // ===== 勾选功能 =====
  const toggleRssSelection = (id: string) => {
    setSelectedRssItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleWebSelection = (id: string) => {
    setSelectedWebItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAssetSelection = (id: string) => {
    setSelectedAssets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 初始加载
  useEffect(() => {
    loadRssData();
    loadWebSearchData();
    loadAssetsData();
  }, [loadRssData, loadWebSearchData, loadAssetsData]);

  return (
    <div className="tab-panel research-panel animate-fade-in pb-32">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Stage 2</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Deep Research & Synthesis</span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white mb-2">Deep Research Stage</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl">Advanced contextual synthesis and data validation. Processing massive datasets into high-fidelity narratives.</p>
          </div>
          <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => onShowResearchConfigChange(!showResearchConfig)}>
                <span className="material-symbols-outlined text-[18px]">tune</span> {showResearchConfig ? 'Hide Strategy' : 'Refine Strategy'}
             </button>
             <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={onAddExternalLink}>
                <span className="material-symbols-outlined text-[18px]">add_link</span> Add Source
             </button>
          </div>
        </div>
      </header>

      {/* ========== Stepper Container ========== */}
      <div className="space-y-16">
        {/* ========== Section 1: Input ========== */}
        <section className="relative step-line step-line-active pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">link</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Input: Multi-Source Engine Configuration</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {task.research_data?.searchStats ? `${(task.research_data.searchStats.webSources || 0) + (task.research_data.searchStats.assetSources || 0)} Sources Linked` : 'Sources Standby'}
              </span>
            </div>
          </div>

          {/* Configuration Form if showResearchConfig is true */}
          {showResearchConfig && (
            <div className="info-card glass-card mb-6">
              <h3 className="card-title text-sm border-b border-slate-200 dark:border-slate-800 pb-2 mb-4">⚙️ 配置研究参数</h3>
              <div className="research-config-form text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={researchConfig.autoCollect} onChange={(e) => onResearchConfigChange({ ...researchConfig, autoCollect: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span className="font-bold">自动采集 (Auto Collect)</span>
                    </label>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">最大结果数 (Max Results)</label>
                      <input type="number" min={5} max={50} value={researchConfig.maxResults} onChange={(e) => onResearchConfigChange({ ...researchConfig, maxResults: parseInt(e.target.value) || 20 })} className="w-full p-2 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">最低可信度 (Min Credibility)</label>
                      <input type="number" step={0.1} min={0} max={1} value={researchConfig.minCredibility} onChange={(e) => onResearchConfigChange({ ...researchConfig, minCredibility: parseFloat(e.target.value) || 0.5 })} className="w-full p-2 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">时间范围 (Time Range)</label>
                      <select value={researchConfig.timeRange} onChange={(e) => onResearchConfigChange({ ...researchConfig, timeRange: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700">
                        <option value="7d">最近7天 (7 Days)</option>
                        <option value="30d">最近30天 (30 Days)</option>
                        <option value="90d">最近3个月 (90 Days)</option>
                        <option value="1y">最近1年 (1 Year)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-2">数据源 (Data Sources)</label>
                  <div className="flex gap-4">
                    {['web', 'rss', 'asset'].map((source) => (
                      <label key={source} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={researchConfig.sources.includes(source)} onChange={(e) => {
                            const newSources = e.target.checked ? [...researchConfig.sources, source] : researchConfig.sources.filter((s) => s !== source);
                            onResearchConfigChange({ ...researchConfig, sources: newSources });
                          }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-slate-700 dark:text-slate-300">{source === 'web' ? '网页网络 / Web' : source === 'rss' ? '资讯源 / RSS' : '私有素材 / Assets'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                   <div className="flex flex-col gap-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">关键词 (Include Keywords csv)</label>
                     <input type="text" value={researchConfig.keywords.join(', ')} onChange={(e) => onResearchConfigChange({ ...researchConfig, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} placeholder="Enter keywords..." className="w-full p-2 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700" />
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">排除词 (Exclude Keywords csv)</label>
                     <input type="text" value={researchConfig.excludeKeywords.join(', ')} onChange={(e) => onResearchConfigChange({ ...researchConfig, excludeKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} placeholder="Enter excludes..." className="w-full p-2 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700" />
                   </div>
                </div>

                <div className="flex justify-end">
                  <button className="px-5 py-2 bg-slate-900 border border-slate-900 text-white dark:bg-slate-700 font-bold rounded-lg text-sm hover:shadow-lg transition-all" onClick={onSaveResearchConfig} disabled={actionLoading === 'save-research-config'}>
                    {actionLoading === 'save-research-config' ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Config Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* Web Global Search Card */}
             <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-800 group flex flex-col">
                <div className="flex justify-between items-start mb-3">
                    <span className="material-symbols-outlined text-blue-500">language</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${researchConfig.sources.includes('web') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                          {researchConfig.sources.includes('web') ? 'Active' : 'Disabled'}
                      </span>
                      <button 
                        onClick={handleRetryWebSearch}
                        disabled={webSearchLoading || !researchConfig.sources.includes('web')}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                        title="重新加载热点话题"
                      >
                        <span className={`material-symbols-outlined text-sm ${webSearchLoading ? 'animate-spin' : ''}`}>refresh</span>
                      </button>
                    </div>
                </div>
                <h3 className="font-bold text-sm mb-1 truncate text-slate-800 dark:text-slate-200">Web Global Search</h3>
                <p className="text-xs text-slate-500 mb-3">Tavily & SERP integrated discovery engine...</p>
                
                {/* Web Search Items with Checkboxes */}
                <div className="flex-1 max-h-28 overflow-y-auto space-y-1 mb-2">
                  {webSearchLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                    </div>
                  ) : !researchConfig.sources.includes('web') ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">Web search disabled</p>
                  ) : webSearchResults.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">No results available</p>
                  ) : (
                    webSearchResults.slice(0, 5).map((item) => (
                      <label key={item.id} className="flex items-start gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedWebItems.has(item.id)}
                          onChange={() => toggleWebSelection(item.id)}
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate group-hover:text-blue-600 transition-colors">{item.title}</p>
                          <p className="text-[10px] text-slate-500">{item.source}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                
                {selectedWebItems.size > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-blue-600 font-medium">{selectedWebItems.size} selected</span>
                  </div>
                )}
                
                {/* Start Collection Button */}
                {researchConfig.sources.includes('web') && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 mt-auto">
                    <button
                      onClick={onCollectResearch}
                      disabled={actionLoading === 'collect-research'}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className={`material-symbols-outlined text-sm ${actionLoading === 'collect-research' ? 'animate-spin' : ''}`}>
                        {actionLoading === 'collect-research' ? 'sync' : 'travel_explore'}
                      </span>
                      {actionLoading === 'collect-research' ? '采集中...' : '开始采集'}
                    </button>
                    <p className="text-[9px] text-slate-400 text-center mt-1">调用 Tavily API 实时搜索</p>
                  </div>
                )}
             </div>

             {/* RSS Subscription Feeds Card */}
             <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-800 group flex flex-col">
                <div className="flex justify-between items-start mb-3">
                    <span className="material-symbols-outlined text-orange-500">rss_feed</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${researchConfig.sources.includes('rss') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                          {researchConfig.sources.includes('rss') ? 'Active' : 'Disabled'}
                      </span>
                      <button 
                        onClick={handleRetryRss}
                        disabled={rssLoading || !researchConfig.sources.includes('rss')}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                        title="重新加载 RSS"
                      >
                        <span className={`material-symbols-outlined text-sm ${rssLoading ? 'animate-spin' : ''}`}>refresh</span>
                      </button>
                    </div>
                </div>
                <h3 className="font-bold text-sm mb-1 truncate text-slate-800 dark:text-slate-200">RSS Subscription Feeds</h3>
                <p className="text-xs text-slate-500 mb-3">Real-time updates on targeted tech news...</p>
                
                {/* RSS Items with Checkboxes */}
                <div className="flex-1 max-h-28 overflow-y-auto space-y-1 mb-2">
                  {rssLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                    </div>
                  ) : !researchConfig.sources.includes('rss') ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">RSS feeds disabled</p>
                  ) : rssItems.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">No RSS items available</p>
                  ) : (
                    rssItems.slice(0, 5).map((item) => (
                      <label key={item.id} className="flex items-start gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedRssItems.has(item.id)}
                          onChange={() => toggleRssSelection(item.id)}
                          className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate group-hover:text-orange-600 transition-colors">{item.title}</p>
                          <p className="text-[10px] text-slate-500">{item.source_name}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                
                {selectedRssItems.size > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-orange-600 font-medium">{selectedRssItems.size} selected</span>
                  </div>
                )}
             </div>

             {/* Private Vector Assets Card */}
             <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-800 group flex flex-col">
                <div className="flex justify-between items-start mb-3">
                    <span className="material-symbols-outlined text-indigo-500">picture_as_pdf</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${researchConfig.sources.includes('asset') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                          {researchConfig.sources.includes('asset') ? 'Active' : 'Disabled'}
                      </span>
                      <button 
                        onClick={handleRetryAssets}
                        disabled={assetsLoading || !researchConfig.sources.includes('asset')}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                        title="重新加载 Assets"
                      >
                        <span className={`material-symbols-outlined text-sm ${assetsLoading ? 'animate-spin' : ''}`}>refresh</span>
                      </button>
                    </div>
                </div>
                <h3 className="font-bold text-sm mb-1 truncate text-slate-800 dark:text-slate-200">Private Vector Assets</h3>
                <p className="text-xs text-slate-500 mb-3">Internal PDF, Docs and historical reports...</p>
                
                {/* Assets with Checkboxes */}
                <div className="flex-1 max-h-28 overflow-y-auto space-y-1 mb-2">
                  {assetsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                    </div>
                  ) : !researchConfig.sources.includes('asset') ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">Assets source disabled</p>
                  ) : privateAssets.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-2">No assets available</p>
                  ) : (
                    privateAssets.slice(0, 5).map((item) => (
                      <label key={item.id} className="flex items-start gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedAssets.has(item.id)}
                          onChange={() => toggleAssetSelection(item.id)}
                          className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate group-hover:text-indigo-600 transition-colors">{item.title}</p>
                          <p className="text-[10px] text-slate-500">{item.source || 'Internal'}</p>
                        </div>
                      </label>
                    ))
                  )
                }
                </div>
                
                {selectedAssets.size > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-indigo-600 font-medium">{selectedAssets.size} selected</span>
                  </div>
                )}
             </div>
          </div>
          {researchConfig.keywords.length > 0 && (
             <div className="mt-4 flex gap-2 flex-wrap items-center">
                 <span className="text-xs font-bold text-slate-500 uppercase">Tags:</span>
                 {researchConfig.keywords.map((k, i) => (
                    <span key={i} className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded shadow-sm text-slate-600 dark:text-slate-300">{k}</span>
                 ))}
             </div>
          )}
        </section>

        {/* ========== Section 2: Process ========== */}
        <section className={`relative step-line pl-12 ${hasResearchData ? 'step-line-active' : ''}`}>
          <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center z-10 shadow-lg ${hasResearchData ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
            <span className="material-symbols-outlined">psychology</span>
          </div>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold font-headline">Process: AI Synthesis & Validation</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Multi-dimensional synthesis processing unstructured data flows...</p>
            </div>
            {hasResearchData ? (
                <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">100%</span>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Progress</p>
                </div>
            ) : actionLoading === 'collect-research' ? (
                <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 animate-pulse">45%</span>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Processing...</p>
                </div>
            ) : null}
          </div>

          {!hasResearchData ? (
             <div className="bg-surface-container-lowest rounded-2xl p-6 border border-transparent shadow-sm">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Processing Module 1: Data Aggregation */}
                  <div className="bg-surface-container-low p-5 rounded-xl border border-transparent">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary" data-icon="database">database</span>
                        <span className="text-sm font-bold text-on-surface">Data Aggregation</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${actionLoading === 'collect-research' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                        {actionLoading === 'collect-research' ? 'Processing' : 'Waiting'}
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                       <div className={`bg-primary h-full rounded-full transition-all duration-[3000ms] ${actionLoading === 'collect-research' ? 'w-[75%]' : 'w-0'}`}></div>
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-2">Multi-source data fusion and normalization</p>
                  </div>
                  {/* Processing Module 2: Fact-Checking */}
                  <div className="bg-surface-container-low p-5 rounded-xl border border-transparent">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-tertiary" data-icon="fact_check">fact_check</span>
                        <span className="text-sm font-bold text-on-surface">Fact-Checking</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${actionLoading === 'collect-research' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                        {actionLoading === 'collect-research' ? 'Queued' : 'Waiting'}
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                       <div className={`bg-tertiary h-full rounded-full transition-all duration-1000 ${actionLoading === 'collect-research' ? 'w-[10%]' : 'w-0'}`}></div>
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-2">Cross-validation and credibility scoring</p>
                  </div>
                  {/* Processing Module 3: Insight Generation */}
                  <div className="bg-surface-container-low p-5 rounded-xl border border-transparent">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary" data-icon="lightbulb">lightbulb</span>
                        <span className="text-sm font-bold text-on-surface">Insight Generation</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">Waiting</span>
                    </div>
                    <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                       <div className="bg-secondary h-0 rounded-full transition-all duration-1000"></div>
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-2">AI-driven pattern recognition and synthesis</p>
                  </div>
               </div>
             </div>
          ) : (
             <div className="space-y-6">
                {/* 数据审核表格 */}
                {task.research_data.annotations && task.research_data.annotations.length > 0 && (
                  <div className="bg-surface-container-lowest rounded-xl p-5 border border-transparent shadow-sm">
                    <div className="border-b border-outline-variant/20 pb-3 mb-4">
                        <h3 className="text-base font-bold flex items-center gap-2 m-0 text-on-surface">
                          <span className="material-symbols-outlined text-primary" data-icon="checklist">checklist</span> 
                          数据审核面板 (Annotation Review)
                        </h3>
                    </div>
                    <DataReviewTable
                      annotations={task.research_data.annotations}
                      onSelectionChange={(ids) => console.log('Selected:', ids)}
                      onConfirm={(ids) => alert(`确认选择 ${ids.length} 条数据`)}
                    />
                  </div>
                )}

                {/* 数据清洗面板 - 单独一行 */}
                {task.research_data.annotations && task.research_data.annotations.length > 0 && (
                  <div className="bg-surface-container-lowest rounded-xl p-5 border border-transparent shadow-sm">
                    <div className="border-b border-outline-variant/20 pb-3 mb-4">
                        <h3 className="text-base font-bold flex items-center gap-2 m-0 text-on-surface">
                          <span className="material-symbols-outlined text-tertiary" data-icon="cleaning_services">cleaning_services</span> 
                          数据清洗 (Data Scrubber)
                        </h3>
                    </div>
                    <DataCleaningPanel
                      annotations={task.research_data.annotations}
                      onClean={(cleaned) => console.log('Cleaned annotations:', cleaned)}
                    />
                  </div>
                )}

                {/* 三列布局：交叉验证 + 外部链接 + 内部素材 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* 交叉验证面板 */}
                    <div className="bg-surface-container-lowest rounded-xl p-5 border border-transparent shadow-sm">
                      <div className="border-b border-outline-variant/20 pb-3 mb-4">
                        <h3 className="text-base font-bold flex items-center gap-2 m-0 text-on-surface">
                          <span className="material-symbols-outlined text-secondary" data-icon="done_all">done_all</span> 
                          多维交叉验证 (Cross Validation)
                        </h3>
                      </div>
                      <CrossValidationPanel
                        results={task.research_data.validation_results || []}
                        onResolve={(id, source) => console.log('Resolved:', id, source)}
                      />
                    </div>

                    {/* 外部链接 */}
                    <div className="bg-surface-container-low rounded-xl p-5 border border-transparent">
                      <h3 className="text-sm font-bold border-b border-outline-variant/20 pb-2 mb-4 text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary" data-icon="link">link</span>
                        External Reference Discovery
                      </h3>
                      {task.research_data.annotations ? (
                        <ExternalLinksList annotations={task.research_data.annotations} />
                      ) : (
                        <p className="text-xs text-on-surface-variant">No external references available</p>
                      )}
                    </div>

                    {/* 内部素材 */}
                    <div className="bg-surface-container-low rounded-xl p-5 border border-transparent">
                      <h3 className="text-sm font-bold border-b border-outline-variant/20 pb-2 mb-4 text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-tertiary" data-icon="folder">folder</span>
                        Internal Asset Matched
                      </h3>
                      {task.research_data.annotations ? (
                        <AssetLinksList annotations={task.research_data.annotations} />
                      ) : (
                        <p className="text-xs text-on-surface-variant">No internal assets matched</p>
                      )}
                    </div>
                </div>
             </div>
          )}
        </section>

        {/* ========== Section 3: Output ========== */}
        <section className="relative pl-12">
          <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center z-10 shadow-lg ${hasResearchData ? 'bg-orange-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
            <span className="material-symbols-outlined">auto_stories</span>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Output: Synthesized Research Report</h3>
          </div>

          {!hasResearchData ? (
             <div className="empty-state py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
               <div className="empty-icon text-6xl mb-4 opacity-50">🔍</div>
               <div className="empty-title text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Awaiting Intelligence Processing</div>
               <p className="text-slate-500">Initiate global search from the bottom control bar to generate the synthesis report.</p>
             </div>
          ) : (
             <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 lg:p-10 shadow-xl shadow-black/[0.03] border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-10 pb-6 border-b border-slate-200 dark:border-slate-800">
                  <span className="material-symbols-outlined text-orange-600 dark:text-orange-500 text-3xl">collections_bookmark</span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Research Final Brief</h2>
                </div>
                
                <div className="max-w-4xl space-y-12">
                     {/* 动态渲染 Insights */}
                     {task.research_data.insights?.length > 0 && task.research_data.insights.map((insight: any, idx: number) => {
                         const confColor = insight.confidence >= 0.8 ? 'green' : insight.confidence >= 0.6 ? 'orange' : 'red';
                         return (
                            <div key={insight.id || idx} className="space-y-4">
                                <div className="flex items-center gap-3">
                                   <span className="px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full">Insight {String(idx + 1).padStart(2, '0')}</span>
                                   <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                       {insight.type === 'data' ? <span className="material-symbols-outlined text-sm text-blue-500">bar_chart</span> :
                                        insight.type === 'trend' ? <span className="material-symbols-outlined text-sm text-orange-500">trending_up</span> :
                                        insight.type === 'case' ? <span className="material-symbols-outlined text-sm text-purple-500">menu_book</span> : 
                                        <span className="material-symbols-outlined text-sm text-amber-500">person</span>}
                                       {insight.type.toUpperCase()} THEME
                                   </h3>
                                </div>
                                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-lg">
                                    {insight.content}
                                </p>
                                <div className="bg-slate-50 dark:bg-slate-800/50 border-l-4 border-indigo-200 dark:border-indigo-800 p-4 rounded-r-xl italic text-sm text-slate-600 dark:text-slate-400 flex justify-between items-center">
                                    <span>Source: {insight.source}</span>
                                    <span className={`font-bold text-${confColor}-600 dark:text-${confColor}-400`}>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                         );
                     })}

                     {/* 引用来源汇总 (Citation Bento) */}
                     {task.research_data.sources?.length > 0 && (
                         <div className="pt-8 border-t border-slate-200 dark:border-slate-800 mt-12">
                             <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Citations & Top References</h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               {task.research_data.sources.slice(0, 6).map((source: any, idx: number) => {
                                 const reliability = source.reliability || 0.6;
                                 const level = reliability >= 0.9 ? 'A' : reliability >= 0.7 ? 'B' : reliability >= 0.5 ? 'C' : 'D';
                                 
                                 return (
                                   <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl flex items-start gap-3 border border-slate-100 dark:border-slate-700">
                                      <span className="material-symbols-outlined text-blue-500 text-xl flex-shrink-0 mt-0.5">description</span>
                                      <div className="flex-1 overflow-hidden">
                                         <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${level === 'A' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>Level {level}</span>
                                            <span className="text-xs text-slate-500">Reliability {(reliability * 100).toFixed(0)}%</span>
                                         </div>
                                         <h5 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{source.name}</h5>
                                         <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">View Source &rarr;</a>
                                      </div>
                                   </div>
                                 );
                               })}
                             </div>
                         </div>
                     )}
                </div>
             </div>
          )}
        </section>
      </div>

      {/* ========== Bottom Global Action Bar ========== */}
      <div className="fixed bottom-0 left-[256px] right-0 h-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-center px-8 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
             <span className="text-sm font-medium text-slate-500">
               Status: <span className={`uppercase font-bold ${task.status === 'researching' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>{task.status.replace('_', ' ')}</span>
             </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2" 
               onClick={() => onRedoStage('research')}
               disabled={actionLoading === 'redo-research'}>
                <span className="material-symbols-outlined text-lg">sync</span>
                {actionLoading === 'redo-research' ? 'Restarting...' : 'Redo Full Research'}
            </button>
            <button className="px-6 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-lg shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"
                onClick={onCollectResearch}
                disabled={actionLoading === 'collect-research'}>
                {actionLoading === 'collect-research' ? 
                  <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span> Connecting Engine...</> : 
                  <>{hasResearchData ? 'Update Intelligence' : 'Start Research Engine'} <span className="material-symbols-outlined text-lg">play_arrow</span></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
