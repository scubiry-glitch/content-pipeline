// SequentialPanel - Sequential Review Queue 面板
import { useEffect, useState } from 'react';

interface SequentialPanelProps {
  taskId: string;
}

interface SequentialStatus {
  status: 'idle' | 'running' | 'completed';
  currentRound: number;
  totalRounds: number;
  reviewQueue: Array<{
    name: string;
    type: 'AI' | 'Human';
    id?: string;
    round?: number;
  }>;
  currentReviewId?: string;
}

interface ExpertReviewDetail {
  round: number;
  expertId: string;
  expertName: string;
  status: 'pending' | 'in_progress' | 'completed';
  commentsCount: number;
  criticalCount: number;
  warningCount: number;
  praiseCount: number;
  startedAt?: string;
  completedAt?: string;
}

const EXPERT_ROLE_INFO: Record<string, { name: string; icon: string; color: string; description: string }> = {
  challenger: { 
    name: '批判者', 
    icon: '⚡', 
    color: '#ef4444',
    description: '挑战逻辑漏洞、数据可靠性'
  },
  expander: { 
    name: '拓展者', 
    icon: '🔍', 
    color: '#f59e0b',
    description: '扩展关联因素、国际对比'
  },
  synthesizer: { 
    name: '提炼者', 
    icon: '💡', 
    color: '#06b6d4',
    description: '归纳核心论点、结构优化'
  },
  expert: {
    name: '领域专家',
    icon: '🎓',
    color: '#8b5cf6',
    description: '专业角度深度审核'
  }
};

export function SequentialPanel({ taskId }: SequentialPanelProps) {
  const [status, setStatus] = useState<SequentialStatus | null>(null);
  const [expertDetails, setExpertDetails] = useState<Map<number, ExpertReviewDetail>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch sequential review status
        const statusRes = await fetch(`/api/v1/production/${taskId}/sequential-review/status`, {
          headers: { 'x-api-key': 'dev-api-key' }
        });
        
        // 如果 404，说明没有配置串行评审，静默处理
        if (statusRes.status === 404) {
          setStatus(null);
          setLoading(false);
          return;
        }
        
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setStatus(statusData);
          
          // Fetch reviews to get comments count per round
          const reviewsRes = await fetch(`/api/v1/production/${taskId}/reviews`, {
            headers: { 'x-api-key': 'dev-api-key' }
          });
          
          if (reviewsRes.ok) {
            const reviewsData = await reviewsRes.json();
            const rawReviews = reviewsData.rawReviews || [];
            
            // Calculate comments count per round
            const detailsMap = new Map<number, ExpertReviewDetail>();
            
            // Group reviews by round
            rawReviews.forEach((review: any) => {
              const round = review.round || 1;
              const expertRole = review.expert_role || 'expert';
              
              if (!detailsMap.has(round)) {
                detailsMap.set(round, {
                  round,
                  expertId: expertRole,
                  expertName: EXPERT_ROLE_INFO[expertRole]?.name || expertRole,
                  status: review.status === 'completed' ? 'completed' : 
                          review.status === 'in_progress' ? 'in_progress' : 'pending',
                  commentsCount: 0,
                  criticalCount: 0,
                  warningCount: 0,
                  praiseCount: 0,
                });
              }
              
              const detail = detailsMap.get(round)!;
              
              // Count questions/comments
              const questions = Array.isArray(review.questions) ? review.questions : 
                               typeof review.questions === 'string' ? JSON.parse(review.questions) : [];
              
              detail.commentsCount += questions.length;
              
              // Count by severity
              questions.forEach((q: any) => {
                const severity = q.severity || 'medium';
                if (severity === 'high' || severity === 'critical') {
                  detail.criticalCount++;
                } else if (severity === 'medium' || severity === 'warning') {
                  detail.warningCount++;
                } else if (severity === 'praise' || severity === 'low') {
                  detail.praiseCount++;
                }
              });
            });
            
            setExpertDetails(detailsMap);
          }
        }
      } catch (e) {
        console.error('Failed to fetch sequential review data:', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [taskId]);

  const getStatusBadge = () => {
    if (!status) return null;
    switch (status.status) {
      case 'running':
        return (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            运行中
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">check</span>
            已完成
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">schedule</span>
            等待中
          </span>
        );
    }
  };

  const getExpertStatusBadge = (detail: ExpertReviewDetail | undefined, isDone: boolean, isCurrent: boolean) => {
    if (!detail || (!isDone && !isCurrent)) {
      return <span className="text-xs text-slate-400">等待中</span>;
    }
    
    if (isDone) {
      return (
        <span className="text-xs flex items-center gap-1 text-green-600">
          <span className="material-symbols-outlined text-xs">check_circle</span>
          已完成
        </span>
      );
    }
    
    if (isCurrent) {
      return (
        <span className="text-xs flex items-center gap-1 text-blue-600">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          进行中
        </span>
      );
    }
    
    return <span className="text-xs text-slate-400">等待中</span>;
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-3xl animate-spin text-primary">refresh</span>
        <p className="mt-2 text-sm text-slate-500">加载串行评审队列...</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">queue</span>
        <p className="text-slate-500">串行评审队列未配置</p>
        <p className="text-xs text-slate-400 mt-1">请先配置评审流程</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary">playlist_add_check</span>
            <h2 className="font-headline font-bold text-lg text-slate-900 dark:text-white">
              串行评审队列
            </h2>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">format_list_numbered</span>
              {status.totalRounds} 轮评审
            </span>
          </div>
        </div>
      </div>

      {/* Queue Content */}
      <div className="p-4">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-tertiary rounded-full transition-all duration-500"
              style={{ width: `${(status.currentRound / status.totalRounds) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {status.currentRound}/{status.totalRounds}
          </span>
        </div>
        
        {/* Queue items */}
        <div className="space-y-3">
          {status.reviewQueue.map((expert: any, idx: number) => {
            const round = idx + 1;
            const isDone = idx < status.currentRound - 1;
            const isCurrent = idx === status.currentRound - 1;
            const expertInfo = EXPERT_ROLE_INFO[expert.id] || { name: expert.name, icon: '👤', color: '#666', description: '' };
            const detail = expertDetails.get(round);
            
            return (
              <div 
                key={idx} 
                className={`p-4 rounded-lg border transition-all ${
                  isDone 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                    : isCurrent 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-sm' 
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">{isDone ? '✓' : isCurrent ? '●' : '○'}</span>
                  <span className="text-2xl">{expertInfo.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">{expertInfo.name || expert.name}</span>
                      <span className="text-xs text-slate-400">第{round}轮</span>
                    </div>
                    {expertInfo.description && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{expertInfo.description}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-1 rounded ${
                      expert.type === 'AI' 
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                    }`}>
                      {expert.type}
                    </span>
                    {getExpertStatusBadge(detail, isDone, isCurrent)}
                  </div>
                </div>
                
                {/* Comments stats */}
                {detail && detail.commentsCount > 0 && (
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="material-symbols-outlined text-sm text-slate-400">chat</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{detail.commentsCount}</span>
                      <span className="text-slate-500">条评论</span>
                    </div>
                    
                    {detail.criticalCount > 0 && (
                      <div className="flex items-center gap-1 text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span className="text-red-600 font-medium">{detail.criticalCount}</span>
                        <span className="text-slate-500">严重</span>
                      </div>
                    )}
                    
                    {detail.warningCount > 0 && (
                      <div className="flex items-center gap-1 text-sm">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-amber-600 font-medium">{detail.warningCount}</span>
                        <span className="text-slate-500">警告</span>
                      </div>
                    )}
                    
                    {detail.praiseCount > 0 && (
                      <div className="flex items-center gap-1 text-sm">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-green-600 font-medium">{detail.praiseCount}</span>
                        <span className="text-slate-500">表扬</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* No comments yet */}
                {detail && detail.commentsCount === 0 && isCurrent && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-sm text-slate-400">
                    <span className="material-symbols-outlined text-sm">hourglass_empty</span>
                    <span>正在评审中...</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress Info */}
      <div className="px-4 pb-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">整体进度</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {Math.round((status.currentRound / status.totalRounds) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-tertiary to-accent rounded-full transition-all duration-500"
              style={{ width: `${(status.currentRound / status.totalRounds) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
