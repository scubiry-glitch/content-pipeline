// LG Reviews Tab - 蓝军评审
// 评审轮次 Timeline + 专家问题卡片 + 专家配置弹窗 + 右侧标注卡片侧边栏

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { ReviewConfigPanel } from '../../components/ReviewConfigPanel';
import { InlineAnnotationArea } from '../../components/content/InlineAnnotationArea';
import { langgraphApi, type LGAnnotation } from '../../api/langgraph';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';

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

// 将蓝军 severity 映射到 InlineAnnotationArea 的 severity
function mapAnnotationSeverity(s: string): 'critical' | 'warning' | 'info' | 'praise' {
  if (s === 'high') return 'critical';
  if (s === 'medium') return 'warning';
  if (s === 'praise') return 'praise';
  return 'info';
}

// 问题决策状态类型
type Decision = 'accepted' | 'ignored' | 'pending';

// 决策持久化工具（localStorage 按 threadId 分组）
function loadDecisions(threadId: string): Record<string, Decision> {
  try {
    return JSON.parse(localStorage.getItem(`lg-review-decisions:${threadId}`) || '{}');
  } catch {
    return {};
  }
}

function saveDecisions(threadId: string, decisions: Record<string, Decision>) {
  try {
    localStorage.setItem(`lg-review-decisions:${threadId}`, JSON.stringify(decisions));
  } catch {}
}

// 生成稳定的问题 key（round + 索引 + question 前 20 字符）
function getQuestionKey(round: number, index: number, question: string): string {
  const hash = (question || '').slice(0, 20).replace(/\s/g, '_');
  return `r${round}_i${index}_${hash}`;
}

export function LGReviewsTab() {
  const { detail, reviewConfig, onSaveReviewConfig, pendingAction, onResume, resuming } =
    useOutletContext<LGTaskContext>();

  const [feedback, setFeedback] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [annotations, setAnnotations] = useState<LGAnnotation[]>([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [showDraftViewer, setShowDraftViewer] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  // 加载决策状态（threadId 变化时）
  useEffect(() => {
    if (!detail?.threadId) return;
    setDecisions(loadDecisions(detail.threadId));
  }, [detail?.threadId]);

  // 决策操作
  const updateDecision = (key: string, decision: Decision) => {
    if (!detail?.threadId) return;
    const next = { ...decisions };
    if (decision === 'pending') {
      delete next[key];
    } else {
      next[key] = decision;
    }
    setDecisions(next);
    saveDecisions(detail.threadId, next);
  };

  // 加载标注（每当评审轮次变化时重新拉取）
  const blueTeamRoundsCount = detail?.blueTeamRounds?.length ?? 0;
  useEffect(() => {
    if (!detail?.threadId) return;
    langgraphApi.getAnnotations(detail.threadId)
      .then(setAnnotations)
      .catch(() => {});
  }, [detail?.threadId, blueTeamRoundsCount]);

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

  const handleSaveConfig = async (config: any) => {
    setConfigSaving(true);
    try {
      await onSaveReviewConfig(config);
      setConfigOpen(false);
    } finally {
      setConfigSaving(false);
    }
  };

  // 全局统计
  const allQuestions = rounds.flatMap((r: any) => r.questions || []);
  const severityCounts = allQuestions.reduce<Record<string, number>>((acc, q: any) => {
    acc[q.severity] = (acc[q.severity] || 0) + 1;
    return acc;
  }, {});

  // 决策统计
  const decisionStats = rounds.reduce(
    (acc, round: any) => {
      (round.questions || []).forEach((q: any, j: number) => {
        const key = getQuestionKey(round.round, j, q.question);
        const d = decisions[key] || 'pending';
        acc[d] = (acc[d] || 0) + 1;
      });
      return acc;
    },
    { accepted: 0, ignored: 0, pending: 0 } as Record<Decision, number>
  );

  // 将 LGAnnotation 转为 InlineAnnotationArea 格式
  const annotationItems = annotations.map(a => ({
    id: a.id,
    content: a.comment,
    severity: mapAnnotationSeverity(a.severity),
    author: a.expertName,
    location: a.location,
    suggestion: a.suggestion,
    resolved: a.resolved,
  }));

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

      {/* 评审概览 + 配置按钮 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">fact_check</span>
            蓝军评审
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="section-desc">
              共 {rounds.length} 轮评审，{allQuestions.length} 条意见
            </div>
            <button
              className="lg-btn lg-btn-secondary"
              onClick={() => setConfigOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '13px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>settings</span>
              配置专家
            </button>
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">bar_chart</span>
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
            <span className="material-symbols-outlined">checklist</span>
            决策进度
          </div>
          <div className="info-item">
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                padding: '1px 8px', borderRadius: 'var(--radius-full)',
                fontSize: '11px', fontWeight: 600,
                background: 'hsla(142, 45%, 45%, 0.1)', color: '#22c55e',
              }}>已接受</span>
            </span>
            <span className="value">{decisionStats.accepted}</span>
          </div>
          <div className="info-item">
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                padding: '1px 8px', borderRadius: 'var(--radius-full)',
                fontSize: '11px', fontWeight: 600,
                background: 'hsla(0, 0%, 50%, 0.1)', color: '#6b7280',
              }}>已忽略</span>
            </span>
            <span className="value">{decisionStats.ignored}</span>
          </div>
          <div className="info-item">
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                padding: '1px 8px', borderRadius: 'var(--radius-full)',
                fontSize: '11px', fontWeight: 600,
                background: 'hsla(45, 90%, 50%, 0.1)', color: '#f59e0b',
              }}>待处理</span>
            </span>
            <span className="value">{decisionStats.pending}</span>
          </div>
          {allQuestions.length > 0 && (
            <div className="info-item">
              <span className="label">完成率</span>
              <span className="value">
                {Math.round(((decisionStats.accepted + decisionStats.ignored) / allQuestions.length) * 100)}%
              </span>
            </div>
          )}
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">pie_chart</span>
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

      {/* 主体：左侧评审轮次 + 右侧标注卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: annotationItems.length > 0 ? '1fr 340px' : '1fr', gap: '24px', marginTop: '24px' }}>
        {/* 左：评审轮次 Timeline */}
        <div>
          {rounds.length === 0 && (
            <div className="info-card full-width" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>
                rate_review
              </span>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>评审记录尚未生成</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                写作完成后，Pipeline 将自动进入蓝军评审阶段
              </p>
            </div>
          )}

          {rounds.map((round: any, i: number) => (
            <div key={i} style={{ marginBottom: '24px' }}>
              <div className="section-header">
                <div className="section-title">
                  <span className="material-symbols-outlined">loop</span>
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
                  const qKey = getQuestionKey(round.round, j, q.question);
                  const decision = decisions[qKey] || 'pending';
                  const decisionStyle =
                    decision === 'accepted'
                      ? { bg: 'hsla(142, 45%, 45%, 0.12)', color: '#22c55e', label: '已接受' }
                      : decision === 'ignored'
                        ? { bg: 'hsla(0, 0%, 50%, 0.12)', color: '#6b7280', label: '已忽略' }
                        : null;

                  return (
                    <div
                      key={j}
                      className="info-card"
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: severity.color,
                        opacity: decision === 'ignored' ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '18px' }}>{expert.icon}</span>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                          {q.expertName || expert.label}
                        </span>
                        <span style={{
                          padding: '2px 10px', borderRadius: 'var(--radius-full)',
                          fontSize: '11px', fontWeight: 600,
                          background: severity.bg, color: severity.color,
                        }}>
                          {severity.label}
                        </span>
                        {decisionStyle && (
                          <span style={{
                            padding: '2px 10px', borderRadius: 'var(--radius-full)',
                            fontSize: '11px', fontWeight: 600,
                            background: decisionStyle.bg, color: decisionStyle.color,
                          }}>
                            ✓ {decisionStyle.label}
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '0 0 8px' }}>
                        {q.question}
                      </p>

                      {q.suggestion && (
                        <div style={{
                          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-alt)', fontSize: '12px',
                          color: 'var(--text-secondary)', lineHeight: 1.5,
                          marginBottom: '10px',
                        }}>
                          <span style={{ fontWeight: 600 }}>建议：</span>{q.suggestion}
                        </div>
                      )}

                      {/* 决策按钮 */}
                      {q.severity !== 'praise' && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={() => updateDecision(qKey, decision === 'accepted' ? 'pending' : 'accepted')}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: decision === 'accepted' ? '1px solid #22c55e' : '1px solid var(--divider)',
                              background: decision === 'accepted' ? 'hsla(142, 45%, 45%, 0.1)' : 'var(--surface)',
                              color: decision === 'accepted' ? '#22c55e' : 'var(--text-secondary)',
                              transition: 'all 0.15s',
                            }}
                          >
                            ✓ 接受
                          </button>
                          <button
                            type="button"
                            onClick={() => updateDecision(qKey, decision === 'ignored' ? 'pending' : 'ignored')}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: decision === 'ignored' ? '1px solid #6b7280' : '1px solid var(--divider)',
                              background: decision === 'ignored' ? 'hsla(0, 0%, 50%, 0.1)' : 'var(--surface)',
                              color: decision === 'ignored' ? '#6b7280' : 'var(--text-secondary)',
                              transition: 'all 0.15s',
                            }}
                          >
                            ✕ 忽略
                          </button>
                          {decision !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => updateDecision(qKey, 'pending')}
                              style={{
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '12px',
                                cursor: 'pointer',
                                border: '1px solid var(--divider)',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                              }}
                            >
                              重置
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 右：标注卡片侧边栏（仅当有标注时显示） */}
        {annotationItems.length > 0 && (
          <div style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}>
            <InlineAnnotationArea
              annotations={annotationItems}
              title="评审标注"
            />
          </div>
        )}
      </div>

      {/* 专家配置弹窗 */}
      <ReviewConfigPanel
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        onConfirm={handleSaveConfig}
        onSave={async (config) => {
          setConfigSaving(true);
          try { await onSaveReviewConfig(config); }
          finally { setConfigSaving(false); }
        }}
        topic={detail.topic}
        savedConfig={reviewConfig}
      />

      {/* 保存中提示（简单实现） */}
      {configSaving && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px',
          background: 'var(--surface)', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius)', padding: '10px 18px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '13px',
          color: 'var(--text)', zIndex: 1000,
        }}>
          保存配置中...
        </div>
      )}

      {/* 草稿文档查看器 */}
      {detail.draftContent && rounds.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title" style={{ cursor: 'pointer' }} onClick={() => setShowDraftViewer(!showDraftViewer)}>
              <span className="material-symbols-outlined">description</span>
              评审文档查看
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {showDraftViewer ? 'expand_less' : 'expand_more'}
              </span>
            </div>
            <div className="section-desc">查看被评审的草稿内容</div>
          </div>
          {showDraftViewer && (
            <div className="info-card full-width" style={{ maxHeight: '500px', overflow: 'auto' }}>
              <MarkdownRenderer content={detail.draftContent} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
