// 专家库 v5.2 - Expert Library with Tab Navigation
// 整合专家库列表、对比、网络、知识图谱

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAllExperts, getExpertFeedbackStats, getExpertWorkload, getExpertReviewHistory, type ExpertReviewHistory } from '../services/expertService';
import type { Expert } from '../types';
import './ExpertLibrary.css';

const DOMAINS = [
  { code: 'S', name: '特级专家', color: '#f59e0b', icon: '⭐' },
  { code: 'E01', name: '宏观经济', color: '#6366f1', icon: '📊' },
  { code: 'E02', name: '金融科技', color: '#8b5cf6', icon: '💰' },
  { code: 'E03', name: '新能源', color: '#22c55e', icon: '⚡' },
  { code: 'E04', name: '医疗健康', color: '#ef4444', icon: '🏥' },
  { code: 'E05', name: '消费零售', color: '#ec4899', icon: '🛍️' },
  { code: 'E06', name: '半导体', color: '#14b8a6', icon: '🔷' },
  { code: 'E07', name: '人工智能', color: '#3b82f6', icon: '🤖' },
  { code: 'E08', name: '房地产', color: '#f97316', icon: '🏢' },
  { code: 'E09', name: '文化传媒', color: '#a855f7', icon: '🎬' },
  { code: 'E10', name: '先进制造', color: '#64748b', icon: '🏭' },
  { code: 'E11', name: 'ESG可持续', color: '#10b981', icon: '🌱' },
  { code: 'E12', name: '跨境出海', color: '#0ea5e9', icon: '🚢' },
];

const TABS = [
  { id: 'list', label: '👥 专家列表', path: '/expert-library', description: '浏览专家的详细信息' },
  { id: 'chat', label: '💬 专家对话', path: '/expert-chat', description: '与专家一对一深度对话' },
  { id: 'comparison', label: '⚖️ 专家对比', path: '/expert-comparison', description: '多专家横向对比分析' },
  { id: 'network', label: '🕸️ 协作网络', path: '/expert-network', description: '专家协作关系与网络结构' },
  { id: 'scheduling', label: '📋 专家调度', path: '/expert-scheduling', description: '工作量管理与任务分配' },
  { id: 'debate', label: '🔥 专家辩论', path: '/expert-debate', description: '多专家协作辩论与对比分析' },
  { id: 'knowledge', label: '🧠 知识图谱', path: '/expert-knowledge-graph', description: '探索专家知识体系与概念关联' },
];

// Tab navigation component used across expert library pages
export function ExpertTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="expert-tabs">
      <div className="tabs-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${currentPath === tab.path ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
            title={tab.description}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExpertLibrary() {
  const navigate = useNavigate();
  const [experts, setExperts] = useState<Expert[]>([]);
  const [filteredExperts, setFilteredExperts] = useState<Expert[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
  const [selectedExpertIds, setSelectedExpertIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedExpertStats, setSelectedExpertStats] = useState<{
    totalReviews: number;
    acceptedCount: number;
    rejectedCount: number;
    ignoredCount: number;
    acceptanceRate: number;
  } | null>(null);
  const [selectedExpertWorkload, setSelectedExpertWorkload] = useState<{
    pendingReviews: number;
    availability: 'available' | 'busy' | 'unavailable';
  } | null>(null);
  const [selectedExpertHistory, setSelectedExpertHistory] = useState<ExpertReviewHistory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  // CDT (认知数字孪生) 扩展档案 — 从新 expert-library API 加载
  const [cdtProfile, setCdtProfile] = useState<any>(null);

  const loadExpertStats = (expert: Expert) => {
    const stats = getExpertFeedbackStats(expert.id);
    setSelectedExpertStats(stats);
    const workload = getExpertWorkload(expert.id);
    setSelectedExpertWorkload({
      pendingReviews: workload.pendingReviews,
      availability: workload.availability,
    });
    const history = getExpertReviewHistory(expert.id, { limit: 5 });
    setSelectedExpertHistory(history);
    // 尝试加载 CDT 档案（新专家库 API）
    setCdtProfile(null);
    fetch(`/api/v1/expert-library/experts/${expert.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setCdtProfile(data))
      .catch(() => setCdtProfile(null));
  };

  useEffect(() => {
    const allExperts = getAllExperts();
    setExperts(allExperts);
    setFilteredExperts(allExperts);
    setLoading(false);
  }, []);

  useEffect(() => {
    let result = experts;
    if (selectedDomain !== 'all') {
      result = result.filter((e) => e.domainCode === selectedDomain);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.profile.title.toLowerCase().includes(query) ||
          e.domainName.toLowerCase().includes(query) ||
          e.philosophy.core.some((p) => p.toLowerCase().includes(query))
      );
    }
    setFilteredExperts(result);
  }, [experts, selectedDomain, searchQuery]);

  const stats = {
    total: experts.length,
    senior: experts.filter((e) => e.level === 'senior').length,
    domain: experts.filter((e) => e.level === 'domain').length,
    active: experts.filter((e) => e.status === 'active').length,
  };

  const getExpertLevelLabel = (level: string) => {
    return level === 'senior' ? '特级专家' : '领域专家';
  };

  const getExpertLevelColor = (level: string) => {
    return level === 'senior' ? '#f59e0b' : '#6366f1';
  };

  const getDomainByCode = (code: string) => {
    return DOMAINS.find((d) => d.code === code) || DOMAINS[0];
  };

  const getAngleLabel = (angle: string) => {
    const labels: Record<string, string> = {
      challenger: '挑战者',
      expander: '拓展者',
      synthesizer: '整合者',
    };
    return labels[angle] || angle;
  };

  const getAngleColor = (angle: string) => {
    const colors: Record<string, string> = {
      challenger: '#ef4444',
      expander: '#22c55e',
      synthesizer: '#6366f1',
    };
    return colors[angle] || '#6b7280';
  };

  // 切换专家选择
  const toggleExpertSelection = (expertId: string) => {
    setSelectedExpertIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(expertId)) {
        newSet.delete(expertId);
      } else {
        newSet.add(expertId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedExpertIds.size === filteredExperts.length) {
      setSelectedExpertIds(new Set());
    } else {
      setSelectedExpertIds(new Set(filteredExperts.map(e => e.id)));
    }
  };

  // 清空选择
  const clearSelection = () => {
    setSelectedExpertIds(new Set());
  };

  if (loading) {
    return (
      <div className="expert-library-page loading">
        <div className="loading-spinner"></div>
        <p>加载专家库...</p>
      </div>
    );
  }

  return (
    <div className="expert-library-page">
      <ExpertTabs />
      {/* 页面标题 */}
      <div className="page-header">
        <div className="header-title">
          <h1>专家库 v5.2</h1>
          <span className="version-badge">{stats.total}位专家</span>
        </div>
        <p className="header-desc">基于真实商业领袖和领域专家构建的智能评审体系</p>
      </div>

      {/* 统计栏 */}
      <div className="stats-bar">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">专家总数</span>
        </div>
        <div className="stat-card senior">
          <span className="stat-value">{stats.senior}</span>
          <span className="stat-label">特级专家</span>
        </div>
        <div className="stat-card domain">
          <span className="stat-value">{stats.domain}</span>
          <span className="stat-label">领域专家</span>
        </div>
        <div className="stat-card domains">
          <span className="stat-value">12</span>
          <span className="stat-label">覆盖领域</span>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="filter-section">
        <div className="domain-filters" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className={`domain-btn ${selectedDomain === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedDomain('all')}
          >
            全部
          </button>
          {DOMAINS.map((domain) => (
            <button
              key={domain.code}
              className={`domain-btn ${selectedDomain === domain.code ? 'active' : ''}`}
              onClick={() => setSelectedDomain(domain.code)}
              style={{
                borderColor: selectedDomain === domain.code ? domain.color : undefined,
                background: selectedDomain === domain.code ? `${domain.color}20` : undefined,
              }}
            >
              <span>{domain.icon}</span>
              <span>{domain.name}</span>
            </button>
          ))}
        </div>
        <div className="search-box" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="text"
            placeholder="搜索专家姓名、职位、核心思想..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className={`domain-btn ${selectMode ? 'active' : ''}`}
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) clearSelection();
            }}
            style={{ 
              background: selectMode ? '#3b82f6' : '#f3f4f6',
              color: selectMode ? 'white' : '#374151'
            }}
          >
            {selectMode ? '退出选择' : '选择模式'}
          </button>
        </div>
      </div>

      {/* 选择操作栏 */}
      {selectMode && (
        <div className="selection-bar" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#f0f9ff',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="domain-btn"
              onClick={toggleSelectAll}
              style={{ fontSize: '14px' }}
            >
              {selectedExpertIds.size === filteredExperts.length ? '取消全选' : '全选'}
            </button>
            <button
              className="domain-btn"
              onClick={clearSelection}
              style={{ fontSize: '14px' }}
            >
              清空
            </button>
          </div>
          <span style={{ fontSize: '14px', color: '#0369a1', fontWeight: 500 }}>
            已选择 {selectedExpertIds.size} 位专家
          </span>
        </div>
      )}

      {/* 专家列表 */}
      {filteredExperts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">未找到匹配的专家</div>
          <p>请尝试其他搜索条件</p>
        </div>
      ) : (
        <div className="experts-grid">
          {filteredExperts.map((expert) => {
            const domain = getDomainByCode(expert.domainCode);
            return (
              <div
                key={expert.id}
                className={`expert-card ${expert.level}`}
                onClick={() => {
                  if (selectMode) {
                    toggleExpertSelection(expert.id);
                  } else {
                    setSelectedExpert(expert);
                    loadExpertStats(expert);
                  }
                }}
                style={{ position: 'relative' }}
              >
                {/* 选择复选框 */}
                {selectMode && (
                  <div 
                    style={{ 
                      position: 'absolute', 
                      top: '12px', 
                      right: '12px',
                      zIndex: 10
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpertSelection(expert.id);
                    }}
                  >
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '4px',
                      border: '2px solid',
                      borderColor: selectedExpertIds.has(expert.id) ? '#3b82f6' : '#d1d5db',
                      background: selectedExpertIds.has(expert.id) ? '#3b82f6' : 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}>
                      {selectedExpertIds.has(expert.id) && (
                        <span style={{ color: 'white', fontSize: '16px' }}>✓</span>
                      )}
                    </div>
                  </div>
                )}
                {/* 左侧头像 */}
                <div
                  className="expert-avatar"
                  style={{
                    background:
                      expert.level === 'senior'
                        ? 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
                        : `linear-gradient(135deg, ${domain.color} 0%, ${domain.color}dd 100%)`,
                  }}
                >
                  {expert.name.charAt(0)}
                </div>

                {/* 中间内容 */}
                <div className="expert-content">
                  <div className="expert-header">
                    <h3 className="expert-name">{expert.name}</h3>
                    <span className="expert-title">{expert.profile.title}</span>
                  </div>
                  
                  <div className="expert-tags">
                    <span className="tag level">{getExpertLevelLabel(expert.level)}</span>
                    <span className="tag domain">{domain.icon} {expert.domainName}</span>
                    {expert.angle && (
                      <span className="tag angle">{getAngleLabel(expert.angle)}</span>
                    )}
                  </div>

                  <p className="expert-desc">{expert.profile.personality}</p>

                  <div className="expert-core">
                    {expert.philosophy.core.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="core-tag">{tag}</span>
                    ))}
                  </div>
                </div>

                {/* 右侧指标 */}
                <div className="expert-metrics">
                  <div className="metric">
                    <span className="metric-value">{(expert.acceptanceRate * 100).toFixed(0)}%</span>
                    <span className="metric-label">采纳率</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{expert.totalReviews}</span>
                    <span className="metric-label">评审次数</span>
                  </div>
                </div>

                {/* 调试按钮 — 始终可见 */}
                {!selectMode && (
                  <button
                    className="expert-tune-btn"
                    title="调试专家"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/expert-admin/${expert.id}`);
                    }}
                  >
                    ⚙
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 专家详情弹窗 */}
      {selectedExpert && (
        <div className="modal-overlay" onClick={() => setSelectedExpert(null)}>
          <div className="expert-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-avatar">
                {selectedExpert.name.charAt(0)}
              </div>
              <div className="header-info">
                <h2>{selectedExpert.name}</h2>
                <p>{selectedExpert.profile.title}</p>
                <div className="header-badges">
                  <span className={`level-badge ${selectedExpert.level}`}>
                    {getExpertLevelLabel(selectedExpert.level)}
                  </span>
                  {selectedExpert.angle && (
                    <span className="angle-badge" style={{ background: `${getAngleColor(selectedExpert.angle)}20`, color: getAngleColor(selectedExpert.angle) }}>
                      {getAngleLabel(selectedExpert.angle)}
                    </span>
                  )}
                  <span className="domain-badge">
                    {getDomainByCode(selectedExpert.domainCode).icon} {selectedExpert.domainName}
                  </span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setSelectedExpert(null)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <section className="detail-section">
                <h4>🎯 人设背景</h4>
                <p className="background-text">{selectedExpert.profile.background}</p>
                <p className="personality-text">
                  <strong>性格特点：</strong>
                  {selectedExpert.profile.personality}
                </p>
              </section>

              <section className="detail-section">
                <h4>💡 核心思想</h4>
                <div className="philosophy-core">
                  {selectedExpert.philosophy.core.map((item, idx) => (
                    <span key={idx} className="core-tag">
                      {item}
                    </span>
                  ))}
                </div>
                {selectedExpert.philosophy.quotes.length > 0 && (
                  <blockquote className="expert-quote">
                    "{selectedExpert.philosophy.quotes[0]}"
                  </blockquote>
                )}
              </section>

              {selectedExpert.achievements.length > 0 && (
                <section className="detail-section">
                  <h4>🏆 成功实践</h4>
                  <div className="achievements-list">
                    {selectedExpert.achievements.map((achievement, idx) => (
                      <div key={idx} className="achievement-item">
                        <div className="achievement-title">{achievement.title}</div>
                        <div className="achievement-desc">{achievement.description}</div>
                        <div className="achievement-meta">
                          <span>{achievement.date}</span>
                          <span>•</span>
                          <span>{achievement.impact}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="detail-section">
                <h4>📋 评审维度</h4>
                <div className="review-dimensions">
                  {selectedExpert.reviewDimensions.map((dim, idx) => (
                    <span key={idx} className="dimension-tag">
                      {dim}
                    </span>
                  ))}
                </div>
              </section>

              {/* CDT 扩展档案 — 仅对已建模专家显示 */}
              {cdtProfile && (
                <>
                  {cdtProfile.persona?.cognition && (
                    <section className="detail-section cdt-section">
                      <h4>🧠 认知模型</h4>
                      <div className="cdt-grid">
                        {cdtProfile.persona.cognition.mentalModel && (
                          <div className="cdt-item">
                            <span className="cdt-label">思维框架</span>
                            <span className="cdt-value">{cdtProfile.persona.cognition.mentalModel}</span>
                          </div>
                        )}
                        {cdtProfile.persona.cognition.decisionStyle && (
                          <div className="cdt-item">
                            <span className="cdt-label">决策风格</span>
                            <span className="cdt-value">{cdtProfile.persona.cognition.decisionStyle}</span>
                          </div>
                        )}
                        {cdtProfile.persona.cognition.riskAttitude && (
                          <div className="cdt-item">
                            <span className="cdt-label">风险偏好</span>
                            <span className="cdt-value">{cdtProfile.persona.cognition.riskAttitude}</span>
                          </div>
                        )}
                        {cdtProfile.persona.cognition.timeHorizon && (
                          <div className="cdt-item">
                            <span className="cdt-label">时间视角</span>
                            <span className="cdt-value">{cdtProfile.persona.cognition.timeHorizon}</span>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {cdtProfile.persona?.values && (
                    <section className="detail-section cdt-section">
                      <h4>⚡ 品味与价值观</h4>
                      {cdtProfile.persona.values.excites?.length > 0 && (
                        <div className="cdt-tag-group">
                          <span className="cdt-tag-label positive">兴奋点</span>
                          <div className="cdt-tags">
                            {cdtProfile.persona.values.excites.map((v: string, i: number) => (
                              <span key={i} className="cdt-tag positive">{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {cdtProfile.persona.values.dealbreakers?.length > 0 && (
                        <div className="cdt-tag-group">
                          <span className="cdt-tag-label negative">一票否决</span>
                          <div className="cdt-tags">
                            {cdtProfile.persona.values.dealbreakers.map((v: string, i: number) => (
                              <span key={i} className="cdt-tag negative">{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {cdtProfile.persona.values.qualityBar && (
                        <div className="cdt-quality-bar">
                          <span className="cdt-label">质量标准</span>
                          <p>{cdtProfile.persona.values.qualityBar}</p>
                        </div>
                      )}
                    </section>
                  )}

                  {cdtProfile.method?.analysis_steps?.length > 0 && (
                    <section className="detail-section cdt-section">
                      <h4>🔬 分析方法论</h4>
                      <div className="cdt-frameworks">
                        {cdtProfile.method.frameworks?.map((f: string, i: number) => (
                          <span key={i} className="cdt-framework">{f}</span>
                        ))}
                      </div>
                      <ol className="cdt-steps">
                        {cdtProfile.method.analysis_steps.map((step: string, i: number) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {cdtProfile.emm?.veto_rules?.length > 0 && (
                    <section className="detail-section cdt-section">
                      <h4>🚫 EMM 门控规则</h4>
                      <div className="cdt-factors">
                        {cdtProfile.emm.critical_factors?.map((f: string) => {
                          const weight = cdtProfile.emm.factor_hierarchy?.[f];
                          return (
                            <div key={f} className="cdt-factor-item">
                              <span className="factor-name">{f}</span>
                              {weight && (
                                <div className="factor-bar-wrap">
                                  <div className="factor-bar" style={{ width: `${weight * 100}%` }} />
                                  <span className="factor-weight">{(weight * 100).toFixed(0)}%</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="cdt-veto-rules">
                        {cdtProfile.emm.veto_rules.map((rule: string, i: number) => (
                          <div key={i} className="veto-rule">⛔ {rule}</div>
                        ))}
                      </div>
                    </section>
                  )}

                  {cdtProfile.signature_phrases?.length > 0 && (
                    <section className="detail-section cdt-section">
                      <h4>💬 标志性表达</h4>
                      <div className="cdt-phrases">
                        {cdtProfile.signature_phrases.map((phrase: string, i: number) => (
                          <blockquote key={i} className="cdt-phrase">"{phrase}"</blockquote>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              <section className="detail-section stats-section">
                <h4>📊 统计数据</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{selectedExpert.totalReviews}</span>
                    <span className="stat-label">总评审数</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{(selectedExpert.acceptanceRate * 100).toFixed(0)}%</span>
                    <span className="stat-label">采纳率</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{selectedExpert.avgResponseTime}min</span>
                    <span className="stat-label">平均响应</span>
                  </div>
                </div>

                {selectedExpertStats && selectedExpertStats.totalReviews > 0 && (
                  <div className="feedback-stats">
                    <h5>用户反馈详情</h5>
                    <div className="feedback-grid">
                      <div className="feedback-item accepted">
                        <span className="feedback-value">{selectedExpertStats.acceptedCount}</span>
                        <span className="feedback-label">已接受</span>
                      </div>
                      <div className="feedback-item rejected">
                        <span className="feedback-value">{selectedExpertStats.rejectedCount}</span>
                        <span className="feedback-label">已拒绝</span>
                      </div>
                      <div className="feedback-item ignored">
                        <span className="feedback-value">{selectedExpertStats.ignoredCount}</span>
                        <span className="feedback-label">已忽略</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedExpertWorkload && (
                  <div className="workload-status">
                    <h5>当前状态</h5>
                    <div className={`availability-badge ${selectedExpertWorkload.availability}`}>
                      <span className="status-dot"></span>
                      <span className="status-text">
                        {selectedExpertWorkload.availability === 'available'
                          ? '空闲'
                          : selectedExpertWorkload.availability === 'busy'
                            ? '忙碌'
                            : '满载'}
                      </span>
                      <span className="pending-count">
                        (待评审: {selectedExpertWorkload.pendingReviews})
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {selectedExpertHistory.length > 0 && (
                <section className="detail-section history-section">
                  <h4>📜 历史评审记录</h4>
                  <div className="review-timeline">
                    {selectedExpertHistory.map((record, idx) => (
                      <div key={record.id} className={`timeline-item ${record.action}`}>
                        <div className="timeline-marker"></div>
                        <div className="timeline-content">
                          <div className="timeline-header">
                            <span className="task-title">{record.taskTitle}</span>
                            <span className={`action-badge ${record.action}`}>
                              {record.action === 'accepted' ? '✓ 采纳' : record.action === 'rejected' ? '✗ 拒绝' : '○ 忽略'}
                            </span>
                          </div>
                          <p className="review-content">{record.content}</p>
                          {record.feedback && (
                            <span className="feedback-text">反馈: {record.feedback}</span>
                          )}
                          <span className="review-time">{new Date(record.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedExpert(null)}>
                关闭
              </button>
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/expert-admin/${selectedExpert.id}`)}
              >
                ⚙ 调试专家
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
