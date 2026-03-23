import { useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import type { BlueTeamReview, DraftVersion } from '../../types';
import { DocumentEditor, type CommentItem } from '../../components/DocumentEditor';
import { FinalDecisionSection } from '../../components/FinalDecisionSection';
import { BlueTeamPanel } from '../../components/BlueTeamPanel';
import { SequentialPanel } from '../../components/SequentialPanel';
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { ReviewConfigPanel } from '../../components/ReviewConfigPanel';
import { blueTeamApi, tasksApi } from '../../api/client';
import type { ReviewConfig } from '../../types';

// Icons definition
const REVIEW_ICONS: Record<string, string> = {
  challenger: '⚡',
  expander: '🔍',
  synthesizer: '💡',
  fact_checker: '🔍',
  logic_checker: '🧩',
  domain_expert: '🎓',
  reader_rep: '👁️',
};

// 专家角色配置
const EXPERT_ROLES: Record<string, { name: string; icon: string; color: string; desc: string }> = {
  challenger: { name: '批判者', icon: '⚡', color: '#ef4444', desc: '挑战观点' },
  expander: { name: '拓展者', icon: '🔍', color: '#f59e0b', desc: '扩展视角' },
  synthesizer: { name: '提炼者', icon: '💡', color: '#06b6d4', desc: '归纳提炼' },
  fact_checker: { name: '事实核查员', icon: '🔍', color: '#ef4444', desc: '数据准确性' },
  logic_checker: { name: '逻辑检察官', icon: '🧩', color: '#f59e0b', desc: '论证严密性' },
  domain_expert: { name: '行业专家', icon: '🎓', color: '#06b6d4', desc: '专业深度' },
  reader_rep: { name: '读者代表', icon: '👁️', color: '#10b981', desc: '可读性' }
};

type ReviewTab = 'blue-team' | 'sequential';
type SidebarView = 'timeline' | 'compare';

// Define the context type expected from TaskDetailLayout
interface TaskContext {
  task: {
    id: string;
    topic: string;
    status: string;
    versions?: DraftVersion[];
    [key: string]: any;
  };
  reviews: BlueTeamReview[];
  reviewSummary: {
    total: number;
    critical: number;
    warning: number;
    praise: number;
    accepted: number;
    ignored: number;
    pending: number;
  };
  onReviewDecision: (reviewId: string, questionId: string, decision: 'accept' | 'ignore' | 'manual_resolved', note?: string) => void;
  onBatchDecision: (decision: 'accept' | 'ignore') => void;
  onReReview: (expertRole: string) => void;
  onRedoReview: (config?: any) => void;
}

export function ReviewsTab() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ReviewTab>('blue-team');
  const [decisionStatus, setDecisionStatus] = useState<'pending' | 'accepted' | 'overridden'>('pending');
  const [decisionLoading, setDecisionLoading] = useState(false);
  
  // 批量选择状态
  const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  
  // Finalize 异步状态
  type FinalizeStatusType = {
    status: 'idle' | 'doing' | 'completed' | 'failed';
    progress: number;
    message: string;
    error?: string;
  };
  const [finalizeStatus, setFinalizeStatus] = useState<FinalizeStatusType>({ status: 'idle', progress: 0, message: '' });

  // Version comparison state
  const [sidebarView, setSidebarView] = useState<SidebarView>('timeline');
  const [compareVersions, setCompareVersions] = useState<[number, number] | undefined>();
  
  // 配置面板状态
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const {
    task,
    reviews = [],
    reviewSummary = { total: 0, critical: 0, warning: 0, praise: 0, accepted: 0, ignored: 0, pending: 0 },
    onBatchDecision,
    onReReview,
    onRedoReview,
  } = useOutletContext<TaskContext>();

  // 处理单个评论接受
  const handleCommentAccept = async (commentId: string) => {
    try {
      // commentId 格式是 "reviewId::questionIndex"
      const parts = commentId.split('::');
      const reviewId = parts[0];
      const questionIndex = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
      
      if (reviewId) {
        await blueTeamApi.submitDecision(task.id, reviewId, {
          decision: 'accept',
          questionIndex,
        });
        // 刷新页面数据
        window.location.reload();
      }
    } catch (error) {
      console.error('接受评论失败:', error);
      alert('操作失败，请重试');
    }
  };

  // 处理单个评论忽略
  const handleCommentIgnore = async (commentId: string) => {
    try {
      // commentId 格式是 "reviewId::questionIndex"
      const parts = commentId.split('::');
      const reviewId = parts[0];
      const questionIndex = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
      
      if (reviewId) {
        await blueTeamApi.submitDecision(task.id, reviewId, {
          decision: 'ignore',
          questionIndex,
        });
        window.location.reload();
      }
    } catch (error) {
      console.error('忽略评论失败:', error);
      alert('操作失败，请重试');
    }
  };

  // 处理接受并Finalize（异步版本）
  const handleAccept = async () => {
    const selectedIds = Array.from(selectedComments);
    // 从 commentId (格式: "reviewId::questionIndex") 提取 reviewIds
    const reviewIds = selectedIds.length > 0 
      ? [...new Set(selectedIds.map(id => id.split('::')[0]))]
      : undefined;
    
    const confirmMsg = selectedIds.length > 0 
      ? `确定要 Finalize 选中的 ${selectedIds.length} 条评审意见吗？`
      : '确定要接受并 Finalize 所有评审意见吗？';
    
    if (!confirm(confirmMsg)) return;
    
    setDecisionLoading(true);
    setFinalizeStatus({ status: 'doing', progress: 0, message: '启动 Finalize 任务...' });
    
    try {
      // 1. 启动异步 Finalize
      const result = await tasksApi.finalize(task.id, reviewIds);
      
      if (!result.success) {
        setFinalizeStatus({ status: 'failed', progress: 0, message: '', error: result.error });
        alert(`❌ Finalize 失败: ${result.error || '未知错误'}`);
        return;
      }
      
      // 2. 轮询状态
      const pollInterval = setInterval(async () => {
        try {
          const status = await tasksApi.getFinalizeStatus(task.id);
          
          setFinalizeStatus({
            status: status.status === 'pending' ? 'idle' : status.status as FinalizeStatusType['status'],
            progress: status.progress,
            message: status.message,
            error: status.error,
          });
          
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setDecisionStatus('accepted');
            alert(`✅ Finalize 完成！\n最终稿件ID: ${status.finalDraftId || 'N/A'}\n\n即将跳转到任务列表...`);
            setTimeout(() => navigate('/tasks'), 2000);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            alert(`❌ Finalize 失败: ${status.error || '未知错误'}`);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 2000); // 每2秒轮询一次
      
    } catch (error) {
      console.error('Accept failed:', error);
      setFinalizeStatus({ status: 'failed', progress: 0, message: '', error: '操作失败' });
      alert('操作失败，请重试');
    } finally {
      setDecisionLoading(false);
    }
  };

  // 处理Manual Override (Ignore all)
  const handleOverride = async () => {
    if (!confirm('确定要忽略所有评审意见并手动覆盖吗？')) return;
    setDecisionLoading(true);
    try {
      await onBatchDecision('ignore');
      setDecisionStatus('overridden');
    } catch (error) {
      console.error('Override failed:', error);
    } finally {
      setDecisionLoading(false);
    }
  };

  // 处理配置确认
  const handleConfigConfirm = async (config: ReviewConfig) => {
    setShowConfigPanel(false);
    
    if (!confirm('确定要使用新配置重新运行评审吗？')) return;
    
    setDecisionLoading(true);
    try {
      await onRedoReview?.(config);
      alert('评审已重新启动，请稍候刷新查看结果');
    } catch (error) {
      console.error('Redo review failed:', error);
      alert('重新启动评审失败');
    } finally {
      setDecisionLoading(false);
    }
  };

  // 批量选择相关函数
  const toggleSelectComment = (commentId: string) => {
    setSelectedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const selectAllComments = () => {
    const pendingComments = comments.filter(c => c.status === 'pending');
    setSelectedComments(new Set(pendingComments.map(c => c.id)));
  };

  const clearSelection = () => {
    setSelectedComments(new Set());
  };

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    if (selectMode) {
      clearSelection();
    }
  };

  // Convert BlueTeamReview[] to CommentItem[] for DocumentEditor
  // 优先从 question_decisions 获取状态，如果没有则使用 review 级别状态
  const comments: CommentItem[] = useMemo(() => {
    const items: CommentItem[] = [];
    reviews.forEach(review => {
      const icon = REVIEW_ICONS[review.expert_role] || '👤';
      const reviewStatus = review.user_decision || review.status;
      
      review.questions?.forEach((q: any, idx: number) => {
        const severityMap: Record<string, 'critical' | 'warning' | 'info' | 'praise'> = {
          high: 'critical',
          medium: 'warning', 
          low: 'info',
          praise: 'praise',
          info: 'info'
        };
        
        const severity = severityMap[q.severity] || 'info';
        
        // 优先使用 question 级别的决策状态 (q.decision 来自后端返回的 question_decisions 数据)
        const questionDecision = q.decision || q.status;
        let status: 'pending' | 'accepted' | 'ignored';
        
        if (questionDecision === 'accept' || questionDecision === 'accepted') {
          status = 'accepted';
        } else if (questionDecision === 'ignore' || questionDecision === 'ignored') {
          status = 'ignored';
        } else {
          // 如果 question 没有单独决策，回退到 review 级别状态
          // reviewStatus 类型: 'pending' | 'completed' | 'revise' | 'reject' + user_decision: 'accept' | 'revise' | 'reject'
          const decisionStr = String(reviewStatus);
          status = decisionStr === 'accept' ? 'accepted' 
                 : decisionStr === 'ignore' ? 'ignored' 
                 : 'pending';
        }
        
        items.push({
          id: `${review.id}::${idx}`,
          content: q.question || 'No question provided',
          author: `${icon} ${review.expert_role?.replace('_', ' ')}`,
          authorType: 'ai',
          authorRole: review.expert_role,
          severity: severity,
          timestamp: (review as any).created_at || (review as any).createdAt || new Date().toISOString(),
          location: `Q${idx + 1}`,
          suggestion: q.suggestion,
          status,
        });
      });
    });
    return items;
  }, [reviews]);

  // 生成待办任务列表（从已接受的评审意见）
  const tasks = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      status: 'pending' | 'in_progress' | 'completed';
      assignee?: string;
    }> = [];
    
    comments.forEach(comment => {
      if (comment.status === 'accepted') {
        // 为每个接受的评审意见生成一个待办任务
        items.push({
          id: `task-${comment.id}`,
          title: comment.suggestion || `处理: ${comment.content.slice(0, 50)}...`,
          status: 'pending',
          assignee: comment.author,
        });
      }
    });
    
    return items;
  }, [comments]);

  // Debug: log task data
  console.log('[ReviewsTab] task:', task?.id, 'draft_versions:', task?.draft_versions?.length, 'versions:', task?.versions?.length);
  
  // Get versions from task and deduplicate by content
  const rawVersions: DraftVersion[] = task?.draft_versions || task?.versions || [];
  
  // Deduplicate: use content hash (first 500 chars + length) to identify unique versions
  const seenContents = new Set<string>();
  const versions = rawVersions.filter((v) => {
    const content = v.content || '';
    // Use first 500 chars + total length as unique identifier
    const contentHash = `${content.slice(0, 500)}_${content.length}`;
    if (seenContents.has(contentHash)) {
      return false;
    }
    seenContents.add(contentHash);
    return true;
  });
  
  console.log('[ReviewsTab] Deduplication:', rawVersions.length, '->', versions.length, 'versions');
  
  // Get latest version content for the editor
  const currentVersion = versions[versions.length - 1];
  const documentContent = currentVersion?.content || task?.final_draft || '# Draft Title\n\nDraft content will appear here...';
  
  // Generate sub-versions (e.g., 1.1, 1.2) for versions with same major version number
  const versionGroups = new Map<number, number>();
  const versionWithSubVersions = versions.map((v, index) => {
    const majorVersion = v.version || 1;
    const count = versionGroups.get(majorVersion) || 0;
    versionGroups.set(majorVersion, count + 1);
    
    // Find how many versions have the same major version
    const sameMajorVersions = versions.filter(v2 => v2.version === majorVersion);
    
    // If only one version with this major number, use it directly
    // Otherwise, append sub-version number
    const subVersion = sameMajorVersions.findIndex(v2 => v2.id === v.id) + 1;
    const displayVersion = sameMajorVersions.length === 1 
      ? `${majorVersion}` 
      : `${majorVersion}.${subVersion}`;
    
    return {
      ...v,
      displayVersion,
    };
  });
  
  // Convert versions to history items for DocumentEditor
  const history = versionWithSubVersions.map((v) => ({
    id: v.id,
    version: `v${v.displayVersion}`,
    title: v.change_summary || `Version ${v.displayVersion}`,
    timestamp: v.created_at,
    author: 'System',
  }));

  // Determine sequential review count
  const sequentialCount = 5; // Fixed 5 rounds for sequential review

  // Handle version comparison from DocumentEditor history tab
  const handleHistorySelect = (item: { id: string; version: string }) => {
    const versionNum = parseInt(item.version.replace('v', '').split('.')[0]);
    const currentVersionNum = currentVersion?.version || versions.length;

    if (versionNum !== currentVersionNum) {
      setCompareVersions([versionNum, currentVersionNum]);
      setSidebarView('compare');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-headline font-bold text-2xl text-slate-900 dark:text-white">
          Review & Feedback
        </h1>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-bold rounded-full">
            {reviewSummary.total} Reviews
          </span>
        </div>
      </div>

      {/* Finalize 进度条 */}
      {finalizeStatus.status === 'doing' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin">refresh</span>
              Finalize 进行中...
            </span>
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{finalizeStatus.progress}%</span>
          </div>
          <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${finalizeStatus.progress}%` }}
            />
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">{finalizeStatus.message}</p>
        </div>
      )}

      {finalizeStatus.status === 'failed' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <span className="material-symbols-outlined">error</span>
            <span className="font-medium">Finalize 失败</span>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{finalizeStatus.error}</p>
        </div>
      )}

      {/* 批量选择工具栏 */}
      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelectMode}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectMode 
                ? 'bg-primary text-white' 
                : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-sm">checklist</span>
            {selectMode ? '退出选择' : '批量选择'}
          </button>
          
          {selectMode && (
            <>
              <button
                onClick={selectAllComments}
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-primary px-2"
              >
                全选
              </button>
              <button
                onClick={clearSelection}
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-primary px-2"
              >
                清空
              </button>
              <span className="text-sm text-slate-500">
                已选 {selectedComments.size} 条
              </span>
            </>
          )}
        </div>
        
        {selectMode && selectedComments.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const selectedArray = Array.from(selectedComments);
                Promise.all(selectedArray.map(id => handleCommentAccept(id)));
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              接受
            </button>
            <button
              onClick={handleAccept}
              disabled={decisionLoading || finalizeStatus.status === 'doing'}
              className="flex items-center gap-2 px-4 py-1.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              Finalize ({selectedComments.size})
            </button>
          </div>
        )}
      </div>

      {/* Document Editor with Version Comparison */}
      {sidebarView === 'compare' ? (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden">
          <VersionComparePanel
            versions={versions}
            currentVersion={currentVersion?.version}
            onRollback={(versionId) => console.log('Rollback to:', versionId)}
            onApprove={() => setSidebarView('timeline')}
            initialCompareVersions={compareVersions}
          />
        </div>
      ) : (
        <DocumentEditor 
          content={documentContent}
          comments={comments}
          history={history}
          tasks={tasks}
          version={currentVersion ? `v${versionWithSubVersions[versionWithSubVersions.length - 1]?.displayVersion || currentVersion.version}` : undefined}
          onCommentAccept={handleCommentAccept}
          onCommentIgnore={handleCommentIgnore}
          onHistorySelect={handleHistorySelect}
          selectMode={selectMode}
          selectedComments={selectedComments}
          onToggleSelect={toggleSelectComment}
        />
      )}

      {/* 专家评审分工 & 配置 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">groups</span>
            专家评审分工
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfigPanel(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="重新配置并运行评审"
            >
              <span className="material-symbols-outlined text-sm">settings</span>
              配置
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(EXPERT_ROLES).slice(0, 4).map(([role, info]) => {
            const hasReview = reviews.some(r => r.expert_role === role);
            return (
              <div 
                key={role} 
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                style={{ borderLeftColor: info.color, borderLeftWidth: '3px' }}
              >
                <span className="text-xl">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-900 dark:text-white truncate">{info.name}</div>
                  <div className="text-xs text-slate-500 truncate">{info.desc}</div>
                </div>
                {hasReview && task?.status === 'awaiting_approval' && (
                  <button
                    onClick={() => onReReview?.(role)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title={`申请${info.name}重新评审`}
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span>
                  </button>
                )}
                {hasReview && (
                  <span className="w-2 h-2 rounded-full bg-green-500" title="已有评审" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('blue-team')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-colors relative ${
              activeTab === 'blue-team'
                ? 'text-primary'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined">groups</span>
            Blue Team Review
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              activeTab === 'blue-team'
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {reviewSummary.total}
            </span>
            {activeTab === 'blue-team' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          
          <button
            onClick={() => setActiveTab('sequential')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-colors relative ${
              activeTab === 'sequential'
                ? 'text-tertiary'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined">playlist_add_check</span>
            Sequential Queue
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              activeTab === 'sequential'
                ? 'bg-tertiary text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {sequentialCount}
            </span>
            {activeTab === 'sequential' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-tertiary" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'blue-team' && (
            <BlueTeamPanel reviews={reviews} reviewSummary={reviewSummary} />
          )}
          {activeTab === 'sequential' && (
            <SequentialPanel taskId={task?.id} />
          )}
        </div>
      </div>

      {/* Final Decision Section */}
      <FinalDecisionSection
        taskId={task?.id}
        reviewSummary={reviewSummary}
        versions={versions}
        comments={comments}
        status={decisionStatus}
        onAccept={handleAccept}
        onOverride={handleOverride}
        loading={decisionLoading}
      />

      {/* Review Config Panel */}
      <ReviewConfigPanel
        isOpen={showConfigPanel}
        onClose={() => setShowConfigPanel(false)}
        onConfirm={handleConfigConfirm}
      />
    </div>
  );
}
