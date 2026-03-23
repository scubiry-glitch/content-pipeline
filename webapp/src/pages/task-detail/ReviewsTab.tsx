import { useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import type { BlueTeamReview, CommentItem, DraftVersion } from '../../types';
import { DocumentEditor } from '../../components/DocumentEditor';
import { FinalDecisionSection } from '../../components/FinalDecisionSection';
import { BlueTeamPanel } from '../../components/BlueTeamPanel';
import { SequentialPanel } from '../../components/SequentialPanel';
import { blueTeamApi, tasksApi } from '../../api/client';

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

type ReviewTab = 'blue-team' | 'sequential';

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
  const { 
    task, 
    reviews = [], 
    reviewSummary = { total: 0, critical: 0, warning: 0, praise: 0, accepted: 0, ignored: 0, pending: 0 },
    onBatchDecision,
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

  // 处理接受并Finalize
  const handleAccept = async () => {
    if (!confirm('确定要接受并 finalize 所有评审意见吗？')) return;
    setDecisionLoading(true);
    try {
      // 1. 先批量接受所有待处理的评审
      await onBatchDecision('accept');
      
      // 2. 调用 finalize API 完成任务
      const result = await tasksApi.finalize(task.id);
      
      if (result.success) {
        setDecisionStatus('accepted');
        alert(`✅ 任务已完成！\n最终稿件ID: ${result.finalDraftId || 'N/A'}\n\n即将跳转到任务列表...`);
        // 3. 跳转到任务列表
        navigate('/tasks');
      } else {
        alert(`❌ Finalize 失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Accept failed:', error);
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
          status = reviewStatus === 'accept' || reviewStatus === 'accepted' ? 'accepted' 
                 : reviewStatus === 'ignore' || reviewStatus === 'ignored' ? 'ignored' 
                 : 'pending';
        }
        
        items.push({
          id: `${review.id}::${idx}`,
          content: q.question || 'No question provided',
          author: `${icon} ${review.expert_role?.replace('_', ' ')}`,
          authorType: 'ai',
          authorRole: review.expert_role,
          severity: severity,
          timestamp: review.created_at || new Date().toISOString(),
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

      {/* Document Editor */}
      <DocumentEditor 
        content={documentContent}
        comments={comments}
        history={history}
        tasks={tasks}
        version={currentVersion ? `v${versionWithSubVersions[versionWithSubVersions.length - 1]?.displayVersion || currentVersion.version}` : undefined}
        onCommentAccept={handleCommentAccept}
        onCommentIgnore={handleCommentIgnore}
      />

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
    </div>
  );
}
