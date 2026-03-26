// Dashboard 专家洞察组件 - Expert Insights
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchExperts, generateExpertOpinion, getTopExpertsByAcceptanceRate } from '../services/expertService';
import { hotTopicsApi } from '../api/client';
import type { Expert, ExpertReview } from '../types';
import type { HotTopic } from '../api/client';
import './ExpertInsights.css';

interface TopicWithExperts {
  id: string;
  title: string;
  type: 'trending' | 'new' | 'analysis';
  keyword: string;
  heat: number;
  source: string;
  experts: Expert[];
  previewReview?: ExpertReview;
}

export function ExpertInsights() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<TopicWithExperts[]>([]);
  const [loading, setLoading] = useState(true);
  const [topExperts, setTopExperts] = useState<Expert[]>([]);

  // 加载热点话题和匹配专家
  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    setLoading(true);

    // 获取最受欢迎的专家
    const topExpertsList = getTopExpertsByAcceptanceRate(5);
    setTopExperts(topExpertsList);

    try {
      // 从 RSS 数据获取实时热点话题
      const response = await hotTopicsApi.getFromRss(3);
      const hotTopics = response.items || [];

      // 如果没有数据，使用默认空数组
      if (hotTopics.length === 0) {
        setTopics([]);
        setLoading(false);
        return;
      }

      // 为每个热点话题匹配专家
      const topicsWithExperts: TopicWithExperts[] = hotTopics.map((topic: HotTopic, index: number) => {
        const matchResult = matchExperts({
          topic: topic.title,
          importance: 0.8,
        });

        const experts = matchResult.seniorExpert
          ? [matchResult.seniorExpert, ...matchResult.domainExperts.slice(0, 2)]
          : matchResult.domainExperts.slice(0, 3);

        // 生成预览观点
        let previewReview: ExpertReview | undefined;
        if (experts.length > 0) {
          const primaryExpert = experts[0];
          previewReview = generateExpertOpinion(
            primaryExpert,
            `关于${topic.title}的深度分析`,
            'draft'
          );
        }

        // 根据热度分数确定类型
        let type: 'trending' | 'new' | 'analysis' = 'analysis';
        if (topic.hotScore >= 80) type = 'trending';
        else if (topic.trend === 'up') type = 'new';

        return {
          id: topic.id || `topic-${index}`,
          title: topic.title,
          type,
          keyword: topic.source || '热点',
          heat: Math.round(topic.hotScore || 70),
          source: topic.source || 'RSS',
          experts,
          previewReview,
        };
      });

      setTopics(topicsWithExperts);
    } catch (error) {
      console.error('Failed to load hot topics:', error);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      trending: '🔥 热门',
      new: '✨ 最新',
      analysis: '📊 深度',
    };
    return labels[type] || type;
  };

  const getExpertColor = (level: string) => {
    return level === 'senior'
      ? 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
      : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
  };

  if (loading) {
    return (
      <div className="expert-insights-card">
        <div className="expert-insights-header">
          <span className="expert-insights-title">
            <span className="icon">🎯</span>
            今日专家洞察
          </span>
        </div>
        <div className="expert-insights-loading">
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="expert-insights-card">
      <div className="expert-insights-header">
        <span className="expert-insights-title">
          <span className="icon">🎯</span>
          今日专家洞察
        </span>
        <button className="refresh-btn" onClick={loadInsights}>
          🔄 刷新
        </button>
      </div>

      {topics.length === 0 ? (
        <div className="expert-insights-empty">
          <div className="icon">📭</div>
          <p>暂无热点话题数据</p>
        </div>
      ) : (
        topics.map((topic) => (
          <div key={topic.id} className="hot-topic-item">
            <div className="hot-topic-header">
              <span className="hot-topic-title">{topic.title}</span>
              <div className="hot-topic-meta">
                <span className="hot-topic-source">{topic.source}</span>
                <span className={`hot-topic-badge ${topic.type}`}>
                  {getTypeLabel(topic.type)}
                </span>
              </div>
            </div>

            <div className="matched-experts">
              <span className="matched-experts-label">匹配专家:</span>
              <div className="expert-avatars">
                {topic.experts.map((expert, idx) => (
                  <div
                    key={expert.id}
                    className="expert-avatar-mini"
                    style={{
                      background: getExpertColor(expert.level),
                      zIndex: topic.experts.length - idx,
                    }}
                    title={`${expert.name} - ${expert.profile.title}`}
                    onClick={() => navigate(`/hot-topics`)}
                  >
                    {expert.name.charAt(0)}
                  </div>
                ))}
              </div>
            </div>

            {topic.previewReview && (
              <div className="expert-insight-preview">
                <span className="quote">"{topic.previewReview.opinion.slice(0, 80)}..."</span>
                <span className="expert-name">
                  — {topic.experts[0]?.name} 观点
                </span>
              </div>
            )}
          </div>
        ))
      )}

      <button
        className="view-all-experts"
        onClick={() => navigate('/assets/rss')}
      >
        查看全部热点话题解读 →
      </button>
    </div>
  );
}
