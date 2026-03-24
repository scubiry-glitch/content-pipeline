import { useState, useMemo, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import type { BlueTeamReview, DraftVersion } from '../../types';
import { DocumentEditor, type CommentItem } from '../../components/DocumentEditor';
import type { HighlightItem } from '../../components/MarkdownRenderer';
import { FinalDecisionSection } from '../../components/FinalDecisionSection';
import { BlueTeamPanel } from '../../components/BlueTeamPanel';
import { SequentialPanel } from '../../components/SequentialPanel';
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { ReviewConfigPanel } from '../../components/ReviewConfigPanel';
import { LivePreviewMarkdown } from '../../components/content';
import { blueTeamApi, tasksApi } from '../../api/client';
import type { ReviewConfig } from '../../types';
import { useStreamingBlueTeam } from '../../hooks/useStreamingBlueTeam';
import { useStreamingSequentialReview } from '../../hooks/useStreamingSequentialReview';

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
  
  // 文档查看模式：preview | source
  const [docViewMode, setDocViewMode] = useState<'preview' | 'source'>('preview');
  
  // 配置面板状态
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  
  // Streaming 蓝军评审状态
  const [streamingComments, setStreamingComments] = useState<any[]>([]);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  
  // 蓝军 Streaming Hook
  const blueTeamStreaming = useStreamingBlueTeam({
    onComment: (comment) => {
      setStreamingComments(prev => [...prev, comment]);
    },
    onComplete: () => {
      setIsStreamingActive(false);
      // 刷新页面获取完整数据
      setTimeout(() => window.location.reload(), 1000);
    }
  });
  
  // 串行评审 Streaming Hook
  const sequentialStreaming = useStreamingSequentialReview({
    onComment: (comment) => {
      // 将串行评论转换为 CommentItem 格式
      const newComment: CommentItem = {
        id: comment.id,
        content: comment.question,
        author: `${comment.expertName} (第${comment.round}轮)`,
        authorType: 'ai',
        authorRole: comment.expertRole,
        severity: comment.severity === 'high' ? 'critical' : comment.severity === 'medium' ? 'warning' : 'info',
        timestamp: new Date().toISOString(),
        location: `R${comment.round}-Q${comment.index + 1}`,
        suggestion: comment.suggestion,
        status: 'pending'
      };
      setStreamingComments(prev => [...prev, newComment]);
    },
    onComplete: () => {
      setIsStreamingActive(false);
      setTimeout(() => window.location.reload(), 1000);
    }
  });
  
  const {
    task,
    reviews = [],
    reviewSummary = { total: 0, critical: 0, warning: 0, praise: 0, accepted: 0, ignored: 0, pending: 0 },
    onBatchDecision,
    onReReview,
    onRedoReview,
  } = useOutletContext<TaskContext>();
  
  // 根据任务状态自动启动 Streaming（扩大 stage 匹配范围）
  useEffect(() => {
    if (task?.status === 'reviewing' &&
        (task?.current_stage === 'blue_team_streaming' || task?.current_stage === 'blue_team_review')) {
      // 通过 fetchStatus 检查是否有活跃的 streaming，如有则自动连接
      blueTeamStreaming.fetchStatus(task.id);
    }
  }, [task?.id, task?.status, task?.current_stage]);

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
    console.log('[ReviewsTab] handleAccept called');
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

  // 处理强制 Finalize（忽略未处理的严重问题）
  const handleForceFinalize = async () => {
    const selectedIds = Array.from(selectedComments);
    const reviewIds = selectedIds.length > 0 
      ? [...new Set(selectedIds.map(id => id.split('::')[0]))]
      : undefined;
    
    const confirmMsg = selectedIds.length > 0 
      ? `⚠️ 强制 Finalize 选中的 ${selectedIds.length} 条评审意见？\n\n这将忽略所有未处理的严重问题，可能导致报告质量不达标。`
      : '⚠️ 强制 Finalize 所有评审意见？\n\n这将忽略所有未处理的严重问题，可能导致报告质量不达标。';
    
    if (!confirm(confirmMsg)) return;
    
    setDecisionLoading(true);
    setFinalizeStatus({ status: 'doing', progress: 0, message: '启动强制 Finalize 任务...' });
    
    try {
      // 1. 启动异步 Finalize（强制模式）
      const result = await tasksApi.finalize(task.id, reviewIds, true); // force = true
      
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
            alert(`✅ 强制 Finalize 完成！\n最终稿件ID: ${status.finalDraftId || 'N/A'}\n\n即将跳转到任务列表...`);
            setTimeout(() => navigate('/tasks'), 2000);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            alert(`❌ Finalize 失败: ${status.error || '未知错误'}`);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Force finalize failed:', error);
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

    // 提供保留历史评论的选项
    const preserveHistory = confirm(
      `确定要使用新配置重新运行评审吗？\n\n` +
      `点击"确定" = 保留前一轮评论\n` +
      `点击"取消" = 删除前一轮评论`
    );

    setDecisionLoading(true);
    try {
      await onRedoReview?.({ ...config, preserveHistory });
      // 立即激活 streaming，无需等待 loadTask 轮询
      setIsStreamingActive(true);
      setStreamingComments([]);
      if (config.mode === 'sequential' || config.mode === 'serial') {
        sequentialStreaming.reset();
        sequentialStreaming.connect(task.id);
      } else {
        blueTeamStreaming.connectSSE(task.id);
      }
    } catch (error) {
      console.error('Redo review failed:', error);
      setIsStreamingActive(false);
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
    console.log('[ReviewsTab] Building comments from reviews:', reviews.length, reviews);
    const items: CommentItem[] = [];
    reviews.forEach(review => {
      const icon = REVIEW_ICONS[review.expert_role] || '👤';
      const reviewStatus = review.user_decision || review.status;
      
      // 兼容 questions 是数组或单个对象的情况
      const questions = review.questions ? 
        (Array.isArray(review.questions) ? review.questions : [review.questions]) : [];
      
      questions.forEach((q: any, idx: number) => {
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
        
        // 优先使用专家名字，其次是 role 名称
        const expertDisplayName = review.expert_name || review.expert_role?.replace('_', ' ') || 'Unknown';
        
        items.push({
          id: `${review.id}::${idx}`,
          content: q.question || 'No question provided',
          author: `${icon} ${expertDisplayName}`,
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
    
    // 合并 Streaming 评论（去重）
    const existingIds = new Set(items.map(i => i.id));
    const uniqueStreaming = streamingComments.filter(c => !existingIds.has(c.id));
    
    return [...items, ...uniqueStreaming];
  }, [reviews, streamingComments]);

  // 生成文档高亮数据 - 根据评论的严重程度和引用文本
  const highlights: HighlightItem[] = useMemo(() => {
    const items: HighlightItem[] = [];

    comments.forEach(comment => {
      // 只高亮 pending 状态的评论
      if (comment.status !== 'pending') return;

      const colorMap: Record<string, 'blue' | 'orange' | 'red'> = {
        info: 'blue',
        warning: 'orange',
        critical: 'red',
        praise: 'blue',
      };

      const color = colorMap[comment.severity] || 'blue';
      const content = comment.content;
      let highlightText = '';

      // 策略1: 提取引号内文本（含中文引号 「」『』""''《》【】）
      const quoteMatch = content.match(/["""'「『《【'"\u201c\u201d]([^"""'」』》】'"\u201c\u201d]{5,200})["""'」』》】'"\u201c\u201d]/);
      if (quoteMatch) {
        highlightText = quoteMatch[1].slice(0, 100);
      }
      // 策略2: 使用 suggestion（去掉 100 字符上限，截取前 150 字符）
      if (!highlightText && comment.suggestion && comment.suggestion.length > 5) {
        highlightText = comment.suggestion.slice(0, 150);
      }
      // 策略3: 兜底 — 从评论正文提取首个完整中文句子
      if (!highlightText && content.length > 10) {
        const sentenceMatch = content.match(/[^。？！\n]{10,80}[。？！]/);
        if (sentenceMatch) {
          highlightText = sentenceMatch[0];
        }
      }

      if (highlightText && highlightText.length >= 5) {
        items.push({
          id: comment.id,
          text: highlightText,
          color,
        });
      }
    });
    
    return items;
  }, [comments]);

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
  
  console.log('[ReviewsTab] Document content length:', documentContent?.length, 'Preview:', documentContent?.slice(0, 100));
  
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
      {/* Debug Info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
        <strong>调试信息:</strong> Reviews: {reviews.length} | Comments: {comments.length} | Pending: {comments.filter(c => c.status === 'pending').length} | Task: {task?.status}
      </div>
      
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
            <button
              onClick={handleForceFinalize}
              disabled={decisionLoading || finalizeStatus.status === 'doing'}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="强制 Finalize：忽略未处理的严重问题"
            >
              <span className="material-symbols-outlined text-sm">warning</span>
              强制 Finalize
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left: Document Content with Preview/Source Toggle */}
            <div className="lg:col-span-8 border-r border-slate-200 dark:border-slate-800">
              {/* Toolbar */}
              <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDocViewMode('preview')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      docViewMode === 'preview'
                        ? 'bg-primary text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Preview
                  </button>
                  <button
                    onClick={() => setDocViewMode('source')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      docViewMode === 'source'
                        ? 'bg-primary text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">code</span>
                    Source
                  </button>
                </div>
                {currentVersion && (
                  <span className="text-xs font-bold text-slate-500">
                    v{versionWithSubVersions[versionWithSubVersions.length - 1]?.displayVersion || currentVersion.version}
                  </span>
                )}
              </div>
              
              {/* Content */}
              <div className="bg-white dark:bg-slate-900">
                {docViewMode === 'preview' ? (
                  <LivePreviewMarkdown
                    content={documentContent}
                    version={currentVersion?.version}
                    minHeight="500px"
                    showHeader={false}
                    showFooter={false}
                    className="border-none shadow-none rounded-none"
                    highlights={highlights}
                  />
                ) : (
                  <div className="p-6 bg-slate-50 dark:bg-slate-900">
                    <pre className="w-full h-[500px] overflow-auto whitespace-pre-wrap font-mono text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                      <code>{documentContent}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Comments/History/Tasks Panel */}
            <RightPanel 
              comments={comments}
              history={history}
              tasks={tasks}
              onCommentAccept={handleCommentAccept}
              onCommentIgnore={handleCommentIgnore}
              onHistorySelect={handleHistorySelect}
              selectMode={selectMode}
              selectedComments={selectedComments}
              onToggleSelect={toggleSelectComment}
              isStreaming={isStreamingActive || blueTeamStreaming.isStreaming || sequentialStreaming.isReviewing}
              streamingProgress={{
                currentRound: sequentialStreaming.currentRound || blueTeamStreaming.progress?.currentRound,
                totalRounds: sequentialStreaming.totalRounds || blueTeamStreaming.progress?.totalRounds,
                currentExpert: sequentialStreaming.currentExpert || blueTeamStreaming.progress?.currentExpert
              }}
            />
          </div>
        </div>
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

// Right Panel Component - 右侧边栏组件
interface RightPanelProps {
  comments: CommentItem[];
  history: { id: string; version: string; title: string; timestamp: string; author?: string }[];
  tasks: { id: string; title: string; status: 'pending' | 'in_progress' | 'completed'; assignee?: string }[];
  onCommentAccept?: (id: string) => void;
  onCommentIgnore?: (id: string) => void;
  onHistorySelect?: (item: { id: string; version: string; title: string; timestamp: string }) => void;
  selectMode?: boolean;
  selectedComments?: Set<string>;
  onToggleSelect?: (id: string) => void;
  isStreaming?: boolean;
  streamingProgress?: {
    currentRound?: number;
    totalRounds?: number;
    currentExpert?: string;
  };
}

function RightPanel({
  comments,
  history,
  tasks,
  onCommentAccept,
  onCommentIgnore,
  onHistorySelect,
  selectMode,
  selectedComments = new Set(),
  onToggleSelect,
  isStreaming = false,
  streamingProgress,
}: RightPanelProps) {
  console.log('[RightPanel] Received comments:', comments.length, 'isStreaming:', isStreaming, 'streamingProgress:', streamingProgress);
  
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'tasks'>('comments');
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  const pendingComments = comments.filter(c => c.status === 'pending');
  const acceptedComments = comments.filter(c => c.status === 'accepted');
  const ignoredComments = comments.filter(c => c.status === 'ignored');

  const handleCommentClick = (comment: CommentItem) => {
    if (!selectMode) {
      setSelectedCommentId(comment.id);
    }
  };

  // Severity 配置 - 与 DocumentEditor 保持一致，使用主题 CSS 变量
  const severityConfig = {
    critical: { 
      label: 'Critical', 
      icon: 'error', 
      borderColor: 'border-l-error', 
      bgColor: 'bg-error/5', 
      iconColor: 'text-error' 
    },
    warning: { 
      label: 'Warning', 
      icon: 'warning', 
      borderColor: 'border-l-tertiary', 
      bgColor: 'bg-tertiary/5', 
      iconColor: 'text-tertiary' 
    },
    info: { 
      label: 'Info', 
      icon: 'info', 
      borderColor: 'border-l-primary', 
      bgColor: 'bg-primary/5', 
      iconColor: 'text-primary' 
    },
    praise: { 
      label: 'Praise', 
      icon: 'thumb_up', 
      borderColor: 'border-l-green-500', 
      bgColor: 'bg-green-50', 
      iconColor: 'text-green-500' 
    },
  };

  const roleIcons: Record<string, string> = {
    challenger: 'bolt',
    expander: 'search',
    synthesizer: 'lightbulb',
    fact_checker: 'fact_check',
    logic_checker: 'extension',
    domain_expert: 'school',
    reader_rep: 'visibility',
    default: 'person',
  };

  return (
    <div className="lg:col-span-4 bg-slate-50/50 dark:bg-slate-900/30">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'comments'
              ? 'text-primary border-b-2 border-primary'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <span className="material-symbols-outlined text-sm">forum</span>
          Comments ({pendingComments.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'history'
              ? 'text-primary border-b-2 border-primary'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <span className="material-symbols-outlined text-sm">history</span>
          History
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'tasks'
              ? 'text-primary border-b-2 border-primary'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <span className="material-symbols-outlined text-sm">check_circle</span>
          Tasks ({tasks.length})
        </button>
      </div>

      {/* Panel Content - 高度不限 */}
      <div className="p-4 space-y-3">
        {/* Comments Tab */}
        {activeTab === 'comments' && (
          <>
            {/* Streaming Status Indicator */}
            {isStreaming && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                  <span className="text-sm font-medium">
                    AI 评审中...
                    {streamingProgress?.currentExpert && (
                      <span className="ml-1">({streamingProgress.currentExpert})</span>
                    )}
                  </span>
                </div>
                {streamingProgress && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
                      <span>第 {streamingProgress.currentRound} / {streamingProgress.totalRounds} 轮</span>
                    </div>
                    <div className="h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${((streamingProgress.currentRound || 0) / (streamingProgress.totalRounds || 1)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  新评论实时生成中，已显示 {pendingComments.length} 条
                </p>
              </div>
            )}
            
            {/* Pending Comments */}
            {pendingComments.length === 0 && !isStreaming ? (
              <div className="text-center py-12 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                <p className="text-sm">No pending comments</p>
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-400 mb-2">Rendering {pendingComments.length} comments...</div>
                {pendingComments.map((comment) => {
                const config = severityConfig[comment.severity];
                const isSelected = selectedCommentId === comment.id;
                const icon = roleIcons[comment.authorRole || 'default'];

                return (
                  <div
                    key={comment.id}
                    onClick={() => !selectMode && handleCommentClick(comment)}
                    className={`bg-white dark:bg-slate-900 p-4 rounded-xl border-l-4 ${config.borderColor} shadow-sm space-y-2 transition-all hover:shadow-md ${
                      isSelected ? 'ring-2 ring-primary/20' : ''
                    } ${selectMode ? '' : 'cursor-pointer'}`}
                  >
                    {/* Header with Checkbox */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* 批量选择复选框 */}
                        {selectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSelect?.(comment.id);
                            }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              selectedComments.has(comment.id)
                                ? 'bg-primary border-primary'
                                : 'border-slate-300 hover:border-primary'
                            }`}
                          >
                            {selectedComments.has(comment.id) && (
                              <span className="material-symbols-outlined text-white text-sm">check</span>
                            )}
                          </button>
                        )}
                        <div className={`w-6 h-6 rounded-full ${config.bgColor} flex items-center justify-center`}>
                          <span className={`material-symbols-outlined text-[14px] ${config.iconColor}`}>{icon}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{comment.author}</span>
                        {comment.authorRole && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                            {comment.authorRole}
                          </span>
                        )}
                      </div>
                      {comment.location && (
                        <span className="text-[10px] text-slate-400 font-mono">{comment.location}</span>
                      )}
                    </div>

                    {/* Content */}
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">"{comment.content}"</p>

                    {/* Suggestion - 建议展示 */}
                    {comment.suggestion && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-[11px] text-slate-500">
                        <span className="font-medium">Suggestion:</span> {comment.suggestion}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const btn = e.currentTarget;
                          btn.classList.add('scale-95', 'bg-green-500', 'text-white');
                          btn.classList.remove('bg-primary/10', 'text-primary');
                          setTimeout(() => {
                            onCommentAccept?.(comment.id);
                          }, 200);
                        }}
                        className="flex-1 py-1.5 text-[10px] font-bold bg-primary/10 text-primary rounded-md hover:bg-primary/20 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center gap-1 group"
                      >
                        <span className="material-symbols-outlined text-[12px] transition-transform group-hover:rotate-12">check</span>
                        Accept
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const btn = e.currentTarget;
                          btn.classList.add('scale-95', 'bg-slate-400', 'text-white');
                          btn.classList.remove('border-slate-200', 'text-slate-500');
                          setTimeout(() => {
                            onCommentIgnore?.(comment.id);
                          }, 200);
                        }}
                        className="flex-1 py-1.5 text-[10px] font-bold border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:border-slate-300 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center gap-1 group"
                      >
                        <span className="material-symbols-outlined text-[12px] transition-transform group-hover:rotate-90">close</span>
                        Ignore
                      </button>
                    </div>
                  </div>
                );
              })}
              </>
            )}

            {/* Resolved Comments - 已解决问题列表 */}
            {(acceptedComments.length > 0 || ignoredComments.length > 0) && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Resolved ({acceptedComments.length + ignoredComments.length})
                </span>
                <div className="mt-2 space-y-2">
                  {acceptedComments.slice(0, 3).map((comment) => (
                    <div key={comment.id} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="material-symbols-outlined text-green-500 text-sm">check</span>
                      <span className="line-through flex-1 truncate">{comment.content}</span>
                    </div>
                  ))}
                  {ignoredComments.slice(0, 3).map((comment) => (
                    <div key={comment.id} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="material-symbols-outlined text-slate-400 text-sm">close</span>
                      <span className="line-through flex-1 truncate text-slate-400">{comment.content}</span>
                    </div>
                  ))}
                  {acceptedComments.length + ignoredComments.length > 3 && (
                    <p className="text-[10px] text-slate-400 pl-6">
                      +{acceptedComments.length + ignoredComments.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <>
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">history</span>
                <p className="text-sm">No version history</p>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onHistorySelect?.(item)}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">description</span>
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.title}</div>
                      <div className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{item.version}</span>
                </div>
              ))
            )}
          </>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                <p className="text-sm">No pending tasks</p>
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    task.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300'
                  }`}>
                    {task.status === 'completed' && (
                      <span className="material-symbols-outlined text-white text-sm">check</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {task.title}
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
