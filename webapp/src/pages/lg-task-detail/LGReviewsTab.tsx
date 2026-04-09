// LG Reviews Tab - 蓝军评审
// 评审轮次 Timeline + 专家问题卡片 + 最终审批面板

import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';

// severity 配色
const SEVERITY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  high: { bg: 'hsla(0, 72%, 51%, 0.1)', color: '#ef4444', label: '严重' },
  medium: { bg: 'hsla(30, 80%, 50%, 0.1)', color: '#f59e0b', label: '中等' },
  low: { bg: 'hsla(210, 80%, 50%, 0.1)', color: '#3b82f6', label: '轻微' },
  praise: { bg: 'hsla(142, 45%, 45%, 0.1)', color: '#22c55e', label: '优点' },
};

// 专家角色配色
const EXPERT_STYLES: Record<string, { icon: string; label: string }> = {
  challenger: { icon: '🗡️', label: '批判者' },
  expander: { icon: '🔭', label: '拓展者' },
  synthesizer: { icon: '🧬', label: '提炼者' },
  fact_checker: { icon: '📊', label: '事实核查' },
  logic_checker: { icon: '🧮', label: '逻辑审核' },
  domain_expert: { icon: '🎓', label: '领域专家' },
  reader_rep: { icon: '👥', label: '读者代表' },
};

export function LGReviewsTab() {
  const { detail, pendingAction, onResume, resuming } = useOutletContext<LGTaskContext>();
  const [feedback, setFeedback] = useState('');

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const rounds = detail.blueTeamRounds || [];

  const handleApprove = async () => {
    await onResume(true, feedback);
    setFeedback('');
  };

  const handleReject = async () => {
    await onResume(false, feedback);
    setFeedback('');
  };

  // 全局统计
  const allQuestions = rounds.flatMap((r: any) => r.questions || []);
  const severityCounts = allQuestions.reduce((acc: Record<string, number>, q: any) => {
    acc[q.severity] = (acc[q.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="tab-panel">
      {/* 最终审批面板 */}
      {pendingAction === 'final_approval' && (
        <div className="lg-action-panel" style={{ marginBottom: '24px' }}>
          <h3 className="lg-action-title">最终审批</h3>
          <p className="lg-action-desc">
            内容已通过蓝军评审（{rounds.length} 轮），请最终确认发布
          </p>
          <div className="lg-form-group">
            <textarea
              className="lg-textarea"
              placeholder="审批意见（可选）"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={2}
            />
          </div>
          <div className="lg-action-buttons">
            <button className="lg-btn lg-btn-danger" onClick={handleReject} disabled={resuming}>
              {resuming ? '处理中...' : '打回修改'}
            </button>
            <button className="lg-btn lg-btn-primary" onClick={handleApprove} disabled={resuming}>
              {resuming ? '处理中...' : '批准发布'}
            </button>
          </div>
        </div>
      )}

      {/* 评审概览 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-icons-outlined">fact_check</span>
            蓝军评审
          </div>
          <div className="section-desc">
            共 {rounds.length} 轮评审，{allQuestions.length} 条意见
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-icons-outlined">bar_chart</span>
            评审统计
          </div>
          <div className="info-item">
            <span className="label">评审轮数</span>
            <span className="value">{rounds.length}</span>
          </div>
          <div className="info-item">
            <span className="label">总问题数</span>
            <span className="value">{allQuestions.length}</span>
          </div>
          <div className="info-item">
            <span className="label">评审结果</span>
            <span className="value" style={{ color: detail.reviewPassed ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
              {detail.reviewPassed ? '通过' : '修订中'}
            </span>
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-icons-outlined">pie_chart</span>
            问题分布
          </div>
          {Object.entries(severityCounts).map(([severity, count]) => {
            const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
            return (
              <div key={severity} className="info-item">
                <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    padding: '1px 8px', borderRadius: 'var(--radius-full)',
                    fontSize: '11px', fontWeight: 600,
                    background: style.bg, color: style.color,
                  }}>
                    {style.label}
                  </span>
                </span>
                <span className="value">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 无评审记录 */}
      {rounds.length === 0 && (
        <div className="info-card full-width" style={{ textAlign: 'center', padding: '48px 24px', marginTop: '24px' }}>
          <span className="material-icons-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>
            rate_review
          </span>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>评审记录尚未生成</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            写作完成后，Pipeline 将自动进入蓝军评审阶段
          </p>
        </div>
      )}

      {/* 评审轮次 Timeline */}
      {rounds.map((round: any, i: number) => (
        <div key={i} style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-icons-outlined">loop</span>
              第 {round.round} 轮评审
            </div>
            {round.revisionSummary && (
              <div className="section-desc">{round.revisionSummary}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(round.questions || []).map((q: any, j: number) => {
              const severity = SEVERITY_STYLES[q.severity] || SEVERITY_STYLES.low;
              const expert = EXPERT_STYLES[q.role || q.expertId] || { icon: '🎓', label: q.expertName || q.role || 'Expert' };

              return (
                <div key={j} className="info-card" style={{ borderLeftWidth: '3px', borderLeftColor: severity.color }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    {/* 专家标签 */}
                    <span style={{ fontSize: '18px' }}>{expert.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                      {q.expertName || expert.label}
                    </span>
                    {/* Severity 标签 */}
                    <span style={{
                      padding: '2px 10px', borderRadius: 'var(--radius-full)',
                      fontSize: '11px', fontWeight: 600,
                      background: severity.bg, color: severity.color,
                    }}>
                      {severity.label}
                    </span>
                  </div>

                  {/* 问题 */}
                  <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '0 0 8px' }}>
                    {q.question}
                  </p>

                  {/* 建议 */}
                  {q.suggestion && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-alt)', fontSize: '12px',
                      color: 'var(--text-secondary)', lineHeight: 1.5,
                    }}>
                      <span style={{ fontWeight: 600 }}>建议：</span>{q.suggestion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
