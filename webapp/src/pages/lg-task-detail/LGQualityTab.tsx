// LG Quality Tab - 质量分析
// Pipeline 状态总览 + 评审质量指标 + 草稿质量 + 热点追踪 + 合规提示 + 错误日志

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { hotTopicsApi, sentimentApi, type HotTopic } from '../../api/client';

// Pipeline 节点定义
const PIPELINE_NODES = [
  { id: 'planner', label: '选题策划', icon: 'lightbulb' },
  { id: 'human_outline', label: '大纲确认', icon: 'person' },
  { id: 'researcher', label: '数据研究', icon: 'search' },
  { id: 'writer', label: '内容写作', icon: 'edit_note' },
  { id: 'blue_team', label: '蓝军评审', icon: 'fact_check' },
  { id: 'human_approve', label: '最终审批', icon: 'gavel' },
  { id: 'output', label: '输出发布', icon: 'publish' },
];

// 维度图标 + 标签映射
const DIMENSION_META: Record<string, { label: string; icon: string; color: string }> = {
  dataAvailability: { label: '数据可用性', icon: 'storage', color: '#3b82f6' },
  topicHeat: { label: '话题热度', icon: 'local_fire_department', color: '#ef4444' },
  differentiation: { label: '差异化', icon: 'auto_awesome', color: '#a855f7' },
  timeliness: { label: '时效性', icon: 'schedule', color: '#22c55e' },
};

export function LGQualityTab() {
  const { detail, state, onRefresh } = useOutletContext<LGTaskContext>();
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [sentiment, setSentiment] = useState<{ positive: number; negative: number; neutral: number } | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(false);

  // 加载热点话题 + 情感分析
  useEffect(() => {
    let cancelled = false;
    setLoadingExtras(true);
    Promise.allSettled([
      hotTopicsApi.getAll({ limit: 5 }).catch(() => ({ items: [] })),
      sentimentApi.getStats().catch(() => null),
    ]).then(([topicsRes, sentimentRes]) => {
      if (cancelled) return;
      if (topicsRes.status === 'fulfilled' && topicsRes.value) {
        setHotTopics((topicsRes.value as any).items || []);
      }
      if (sentimentRes.status === 'fulfilled' && sentimentRes.value) {
        const s = sentimentRes.value as any;
        setSentiment({ positive: s.positive || 0, negative: s.negative || 0, neutral: s.neutral || 0 });
      }
      setLoadingExtras(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const rounds = detail.blueTeamRounds || [];
  const allQuestions = rounds.flatMap((r: any) => r.questions || []);

  // 各 severity 统计
  const severityCounts: Record<string, number> = {};
  allQuestions.forEach((q: any) => {
    severityCounts[q.severity] = (severityCounts[q.severity] || 0) + 1;
  });

  // 各专家角色统计
  const expertCounts: Record<string, number> = {};
  allQuestions.forEach((q: any) => {
    const role = q.expertName || q.role || q.expertId || 'unknown';
    expertCounts[role] = (expertCounts[role] || 0) + 1;
  });

  // 草稿字数
  const draftWordCount = (detail.draftContent || '').replace(/\s/g, '').length;

  // 判断节点状态
  const getNodeStatus = (nodeId: string) => {
    if (!detail.currentNode) return 'pending';
    const currentIdx = PIPELINE_NODES.findIndex(n => n.id === detail.currentNode);
    const nodeIdx = PIPELINE_NODES.findIndex(n => n.id === nodeId);
    if (nodeIdx < currentIdx) return 'completed';
    if (nodeIdx === currentIdx) return 'active';
    return 'pending';
  };

  // Q7: 工具操作栏处理函数
  const handleRefresh = async () => {
    if (onRefresh) {
      await onRefresh();
    }
    // 同时刷新热点和情感
    try {
      const [topicsRes, sentimentRes] = await Promise.allSettled([
        hotTopicsApi.getAll({ limit: 5 }).catch(() => ({ items: [] })),
        sentimentApi.getStats().catch(() => null),
      ]);
      if (topicsRes.status === 'fulfilled' && topicsRes.value) {
        setHotTopics((topicsRes.value as any).items || []);
      }
      if (sentimentRes.status === 'fulfilled' && sentimentRes.value) {
        const s = sentimentRes.value as any;
        setSentiment({ positive: s.positive || 0, negative: s.negative || 0, neutral: s.neutral || 0 });
      }
    } catch {}
  };

  const handleExportReport = () => {
    // 生成质量分析报告 (Markdown)
    const lines: string[] = [];
    lines.push(`# 质量分析报告 — ${detail.topic}`);
    lines.push(`\n生成时间：${new Date().toLocaleString('zh-CN')}\n`);
    lines.push(`## 任务信息`);
    lines.push(`- 任务 ID：${detail.taskId}`);
    lines.push(`- 状态：${detail.status}`);
    lines.push(`- 进度：${detail.progress}%\n`);
    if (detail.evaluation) {
      lines.push(`## 选题评估`);
      lines.push(`- 综合评分：${detail.evaluation.score}`);
      lines.push(`- 评估结果：${detail.evaluation.passed ? '通过' : '建议调整'}`);
      if (detail.evaluation.dimensions) {
        lines.push(`### 维度分析`);
        Object.entries(detail.evaluation.dimensions).forEach(([key, val]) => {
          const meta = DIMENSION_META[key] || { label: key };
          lines.push(`- ${meta.label}：${val}`);
        });
      }
    }
    lines.push(`\n## 草稿质量`);
    lines.push(`- 字数：${draftWordCount.toLocaleString()}`);
    lines.push(`- 修订轮数：${rounds.length}`);
    lines.push(`- 评审结果：${detail.reviewPassed ? '通过' : '修订中'}`);
    if (allQuestions.length > 0) {
      lines.push(`\n## 评审分析`);
      lines.push(`- 总意见数：${allQuestions.length}`);
      Object.entries(severityCounts).forEach(([sev, count]) => {
        lines.push(`- ${sev}：${count}`);
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quality-report-${detail.taskId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tab-panel">
      {/* Q7: 工具操作栏 */}
      <div
        className="info-card full-width"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>analytics</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>质量分析中心</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            实时监控任务各阶段健康度
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleRefresh}
            className="lg-btn lg-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '13px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
            刷新数据
          </button>
          <button
            type="button"
            onClick={handleExportReport}
            className="lg-btn lg-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '13px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
            导出报告
          </button>
        </div>
      </div>

      {/* Pipeline 状态总览 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">timeline</span>
            Pipeline 状态
          </div>
        </div>

        <div className="info-card full-width">
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
            {PIPELINE_NODES.map((node, i) => {
              const status = getNodeStatus(node.id);
              const isLast = i === PIPELINE_NODES.length - 1;
              return (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    padding: '12px 8px', borderRadius: 'var(--radius)',
                    background: status === 'active' ? 'var(--primary-alpha)' : 'transparent',
                    border: status === 'active' ? '1px solid var(--primary)' : '1px solid transparent',
                    minWidth: '80px',
                  }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: '20px',
                      color: status === 'completed' ? 'var(--success)' : status === 'active' ? 'var(--primary)' : 'var(--text-muted)',
                    }}>
                      {status === 'completed' ? 'check_circle' : node.icon}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: status === 'active' ? 700 : 400,
                      color: status === 'completed' ? 'var(--success)' : status === 'active' ? 'var(--primary)' : 'var(--text-muted)',
                    }}>
                      {node.label}
                    </span>
                  </div>
                  {!isLast && (
                    <span className="material-symbols-outlined" style={{
                      fontSize: '16px', color: 'var(--text-muted)', margin: '0 2px',
                    }}>
                      arrow_forward
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 质量指标 */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">analytics</span>
            质量指标
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">description</span>
            草稿质量
          </div>
          <div className="lg-quality-kv-list">
            <KVRow label="字数" value={draftWordCount > 0 ? draftWordCount.toLocaleString() : '-'} highlight />
            <KVRow label="修订轮数" value={String(rounds.length)} />
            <KVRow
              label="评审结果"
              value={detail.reviewPassed ? '通过' : rounds.length > 0 ? '修订中' : '未开始'}
              valueColor={detail.reviewPassed ? 'var(--success)' : 'var(--text-muted)'}
            />
            <KVRow
              label="最终审批"
              value={detail.finalApproved ? '已批准' : '待审批'}
              valueColor={detail.finalApproved ? 'var(--success)' : 'var(--text-muted)'}
            />
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">assessment</span>
            选题评估
          </div>
          {detail.evaluation ? (
            <>
              <div className="lg-quality-kv-list">
                <KVRow label="综合评分" value={`${detail.evaluation.score} 分`} highlight />
                <KVRow
                  label="评估结果"
                  value={detail.evaluation.passed ? '通过' : '建议调整'}
                  valueColor={detail.evaluation.passed ? 'var(--success)' : 'var(--warning, #f59e0b)'}
                />
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>暂无评估数据</p>
          )}
        </div>
      </div>

      {/* 维度分析柱状图 (Q3) */}
      {detail.evaluation?.dimensions && Object.keys(detail.evaluation.dimensions).length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">bar_chart</span>
              维度分析
            </div>
            <div className="section-desc">选题各维度评分（满分 100）</div>
          </div>
          <div className="info-card full-width">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              {Object.entries(detail.evaluation.dimensions).map(([key, val]) => {
                const meta = DIMENSION_META[key] || { label: key, icon: 'analytics', color: '#64748b' };
                const score = Number(val) || 0;
                const pct = Math.min(Math.max(score, 0), 100);
                return (
                  <div key={key} style={{ padding: '12px', borderRadius: 'var(--radius)', background: 'var(--surface-alt)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: meta.color }}>{meta.icon}</span>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{meta.label}</span>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: meta.color }}>{pct}</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', background: meta.color, borderRadius: '4px',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 质量告警 (Q4) */}
      {(() => {
        const alerts: Array<{ type: string; severity: 'high' | 'warning' | 'low'; title: string; suggestion: string; icon: string }> = [];

        if (detail.evaluation && detail.evaluation.score < 60) {
          alerts.push({
            type: 'evaluation',
            severity: 'high',
            title: `选题评分偏低（${detail.evaluation.score} 分）`,
            suggestion: '建议调整选题角度或寻找差异化切入点',
            icon: 'warning',
          });
        }
        if (rounds.length > 0 && (severityCounts['high'] || 0) >= 3) {
          alerts.push({
            type: 'review',
            severity: 'high',
            title: `蓝军评审存在 ${severityCounts['high']} 个严重问题`,
            suggestion: '建议优先处理严重问题再进入下一轮评审',
            icon: 'error',
          });
        }
        if (draftWordCount > 0 && draftWordCount < 2000) {
          alerts.push({
            type: 'quality',
            severity: 'warning',
            title: `草稿字数偏少（${draftWordCount} 字）`,
            suggestion: '建议补充内容至 5000 字以上以达到深度报告标准',
            icon: 'format_size',
          });
        }
        if (detail.errors && detail.errors.length > 0) {
          alerts.push({
            type: 'freshness',
            severity: 'high',
            title: `Pipeline 存在 ${detail.errors.length} 个错误`,
            suggestion: '请查看下方错误日志并尝试重启相应阶段',
            icon: 'bug_report',
          });
        }
        if (detail.reviewPassed && !detail.finalApproved) {
          alerts.push({
            type: 'info',
            severity: 'low',
            title: '内容已通过评审，等待最终审批',
            suggestion: '请前往蓝军评审 Tab 完成最终审批',
            icon: 'info',
          });
        }

        if (alerts.length === 0) return null;

        const severityColors = { high: '#ef4444', warning: '#f59e0b', low: '#3b82f6' };

        return (
          <div className="panel-grid" style={{ marginTop: '24px' }}>
            <div className="section-header">
              <div className="section-title">
                <span className="material-symbols-outlined">notifications_active</span>
                质量告警
              </div>
              <div className="section-desc">{alerts.length} 项需要关注</div>
            </div>
            <div className="info-card full-width">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: `3px solid ${severityColors[alert.severity]}`,
                      background: `${severityColors[alert.severity]}08`,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: severityColors[alert.severity] }}>
                      {alert.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--warning, #f59e0b)' }}>
                          lightbulb
                        </span>
                        {alert.suggestion}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 评审质量详情 */}
      {allQuestions.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">pie_chart</span>
              评审分析
            </div>
          </div>

          <div className="info-card">
            <div className="card-title">
              <span className="material-symbols-outlined">warning</span>
              问题严重度分布
            </div>
            {Object.entries(severityCounts).map(([severity, count]) => {
              const total = allQuestions.length;
              const pct = Math.round((count / total) * 100);
              const colorMap: Record<string, string> = {
                high: '#ef4444', medium: '#f59e0b', low: '#3b82f6', praise: '#22c55e',
              };
              const labelMap: Record<string, string> = {
                high: '严重', medium: '中等', low: '轻微', praise: '优点',
              };
              return (
                <div key={severity} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{labelMap[severity] || severity}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: colorMap[severity] || 'var(--text)' }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--surface-alt)', borderRadius: '3px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: colorMap[severity] || 'var(--text-muted)', borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="info-card">
            <div className="card-title">
              <span className="material-symbols-outlined">group</span>
              专家贡献
            </div>
            {Object.entries(expertCounts).map(([role, count]) => (
              <KVRow key={role} label={role} value={`${count} 条意见`} />
            ))}
          </div>
        </div>
      )}

      {/* 错误日志 */}
      {detail.errors && detail.errors.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title" style={{ color: 'var(--danger, #ef4444)' }}>
              <span className="material-symbols-outlined">error_outline</span>
              错误日志 ({detail.errors.length})
            </div>
          </div>
          <div className="info-card full-width" style={{ borderColor: 'hsla(0, 72%, 51%, 0.3)' }}>
            {detail.errors.map((err: string, i: number) => (
              <div key={i} style={{
                padding: '10px 12px', borderBottom: i < detail.errors.length - 1 ? '1px solid var(--divider)' : 'none',
                fontSize: '13px', color: 'var(--danger, #ef4444)',
                fontFamily: 'monospace',
              }}>
                <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>#{i + 1}</span>
                {err}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 质量健康检查计分卡 */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">health_and_safety</span>
            质量健康检查
          </div>
        </div>
        <div className="info-card full-width">
          {(() => {
            const checks = [
              {
                label: '大纲完整性',
                passed: !!(detail.outline && detail.outline.sections && detail.outline.sections.length > 0),
                detail: detail.outline?.sections ? `${detail.outline.sections.length} 个章节` : '未生成',
              },
              {
                label: '选题评估通过',
                passed: detail.evaluation?.passed === true,
                detail: detail.evaluation ? `${detail.evaluation.score} 分` : '未评估',
              },
              {
                label: '研究数据充足',
                passed: !!(detail.researchData?.dataPackage && (Array.isArray(detail.researchData.dataPackage) ? detail.researchData.dataPackage.length : Object.keys(detail.researchData.dataPackage).length) >= 3),
                detail: detail.researchData?.dataPackage ? `${Array.isArray(detail.researchData.dataPackage) ? detail.researchData.dataPackage.length : Object.keys(detail.researchData.dataPackage).length} 个来源` : '未采集',
              },
              {
                label: '草稿字数达标',
                passed: draftWordCount >= 3000,
                detail: draftWordCount > 0 ? `${draftWordCount.toLocaleString()} 字` : '未生成',
              },
              {
                label: '评审无严重问题',
                passed: rounds.length > 0 && (severityCounts['high'] || 0) === 0,
                detail: rounds.length > 0 ? `${severityCounts['high'] || 0} 个严重问题` : '未评审',
              },
              {
                label: '最终审批',
                passed: detail.finalApproved === true,
                detail: detail.finalApproved ? '已批准' : '待审批',
              },
            ];
            const passedCount = checks.filter(c => c.passed).length;
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: passedCount === checks.length ? 'var(--success)' : passedCount >= 4 ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)',
                    color: '#fff', fontSize: '18px', fontWeight: 800,
                  }}>
                    {passedCount}/{checks.length}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                      {passedCount === checks.length ? '全部通过' : passedCount >= 4 ? '基本达标' : '需要改进'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{passedCount} / {checks.length} 项检查通过</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {checks.map((check, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: i < checks.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: check.passed ? 'var(--success)' : 'var(--text-muted)' }}>
                        {check.passed ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span style={{ flex: 1, fontSize: '13px', color: check.passed ? 'var(--text)' : 'var(--text-muted)' }}>{check.label}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{check.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 情感分析 + 热点追踪 */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">trending_up</span>
            市场情报
          </div>
        </div>

        {/* 情感分析 */}
        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">sentiment_satisfied</span>
            市场情感指数
          </div>
          {sentiment ? (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {[
                  { label: '积极', value: sentiment.positive, color: '#22c55e' },
                  { label: '中性', value: sentiment.neutral, color: '#64748b' },
                  { label: '消极', value: sentiment.negative, color: '#ef4444' },
                ].map(item => {
                  const total = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
                  const pct = Math.round((item.value / total) * 100);
                  return (
                    <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 'var(--radius-sm)', background: `${item.color}10` }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: item.color }}>{pct}%</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {loadingExtras ? '加载中...' : '暂无情感数据'}
            </p>
          )}
        </div>

        {/* 热点追踪 */}
        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">local_fire_department</span>
            热点话题
          </div>
          {hotTopics.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {hotTopics.map((topic: any, i: number) => (
                <div key={topic.id || i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: i < hotTopics.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', width: '20px' }}>#{i + 1}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>{topic.name || topic.topic || topic.title}</span>
                  {topic.trend && (
                    <span className="material-symbols-outlined" style={{
                      fontSize: '16px',
                      color: topic.trend === 'up' ? '#22c55e' : topic.trend === 'down' ? '#ef4444' : '#64748b',
                    }}>
                      {topic.trend === 'up' ? 'trending_up' : topic.trend === 'down' ? 'trending_down' : 'trending_flat'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {loadingExtras ? '加载中...' : '暂无热点数据'}
            </p>
          )}
        </div>
      </div>

      {/* 智能优化建议 */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">tips_and_updates</span>
            智能优化建议
          </div>
        </div>
        <div className="info-card full-width">
          {(() => {
            const suggestions: Array<{ area: string; suggestion: string; priority: 'high' | 'medium' | 'low'; icon: string }> = [];

            if (!detail.outline || !detail.outline.sections?.length) {
              suggestions.push({ area: '大纲', suggestion: '任务尚未生成大纲，建议进入选题策划阶段', priority: 'high', icon: 'article' });
            }
            if (detail.evaluation && detail.evaluation.score < 70) {
              suggestions.push({ area: '选题', suggestion: `选题评分 ${detail.evaluation.score} 分较低，建议优化选题角度或寻找差异化切入点`, priority: 'high', icon: 'assessment' });
            }
            if (!detail.researchData?.dataPackage || (Array.isArray(detail.researchData.dataPackage) && detail.researchData.dataPackage.length < 3)) {
              suggestions.push({ area: '研究', suggestion: '数据来源不足，建议补充更多研究素材以提升可信度', priority: 'medium', icon: 'search' });
            }
            if (draftWordCount > 0 && draftWordCount < 3000) {
              suggestions.push({ area: '篇幅', suggestion: `当前字数 ${draftWordCount.toLocaleString()}，建议补充至 5000-8000 字以达到深度报告标准`, priority: 'medium', icon: 'format_size' });
            }
            if ((severityCounts['high'] || 0) > 0) {
              suggestions.push({ area: '评审', suggestion: `仍有 ${severityCounts['high']} 个严重问题未解决，建议在下一轮修订中重点处理`, priority: 'high', icon: 'error' });
            }
            if (rounds.length === 0 && draftWordCount > 0) {
              suggestions.push({ area: '评审', suggestion: '草稿已生成但尚未经过蓝军评审，等待 Pipeline 自动进入评审阶段', priority: 'low', icon: 'fact_check' });
            }
            if (detail.reviewPassed && !detail.finalApproved) {
              suggestions.push({ area: '审批', suggestion: '评审已通过，建议尽快完成最终审批以发布内容', priority: 'medium', icon: 'gavel' });
            }

            if (suggestions.length === 0) {
              suggestions.push({ area: '状态', suggestion: '当前各项指标良好，继续保持', priority: 'low', icon: 'check_circle' });
            }

            const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
            const priorityLabels = { high: '高', medium: '中', low: '低' };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < suggestions.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: priorityColors[s.priority], marginTop: '1px' }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{s.area}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: `${priorityColors[s.priority]}15`, color: priorityColors[s.priority] }}>
                          {priorityLabels[s.priority]}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{s.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* LangGraph 状态信息 */}
      {state && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">developer_mode</span>
              Graph 状态
            </div>
          </div>
          <div className="info-card full-width">
            <div className="lg-quality-kv-list">
              <KVRow label="Next Nodes" value={state.next?.join(', ') || 'none'} mono />
              <KVRow label="Max Review Rounds" value={String(state.values?.maxReviewRounds || '-')} />
              <KVRow label="Current Review Round" value={String(state.values?.currentReviewRound || 0)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KVRow({
  label,
  value,
  mono,
  highlight,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="lg-quality-kv-row">
      <div className="lg-quality-kv-label">{label}</div>
      <div
        className={`lg-quality-kv-value ${mono ? 'mono' : ''} ${highlight ? 'highlight' : ''}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
