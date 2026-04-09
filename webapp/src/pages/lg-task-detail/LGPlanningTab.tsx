// LG Planning Tab - 选题策划
// 大纲结构化展示 + 选题评估 + 竞品分析 + 人工确认面板

import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';

export function LGPlanningTab() {
  const { detail, pendingAction, onResume, resuming } = useOutletContext<LGTaskContext>();
  const [feedback, setFeedback] = useState('');

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const handleConfirm = async () => {
    await onResume(true, feedback);
    setFeedback('');
  };

  const handleReject = async () => {
    await onResume(false, feedback);
    setFeedback('');
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
            <button className="lg-btn lg-btn-danger" onClick={handleReject} disabled={resuming}>
              {resuming ? '处理中...' : '退回修改'}
            </button>
            <button className="lg-btn lg-btn-primary" onClick={handleConfirm} disabled={resuming}>
              {resuming ? '处理中...' : '确认大纲'}
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
