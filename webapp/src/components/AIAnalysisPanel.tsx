// AI 分析详情面板
// v6.1 展示完整的 AI 分析结果

import { useState, useEffect } from 'react';
import { aiProcessingApi, type AIAnalysisResult } from '../api/client';
import { AIQualityBadge } from './AIQualityBadge';
import './AIAnalysisPanel.css';

interface AIAnalysisPanelProps {
  rssItemId: string;
  onCreateTask?: (recommendation: AIAnalysisResult['taskRecommendation']) => void;
}

export function AIAnalysisPanel({ rssItemId, onCreateTask }: AIAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalysis();
  }, [rssItemId]);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aiProcessingApi.getAnalysis(rssItemId);
      setAnalysis(result);
    } catch (err) {
      console.error('Failed to load AI analysis:', err);
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadAnalysis();
  };

  const handleTriggerAnalysis = async () => {
    try {
      setLoading(true);
      await aiProcessingApi.batchProcess({ itemIds: [rssItemId] });
      // 等待几秒后刷新结果
      setTimeout(loadAnalysis, 5000);
    } catch (err) {
      console.error('Failed to trigger analysis:', err);
      setError('触发分析失败');
      setLoading(false);
    }
  };

  if (loading && !analysis) {
    return (
      <div className="ai-analysis-panel">
        <div className="loading-state">🤖 AI 分析中...</div>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="ai-analysis-panel">
        <div className="ai-analysis-empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-title">加载失败</div>
          <div className="empty-desc">{error}</div>
          <button className="btn-analyze" onClick={loadAnalysis}>重试</button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="ai-analysis-panel">
        <div className="ai-analysis-empty">
          <div className="empty-icon">🤖</div>
          <div className="empty-title">尚未进行 AI 分析</div>
          <div className="empty-desc">点击下方按钮开始智能分析</div>
          <button 
            className="btn-analyze" 
            onClick={handleTriggerAnalysis}
            disabled={loading}
          >
            {loading ? '分析中...' : '开始 AI 分析'}
          </button>
        </div>
      </div>
    );
  }

  const { quality, category, sentiment, taskRecommendation } = analysis;

  // 根据分数确定等级
  const getScoreLevel = (score: number) => {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'average';
    return 'poor';
  };

  const recommendationLabels: Record<string, string> = {
    promote: '重点推荐',
    normal: '正常',
    demote: '降权',
    filter: '建议过滤',
  };

  return (
    <div className="ai-analysis-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>🤖</span>
          <span>AI 智能分析</span>
        </div>
        <div className="panel-actions">
          <button 
            className="btn-refresh" 
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 质量评分卡片 */}
      <div className="quality-score-card">
        <div className="score-header">
          <div className="overall-score">
            <span className={`score-value ${getScoreLevel(quality.overall)}`}>
              {quality.overall}
            </span>
            <span className="score-max">/100</span>
          </div>
          <span className={`recommendation-badge ${quality.aiAssessment.recommendation}`}>
            {recommendationLabels[quality.aiAssessment.recommendation]}
          </span>
        </div>
        
        <div className="score-summary">{quality.aiAssessment.summary}</div>
        
        <div className="dimensions-grid">
          {Object.entries(quality.dimensions).map(([key, score]) => (
            <div key={key} className="dimension-item">
              <div className="dimension-name">
                {key === 'contentRichness' && '内容丰富度'}
                {key === 'sourceCredibility' && '来源可信度'}
                {key === 'timeliness' && '时效性'}
                {key === 'uniqueness' && '独特性'}
                {key === 'readability' && '可读性'}
                {key === 'dataSupport' && '数据支撑'}
              </div>
              <div className={`dimension-score ${getScoreLevel(score)}`}>{score}</div>
            </div>
          ))}
        </div>

        <div className="assessment-section">
          <div className="section">
            <div className="section-title">👍 优点</div>
            <ul>
              {quality.aiAssessment.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
              {quality.aiAssessment.strengths.length === 0 && (
                <li style={{ color: '#9ca3af' }}>暂无</li>
              )}
            </ul>
          </div>
          <div className="section">
            <div className="section-title">👎 不足</div>
            <ul>
              {quality.aiAssessment.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {quality.aiAssessment.weaknesses.length === 0 && (
                <li style={{ color: '#9ca3af' }}>暂无</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* 领域分类 */}
      <div className="analysis-section category-info">
        <div className="section-header">
          <div className="section-title">📂 领域分类</div>
          <span className="confidence-badge">
            置信度 {(category.primaryCategory.confidence * 100).toFixed(0)}%
          </span>
        </div>
        
        <div className="primary-category">
          <span className="category-name">{category.primaryCategory.domain}</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {category.primaryCategory.reason}
          </span>
        </div>

        {category.secondaryCategories.length > 0 && (
          <div className="secondary-categories">
            {category.secondaryCategories.map((c, i) => (
              <span key={i} className="secondary-tag">{c.domain}</span>
            ))}
          </div>
        )}

        {category.tags.length > 0 && (
          <div className="extracted-tags">
            {category.tags.slice(0, 10).map((t, i) => (
              <span key={i} className="extracted-tag">{t.tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* 情感分析 */}
      <div className="analysis-section sentiment-info">
        <div className="section-header">
          <div className="section-title">😊 情感分析</div>
        </div>
        
        <div className="sentiment-header">
          <div className="sentiment-score-box">
            <span className={`sentiment-score-value ${sentiment.score > 0 ? 'positive' : sentiment.score < 0 ? 'negative' : ''}`}>
              {sentiment.score > 0 ? '+' : ''}{sentiment.score}
            </span>
            <span className="sentiment-score-label">情感分数</span>
          </div>
          <AIQualityBadge 
            score={sentiment.score + 50} 
            showIcon={false}
          />
        </div>

        <div className="sentiment-dimensions">
          {[
            { key: 'marketSentiment', label: '市场情绪', score: sentiment.dimensions.marketSentiment },
            { key: 'policySentiment', label: '政策态度', score: sentiment.dimensions.policySentiment },
            { key: 'industryOutlook', label: '行业前景', score: sentiment.dimensions.industryOutlook },
            { key: 'investmentSentiment', label: '投资情绪', score: sentiment.dimensions.investmentSentiment },
          ].map(({ key, label, score }) => (
            <div key={key} className="dimension-bar">
              <span className="dimension-label">{label}</span>
              <div className="dimension-progress">
                <div 
                  className={`dimension-progress-fill ${score > 0 ? 'positive' : 'negative'}`}
                  style={{ 
                    width: `${Math.abs(score)}%`,
                    marginLeft: score < 0 ? `${50 - Math.abs(score) / 2}%` : '50%'
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {sentiment.keyOpinions.length > 0 && (
          <div className="opinions-list">
            {sentiment.keyOpinions.slice(0, 3).map((opinion, i) => (
              <div key={i} className="opinion-item">
                <div className="opinion-text">{opinion.opinion}</div>
                <div className="opinion-meta">
                  {opinion.sentiment === 'positive' ? '😊' : opinion.sentiment === 'negative' ? '😔' : '😐'} 
                  {' '}置信度 {(opinion.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 任务推荐 */}
      {taskRecommendation && (
        <div className="task-recommendation">
          <div className="rec-header">
            <div className="rec-title">💡 创作建议</div>
            <span className={`rec-priority ${taskRecommendation.priority}`}>
              {taskRecommendation.priority === 'high' ? '高优先级' : 
               taskRecommendation.priority === 'medium' ? '中优先级' : '低优先级'}
            </span>
          </div>
          
          <div className="rec-reason">{taskRecommendation.reason}</div>
          
          <div className="rec-content">
            <h4>建议切入角度</h4>
            <div className="rec-angle">{taskRecommendation.content.angle}</div>
            
            <h4>核心观点</h4>
            <ul className="rec-keypoints">
              {taskRecommendation.content.keyPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
            
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
              预计阅读时长: {taskRecommendation.content.estimatedReadTime}分钟 | 
              建议篇幅: {taskRecommendation.content.suggestedLength}
            </div>
          </div>

          <div className="rec-actions">
            <button 
              className="btn-create-task"
              onClick={() => onCreateTask?.(taskRecommendation)}
            >
              创建任务
            </button>
            <button className="btn-dismiss">忽略</button>
          </div>
        </div>
      )}
    </div>
  );
}
