import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { BlueTeamReview, CommentItem, DraftVersion } from '../../types';
import { DocumentEditor } from '../../components/DocumentEditor';
import { FinalDecisionSection } from '../../components/FinalDecisionSection';
import { BlueTeamPanel } from '../../components/BlueTeamPanel';
import { SequentialPanel } from '../../components/SequentialPanel';

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
  const [activeTab, setActiveTab] = useState<ReviewTab>('blue-team');
  const { 
    task, 
    reviews = [], 
    reviewSummary = { total: 0, critical: 0, warning: 0, praise: 0, accepted: 0, ignored: 0, pending: 0 }
  } = useOutletContext<TaskContext>();

  // Convert BlueTeamReview[] to CommentItem[] for DocumentEditor
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
        
        items.push({
          id: `${review.id}-${idx}`,
          content: q.question || 'No question provided',
          author: `${icon} ${review.expert_role?.replace('_', ' ')}`,
          authorType: 'ai',
          authorRole: review.expert_role,
          severity: severity,
          timestamp: review.created_at || new Date().toISOString(),
          location: `Q${idx + 1}`,
          suggestion: q.suggestion,
          status: reviewStatus === 'accept' ? 'accepted' : reviewStatus === 'ignore' ? 'ignored' : 'pending',
        });
      });
    });
    return items;
  }, [reviews]);

  // Get versions from task
  const versions: DraftVersion[] = task?.versions || [];
  
  // Get latest version content for the editor
  const currentVersion = versions[versions.length - 1];
  const documentContent = currentVersion?.content || '# Draft Title\n\nDraft content will appear here...';
  
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
        initialContent={documentContent}
        comments={comments}
        onChange={() => {}}
        onCommentsChange={() => {}}
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
      />
    </div>
  );
}
