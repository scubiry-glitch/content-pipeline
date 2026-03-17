// Dashboard 专家洞察组件 - Expert Insights
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchExperts, generateExpertOpinion, getTopExpertsByAcceptanceRate } from '../services/expertService';
import type { Expert, ExpertReview } from '../types';
import './ExpertInsights.css';

// 模拟热点话题数据
const HOT_TOPICS = [
  {
    id: 'topic-1',
    title: '央行降准对房地产市场的影响分析',
    type: 'trending',
    keyword: '房地产',
    heat: 95,
  },
  {
    id: 'topic-2',
    title: '新能源车企出海战略与本地化挑战',
    type: 'new',
    keyword: '新能源',
    heat: 88,
  },
  {
    id: 'topic-3',
    title: 'AI大模型在金融科技中的应用前景',
    type: 'analysis',
    keyword: '人工智能',
    heat: 92,
  },
];

interface TopicWithExperts {
  id: string;
  title: string;
  type: 'trending' | 'new' | 'analysis';
  keyword: string;
  heat: number;
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

    // 为每个热点话题匹配专家
    const topicsWithExperts: TopicWithExperts[] = HOT_TOPICS.map((topic) => {
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

      return {
        ...topic,
        experts,
        previewReview,
      };
    });

    setTopics(topicsWithExperts);
    setLoading(false);
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

      {topics.map((topic) => (
        <div key={topic.id} className="hot-topic-item">
          <div className="hot-topic-header">
            <span className="hot-topic-title">{topic.title}</span>
            <span className={`hot-topic-badge ${topic.type}`}>
              {getTypeLabel(topic.type)}
            </span>
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
                  onClick={() => navigate(`/experts?highlight=${expert.id}`)}
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
      ))}

      <button
        className="view-all-experts"
        onClick={() => navigate('/experts')}
      >
        查看全部 {topExperts.length} 位推荐专家 →
      </button>
    </div>
  );
}
