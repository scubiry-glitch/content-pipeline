// FinalDecisionSection.tsx
// 蓝军评审的最终决策区域

import type { DraftVersion, CommentItem } from '../types';

interface ReviewSummary {
  total: number;
  critical: number;
  warning: number;
  praise: number;
  accepted: number;
  ignored: number;
  pending: number;
}

interface FinalDecisionSectionProps {
  taskId?: string;
  reviewSummary: ReviewSummary;
  versions?: DraftVersion[];
  comments?: CommentItem[];
  status?: 'pending' | 'accepted' | 'rejected' | 'overridden';
  onAccept?: () => void;
  onOverride?: () => void;
  loading?: boolean;
}

export function FinalDecisionSection({
  taskId,
  reviewSummary,
  versions = [],
  comments = [],
  status = 'pending',
  onAccept,
  onOverride,
  loading = false,
}: FinalDecisionSectionProps) {
  // 状态显示配置
  const statusConfig = {
    pending: { label: 'Pending', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
    accepted: { label: 'Accepted', color: 'text-green-600', bgColor: 'bg-green-500/10' },
    rejected: { label: 'Rejected', color: 'text-red-500', bgColor: 'bg-red-500/10' },
    overridden: { label: 'Overridden', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  };

  const currentStatus = statusConfig[status];

  return (
    <section className="final-decision-section mt-8 p-6 bg-surface-container-lowest rounded-xl border border-transparent shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-2xl">gavel</span>
          <div>
            <h3 className="text-lg font-bold font-headline text-on-surface">
              Final Decision
            </h3>
            <p className="text-xs text-on-surface-variant">
              {reviewSummary.total} reviews completed
            </p>
          </div>
        </div>
        
        {/* Status Badge */}
        <span className={`px-3 py-1 rounded-full text-sm font-bold ${currentStatus.bgColor} ${currentStatus.color}`}>
          {currentStatus.label}
        </span>
      </div>

      {/* Review Stats - 显示实际的评审状态 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface-container-low/50 p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-green-600">{reviewSummary.accepted}</div>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Accepted</div>
        </div>
        <div className="bg-surface-container-low/50 p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-slate-500">{reviewSummary.ignored}</div>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Ignored</div>
        </div>
        <div className="bg-surface-container-low/50 p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-orange-500">{reviewSummary.pending}</div>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Pending</div>
        </div>
      </div>

      {/* Severity Stats - 显示严重程度分布 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-center border border-red-100 dark:border-red-800">
          <div className="text-xl font-bold text-red-600">{reviewSummary.critical}</div>
          <div className="text-[10px] text-red-500 uppercase tracking-wider">Critical</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg text-center border border-amber-100 dark:border-amber-800">
          <div className="text-xl font-bold text-amber-600">{reviewSummary.warning}</div>
          <div className="text-[10px] text-amber-500 uppercase tracking-wider">Warning</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center border border-green-100 dark:border-green-800">
          <div className="text-xl font-bold text-green-600">{reviewSummary.praise}</div>
          <div className="text-[10px] text-green-500 uppercase tracking-wider">Praise</div>
        </div>
      </div>

      {/* Action Buttons */}
      {status === 'pending' && (
        <div className="space-y-3">
          <button
            onClick={onAccept}
            disabled={loading}
            className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-on-primary font-bold rounded-xl 
                       transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-lg shadow-primary/25"
          >
            <span className="material-symbols-outlined">check_circle</span>
            Accept & Finalize
          </button>
          
          <button
            onClick={onOverride}
            disabled={loading}
            className="w-full py-3 px-4 bg-surface-container-low hover:bg-surface-container 
                       text-on-surface font-semibold rounded-xl border border-outline-variant
                       transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">edit_note</span>
            Manual Override
          </button>
        </div>
      )}

      {/* Completed Status */}
      {status === 'accepted' && (
        <div className="p-4 bg-green-500/10 rounded-xl text-center">
          <span className="material-symbols-outlined text-green-600 text-3xl mb-2">check_circle</span>
          <p className="text-green-700 font-semibold">This review has been accepted and finalized</p>
        </div>
      )}

      {status === 'overridden' && (
        <div className="p-4 bg-blue-500/10 rounded-xl text-center">
          <span className="material-symbols-outlined text-blue-500 text-3xl mb-2">edit_note</span>
          <p className="text-blue-700 font-semibold">This review has been manually overridden</p>
        </div>
      )}

      {/* Recent Comments - 已隐藏 */}
    </section>
  );
}

export default FinalDecisionSection;
