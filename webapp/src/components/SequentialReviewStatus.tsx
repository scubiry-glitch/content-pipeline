// SequentialReviewStatus - 串行评审队列状态显示
import { useState, useEffect } from 'react';

interface ReviewQueueItem {
  name: string;
  role?: string;
  type: 'ai' | 'human';
  profile?: string;
}

interface SequentialStatus {
  taskId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  totalRounds: number;
  currentRound: number;
  reviewQueue: ReviewQueueItem[];
  currentDraftId?: string;
  finalDraftId?: string;
  startedAt?: string;
  completedAt?: string;
}

interface SequentialReviewStatusProps {
  taskId: string;
  reviews?: any[]; // 用于计算每个专家的评论数量
}

const ROLE_COLORS: Record<string, string> = {
  challenger: 'bg-red-500',
  expander: 'bg-amber-500',
  synthesizer: 'bg-cyan-500',
  fact_checker: 'bg-blue-500',
  logic_checker: 'bg-purple-500',
  domain_expert: 'bg-green-500',
  reader_rep: 'bg-pink-500',
};

const ROLE_ICONS: Record<string, string> = {
  challenger: 'bolt',
  expander: 'open_in_full',
  synthesizer: 'hub',
  fact_checker: 'fact_check',
  logic_checker: 'rule',
  domain_expert: 'school',
  reader_rep: 'visibility',
};

export function SequentialReviewStatus({ taskId }: SequentialReviewStatusProps) {
  const [status, setStatus] = useState<SequentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    if (taskId && !notConfigured) {
      loadStatus();
      // 每 5 秒刷新一次，如果未配置则停止轮询
      const interval = setInterval(() => {
        if (!notConfigured) {
          loadStatus();
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [taskId, notConfigured]);

  const loadStatus = async () => {
    try {
      const res = await fetch(`/api/v1/production/${taskId}/sequential-review/status`, {
        headers: { 'X-API-Key': 'dev-api-key' }
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else if (res.status === 404) {
        // 任务未配置串行评审，停止轮询
        setNotConfigured(true);
      }
    } catch (err) {
      console.error('[SequentialReviewStatus] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <span className="text-xs text-slate-400">Loading...</span>;
  }

  // 未配置串行评审（并行模式或尚未配置）
  if (notConfigured || !status || status.status === 'idle') {
    return null; // 不显示任何内容，避免干扰
  }

  const progress = status.totalRounds > 0 
    ? ((status.currentRound - 1) / status.totalRounds) * 100 
    : 0;

  return (
    <div className="flex items-center gap-4">
      {/* Status Badge */}
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
        status.status === 'running' ? 'bg-amber-100 text-amber-700' :
        status.status === 'completed' ? 'bg-green-100 text-green-700' :
        'bg-slate-100 text-slate-600'
      }`}>
        {status.status === 'running' ? '🟡 Running' :
         status.status === 'completed' ? '✓ Completed' :
         status.status}
      </span>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-tertiary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-slate-500">
          {status.currentRound - 1} / {status.totalRounds}
        </span>
      </div>

      {/* Queue Preview */}
      {status.reviewQueue && status.reviewQueue.length > 0 && (
        <div className="flex items-center gap-1">
          {status.reviewQueue.slice(0, 5).map((expert, idx) => {
            const isActive = idx === status.currentRound - 1;
            const isCompleted = idx < status.currentRound - 1;
            const role = expert.role || 'domain_expert';
            const colorClass = ROLE_COLORS[role] || 'bg-slate-400';
            
            return (
              <div 
                key={idx}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${
                  isActive ? 'ring-2 ring-offset-1 ring-tertiary ' + colorClass :
                  isCompleted ? 'bg-green-500' : 'bg-slate-300'
                }`}
                title={`${expert.name} (${expert.type})${expert.profile ? '\n' + expert.profile : ''}`}
              >
                {isCompleted ? (
                  <span className="material-symbols-outlined text-xs">check</span>
                ) : (
                  idx + 1
                )}
              </div>
            );
          })}
          {status.reviewQueue.length > 5 && (
            <span className="text-xs text-slate-400">+{status.reviewQueue.length - 5}</span>
          )}
        </div>
      )}
    </div>
  );
}

// 扩展的队列详情组件
export function SequentialReviewQueueDetail({ taskId, reviews = [] }: SequentialReviewStatusProps) {
  const [status, setStatus] = useState<SequentialStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (taskId) {
      loadStatus();
      const interval = setInterval(loadStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [taskId]);

  const loadStatus = async () => {
    try {
      const res = await fetch(`/api/v1/production/${taskId}/sequential-review/status`, {
        headers: { 'X-API-Key': 'dev-api-key' }
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('[SequentialReviewQueueDetail] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400">Loading queue...</div>;
  }

  if (!status || status.status === 'idle') {
    return (
      <div className="text-center py-8 text-slate-500">
        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">queue</span>
        <p className="text-sm">Sequential review not configured</p>
        <p className="text-xs mt-1">Configure in Settings to start</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Progress */}
      <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
        <span className="text-xs font-bold text-slate-500 uppercase">Overall Progress</span>
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-tertiary rounded-full transition-all"
            style={{ width: `${((status.currentRound - 1) / status.totalRounds) * 100}%` }}
          />
        </div>
        <span className="text-sm font-bold text-slate-700">
          {status.currentRound - 1} / {status.totalRounds}
        </span>
      </div>

      {/* Queue List */}
      <div className="space-y-2">
        {status.reviewQueue.map((expert, idx) => {
          // 计算该专家的评论数量
          const expertReviews = reviews.filter(r => {
            // 匹配专家角色或名称
            const roleMatch = r.expert_role === expert.role;
            const nameMatch = r.expert_role?.toLowerCase().includes(expert.name?.toLowerCase()) ||
                             expert.name?.toLowerCase().includes(r.expert_role?.toLowerCase());
            return roleMatch || nameMatch;
          });
          const commentCount = expertReviews.reduce((sum, r) => sum + (r.questions?.length || 0), 0);
          const round = idx + 1;
          const isActive = round === status.currentRound;
          const isCompleted = round < status.currentRound;
          const isPending = round > status.currentRound;
          const role = expert.role || 'domain_expert';
          const icon = ROLE_ICONS[role] || 'person';
          
          return (
            <div 
              key={idx}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isActive ? 'bg-tertiary/5 border-tertiary' :
                isCompleted ? 'bg-green-50 border-green-200' :
                'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              {/* Round Number */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                isActive ? 'bg-tertiary text-white' :
                isCompleted ? 'bg-green-500 text-white' :
                'bg-slate-300 text-slate-600'
              }`}>
                {isCompleted ? (
                  <span className="material-symbols-outlined text-sm">check</span>
                ) : (
                  round
                )}
              </div>

              {/* Expert Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-900">{expert.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    expert.type === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {expert.type === 'ai' ? 'AI' : 'Human'}
                  </span>
                  {expert.role && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded capitalize">
                      {expert.role}
                    </span>
                  )}
                  {/* 评论数量徽章 */}
                  {commentCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                      {commentCount} 条评论
                    </span>
                  )}
                </div>
                {expert.profile && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{expert.profile}</p>
                )}
              </div>

              {/* Status */}
              <div className={`text-xs font-medium ${
                isActive ? 'text-tertiary' :
                isCompleted ? 'text-green-600' :
                'text-slate-400'
              }`}>
                {isActive ? '● In Progress' :
                 isCompleted ? 'Completed' :
                 'Pending'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time Info */}
      {status.startedAt && (
        <div className="text-xs text-slate-400 pt-2 border-t border-slate-200">
          Started: {new Date(status.startedAt).toLocaleString()}
          {status.completedAt && (
            <span className="ml-4">
              Completed: {new Date(status.completedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
