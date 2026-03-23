// BlueTeamPanel - Blue Team Review 面板
import type { BlueTeamReview } from '../types';

interface BlueTeamPanelProps {
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
}

const EXPERT_ROLES: Record<string, { name: string; icon: string; color: string }> = {
  challenger: { name: '批判者', icon: 'bolt', color: '#ef4444' },
  expander: { name: '拓展者', icon: 'open_in_full', color: '#f59e0b' },
  synthesizer: { name: '提炼者', icon: 'hub', color: '#06b6d4' },
  fact_checker: { name: '事实核查员', icon: 'fact_check', color: '#ef4444' },
  logic_checker: { name: '逻辑检察官', icon: 'rule', color: '#f59e0b' },
  domain_expert: { name: '行业专家', icon: 'school', color: '#06b6d4' },
  reader_rep: { name: '读者代表', icon: 'visibility', color: '#10b981' }
};

export function BlueTeamPanel({ reviews, reviewSummary }: BlueTeamPanelProps) {
  // Group reviews by expert role
  const expertStats = new Map<string, { 
    role: string; 
    count: number; 
    completed: number;
    questions: number;
  }>();
  
  reviews.forEach(review => {
    const role = review.expert_role || 'unknown';
    if (!expertStats.has(role)) {
      expertStats.set(role, { role, count: 0, completed: 0, questions: 0 });
    }
    const stats = expertStats.get(role)!;
    stats.count++;
    stats.questions += review.questions?.length || 0;
    if (review.status === 'completed') {
      stats.completed++;
    }
  });
  
  const uniqueExperts = Array.from(expertStats.values());
  const completionRate = reviewSummary.total > 0 
    ? Math.round((reviewSummary.accepted + reviewSummary.ignored) / reviewSummary.total * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">groups</span>
            <h2 className="font-headline font-bold text-lg text-slate-900 dark:text-white">
              Blue Team Review
            </h2>
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full">
              {reviewSummary.total} Comments
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
              {reviewSummary.critical} Critical
            </span>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
              {reviewSummary.warning} Warning
            </span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
              {reviewSummary.praise} Praise
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-slate-500 uppercase">Review Completion</span>
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {completionRate}%
          </span>
        </div>
      </div>

      {/* Expert Cards */}
      <div className="p-4">
        {uniqueExperts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {uniqueExperts.map((expert) => {
              const expertInfo = EXPERT_ROLES[expert.role] || { name: expert.role, icon: 'person', color: '#005bc1' };
              const isCompleted = expert.completed === expert.count;
              const isChallenger = expert.role === 'challenger';
              const isExpander = expert.role === 'expander';
              
              const borderColor = isChallenger ? 'border-error/30 hover:border-error' : 
                                 isExpander ? 'border-tertiary/30 hover:border-tertiary' : 
                                 'border-primary/30 hover:border-primary';
              const iconColor = isChallenger ? 'text-error bg-error/10' : 
                               isExpander ? 'text-tertiary bg-tertiary/10' : 
                               'text-primary bg-primary/10';
              
              return (
                <div key={expert.role} className={`bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border ${borderColor} transition-all hover:shadow-md`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconColor}`}>
                      <span className="material-symbols-outlined text-sm">{expertInfo.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{expertInfo.name}</div>
                      <div className={`text-xs ${isCompleted ? 'text-green-500' : 'text-amber-500'} flex items-center gap-1`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></span>
                        {isCompleted ? 'Completed' : 'In Progress'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{expert.completed}/{expert.count} reviews</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">comment</span>
                      {expert.questions} comments
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">hourglass_empty</span>
            <p className="text-sm">Waiting for experts to start reviewing...</p>
          </div>
        )}
      </div>
    </div>
  );
}
