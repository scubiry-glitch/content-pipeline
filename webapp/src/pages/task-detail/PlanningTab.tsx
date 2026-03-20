// 任务详情 - 选题策划 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useOutletContext } from 'react-router-dom';
import type { Task } from '../../types';

interface TaskContext {
  task: Task;
  editingOutline: boolean;
  outlineDraft: string;
  actionLoading: string | null;
  onEditOutline: () => void;
  onSaveOutline: () => void;
  onCancelEdit: () => void;
  onOutlineChange: (value: string) => void;
  onConfirmOutline: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review') => void;
}

export function PlanningTab() {
  const {
    task,
    editingOutline,
    outlineDraft,
    actionLoading,
    onEditOutline,
    onSaveOutline,
    onCancelEdit,
    onOutlineChange,
    onConfirmOutline,
    onRedoStage,
  } = useOutletContext<TaskContext>();
  const outline = task.outline || {};
  const evaluation = task.evaluation;
  const competitorAnalysis = task.competitor_analysis || {};

  return (
    <div className="tab-panel planning-panel">
      {/* ========== 1. 输入 ========== */}
      <div className="section-header">
        <h3 className="section-title">📥 输入</h3>
        <span className="section-desc">选题评估与竞品分析</span>
      </div>

      <div className="input-grid">
        {/* 选题质量评估 */}
        {evaluation && (
          <div className="info-card input-card">
            <h3 className="card-title">📊 选题质量评估</h3>
            <div className="evaluation-content">
              <div className="score-circle-container">
                <div
                  className="score-circle"
                  style={{
                    background: `conic-gradient(
                      ${evaluation.score >= 80 ? '#10b981' : evaluation.score >= 60 ? '#f59e0b' : '#ef4444'} ${evaluation.score * 3.6}deg,
                      #e5e7eb 0deg
                    )`
                  }}
                >
                  <div className="score-circle-inner">
                    <span className="score-value">{evaluation.score}</span>
                    <span className="score-label">分</span>
                  </div>
                </div>
                <div className={`score-verdict ${evaluation.score >= 60 ? 'pass' : 'fail'}`}>
                  {evaluation.score >= 80 ? '✅ 强烈推荐' :
                   evaluation.score >= 60 ? '⚠️ 可以写' :
                   evaluation.score >= 40 ? '❌ 有风险' : '❌ 不建议'}
                </div>
              </div>

              <div className="dimension-scores">
                {Object.entries(evaluation.dimensions || {}).map(([key, value]: [string, any]) => {
                  const labels: Record<string, string> = {
                    dataAvailability: '数据可得性 (40%)',
                    topicHeat: '话题热度 (25%)',
                    differentiation: '差异化 (20%)',
                    timeliness: '时效性 (15%)'
                  };
                  const colors: Record<string, string> = {
                    dataAvailability: '#6366f1',
                    topicHeat: '#f59e0b',
                    differentiation: '#06b6d4',
                    timeliness: '#10b981'
                  };

                  return (
                    <div key={key} className="dimension-item">
                      <div className="dimension-header">
                        <span className="dimension-label">{labels[key] || key}</span>
                        <span className="dimension-value">{value}分</span>
                      </div>
                      <div className="dimension-bar-bg">
                        <div
                          className="dimension-bar-fill"
                          style={{ width: `${value}%`, background: colors[key] || '#6366f1' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {evaluation.analysis && (
              <div className="evaluation-analysis">
                <strong>分析：</strong>{evaluation.analysis}
              </div>
            )}

            {evaluation.suggestions?.length > 0 && (
              <div className={`evaluation-suggestions ${evaluation.score >= 60 ? 'positive' : 'warning'}`}>
                <div className="suggestions-title">💡 建议</div>
                {evaluation.suggestions.map((s: string, i: number) => (
                  <div key={i} className="suggestion-item">• {s}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 竞品分析 */}
        {competitorAnalysis.reports?.length > 0 && (
          <div className="info-card input-card">
            <h3 className="card-title">⚔️ 竞品分析</h3>
            <p className="competitor-summary">
              找到 {competitorAnalysis.summary?.totalFound || competitorAnalysis.reports.length} 篇相关研报
            </p>

            {competitorAnalysis.differentiationSuggestions?.length > 0 && (
              <div className="differentiation-suggestions">
                {competitorAnalysis.differentiationSuggestions.slice(0, 2).map((s: any, i: number) => (
                  <div key={i} className="diff-suggestion-card">
                    <div className="diff-header">
                      <span className="diff-angle">{s.angle}</span>
                      <span className={`diff-value ${s.potentialValue}`}>
                        {s.potentialValue === 'high' ? '高价值' : s.potentialValue === 'medium' ? '中价值' : '低价值'}
                      </span>
                    </div>
                    <p className="diff-rationale">{s.rationale}</p>
                  </div>
                ))}
              </div>
            )}

            {competitorAnalysis.summary?.gaps?.length > 0 && (
              <div className="market-gaps">
                <h4>🎯 市场空白点</h4>
                {competitorAnalysis.summary.gaps.slice(0, 3).map((g: string, i: number) => (
                  <div key={i} className="gap-item">• {g}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== 2. 加工 ========== */}
      {(outline.knowledgeInsights?.length > 0 || outline.novelAngles?.length > 0) && (
        <>
          <div className="section-header">
            <h3 className="section-title">⚙️ 加工</h3>
            <span className="section-desc">知识库洞见与新观点</span>
          </div>

          <div className="info-card full-width process-card">
            <h3 className="card-title">💡 知识库洞见与新观点</h3>

            {outline.knowledgeInsights?.length > 0 && (
              <div className="insights-section">
                <h4>📚 基于历史研究的发现</h4>
                {outline.knowledgeInsights.map((insight: any, i: number) => (
                  <div
                    key={i}
                    className="insight-card"
                    style={{ borderLeftColor: insight.type === 'trend' ? '#10b981' : insight.type === 'gap' ? '#f59e0b' : '#06b6d4' }}
                  >
                    <div className="insight-header-row">
                      <span className="insight-type-badge">
                        {insight.type === 'trend' ? '📈 趋势延续' : insight.type === 'gap' ? '🔍 研究空白' : '📖 观点演变'}
                      </span>
                      <span className="insight-relevance">相关度 {(insight.relevance * 100).toFixed(0)}%</span>
                    </div>
                    <p className="insight-content-text">{insight.content}</p>
                    {insight.source && <p className="insight-source-text">来源: {insight.source}</p>}
                  </div>
                ))}
              </div>
            )}

            {outline.novelAngles?.length > 0 && (
              <div className="novel-angles-section">
                <h4>✨ 建议的新研究角度</h4>
                {outline.novelAngles.map((angle: any, i: number) => {
                  const impact = angle.potentialImpact || (angle.differentiation_score >= 8 ? 'high' : angle.differentiation_score >= 5 ? 'medium' : 'low');
                  return (
                    <div key={i} className="angle-card">
                      <div className="angle-header">
                        <strong>{angle.angle}</strong>
                        <span className={`impact-badge ${impact}`}>
                          {impact === 'high' ? '高影响力' : impact === 'medium' ? '中影响力' : '低影响力'}
                        </span>
                      </div>
                      <p><strong>理由:</strong> {angle.description}</p>
                      <p><strong>差异化评分:</strong> {angle.differentiation_score}/10</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========== 3. 输出 ========== */}
      <div className="section-header">
        <h3 className="section-title">📤 输出</h3>
        <span className="section-desc">文章大纲</span>
      </div>

      <div className="info-card full-width output-card">
        <div className="card-header-with-actions">
          <h3 className="card-title">📝 文章大纲</h3>
          {(task.status === 'planning' || task.status === 'outline_pending') && !editingOutline && (
            <div className="card-actions">
              <button
                className="btn btn-success"
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}
              >
                {actionLoading === 'confirm-outline' ? '确认中...' : '✓ 确认大纲并继续'}
              </button>
            </div>
          )}
        </div>

        {editingOutline ? (
          <div className="outline-editor">
            <textarea
              value={outlineDraft}
              onChange={(e) => onOutlineChange(e.target.value)}
              className="outline-textarea"
              rows={20}
            />
            <div className="editor-actions">
              <button className="btn btn-secondary" onClick={onCancelEdit}>
                取消
              </button>
              <button className="btn btn-primary" onClick={onSaveOutline}>
                保存
              </button>
            </div>
          </div>
        ) : outline.sections && outline.sections.length > 0 ? (
          <div className="outline-preview-detailed">
            {outline.sections.map((section: any, idx: number) => (
              <div key={idx} className="outline-section-detailed">
                <h4 className="section-title-main">
                  {idx + 1}. {section.title}
                </h4>
                <p className="section-content">{section.content}</p>
                {section.subsections?.length > 0 && (
                  <div className="subsections">
                    {section.subsections.map((sub: any, sidx: number) => (
                      <div key={sidx} className="subsection">
                        <h5>{idx + 1}.{sidx + 1} {sub.title}</h5>
                        <p>{sub.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                {section.key_points?.length > 0 && (
                  <ul className="key-points-list">
                    {section.key_points.map((point: string, pidx: number) => (
                      <li key={pidx}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <div className="empty-title">暂无大纲</div>
            <p>任务进入选题策划阶段后将自动生成文章大纲</p>
          </div>
        )}
      </div>

      {/* ========== 4. 辅助工具 ========== */}
      <div className="section-header">
        <h3 className="section-title">🛠️ 辅助工具</h3>
        <span className="section-desc">大纲编辑与重算</span>
      </div>

      <div className="info-card tools-card">
        <h3 className="card-title">⚡ 操作工具</h3>
        <div className="tools-actions">
          {!editingOutline && (
            <button className="btn btn-primary" onClick={onEditOutline}>
              ✏️ 编辑大纲
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => onRedoStage('planning')}
            disabled={actionLoading === 'redo-planning'}
          >
            {actionLoading === 'redo-planning' ? '重算中...' : '🔄 重做选题策划'}
          </button>
        </div>
      </div>
    </div>
  );
}
