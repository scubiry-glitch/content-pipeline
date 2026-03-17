// 专家观点对比 - Expert Comparison
// 支持2-3位专家观点对比分析

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getAllExperts,
  getExpertFeedbackStats,
  generateExpertOpinion,
} from '../services/expertService';
import type { Expert, ExpertReview } from '../types';
import './ExpertComparison.css';

interface ComparisonExpert {
  expert: Expert;
  review?: ExpertReview;
  stats: {
    acceptanceRate: number;
    totalReviews: number;
  };
}

const TOPICS = [
  { id: 'topic-1', title: '央行降准对房地产市场的影响分析', keyword: '房地产' },
  { id: 'topic-2', title: '新能源车企出海战略与本地化挑战', keyword: '新能源' },
  { id: 'topic-3', title: 'AI大模型在金融科技中的应用前景', keyword: 'AI' },
  { id: 'topic-4', title: '消费降级还是消费分级？零售行业新趋势', keyword: '消费' },
  { id: 'topic-5', title: '半导体产业链重构与国产替代加速', keyword: '半导体' },
];

export function ExpertComparison() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [experts, setExperts] = useState<Expert[]>([]);
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonExpert[]>([]);
  const [selectedTopic, setSelectedTopic] = useState(TOPICS[0]);
  const [loading, setLoading] = useState(false);
  const [showSelector, setShowSelector] = useState(true);

  useEffect(() => {
    const allExperts = getAllExperts();
    setExperts(allExperts);

    // 从URL参数加载预选专家
    const expertIds = searchParams.get('experts')?.split(',').filter(Boolean) || [];
    if (expertIds.length >= 2 && expertIds.length <= 3) {
      setSelectedExperts(expertIds);
    }
  }, [searchParams]);

  const handleExpertToggle = (expertId: string) => {
    setSelectedExperts((prev) => {
      if (prev.includes(expertId)) {
        return prev.filter((id) => id !== expertId);
      }
      if (prev.length >= 3) {
        return prev; // 最多选择3个
      }
      return [...prev, expertId];
    });
  };

  const generateComparison = () => {
    if (selectedExperts.length < 2) return;

    setLoading(true);
    setShowSelector(false);

    const data: ComparisonExpert[] = selectedExperts
      .map((id) => experts.find((e) => e.id === id))
      .filter(Boolean)
      .map((expert) => {
        const stats = getExpertFeedbackStats(expert!.id);
        const review = generateExpertOpinion(
          expert!,
          `关于${selectedTopic.title}的深度分析`,
          'draft'
        );
        return {
          expert: expert!,
          review,
          stats: {
            acceptanceRate: stats.acceptanceRate,
            totalReviews: stats.totalReviews,
          },
        };
      });

    setComparisonData(data);
    setLoading(false);
  };

  const resetComparison = () => {
    setShowSelector(true);
    setComparisonData([]);
    setSelectedExperts([]);
  };

  const getExpertColor = (level: string) => {
    return level === 'senior'
      ? 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
      : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
  };

  const getDomainColor = (domainCode: string) => {
    const colors: Record<string, string> = {
      S: '#f59e0b',
      E01: '#6366f1',
      E02: '#8b5cf6',
      E03: '#22c55e',
      E04: '#ef4444',
      E05: '#ec4899',
      E06: '#14b8a6',
      E07: '#3b82f6',
      E08: '#f97316',
      E09: '#a855f7',
      E10: '#64748b',
      E11: '#10b981',
      E12: '#0ea5e9',
    };
    return colors[domainCode] || '#6366f1';
  };

  return (
    <div className="expert-comparison-page">
      {/* 页面头部 */}
      <div className="page-header">
        <h1>⚖️ 专家观点对比</h1>
        <p className="subtitle">选择2-3位专家，对比分析同一话题的不同观点</p>
      </div>

      {showSelector ? (
        <>
          {/* 话题选择 */}
          <div className="topic-selection">
            <h3>选择分析话题</h3>
            <div className="topic-options">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  className={`topic-option ${selectedTopic.id === topic.id ? 'active' : ''}`}
                  onClick={() => setSelectedTopic(topic)}
                >
                  {topic.title}
                </button>
              ))}
            </div>
          </div>

          {/* 专家选择 */}
          <div className="expert-selector">
            <h3>
              选择对比专家
              <span className="selection-count">
                已选择 {selectedExperts.length}/3
              </span>
            </h3>

            <div className="expert-grid">
              {experts.map((expert) => {
                const isSelected = selectedExperts.includes(expert.id);
                const stats = getExpertFeedbackStats(expert.id);

                return (
                  <div
                    key={expert.id}
                    className={`expert-card ${isSelected ? 'selected' : ''} ${
                      selectedExperts.length >= 3 && !isSelected ? 'disabled' : ''
                    }`}
                    onClick={() => handleExpertToggle(expert.id)}
                  >
                    <div className="expert-header">
                      <div
                        className="expert-avatar"
                        style={{ background: getExpertColor(expert.level) }}
                      >
                        {expert.name.charAt(0)}
                      </div>
                      <div className="expert-info">
                        <span className="expert-name">{expert.name}</span>
                        <span className="expert-title">{expert.profile.title}</span>
                      </div>
                      <div
                        className="selection-indicator"
                        style={{ background: getDomainColor(expert.domainCode) }}
                      >
                        {isSelected ? '✓' : ''}
                      </div>
                    </div>

                    <div className="expert-meta">
                      <span className="domain-tag">{expert.domainName}</span>
                      <span className="acceptance-rate">
                        采纳率 {(stats.acceptanceRate * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="expert-philosophy">
                      <p>"{expert.philosophy.core[0]}"</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="selector-actions">
              <button
                className="btn-primary"
                disabled={selectedExperts.length < 2}
                onClick={generateComparison}
              >
                开始对比分析
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 对比结果 */}
          {loading ? (
            <div className="loading-panel">
              <div className="loading-spinner"></div>
              <p>正在生成专家对比分析...</p>
            </div>
          ) : (
            <div className="comparison-result">
              {/* 结果头部 */}
              <div className="result-header">
                <div className="topic-info">
                  <h3>{selectedTopic.title}</h3>
                  <span className="expert-count">{comparisonData.length} 位专家参与分析</span>
                </div>
                <div className="result-actions">
                  <button className="btn-secondary" onClick={resetComparison}>
                    重新选择
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => navigate(`/hot-topics/${selectedTopic.id}`)}
                  >
                    查看完整解读
                  </button>
                </div>
              </div>

              {/* 专家对比卡片 */}
              <div className="comparison-cards">
                {comparisonData.map((data, index) => (
                  <div key={data.expert.id} className="comparison-column">
                    <div className="column-header">
                      <div
                        className="expert-avatar-large"
                        style={{ background: getExpertColor(data.expert.level) }}
                      >
                        {data.expert.name.charAt(0)}
                      </div>
                      <div className="expert-info">
                        <span className="expert-name">{data.expert.name}</span>
                        <span className="expert-title">{data.expert.profile.title}</span>
                        <span className="expert-domain">{data.expert.domainName}</span>
                      </div>
                    </div>

                    <div className="expert-stats-bar">
                      <div className="stat-item">
                        <span className="stat-value">
                          {(data.stats.acceptanceRate * 100).toFixed(0)}%
                        </span>
                        <span className="stat-label">历史采纳率</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">{data.stats.totalReviews}</span>
                        <span className="stat-label">评审次数</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">
                          {(data.review?.confidence || 0) * 100}%
                        </span>
                        <span className="stat-label">置信度</span>
                      </div>
                    </div>

                    <div className="expert-opinion-box">
                      <h4>💡 核心观点</h4>
                      <p>{data.review?.opinion}</p>
                    </div>

                    <div className="focus-areas-box">
                      <h4>🎯 关注维度</h4>
                      <div className="focus-tags">
                        {data.review?.focusAreas.map((area, idx) => (
                          <span key={idx} className="focus-tag">
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="suggestions-box">
                      <h4>📋 建议</h4>
                      <ul>
                        {data.review?.suggestions.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="expert-philosophy-box">
                      <h4>🧠 投资理念</h4>
                      <p>"{data.expert.philosophy.core[0]}"</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 观点差异分析 */}
              {comparisonData.length >= 2 && (
                <div className="difference-analysis">
                  <h3>🔍 观点差异分析</h3>
                  <div className="analysis-content">
                    <div className="analysis-item">
                      <span className="analysis-label">关注焦点差异</span>
                      <p>
                        {comparisonData.map((d) => d.expert.name).join(' vs ')}：
                        各位专家从不同角度切入该话题。
                        {comparisonData[0]?.expert.name}关注
                        {comparisonData[0]?.review?.focusAreas[0] || '核心趋势'}，
                        而{comparisonData[1]?.expert.name}更侧重
                        {comparisonData[1]?.review?.focusAreas[0] || '风险评估'}。
                      </p>
                    </div>
                    <div className="analysis-item">
                      <span className="analysis-label">置信度对比</span>
                      <div className="confidence-comparison">
                        {comparisonData.map((data) => (
                          <div key={data.expert.id} className="confidence-bar-item">
                            <span className="expert-name">{data.expert.name}</span>
                            <div className="bar-wrapper">
                              <div
                                className="confidence-bar"
                                style={{ width: `${(data.review?.confidence || 0) * 100}%` }}
                              />
                            </div>
                            <span className="confidence-value">
                              {((data.review?.confidence || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
