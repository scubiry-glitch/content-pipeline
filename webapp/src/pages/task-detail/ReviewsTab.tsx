// 任务详情 - 蓝军评审 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExpertReviewPanel } from '../../components/ExpertReviewPanel';
import { SequentialReviewChain } from '../../components/SequentialReviewChain';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import type { Task, BlueTeamReview } from '../../types';

interface TaskContext {
  task: Task;
  reviews: BlueTeamReview[];
  reviewSummary: {
    total: number;
    critical: number;
    warning: number;
    praise: number;
    accepted: number;
    ignored: number;
    pending: number;
  };
  onReviewDecision: (reviewId: string, questionId: string, decision: 'accept' | 'ignore' | 'manual_resolved', note?: string) => void;
  onBatchDecision: (decision: 'accept' | 'ignore') => void;
  onReReview: (expertRole: string) => void;
  onRedoReview: () => void;
}

const EXPERT_ROLES: Record<string, { name: string; icon: string; color: string; desc: string }> = {
  // 新版蓝军评审角色 (3×3×2 模式)
  challenger: { name: '批判者', icon: '🔍', color: '#ef4444', desc: '挑战逻辑漏洞、数据可靠性' },
  expander: { name: '拓展者', icon: '⚖️', color: '#f59e0b', desc: '扩展关联因素、国际对比' },
  synthesizer: { name: '提炼者', icon: '👔', color: '#06b6d4', desc: '归纳核心论点、结构优化' },
  // 兼容旧版角色
  fact_checker: { name: '事实核查员', icon: '🔍', color: '#ef4444', desc: '数据准确性' },
  logic_checker: { name: '逻辑检察官', icon: '⚖️', color: '#f59e0b', desc: '论证严密性' },
  domain_expert: { name: '行业专家', icon: '👔', color: '#06b6d4', desc: '专业深度' },
  reader_rep: { name: '读者代表', icon: '👁️', color: '#10b981', desc: '可读性' }
};

export function ReviewsTab() {
  const {
    task,
    reviews,
    reviewSummary,
    onReviewDecision,
    onBatchDecision,
    onReReview,
    onRedoReview,
  } = useOutletContext<TaskContext>();

  // 版本查看弹窗状态
  const [selectedVersion, setSelectedVersion] = useState<{ id: string; content: string; round?: number } | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

  // 加载版本内容
  const loadVersionContent = async (versionId: string) => {
    setVersionLoading(true);
    try {
      const res = await fetch(`/api/v1/production/${task!.id}/drafts/${versionId}`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedVersion({
          id: versionId,
          content: data.content || data.draft?.content || '无内容',
          round: data.round
        });
      } else {
        alert('加载版本内容失败');
      }
    } catch (err) {
      console.error('加载版本失败:', err);
      alert('加载版本内容失败');
    } finally {
      setVersionLoading(false);
    }
  };

  const groupedReviews = {
    critical: [] as any[],
    warning: [] as any[],
    praise: [] as any[]
  };

  reviews.forEach(review => {
    const expertInfo = EXPERT_ROLES[review.expert_role] || { name: '专家', icon: '👤', color: '#666' };
    // 将 review 级别的状态映射到 question 级别
    // user_decision 优先于 status（如果用户已做出决策）
    const reviewStatus = review.user_decision || review.status;
    review.questions?.forEach((q: any) => {
      const item = { 
        ...q, 
        reviewId: review.id,
        expertRole: review.expert_role,
        expertName: expertInfo.name,
        expertIcon: expertInfo.icon,
        status: reviewStatus  // 添加 review 的状态到 question
      };
      if (q.severity === 'high') groupedReviews.critical.push(item);
      else if (q.severity === 'medium') groupedReviews.warning.push(item);
      else if (q.severity === 'praise') groupedReviews.praise.push(item);
    });
  });

  const canProceed = reviewSummary.critical === 0 || reviewSummary.accepted >= reviewSummary.critical;

  const renderReviewItem = (item: any, idx: number) => {
    const statusLabels: Record<string, { text: string; class: string }> = {
      pending: { text: '⏳ 待处理', class: 'pending' },
      accepted: { text: '✓ 已接受', class: 'accepted' },
      accept: { text: '✓ 已接受', class: 'accepted' },
      ignored: { text: '⊘ 已忽略', class: 'ignored' },
      manual_resolved: { text: '✓ 已手动处理', class: 'manual' },
      completed: { text: '✓ 已完成', class: 'accepted' },
      reject: { text: '✗ 已拒绝', class: 'ignored' },
      revise: { text: '↻ 需修改', class: 'warning' }
    };
    const status = statusLabels[item.status || 'pending'] || statusLabels['pending'];

    return (
      <div
        key={`${item.reviewId}-${idx}`}
        className={`review-question-item ${item.status || 'pending'}`}
        style={{ opacity: item.status && item.status !== 'pending' ? 0.7 : 1 }}
      >
        <div className="review-question-header">
          <div className="reviewer-badge">
            <span className="reviewer-icon">{item.expertIcon || '👤'}</span>
            <span style={{ fontWeight: 600, color: '#374151' }}>{item.expertName || '专家'}</span>
            <span style={{ 
              fontSize: '11px', 
              padding: '2px 8px', 
              background: item.expertRole === 'challenger' ? '#fee2e2' : 
                         item.expertRole === 'expander' ? '#fef3c7' : 
                         item.expertRole === 'synthesizer' ? '#e0f2fe' : '#f3f4f6',
              color: item.expertRole === 'challenger' ? '#991b1b' : 
                     item.expertRole === 'expander' ? '#92400e' : 
                     item.expertRole === 'synthesizer' ? '#075985' : '#4b5563',
              borderRadius: '4px',
              marginLeft: '8px'
            }}>
              {item.expertRole === 'challenger' ? '批判者' : 
               item.expertRole === 'expander' ? '拓展者' : 
               item.expertRole === 'synthesizer' ? '提炼者' : item.expertRole}
            </span>
            {item.location && <span className="location">📍 {item.location}</span>}
          </div>
          <div className="review-badges">
            <span className={`status-badge ${status.class}`}>{status.text}</span>
            <span className={`severity-badge ${item.severity}`}>{item.severity}</span>
          </div>
        </div>

        <div className="review-question-body">
          <p><strong>问题：</strong>{item.question}</p>
          <p className="suggestion"><strong>建议：</strong>{item.suggestion}</p>
          {item.rationale && <p className="rationale">依据：{item.rationale}</p>}
          {item.decisionNote && <p className="decision-note">备注：{item.decisionNote}</p>}
        </div>

        {task?.status === 'awaiting_approval' && (!item.status || item.status === 'pending') && item.severity !== 'praise' && (
          <div className="review-actions">
            <button
              className="btn btn-success btn-sm"
              onClick={() => onReviewDecision(item.reviewId, item.id, 'accept')}
            >
              ✓ 接受修改
            </button>
            <button
              className="btn btn-info btn-sm"
              onClick={() => onReviewDecision(item.reviewId, item.id, 'manual_resolved')}
            >
              ✓ 已手动处理
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onReviewDecision(item.reviewId, item.id, 'ignore')}
            >
              ⊘ 忽略
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tab-panel reviews-panel">
      {/* ========== 1. 输入 ========== */}
      <div className="section-header">
        <h3 className="section-title">📥 输入</h3>
        <span className="section-desc">评审概览与专家分工</span>
      </div>

      <div className="input-grid">
        {/* 评审统计概览 */}
        <div className="info-card input-card">
          <div className="card-header-with-actions">
            <h3 className="card-title">🔥 蓝军评审概览</h3>
          </div>

          <div className="review-stats-grid">
            <div className="stat-box critical">
              <div className="stat-number">{reviewSummary.critical}</div>
              <div className="stat-label">🔴 严重问题</div>
            </div>
            <div className="stat-box warning">
              <div className="stat-number">{reviewSummary.warning}</div>
              <div className="stat-label">🟡 改进建议</div>
            </div>
            <div className="stat-box praise">
              <div className="stat-number">{reviewSummary.praise}</div>
              <div className="stat-label">🟢 亮点</div>
            </div>
            <div className="stat-box total">
              <div className="stat-number">{reviewSummary.total}</div>
              <div className="stat-label">总评审数</div>
            </div>
          </div>

          {/* 处理进度 */}
          {reviewSummary.total > 0 && (
            <div className="review-progress-section">
              <div className="progress-header">
                <span>处理进度</span>
                <span className="progress-count">
                  已处理: {reviewSummary.accepted + reviewSummary.ignored} / {reviewSummary.total}
                </span>
              </div>
              <div className="review-progress-bar">
                <div
                  className="progress-segment accepted"
                  style={{ width: `${(reviewSummary.accepted / reviewSummary.total) * 100}%` }}
                />
                <div
                  className="progress-segment ignored"
                  style={{ width: `${(reviewSummary.ignored / reviewSummary.total) * 100}%` }}
                />
                <div
                  className="progress-segment pending"
                  style={{ width: `${(reviewSummary.pending / reviewSummary.total) * 100}%` }}
                />
              </div>
              <div className="progress-legend">
                <span className="legend-item accepted">✓ 已接受 {reviewSummary.accepted}</span>
                <span className="legend-item ignored">⊘ 已忽略 {reviewSummary.ignored}</span>
                <span className="legend-item pending">⏳ 待处理 {reviewSummary.pending}</span>
              </div>
            </div>
          )}
        </div>

        {/* 专家评审分工 */}
        <div className="info-card input-card">
          <h3 className="card-title">👥 专家评审分工</h3>
          <div className="experts-grid">
            {Object.entries(EXPERT_ROLES).filter(([role]) => ['challenger', 'expander', 'synthesizer'].includes(role)).map(([role, info]) => (
              <div key={role} className="expert-role-card" style={{ borderLeftColor: info.color }}>
                <div className="expert-icon">{info.icon}</div>
                <div className="expert-info">
                  <div className="expert-name">{info.name}</div>
                  <div className="expert-desc">{info.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 串行评审版本链 */}
        <div className="info-card full-width input-card">
          <SequentialReviewChain 
            taskId={task!.id}
            onVersionSelect={loadVersionContent}
          />
        </div>

        {/* 版本内容查看弹窗 */}
        {selectedVersion && (
          <div 
            className="version-modal"
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setSelectedVersion(null)}
          >
            <div 
              className="version-modal-content"
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '900px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div 
                className="version-modal-header"
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <h3 style={{ margin: 0, fontSize: '18px' }}>
                  📝 版本内容 
                  {selectedVersion.round ? `(第 ${selectedVersion.round} 轮)` : ''}
                  <span style={{ 
                    fontSize: '12px', 
                    color: '#6b7280', 
                    marginLeft: '8px',
                    fontFamily: 'monospace'
                  }}>
                    {selectedVersion.id.slice(-8)}
                  </span>
                </h3>
                <button 
                  className="btn btn-close"
                  onClick={() => setSelectedVersion(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '4px 8px'
                  }}
                >
                  ×
                </button>
              </div>
              
              <div 
                className="version-modal-body"
                style={{
                  padding: '20px',
                  overflow: 'auto',
                  maxHeight: 'calc(80vh - 70px)',
                  minHeight: '400px'
                }}
              >
                {versionLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    ⏳ 加载中...
                  </div>
                ) : (
                  <MarkdownRenderer content={selectedVersion.content} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 专家库深度评审 */}
        {(task?.outline || (task as any)?.writing_data?.draft) && (
          <div className="info-card full-width input-card">
            <h3 className="card-title">🔍 专家库深度评审</h3>
            <ExpertReviewPanel
              taskId={task!.id}
              topic={task!.topic}
              content={(task as any)?.writing_data?.draft || JSON.stringify(task?.outline) || ''}
              contentType={(task as any)?.writing_data?.draft ? 'draft' : 'outline'}
              importance={0.85}
              onAccept={(expertId) => console.log('接受专家意见:', expertId)}
              onIgnore={(expertId) => console.log('忽略专家意见:', expertId)}
            />
          </div>
        )}
      </div>

      {/* ========== 2. 加工 ========== */}
      {task?.status === 'awaiting_approval' && reviewSummary.total > 0 && (
        <>
          <div className="section-header">
            <h3 className="section-title">⚙️ 加工</h3>
            <span className="section-desc">评审处理与决策</span>
          </div>

          <div className="info-card full-width process-card">
            <h3 className="card-title">📝 评审处理</h3>
            
            {!canProceed ? (
              <div className="cannot-proceed-warning">
                ⚠️ 有 {reviewSummary.critical - reviewSummary.accepted} 个严重问题未处理，处理后才能进入确认环节
              </div>
            ) : (
              <div className="can-proceed-notice">
                ✓ 所有严重问题已处理，可以进入确认环节
              </div>
            )}

            {/* 批量操作 */}
            <div className="batch-actions">
              <button className="btn btn-success" onClick={() => onBatchDecision('accept')}>
                ✓ 全部接受
              </button>
              <button className="btn btn-secondary" onClick={() => onBatchDecision('ignore')}>
                ⊘ 全部忽略
              </button>
            </div>

            {/* 单个评审处理 */}
            <div className="review-processing-list">
              <h4>待处理评审</h4>
              {groupedReviews.critical.filter((i: any) => !i.status || i.status === 'pending').map((item, idx) => renderReviewItem(item, idx))}
              {groupedReviews.warning.filter((i: any) => !i.status || i.status === 'pending').map((item, idx) => renderReviewItem(item, idx))}
            </div>
          </div>
        </>
      )}

      {/* ========== 3. 输出 ========== */}
      <div className="section-header">
        <h3 className="section-title">📤 输出</h3>
        <span className="section-desc">评审意见列表</span>
      </div>

      <div className="output-content">
        {/* 严重问题 */}
        {groupedReviews.critical.length > 0 && (
          <div className="info-card full-width output-card critical-group">
            <h3 className="card-title critical-title">🔴 严重问题（必须修改）</h3>
            {groupedReviews.critical.map((item, idx) => renderReviewItem(item, idx))}
          </div>
        )}

        {/* 改进建议 */}
        {groupedReviews.warning.length > 0 && (
          <div className="info-card full-width output-card warning-group">
            <h3 className="card-title warning-title">🟡 改进建议</h3>
            {groupedReviews.warning.map((item, idx) => renderReviewItem(item, idx))}
          </div>
        )}

        {/* 亮点 */}
        {groupedReviews.praise.length > 0 && (
          <div className="info-card full-width output-card praise-group">
            <h3 className="card-title praise-title">🟢 亮点</h3>
            {groupedReviews.praise.map((item, idx) => renderReviewItem(item, idx))}
          </div>
        )}

        {reviewSummary.total === 0 && (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">暂无评审记录</div>
            <p>任务进入评审阶段后将显示蓝军评审意见</p>
          </div>
        )}
      </div>

      {/* ========== 4. 辅助工具 ========== */}
      <div className="section-header">
        <h3 className="section-title">🛠️ 辅助工具</h3>
        <span className="section-desc">重新评审与专家调度</span>
      </div>

      <div className="tools-grid">
        <div className="info-card tools-card">
          <h3 className="card-title">⚡ 评审操作</h3>
          <div className="tools-actions">
            {task?.status === 'awaiting_approval' && (
              <button className="btn btn-warning" onClick={onRedoReview}>
                🔄 重做评审
              </button>
            )}
            {Object.entries(EXPERT_ROLES).map(([role, info]) => (
              <button
                key={role}
                className="btn btn-secondary"
                onClick={() => onReReview(role)}
                title={`申请${info.name}重新评审`}
              >
                🔄 {info.name}重审
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
