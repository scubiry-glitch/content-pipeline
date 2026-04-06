// 任务详情 - 选题策划 Tab
// 布局逻辑: 1.输出 2.输入 3.加工 4.辅助工具(悬浮)
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { VersionTimeline } from '../../components/content';
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { tasksApi, rssSourcesApi, hotTopicsApi, researchApi } from '../../api/client';
import type { Task, OutlineComment, OutlineVersion } from '../../types';
import type { RSSItem, HotTopic } from '../../api/client';

interface TaskContext {
  task: Task;
  editingOutline: boolean;
  outlineDraft: string;
  actionLoading: string | null;
  onEditOutline: () => void;
  onSaveOutline: () => void;
  onCancelEdit: () => void;
  onOutlineChange: (value: string) => void;
  onConfirmOutline: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review', data?: any) => void;
}

// 编辑器模式：edit(编辑) | preview(预览) | split(分屏)
type EditorMode = 'edit' | 'preview' | 'split';

export function PlanningTab() {
  const {
    task,
    editingOutline,
    outlineDraft,
    actionLoading,
    onEditOutline,
    onSaveOutline,
    onCancelEdit,
    onOutlineChange,
    onConfirmOutline,
    onRedoStage,
  } = useOutletContext<TaskContext>();
  
  const outline = (task.outline || {}) as any;
  const evaluation = task.evaluation as any;
  const competitorAnalysis = (task.competitor_analysis || {}) as any;
  
  // 编辑器模式切换
  const [editorMode, setEditorMode] = useState<EditorMode>('preview');
  
  // Refs for scrolling
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef<HTMLDivElement>(null);

  // ===== 评论相关状态 =====
  const [comments, setComments] = useState<OutlineComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // ===== 版本历史相关状态 =====
  const [versions, setVersions] = useState<OutlineVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [versionOutline, setVersionOutline] = useState<any>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [compareVersions, setCompareVersions] = useState<[number, number] | undefined>();

  // 构建包含当前大纲的版本列表（兼容旧任务没有 outline_versions 的情况）
  const getVersionsWithCurrent = useCallback((): OutlineVersion[] => {
    if (versions.length > 0) return versions;
    
    // 如果没有版本历史但 task.outline 存在，显示当前大纲作为 v1
    if (task.outline && task.outline.sections && task.outline.sections.length > 0) {
      return [{
        id: 'current',
        version: 1,
        task_id: task.id,
        outline: task.outline,
        comment: '当前版本（自动生成）',
        created_by: 'system',
        created_at: task.created_at || new Date().toISOString(),
      }];
    }
    return [];
  }, [versions, task.outline, task.id, task.created_at]);

  // ===== 专家评审状态 =====
  const [expertReviewLoading, setExpertReviewLoading] = useState(false);
  const [expertReviewResult, setExpertReviewResult] = useState<any>(null);
  const [showExpertReview, setShowExpertReview] = useState(false);

  // ===== 重做对话框状态 =====
  const [showRedoDialog, setShowRedoDialog] = useState(false);
  const [redoComment, setRedoComment] = useState('');
  const [isRedoing, setIsRedoing] = useState(false);

  // ===== Multi-source Discovery 状态 =====
  // RSS 数据
  const [rssItems, setRssItems] = useState<RSSItem[]>([]);
  const [rssLoading, setRssLoading] = useState(false);
  const [selectedRssItems, setSelectedRssItems] = useState<Set<string>>(new Set());

  // Web Search 数据
  const [webSearchResults, setWebSearchResults] = useState<HotTopic[]>([]);
  const [webSearchLoading, setWebSearchLoading] = useState(false);
  const [selectedWebItems, setSelectedWebItems] = useState<Set<string>>(new Set());

  // Community Topics 数据
  const [communityTopics, setCommunityTopics] = useState<HotTopic[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [selectedCommunityItems, setSelectedCommunityItems] = useState<Set<string>>(new Set());

  // 平滑滚动到指定区域
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 处理编辑模式切换
  const handleEditClick = () => {
    setEditorMode('split');
    onEditOutline();
  };

  const handleSaveClick = () => {
    onSaveOutline();
    setEditorMode('preview');
  };

  const handleCancelClick = () => {
    onCancelEdit();
    setEditorMode('preview');
  };

  // ===== 加载评论 =====
  const loadComments = useCallback(async () => {
    if (!task.id) return;
    setLoadingComments(true);
    try {
      const result = await tasksApi.getOutlineComments(task.id);
      setComments(result.items || []);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoadingComments(false);
    }
  }, [task.id]);

  // ===== 添加评论 =====
  const handleAddComment = async () => {
    if (!newComment.trim() || !task.id) return;
    try {
      await tasksApi.addOutlineComment(task.id, newComment.trim());
      setNewComment('');
      loadComments();
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('添加评论失败');
    }
  };

  // ===== 删除评论 =====
  const handleDeleteComment = async (commentId: string) => {
    if (!task.id || !confirm('确定要删除这条评论吗？')) return;
    try {
      await tasksApi.deleteOutlineComment(task.id, commentId);
      loadComments();
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('删除评论失败');
    }
  };

  // ===== 加载版本历史 =====
  const loadVersions = useCallback(async () => {
    if (!task.id) return;
    setLoadingVersions(true);
    try {
      const result = await tasksApi.getOutlineVersions(task.id);
      setVersions(result.items || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  }, [task.id]);

  // ===== 切换版本查看 =====
  const handleVersionChange = async (version: number | null) => {
    setSelectedVersion(version);
    if (version === null) {
      setVersionOutline(null);
      return;
    }
    if (!task.id) return;
    try {
      const result = await tasksApi.getOutlineVersion(task.id, version);
      setVersionOutline(result.outline);
    } catch (error) {
      console.error('Failed to load version:', error);
      alert('加载版本失败');
    }
  };

  // ===== 处理版本对比 =====
  const handleVersionCompare = (selectedVersions: [number, number]) => {
    setCompareVersions(selectedVersions);
    setShowVersionCompare(true);
  };

  // ===== 重做选题策划 =====
  const handleRedoClick = () => {
    // 收集所有评论作为上下文
    const commentTexts = comments.map(c => c.content);
    
    if (commentTexts.length === 0) {
      // 没有评论，直接重做
      if (confirm('确定要重做选题策划吗？当前大纲将被保存到历史版本。')) {
        onRedoStage('planning', { comment: '重做前版本' });
      }
      return;
    }
    
    // 有评论，显示对话框
    setShowRedoDialog(true);
    setRedoComment(commentTexts.join('\n'));
  };

  const handleConfirmRedo = async () => {
    setIsRedoing(true);
    const commentTexts = comments.map(c => c.content);
    if (redoComment.trim()) {
      commentTexts.push(redoComment.trim());
    }
    
    onRedoStage('planning', { 
      comments: commentTexts,
      comment: redoComment.trim() || '重做前版本'
    });
    
    setShowRedoDialog(false);
    setIsRedoing(false);
    
    // 清空评论
    setComments([]);
  };

  // ===== 专家评审大纲 =====
  const handleExpertReview = async () => {
    if (!task.id) return;
    setExpertReviewLoading(true);
    try {
      const result = await tasksApi.expertReviewOutline(task.id, { autoRevise: true });
      setExpertReviewResult(result);
      setShowExpertReview(true);
    } catch (error) {
      console.error('Failed to get expert review:', error);
      alert('专家评审失败，请稍后重试');
    } finally {
      setExpertReviewLoading(false);
    }
  };

  // 采纳专家修订版大纲
  const handleAcceptRevisedOutline = async () => {
    if (!expertReviewResult?.revisedOutline || !task.id) return;
    try {
      await tasksApi.confirmOutline(task.id);
      // 刷新页面数据
      window.location.reload();
    } catch (error) {
      console.error('Failed to apply revised outline:', error);
      alert('应用修订大纲失败');
    }
  };

  // ===== 加载 RSS 数据 =====
  const loadRssData = useCallback(async () => {
    setRssLoading(true);
    try {
      const result = await rssSourcesApi.getItems({ limit: 5 });
      setRssItems(result.items || []);
    } catch (error) {
      console.error('Failed to load RSS items:', error);
    } finally {
      setRssLoading(false);
    }
  }, []);

  // ===== 加载 Web Search 数据 =====
  const loadWebSearchData = useCallback(async () => {
    setWebSearchLoading(true);
    try {
      // 使用 Tavily 实时搜索预览（与 Research 页面对齐）
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
  }, [task.id]);

  // ===== 加载 Community Topics 数据 =====
  const loadCommunityData = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const result = await hotTopicsApi.getAll({ limit: 5, trend: 'up' });
      setCommunityTopics(result.items || []);
    } catch (error) {
      console.error('Failed to load community topics:', error);
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  // ===== 重试功能 =====
  const handleRetryRss = async () => {
    await loadRssData();
  };

  const handleRetryWebSearch = async () => {
    await loadWebSearchData();
  };

  const handleRetryCommunity = async () => {
    await loadCommunityData();
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

  const toggleCommunitySelection = (id: string) => {
    setSelectedCommunityItems(prev => {
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
    loadComments();
    loadVersions();
    loadRssData();
    loadWebSearchData();
    loadCommunityData();
  }, [loadComments, loadVersions, loadRssData, loadWebSearchData, loadCommunityData]);

  // 将大纲转换为 Markdown 格式
  const outlineToMarkdown = (ol: any = outline) => {
    if (!ol?.sections || ol.sections.length === 0) return '';
    
    let md = `# ${ol.title || task.topic}\n\n`;
    
    ol.sections.forEach((section: any, idx: number) => {
      md += `## ${idx + 1}. ${section.title}\n\n`;
      
      if (section.content) {
        md += `${section.content}\n\n`;
      }
      
      if (section.subsections?.length > 0) {
        section.subsections.forEach((sub: any, sidx: number) => {
          md += `### ${idx + 1}.${sidx + 1} ${sub.title}\n\n`;
          if (sub.content) {
            md += `${sub.content}\n\n`;
          }
        });
      }
      
      if (section.key_points?.length > 0) {
        md += `**要点：**\n\n`;
        section.key_points.forEach((point: string) => {
          md += `- ${point}\n`;
        });
        md += `\n`;
      }
    });
    
    return md;
  };

  // Convert outline versions to DraftVersion format for VersionComparePanel
  const outlineVersionsForCompare = useMemo(() => {
    return getVersionsWithCurrent().map(v => ({
      id: v.id || `v${v.version}`,
      task_id: task.id,
      version: v.version,
      created_at: v.created_at,
      change_summary: v.comment || `Version ${v.version}`,
      created_by: v.created_by,
      content: outlineToMarkdown(v.outline),
    }));
  }, [versions, task.outline, getVersionsWithCurrent, task.id]);

  // 当前显示的大纲（可能是历史版本）
  const displayOutline = versionOutline || outline;

  return (
    <div className="tab-panel planning-panel animate-fade-in pb-32 max-w-5xl mx-auto">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-on-surface-variant mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">Stage 1</span>
          <span className="material-symbols-outlined text-sm" data-icon="chevron_right">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Ideation & Topic Planning</span>
        </div>
        <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface">Topic Discovery & Analysis</h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl">Leveraging multi-source intelligence to identify high-potential content angles and structured outlines.</p>
      </header>

      {/* ========== Stepper Container ========== */}
      <div className="space-y-16">
        {/* ========== Section 1: Input ========== */}
        <section ref={inputRef} className="relative step-line step-line-active pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined" data-icon="input">input</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline text-on-surface">Input: Multi-source Discovery</h3>
            <div className="px-3 py-1 bg-primary-container text-on-primary-container text-xs font-bold rounded-full flex items-center gap-2">
              <span className="material-symbols-outlined text-xs" data-icon="hub">hub</span>
              Unified 24 topic entities
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* RSS Source */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-transparent hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="material-symbols-outlined text-tertiary" data-icon="rss_feed">rss_feed</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-tertiary px-2 py-0.5 bg-tertiary-container/10 rounded">Live</span>
                  <button 
                    onClick={handleRetryRss}
                    disabled={rssLoading}
                    className="p-1 hover:bg-surface-container rounded transition-colors"
                    title="重新加载"
                  >
                    <span className={`material-symbols-outlined text-sm ${rssLoading ? 'animate-spin' : ''}`}>refresh</span>
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-sm mb-2 text-on-surface">RSS Subscription Feeds</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">TechCrunch, Wired, and 12 other industry signals active.</p>
              
              {/* RSS Items List with Checkboxes */}
              <div className="flex-1 max-h-32 overflow-y-auto space-y-2 mb-3">
                {rssLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="material-symbols-outlined animate-spin text-on-surface-variant">sync</span>
                  </div>
                ) : rssItems.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic text-center py-2">No RSS items available</p>
                ) : (
                  rssItems.slice(0, 5).map((item) => (
                    <label key={item.id} className="flex items-start gap-2 p-2 hover:bg-surface-container rounded cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedRssItems.has(item.id)}
                        onChange={() => toggleRssSelection(item.id)}
                        className="mt-0.5 rounded border-outline-variant text-tertiary focus:ring-tertiary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface truncate group-hover:text-tertiary transition-colors">{item.title}</p>
                        <p className="text-[10px] text-on-surface-variant">{item.source_name}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              
              <div className="mt-auto pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed animate-pulse"></span>
                  <span className="text-[10px] text-on-surface-variant font-medium">{rssItems.length} items loaded</span>
                </div>
                {selectedRssItems.size > 0 && (
                  <span className="text-[10px] text-tertiary font-medium">{selectedRssItems.size} selected</span>
                )}
              </div>
            </div>

            {/* Web Search Source */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-transparent hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="material-symbols-outlined text-primary" data-icon="travel_explore">travel_explore</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-primary px-2 py-0.5 bg-primary-container/10 rounded">Tavily AI</span>
                  <button 
                    onClick={handleRetryWebSearch}
                    disabled={webSearchLoading}
                    className="p-1 hover:bg-surface-container rounded transition-colors"
                    title="重新加载"
                  >
                    <span className={`material-symbols-outlined text-sm ${webSearchLoading ? 'animate-spin' : ''}`}>refresh</span>
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-sm mb-2 text-on-surface">Web Global Search</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">Deep-crawling global context and technical documentation.</p>
              
              {/* Web Search Items List with Checkboxes */}
              <div className="flex-1 max-h-32 overflow-y-auto space-y-2 mb-3">
                {webSearchLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="material-symbols-outlined animate-spin text-on-surface-variant">sync</span>
                  </div>
                ) : webSearchResults.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic text-center py-2">No search results available</p>
                ) : (
                  webSearchResults.slice(0, 5).map((item) => (
                    <label key={item.id} className="flex items-start gap-2 p-2 hover:bg-surface-container rounded cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedWebItems.has(item.id)}
                        onChange={() => toggleWebSelection(item.id)}
                        className="mt-0.5 rounded border-outline-variant text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface truncate group-hover:text-primary transition-colors">{item.title}</p>
                        <p className="text-[10px] text-on-surface-variant">{item.source} · Score: {((item as any).relevance ? (item as any).relevance * 100 : item.hotScore)?.toFixed(0) || 'N/A'}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              
              <div className="mt-auto pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                <span className="text-[10px] text-on-surface-variant font-medium">{webSearchResults.length} sources indexed</span>
                {selectedWebItems.size > 0 && (
                  <span className="text-[10px] text-primary font-medium">{selectedWebItems.size} selected</span>
                )}
              </div>
            </div>

            {/* Community Source */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-transparent hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="material-symbols-outlined text-error" data-icon="groups">groups</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-error px-2 py-0.5 bg-error-container/10 rounded">Social</span>
                  <button 
                    onClick={handleRetryCommunity}
                    disabled={communityLoading}
                    className="p-1 hover:bg-surface-container rounded transition-colors"
                    title="重新加载"
                  >
                    <span className={`material-symbols-outlined text-sm ${communityLoading ? 'animate-spin' : ''}`}>refresh</span>
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-sm mb-2 text-on-surface">Community Topics</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">Sentiment tracking on XHS, Weibo, and Reddit developer subs.</p>
              
              {/* Community Topics List with Checkboxes */}
              <div className="flex-1 max-h-32 overflow-y-auto space-y-2 mb-3">
                {communityLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="material-symbols-outlined animate-spin text-on-surface-variant">sync</span>
                  </div>
                ) : communityTopics.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic text-center py-2">No community topics available</p>
                ) : (
                  communityTopics.slice(0, 5).map((item) => (
                    <label key={item.id} className="flex items-start gap-2 p-2 hover:bg-surface-container rounded cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedCommunityItems.has(item.id)}
                        onChange={() => toggleCommunitySelection(item.id)}
                        className="mt-0.5 rounded border-outline-variant text-error focus:ring-error"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface truncate group-hover:text-error transition-colors">{item.title}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[10px] px-1 rounded ${item.trend === 'up' ? 'bg-green-100 text-green-700' : item.trend === 'down' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                            {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
                          </span>
                          <span className="text-[10px] text-on-surface-variant">{item.source}</span>
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              
              <div className="mt-auto pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 bg-surface-container text-[10px] rounded font-medium text-on-surface">#AI_ethics</span>
                  <span className="px-2 py-0.5 bg-surface-container text-[10px] rounded font-medium text-on-surface">#GPT-5</span>
                </div>
                {selectedCommunityItems.size > 0 && (
                  <span className="text-[10px] text-error font-medium">{selectedCommunityItems.size} selected</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ========== Section 2: Process ========== */}
        <section ref={processRef} className="relative step-line step-line-active pl-12">
            <div className="absolute left-0 top-0 w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center z-10 shadow-lg">
              <span className="material-symbols-outlined" data-icon="memory">memory</span>
            </div>
            <h3 className="text-xl font-bold font-headline mb-6 text-on-surface">Process: AI Analysis & Ranking</h3>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Ranking Engine */}
              <div className="lg:col-span-8 bg-surface-container-lowest p-6 rounded-xl border border-transparent shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-20 h-20 rounded-full border-[6px] border-primary-container flex items-center justify-center relative">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle className="text-primary" cx="40" cy="40" fill="transparent" r="34" stroke="currentColor" strokeDasharray="213.6" strokeDashoffset={213.6 * (1 - (evaluation?.score || 92) / 100)} strokeWidth="6"></circle>
                    </svg>
                    <span className="text-xl font-black text-on-surface">{evaluation?.score || 92}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-on-surface">Unified Confidence</h4>
                    <p className="text-sm text-on-surface-variant">High editorial potential based on cross-source validation.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h5 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Verification Matrix</h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-surface-container-low p-3 rounded-lg border-l-4 border-secondary-fixed">
                      <p className="text-[10px] text-on-surface-variant font-bold mb-1">RSS News</p>
                      <p className="text-sm font-semibold text-on-surface">Matched</p>
                    </div>
                    <div className="bg-surface-container-low p-3 rounded-lg border-l-4 border-secondary-fixed">
                      <p className="text-[10px] text-on-surface-variant font-bold mb-1">Web Context</p>
                      <p className="text-sm font-semibold text-on-surface">Validated</p>
                    </div>
                    <div className="bg-surface-container-low p-3 rounded-lg border-l-4 border-tertiary-fixed">
                      <p className="text-[10px] text-on-surface-variant font-bold mb-1">Community Sentiment</p>
                      <p className="text-sm font-semibold text-on-surface">Partial</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sentiment Panel */}
              <div className="lg:col-span-4 bg-primary text-on-primary p-6 rounded-xl shadow-lg flex flex-col justify-between">
                <div>
                  <h4 className="font-bold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl" data-icon="analytics">analytics</span>
                    Sentiment/Gap Score
                  </h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span>User Interest</span>
                      <span className="font-bold">88%</span>
                    </div>
                    <div className="w-full bg-white/20 h-1.5 rounded-full">
                      <div className="bg-white h-full w-[88%]"></div>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-4">
                      <span>Content Saturation</span>
                      <span className="font-bold">12%</span>
                    </div>
                    <div className="w-full bg-white/20 h-1.5 rounded-full">
                      <div className="bg-white h-full w-[12%]"></div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Editorial Verdict</p>
                  <p className="text-sm font-medium leading-relaxed">Topic is "Underserved" with viral potential in developer circles.</p>
                </div>
              </div>
            </div>
          </section>

        {/* ========== Section 3: Output (with Version Compare) ========== */}
        {showVersionCompare ? (
          <section className="relative pl-12 mb-8">
            <div className="absolute left-0 top-0 w-10 h-10 bg-tertiary text-on-tertiary rounded-full flex items-center justify-center z-10 shadow-lg">
              <span className="material-symbols-outlined">compare</span>
            </div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold font-headline text-on-surface">Version Comparison</h3>
              <button
                onClick={() => setShowVersionCompare(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface flex items-center gap-2"
              >
                <span className="material-symbols-outlined">close</span>
                Close Compare
              </button>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden">
              <VersionComparePanel
                versions={outlineVersionsForCompare}
                currentVersion={selectedVersion || undefined}
                onRollback={(versionId) => console.log('Rollback to:', versionId)}
                onApprove={() => setShowVersionCompare(false)}
                initialCompareVersions={compareVersions}
              />
            </div>
          </section>
        ) : null}

        {/* ========== Section 3: Output ========== */}
        <section ref={outputRef} className="relative pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-tertiary text-on-tertiary rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined" data-icon="auto_awesome">auto_awesome</span>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold font-headline text-on-surface">Output: Topic Outline Preview</h3>
            
            <div className="flex items-center gap-4">
               {/* Editor Mode Toggle */}
               {!editingOutline && displayOutline?.sections && displayOutline.sections.length > 0 && !selectedVersion && (
                  <div className="flex bg-surface-container-low p-0.5 rounded-lg border border-outline-variant/20">
                    <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${editorMode === 'edit' ? 'bg-primary text-on-primary shadow shadow-primary/20' : 'text-on-surface-variant hover:text-on-surface'}`} onClick={() => setEditorMode('edit')}>✏️ Edit</button>
                    <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${editorMode === 'preview' ? 'bg-primary text-on-primary shadow shadow-primary/20' : 'text-on-surface-variant hover:text-on-surface'}`} onClick={() => setEditorMode('preview')}>👁️ Preview</button>
                    <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${editorMode === 'split' ? 'bg-primary text-on-primary shadow shadow-primary/20' : 'text-on-surface-variant hover:text-on-surface'}`} onClick={() => setEditorMode('split')}>⬌ Split</button>
                  </div>
               )}

               {actionLoading === 'confirm-outline' ? (
                 <div className="flex items-center gap-2 px-3 py-1 bg-tertiary-container/10 border border-tertiary/20 rounded-full">
                   <span className="w-2 h-2 rounded-full bg-tertiary animate-ping"></span>
                   <span className="text-xs font-bold text-tertiary">Streaming Generation...</span>
                 </div>
               ) : (
                 <div className="flex items-center gap-2">
                   {getVersionsWithCurrent().length > 0 && (
                     <select 
                       value={selectedVersion || ''} 
                       onChange={(e) => handleVersionChange(e.target.value ? parseInt(e.target.value) : null)}
                       className="version-select border-outline-variant/30 bg-surface-container-lowest text-on-surface text-sm rounded-lg px-2 py-1"
                     >
                       <option value="">当前最新版本</option>
                       {getVersionsWithCurrent().map((v) => (
                         <option key={v.version} value={v.version}>
                           V{v.version} - {new Date(v.created_at).toLocaleDateString()}
                         </option>
                       ))}
                     </select>
                   )}
                 </div>
               )}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-transparent shadow-sm overflow-hidden">
            <div className="p-6 border-b border-surface-container">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">description</span>
                  {editingOutline ? 'Markdown Source Editor' : 'Generated Document Overview'}
                </h4>
                <span className="text-xs font-medium px-2 py-1 bg-surface-container rounded-md text-on-surface-variant">ID: {task.id.slice(-8).toUpperCase()}</span>
              </div>
              <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    task.current_stage?.includes('generat') || task.current_stage?.includes('regenerat') 
                      ? 'bg-tertiary animate-pulse' 
                      : 'bg-tertiary'
                  }`}
                  style={{ 
                    width: task.current_stage?.includes('generat') || task.current_stage?.includes('regenerat')
                      ? `${Math.max((task.progress || 0), 5)}%`
                      : task.status === 'planning' ? '65%' : '100%'
                  }}
                ></div>
              </div>
            </div>

            <div className="p-0">
               {editingOutline ? (
                 <div className={`flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-outline-variant/10 min-h-[500px] mode-${editorMode}`}>
                   {(editorMode === 'edit' || editorMode === 'split') && (
                     <div className="flex-1 p-6 bg-surface-container-lowest flex flex-col">
                       <textarea
                         value={outlineDraft}
                         onChange={(e) => onOutlineChange(e.target.value)}
                         className="flex-1 w-full p-4 font-mono text-sm bg-surface-container-low text-on-surface border border-outline-variant/30 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary resize-y min-h-[300px]"
                       />
                       <div className="mt-4 flex justify-end gap-3 shrink-0">
                         <button className="px-5 py-2 border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container text-sm font-bold transition-colors" onClick={handleCancelClick}>Cancel Edit</button>
                         <button className="px-5 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-dim text-sm font-bold shadow-md transition-colors" onClick={handleSaveClick}>Save Draft</button>
                       </div>
                     </div>
                   )}
                   {(editorMode === 'preview' || editorMode === 'split') && (
                     <div className="flex-1 p-6 bg-white prose max-w-none overflow-y-auto">
                       <MarkdownRenderer content={outlineToMarkdown()} />
                     </div>
                   )}
                 </div>
               ) : displayOutline?.sections && displayOutline.sections.length > 0 ? (
                 <div className={`flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-outline-variant/10 min-h-[500px] mode-${editorMode}`}>
                    {(editorMode === 'edit' || editorMode === 'split') && (
                     <div className="flex-1 p-6 bg-surface-container-low/50 flex flex-col relative">
                       <div className="absolute inset-0 flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-[2px] z-10">
                          <button className="px-6 py-3 bg-primary text-on-primary font-bold rounded-lg shadow-lg flex items-center gap-2 hover:scale-105 transition-transform" onClick={handleEditClick}>
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                            Click to Edit Source
                          </button>
                       </div>
                       <textarea
                         value={outlineToMarkdown(displayOutline)}
                         readOnly
                         className="flex-1 w-full p-4 font-mono text-sm bg-surface-container-low text-on-surface border border-outline-variant/30 rounded-lg opacity-50 resize-none min-h-[300px]"
                       />
                     </div>
                   )}
                   {(editorMode === 'preview' || editorMode === 'split') && (
                     <div className="flex-1 p-8 bg-white prose max-w-none">
                       <MarkdownRenderer content={outlineToMarkdown(displayOutline)} />
                     </div>
                   )}
                 </div>
               ) : task.current_stage?.includes('generat') || task.current_stage?.includes('regenerat') ? (
                  <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
                    <div className="relative mb-6">
                      <div className="w-16 h-16 rounded-full border-4 border-surface-container border-t-primary animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-2xl">psychology</span>
                      </div>
                    </div>
                    <h5 className="font-bold text-xl text-on-surface mb-3">AI Generating Outline...</h5>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-3 py-1 bg-tertiary-container/20 text-tertiary text-xs font-bold rounded-full animate-pulse">
                        Stage: {task.current_stage?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-on-surface-variant">Progress: {task.progress || 0}%</span>
                    </div>
                    <div className="w-64 h-2 bg-surface-container rounded-full overflow-hidden mb-4">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all duration-1000"
                        style={{ width: `${Math.max((task.progress || 0), 10)}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-on-surface-variant max-w-md text-center leading-relaxed">
                      The AI is analyzing multi-source intelligence and structuring your content outline. 
                      This typically takes 30s - 2 minutes. Please wait...
                    </p>
                  </div>
               ) : (
                  <div className="p-12 text-center text-on-surface-variant flex flex-col items-center justify-center min-h-[300px]">
                    <span className="material-symbols-outlined text-border mb-4 text-5xl opacity-40">hourglass_empty</span>
                    <h5 className="font-bold text-lg text-on-surface mb-2">Outline Not Generated Yet</h5>
                    <p className="text-sm max-w-sm">The planning topology is currently computing. Please wait for the initial generation stage to complete before viewing the structural outline.</p>
                  </div>
               )}
            </div>
          </div>
        </section>

        {/* ========== Section 4: Feedback & Versions Board ========== */}
        <section className="pt-8 mt-16 border-t border-outline-variant/10">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             {/* 评论交互区 */}
             <div>
                <h3 className="text-lg font-bold font-headline mb-4 flex items-center gap-2 text-on-surface"><span className="material-symbols-outlined text-tertiary">chat</span> Feedback Interventions</h3>
                <div className="bg-surface-container-lowest p-4 rounded-xl border border-transparent shadow-sm">
                  <div className="comment-input-area mb-4">
                    <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Drop expert critiques or manual overrides here..." className="w-full p-3 text-sm bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary mb-2" rows={3} />
                    <button className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary-dim transition-colors" onClick={handleAddComment} disabled={!newComment.trim()}>Push Feedback</button>
                  </div>
                  
                  <div className="comments-list space-y-3 max-h-[400px] overflow-auto">
                    {loadingComments ? (
                      <div className="text-sm text-on-surface-variant p-4 text-center">Loading...</div>
                    ) : comments.length === 0 ? (
                      <div className="text-sm text-on-surface-variant p-4 text-center italic">No interventions tracked.</div>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="comment-item bg-surface-container-low p-3 rounded-lg border border-transparent">
                          <div className="comment-header flex justify-between items-center mb-2">
                            <span className="comment-author text-xs font-bold text-tertiary">{comment.created_by}</span>
                            <div className="flex items-center gap-2">
                              <span className="comment-time text-[10px] text-on-surface-variant">{new Date(comment.created_at).toLocaleString()}</span>
                              <button className="text-on-surface-variant hover:text-error text-xs" onClick={() => handleDeleteComment(comment.id)}>✕</button>
                            </div>
                          </div>
                          <div className="comment-content text-sm text-on-surface">{comment.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
             </div>

             {/* 版本历史区 */}
             <div>
                <h3 className="text-lg font-bold font-headline mb-4 flex items-center gap-2 text-on-surface"><span className="material-symbols-outlined text-primary">history</span> Version Timeline</h3>
                <div className="bg-surface-container-lowest rounded-xl border border-transparent shadow-sm">
                   {getVersionsWithCurrent().length === 0 ? (
                      <div className="text-sm text-on-surface-variant p-4 text-center italic">No snapshots recorded yet.</div>
                   ) : (
                      <VersionTimeline
                        versions={getVersionsWithCurrent().map((v: OutlineVersion) => ({
                          id: v.id || `v${v.version}`,
                          version: v.version,
                          created_at: v.created_at,
                          change_summary: v.comment || '',
                          created_by: v.created_by,
                        }))}
                        currentVersion={selectedVersion || undefined}
                        onVersionSelect={(version) => handleVersionChange(version)}
                        onViewDetail={(v) => handleVersionChange(v.version)}
                        onCompare={handleVersionCompare}
                        maxHeight="500px"
                        enableCompare={true}
                      />
                   )}
                </div>
             </div>
           </div>
        </section>
      </div>

      {/* ========== Bottom Global Action Bar ========== */}
      <div className="fixed bottom-0 left-[256px] right-0 h-24 bg-white/80 backdrop-blur-md border-t border-outline-variant/10 z-40 flex items-center justify-center px-8">
        <div className="max-w-5xl w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
             <span className="text-sm font-medium text-on-surface-variant">
               Status: <span className={`uppercase font-bold ${task.status === 'planning' ? 'text-primary' : 'text-on-surface'}`}>{task.status.replace('_', ' ')}</span>
             </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="px-6 py-3 border border-outline-variant text-on-surface font-bold text-sm rounded-lg hover:bg-surface-container transition-all active:scale-95 flex items-center gap-2" onClick={handleRedoClick}>
                <span className="material-symbols-outlined text-lg">refresh</span>
                Regenerate Stage
            </button>
            {(task.status === 'planning' || (task as any).status === 'outline_pending') && !editingOutline && !selectedVersion && (
            <>
            <button className="px-6 py-3 border border-tertiary text-tertiary font-bold text-sm rounded-lg hover:bg-tertiary/10 transition-all active:scale-95 flex items-center gap-2"
                onClick={handleExpertReview}
                disabled={expertReviewLoading}>
                {expertReviewLoading ? (
                  <>
                    <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                    评审中...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">psychology</span>
                    专家评审
                  </>
                )}
            </button>
            <button className="px-8 py-3 bg-primary text-on-primary font-bold text-sm rounded-lg shadow-lg hover:bg-primary-dim transition-all active:scale-95 flex items-center gap-2"
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}>
                {actionLoading === 'confirm-outline' ? 'Streaming...' : 'Proceed Details'}
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
            </>
            )}
          </div>
        </div>
      </div>

      {/* ========== 重做对话框 ========== */}
      {showRedoDialog && (
        <div className="modal-overlay fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
          <div className="modal-content bg-surface-container-lowest rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-on-surface mb-2">🔄 重做选题策划</h3>
            <p className="text-sm text-on-surface-variant mb-4">当前大纲将被保存到历史版本，并根据以下评论重新生成大纲：</p>
            
            <div className="bg-surface-container-low p-4 rounded-lg mb-4">
              <h4 className="text-xs font-bold text-on-surface-variant mb-2">已添加的评论 ({comments.length})：</h4>
              <ul className="text-sm text-on-surface space-y-1 list-disc pl-4">
                {comments.map((c, i) => (
                  <li key={c.id}>{c.content.substring(0, 50)}{c.content.length > 50 ? '...' : ''}</li>
                ))}
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-on-surface mb-2">补充修改意见（可选）：</label>
              <textarea
                value={redoComment}
                onChange={(e) => setRedoComment(e.target.value)}
                placeholder="输入额外的修改建议..."
                rows={4}
                className="w-full p-3 text-sm bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 border border-outline-variant text-on-surface font-bold text-sm rounded-lg hover:bg-surface-container"
                onClick={() => setShowRedoDialog(false)}
              >
                取消
              </button>
              <button 
                className="px-4 py-2 bg-primary text-on-primary font-bold text-sm rounded-lg hover:bg-primary-dim"
                onClick={handleConfirmRedo}
                disabled={isRedoing}
              >
                {isRedoing ? '启动中...' : '确认重做'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 专家评审结果面板 ========== */}
      {showExpertReview && expertReviewResult && (
        <div className="modal-overlay fixed inset-0 bg-black/50 z-[100] flex items-center justify-center overflow-y-auto py-8">
          <div className="modal-content bg-surface-container-lowest rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">psychology</span>
                专家评审结果
              </h3>
              <button onClick={() => setShowExpertReview(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* 共识概览 */}
            <div className="bg-tertiary/10 p-4 rounded-lg mb-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-bold text-tertiary">
                  {expertReviewResult.consensus?.avgScore?.toFixed(1)}/10
                </span>
                <span className="text-sm text-on-surface-variant">综合评分</span>
              </div>
              {expertReviewResult.consensus?.commonStrengths?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-bold text-on-surface-variant">亮点：</span>
                  <ul className="text-sm text-on-surface list-disc pl-5 mt-1">
                    {expertReviewResult.consensus.commonStrengths.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {expertReviewResult.consensus?.commonIssues?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-bold text-on-surface-variant">风险：</span>
                  <ul className="text-sm text-on-surface list-disc pl-5 mt-1">
                    {expertReviewResult.consensus.commonIssues.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {expertReviewResult.consensus?.keyRecommendations?.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-on-surface-variant">关键建议：</span>
                  <ol className="text-sm text-on-surface list-decimal pl-5 mt-1">
                    {expertReviewResult.consensus.keyRecommendations.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* 各专家评审详情 */}
            <div className="space-y-3 mb-4">
              {expertReviewResult.reviews?.map((review: any) => (
                <div key={review.expertId} className="border border-outline-variant/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-on-surface">{review.expertName}</span>
                    <span className="text-sm font-bold text-tertiary">{review.overallScore}/10</span>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-2">{review.overallComment}</p>
                  {review.suggestions?.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs font-bold text-on-surface-variant">修改建议：</span>
                      <ul className="text-xs text-on-surface list-disc pl-4 mt-1">
                        {review.suggestions.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {review.sectionReviews?.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs font-bold text-on-surface-variant cursor-pointer">
                        逐章评审 ({review.sectionReviews.length} 章)
                      </summary>
                      <div className="mt-2 space-y-1">
                        {review.sectionReviews.map((sr: any, i: number) => (
                          <div key={i} className="text-xs p-2 bg-surface-container-low rounded">
                            <div className="flex justify-between">
                              <span className="font-medium">{sr.sectionTitle}</span>
                              <span className="text-tertiary font-bold">{sr.score}/10</span>
                            </div>
                            <p className="text-on-surface-variant mt-1">{sr.comment}</p>
                            {sr.suggestedChange && (
                              <p className="text-primary mt-1">建议: {sr.suggestedChange}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/30">
              <button
                className="px-4 py-2 border border-outline-variant text-on-surface font-bold text-sm rounded-lg hover:bg-surface-container"
                onClick={() => setShowExpertReview(false)}
              >
                关闭
              </button>
              {expertReviewResult.revisedOutline && (
                <button
                  className="px-4 py-2 bg-tertiary text-on-tertiary font-bold text-sm rounded-lg hover:opacity-90 flex items-center gap-2"
                  onClick={handleAcceptRevisedOutline}
                >
                  <span className="material-symbols-outlined text-sm">check</span>
                  采纳修订版大纲
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的元素引用 */}
      <div ref={versionRef} style={{ display: 'none' }} />
    </div>
  );
}
