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
            <span className="material-icons-outlined">timeline</span>
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
                    <span className="material-icons-outlined" style={{
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
                    <span className="material-icons-outlined" style={{
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
            <span className="material-icons-outlined">analytics</span>
            质量指标
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-icons-outlined">description</span>
            草稿质量
          </div>
          <div className="info-item">
            <span className="label">字数</span>
            <span className="value highlight">{draftWordCount > 0 ? draftWordCount.toLocaleString() : '-'}</span>
          </div>
          <div className="info-item">
            <span className="label">修订轮数</span>
            <span className="value">{rounds.length}</span>
          </div>
          <div className="info-item">
            <span className="label">评审结果</span>
            <span className="value" style={{ color: detail.reviewPassed ? 'var(--success)' : 'var(--text-muted)' }}>
              {detail.reviewPassed ? '通过' : rounds.length > 0 ? '修订中' : '未开始'}
            </span>
          </div>
          <div className="info-item">
            <span className="label">最终审批</span>
            <span className="value" style={{ color: detail.finalApproved ? 'var(--success)' : 'var(--text-muted)' }}>
              {detail.finalApproved ? '已批准' : '待审批'}
            </span>
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-icons-outlined">assessment</span>
            选题评估
          </div>
          {detail.evaluation ? (
            <>
              <div className="info-item">
                <span className="label">综合评分</span>
                <span className="value highlight">{detail.evaluation.score} 分</span>
              </div>
              <div className="info-item">
                <span className="label">评估结果</span>
                <span className="value" style={{ color: detail.evaluation.passed ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
                  {detail.evaluation.passed ? '通过' : '建议调整'}
                </span>
              </div>
              {detail.evaluation.dimensions && Object.entries(detail.evaluation.dimensions).map(([key, val]) => (
                <div key={key} className="info-item">
                  <span className="label">{key}</span>
                  <span className="value">{val as number}</span>
                </div>
              ))}
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
              <span className="material-icons-outlined">pie_chart</span>
              评审分析
            </div>
          </div>

          <div className="info-card">
            <div className="card-title">
              <span className="material-icons-outlined">warning</span>
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
              <span className="material-icons-outlined">group</span>
              专家贡献
            </div>
            {Object.entries(expertCounts).map(([role, count]) => (
              <div key={role} className="info-item">
                <span className="label">{role}</span>
                <span className="value">{count} 条意见</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 错误日志 */}
      {detail.errors && detail.errors.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title" style={{ color: 'var(--danger, #ef4444)' }}>
              <span className="material-icons-outlined">error_outline</span>
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
              <span className="material-icons-outlined">developer_mode</span>
              Graph 状态
            </div>
          </div>
          <div className="info-card full-width">
            <div className="info-item">
              <span className="label">Next Nodes</span>
              <span className="value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                {state.next?.join(', ') || 'none'}
              </span>
            </div>
            <div className="info-item">
              <span className="label">Max Review Rounds</span>
              <span className="value">{state.values?.maxReviewRounds || '-'}</span>
            </div>
            <div className="info-item">
              <span className="label">Current Review Round</span>
              <span className="value">{state.values?.currentReviewRound || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
