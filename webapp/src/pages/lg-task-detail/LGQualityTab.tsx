// LG Quality Tab - 质量分析
// Pipeline 状态总览 + 评审质量指标 + 草稿质量 + 错误日志

import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';

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

export function LGQualityTab() {
  const { detail, state } = useOutletContext<LGTaskContext>();

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

  return (
    <div className="tab-panel">
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
              {detail.evaluation.dimensions && Object.entries(detail.evaluation.dimensions).map(([key, val]) => (
                <KVRow key={key} label={key} value={String(val as number)} />
              ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>暂无评估数据</p>
          )}
        </div>
      </div>

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
