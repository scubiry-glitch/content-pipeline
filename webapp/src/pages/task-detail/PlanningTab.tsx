// 任务详情 - 选题策划 Tab
// 布局逻辑: 1.输出 2.输入 3.加工 4.辅助工具(悬浮)
import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { tasksApi } from '../../api/client';
import type { Task, OutlineComment, OutlineVersion } from '../../types';

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
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review', data?: any) => void;
}

// 编辑器模式：edit(编辑) | preview(预览) | split(分屏)
type EditorMode = 'edit' | 'preview' | 'split';

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
  
  // 编辑器模式切换
  const [editorMode, setEditorMode] = useState<EditorMode>('preview');
  
  // Refs for scrolling
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef<HTMLDivElement>(null);

  // ===== 评论相关状态 =====
  const [comments, setComments] = useState<OutlineComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // ===== 版本历史相关状态 =====
  const [versions, setVersions] = useState<OutlineVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [versionOutline, setVersionOutline] = useState<any>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);

  // ===== 重做对话框状态 =====
  const [showRedoDialog, setShowRedoDialog] = useState(false);
  const [redoComment, setRedoComment] = useState('');
  const [isRedoing, setIsRedoing] = useState(false);

  // 平滑滚动到指定区域
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 处理编辑模式切换
  const handleEditClick = () => {
    setEditorMode('split');
    onEditOutline();
  };

  const handleSaveClick = () => {
    onSaveOutline();
    setEditorMode('preview');
  };

  const handleCancelClick = () => {
    onCancelEdit();
    setEditorMode('preview');
  };

  // ===== 加载评论 =====
  const loadComments = useCallback(async () => {
    if (!task.id) return;
    setLoadingComments(true);
    try {
      const result = await tasksApi.getOutlineComments(task.id);
      setComments(result.items || []);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoadingComments(false);
    }
  }, [task.id]);

  // ===== 添加评论 =====
  const handleAddComment = async () => {
    if (!newComment.trim() || !task.id) return;
    try {
      await tasksApi.addOutlineComment(task.id, newComment.trim());
      setNewComment('');
      loadComments();
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('添加评论失败');
    }
  };

  // ===== 删除评论 =====
  const handleDeleteComment = async (commentId: string) => {
    if (!task.id || !confirm('确定要删除这条评论吗？')) return;
    try {
      await tasksApi.deleteOutlineComment(task.id, commentId);
      loadComments();
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('删除评论失败');
    }
  };

  // ===== 加载版本历史 =====
  const loadVersions = useCallback(async () => {
    if (!task.id) return;
    setLoadingVersions(true);
    try {
      const result = await tasksApi.getOutlineVersions(task.id);
      setVersions(result.items || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  }, [task.id]);

  // ===== 切换版本查看 =====
  const handleVersionChange = async (version: number | null) => {
    setSelectedVersion(version);
    if (version === null) {
      setVersionOutline(null);
      return;
    }
    if (!task.id) return;
    try {
      const result = await tasksApi.getOutlineVersion(task.id, version);
      setVersionOutline(result.outline);
    } catch (error) {
      console.error('Failed to load version:', error);
      alert('加载版本失败');
    }
  };

  // ===== 重做选题策划 =====
  const handleRedoClick = () => {
    // 收集所有评论作为上下文
    const commentTexts = comments.map(c => c.content);
    
    if (commentTexts.length === 0) {
      // 没有评论，直接重做
      if (confirm('确定要重做选题策划吗？当前大纲将被保存到历史版本。')) {
        onRedoStage('planning', { comment: '重做前版本' });
      }
      return;
    }
    
    // 有评论，显示对话框
    setShowRedoDialog(true);
    setRedoComment(commentTexts.join('\n'));
  };

  const handleConfirmRedo = async () => {
    setIsRedoing(true);
    const commentTexts = comments.map(c => c.content);
    if (redoComment.trim()) {
      commentTexts.push(redoComment.trim());
    }
    
    onRedoStage('planning', { 
      comments: commentTexts,
      comment: redoComment.trim() || '重做前版本'
    });
    
    setShowRedoDialog(false);
    setIsRedoing(false);
    
    // 清空评论
    setComments([]);
  };

  // 初始加载
  useEffect(() => {
    loadComments();
    loadVersions();
  }, [loadComments, loadVersions]);

  // 将大纲转换为 Markdown 格式
  const outlineToMarkdown = (ol: any = outline) => {
    if (!ol?.sections || ol.sections.length === 0) return '';
    
    let md = `# ${ol.title || task.topic}\n\n`;
    
    ol.sections.forEach((section: any, idx: number) => {
      md += `## ${idx + 1}. ${section.title}\n\n`;
      
      if (section.content) {
        md += `${section.content}\n\n`;
      }
      
      if (section.subsections?.length > 0) {
        section.subsections.forEach((sub: any, sidx: number) => {
          md += `### ${idx + 1}.${sidx + 1} ${sub.title}\n\n`;
          if (sub.content) {
            md += `${sub.content}\n\n`;
          }
        });
      }
      
      if (section.key_points?.length > 0) {
        md += `**要点：**\n\n`;
        section.key_points.forEach((point: string) => {
          md += `- ${point}\n`;
        });
        md += `\n`;
      }
    });
    
    return md;
  };

  // 当前显示的大纲（可能是历史版本）
  const displayOutline = versionOutline || outline;

  return (
    <div className="tab-panel planning-panel">
      {/* ========== Sticky 导航栏 ========== */}
      <nav className="planning-nav">
        <button 
          className="nav-btn active" 
          onClick={() => scrollToSection(outputRef)}
        >
          📤 大纲
        </button>
        <button 
          className="nav-btn" 
          onClick={() => scrollToSection(inputRef)}
        >
          📥 评估
        </button>
        {(outline.knowledgeInsights?.length > 0 || outline.novelAngles?.length > 0) && (
          <button 
            className="nav-btn" 
            onClick={() => scrollToSection(processRef)}
          >
            ⚙️ 洞见
          </button>
        )}
        {versions.length > 0 && (
          <button 
            className="nav-btn" 
            onClick={() => scrollToSection(versionRef)}
          >
            📜 版本历史
          </button>
        )}
      </nav>

      {/* ========== 版本选择器 ========== */}
      {versions.length > 0 && (
        <div className="version-selector-bar">
          <label>版本：</label>
          <select 
            value={selectedVersion || ''} 
            onChange={(e) => handleVersionChange(e.target.value ? parseInt(e.target.value) : null)}
            className="version-select"
          >
            <option value="">当前版本</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                版本 {v.version} ({new Date(v.created_at).toLocaleDateString()})
                {v.comment ? ` - ${v.comment.substring(0, 20)}...` : ''}
              </option>
            ))}
          </select>
          {selectedVersion && (
            <button 
              className="btn btn-sm btn-secondary"
              onClick={() => handleVersionChange(null)}
            >
              返回当前
            </button>
          )}
        </div>
      )}

      {/* ========== 1. 输出 (置顶) ========== */}
      <div ref={outputRef} className="section-header">
        <h3 className="section-title">📤 输出</h3>
        <span className="section-desc">文章大纲</span>
      </div>

      <div className="info-card full-width output-card">
        <div className="card-header-with-actions">
          <h3 className="card-title">
            📝 文章大纲
            {selectedVersion && <span className="version-badge">历史版本 {selectedVersion}</span>}
          </h3>
          <div className="header-actions">
            {/* 编辑器模式切换 */}
            {!editingOutline && displayOutline.sections && displayOutline.sections.length > 0 && !selectedVersion && (
              <div className="editor-mode-toggle">
                <button 
                  className={`btn-mode ${editorMode === 'edit' ? 'active' : ''}`}
                  onClick={() => setEditorMode('edit')}
                  title="仅编辑"
                >
                  ✏️ 编辑
                </button>
                <button 
                  className={`btn-mode ${editorMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setEditorMode('preview')}
                  title="仅预览"
                >
                  👁️ 预览
                </button>
                <button 
                  className={`btn-mode ${editorMode === 'split' ? 'active' : ''}`}
                  onClick={() => setEditorMode('split')}
                  title="分屏模式"
                >
                  ⬌ 分屏
                </button>
              </div>
            )}
            {(task.status === 'planning' || task.status === 'outline_pending') && !editingOutline && !selectedVersion && (
              <button
                className="btn btn-success"
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}
              >
                {actionLoading === 'confirm-outline' ? '确认中...' : '✓ 确认大纲并继续'}
              </button>
            )}
          </div>
        </div>

        {editingOutline ? (
          <div className={`outline-container mode-${editorMode}`}>
            {(editorMode === 'edit' || editorMode === 'split') && (
              <div className="outline-editor-panel">
                <textarea
                  value={outlineDraft}
                  onChange={(e) => onOutlineChange(e.target.value)}
                  className="outline-textarea"
                  rows={editorMode === 'split' ? 25 : 20}
                />
                <div className="editor-actions">
                  <button className="btn btn-secondary" onClick={handleCancelClick}>
                    取消
                  </button>
                  <button className="btn btn-primary" onClick={handleSaveClick}>
                    保存
                  </button>
                </div>
              </div>
            )}
            {(editorMode === 'preview' || editorMode === 'split') && (
              <div className="outline-preview-panel">
                <MarkdownRenderer content={outlineToMarkdown()} />
              </div>
            )}
          </div>
        ) : displayOutline.sections && displayOutline.sections.length > 0 ? (
          <div className={`outline-container mode-${editorMode}`}>
            {editorMode === 'edit' ? (
              <div className="outline-editor-panel">
                <pre className="outline-source">
                  <code>{outlineToMarkdown(displayOutline)}</code>
                </pre>
              </div>
            ) : editorMode === 'preview' ? (
              <div className="outline-preview-panel">
                <MarkdownRenderer content={outlineToMarkdown(displayOutline)} />
              </div>
            ) : (
              <>
                <div className="outline-editor-panel">
                  <pre className="outline-source">
                    <code>{outlineToMarkdown(displayOutline)}</code>
                  </pre>
                </div>
                <div className="outline-preview-panel">
                  <MarkdownRenderer content={outlineToMarkdown(displayOutline)} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <div className="empty-title">暂无大纲</div>
            <p>任务进入选题策划阶段后将自动生成文章大纲</p>
          </div>
        )}
      </div>

      {/* ========== 2. 输入 ========== */}
      <div ref={inputRef} className="section-header">
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

      {/* ========== 3. 加工 ========== */}
      {(outline.knowledgeInsights?.length > 0 || outline.novelAngles?.length > 0) && (
        <>
          <div ref={processRef} className="section-header">
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
                      <p><strong>理由:</strong> {angle.description || angle.rationale}</p>
                      <p><strong>差异化评分:</strong> {angle.differentiation_score || 0}/10</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========== 4. 评论区域 ========== */}
      <div className="section-header">
        <h3 className="section-title">💬 评论</h3>
        <span className="section-desc">对大纲的意见和建议</span>
      </div>

      <div className="info-card full-width comments-card">
        <h3 className="card-title">大纲评论 ({comments.length})</h3>
        
        {/* 评论输入 */}
        <div className="comment-input-area">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="输入对大纲的意见或建议..."
            className="comment-textarea"
            rows={3}
          />
          <button 
            className="btn btn-primary"
            onClick={handleAddComment}
            disabled={!newComment.trim()}
          >
            添加评论
          </button>
        </div>

        {/* 评论列表 */}
        <div className="comments-list">
          {loadingComments ? (
            <div className="loading">加载中...</div>
          ) : comments.length === 0 ? (
            <div className="empty-comments">暂无评论，添加评论后可在重做选题策划时作为参考</div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-header">
                  <span className="comment-author">{comment.created_by}</span>
                  <span className="comment-time">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                  <button 
                    className="comment-delete"
                    onClick={() => handleDeleteComment(comment.id)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
                <div className="comment-content">{comment.content}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ========== 5. 版本历史 ========== */}
      {versions.length > 0 && (
        <>
          <div ref={versionRef} className="section-header">
            <h3 className="section-title">📜 版本历史</h3>
            <span className="section-desc">大纲修改记录</span>
          </div>

          <div className="info-card full-width versions-card">
            <h3 className="card-title">历史版本 ({versions.length})</h3>
            <div className="versions-list">
              {versions.map((v) => (
                <div key={v.version} className="version-item">
                  <span className="version-num">版本 {v.version}</span>
                  <span className="version-date">{new Date(v.created_at).toLocaleString()}</span>
                  {v.comment && <span className="version-comment">{v.comment}</span>}
                  <button 
                    className="btn btn-sm"
                    onClick={() => handleVersionChange(v.version)}
                  >
                    查看
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ========== 悬浮操作按钮 ========== */}
      <div className="floating-actions">
        {!editingOutline ? (
          <button 
            className="fab-primary" 
            onClick={handleEditClick}
            title="编辑大纲"
          >
            ✏️ 编辑
          </button>
        ) : (
          <>
            <button 
              className="fab-success" 
              onClick={handleSaveClick}
              title="保存大纲"
            >
              ✓ 保存
            </button>
            <button 
              className="fab-secondary" 
              onClick={handleCancelClick}
              title="取消编辑"
            >
              ✕ 取消
            </button>
          </>
        )}
        <button
          className="fab-warning"
          onClick={handleRedoClick}
          disabled={actionLoading === 'redo-planning'}
          title="重做选题策划（将当前大纲保存到历史版本，并根据评论重新生成）"
        >
          {actionLoading === 'redo-planning' ? '⏳' : '🔄 重做'}
        </button>
      </div>

      {/* ========== 重做对话框 ========== */}
      {showRedoDialog && (
        <div className="modal-overlay">
          <div className="modal-content redo-dialog">
            <h3>🔄 重做选题策划</h3>
            <p>当前大纲将被保存到历史版本，并根据以下评论重新生成大纲：</p>
            
            <div className="redo-comments-preview">
              <h4>已添加的评论 ({comments.length})：</h4>
              <ul>
                {comments.map((c, i) => (
                  <li key={c.id}>{i + 1}. {c.content.substring(0, 50)}{c.content.length > 50 ? '...' : ''}</li>
                ))}
              </ul>
            </div>

            <div className="redo-comment-input">
              <label>补充修改意见（可选）：</label>
              <textarea
                value={redoComment}
                onChange={(e) => setRedoComment(e.target.value)}
                placeholder="输入额外的修改建议..."
                rows={4}
              />
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowRedoDialog(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleConfirmRedo}
                disabled={isRedoing}
              >
                {isRedoing ? '启动中...' : '确认重做'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的元素引用 */}
      <div ref={versionRef} style={{ display: 'none' }} />
    </div>
  );
}
