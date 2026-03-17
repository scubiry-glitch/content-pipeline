// 专家评审面板 - Expert Review Panel
import { useState, useEffect } from 'react';
import type { Expert, ExpertReview, ExpertAssignment } from '../types';
import {
  matchExperts,
  generateExpertOpinion,
  getExpertWorkload,
  recordExpertFeedback,
} from '../services/expertService';

interface ExpertReviewPanelProps {
  taskId: string;
  topic: string;
  content: string;
  contentType?: 'outline' | 'draft' | 'research';
  importance?: number;
  onAccept?: (expertId: string) => void;
  onIgnore?: (expertId: string) => void;
}

export function ExpertReviewPanel({
  taskId,
  topic,
  content,
  contentType = 'draft',
  importance = 0.5,
  onAccept,
  onIgnore,
}: ExpertReviewPanelProps) {
  const [assignment, setAssignment] = useState<ExpertAssignment | null>(null);
  const [reviews, setReviews] = useState<ExpertReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  // 初始加载专家分配
  useEffect(() => {
    const loadAssignment = async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = matchExperts({
        topic,
        importance,
      });

      setAssignment(result);

      const generatedReviews: ExpertReview[] = [];

      // v5.1.1: 防御性检查，确保 domainExperts 存在且可迭代
      const domainExperts = result.domainExperts || [];
      for (const expert of domainExperts) {
        const review = generateExpertOpinion(expert, content, contentType);
        review.taskId = taskId;
        generatedReviews.push(review);
      }

      if (result.seniorExpert) {
        const review = generateExpertOpinion(
          result.seniorExpert,
          content,
          contentType
        );
        review.taskId = taskId;
        generatedReviews.push(review);
      }

      setReviews(generatedReviews);
      setLoading(false);
    };

    loadAssignment();
  }, [taskId, topic, content, contentType, importance]);

  const handleRefreshReview = async (expert: Expert) => {
    setGenerating(expert.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newReview = generateExpertOpinion(expert, content, contentType);
    newReview.taskId = taskId;

    setReviews((prev) =
      prev.map((r) => (r.expertId === expert.id ? newReview : r))
    );
    setGenerating(null);
  };

  if (loading) {
    return (
      <div className="expert-review-panel loading">
        <div className="loading-spinner"></div>
        <p>正在匹配专家...</p>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="expert-review-panel empty">
        <p>暂无专家分配</p>
      </div>
    );
  }

  const seniorReview = assignment.seniorExpert
    ? reviews.find((r) => r.expertId === assignment.seniorExpert?.id)
    : null;

  const domainReviews = reviews.filter(
    (r) =>
      assignment.domainExperts.some((e) => e.id === r.expertId) &&
      r.expertId !== assignment.seniorExpert?.id
  );

  return (
    <div className="expert-review-panel">
      <div className="match-explanation">
        <span className="match-icon">🎯</span>
        <div className="match-reasons">
          {assignment.matchReasons.map((reason, idx) => (
            <span key={idx} className="match-reason">{reason}</span>
          ))}
        </div>
      </div>

      {assignment.seniorExpert && seniorReview && (
        <div className="senior-expert-section">
          <div className="section-header">
            <span className="section-icon">⭐</span>
            <h4>战略顾问评审</h4>
            <span className="senior-badge">特级专家</span>
          </div>
          <ExpertReviewCard
            review={seniorReview}
            expert={assignment.seniorExpert}
            isSenior={true}
            onAccept={() => onAccept?.(assignment.seniorExpert!.id)}
            onIgnore={() => onIgnore?.(assignment.seniorExpert!.id)}
            onRefresh={() => handleRefreshReview(assignment.seniorExpert!)}
            isGenerating={generating === assignment.seniorExpert.id}
          />
        </div>
      )}

      <div className="domain-experts-section">
        <div className="section-header">
          <span className="section-icon">👔</span>
          <h4>领域专家深度评审</h4>
          <span className="expert-count">{assignment.domainExperts.length}位专家</span>
        </div>

        <div className="domain-experts-grid">
          {assignment.domainExperts.map((expert) => {
            const review = domainReviews.find((r) => r.expertId === expert.id);
            if (!review) return null;

            return (
              <ExpertReviewCard
                key={expert.id}
                review={review}
                expert={expert}
                onAccept={() => onAccept?.(expert.id)}
                onIgnore={() => onIgnore?.(expert.id)}
                onRefresh={() => handleRefreshReview(expert)}
                isGenerating={generating === expert.id}
              />
            );
          })}
        </div>
      </div>

      <div className="universal-experts-section">
        <div className="section-header">
          <span className="section-icon">✓</span>
          <h4>基础质量检查</h4>
        </div>
        <div className="universal-experts-list">
          <UniversalExpertBadge
            expert={assignment.universalExperts.factChecker}
            status="completed"
          />
          <UniversalExpertBadge
            expert={assignment.universalExperts.logicChecker}
            status="completed"
          />
          <UniversalExpertBadge
            expert={assignment.universalExperts.readerRep}
            status="completed"
          />
        </div>
      </div>
    </div>
  );
}

interface ExpertReviewCardProps {
  review: ExpertReview;
  expert: Expert;
  isSenior?: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  onRefresh: () => void;
  isGenerating: boolean;
}

function ExpertReviewCard({
  review,
  expert,
  isSenior = false,
  onAccept,
  onIgnore,
  onRefresh,
  isGenerating,
}: ExpertReviewCardProps) {
  const [action, setAction] = useState<'accepted' | 'rejected' | null>(
    review.userAction || null
  );

  const handleAccept = () => {
    setAction('accepted');
    // 记录用户反馈
    recordExpertFeedback(expert.id, review.taskId, 'accepted', {
      reviewId: review.id,
      contentPreview: review.opinion.slice(0, 100),
    });
    onAccept();
  };

  const handleIgnore = () => {
    setAction('rejected');
    // 记录用户反馈
    recordExpertFeedback(expert.id, review.taskId, 'rejected', {
      reviewId: review.id,
      contentPreview: review.opinion.slice(0, 100),
    });
    onIgnore();
  };

  const workload = getExpertWorkload(expert.id);

  return (
    <div className={`expert-review-card ${isSenior ? 'senior' : ''}`}>
      <div className="expert-header">
        <div className="expert-info">
          <div className={`expert-avatar ${expert.level}`}>{expert.name[0]}</div>
          <div className="expert-meta">
            <span className="expert-name">{expert.name}</span>
            <span className="expert-title">{expert.profile.title}</span>
            <span className="expert-domain">{expert.domainName}</span>
          </div>
        </div>
        <div className="expert-stats">
          <span className="stat acceptance-rate">
            采纳率 {(expert.acceptanceRate * 100).toFixed(0)}%
          </span>
          {workload.availability !== 'available' && (
            <span className={`stat availability ${workload.availability}`}>
              {workload.availability === 'busy' ? '较忙' : '繁忙'}
            </span>
          )}
        </div>
      </div>

      <div className="review-content">
        <div className="opinion-text">{review.opinion}</div>

        <div className="focus-areas">
          <span className="label">关注维度：</span>
          {review.focusAreas.map((area, idx) => (
            <span key={idx} className="focus-tag">{area}</span>
          ))}
        </div>

        <div className="suggestions">
          <h5>💡 建议</h5>
          <ul>
            {review.suggestions.map((suggestion, idx) => (
              <li key={idx}>{suggestion}</li>
            ))}
          </ul>
        </div>

        <div className="review-footer">
          <div className="confidence">
            <span className="label">置信度：</span>
            <div className="confidence-bar">
              <div
                className="confidence-fill"
                style={{ width: `${review.confidence * 100}%` }}
              />
            </div>
            <span className="confidence-value">{(review.confidence * 100).toFixed(0)}%</span>
          </div>

          <div className="review-actions">
            <button
              className="btn-refresh"
              onClick={onRefresh}
              disabled={isGenerating}
            >{isGenerating ? '🔄' : '↻'} 重新生成</button>
            <button
              className={`btn-action accept ${action === 'accepted' ? 'active' : ''}`}
              onClick={handleAccept}
              disabled={action !== null}
            >{action === 'accepted' ? '✓ 已接受' : '✓ 接受'}</button>
            <button
              className={`btn-action ignore ${action === 'rejected' ? 'active' : ''}`}
              onClick={handleIgnore}
              disabled={action !== null}
            >{action === 'rejected' ? '✗ 已忽略' : '✗ 忽略'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface UniversalExpertBadgeProps {
  expert: Expert;
  status: 'pending' | 'completed' | 'failed';
}

function UniversalExpertBadge({ expert, status }: UniversalExpertBadgeProps) {
  const statusIcons = { pending: '⏳', completed: '✅', failed: '❌' };

  return (
    <div className="universal-expert-badge">
      <span className="status-icon">{statusIcons[status]}</span>
      <span className="expert-name">{expert.name}</span>
      <span className="expert-dimensions">{expert.reviewDimensions.slice(0, 2).join('、')}</span>
    </div>
  );
}
