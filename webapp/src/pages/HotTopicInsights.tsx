// 热点话题专家解读 - Hot Topic Expert Insights
// Phase 3: 基于真实 RSS 数据自动生成热点话题的完整专家解读报告

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { hotTopicsApi, expertLibraryApi } from '../api/client';
import {
  matchExperts,
  generateExpertOpinion,
  getExpertWorkload,
} from '../services/expertService';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type FavoriteReport,
} from '../services/favoritesService';
import type { Expert, ExpertReview, HotTopic } from '../types';
import './HotTopicInsights.css';

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
          focusAreas: report.seniorExpertReview.focusAreas || [],
          suggestions: report.seniorExpertReview.suggestions || [],
          confidence: report.seniorExpertReview.confidence,
          timestamp: report.seniorExpertReview.createdAt || new Date().toISOString(),
        }
      : undefined,
    domainExpertReviews: (report.domainExpertReviews || []).map((r) => ({
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
  
  // 从 RSS 获取的热点话题
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<HotTopic | null>(null);
  const [report, setReport] = useState<ExpertInsightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [savedReports, setSavedReports] = useState<string[]>([]);
  // 报告缓存
  const [reportCache, setReportCache] = useState<Record<string, ExpertInsightReport>>({});
  // 收藏的报告
  const [favoriteReports, setFavoriteReports] = useState<FavoriteReport[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  // CDT 专家观点 (基于认知数字孪生)
  const [cdtPerspectives, setCdtPerspectives] = useState<any>(null);
  const [cdtLoading, setCdtLoading] = useState(false);

  const loadCdtPerspectives = async (topic: HotTopic) => {
    setCdtLoading(true);
    try {
      // 先尝试获取缓存
      let result = await expertLibraryApi.getHotTopicPerspectives(topic.id).catch(() => null);
      if (!result) {
        // 未缓存，实时生成
        result = await expertLibraryApi.generateHotTopicPerspectives(topic.id, topic.title);
      }
      setCdtPerspectives(result);
    } catch {
      setCdtPerspectives(null);
    } finally {
      setCdtLoading(false);
    }
  };

  // 加载热点话题（从 RSS 数据）
  const loadHotTopics = async () => {
    setTopicsLoading(true);
    try {
      const response = await hotTopicsApi.getFromRss(10);
      const topics = response.items || [];
      
      // 为每个话题添加 category 字段（从 source 派生）
      const topicsWithCategory = topics.map(t => ({
        ...t,
        category: inferCategory(t.source),
        summary: (t as any).summary || '',
        keywords: (t as any).tags || [],
        heat: Math.round((t.hotScore || 0) * 100),
      }));
      
      setHotTopics(topicsWithCategory);
      
      // 如果有 topicId，选择对应的话题；否则选择第一个
      if (topicId) {
        const found = topicsWithCategory.find((t) => t.id === topicId);
        if (found) {
          setSelectedTopic(found);
        } else if (topicsWithCategory.length > 0) {
          setSelectedTopic(topicsWithCategory[0]);
        }
      } else if (topicsWithCategory.length > 0) {
        setSelectedTopic(topicsWithCategory[0]);
      }
    } catch (error) {
      console.error('Failed to load hot topics from RSS:', error);
    } finally {
      setTopicsLoading(false);
    }
  };

  // 根据 source 推断分类
  const inferCategory = (source: string): string => {
    const categoryMap: Record<string, string> = {
      '36kr': '科技',
      '机器之心': 'AI',
      '虎嗅': '商业',
      '雷锋网': '科技',
      '极客公园': '科技',
      'Solidot': '开源',
      'InfoQ中文': '技术',
      'Nature News': '科学',
      'TechCrunch': '创业',
      'The Verge': '科技',
      'MIT Technology Review': '科技',
      'Ars Technica': '科技',
      '财新': '财经',
      '第一财经': '财经',
      '华尔街见闻': '财经',
      '雪球': '投资',
    };
    return categoryMap[source] || '综合';
  };

  // 切换话题时优先使用缓存
  const handleTopicChange = (topic: HotTopic) => {
    setSelectedTopic(topic);
    setCdtPerspectives(null);
    loadCdtPerspectives(topic);
    if (reportCache[topic.id]) {
      setReport(reportCache[topic.id]);
    } else {
      generateReport(topic);
    }
  };

  // 生成解读报告
  const generateReport = async (topic: HotTopic) => {
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
        (topic as any).summary || topic.title,
        'draft'
      );
      seniorExpertReview = { ...review, expert: matchResult.seniorExpert };
    }

    // 生成领域专家解读
    const domainExpertReviews = matchResult.domainExperts.slice(0, 3).map((expert) => {
      const review = generateExpertOpinion(expert, (topic as any).summary || topic.title, 'draft');
      return { ...review, expert };
    });

    // 基于话题分类生成相关的综合洞察
    const category = (topic as any).category || '综合';
    const synthesis = generateSynthesis(category, topic.title);

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

  // 根据分类生成相关的综合洞察
  const generateSynthesis = (category: string, title: string) => {
    const categoryInsights: Record<string, any> = {
      '科技': {
        keyInsights: [
          '技术创新持续加速，头部企业竞争优势明显',
          '产业链协同效应增强，生态整合成为关键',
          'AI技术渗透加速，智能化转型势不可挡',
        ],
        riskWarnings: [
          '技术迭代风险需要持续关注',
          '竞争加剧可能导致利润空间压缩',
          '数据安全和隐私合规压力增大',
        ],
        opportunities: [
          '下沉市场仍有较大增长空间',
          'B端企业服务市场潜力巨大',
          '出海战略打开第二增长曲线',
        ],
        recommendations: [
          '加大研发投入，构建技术护城河',
          '关注政策动向，及时调整合规策略',
          '优化人才结构，吸引顶尖技术人才',
        ],
      },
      'AI': {
        keyInsights: [
          '大模型技术突破带来应用场景爆发',
          '算力成本下降推动AI民主化进程',
          '多模态融合成为新的技术趋势',
        ],
        riskWarnings: [
          'AI伦理和监管政策不确定性',
          '模型幻觉和可靠性问题待解决',
          '人才竞争激烈，成本持续上升',
        ],
        opportunities: [
          '垂直行业AI应用空间广阔',
          'AI Agent开启新的交互范式',
          '边缘AI和端侧部署需求增长',
        ],
        recommendations: [
          '聚焦垂直场景，打造差异化优势',
          '建立数据飞轮，持续优化模型',
          '重视AI安全，建立可信体系',
        ],
      },
      '财经': {
        keyInsights: [
          '宏观经济政策持续发力，市场信心逐步恢复',
          '结构性机会凸显，优质资产受到追捧',
          '跨境资本流动活跃，国际化进程加速',
        ],
        riskWarnings: [
          '全球经济不确定性因素增多',
          '地缘政治风险影响市场情绪',
          '通胀压力和利率变动带来波动',
        ],
        opportunities: [
          '新兴产业投资价值凸显',
          'ESG投资理念深入人心',
          '数字金融创新发展迅猛',
        ],
        recommendations: [
          '保持理性投资，做好风险管理',
          '关注长期价值，避免短期投机',
          '分散投资组合，降低单一风险',
        ],
      },
      '默认': {
        keyInsights: [
          `${category}领域正处于关键发展阶段，机遇与挑战并存`,
          '市场需求持续增长，行业前景广阔',
          '政策支持与技术创新双轮驱动',
        ],
        riskWarnings: [
          '政策变化可能带来不确定性',
          '竞争加剧导致行业洗牌',
          '技术迭代风险需要持续关注',
        ],
        opportunities: [
          '下沉市场仍有较大增长空间',
          '出海战略打开第二增长曲线',
          '数字化转型带来效率提升机会',
        ],
        recommendations: [
          '持续关注政策动向，及时调整策略',
          '加大创新投入，构建核心竞争力',
          '优化成本结构，提升抗风险能力',
        ],
      },
    };

    return categoryInsights[category] || categoryInsights['默认'];
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
    if (report && selectedTopic) {
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
    const topic = hotTopics.find((t) => t.id === favReport.topicId);
    if (topic) {
      setSelectedTopic(topic);
      // 从收藏数据恢复报告
      const restoredReport: ExpertInsightReport = {
        id: favReport.reportData.id,
        topicId: favReport.reportData.topicId,
        topicTitle: favReport.reportData.topicTitle,
        generatedAt: favReport.reportData.generatedAt,
        synthesis: {
          keyInsights: favReport.reportData.synthesis?.keyInsights || [],
          riskWarnings: favReport.reportData.synthesis?.riskWarnings || [],
          opportunities: favReport.reportData.synthesis?.opportunities || [],
          recommendations: favReport.reportData.synthesis?.recommendations || [],
        },
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
      setFavoriteReports(Array.isArray(favorites) ? favorites : []);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setIsLoadingFavorites(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadHotTopics();
    loadFavorites();
  }, []);

  // 当选中话题变化时，生成报告
  useEffect(() => {
    if (selectedTopic && !reportCache[selectedTopic.id]) {
      generateReport(selectedTopic);
    } else if (selectedTopic && reportCache[selectedTopic.id]) {
      setReport(reportCache[selectedTopic.id]);
    }
  }, [selectedTopic?.id]);

  return (
    <div className="hot-topic-insights-page">
      {/* 页面头部 */}
      <div className="page-header">
        <h1>🔥 热点话题专家解读</h1>
        <p className="subtitle">基于真实 RSS 数据的 AI 驱动多专家联合深度分析</p>
      </div>

      {/* 话题选择器 */}
      <div className="topic-selector">
        <div className="selector-header">
          <h3>热点话题（来自 RSS 实时数据）</h3>
          <div className="header-actions">
            <button
              className="btn-refresh"
              onClick={loadHotTopics}
              disabled={topicsLoading}
            >
              {topicsLoading ? '⏳ 刷新中...' : '🔄 刷新'}
            </button>
            <button
              className={`btn-favorites-toggle ${showFavorites ? 'active' : ''}`}
              onClick={() => setShowFavorites(!showFavorites)}
            >
              ❤️ 我的收藏 ({favoriteReports.length})
            </button>
          </div>
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
        ) : topicsLoading ? (
          <div className="loading-topics">
            <div className="loading-spinner"></div>
            <p>正在加载热点话题...</p>
          </div>
        ) : hotTopics.length === 0 ? (
          <div className="empty-topics">
            <p>暂无热点话题</p>
            <span>请检查 RSS 采集是否正常运行</span>
          </div>
        ) : (
          <div className="topic-list">
            {hotTopics.map((topic) => (
              <button
                key={topic.id}
                className={`topic-btn ${selectedTopic?.id === topic.id ? 'active' : ''}`}
                onClick={() => handleTopicChange(topic)}
                disabled={loading}
              >
                <span className="topic-heat">🔥 {topic.hotScore}</span>
                <span className="topic-title">{topic.title}</span>
                <span className="topic-category">{(topic as any).category}</span>
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
      {!loading && report && selectedTopic && (
        <div className="insight-report">
          {/* 报告头部 */}
          <div className="report-header">
            <div className="report-title">
              <h2>{report.topicTitle}</h2>
              <span className="report-source">来源: {(selectedTopic as any).source}</span>
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
                    {(report.seniorExpertReview.focusAreas || []).map((area, idx) => (
                      <span key={idx} className="focus-tag">
                        {area}
                      </span>
                    ))}
                  </div>
                  <div className="suggestions">
                    <h4>💡 建议</h4>
                    <ul>
                      {(report.seniorExpertReview.suggestions || []).map((s, idx) => (
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
              {(report.domainExpertReviews || []).map((review) => (
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
                  {(report.synthesis.keyInsights || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="synthesis-card risks">
                <h4>⚠️ 风险提示</h4>
                <ul>
                  {(report.synthesis.riskWarnings || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="synthesis-card opportunities">
                <h4>💎 机会识别</h4>
                <ul>
                  {(report.synthesis.opportunities || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="synthesis-card recommendations">
                <h4>📋 行动建议</h4>
                <ul>
                  {(report.synthesis.recommendations || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* CDT 专家观点 (认知数字孪生) */}
          <div className="cdt-perspectives-section" style={{ marginBottom: '24px' }}>
            <div className="section-header">
              <span className="section-icon">🧠</span>
              <h3>CDT 专家深度解读</h3>
            </div>
            {cdtLoading ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>CDT 专家观点生成中...</div>
            ) : cdtPerspectives?.perspectives?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cdtPerspectives.perspectives.map((p: any) => (
                  <div key={p.expertId} style={{ padding: '16px', background: 'var(--surface-container-low, #f5f5f5)', borderRadius: '12px', border: '1px solid var(--outline-variant, #e0e0e0)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary, #6750a4)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                        {p.expertName?.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{p.expertName}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>{p.domain?.slice(0, 2).join(' / ')}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 8px', background: 'var(--primary, #6750a4)', color: 'white', borderRadius: '10px' }}>
                        置信度 {(p.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, margin: '0 0 8px 0' }}>{p.opinion}</p>
                    {p.keyInsights?.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#555' }}>
                        {p.keyInsights.map((insight: string, i: number) => (
                          <li key={i}>{insight}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                暂无 CDT 专家观点
              </div>
            )}
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
                <span className="asset-title">{(selectedTopic as any).category}行业深度报告2024</span>
                <button className="btn-view" onClick={() => navigate('/assets')}>
                  查看 →
                </button>
              </div>
              <div className="asset-item">
                <span className="asset-type">数据</span>
                <span className="asset-title">{(selectedTopic as any).category}市场数据季度更新</span>
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
