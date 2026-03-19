// 任务详情 - 概览 Tab
import { useOutletContext } from 'react-router-dom';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  workflowRules: any[];
  actionLoading: string | null;
  onConfirmOutline: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review') => void;
}

export function OverviewTab() {
  const { task, workflowRules, actionLoading, onConfirmOutline, onRedoStage } = useOutletContext<TaskContext>();
  const getStageProgress = (status: string) => {
    const stageMap: Record<string, number> = {
      pending: 0, planning: 25, researching: 50, writing: 75,
      reviewing: 90, awaiting_approval: 95, converting: 95, completed: 100
    };
    return stageMap[status] || 0;
  };

  return (
    <div className="tab-panel overview-panel">
      <div className="panel-grid">
        {/* 基础信息 */}
        <div className="info-card">
          <h3 className="card-title">📊 基础信息</h3>
          <div className="info-list">
            <div className="info-item">
              <span className="label">目标格式</span>
              <span className="value">{task.target_formats?.join(', ') || 'markdown'}</span>
            </div>
            <div className="info-item">
              <span className="label">进度</span>
              <span className="value">{task.progress}%</span>
            </div>
            <div className="info-item">
              <span className="label">当前阶段</span>
              <span className="value">{task.current_stage || '-'}</span>
            </div>
            {task.asset_ids && task.asset_ids.length > 0 && (
              <div className="info-item">
                <span className="label">关联素材</span>
                <span className="value">{task.asset_ids.length} 个</span>
              </div>
            )}
          </div>
        </div>

        {/* 快速操作 */}
        <div className="info-card quick-actions-card">
          <h3 className="card-title">⚡ 快捷操作</h3>
          <div className="quick-actions">
            {(task.status === 'planning' || task.status === 'outline_pending') && (
              <button
                className="btn btn-primary"
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}
              >
                {actionLoading === 'confirm-outline' ? '处理中...' : '✓ 确认大纲并继续'}
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => onRedoStage?.('planning')}
              disabled={actionLoading === 'redo-planning'}
            >
              {actionLoading === 'redo-planning' ? '重算中...' : '🔄 重做选题策划'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => onRedoStage?.('research')}
              disabled={actionLoading === 'redo-research'}
            >
              {actionLoading === 'redo-research' ? '重启中...' : '🔄 重做深度研究'}
            </button>
          </div>
        </div>

        {/* 阶段进度 */}
        <div className="info-card full-width">
          <h3 className="card-title">📈 阶段进度</h3>
          <div className="stage-progress-compact">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${getStageProgress(task.status)}%` }}
              />
            </div>
            <div className="stage-steps-compact">
              {['待处理', '选题策划', '深度研究', '文稿生成', '蓝军评审', '已完成'].map(
                (stage, index) => {
                  const progress = getStageProgress(task.status);
                  const stepProgress = (index / 5) * 100;
                  const isActive = progress >= stepProgress;
                  const isCurrent = progress >= stepProgress && progress < stepProgress + 20;

                  return (
                    <div
                      key={stage}
                      className={`stage-step-compact ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
                    >
                      <div className="step-dot-compact"></div>
                      <span className="step-name-compact">{stage}</span>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>

        {/* 大纲预览 */}
        {task.outline && (
          <div className="info-card full-width">
            <h3 className="card-title">📝 文章大纲</h3>
            <div className="outline-preview">
              {task.outline.sections?.map((section: any, idx: number) => (
                <div key={idx} className="outline-section">
                  <h4 className="section-title">{idx + 1}. {section.title}</h4>
                  <ul className="key-points">
                    {section.key_points?.map((point: string, pidx: number) => (
                      <li key={pidx}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 工作流规则 */}
        {workflowRules.length > 0 && (
          <div className="info-card full-width">
            <h3 className="card-title">🔄 适用工作流规则 ({workflowRules.filter((r: any) => r.isEnabled).length}个启用)</h3>
            <div className="workflow-rules-list">
              {workflowRules.filter((r: any) => r.isEnabled).slice(0, 5).map((rule: any) => (
                <div key={rule.id} className="workflow-rule-item">
                  <div className="rule-header">
                    <span className="rule-name">{rule.name}</span>
                    <span className={`rule-action ${rule.actionType}`}>
                      {rule.actionType === 'back_to_stage' ? '退回' :
                       rule.actionType === 'skip_step' ? '跳过' :
                       rule.actionType === 'add_warning' ? '警告' :
                       rule.actionType === 'notify' ? '通知' :
                       rule.actionType === 'block_and_notify' ? '阻断' : rule.actionType}
                    </span>
                  </div>
                  {rule.description && <div className="rule-desc">{rule.description}</div>}
                  <div className="rule-condition">
                    <code>{rule.conditionExpression}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
