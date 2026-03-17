// 专家库 v5.1 - Expert Library
// 展示75位专家（10位特级+65位领域专家）

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllExperts, getExpertsByDomain, getSeniorExperts, getExpertFeedbackStats, getExpertWorkload, getExpertReviewHistory, type ExpertReviewHistory } from '../services/expertService';
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

export function ExpertLibrary() {
  const navigate = useNavigate();
  const [experts, setExperts] = useState<Expert[]>([]);
  const [filteredExperts, setFilteredExperts] = useState<Expert[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
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

  // 加载专家反馈统计和历史记录
  const loadExpertStats = (expert: Expert) => {
    const stats = getExpertFeedbackStats(expert.id);
    setSelectedExpertStats(stats);
    const workload = getExpertWorkload(expert.id);
    setSelectedExpertWorkload({
      pendingReviews: workload.pendingReviews,
      availability: workload.availability,
    });
    // 加载历史评审记录
    const history = getExpertReviewHistory(expert.id, { limit: 5 });
    setSelectedExpertHistory(history);
  };

  useEffect(() => {
    // 从服务加载专家数据
    const allExperts = getAllExperts();
    setExperts(allExperts);
    setFilteredExperts(allExperts);
    setLoading(false);
  }, []);

  useEffect(() => {
    let result = experts;

    // 按领域筛选
    if (selectedDomain !== 'all') {
      result = result.filter((e) => e.domainCode === selectedDomain);
    }

    // 按搜索词筛选
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
      {/* 页面标题 */}
      <div className="page-header">
        <div className="header-title">
          <h1>专家库 v5.1</h1>
          <span className="version-badge">75位专家</span>
        </div>
        <div className="header-actions">
          <button className="btn-network" onClick={() => navigate('/expert-network')}>
            🕸️ 专家网络
          </button>
          <button className="btn-comparison" onClick={() => navigate('/expert-comparison')}>
            ⚖️ 专家对比
          </button>
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
        <div className="domain-filters">
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
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索专家姓名、职位、核心思想..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

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
                  setSelectedExpert(expert);
                  loadExpertStats(expert);
                }}
              >
                <div className="card-header">
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
                  <div className="expert-badges">
                    <span
                      className="level-badge"
                      style={{
                        background: `${getExpertLevelColor(expert.level)}20`,
                        color: getExpertLevelColor(expert.level),
                      }}
                    >
                      {getExpertLevelLabel(expert.level)}
                    </span>
                    {expert.angle && (
                      <span className="angle-badge" style={{ background: `${getAngleColor(expert.angle)}20`, color: getAngleColor(expert.angle) }}>
                        {getAngleLabel(expert.angle)}
                      </span>
                    )}
                    <span className="domain-badge" style={{ background: `${domain.color}20`, color: domain.color }}>
                      {domain.icon} {expert.domainName}
                    </span>
                  </div>
                </div>

                <div className="expert-info">
                  <h3 className="expert-name">{expert.name}</h3>
                  <p className="expert-title">{expert.profile.title}</p>
                  <p className="expert-personality">{expert.profile.personality}</p>
                </div>

                <div className="expert-philosophy">
                  <div className="philosophy-tags">
                    {expert.philosophy.core.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="philosophy-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="expert-stats">
                  <div className="stat">
                    <span className="stat-label">采纳率</span>
                    <span className="stat-value">{(expert.acceptanceRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">评审次数</span>
                    <span className="stat-value">{expert.totalReviews}</span>
                  </div>
                </div>
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
              {/* 人设背景 */}
              <section className="detail-section">
                <h4>🎯 人设背景</h4>
                <p className="background-text">{selectedExpert.profile.background}</p>
                <p className="personality-text">
                  <strong>性格特点：</strong>
                  {selectedExpert.profile.personality}
                </p>
              </section>

              {/* 核心思想 */}
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

              {/* 成功实践 */}
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

              {/* 评审维度 */}
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

              {/* 统计数据 */}
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

                {/* 反馈统计 */}
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

                {/* 工作量状态 */}
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

              {/* 历史评审记录 */}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
