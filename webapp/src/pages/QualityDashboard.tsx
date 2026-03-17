import { useState, useEffect, useCallback } from 'react';
import { dashboardApi } from '../api/client';
import type { DashboardData } from '../api/client';
import {
  ScoreCard,
  ProgressBar,
  HotTopics,
  Alerts,
  RssStatus,
  Suggestions,
  Sentiment,
  Recommendations,
  UserProfile,
  ContentAnalyzer,
} from '../components/dashboard';
import '../components/dashboard/Dashboard.css';

// 模拟数据（用于 API 未就绪时）
const mockDashboardData: DashboardData = {
  scores: {
    overallScore: 78,
    trend: '+5%',
    freshness: 85,
    credibility: 72,
    differentiation: 80,
    audienceMatch: 75,
  },
  hotTopics: [
    { title: 'GPT-5即将发布，AI能力再突破', score: 96, source: '36氪' },
    { title: '新能源汽车补贴政策调整', score: 88, source: '财新' },
    { title: '央行降准0.5个百分点', score: 85, source: '第一财经' },
    { title: '苹果Vision Pro国行发售', score: 82, source: '极客公园' },
  ],
  alerts: [
    {
      type: 'credibility',
      severity: 'warning',
      message: '部分数据缺少官方来源',
      suggestion: '引用统计局或央行官方数据',
    },
    {
      type: 'freshness',
      severity: 'info',
      message: '3篇文章超过48小时未更新',
      suggestion: '考虑更新最新数据',
    },
  ],
  rssSources: [
    { name: '36氪', status: 'active', lastFetch: '2分钟前' },
    { name: '财新', status: 'active', lastFetch: '5分钟前' },
    { name: '机器之心', status: 'error', lastFetch: '1小时前' },
  ],
  suggestions: [
    {
      area: '可信度',
      suggestion: '为"市场增长30%"添加数据来源链接',
      priority: 'high',
      impact: '增强读者信任',
    },
    {
      area: '差异化',
      suggestion: '补充独家观点，与竞品文章区分',
      priority: 'medium',
      impact: '提高内容竞争力',
    },
    {
      area: '时效性',
      suggestion: '更新2024年Q1最新数据',
      priority: 'medium',
      impact: '提升内容价值',
    },
  ],
  userProfile: {
    interests: { Tech: 0.85, Finance: 0.6, AI: 0.9 },
    topInterests: ['AI', 'Tech', 'Finance'],
  },
  sentiment: {
    msi: 65,
    level: 'greed',
    change24h: 8,
    distribution: { positive: 0.45, neutral: 0.35, negative: 0.2 },
    alerts: [],
  },
  recommendations: [
    {
      id: 'r1',
      title: 'AI医疗诊断突破',
      category: 'Tech',
      score: 92,
      reason: '基于您的科技偏好推荐',
      hotScore: 88,
    },
    {
      id: 'r2',
      title: '新能源汽车电池技术革新',
      category: 'Tech',
      score: 85,
      reason: '与您关注的新能源话题相关',
      hotScore: 82,
    },
    {
      id: 'r3',
      title: '央行数字货币试点进展',
      category: 'Finance',
      score: 78,
      reason: '当前热门话题',
      hotScore: 90,
    },
  ],
};

export function QualityDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('--');
  const [useMockData, setUseMockData] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      if (useMockData) {
        // 使用模拟数据
        setData(mockDashboardData);
      } else {
        // 使用真实 API
        const response = await dashboardApi.getDashboard();
        setData(response);
      }
      setLastUpdated(new Date().toLocaleString('zh-CN'));
    } catch (error) {
      console.error('获取仪表盘数据失败:', error);
      // 失败时使用模拟数据
      setData(mockDashboardData);
      setLastUpdated(new Date().toLocaleString('zh-CN') + ' (离线模式)');
    } finally {
      setLoading(false);
    }
  }, [useMockData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleFeedback = async (topicId: string, action: 'like' | 'ignore') => {
    console.log(`记录反馈: ${topicId} - ${action}`);
    // 实际应用中这里会调用 API
    if (!useMockData) {
      try {
        await dashboardApi.recordFeedback(topicId, action);
      } catch (error) {
        console.error('记录反馈失败:', error);
      }
    }
  };

  const handleAnalyze = async (content: string) => {
    if (useMockData) {
      // 模拟分析
      const score = Math.floor(60 + Math.random() * 30);
      const issues: string[] = [];
      const suggestions: string[] = [];

      if (content.length < 100) {
        issues.push('内容过短');
        suggestions.push('建议扩展到500字以上');
      }

      if (!content.includes('http') && !content.includes('来源')) {
        issues.push('缺少来源引用');
        suggestions.push('添加数据来源增强可信度');
      }

      return {
        score,
        wordCount: content.length,
        readingTime: Math.ceil(content.length / 500),
        issues,
        suggestions,
      };
    } else {
      return await dashboardApi.analyzeContent(content);
    }
  };

  if (loading) {
    return <div className="loading">加载仪表盘数据...</div>;
  }

  if (!data) {
    return <div className="alert-placeholder">无法加载仪表盘数据</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>📊 内容质量仪表盘</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className="last-updated">最后更新: {lastUpdated}</span>
          <label style={{ fontSize: '13px', color: '#6b7280' }}>
            <input
              type="checkbox"
              checked={useMockData}
              onChange={(e) => setUseMockData(e.target.checked)}
              style={{ marginRight: '4px' }}
            />
            模拟数据
          </label>
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? '⏳ 刷新中...' : '🔄 刷新'}
          </button>
        </div>
      </header>

      {/* 分数卡片 */}
      <div className="score-cards">
        <ScoreCard
          title="综合质量分数"
          score={data.scores.overallScore}
          trend={`较上周 ${data.scores.trend}`}
          isMain
        />
        <div className="score-card">
          <h3>时效性</h3>
          <ProgressBar value={data.scores.freshness} />
        </div>
        <div className="score-card">
          <h3>可信度</h3>
          <ProgressBar value={data.scores.credibility} />
        </div>
        <div className="score-card">
          <h3>差异化</h3>
          <ProgressBar value={data.scores.differentiation} />
        </div>
        <div className="score-card">
          <h3>受众匹配</h3>
          <ProgressBar value={data.scores.audienceMatch} />
        </div>
      </div>

      {/* 指标网格 */}
      <div className="metrics-grid">
        <div className="metric-section">
          <h2>🔥 热点话题</h2>
          <HotTopics topics={data.hotTopics} />
        </div>

        <div className="metric-section">
          <h2>🎯 智能推荐 (v3.1)</h2>
          <UserProfile profile={data.userProfile} />
          <Recommendations
            recommendations={data.recommendations}
            onFeedback={handleFeedback}
          />
        </div>

        <div className="metric-section">
          <h2>📊 情感分析 (v3.2)</h2>
          <Sentiment sentiment={data.sentiment} />
        </div>

        <div className="metric-section">
          <h2>⚠️ 实时预警</h2>
          <Alerts alerts={data.alerts} />
        </div>

        <div className="metric-section">
          <h2>💡 优化建议</h2>
          <Suggestions suggestions={data.suggestions} />
        </div>
      </div>

      {/* RSS 源状态 */}
      <div className="rss-section">
        <h2>📰 RSS源状态</h2>
        <RssStatus sources={data.rssSources} />
      </div>

      {/* 内容分析器 */}
      <div className="content-analyzer">
        <h2>📝 内容分析器</h2>
        <ContentAnalyzer onAnalyze={handleAnalyze} />
      </div>
    </div>
  );
}

export default QualityDashboard;
