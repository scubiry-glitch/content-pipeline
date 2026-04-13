// LG Reviews Tab - 蓝军评审
// 评审轮次 Timeline + 专家问题卡片 + 专家配置弹窗 + DocumentEditor (R1) + 流式更新 (R2)

import { useState, useEffect, useRef } from 'react';
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
  const [batchMode, setBatchMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [docViewMode, setDocViewMode] = useState<'preview' | 'source'>('preview');
  const [streamingPulse, setStreamingPulse] = useState(false);
  const [reviewView, setReviewView] = useState<'parallel' | 'sequential'>('parallel');
  const lastProgressRef = useRef<number>(-1);

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

  // 批量决策操作
  const batchUpdate = (decision: Decision) => {
    if (!detail?.threadId || selectedKeys.size === 0) return;
    const next = { ...decisions };
    selectedKeys.forEach((key) => {
      if (decision === 'pending') {
        delete next[key];
      } else {
        next[key] = decision;
      }
    });
    setDecisions(next);
    saveDecisions(detail.threadId, next);
    setSelectedKeys(new Set());
  };

  // 选择切换
  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 全选 / 清空（仅对非 praise 的问题）
  const selectAll = (allKeys: string[]) => {
    setSelectedKeys(new Set(allKeys));
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  // 加载标注（每当评审轮次变化时重新拉取）
  const blueTeamRoundsCount = detail?.blueTeamRounds?.length ?? 0;
  const currentProgress = detail?.progress ?? 0;
  useEffect(() => {
    if (!detail?.threadId) return;
    langgraphApi.getAnnotations(detail.threadId)
      .then(setAnnotations)
      .catch(() => {});
  }, [detail?.threadId, blueTeamRoundsCount]);

  // R2: 流式更新 — 检测 progress 变化时触发 pulse 动画
  useEffect(() => {
    if (lastProgressRef.current !== -1 && lastProgressRef.current !== currentProgress) {
      setStreamingPulse(true);
      const t = setTimeout(() => setStreamingPulse(false), 1500);
      return () => clearTimeout(t);
    }
    lastProgressRef.current = currentProgress;
  }, [currentProgress]);

  // 是否处于"实时评审中"状态
  const isLiveReviewing = detail?.status === 'reviewing';

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

  // 所有可选 key（非 praise 类型）
  const selectableKeys: string[] = [];
  rounds.forEach((round: any) => {
    (round.questions || []).forEach((q: any, j: number) => {
      if (q.severity !== 'praise') {
        selectableKeys.push(getQuestionKey(round.round, j, q.question));
      }
    });
  });

  // 收集所有"已接受"的问题（用于批量修订指令）
  type AcceptedItem = { key: string; round: number; severity: string; question: string; suggestion?: string; expert: string };
  const acceptedItems: AcceptedItem[] = [];
  rounds.forEach((round: any) => {
    (round.questions || []).forEach((q: any, j: number) => {
      const key = getQuestionKey(round.round, j, q.question);
      if (decisions[key] === 'accepted') {
        acceptedItems.push({
          key,
          round: round.round,
          severity: q.severity,
          question: q.question,
          suggestion: q.suggestion,
          expert: q.expertName || q.role || 'Expert',
        });
      }
    });
  });

  // 提交批量修订请求（通过 onResume(false, feedback) 触发下一轮评审）
  const submitBatchRevision = async () => {
    if (acceptedItems.length === 0) return;
    setSubmittingRevision(true);
    try {
      // 自动生成修订指令文本
      const instructions = [
        `# 修订指令（共 ${acceptedItems.length} 条已接受问题）`,
        '',
        revisionFeedback.trim() || '（无额外说明）',
        '',
        '## 已接受的修改建议',
        ...acceptedItems.map((item, i) => {
          const lines = [`${i + 1}. [第 ${item.round} 轮 · ${item.severity}] ${item.question}`];
          if (item.suggestion) lines.push(`   建议：${item.suggestion}`);
          return lines.join('\n');
        }),
      ].join('\n');

      await onResume(false, instructions);
      setShowRevisionModal(false);
      setRevisionFeedback('');
    } finally {
      setSubmittingRevision(false);
    }
  };

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
      {pendingAction === 'final_approval' && (() => {
        // 计算未决策的严重问题数量
        const undecidedHighSeverity = rounds.reduce((acc, round: any) => {
          (round.questions || []).forEach((q: any, j: number) => {
            if (q.severity === 'high') {
              const key = getQuestionKey(round.round, j, q.question);
              if (!decisions[key]) acc += 1;
            }
          });
          return acc;
        }, 0);
        const canStandardApprove = undecidedHighSeverity === 0;

        return (
          <div className="lg-action-panel" style={{ marginBottom: '24px' }}>
            <h3 className="lg-action-title">最终审批</h3>
            <p className="lg-action-desc">
              内容已通过蓝军评审（{rounds.length} 轮，{allQuestions.length} 条意见），请最终确认发布
            </p>

            {/* 决策检查摘要 */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px',
                marginBottom: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-alt)',
                fontSize: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>已接受</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e' }}>{decisionStats.accepted}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>已忽略</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#6b7280' }}>{decisionStats.ignored}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>待处理</div>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: decisionStats.pending > 0 ? '#f59e0b' : 'var(--text-muted)',
                  }}
                >
                  {decisionStats.pending}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>未决策严重问题</div>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: undecidedHighSeverity > 0 ? '#ef4444' : '#22c55e',
                  }}
                >
                  {undecidedHighSeverity}
                </div>
              </div>
            </div>

            {/* 警告：未决策严重问题 */}
            {undecidedHighSeverity > 0 && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'hsla(0, 72%, 51%, 0.08)',
                  borderLeft: '3px solid #ef4444',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ef4444' }}>
                  warning
                </span>
                <div>
                  <strong>{undecidedHighSeverity}</strong> 个严重问题尚未决策。建议先在评审列表中接受或忽略这些问题，
                  或使用「强制批准」跳过此检查。
                </div>
              </div>
            )}

            <div className="lg-form-group">
              <textarea
                className="lg-textarea"
                placeholder="审批意见（可选）"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={2}
              />
            </div>

            <div className="lg-action-buttons" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button className="lg-btn lg-btn-danger" onClick={handleReject} disabled={resuming}>
                {resuming ? '处理中...' : '打回修改'}
              </button>

              {/* 手动 override：批量标记所有待处理为已忽略后批准 */}
              {decisionStats.pending > 0 && (
                <button
                  type="button"
                  className="lg-btn lg-btn-secondary"
                  onClick={async () => {
                    // 将所有 pending 标记为 ignored
                    const next = { ...decisions };
                    rounds.forEach((round: any) => {
                      (round.questions || []).forEach((q: any, j: number) => {
                        const key = getQuestionKey(round.round, j, q.question);
                        if (!next[key] && q.severity !== 'praise') {
                          next[key] = 'ignored';
                        }
                      });
                    });
                    setDecisions(next);
                    if (detail?.threadId) saveDecisions(detail.threadId, next);
                  }}
                  disabled={resuming}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                  手动标记全部为已忽略
                </button>
              )}

              {/* 强制批准 */}
              <button
                type="button"
                className="lg-btn lg-btn-secondary"
                onClick={handleApprove}
                disabled={resuming || undecidedHighSeverity === 0}
                style={{
                  display: undecidedHighSeverity > 0 ? 'flex' : 'none',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
                强制批准
              </button>

              {/* 标准批准 */}
              <button
                className="lg-btn lg-btn-primary"
                onClick={handleApprove}
                disabled={resuming || !canStandardApprove}
                title={!canStandardApprove ? '存在未决策的严重问题，请先处理' : undefined}
              >
                {resuming ? '处理中...' : canStandardApprove ? '批准发布' : '请先处理严重问题'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* R2: 流式更新指示器 */}
      {isLiveReviewing && (
        <div
          className="info-card full-width"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            marginBottom: '16px',
            background: 'linear-gradient(90deg, hsla(199, 89%, 48%, 0.08), transparent)',
            border: '1px solid hsla(199, 89%, 48%, 0.3)',
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#3b82f6',
                animation: streamingPulse ? 'pulse 1.5s ease-out' : 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: '2px solid #3b82f6',
                opacity: streamingPulse ? 0.8 : 0.3,
                transform: streamingPulse ? 'scale(1.2)' : 'scale(1)',
                transition: 'all 0.4s',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6' }}>
              实时评审中{streamingPulse && ' · 正在更新'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              进度：{currentProgress}% · 当前节点：{detail.currentNode || '处理中'}
            </div>
          </div>
          <style>{`
            @keyframes pulse {
              0% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.4); opacity: 0.6; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* 评审概览 + 配置按钮 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">fact_check</span>
            蓝军评审
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div className="section-desc">
              共 {rounds.length} 轮评审，{allQuestions.length} 条意见
            </div>
            {acceptedItems.length > 0 && (
              <button
                type="button"
                className="lg-btn lg-btn-secondary"
                onClick={() => setShowRevisionModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  borderColor: '#22c55e',
                  color: '#22c55e',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit_note</span>
                生成修订指令 ({acceptedItems.length})
              </button>
            )}
            {selectableKeys.length > 0 && (
              <button
                className="lg-btn lg-btn-secondary"
                onClick={() => {
                  setBatchMode(!batchMode);
                  if (batchMode) clearSelection();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  background: batchMode ? 'hsla(210, 80%, 50%, 0.1)' : undefined,
                  color: batchMode ? '#3b82f6' : undefined,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {batchMode ? 'check_box' : 'check_box_outline_blank'}
                </span>
                {batchMode ? '退出批量' : '批量决策'}
              </button>
            )}
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

        {/* 批量操作工具栏 */}
        {batchMode && (
          <div
            className="info-card full-width"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              background: 'hsla(210, 80%, 50%, 0.05)',
              border: '1px solid hsla(210, 80%, 50%, 0.2)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="checkbox"
                checked={selectedKeys.size === selectableKeys.length && selectableKeys.length > 0}
                onChange={(e) => (e.target.checked ? selectAll(selectableKeys) : clearSelection())}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                已选 {selectedKeys.size} / {selectableKeys.length} 条
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => batchUpdate('accepted')}
                disabled={selectedKeys.size === 0}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                  border: '1px solid #22c55e',
                  background: selectedKeys.size === 0 ? 'var(--surface)' : 'hsla(142, 45%, 45%, 0.1)',
                  color: '#22c55e',
                  opacity: selectedKeys.size === 0 ? 0.5 : 1,
                }}
              >
                ✓ 批量接受
              </button>
              <button
                type="button"
                onClick={() => batchUpdate('ignored')}
                disabled={selectedKeys.size === 0}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                  border: '1px solid #6b7280',
                  background: selectedKeys.size === 0 ? 'var(--surface)' : 'hsla(0, 0%, 50%, 0.1)',
                  color: '#6b7280',
                  opacity: selectedKeys.size === 0 ? 0.5 : 1,
                }}
              >
                ✕ 批量忽略
              </button>
              <button
                type="button"
                onClick={() => batchUpdate('pending')}
                disabled={selectedKeys.size === 0}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--divider)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  opacity: selectedKeys.size === 0 ? 0.5 : 1,
                }}
              >
                批量重置
              </button>
            </div>
          </div>
        )}

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

      {/* R7: 视图切换 — 并行/顺序 */}
      {rounds.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '24px',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--divider)',
          }}
        >
          {(['parallel', 'sequential'] as const).map((v) => {
            const labels = { parallel: '并行评审', sequential: '顺序评审' };
            const icons = { parallel: 'view_module', sequential: 'view_stream' };
            const isActive = reviewView === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setReviewView(v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: '-9px',
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icons[v]}</span>
                {labels[v]}
              </button>
            );
          })}
        </div>
      )}

      {/* 主体：左侧评审轮次 + 右侧标注卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: annotationItems.length > 0 ? '1fr 340px' : '1fr', gap: '24px', marginTop: '0' }}>
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

          {/* 顺序评审视图 */}
          {reviewView === 'sequential' && rounds.length > 0 && (() => {
            // 将所有问题展平并按 expert 分组
            type SeqItem = { round: number; index: number; q: any; expert: string };
            const allItems: SeqItem[] = [];
            rounds.forEach((round: any) => {
              (round.questions || []).forEach((q: any, j: number) => {
                allItems.push({
                  round: round.round,
                  index: j,
                  q,
                  expert: q.expertName || q.role || q.expertId || 'Expert',
                });
              });
            });

            // 按 expert 分组
            const byExpert: Record<string, SeqItem[]> = {};
            allItems.forEach((it) => {
              if (!byExpert[it.expert]) byExpert[it.expert] = [];
              byExpert[it.expert].push(it);
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Object.entries(byExpert).map(([expert, items]) => {
                  const expertMeta = EXPERT_STYLES[items[0]?.q?.role || items[0]?.q?.expertId] || { icon: '🎓', label: expert };
                  return (
                    <div key={expert}>
                      {/* 专家头部 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 14px',
                          marginBottom: '8px',
                          background: 'linear-gradient(90deg, var(--primary-alpha), transparent)',
                          borderLeft: '3px solid var(--primary)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <span style={{ fontSize: '20px' }}>{expertMeta.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{expert}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {items.length} 条意见 · 跨 {new Set(items.map((i) => i.round)).size} 轮评审
                          </div>
                        </div>
                      </div>

                      {/* 该专家的问题列表 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '20px' }}>
                        {items.map((it, idx) => {
                          const sev = SEVERITY_STYLES[it.q.severity] || SEVERITY_STYLES.low;
                          const qKey = getQuestionKey(it.round, it.index, it.q.question);
                          const decision = decisions[qKey] || 'pending';
                          return (
                            <div
                              key={`${expert}-${idx}`}
                              className="info-card"
                              style={{
                                borderLeftWidth: '3px',
                                borderLeftColor: sev.color,
                                opacity: decision === 'ignored' ? 0.6 : 1,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '11px' }}>
                                <span
                                  style={{
                                    padding: '1px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    background: 'var(--surface-alt)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  R{it.round}
                                </span>
                                <span
                                  style={{
                                    padding: '1px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    background: sev.bg,
                                    color: sev.color,
                                  }}
                                >
                                  {sev.label}
                                </span>
                                {decision !== 'pending' && (
                                  <span
                                    style={{
                                      padding: '1px 8px',
                                      borderRadius: 'var(--radius-full)',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                      background: decision === 'accepted' ? 'hsla(142, 45%, 45%, 0.12)' : 'hsla(0, 0%, 50%, 0.12)',
                                      color: decision === 'accepted' ? '#22c55e' : '#6b7280',
                                    }}
                                  >
                                    {decision === 'accepted' ? '✓ 已接受' : '✕ 已忽略'}
                                  </span>
                                )}
                              </div>
                              <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '0 0 6px' }}>
                                {it.q.question}
                              </p>
                              {it.q.suggestion && (
                                <div
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'var(--surface-alt)',
                                    fontSize: '11px',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  💡 {it.q.suggestion}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 并行评审视图 */}
          {reviewView === 'parallel' && rounds.map((round: any, i: number) => (
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

                  const isSelectable = q.severity !== 'praise';
                  const isSelected = selectedKeys.has(qKey);

                  return (
                    <div
                      key={j}
                      className="info-card"
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: severity.color,
                        opacity: decision === 'ignored' ? 0.6 : 1,
                        boxShadow: isSelected ? '0 0 0 2px hsla(210, 80%, 50%, 0.3)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        {batchMode && isSelectable && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(qKey)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        )}
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

      {/* 批量修订 Modal (R5) */}
      {showRevisionModal && (
        <div
          className="lg-modal-overlay"
          onClick={() => !submittingRevision && setShowRevisionModal(false)}
        >
          <div
            className="lg-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            <h2 className="lg-modal-title">生成修订指令</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 16px' }}>
              将基于 <strong>{acceptedItems.length}</strong> 条已接受的修改建议生成修订指令，
              提交后任务将打回到写作阶段，进入下一轮修订。
            </p>

            {/* 统计行 */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px',
                marginBottom: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-alt)',
                fontSize: '12px',
              }}
            >
              {(['high', 'medium', 'low'] as const).map((sev) => {
                const count = acceptedItems.filter((i) => i.severity === sev).length;
                const colors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
                const labels: Record<string, string> = { high: '严重', medium: '中等', low: '轻微' };
                return (
                  <div key={sev} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{labels[sev]}</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: colors[sev] }}>{count}</div>
                  </div>
                );
              })}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>总计</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{acceptedItems.length}</div>
              </div>
            </div>

            {/* 已接受问题列表 */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                border: '1px solid var(--divider)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px',
                marginBottom: '12px',
                maxHeight: '300px',
              }}
            >
              {acceptedItems.map((item, i) => (
                <div
                  key={item.key}
                  style={{
                    padding: '8px',
                    borderBottom: i < acceptedItems.length - 1 ? '1px solid var(--divider)' : 'none',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>R{item.round}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{item.expert}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '10px',
                        fontWeight: 600,
                        background:
                          item.severity === 'high'
                            ? 'hsla(0, 72%, 51%, 0.1)'
                            : item.severity === 'medium'
                              ? 'hsla(30, 80%, 50%, 0.1)'
                              : 'hsla(210, 80%, 50%, 0.1)',
                        color:
                          item.severity === 'high'
                            ? '#ef4444'
                            : item.severity === 'medium'
                              ? '#f59e0b'
                              : '#3b82f6',
                      }}
                    >
                      {item.severity}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text)', lineHeight: 1.5 }}>{item.question}</div>
                  {item.suggestion && (
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        background: 'var(--surface)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      💡 {item.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 额外说明 */}
            <div className="lg-form-group">
              <label className="lg-label">补充修订说明（可选）</label>
              <textarea
                className="lg-textarea"
                placeholder="例如：请重点优化数据准确性，参考最新行业报告..."
                value={revisionFeedback}
                onChange={(e) => setRevisionFeedback(e.target.value)}
                rows={3}
              />
            </div>

            <div className="lg-modal-actions">
              <button
                className="lg-btn lg-btn-secondary"
                onClick={() => setShowRevisionModal(false)}
                disabled={submittingRevision}
              >
                取消
              </button>
              <button
                className="lg-btn lg-btn-primary"
                onClick={submitBatchRevision}
                disabled={submittingRevision || acceptedItems.length === 0}
              >
                {submittingRevision ? '提交中...' : `提交修订（${acceptedItems.length} 条）`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* R1: DocumentEditor — 评审文档编辑器 */}
      {detail.draftContent && rounds.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title" style={{ cursor: 'pointer' }} onClick={() => setShowDocEditor(!showDocEditor)}>
              <span className="material-symbols-outlined">edit_document</span>
              文档编辑器
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {showDocEditor ? 'expand_less' : 'expand_more'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="section-desc">查看草稿与评审标注</div>
              {showDocEditor && (
                <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--divider)' }}>
                  {(['preview', 'source'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDocViewMode(m); }}
                      style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        border: 'none',
                        background: docViewMode === m ? 'var(--primary)' : 'var(--surface)',
                        color: docViewMode === m ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {m === 'preview' ? '预览' : '源码'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {showDocEditor && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: annotationItems.length > 0 ? '2fr 1fr' : '1fr',
                gap: '16px',
              }}
            >
              {/* 文档主区 */}
              <div className="info-card full-width" style={{ maxHeight: '600px', overflow: 'auto' }}>
                {/* 文档头部信息 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    paddingBottom: '8px',
                    marginBottom: '8px',
                    borderBottom: '1px solid var(--divider)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>article</span>
                  <span>{(detail.draftContent || '').replace(/\s/g, '').length.toLocaleString()} 字</span>
                  <span>·</span>
                  <span>第 {rounds.length} 轮</span>
                  <span>·</span>
                  <span>{annotationItems.length} 条标注</span>
                </div>

                {docViewMode === 'preview' ? (
                  <MarkdownRenderer content={detail.draftContent} />
                ) : (
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: 'var(--text)',
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {detail.draftContent}
                  </pre>
                )}
              </div>

              {/* 右侧标注侧边栏 */}
              {annotationItems.length > 0 && (
                <div style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}>
                  <InlineAnnotationArea annotations={annotationItems} title="评审标注" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
