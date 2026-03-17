// 素材专家标注弹窗 - Asset Expert Review Modal
// Phase 3: 专家为素材质量打分和解读

import { useState, useEffect } from 'react';
import {
  getAssetExpertReviews,
  getAssetCompositeScore,
  generateAssetExpertReviews,
  type AssetExpertReview,
} from '../services/expertService';
import './AssetExpertReviewModal.css';

interface AssetExpertReviewModalProps {
  assetId: string;
  assetTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AssetExpertReviewModal({
  assetId,
  assetTitle,
  isOpen,
  onClose,
}: AssetExpertReviewModalProps) {
  const [reviews, setReviews] = useState<AssetExpertReview[]>([]);
  const [compositeScore, setCompositeScore] = useState<ReturnType<
    typeof getAssetCompositeScore
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExpert, setSelectedExpert] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadReviews();
    }
  }, [isOpen, assetId]);

  const loadReviews = async () => {
    setLoading(true);

    // 模拟API延迟
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 获取或生成专家标注
    let reviews = getAssetExpertReviews(assetId);
    if (reviews.length === 0) {
      reviews = generateAssetExpertReviews(assetId, assetTitle);
    }

    setReviews(reviews);
    setCompositeScore(getAssetCompositeScore(assetId));
    setLoading(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return '#22c55e';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return '优秀';
    if (score >= 70) return '良好';
    if (score >= 60) return '合格';
    return '待改进';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="asset-expert-review-modal" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <div className="header-content">
            <h3>📋 专家质量评估</h3>
            <p className="asset-title">{assetTitle}</p>
          </div>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>正在加载专家评估...</p>
            </div>
          ) : (
            <>
              {/* 综合评分 */}
              {compositeScore && (
                <div className="composite-score-section">
                  <div className="overall-score">
                    <div
                      className="score-circle"
                      style={{
                        background: `conic-gradient(${getScoreColor(compositeScore.overall)} ${compositeScore.overall * 3.6}deg, #e2e8f0 0deg)`,
                      }}
                    >
                      <div className="score-inner">
                        <span className="score-value">{compositeScore.overall}</span>
                        <span className="score-label">综合评分</span>
                      </div>
                    </div>
                    <div className="score-badge" style={{ color: getScoreColor(compositeScore.overall) }}>
                      {getScoreLabel(compositeScore.overall)}
                    </div>
                  </div>

                  <div className="dimension-scores">
                    <div className="dimension-item">
                      <span className="dimension-label">质量</span>
                      <div className="dimension-bar">
                        <div
                          className="dimension-fill"
                          style={{
                            width: `${compositeScore.quality}%`,
                            background: getScoreColor(compositeScore.quality),
                          }}
                        />
                      </div>
                      <span className="dimension-value">{compositeScore.quality}</span>
                    </div>
                    <div className="dimension-item">
                      <span className="dimension-label">可信度</span>
                      <div className="dimension-bar">
                        <div
                          className="dimension-fill"
                          style={{
                            width: `${compositeScore.credibility}%`,
                            background: getScoreColor(compositeScore.credibility),
                          }}
                        />
                      </div>
                      <span className="dimension-value">{compositeScore.credibility}</span>
                    </div>
                    <div className="dimension-item">
                      <span className="dimension-label">相关性</span>
                      <div className="dimension-bar">
                        <div
                          className="dimension-fill"
                          style={{
                            width: `${compositeScore.relevance}%`,
                            background: getScoreColor(compositeScore.relevance),
                          }}
                        />
                      </div>
                      <span className="dimension-value">{compositeScore.relevance}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 专家评审列表 */}
              <div className="expert-reviews-section">
                <h4>
                  <span>👔</span> 专家评审 ({reviews.length}位)
                </h4>

                <div className="expert-reviews-list">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className={`expert-review-card ${selectedExpert === review.expertId ? 'expanded' : ''}`}
                      onClick={() =>
                        setSelectedExpert(selectedExpert === review.expertId ? null : review.expertId)
                      }
                    >
                      <div className="expert-review-header">
                        <div className="expert-avatar">{review.expertAvatar}</div>
                        <div className="expert-info">
                          <span className="expert-name">{review.expertName}</span>
                          <span className="review-date">
                            {new Date(review.reviewedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="expert-score">
                          <span
                            className="score-tag"
                            style={{ color: getScoreColor(review.qualityScore) }}
                          >
                            {review.qualityScore}分
                          </span>
                        </div>
                      </div>

                      <div className="expert-review-content">
                        <p className="expert-comment">{review.comment}</p>

                        <div className="expert-tags">
                          {review.tags.map((tag, idx) => (
                            <span key={idx} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>

                        {selectedExpert === review.expertId && (
                          <div className="detailed-scores">
                            <div className="detail-item">
                              <span>质量</span>
                              <span style={{ color: getScoreColor(review.qualityScore) }}>
                                {review.qualityScore}
                              </span>
                            </div>
                            <div className="detail-item">
                              <span>可信度</span>
                              <span style={{ color: getScoreColor(review.credibilityScore) }}>
                                {review.credibilityScore}
                              </span>
                            </div>
                            <div className="detail-item">
                              <span>相关性</span>
                              <span style={{ color: getScoreColor(review.relevanceScore) }}>
                                {review.relevanceScore}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedExpert !== review.expertId && (
                        <div className="expand-hint">点击查看详情 →</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 使用建议 */}
              <div className="usage-suggestions">
                <h4>
                  <span>💡</span> 使用建议
                </h4>
                <ul>
                  <li>该素材已通过{reviews.length}位专家审核，适合作为研究参考</li>
                  <li>建议结合其他{reviews.length}个以上同主题素材交叉验证</li>
                  <li>标注时效性：{new Date(reviews[0]?.reviewedAt || Date.now()).toLocaleDateString()}，建议定期复核</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
          <button className="btn btn-primary" onClick={loadReviews}>
            🔄 重新评估
          </button>
        </div>
      </div>
    </div>
  );
}
