// LG Research Tab - 深度研究
// 数据包展示 + 分析摘要 + 关键洞察

import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';

export function LGResearchTab() {
  const { detail } = useOutletContext<LGTaskContext>();

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const research = detail.researchData;
  const dataPackage = normalizeDataPackage(research?.dataPackage);

  if (!research) {
    return (
      <div className="tab-panel">
        <div className="info-card full-width" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>
            hourglass_empty
          </span>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>研究阶段尚未启动</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            请先在「选题策划」中确认大纲，Pipeline 将自动进入研究阶段
          </p>
          <div className="lg-progress-bar" style={{ maxWidth: '300px', margin: '16px auto 0', height: '4px', borderRadius: '2px' }}>
            <div className="lg-progress-fill" style={{ width: `${detail.progress || 0}%`, height: '100%', borderRadius: '2px' }} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>当前进度: {detail.progress || 0}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      {/* 分析摘要 */}
      {research.analysis && (
        <div className="panel-grid">
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">summarize</span>
              研究分析
            </div>
          </div>

          <div className="info-card full-width">
            <div className="card-title">
              <span className="material-symbols-outlined">description</span>
              摘要
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.7 }}>
              {research.analysis.summary || '暂无摘要'}
            </p>
          </div>

          {research.analysis.keyFindings && research.analysis.keyFindings.length > 0 && (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">lightbulb</span>
                关键发现
              </div>
              <ol style={{ margin: 0, paddingLeft: '20px' }}>
                {research.analysis.keyFindings.map((finding: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                    {finding}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {research.analysis.gaps && research.analysis.gaps.length > 0 && (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">warning</span>
                研究空白
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {research.analysis.gaps.map((gap: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--warning, #f59e0b)', marginBottom: '8px' }}>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 数据包 */}
      {dataPackage.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">storage</span>
              数据来源 ({dataPackage.length})
            </div>
          </div>

          <div className="info-card full-width">
            <div className="data-review-table-wrapper">
              <table className="data-review-table">
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>来源</th>
                    <th style={{ width: '80px' }}>类型</th>
                    <th>内容摘要</th>
                    <th style={{ width: '100px' }}>可靠度</th>
                  </tr>
                </thead>
                <tbody>
                  {dataPackage.map((item: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{item.source || '未知'}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 'var(--radius-full)',
                          fontSize: '11px', fontWeight: 600,
                          background: 'var(--primary-alpha)', color: 'var(--primary)',
                        }}>
                          {item.type || 'data'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                        {formatDataPackageContent(item)}
                      </td>
                      <td>
                        <ReliabilityBar value={item.reliability} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 关键洞察 */}
      {research.insights && research.insights.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">psychology</span>
              关键洞察 ({research.insights.length})
            </div>
          </div>

          {research.insights.map((insight: any, i: number) => (
            <div key={i} className="info-card lg-insight-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 'var(--radius-full)',
                  fontSize: '11px', fontWeight: 600,
                  background: getInsightColor(insight.type).bg,
                  color: getInsightColor(insight.type).text,
                }}>
                  {insight.type || 'insight'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  置信度: {Math.round((insight.confidence || 0) * 100)}%
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                {insight.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReliabilityBar({ value }: { value?: number }) {
  const raw = typeof value === 'number' ? value : 0;
  const pct = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--surface-alt)', borderRadius: '2px', minWidth: '40px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

function getInsightColor(type: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    trend: { bg: 'hsla(199, 89%, 48%, 0.1)', text: 'var(--info, #3b82f6)' },
    risk: { bg: 'hsla(0, 72%, 51%, 0.1)', text: 'var(--danger, #ef4444)' },
    opportunity: { bg: 'hsla(142, 45%, 45%, 0.1)', text: 'var(--success)' },
    data: { bg: 'hsla(270, 50%, 50%, 0.1)', text: '#8b5cf6' },
  };
  return map[type] || { bg: 'var(--surface-alt)', text: 'var(--text-secondary)' };
}

function normalizeDataPackage(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'object') {
    return Object.entries(input).map(([key, value]) => ({
      source: key,
      type: inferTypeFromKey(key),
      content: value,
    }));
  }
  return [{ source: 'raw', type: 'text', content: input }];
}

function inferTypeFromKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('report')) return 'report';
  if (k.includes('news')) return 'news';
  if (k.includes('web')) return 'web';
  return 'data';
}

function formatDataPackageContent(item: any): string {
  const content = item?.content;
  if (content == null) return '-';
  if (typeof content === 'string') {
    const parsed = safeParseJson(content);
    if (parsed !== null) return summarizeStructuredContent(parsed);
    return truncate(content);
  }
  if (typeof content === 'object') {
    return summarizeStructuredContent(content);
  }
  return String(content);
}

function summarizeStructuredContent(value: any): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '空数组';
    if (typeof value[0] === 'object' && value[0] !== null) {
      const previews = value.slice(0, 3).map((x: any) => x.title || x.name || x.id || '未命名条目');
      const suffix = value.length > 3 ? ` 等 ${value.length} 条` : ` 共 ${value.length} 条`;
      return `${previews.join(' / ')}${suffix}`;
    }
    return `${value.slice(0, 5).join(', ')}${value.length > 5 ? ' ...' : ''}`;
  }
  if (value && typeof value === 'object') {
    // 处理常见的 reports 结构：{ reports: [...] }
    if (Array.isArray((value as any).reports)) {
      return summarizeStructuredContent((value as any).reports);
    }
    const keys = Object.keys(value);
    return `对象字段: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ' ...' : ''}`;
  }
  return truncate(String(value));
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

function truncate(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
