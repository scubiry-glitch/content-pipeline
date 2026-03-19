// 任务详情 - 文稿生成 Tab
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { ExportPanel } from '../../components/ExportPanel';
import type { Task } from '../../types';

interface WritingTabProps {
  task: Task;
  draftContent: { content: string; version?: number } | null;
  complianceResult: any;
  checkingCompliance: boolean;
  onRedoWriting: () => void;
  onComplianceCheck: () => void;
  onClearComplianceResult: () => void;
  actionLoading?: string | null;
}

export function WritingTab({
  task,
  draftContent,
  complianceResult,
  checkingCompliance,
  onRedoWriting,
  onComplianceCheck,
  onClearComplianceResult,
  actionLoading,
}: WritingTabProps) {
  return (
    <div className="tab-panel writing-panel">
      {/* 操作按钮区 */}
      <div className="info-card actions-card">
        <h3 className="card-title">⚡ 文稿操作</h3>
        <div className="writing-actions">
          <button
            className="btn btn-warning"
            onClick={onRedoWriting}
            disabled={actionLoading === 'redo-writing'}
          >
            {actionLoading === 'redo-writing' ? '启动中...' : '🔄 重做文稿生成'}
          </button>
          {draftContent?.content && (
            <button
              className="btn btn-primary"
              onClick={onComplianceCheck}
              disabled={checkingCompliance}
            >
              {checkingCompliance ? '检查中...' : '🛡️ 合规检查'}
            </button>
          )}
        </div>
        <p className="action-hint">重做将删除当前版本并重新生成初稿</p>
      </div>

      {/* 合规检查结果 */}
      {complianceResult && (
        <div className="info-card compliance-result-card">
          <h3 className="card-title">🛡️ 合规检查结果</h3>
          <div className="compliance-summary">
            <div
              className={`compliance-score ${complianceResult.overallScore >= 80 ? 'pass' : complianceResult.overallScore >= 60 ? 'warning' : 'fail'}`}
            >
              <span className="score-value">{complianceResult.overallScore}</span>
              <span className="score-label">
                {complianceResult.overallScore >= 80 ? '合规' : complianceResult.overallScore >= 60 ? '需关注' : '高风险'}
              </span>
            </div>
            <div className="compliance-stats">
              <span>问题数: {complianceResult.issues.length}</span>
              <span>状态: {complianceResult.passed ? '✅ 通过' : '❌ 未通过'}</span>
            </div>
          </div>
          {complianceResult.issues.length > 0 && (
            <div className="compliance-issues">
              <h4>发现问题</h4>
              {complianceResult.issues.map((issue: any, idx: number) => (
                <div key={idx} className={`issue-item ${issue.level}`}>
                  <div className="issue-header">
                    <span className="issue-type">{issue.type}</span>
                    <span className={`issue-level ${issue.level}`}>{issue.level}</span>
                  </div>
                  <div className="issue-content">{issue.content}</div>
                  <div className="issue-suggestion">💡 {issue.suggestion}</div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-secondary" onClick={onClearComplianceResult}>
            清除结果
          </button>
        </div>
      )}

      {draftContent?.content ? (
        <div className="writing-content">
          <div className="info-card">
            <h3 className="card-title">📝 生成内容</h3>
            <div className="writing-draft">
              {draftContent.content}
            </div>
          </div>

          {/* 版本对比 */}
          <div className="info-card">
            <h3 className="card-title">📜 版本历史</h3>
            <VersionComparePanel
              versions={task.versions || (task as any).draft_versions || []}
              currentVersion={draftContent?.version}
              onRollback={(versionId) => console.log('Rollback to:', versionId)}
            />
          </div>

          {/* 导出功能 */}
          <div className="info-card">
            <h3 className="card-title">📤 导出文稿</h3>
            <ExportPanel
              content={draftContent.content}
              title={task.topic}
              taskId={task.id}
            />
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">✍️</div>
          <div className="empty-title">文稿生成</div>
          <p>任务进入文稿生成阶段后可查看生成的内容</p>
        </div>
      )}
    </div>
  );
}
