// LG Overview Tab - 概览
// 显示 Pipeline 状态、任务元信息、选题评估、错误信息

import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { GraphVisualization } from '../../components/GraphVisualization';

export function LGOverviewTab() {
  const { detail, state, graphData, pendingAction, onResume, resuming, onRefresh } = useOutletContext<LGTaskContext>();

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  return (
    <div className="tab-panel">
      {/* Graph 可视化 */}
      {graphData && (
        <div className="info-card full-width" style={{ marginBottom: '24px' }}>
          <div className="card-title">
            <span className="material-symbols-outlined">account_tree</span>
            Pipeline 流程图
          </div>
          <GraphVisualization
            mermaidCode={graphData.graph}
            currentNode={detail.currentNode}
          />
        </div>
      )}

      {/* 任务元信息 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">info</span>
            任务信息
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">fingerprint</span>
            标识信息
          </div>
          <div className="info-item">
            <span className="label">Thread ID</span>
            <span className="value lg-mono-id">{detail.threadId || '-'}</span>
          </div>
          <div className="info-item">
            <span className="label">Task ID</span>
            <span className="value lg-mono-id">{detail.taskId || '-'}</span>
          </div>
          <div className="info-item">
            <span className="label">当前节点</span>
            <span className="value highlight">{formatNodeName(detail.currentNode)}</span>
          </div>
          <div className="info-item">
            <span className="label">进度</span>
            <span className="value highlight">{detail.progress}%</span>
          </div>
        </div>

        <div className="info-card">
          <div className="card-title">
            <span className="material-symbols-outlined">check_circle</span>
            状态检查点
          </div>
          <div className="info-item">
            <span className="label">大纲确认</span>
            <span className="value">{detail.outlineApproved ? '已确认' : '待确认'}</span>
          </div>
          <div className="info-item">
            <span className="label">评审通过</span>
            <span className="value">{detail.reviewPassed ? '通过' : '未通过'}</span>
          </div>
          <div className="info-item">
            <span className="label">评审轮数</span>
            <span className="value">{detail.blueTeamRounds?.length || 0} 轮</span>
          </div>
          <div className="info-item">
            <span className="label">最终审批</span>
            <span className="value">{detail.finalApproved ? '已批准' : '待审批'}</span>
          </div>
        </div>
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
          <div className="info-card full-width">
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '16px' }}>
              <div className="score-circle" style={{ width: '80px', height: '80px', flexShrink: 0 }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>{detail.evaluation.score}</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>分</span>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: detail.evaluation.passed ? 'var(--success)' : 'var(--warning)' }}>
                  {detail.evaluation.passed ? '评估通过' : '建议调整'}
                </div>
                {detail.evaluation.suggestions && detail.evaluation.suggestions.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {detail.evaluation.suggestions.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {detail.evaluation.dimensions && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                {Object.entries(detail.evaluation.dimensions).map(([key, val]) => (
                  <div key={key} style={{ padding: '12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{key}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary)' }}>{val as number}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 人工交互提示 */}
      {pendingAction && (
        <div className="lg-action-panel" style={{ marginTop: '24px' }}>
          <h3 className="lg-action-title">
            {pendingAction === 'outline_review' ? '待确认大纲' : '待最终审批'}
          </h3>
          <p className="lg-action-desc">
            {pendingAction === 'outline_review'
              ? '请前往「选题策划」Tab 查看大纲详情并确认'
              : '请前往「蓝军评审」Tab 查看评审结果并最终审批'
            }
          </p>
        </div>
      )}

      {/* 错误信息 */}
      {detail.errors && detail.errors.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title" style={{ color: 'var(--danger, #ef4444)' }}>
              <span className="material-symbols-outlined">error</span>
              错误信息
            </div>
          </div>
          {detail.errors.map((err: string, i: number) => (
            <div key={i} className="info-card" style={{ borderColor: 'var(--danger, #ef4444)', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--danger, #ef4444)' }}>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* 刷新按钮 */}
      <div style={{ marginTop: '24px', textAlign: 'right' }}>
        <button className="lg-btn lg-btn-secondary" onClick={onRefresh}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
          刷新数据
        </button>
      </div>
    </div>
  );
}

function formatNodeName(node?: string): string {
  const map: Record<string, string> = {
    planner: '选题策划',
    human_outline: '大纲确认',
    researcher: '数据研究',
    writer: '内容写作',
    blue_team: '蓝军评审',
    human_approve: '最终审批',
    output: '输出发布',
  };
  return node ? (map[node] || node) : '-';
}
