// LG Overview Tab - 概览
// 显示 Pipeline 状态、任务元信息、选题评估、错误信息

import { useOutletContext, useNavigate } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { GraphVisualization } from '../../components/GraphVisualization';

export function LGOverviewTab() {
  const { detail, state, graphData, pendingAction, onResume, resuming, onRefresh } = useOutletContext<LGTaskContext>();
  const navigate = useNavigate();

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

      {/* 大纲摘要 + 蓝军评审概览 */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        {/* 大纲摘要预览 */}
        {detail.outline && detail.outline.sections && detail.outline.sections.length > 0 && (
          <div className="info-card">
            <div className="card-title">
              <span className="material-symbols-outlined">article</span>
              大纲摘要
              <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 400, color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('../planning')}>
                查看详情
              </span>
            </div>
            {detail.outline.title && (
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>
                {detail.outline.title}
              </div>
            )}
            {detail.outline.sections.slice(0, 3).map((section: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px', paddingLeft: `${(section.level || 1) * 8}px` }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary)', marginTop: '2px' }}>
                  {i === 0 ? 'looks_one' : i === 1 ? 'looks_two' : 'looks_3'}
                </span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{section.title}</div>
                  {section.content && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {section.content.substring(0, 60)}{section.content.length > 60 ? '...' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {detail.outline.sections.length > 3 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '8px' }}>
                +{detail.outline.sections.length - 3} 更多章节...
              </div>
            )}
          </div>
        )}

        {/* 蓝军评审概览 */}
        {(() => {
          const rounds = detail.blueTeamRounds || [];
          const allQuestions = rounds.flatMap((r: any) => r.questions || []);
          if (allQuestions.length === 0 && rounds.length === 0) return null;

          const highCount = allQuestions.filter((q: any) => q.severity === 'high').length;
          const mediumCount = allQuestions.filter((q: any) => q.severity === 'medium').length;
          const praiseCount = allQuestions.filter((q: any) => q.severity === 'praise').length;

          return (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">fact_check</span>
                蓝军评审概览
                <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 400, color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('../reviews')}>
                  查看详情
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div style={{ textAlign: 'center', flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'hsla(0, 72%, 51%, 0.08)' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{highCount}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>严重</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'hsla(30, 80%, 50%, 0.08)' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>{mediumCount}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>中等</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'hsla(142, 45%, 45%, 0.08)' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e' }}>{praiseCount}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>优点</div>
                </div>
              </div>
              <div className="info-item">
                <span className="label">评审轮数</span>
                <span className="value">{rounds.length} 轮 / {allQuestions.length} 条意见</span>
              </div>
              <div className="info-item">
                <span className="label">结果</span>
                <span className="value" style={{ color: detail.reviewPassed ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
                  {detail.reviewPassed ? '评审通过' : '修订中'}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 快捷操作 */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">bolt</span>
            快捷操作
          </div>
        </div>
        <div className="info-card full-width">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="lg-btn lg-btn-secondary" onClick={() => navigate('../planning')}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>lightbulb</span>
              选题策划
            </button>
            <button className="lg-btn lg-btn-secondary" onClick={() => navigate('../research')}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>search</span>
              深度研究
            </button>
            <button className="lg-btn lg-btn-secondary" onClick={() => navigate('../writing')}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>edit_note</span>
              文稿生成
            </button>
            <button className="lg-btn lg-btn-secondary" onClick={() => navigate('../reviews')}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>fact_check</span>
              蓝军评审
            </button>
            <button className="lg-btn lg-btn-secondary" onClick={() => navigate('../portal')}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>preview</span>
              发布预览
            </button>
            <button className="lg-btn lg-btn-secondary" onClick={onRefresh}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
              刷新数据
            </button>
          </div>
        </div>
      </div>

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

      {/* (refresh moved to quick actions above) */}
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
