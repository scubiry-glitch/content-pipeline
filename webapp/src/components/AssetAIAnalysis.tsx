// AssetAIAnalysis.tsx
// v6.2: Assets AI 批量处理 - AI 分析结果展示组件

import { useState, useEffect } from 'react';
import { assetsAiApi } from '../api/assetsAi';
import './AssetAIAnalysis.css';

export interface AssetAIAnalysisData {
  assetId: string;
  quality: {
    overall: number;
    dimensions: {
      completeness: number;
      dataQuality: number;
      sourceAuthority: number;
      timeliness: number;
      readability: number;
      practicality: number;
    };
    aiAssessment: {
      summary: string;
      strengths: string[];
      weaknesses: string[];
      keyInsights: string[];
      dataHighlights: string[];
      recommendation: 'highly_recommended' | 'recommended' | 'normal' | 'archive';
      confidence: number;
    };
  };
  classification: {
    primaryTheme: {
      themeId: string;
      themeName: string;
      confidence: number;
    };
    tags: Array<{ tag: string; type: string; confidence: number }>;
    entities: Array<{ name: string; type: string; mentions: number }>;
  };
  duplicate?: {
    isDuplicate: boolean;
    duplicateOf?: string;
    similarAssets: Array<{
      assetId: string;
      assetTitle: string;
      similarity: number;
    }>;
  };
  taskRecommendation?: {
    title: string;
    format: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
    content: {
      angle: string;
      keyPoints: string[];
    };
  };
  processingTimeMs: number;
  modelVersion: string;
}

interface AssetAIAnalysisProps {
  assetId: string;
  compact?: boolean; // 紧凑模式（用于列表展示）
}

export function AssetAIAnalysis({ assetId, compact = false }: AssetAIAnalysisProps) {
  const [analysis, setAnalysis] = useState<AssetAIAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'quality' | 'classification' | 'duplicate' | 'recommendation'>('quality');

  useEffect(() => {
    loadAnalysis();
  }, [assetId]);
  


  const loadAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await assetsAiApi.getAnalysis(assetId);
      setAnalysis(data);
    } catch (err: any) {
      console.error('[AssetAIAnalysis] Error:', err);
      // 404 表示尚未分析，显示"开始分析"按钮
      if (err?.response?.status === 404 || err?.message?.includes('404')) {
        setAnalysis(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : '加载失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerAnalysis = async () => {
    setLoading(true);
    try {
      await assetsAiApi.triggerBatchProcess({ assetIds: [assetId] });
      // 轮询等待结果
      const interval = setInterval(async () => {
        try {
          const data = await assetsAiApi.getAnalysis(assetId);
          if (data) {
            setAnalysis(data);
            clearInterval(interval);
            setLoading(false);
          }
        } catch {
          // 继续轮询
        }
      }, 3000);
      
      // 30秒后停止轮询
      setTimeout(() => {
        clearInterval(interval);
        setLoading(false);
      }, 30000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '触发失败');
      setLoading(false);
    }
  };

  // 紧凑模式 - 仅展示质量分和状态
  if (compact) {
    if (loading) {
      return <div className="ai-analysis-badge loading">分析中...</div>;
    }
    
    if (!analysis) {
      return (
        <div 
          className="ai-analysis-badge pending"
          onClick={(e) => {
            e.stopPropagation();
            triggerAnalysis();
          }}
        >
          <span className="material-icon">psychology</span>
          点击分析
        </div>
      );
    }

    const score = analysis.quality.overall;
    const recommendation = analysis.quality.aiAssessment.recommendation;
    
    const getScoreColor = () => {
      if (score >= 80) return '#52c41a';
      if (score >= 60) return '#faad14';
      return '#ff4d4f';
    };

    const getRecommendationIcon = () => {
      switch (recommendation) {
        case 'highly_recommended': return '⭐';
        case 'recommended': return '👍';
        case 'archive': return '📦';
        default: return '✓';
      }
    };

    return (
      <div className="ai-analysis-badge">
        <span 
          className="ai-score"
          style={{ color: getScoreColor() }}
        >
          {score}分
        </span>
        <span className="ai-recommendation-icon">{getRecommendationIcon()}</span>
        {analysis.duplicate?.isDuplicate && (
          <span className="ai-duplicate-warning" title="疑似重复">
            ⚠️
          </span>
        )}
      </div>
    );
  }

  // 完整模式
  if (loading) {
    return (
      <div className="ai-analysis-panel loading">
        <div className="analysis-loading">
          <span className="material-icon spinning">refresh</span>
          <p>AI 正在分析中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ai-analysis-panel error">
        <p>❌ {error}</p>
        <button className="btn-retry" onClick={loadAnalysis}>重试</button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="ai-analysis-panel empty" style={{ textAlign: 'center', padding: '48px' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🤖</div>
        <p style={{ color: '#666', marginBottom: '24px' }}>尚未进行 AI 分析</p>
        <button 
          onClick={triggerAnalysis}
          style={{
            padding: '12px 24px',
            background: '#1890ff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>▶</span>
          开始分析
        </button>
      </div>
    );
  }

  const { quality, classification, duplicate, taskRecommendation } = analysis;

  return (
    <div className="ai-analysis-panel">
      {/* 头部概览 */}
      <div className="analysis-header">
        <div className="quality-score-large">
          <div 
            className="score-circle"
            style={{ 
              background: `conic-gradient(${getScoreColor(quality.overall)} ${quality.overall}%, #f0f0f0 ${quality.overall}%)` 
            }}
          >
            <span className="score-value">{quality.overall}</span>
          </div>
          <span className="score-label">质量评分</span>
        </div>
        
        <div className="analysis-meta">
          <div className="meta-item">
            <span className="meta-label">AI 置信度</span>
            <span className="meta-value">{(quality.aiAssessment.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">处理时间</span>
            <span className="meta-value">{(analysis.processingTimeMs / 1000).toFixed(1)}s</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">模型版本</span>
            <span className="meta-value">{analysis.modelVersion}</span>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="analysis-tabs">
        <button 
          className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          质量评估
        </button>
        <button 
          className={`tab-btn ${activeTab === 'classification' ? 'active' : ''}`}
          onClick={() => setActiveTab('classification')}
        >
          主题分类
        </button>
        <button 
          className={`tab-btn ${activeTab === 'duplicate' ? 'active' : ''}`}
          onClick={() => setActiveTab('duplicate')}
        >
          去重检测
          {duplicate?.isDuplicate && <span className="warning-dot" />}
        </button>
        {taskRecommendation && (
          <button 
            className={`tab-btn ${activeTab === 'recommendation' ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendation')}
          >
            任务推荐
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div className="analysis-content">
        {activeTab === 'quality' && (
          <div className="quality-tab">
            {/* 六维度评分 */}
            <div className="dimensions-grid">
              {Object.entries(quality.dimensions).map(([key, value]) => (
                <div key={key} className="dimension-item">
                  <span className="dimension-name">{getDimensionLabel(key)}</span>
                  <div className="dimension-bar">
                    <div 
                      className="dimension-bar-fill"
                      style={{ width: `${value}%`, backgroundColor: getScoreColor(value) }}
                    />
                  </div>
                  <span className="dimension-score">{value}</span>
                </div>
              ))}
            </div>

            {/* AI 评估摘要 */}
            <div className="ai-assessment">
              <h4>AI 评估摘要</h4>
              <p className="assessment-summary">{quality.aiAssessment.summary}</p>
              
              {quality.aiAssessment.strengths.length > 0 && (
                <div className="strengths">
                  <h5>✅ 优点</h5>
                  <ul>
                    {quality.aiAssessment.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {quality.aiAssessment.weaknesses.length > 0 && (
                <div className="weaknesses">
                  <h5>⚠️ 不足</h5>
                  <ul>
                    {quality.aiAssessment.weaknesses.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {quality.aiAssessment.keyInsights.length > 0 && (
                <div className="key-insights">
                  <h5>💡 核心洞察</h5>
                  <ul>
                    {quality.aiAssessment.keyInsights.map((insight, i) => (
                      <li key={i}>{insight}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'classification' && (
          <div className="classification-tab">
            <div className="primary-theme">
              <h4>主主题</h4>
              <div className="theme-badge">
                <span className="theme-name">{classification.primaryTheme.themeName}</span>
                <span className="theme-confidence">
                  置信度: {(classification.primaryTheme.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="extracted-tags">
              <h4>提取标签</h4>
              <div className="tags-cloud">
                {classification.tags.map((tag, i) => (
                  <span 
                    key={i} 
                    className={`tag-item type-${tag.type}`}
                    title={`置信度: ${(tag.confidence * 100).toFixed(0)}%`}
                  >
                    {tag.tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="extracted-entities">
              <h4>识别实体</h4>
              <div className="entities-list">
                {classification.entities.map((entity, i) => (
                  <div key={i} className="entity-item">
                    <span className="entity-name">{entity.name}</span>
                    <span className="entity-type">{entity.type}</span>
                    <span className="entity-mentions">提及 {entity.mentions} 次</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'duplicate' && (
          <div className="duplicate-tab">
            {duplicate?.isDuplicate ? (
              <div className="duplicate-warning">
                <span className="warning-icon">⚠️</span>
                <h4>疑似重复内容</h4>
                <p>该素材与以下内容高度相似</p>
                
                {duplicate.duplicateOf && (
                  <div className="duplicate-source">
                    <span>源文件 ID: {duplicate.duplicateOf}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-duplicate">
                <span className="success-icon">✓</span>
                <h4>未发现重复</h4>
                <p>该素材为原创内容</p>
              </div>
            )}

            {duplicate?.similarAssets && duplicate.similarAssets.length > 0 && (
              <div className="similar-assets">
                <h4>相似素材</h4>
                {duplicate.similarAssets.map((asset, i) => (
                  <div key={i} className="similar-asset-item">
                    <span className="asset-title">{asset.assetTitle}</span>
                    <span 
                      className="similarity-score"
                      style={{ color: getSimilarityColor(asset.similarity) }}
                    >
                      相似度: {(asset.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'recommendation' && taskRecommendation && (
          <div className="recommendation-tab">
            <div className="recommendation-header">
              <h4>{taskRecommendation.title}</h4>
              <span className={`priority-badge priority-${taskRecommendation.priority}`}>
                {taskRecommendation.priority === 'high' ? '高' : 
                 taskRecommendation.priority === 'medium' ? '中' : '低'}优先级
              </span>
            </div>
            
            <p className="recommendation-reason">{taskRecommendation.reason}</p>
            
            <div className="content-suggestion">
              <h5>切入角度</h5>
              <p>{taskRecommendation.content.angle}</p>
              
              <h5>核心观点</h5>
              <ul>
                {taskRecommendation.content.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="analysis-footer">
        <button className="btn-refresh" onClick={triggerAnalysis}>
          <span className="material-icon">refresh</span>
          重新分析
        </button>
      </div>
    </div>
  );
}

// 辅助函数
function getScoreColor(score: number): string {
  if (score >= 80) return '#52c41a';
  if (score >= 60) return '#faad14';
  return '#ff4d4f';
}

function getDimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    completeness: '完整性',
    dataQuality: '数据质量',
    sourceAuthority: '来源权威性',
    timeliness: '时效性',
    readability: '可读性',
    practicality: '实用性',
  };
  return labels[key] || key;
}

function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.9) return '#ff4d4f';
  if (similarity >= 0.7) return '#faad14';
  return '#52c41a';
}
