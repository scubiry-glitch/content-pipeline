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
  needsRevision?: number;
  rejected?: number;
}

interface FinalDecisionSectionProps {
  taskId?: string;
  reviewSummary: ReviewSummary;
  versions?: DraftVersion[];
  comments?: CommentItem[];
}

export function FinalDecisionSection({
  taskId,
  reviewSummary,
  versions = [],
  comments = [],
}: FinalDecisionSectionProps) {
  return (
    <section className="final-decision-section mt-8 p-6 bg-surface-container-lowest rounded-xl border border-transparent shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">gavel</span>
          Final Decision
        </h3>
        <span className="text-sm text-on-surface-variant">
          {reviewSummary.total} reviews completed
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-container-low p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-600">{reviewSummary.accepted}</div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">Accepted</div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-orange-500">{reviewSummary.needsRevision || 0}</div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">Needs Revision</div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-red-500">{reviewSummary.rejected || 0}</div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">Rejected</div>
        </div>
      </div>

      {versions.length > 0 && (
        <div className="border-t border-outline-variant/20 pt-4">
          <h4 className="text-sm font-bold text-on-surface-variant mb-3 uppercase tracking-wider">
            Version History
          </h4>
          <div className="space-y-2">
            {versions.slice(0, 3).map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">V{version.version}</span>
                  <span className="text-sm text-on-surface">
                    {version.comment || `Version ${version.version}`}
                  </span>
                </div>
                <span className="text-xs text-on-surface-variant">
                  {new Date(version.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {comments.length > 0 && (
        <div className="border-t border-outline-variant/20 pt-4 mt-4">
          <h4 className="text-sm font-bold text-on-surface-variant mb-3 uppercase tracking-wider">
            Recent Comments
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {comments.slice(0, 3).map((comment) => (
              <div
                key={comment.id}
                className="p-3 bg-surface-container-low rounded-lg text-sm text-on-surface"
              >
                <p className="line-clamp-2">{comment.content}</p>
                <span className="text-xs text-on-surface-variant mt-1 block">
                  by {comment.created_by || 'Unknown'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default FinalDecisionSection;
