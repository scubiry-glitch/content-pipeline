// 任务详情 - 文稿生成 Tab (v5.0 - 流式分段生成)
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { VersionComparePanel } from '../../components/VersionComparePanel';
import { ExportPanel } from '../../components/ExportPanel';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { DraftGenerationProgress } from '../../components/DraftGenerationProgress';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  complianceResult: any;
  checkingCompliance: boolean;
  actionLoading: string | null;
  getDraftFromTask: () => { content: string; version?: number } | null;
  onRedoWriting: () => void;
  onComplianceCheck: () => void;
  onClearComplianceResult: () => void;
}

export function WritingTab() {
  const {
    task,
    complianceResult,
    checkingCompliance,
    actionLoading,
    getDraftFromTask,
    onRedoWriting,
    onComplianceCheck,
    onClearComplianceResult,
  } = useOutletContext<TaskContext>();

  const draftContent = getDraftFromTask();
  
  // 视图模式切换：rendered(渲染) | source(源码)
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');
  
  // 是否正在生成（用于显示进度面板）
  const isGenerating = task.status === 'writing' || task.current_stage === 'generating_draft';

  return (
    <div className="tab-panel writing-panel">
      {/* ========== 1. 输入 ========== */}
      <div className="section-header">
        <h3 className="section-title">📥 输入</h3>
        <span className="section-desc">大纲与研究数据来源</span>
      </div>

      <div className="input-grid">
        {/* 任务主题 */}
        <div className="info-card input-card">
          <h3 className="card-title">📝 写作主题</h3>
          <div className="writing-topic">
            <p className="topic-text">{task.topic}</p>
          </div>
        </div>

        {/* 参考数据来源 */}
        <div className="info-card input-card">
          <h3 className="card-title">📚 参考数据</h3>
          <div className="data-source-summary">
            <div className="source-count">
              <span className="count-label">研究洞察:</span>
              <span className="count-value">{task.research_data?.insights?.length || 0} 条</span>
            </div>
            <div className="source-count">
              <span className="count-label">引用来源:</span>
              <span className="count-value">{task.research_data?.sources?.length || 0} 个</span>
            </div>
            <div className="source-count">
              <span className="count-label">素材关联:</span>
              <span className="count-value">{task.asset_ids?.length || 0} 个</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========== 2. 加工 ========== */}
      {draftContent?.content && (
        <>
          <div className="section-header">
            <h3 className="section-title">⚙️ 加工</h3>
            <span className="section-desc">文稿生成与合规检查</span>
          </div>

          {/* 合规检查结果 */}
          {complianceResult && (
            <div className="info-card full-width process-card">
              <div className="card-header-with-actions">
                <h3 className="card-title">🛡️ 合规检查结果</h3>
                <button className="btn btn-sm btn-secondary" onClick={onClearComplianceResult}>
                  清除结果
                </button>
              </div>
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
            </div>
          )}

          {/* 版本对比 */}
          <div className="info-card process-card">
            <h3 className="card-title">📜 版本历史</h3>
            <VersionComparePanel
              versions={task.versions || (task as any).draft_versions || []}
              currentVersion={draftContent?.version}
              onRollback={(versionId) => console.log('Rollback to:', versionId)}
            />
          </div>
        </>
      )}

      {/* ========== 3. 输出 ========== */}
      <div className="section-header">
        <h3 className="section-title">📤 输出</h3>
        <span className="section-desc">生成内容与导出</span>
      </div>

      {/* 流式生成进度面板 */}
      {isGenerating && !draftContent?.content && (
        <div className="info-card full-width">
          <h3 className="card-title">🔄 正在生成文稿</h3>
          <DraftGenerationProgress
            taskId={task.id}
            onComplete={() => window.location.reload()}
            onError={(error) => alert(`生成失败: ${error}`)}
          />
        </div>
      )}

      {draftContent?.content ? (
        <div className="output-content">
          {/* 生成内容 */}
          <div className="info-card full-width output-card">
            <div className="card-header-with-actions">
              <h3 className="card-title">📝 生成内容</h3>
              <div className="header-actions">
                {/* 视图切换 */}
                <div className="view-toggle">
                  <button 
                    className={`btn-toggle ${viewMode === 'rendered' ? 'active' : ''}`}
                    onClick={() => setViewMode('rendered')}
                    title="Markdown 渲染视图"
                  >
                    👁️ 预览
                  </button>
                  <button 
                    className={`btn-toggle ${viewMode === 'source' ? 'active' : ''}`}
                    onClick={() => setViewMode('source')}
                    title="Markdown 源码"
                  >
                    📄 源码
                  </button>
                </div>
                <span className="version-tag">版本 {draftContent.version || 1}</span>
              </div>
            </div>
            
            {/* 内容显示区 */}
            <div className="writing-draft-container">
              {viewMode === 'rendered' ? (
                <MarkdownRenderer content={draftContent.content} />
              ) : (
                <pre className="writing-draft-source">
                  <code>{draftContent.content}</code>
                </pre>
              )}
            </div>
          </div>

          {/* 导出功能 */}
          <div className="info-card output-card">
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
          <p>任务进入文稿生成阶段后将显示生成的内容</p>
        </div>
      )}

      {/* ========== 4. 辅助工具 ========== */}
      <div className="section-header">
        <h3 className="section-title">🛠️ 辅助工具</h3>
        <span className="section-desc">文稿生成与质量检查</span>
      </div>

      <div className="info-card tools-card">
        <h3 className="card-title">⚡ 文稿操作</h3>
        <div className="tools-actions">
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
        <p className="action-hint">⚠️ 重做将删除当前版本并重新生成初稿</p>
      </div>
    </div>
  );
}
