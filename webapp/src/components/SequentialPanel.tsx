// SequentialPanel - Sequential Review Queue 面板
import { useEffect, useState } from 'react';
import { SequentialReviewChain } from './SequentialReviewChain';

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
  }>;
  currentReviewId?: string;
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
};

export function SequentialPanel({ taskId }: SequentialPanelProps) {
  const [status, setStatus] = useState<SequentialStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/v1/production/${taskId}/sequential-review/status`, {
          headers: { 'x-api-key': 'dev-api-key' }
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (e) {
        console.error('Failed to fetch sequential review status:', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Refresh every 10s
    return () => clearInterval(interval);
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

  if (loading) {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-3xl animate-spin text-primary">refresh</span>
        <p className="mt-2 text-sm text-slate-500">加载串行评审队列...</p>
      </div>
    );
  }

  if (!status || status.status === 'idle') {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">queue</span>
        <p className="text-slate-500">串行评审队列未启动</p>
        <p className="text-xs text-slate-400 mt-1">等待管理员配置评审流程</p>
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

      {/* Two Column Layout */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Queue Overview */}
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">view_list</span>
            评审队列
          </h3>
          
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-4">
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
          <div className="space-y-2">
            {status.reviewQueue.map((expert: any, idx: number) => {
              const isDone = idx < status.currentRound - 1;
              const isCurrent = idx === status.currentRound - 1;
              const expertInfo = EXPERT_ROLE_INFO[expert.id] || { name: expert.name, icon: '👤', color: '#666', description: '' };
              
              return (
                <div 
                  key={idx} 
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isDone 
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                      : isCurrent 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-sm' 
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="text-lg">{isDone ? '✓' : isCurrent ? '●' : '○'}</span>
                  <span className="text-xl">{expertInfo.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-900 dark:text-white block">{expertInfo.name || expert.name}</span>
                    {expertInfo.description && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{expertInfo.description}</span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    expert.type === 'AI' 
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                  }`}>
                    {expert.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Version Chain */}
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">account_tree</span>
            版本演进链
          </h3>
          <SequentialReviewChain taskId={taskId} />
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
