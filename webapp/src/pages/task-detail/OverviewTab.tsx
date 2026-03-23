// 任务详情 - 概览 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useOutletContext, Link } from 'react-router-dom';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  workflowRules: any[];
  latestOutput: any;
  actionLoading: string | null;
  onConfirmOutline: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review') => void;
}

export function OverviewTab() {
  const { task, workflowRules, latestOutput, actionLoading, onConfirmOutline, onRedoStage } = useOutletContext<TaskContext>();

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      pending: '待处理',
      planning: '选题策划',
      researching: '深度研究',
      writing: '文稿生成',
      reviewing: '蓝军评审',
      awaiting_approval: '待审核',
      completed: '已完成',
      failed: '已失败'
    };
    return labels[stage] || stage;
  };

  const getStageProgress = (status: string) => {
    const stageMap: Record<string, number> = {
      pending: 0,
      planning: 25,
      researching: 50,
      writing: 75,
      reviewing: 90,
      awaiting_approval: 95,
      completed: 100
    };
    return stageMap[status] || 0;
  };

  return (
    <div className="tab-panel animate-fade-in">
      <div className="panel-grid">
        {/* 基础信息卡片 */}
        <div className="info-card glass-card">
          <h3 className="card-title">
            <span className="icon">📋</span> 基础信息
          </h3>
          <div className="info-list">
            <div className="info-item">
              <span className="label">任务 ID</span>
              <span className="value font-mono">{task.id}</span>
            </div>
            <div className="info-item">
              <span className="label">当前阶段</span>
              <span className="value highlight">{getStageLabel(task.current_stage || 'pending')}</span>
            </div>
            <div className="info-item">
              <span className="label">总体进度</span>
              <span className="value">{task.progress}%</span>
            </div>
            <div className="info-item">
              <span className="label">创建时间</span>
              <span className="value">{new Date(task.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 生产阶段进度 */}
        <div className="info-card glass-card">
          <h3 className="card-title">
            <span className="icon">📈</span> 生产进度
          </h3>
          <div className="stage-steps-compact">
            {['待处理', '选题策划', '深度研究', '文稿生成', '蓝军评审', '已完成'].map(
              (stage, index) => {
                const progress = getStageProgress(task.status);
                const stepProgress = (index / 5) * 100;
                const isActive = progress >= stepProgress;
                const isCurrent = progress >= stepProgress && progress < stepProgress + (index === 5 ? 1 : 20);

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

        {/* 大纲预览 */}
        <div className="info-card full-width">
          <div className="card-header-with-link">
            <h3 className="card-title">
              <span className="icon">📝</span> 大纲预览
            </h3>
            {task.outline && (
              <Link to={`/tasks/${task.id}/planning`} className="view-more-link">
                查看详情 →
              </Link>
            )}
          </div>
          {task.outline?.sections && task.outline.sections.length > 0 ? (
            <div className="outline-preview">
              {task.outline.sections.slice(0, 3).map((section: any, idx: number) => (
                <div key={idx} className="outline-section-mini">
                  <h4 className="section-title-mini">{idx + 1}. {section.title}</h4>
                  <ul className="key-points-mini">
                    {section.key_points?.slice(0, 2).map((point: string, pidx: number) => (
                      <li key={pidx}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {task.outline.sections.length > 3 && <div className="more-indicator">... 等更多章节</div>}
            </div>
          ) : (
            <div className="empty-mini">
              <span>尚未生成大纲，等待选题策划阶段生成</span>
            </div>
          )}
        </div>

        {/* 最新稿件预览 */}
        {latestOutput && (
          <div className="info-card full-width">
            <div className="card-header-with-link">
              <h3 className="card-title">
                <span className="icon">📄</span> 最新稿件预览
              </h3>
              <Link to={`/tasks/${task.id}/writing`} className="view-more-link">
                进入编辑器 →
              </Link>
            </div>
            <div className="draft-preview-box">
              <div className="preview-content">
                {latestOutput.content.length > 500 
                  ? `${latestOutput.content.substring(0, 500)}...` 
                  : latestOutput.content}
              </div>
              <div className="preview-fade"></div>
            </div>
          </div>
        )}

        {/* 快捷操作 */}
        <div className="info-card full-width glass-card">
          <h3 className="card-title">
            <span className="icon">⚡</span> 快捷操作
          </h3>
          <div className="quick-actions-row">
            {(task.status === 'planning' || (task as any).status === 'outline_pending') && (
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
              onClick={() => onRedoStage('planning')}
              disabled={actionLoading === 'redo-planning'}
            >
              🔄 重做选题策划
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => onRedoStage('research')}
              disabled={actionLoading === 'redo-research'}
            >
              🔄 重做深度研究
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
