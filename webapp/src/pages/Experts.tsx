import { useState, useEffect } from 'react';
import { expertsApi, blueTeamApi, tasksApi } from '../api/client';
import type { Expert, BlueTeamReview } from '../types';
import './Experts.css';

type ExpertAngle = 'challenger' | 'expander' | 'synthesizer';

const ANGLE_OPTIONS: { value: ExpertAngle; label: string; color: string }[] = [
  { value: 'challenger', label: '挑战者', color: '#ef4444' },
  { value: 'expander', label: '拓展者', color: '#22c55e' },
  { value: 'synthesizer', label: '整合者', color: '#6366f1' },
];

export function Experts() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAngle, setFilterAngle] = useState<ExpertAngle | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);

  // 表单状态
  const [formData, setFormData] = useState<Partial<Expert>>({
    name: '',
    title: '',
    company: '',
    angle: 'challenger',
    domain: '',
    bio: '',
    status: 'active',
  });

  // 专家活跃度统计
  const [expertStats, setExpertStats] = useState<{
    reviewCount: number;
    acceptedCount: number;
    rejectedCount: number;
    participationRate: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    loadExperts();
  }, []);

  const loadExperts = async () => {
    setLoading(true);
    try {
      const params = filterAngle !== 'all' ? { angle: filterAngle } : undefined;
      const response = await expertsApi.getAll(params);
      setExperts(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 筛选后的专家列表
  const filteredExperts = experts.filter((expert) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      expert.name.toLowerCase().includes(query) ||
      expert.company.toLowerCase().includes(query) ||
      expert.domain.toLowerCase().includes(query) ||
      expert.title.toLowerCase().includes(query)
    );
  });

  // 统计
  const stats = {
    total: experts.length,
    challenger: experts.filter((e) => e.angle === 'challenger').length,
    expander: experts.filter((e) => e.angle === 'expander').length,
    synthesizer: experts.filter((e) => e.angle === 'synthesizer').length,
    active: experts.filter((e) => e.status === 'active').length,
  };

  const getExpertTypeLabel = (type: Expert['angle']) => {
    const labels: Record<string, string> = {
      challenger: '挑战者',
      expander: '拓展者',
      synthesizer: '整合者',
    };
    return labels[type] || type;
  };

  const getExpertTypeColor = (type: Expert['angle']) => {
    const colors: Record<string, string> = {
      challenger: '#ef4444',
      expander: '#22c55e',
      synthesizer: '#6366f1',
    };
    return colors[type] || '#6b7280';
  };

  // 创建专家
  const handleCreate = async () => {
    if (!formData.name?.trim() || !formData.company?.trim()) {
      alert('请填写姓名和机构');
      return;
    }
    try {
      await expertsApi.create(formData);
      setShowCreateModal(false);
      resetForm();
      loadExperts();
    } catch (err) {
      alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 编辑专家
  const handleEdit = async () => {
    if (!selectedExpert) return;
    try {
      await expertsApi.update(selectedExpert.id, formData);
      setShowEditModal(false);
      setSelectedExpert(null);
      resetForm();
      loadExperts();
    } catch (err) {
      alert('更新失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 删除专家
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这位专家吗？')) return;
    try {
      await expertsApi.delete(id);
      loadExperts();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 打开编辑弹窗
  const openEditModal = (expert: Expert, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedExpert(expert);
    setFormData({
      name: expert.name,
      title: expert.title,
      company: expert.company,
      angle: expert.angle,
      domain: expert.domain,
      bio: expert.bio,
      status: expert.status,
    });
    setShowEditModal(true);
  };

  // 打开详情弹窗
  const openDetailModal = async (expert: Expert) => {
    setSelectedExpert(expert);
    setShowDetailModal(true);
    await loadExpertStats(expert.id);
  };

  const loadExpertStats = async (expertId: string) => {
    setStatsLoading(true);
    try {
      // 获取所有任务的评审数据
      const tasksRes = await tasksApi.getAll({ limit: 100 });
      let reviewCount = 0;
      let acceptedCount = 0;
      let rejectedCount = 0;

      // 遍历任务获取评审
      for (const task of tasksRes.items) {
        if (task.status === 'reviewing' || task.status === 'completed') {
          try {
            const reviewsRes = await blueTeamApi.getReviews(task.id);
            const expertReviews = reviewsRes.items.filter(
              (r: BlueTeamReview) => r.expertId === expertId
            );
            reviewCount += expertReviews.length;
            acceptedCount += expertReviews.filter((r: BlueTeamReview) =>
              r.questions?.some((q: any) => q.status === 'accepted')
            ).length;
            rejectedCount += expertReviews.filter((r: BlueTeamReview) =>
              r.questions?.some((q: any) => q.status === 'ignored')
            ).length;
          } catch (e) {
            // 忽略错误
          }
        }
      }

      const participationRate = reviewCount > 0
        ? Math.round((acceptedCount / reviewCount) * 100)
        : 0;

      setExpertStats({
        reviewCount,
        acceptedCount,
        rejectedCount,
        participationRate,
      });
    } catch (error) {
      console.error('加载专家统计失败:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // 重置表单
  const resetForm = () => {
    setFormData({
      name: '',
      title: '',
      company: '',
      angle: 'challenger',
      domain: '',
      bio: '',
      status: 'active',
    });
  };

  // 打开创建弹窗
  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  return (
    <div className="experts-page">
      {/* 页面标题 */}
      <div className="experts-header">
        <h1 className="page-title">专家库</h1>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <span>+</span> 添加专家
        </button>
      </div>

      {/* 统计栏 */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">专家总数</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#ef4444' }}>
            {stats.challenger}
          </span>
          <span className="stat-label">挑战者</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#22c55e' }}>
            {stats.expander}
          </span>
          <span className="stat-label">拓展者</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#6366f1' }}>
            {stats.synthesizer}
          </span>
          <span className="stat-label">整合者</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: '#10b981' }}>
            {stats.active}
          </span>
          <span className="stat-label">活跃中</span>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="filter-bar">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filterAngle === 'all' ? 'active' : ''}`}
            onClick={() => setFilterAngle('all')}
          >
            全部
          </button>
          {ANGLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`filter-btn ${filterAngle === opt.value ? 'active' : ''}`}
              onClick={() => setFilterAngle(opt.value)}
              style={{
                borderColor: filterAngle === opt.value ? opt.color : undefined,
                background: filterAngle === opt.value ? opt.color : undefined,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索专家..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 专家列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : filteredExperts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">
              {searchQuery ? '未找到匹配的专家' : '暂无专家'}
            </div>
            <p>
              {searchQuery
                ? '请尝试其他搜索词'
                : '专家库用于管理行业研究过程中积累的各领域专家资源'}
            </p>
          </div>
        </div>
      ) : (
        <div className="experts-grid">
          {filteredExperts.map((expert) => (
            <div
              key={expert.id}
              className="expert-card"
              onClick={() => openDetailModal(expert)}
            >
              <div
                className="expert-avatar"
                style={{ background: getExpertTypeColor(expert.angle) }}
              >
                {expert.name.charAt(0)}
              </div>
              <div className="expert-info">
                <div className="expert-header">
                  <span className="expert-name">{expert.name}</span>
                  <span
                    className="expert-type"
                    style={{
                      background: `${getExpertTypeColor(expert.angle)}20`,
                      color: getExpertTypeColor(expert.angle),
                    }}
                  >
                    {getExpertTypeLabel(expert.angle)}
                  </span>
                </div>
                <div className="expert-org">
                  {expert.company} · {expert.title}
                </div>
                <div className="expert-domain">{expert.domain}</div>
                {expert.bio && (
                  <div className="expert-bio-preview">
                    {expert.bio.substring(0, 50)}
                    {expert.bio.length > 50 ? '...' : ''}
                  </div>
                )}
                <div className="expert-status">
                  <span className={`status-dot ${expert.status}`} />
                  {expert.status === 'active' ? '活跃' : '停用'}
                </div>
              </div>
              <div className="expert-actions">
                <button
                  className="btn-sm"
                  onClick={(e) => openEditModal(expert, e)}
                >
                  编辑
                </button>
                <button
                  className="btn-sm btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(expert.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建专家弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加专家</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>姓名 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="专家姓名"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>机构 *</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    placeholder="所属机构"
                  />
                </div>
                <div className="form-group">
                  <label>职位</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="职位头衔"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>角色类型</label>
                  <select
                    value={formData.angle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        angle: e.target.value as ExpertAngle,
                      })
                    }
                  >
                    {ANGLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>专业领域</label>
                  <input
                    type="text"
                    value={formData.domain}
                    onChange={(e) =>
                      setFormData({ ...formData, domain: e.target.value })
                    }
                    placeholder="例如：房地产、金融"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>简介</label>
                <textarea
                  rows={4}
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  placeholder="专家背景介绍..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!formData.name?.trim() || !formData.company?.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑专家弹窗 */}
      {showEditModal && selectedExpert && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑专家</h3>
              <button
                className="modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>机构</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>职位</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>角色类型</label>
                  <select
                    value={formData.angle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        angle: e.target.value as ExpertAngle,
                      })
                    }
                  >
                    {ANGLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>专业领域</label>
                  <input
                    type="text"
                    value={formData.domain}
                    onChange={(e) =>
                      setFormData({ ...formData, domain: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>简介</label>
                <textarea
                  rows={4}
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.status === 'active'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.checked ? 'active' : 'inactive',
                      })
                    }
                  />
                  活跃状态
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                取消
              </button>
              <button className="btn btn-primary" onClick={handleEdit}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 专家详情弹窗 */}
      {showDetailModal && selectedExpert && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>专家详情</h3>
              <button
                className="modal-close"
                onClick={() => setShowDetailModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="expert-detail-header">
                <div
                  className="expert-detail-avatar"
                  style={{
                    background: getExpertTypeColor(selectedExpert.angle),
                  }}
                >
                  {selectedExpert.name.charAt(0)}
                </div>
                <div className="expert-detail-info">
                  <h2>{selectedExpert.name}</h2>
                  <span
                    className="expert-detail-type"
                    style={{
                      background: `${getExpertTypeColor(selectedExpert.angle)}20`,
                      color: getExpertTypeColor(selectedExpert.angle),
                    }}
                  >
                    {getExpertTypeLabel(selectedExpert.angle)}
                  </span>
                  <div className="expert-detail-org">
                    {selectedExpert.company} · {selectedExpert.title}
                  </div>
                  <div className="expert-detail-domain">
                    {selectedExpert.domain}
                  </div>
                </div>
              </div>

              {selectedExpert.bio && (
                <div className="expert-detail-section">
                  <h4>简介</h4>
                  <p>{selectedExpert.bio}</p>
                </div>
              )}

              <div className="expert-detail-stats">
                <div className="detail-stat">
                  <span className="label">状态</span>
                  <span className={`value ${selectedExpert.status}`}>
                    {selectedExpert.status === 'active' ? '🟢 活跃' : '⚪ 停用'}
                  </span>
                </div>

                {statsLoading ? (
                  <div className="detail-stat loading">
                    <span className="label">加载统计中...</span>
                  </div>
                ) : expertStats ? (
                  <>
                    <div className="detail-stat">
                      <span className="label">参与评审</span>
                      <span className="value highlight">{expertStats.reviewCount} 次</span>
                    </div>
                    <div className="detail-stat">
                      <span className="label">意见被采纳</span>
                      <span className="value success">{expertStats.acceptedCount} 次</span>
                    </div>
                    <div className="detail-stat">
                      <span className="label">意见被忽略</span>
                      <span className="value warning">{expertStats.rejectedCount} 次</span>
                    </div>
                    <div className="detail-stat">
                      <span className="label">采纳率</span>
                      <span className="value highlight">{expertStats.participationRate}%</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDetailModal(false)}
              >
                关闭
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowDetailModal(false);
                  setFormData({
                    name: selectedExpert.name,
                    title: selectedExpert.title,
                    company: selectedExpert.company,
                    angle: selectedExpert.angle,
                    domain: selectedExpert.domain,
                    bio: selectedExpert.bio,
                    status: selectedExpert.status,
                  });
                  setShowEditModal(true);
                }}
              >
                编辑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
