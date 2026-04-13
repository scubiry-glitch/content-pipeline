// LG Planning Tab - 选题策划
// 大纲结构化展示 + 选题评估 + 竞品分析 + 人工确认面板

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { langgraphApi, type LGStateHistoryItem } from '../../api/langgraph';

export function LGPlanningTab() {
  const { detail, pendingAction, onResume, resuming } = useOutletContext<LGTaskContext>();
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedOutlineText, setEditedOutlineText] = useState('');
  const [history, setHistory] = useState<LGStateHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // 加载 checkpoint 历史
  useEffect(() => {
    const threadId = detail?.threadId;
    if (!threadId) return;
    setLoadingHistory(true);
    langgraphApi.getStateHistory(threadId, 10)
      .then(res => setHistory(res.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [detail?.threadId]);

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  // 开始编辑大纲
  const startEditing = () => {
    if (detail?.outline) {
      setEditedOutlineText(JSON.stringify(detail.outline.sections || [], null, 2));
    }
    setEditing(true);
  };

  const handleConfirm = async () => {
    // 如果用户编辑了大纲，解析并传递
    let editedOutline: any = undefined;
    if (editing && editedOutlineText.trim()) {
      try {
        const parsed = JSON.parse(editedOutlineText);
        editedOutline = { sections: parsed, title: detail?.outline?.title };
      } catch {
        // parse failed, ignore edit
      }
    }
    // onResume 的第三个参数为 outline（通过 LGTaskContext.onResume 扩展）
    await (onResume as any)(true, feedback, editedOutline);
    setFeedback('');
    setEditing(false);
  };

  const handleReject = async () => {
    await onResume(false, feedback);
    setFeedback('');
    setEditing(false);
  };

  return (
    <div className="tab-panel">
      {/* 人工确认面板 */}
      {pendingAction === 'outline_review' && (
        <div className="lg-action-panel" style={{ marginBottom: '24px' }}>
          <h3 className="lg-action-title">大纲确认</h3>
          <p className="lg-action-desc">
            {detail.evaluation?.passed
              ? '大纲已生成，请审阅后确认进入研究阶段'
              : `选题评分 ${detail.evaluation?.score || '?'} 分，建议调整角度后再继续`
            }
          </p>
          {/* 编辑大纲模式 */}
          {editing && (
            <div className="lg-form-group">
              <label className="lg-label">编辑大纲结构 (JSON)</label>
              <textarea
                className="lg-textarea"
                value={editedOutlineText}
                onChange={e => setEditedOutlineText(e.target.value)}
                rows={12}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                编辑后的大纲将随确认一起提交。格式：JSON 数组，每项包含 title, level, content 字段。
              </div>
            </div>
          )}

          <div className="lg-form-group">
            <textarea
              className="lg-textarea"
              placeholder="反馈意见（可选，退回时将作为修改建议）"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
            />
          </div>
          <div className="lg-action-buttons">
            {!editing && (
              <button className="lg-btn lg-btn-secondary" onClick={startEditing} disabled={resuming}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>edit</span>
                编辑大纲
              </button>
            )}
            {editing && (
              <button className="lg-btn lg-btn-secondary" onClick={() => setEditing(false)} disabled={resuming}>
                取消编辑
              </button>
            )}
            <button className="lg-btn lg-btn-danger" onClick={handleReject} disabled={resuming}>
              {resuming ? '处理中...' : '退回修改'}
            </button>
            <button className="lg-btn lg-btn-primary" onClick={handleConfirm} disabled={resuming}>
              {resuming ? '处理中...' : editing ? '确认并提交修改' : '确认大纲'}
            </button>
          </div>
        </div>
      )}

      {/* 大纲结构 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">article</span>
            大纲结构
          </div>
          <div className="section-desc">LangGraph Planner 生成的文章大纲</div>
        </div>

        {detail.outline ? (
          <div className="info-card full-width">
            {detail.outline.title && (
              <div className="card-title">
                <span className="material-symbols-outlined">title</span>
                {detail.outline.title}
              </div>
            )}
            <div className="lg-outline-tree">
              {(detail.outline.sections || []).map((section: any, i: number) => (
                <OutlineSection key={i} section={section} index={i + 1} />
              ))}
            </div>
          </div>
        ) : (
          <div className="info-card full-width">
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              大纲尚未生成
            </p>
          </div>
        )}
      </div>

      {/* Pipeline 版本历史 (Checkpoints) */}
      {history.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">history</span>
              Pipeline 版本历史
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="section-desc">{history.length} 条快照</div>
              <button
                type="button"
                className="lg-btn lg-btn-secondary"
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: showCompare ? 'hsla(210, 80%, 50%, 0.1)' : undefined,
                  color: showCompare ? '#3b82f6' : undefined,
                }}
                onClick={() => {
                  setShowCompare(!showCompare);
                  if (showCompare) setCompareSelection([]);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>compare_arrows</span>
                {showCompare ? '退出对比' : '版本对比'}
              </button>
            </div>
          </div>
          {showCompare && (
            <div
              className="info-card full-width"
              style={{
                background: 'hsla(210, 80%, 50%, 0.05)',
                border: '1px solid hsla(210, 80%, 50%, 0.2)',
                marginBottom: '12px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              💡 已选择 {compareSelection.length}/2 个 checkpoint。点击下方 checkpoint 卡片即可加入对比。
            </div>
          )}
          <div className="info-card full-width">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {history.map((item, i) => {
                const nodeLabels: Record<string, string> = {
                  planner: '选题策划', human_outline: '大纲确认', researcher: '数据研究',
                  writer: '内容写作', blue_team: '蓝军评审', human_approve: '最终审批', output: '输出发布',
                };
                const cpId = item.checkpoint_id || `idx-${i}`;
                const isSelected = compareSelection.includes(cpId);
                const handleClick = () => {
                  if (!showCompare) return;
                  if (isSelected) {
                    setCompareSelection(compareSelection.filter((id) => id !== cpId));
                  } else if (compareSelection.length < 2) {
                    setCompareSelection([...compareSelection, cpId]);
                  }
                };
                return (
                  <div
                    key={item.checkpoint_id || i}
                    onClick={handleClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected
                        ? 'hsla(210, 80%, 50%, 0.12)'
                        : i === 0
                          ? 'var(--primary-alpha)'
                          : 'transparent',
                      border: isSelected
                        ? '1px solid #3b82f6'
                        : i === 0
                          ? '1px solid var(--primary)'
                          : '1px solid transparent',
                      cursor: showCompare ? 'pointer' : 'default',
                    }}
                  >
                    {showCompare && (
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: isSelected ? '#3b82f6' : 'var(--text-muted)' }}>
                        {isSelected ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    )}
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: i === 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {i === 0 ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '12px', fontWeight: i === 0 ? 700 : 400, color: 'var(--text)' }}>
                        {nodeLabels[item.values.currentNode] || item.values.currentNode || 'unknown'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        {item.values.status} · {item.values.progress}%
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {item.checkpoint_id?.slice(0, 8) || ''}
                    </span>
                  </div>
                );
              })}
            </div>
            {loadingHistory && <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>加载中...</p>}
          </div>

          {/* 版本对比面板 */}
          {showCompare && compareSelection.length === 2 && (
            <CheckpointComparePanel
              history={history}
              selectedIds={compareSelection}
            />
          )}
        </div>
      )}

      {/* 大纲编辑实时 Diff（编辑模式时） */}
      {editing && detail.outline && (
        <OutlineEditDiffPanel
          original={detail.outline.sections || []}
          editedText={editedOutlineText}
        />
      )}

      {/* 选题评估 */}
      {detail.evaluation && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">assessment</span>
              选题评估
            </div>
          </div>

          <div className="info-card">
            <div className="card-title">
              <span className="material-symbols-outlined">score</span>
              评分概览
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div className="score-circle" style={{ width: '64px', height: '64px', flexShrink: 0 }}>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{detail.evaluation.score}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: detail.evaluation.passed ? 'var(--success)' : 'var(--warning)' }}>
                {detail.evaluation.passed ? '评估通过' : '建议调整'}
              </div>
            </div>
            {detail.evaluation.dimensions && (
              <div className="lg-quality-kv-list">
                {Object.entries(detail.evaluation.dimensions).map(([key, val]) => (
                  <div key={key} className="lg-quality-kv-row">
                    <span className="lg-quality-kv-label">{mapEvaluationDimensionLabel(key)}</span>
                    <span className="lg-quality-kv-value">{val as number} 分</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {detail.evaluation.suggestions && detail.evaluation.suggestions.length > 0 && (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">tips_and_updates</span>
                优化建议
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {normalizeSuggestions(detail.evaluation.suggestions).map((s: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 竞品分析 */}
      {detail.competitorAnalysis && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">compare_arrows</span>
              竞品分析
            </div>
          </div>
          <div className="info-card full-width">
            <CompetitorAnalysisView data={detail.competitorAnalysis} />
          </div>
        </div>
      )}
    </div>
  );
}

// 大纲 Section 递归渲染
function OutlineSection({ section, index }: { section: any; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const level = section.level || 1;
  const indent = (level - 1) * 20;

  return (
    <div style={{ marginLeft: `${indent}px`, marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
          background: level === 1 ? 'var(--primary-alpha)' : 'transparent',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
          {expanded ? 'expand_more' : 'chevron_right'}
        </span>
        <span style={{
          fontWeight: level === 1 ? 700 : 500,
          fontSize: level === 1 ? '15px' : '14px',
          color: 'var(--text)',
        }}>
          {index}. {section.title}
        </span>
      </div>
      {expanded && section.content && (
        <div style={{
          marginLeft: '32px', marginTop: '4px',
          fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          {section.content}
        </div>
      )}
      {expanded && section.subsections && section.subsections.map((sub: any, j: number) => (
        <OutlineSection key={j} section={{ ...sub, level: (sub.level || level + 1) }} index={j + 1} />
      ))}
    </div>
  );
}

// 竞品分析展示
function CompetitorAnalysisView({ data }: { data: any }) {
  if (!data) return null;

  // 字符串优先尝试解析 JSON，避免把长 JSON 原文直接渲染到页面
  if (typeof data === 'string') {
    const parsed = safeParseJson(data);
    if (parsed !== null) {
      return <CompetitorAnalysisView data={parsed} />;
    }
    return <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{data}</div>;
  }

  if (Array.isArray(data)) {
    return (
      <div className="data-review-table-wrapper">
        <table className="data-review-table">
          <thead>
            <tr>
              <th>竞品</th>
              <th>特点</th>
              <th>差异化机会</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item: any, i: number) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{item.name || item.competitor || `竞品 ${i + 1}`}</td>
                <td>{item.features || item.description || '-'}</td>
                <td>{item.opportunity || item.gap || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Object format
  const reportLikeList = extractReportLikeList(data);
  if (reportLikeList.length > 0) {
    return (
      <div className="data-review-table-wrapper">
        <table className="data-review-table">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>竞品/来源</th>
              <th style={{ width: '48%' }}>摘要</th>
              <th style={{ width: '20%' }}>相关度</th>
            </tr>
          </thead>
          <tbody>
            {reportLikeList.map((item: any, i: number) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>
                  {item.title || item.name || item.source || `条目 ${i + 1}`}
                </td>
                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {item.coreView || item.features || item.description || summarizeObject(item)}
                </td>
                <td>
                  {typeof item.relevance === 'number' ? `${item.relevance}%` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {Object.entries(data).map(([key, val]) => (
        <div key={key} className="info-item">
          <span className="label">{key}</span>
          <span className="value" style={{ maxWidth: '60%', textAlign: 'right' }}>
            {formatValue(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

function safeParseJson(text: string): any | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractReportLikeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function summarizeObject(obj: any): string {
  if (!obj || typeof obj !== 'object') return String(obj ?? '-');
  const keys = Object.keys(obj);
  return `字段: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ' ...' : ''}`;
}

function formatValue(val: any): string {
  if (val == null) return '-';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return `数组(${val.length})`;
  if (typeof val === 'object') return summarizeObject(val);
  return String(val);
}

function mapEvaluationDimensionLabel(key: string): string {
  const labelMap: Record<string, string> = {
    dataAvailability: '数据可得性',
    topicHeat: '选题热度',
    differentiation: '差异化',
    timeliness: '时效性',
    credibility: '可信度',
    novelty: '新颖性',
    audienceFit: '受众匹配',
  };
  return labelMap[key] || key;
}

function normalizeSuggestions(input: any): string[] {
  if (Array.isArray(input)) return input.map(x => String(x)).filter(Boolean);
  if (typeof input === 'string') return [input];
  return [];
}

// Checkpoint 对比面板：side-by-side 展示两个 checkpoint 的状态字段差异
function CheckpointComparePanel({
  history,
  selectedIds,
}: {
  history: LGStateHistoryItem[];
  selectedIds: string[];
}) {
  const cp1 = history.find((h) => (h.checkpoint_id || '') === selectedIds[0]);
  const cp2 = history.find((h) => (h.checkpoint_id || '') === selectedIds[1]);
  if (!cp1 || !cp2) return null;

  const fields: Array<{ key: keyof LGStateHistoryItem['values']; label: string }> = [
    { key: 'currentNode', label: '当前节点' },
    { key: 'status', label: '状态' },
    { key: 'progress', label: '进度 %' },
    { key: 'outlineApproved', label: '大纲已批准' },
    { key: 'reviewPassed', label: '评审通过' },
    { key: 'hasOutline', label: '已生成大纲' },
    { key: 'hasDraft', label: '已生成草稿' },
    { key: 'blueTeamRoundsCount', label: '评审轮数' },
  ];

  const formatVal = (v: any) => {
    if (v === true) return '✓';
    if (v === false) return '✗';
    if (v == null || v === '') return '-';
    return String(v);
  };

  return (
    <div className="info-card full-width" style={{ marginTop: '12px' }}>
      <div className="card-title">
        <span className="material-symbols-outlined">compare_arrows</span>
        Checkpoint 对比
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
        <div style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #3b82f6' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Checkpoint A</div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{cp1.checkpoint_id?.slice(0, 16)}...</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{new Date(cp1.createdAt).toLocaleString('zh-CN')}</div>
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #22c55e' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Checkpoint B</div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{cp2.checkpoint_id?.slice(0, 16)}...</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{new Date(cp2.createdAt).toLocaleString('zh-CN')}</div>
        </div>
      </div>
      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>字段</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#3b82f6', fontWeight: 600 }}>A</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#22c55e', fontWeight: 600 }}>B</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, width: '60px' }}>变更</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const v1 = (cp1.values as any)[f.key];
            const v2 = (cp2.values as any)[f.key];
            const changed = v1 !== v2;
            return (
              <tr
                key={f.key}
                style={{
                  borderBottom: '1px solid var(--divider)',
                  background: changed ? 'hsla(45, 90%, 50%, 0.05)' : undefined,
                }}
              >
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{f.label}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{formatVal(v1)}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{formatVal(v2)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {changed ? (
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>●</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 大纲编辑实时 Diff 面板
function OutlineEditDiffPanel({
  original,
  editedText,
}: {
  original: any[];
  editedText: string;
}) {
  let edited: any[] = [];
  let parseError: string | null = null;
  try {
    if (editedText.trim()) {
      edited = JSON.parse(editedText);
    }
  } catch (e: any) {
    parseError = 'JSON 解析失败：' + (e.message || 'invalid JSON');
  }

  const originalTitles = original.map((s) => s?.title || '').filter(Boolean);
  const editedTitles = edited.map((s) => s?.title || '').filter(Boolean);

  // 计算差异（基于 title 集合）
  const added = editedTitles.filter((t) => !originalTitles.includes(t));
  const removed = originalTitles.filter((t) => !editedTitles.includes(t));
  const kept = editedTitles.filter((t) => originalTitles.includes(t));

  return (
    <div className="panel-grid" style={{ marginTop: '24px' }}>
      <div className="section-header">
        <div className="section-title">
          <span className="material-symbols-outlined">difference</span>
          编辑 Diff
        </div>
        <div className="section-desc">实时显示你的编辑相对原大纲的变化</div>
      </div>
      <div className="info-card full-width">
        {parseError ? (
          <div style={{ color: '#ef4444', fontSize: '12px', padding: '8px' }}>{parseError}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span>
                新增 ({added.length})
              </div>
              {added.length > 0 ? (
                added.map((t, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text)', padding: '4px 6px', background: 'hsla(142, 45%, 45%, 0.08)', borderRadius: '3px', marginBottom: '3px' }}>
                    + {t}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>无</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>remove_circle</span>
                删除 ({removed.length})
              </div>
              {removed.length > 0 ? (
                removed.map((t, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text)', padding: '4px 6px', background: 'hsla(0, 72%, 51%, 0.08)', borderRadius: '3px', marginBottom: '3px' }}>
                    - {t}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>无</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>radio_button_checked</span>
                保留 ({kept.length})
              </div>
              {kept.length > 0 ? (
                kept.slice(0, 5).map((t, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 6px', marginBottom: '3px' }}>
                    {t}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>无</div>
              )}
              {kept.length > 5 && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  以及 {kept.length - 5} 个其他章节...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
