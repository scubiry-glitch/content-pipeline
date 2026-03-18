// 热点话题专家解读 - Hot Topic Expert Insights
// Phase 3: 自动生成热点话题的完整专家解读报告

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  matchExperts,
  generateExpertOpinion,
  getExpertWorkload,
  getTopExpertsByAcceptanceRate,
} from '../services/expertService';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type FavoriteReport,
} from '../services/favoritesService';
import type { Expert, ExpertReview } from '../types';
import './HotTopicInsights.css';

// Tab导航组件
function HotTopicsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: 'topics', label: '热点列表', icon: '🔥', path: '/hot-topics' },
    { id: 'insights', label: '专家解读', icon: '👨‍💼', path: '/hot-topics/insights' },
    { id: 'sentiment', label: '情感分析', icon: '😊', path: '/sentiment' },
    { id: 'prediction', label: '预测分析', icon: '🔮', path: '/prediction' },
  ];
  
  const activeTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || 'insights';
  
  return (
    <div className="hot-topics-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// 热点话题数据
const HOT_TOPICS = [
  {
    id: 'topic-1',
    title: '央行降准对房地产市场的影响分析',
    category: '宏观经济',
    heat: 95,
    summary: '央行宣布降准0.5个百分点，释放流动性约1万亿元，对房地产市场将产生深远影响。',
    keywords: ['降准', '房地产', '货币政策', '流动性'],
  },
  {
    id: 'topic-2',
    title: '新能源车企出海战略与本地化挑战',
    category: '新能源',
    heat: 88,
    summary: '中国新能源车企加速出海，但面临本地化生产、品牌认知、政策合规等多重挑战。',
    keywords: ['新能源', '出海', '本地化', '电动车'],
  },
  {
    id: 'topic-3',
    title: 'AI大模型在金融科技中的应用前景',
    category: '人工智能',
    heat: 92,
    summary: 'AI大模型技术正在重塑金融科技行业，从智能投顾到风控反欺诈，应用场景不断拓展。',
    keywords: ['AI', '大模型', '金融科技', '智能投顾'],
  },
  {
    id: 'topic-4',
    title: '消费降级还是消费分级？零售行业新趋势',
    category: '消费零售',
    heat: 85,
    summary: '消费市场出现分化，高端消费与性价比消费并存，零售企业如何应对？',
    keywords: ['消费', '零售', '性价比', '品牌'],
  },
  {
    id: 'topic-5',
    title: '半导体产业链重构与国产替代加速',
    category: '半导体',
    heat: 90,
    summary: '全球半导体产业链加速重构，国产替代进入深水区，设备材料环节成关键。',
    keywords: ['半导体', '国产替代', '产业链', '芯片'],
  },
];

// 解读报告接口
interface ExpertInsightReport {
  id: string;
  topicId: string;
  topicTitle: string;
  generatedAt: string;
  seniorExpertReview?: ExpertReview & { expert: Expert };
  domainExpertReviews: Array<ExpertReview & { expert: Expert }>;
  synthesis: {
    keyInsights: string[];
    riskWarnings: string[];
    opportunities: string[];
    recommendations: string[];
  };
}

// 转换报告为可存储格式
function convertToStorable(
  report: ExpertInsightReport
): FavoriteReport['reportData'] {
  return {
    id: report.id,
    topicId: report.topicId,
    topicTitle: report.topicTitle,
    generatedAt: report.generatedAt,
    seniorExpertReview: report.seniorExpertReview
      ? {
          expertId: report.seniorExpertReview.expert.id,
          expertName: report.seniorExpertReview.expert.name,
          opinion: report.seniorExpertReview.opinion,
          focusAreas: report.seniorExpertReview.focusAreas,
          suggestions: report.seniorExpertReview.suggestions,
          confidence: report.seniorExpertReview.confidence,
          timestamp: report.seniorExpertReview.timestamp,
        }
      : undefined,
    domainExpertReviews: report.domainExpertReviews.map((r) => ({
      expertId: r.expert.id,
      expertName: r.expert.name,
      expertTitle: r.expert.profile.title,
      opinion: r.opinion,
      confidence: r.confidence,
    })),
    synthesis: report.synthesis,
  };
}

export function HotTopicInsights() {
  const navigate = useNavigate();
  const { topicId } = useParams();
  const [selectedTopic, setSelectedTopic] = useState(
    topicId ? HOT_TOPICS.find((t) => t.id === topicId) || HOT_TOPICS[0] : HOT_TOPICS[0]
  );
  const [report, setReport] = useState<ExpertInsightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<string[]>([]);
  // 报告缓存
  const [reportCache, setReportCache] = useState<Record<string, ExpertInsightReport>>({});
  // 收藏的报告
  const [favoriteReports, setFavoriteReports] = useState<FavoriteReport[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  // 切换话题时优先使用缓存
  const handleTopicChange = (topic: typeof HOT_TOPICS[0]) => {
    setSelectedTopic(topic);
    if (reportCache[topic.id]) {
      setReport(reportCache[topic.id]);
    } else {
      generateReport(topic);
    }
  };

  // 生成解读报告
  const generateReport = async (topic: typeof HOT_TOPICS[0]) => {
    setLoading(true);

    // 模拟API延迟
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 匹配专家
    const matchResult = matchExperts({
      topic: topic.title,
      importance: 0.9,
    });

    // 生成特级专家解读
    let seniorExpertReview: (ExpertReview & { expert: Expert }) | undefined;
    if (matchResult.seniorExpert) {
      const review = generateExpertOpinion(
        matchResult.seniorExpert,
        topic.summary,
        'draft'
      );
      seniorExpertReview = { ...review, expert: matchResult.seniorExpert };
    }

    // 生成领域专家解读
    const domainExpertReviews = matchResult.domainExperts.slice(0, 3).map((expert) => {
      const review = generateExpertOpinion(expert, topic.summary, 'draft');
      return { ...review, expert };
    });

    // 生成综合洞察
    const synthesis = {
      keyInsights: [
        `${topic.category}领域正处于关键转折点，政策支持与市场需求双重驱动`,
        '技术创新是核心竞争力，头部企业领先优势明显',
        '产业链协同效应增强，上下游整合加速',
      ],
      riskWarnings: [
        '政策变化可能带来不确定性',
        '竞争加剧导致利润空间压缩',
        '技术迭代风险需要持续关注',
      ],
      opportunities: [
        '下沉市场仍有较大增长空间',
        '出海战略打开第二增长曲线',
        '数字化转型带来效率提升机会',
      ],
      recommendations: [
        '建议持续关注政策动向，及时调整策略',
        '加大研发投入，构建技术护城河',
        '优化成本结构，提升抗风险能力',
      ],
    };

    const newReport: ExpertInsightReport = {
      id: `report-${Date.now()}`,
      topicId: topic.id,
      topicTitle: topic.title,
      generatedAt: new Date().toISOString(),
      seniorExpertReview,
      domainExpertReviews,
      synthesis,
    };

    // 存入缓存
    setReportCache((prev) => ({ ...prev, [topic.id]: newReport }));
    setReport(newReport);
    setLoading(false);
  };

  // 保存报告
  const saveReport = () => {
    if (report && !savedReports.includes(report.id)) {
      setSavedReports([...savedReports, report.id]);
      alert('报告已保存');
    }
  };

  // 分享报告
  const shareReport = () => {
    if (report) {
      const shareUrl = `${window.location.origin}/hot-topics/${selectedTopic.id}`;
      navigator.clipboard.writeText(shareUrl);
      alert('链接已复制到剪贴板');
    }
  };

  // 导出PDF（模拟）
  const exportPDF = () => {
    alert('PDF导出功能开发中...');
  };

  // 收藏/取消收藏报告
  const toggleFavorite = async () => {
    if (!report) return;

    const isFavorite = favoriteReports.some((r) => r.reportId === report.id);

    try {
      if (isFavorite) {
        await removeFavorite(report.id);
        setFavoriteReports((prev) => prev.filter((r) => r.reportId !== report.id));
      } else {
        const newFavorite = await addFavorite(
          report.id,
          report.topicId,
          report.topicTitle,
          convertToStorable(report)
        );
        setFavoriteReports((prev) => [...prev, newFavorite]);
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      alert('操作失败，请稍后重试');
    }
  };

  // 加载收藏的报告
  const loadFavoriteReport = (favReport: FavoriteReport) => {
    const topic = HOT_TOPICS.find((t) => t.id === favReport.topicId);
    if (topic) {
      setSelectedTopic(topic);
      // 从收藏数据恢复报告
      const restoredReport: ExpertInsightReport = {
        id: favReport.reportData.id,
        topicId: favReport.reportData.topicId,
        topicTitle: favReport.reportData.topicTitle,
        generatedAt: favReport.reportData.generatedAt,
        synthesis: favReport.reportData.synthesis,
        domainExpertReviews: [], // 简化处理，从收藏加载时不需要完整专家对象
      };
      setReport(restoredReport);
      setShowFavorites(false);
    }
  };

  // 删除收藏的报告
  const deleteFavorite = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeFavorite(reportId);
      setFavoriteReports((prev) => prev.filter((r) => r.reportId !== reportId));
    } catch (error) {
      console.error('Failed to remove favorite:', error);
      alert('删除失败，请稍后重试');
    }
  };

  // 加载收藏列表
  const loadFavorites = async () => {
    setIsLoadingFavorites(true);
    try {
      const favorites = await getFavorites();
      setFavoriteReports(favorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setIsLoadingFavorites(false);
    }
  };

  useEffect(() => {
    generateReport(selectedTopic);
    loadFavorites();
  }, []);

  return (
    <div className="hot-topic-insights-page">
      {/* 页面头部 */}
      <div className="page-header">
        <h1>🔥 热点话题专家解读</h1>
        <p className="subtitle">AI驱动的多专家联合深度分析</p>
      </div>

      {/* Tab导航 */}
      <HotTopicsTabs />

      {/* 话题选择器 */}
      <div className="topic-selector">
        <div className="selector-header">
          <h3>选择话题</h3>
          <button
            className={`btn-favorites-toggle ${showFavorites ? 'active' : ''}`}
            onClick={() => setShowFavorites(!showFavorites)}
          >
            ❤️ 我的收藏 ({favoriteReports.length})
          </button>
        </div>

        {showFavorites ? (
          <div className="favorites-panel">
            {isLoadingFavorites ? (
              <div className="loading-favorites">
                <span>加载中...</span>
              </div>
            ) : favoriteReports.length === 0 ? (
              <div className="empty-favorites">
                <p>暂无收藏的报告</p>
                <span>点击报告中的"收藏"按钮保存您感兴趣的解读</span>
              </div>
            ) : (
              <div className="favorites-list">
                {favoriteReports.map((fav) => (
                  <div
                    key={fav.id}
                    className="favorite-item"
                    onClick={() => loadFavoriteReport(fav)}
                  >
                    <div className="favorite-info">
                      <span className="favorite-title">{fav.topicTitle}</span>
                      <span className="favorite-time">
                        {new Date(fav.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      className="btn-delete-favorite"
                      onClick={(e) => deleteFavorite(fav.reportId, e)}
                      title="删除收藏"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="topic-list">
            {HOT_TOPICS.map((topic) => (
              <button
                key={topic.id}
                className={`topic-btn ${selectedTopic.id === topic.id ? 'active' : ''}`}
                onClick={() => handleTopicChange(topic)}
                disabled={loading}
              >
                <span className="topic-heat">🔥 {topic.heat}</span>
                <span className="topic-title">{topic.title}</span>
                <span className="topic-category">{topic.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="loading-panel">
          <div className="loading-spinner"></div>
          <p>正在生成专家解读报告...</p>
          <span className="loading-hint">AI正在协调多位专家进行分析</span>
        </div>
      )}

      {/* 解读报告 */}
      {!loading && report && (
        <div className="insight-report">
          {/* 报告头部 */}
          <div className="report-header">
            <div className="report-title">
              <h2>{report.topicTitle}</h2>
              <span className="report-time">
                生成时间: {new Date(report.generatedAt).toLocaleString()}
              </span>
            </div>
            <div className="report-actions">
              <button
                className={`btn-favorite ${favoriteReports.some((r) => r.reportId === report.id) ? 'active' : ''}`}
                onClick={toggleFavorite}
              >
                {favoriteReports.some((r) => r.reportId === report.id) ? '❤️ 已收藏' : '🤍 收藏'}
              </button>
              <button className="btn-share" onClick={shareReport}>
                📤 分享
              </button>
              <button className="btn-export" onClick={exportPDF}>
                📄 导出PDF
              </button>
            </div>
          </div>

          {/* 特级专家解读 */}
          {report.seniorExpertReview && (
            <div className="senior-expert-section">
              <div className="section-header">
                <span className="section-icon">⭐</span>
                <h3>战略顾问深度解读</h3>
                <span className="expert-name">{report.seniorExpertReview.expert.name}</span>
              </div>
              <div className="expert-card senior">
                <div className="expert-avatar-large">
                  {report.seniorExpertReview.expert.name.charAt(0)}
                </div>
                <div className="review-content">
                  <p className="opinion">{report.seniorExpertReview.opinion}</p>
                  <div className="focus-areas">
                    {report.seniorExpertReview.focusAreas.map((area, idx) => (
                      <span key={idx} className="focus-tag">
                        {area}
                      </span>
                    ))}
                  </div>
                  <div className="suggestions">
                    <h4>💡 建议</h4>
                    <ul>
                      {report.seniorExpertReview.suggestions.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 领域专家解读 */}
          <div className="domain-experts-section">
            <div className="section-header">
              <span className="section-icon">👔</span>
              <h3>领域专家联合分析</h3>
            </div>
            <div className="domain-experts-grid">
              {report.domainExpertReviews.map((review) => (
                <div key={review.expert.id} className="expert-card domain">
                  <div className="expert-header">
                    <div className="expert-avatar">
                      {review.expert.name.charAt(0)}
                    </div>
                    <div className="expert-info">
                      <span className="name">{review.expert.name}</span>
                      <span className="title">{review.expert.profile.title}</span>
                    </div>
                    <div className="workload-badge">
                      {getExpertWorkload(review.expert.id).availability === 'available' ? (
                        <span className="available">● 空闲</span>
                      ) : (
                        <span className="busy">● 忙碌</span>
                      )}
                    </div>
                  </div>
                  <p className="opinion">{review.opinion}</p>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${review.confidence * 100}%` }}
                    />
                    <span>置信度 {(review.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 综合洞察 */}
          <div className="synthesis-section">
            <div className="section-header">
              <span className="section-icon">🎯</span>
              <h3>AI综合洞察</h3>
            </div>
            <div className="synthesis-grid">
              <div className="synthesis-card insights">
                <h4>🔍 核心洞察</h4>
                <ul>
                  {report.synthesis.keyInsights.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="synthesis-card risks">
                <h4>⚠️ 风险提示</h4>
                <ul>
                  {report.synthesis.riskWarnings.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="synthesis-card opportunities">
                <h4>💎 机会识别</h4>
                <ul>
                  {report.synthesis.opportunities.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="synthesis-card recommendations">
                <h4>📋 行动建议</h4>
                <ul>
                  {report.synthesis.recommendations.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 相关素材推荐 */}
          <div className="related-assets-section">
            <div className="section-header">
              <span className="section-icon">📚</span>
              <h3>相关素材推荐</h3>
            </div>
            <div className="related-assets-list">
              <div className="asset-item">
                <span className="asset-type">研报</span>
                <span className="asset-title">{selectedTopic.category}行业深度报告2024</span>
                <button className="btn-view" onClick={() => navigate('/assets')}>
                  查看 →
                </button>
              </div>
              <div className="asset-item">
                <span className="asset-type">数据</span>
                <span className="asset-title">{selectedTopic.category}市场数据季度更新</span>
                <button className="btn-view" onClick={() => navigate('/assets')}>
                  查看 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
