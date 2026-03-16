import { useState, useEffect } from 'react';
import { expertsApi } from '../api/client';
import type { Expert } from '../types';
import './Experts.css';

export function Experts() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExperts();
  }, []);

  const loadExperts = async () => {
    setLoading(true);
    try {
      const data = await expertsApi.getAll();
      setExperts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const getExpertTypeLabel = (type: Expert['expertType']) => {
    const labels: Record<string, string> = {
      academic: '学术专家',
      industry: '产业专家',
      think_tank: '智库研究员',
    };
    return labels[type] || type;
  };

  return (
    <div className="experts-page">
      <div className="page-header">
        <h1 className="page-title">专家库</h1>
        <button className="btn btn-primary">
          <span>+</span> 添加专家
        </button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : experts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">暂无专家</div>
            <p>专家库用于管理行业研究过程中积累的各领域专家资源</p>
          </div>
        </div>
      ) : (
        <div className="experts-list">
          {experts.map((expert) => (
            <div key={expert.id} className="expert-card">
              <div className="expert-avatar">
                {expert.name.charAt(0)}
              </div>
              <div className="expert-info">
                <div className="expert-header">
                  <span className="expert-name">{expert.name}</span>
                  <span className={`expert-type expert-type-${expert.expertType}`}>
                    {getExpertTypeLabel(expert.expertType)}
                  </span>
                </div>
                <div className="expert-org">{expert.organization}</div>
                <div className="expert-domain">{expert.domain}</div>
                {expert.email && (
                  <div className="expert-contact">{expert.email}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
