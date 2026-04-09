// LG Writing Tab - 文稿生成
// 草稿 Markdown 预览 + 字数统计 + 多轮修订对比

import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { LivePreviewMarkdown } from '../../components/content/LivePreviewMarkdown';
import { complianceApi, type ComplianceCheckResult } from '../../api/client';

// 导出工具
function exportMarkdown(content: string, topic: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${topic || 'draft'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHTML(content: string, topic: string) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${topic}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8;color:#333}
h1,h2,h3{color:#1a1a1a}blockquote{border-left:3px solid #D46648;padding-left:16px;color:#666}</style>
</head><body><h1>${topic}</h1><article>${content}</article></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${topic || 'report'}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LGWritingTab() {
  const { detail } = useOutletContext<LGTaskContext>();
  const navigate = useNavigate();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [showRefs, setShowRefs] = useState(false);
  const [complianceResult, setComplianceResult] = useState<ComplianceCheckResult | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const draftContent = detail.draftContent;
  const blueTeamRounds = detail.blueTeamRounds || [];

  if (!draftContent) {
    return (
      <div className="tab-panel">
        <div className="info-card full-width" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>
            edit_note
          </span>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>草稿尚未生成</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            完成研究阶段后，Pipeline 将自动进入写作阶段
          </p>
          <div className="lg-progress-bar" style={{ maxWidth: '300px', margin: '16px auto 0', height: '4px', borderRadius: '2px' }}>
            <div className="lg-progress-fill" style={{ width: `${detail.progress || 0}%`, height: '100%', borderRadius: '2px' }} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>当前进度: {detail.progress || 0}%</span>
        </div>
      </div>
    );
  }

  // 当前展示的内容：选中的修订轮次 或 最终草稿
  const displayContent = selectedRound !== null
    ? (blueTeamRounds[selectedRound]?.revisionContent || draftContent)
    : draftContent;

  const wordCount = displayContent.replace(/\s/g, '').length;

  return (
    <div className="tab-panel">
      {/* 草稿统计 */}
      <div className="panel-grid" style={{ marginBottom: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">edit_note</span>
            文稿内容
          </div>
          <div className="section-desc">
            {blueTeamRounds.length > 0
              ? `经过 ${blueTeamRounds.length} 轮蓝军评审修订`
              : '初稿'
            }
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">analytics</span>
            文稿统计
          </div>
          <div className="info-item">
            <span className="label">字数</span>
            <span className="value highlight">{wordCount.toLocaleString()}</span>
          </div>
          <div className="info-item">
            <span className="label">修订轮数</span>
            <span className="value">{blueTeamRounds.length}</span>
          </div>
          <div className="info-item">
            <span className="label">评审状态</span>
            <span className="value" style={{ color: detail.reviewPassed ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
              {detail.reviewPassed ? '已通过' : '审核中'}
            </span>
          </div>
        </div>

        {/* 版本选择器 */}
        {blueTeamRounds.length > 0 && (
          <div className="info-card">
            <div className="card-title">
              <span className="material-symbols-outlined">history</span>
              版本历史
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                onClick={() => setSelectedRound(null)}
                style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  border: selectedRound === null ? '2px solid var(--primary)' : '1px solid var(--divider)',
                  background: selectedRound === null ? 'var(--primary-alpha)' : 'var(--surface)',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  fontSize: '13px', fontWeight: selectedRound === null ? 600 : 400,
                }}
              >
                最终版本（当前）
              </button>
              {blueTeamRounds.map((round: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setSelectedRound(i)}
                  style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    border: selectedRound === i ? '2px solid var(--primary)' : '1px solid var(--divider)',
                    background: selectedRound === i ? 'var(--primary-alpha)' : 'var(--surface)',
                    color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                    fontSize: '13px', fontWeight: selectedRound === i ? 600 : 400,
                  }}
                >
                  第 {round.round} 轮修订
                  {round.revisionSummary && (
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {round.revisionSummary.substring(0, 60)}{round.revisionSummary.length > 60 ? '...' : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 资产引用面板 */}
      <div className="info-card full-width" style={{ marginBottom: '24px' }}>
        <div className="card-title" style={{ cursor: 'pointer' }} onClick={() => setShowRefs(!showRefs)}>
          <span className="material-symbols-outlined">inventory_2</span>
          写作参考资产
          <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: '18px', color: 'var(--text-muted)' }}>
            {showRefs ? 'expand_less' : 'expand_more'}
          </span>
        </div>
        {showRefs && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Outline Reference */}
            {detail.outline && (
              <div style={{ padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>article</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                    已确认大纲 ({detail.outline.sections?.length || 0} 个章节)
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('../planning')}>查看</span>
                </div>
                {detail.outline.sections?.slice(0, 3).map((s: any, i: number) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '22px' }}>
                    {i + 1}. {s.title}
                  </div>
                ))}
              </div>
            )}

            {/* Research Insights Reference */}
            {detail.researchData?.insights && detail.researchData.insights.length > 0 && (
              <div style={{ padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--secondary, #8A9A5B)' }}>psychology</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                    研究洞察 ({detail.researchData.insights.length} 条)
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('../research')}>查看</span>
                </div>
                {detail.researchData.insights.slice(0, 3).map((insight: any, i: number) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '22px', marginBottom: '4px' }}>
                    <span style={{
                      padding: '0 4px', borderRadius: '2px', fontSize: '10px', fontWeight: 600, marginRight: '4px',
                      background: insight.type === 'trend' ? 'hsla(199,89%,48%,0.1)' : insight.type === 'risk' ? 'hsla(0,72%,51%,0.1)' : 'var(--primary-alpha)',
                      color: insight.type === 'trend' ? '#3b82f6' : insight.type === 'risk' ? '#ef4444' : 'var(--primary)',
                    }}>{insight.type}</span>
                    {insight.content?.substring(0, 50)}...
                  </div>
                ))}
              </div>
            )}

            {/* Data sources count */}
            {detail.researchData?.dataPackage && (
              <div style={{ padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent, #C5A572)' }}>source</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                    数据来源 ({(Array.isArray(detail.researchData.dataPackage) ? detail.researchData.dataPackage : []).length} 个)
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('../research')}>查看</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 合规检查 */}
      <div className="info-card full-width" style={{ marginBottom: '24px' }}>
        <div className="card-title">
          <span className="material-symbols-outlined">verified_user</span>
          合规检查
          <button
            className="lg-btn lg-btn-secondary"
            style={{ marginLeft: 'auto', fontSize: '11px', padding: '4px 10px' }}
            onClick={async () => {
              if (!detail.taskId || !displayContent) return;
              setCheckingCompliance(true);
              try {
                const result = await complianceApi.checkContent(detail.taskId, displayContent.substring(0, 5000));
                setComplianceResult(result);
              } catch (err: any) {
                setComplianceResult({ score: 0, status: 'error', issues: [{ type: 'error', severity: 'medium', description: err.message || '检查失败', suggestion: '请稍后重试' }] } as any);
              } finally {
                setCheckingCompliance(false);
              }
            }}
            disabled={checkingCompliance || !displayContent}
          >
            {checkingCompliance ? '检查中...' : '执行检查'}
          </button>
        </div>
        {complianceResult ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: (complianceResult.score ?? 0) >= 80 ? 'var(--success)' : (complianceResult.score ?? 0) >= 60 ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)',
                color: '#fff', fontSize: '16px', fontWeight: 800,
              }}>
                {complianceResult.score ?? '?'}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                  {complianceResult.status === 'compliant' ? '合规通过' : complianceResult.status === 'warning' ? '存在风险' : '需要修正'}
                </div>
              </div>
            </div>
            {complianceResult.issues && complianceResult.issues.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {complianceResult.issues.map((issue: any, i: number) => {
                  const sevColors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
                  return (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${sevColors[issue.severity] || '#64748b'}`, background: 'var(--surface-alt)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: `${sevColors[issue.severity] || '#64748b'}15`, color: sevColors[issue.severity] || '#64748b' }}>
                          {issue.severity === 'high' ? '高风险' : issue.severity === 'medium' ? '中风险' : '低风险'}
                        </span>
                        {issue.type && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{issue.type}</span>}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text)', margin: '0 0 4px' }}>{issue.description}</p>
                      {issue.suggestion && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>建议: {issue.suggestion}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>点击「执行检查」对当前草稿进行合规分析</p>
        )}
      </div>

      {/* Markdown 预览 */}
      <LivePreviewMarkdown
        title={selectedRound !== null ? `第 ${blueTeamRounds[selectedRound]?.round || '?'} 轮修订稿` : '最终草稿'}
        content={displayContent}
        showHeader={true}
        minHeight="500px"
        footerActions={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 0' }}>
            <button className="lg-btn lg-btn-secondary" onClick={() => exportMarkdown(displayContent, detail.topic || '')}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>download</span>
              导出 Markdown
            </button>
            <button className="lg-btn lg-btn-primary" onClick={() => exportHTML(displayContent, detail.topic || '')}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>download</span>
              导出 HTML
            </button>
          </div>
        }
        showFooter={true}
      />
    </div>
  );
}
