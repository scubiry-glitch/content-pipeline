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
  
  const outline = (task.outline || {}) as any;
  const evaluation = task.evaluation as any;
  const competitorAnalysis = (task.competitor_analysis || {}) as any;
  
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
    <div className="tab-panel planning-panel animate-fade-in pb-32">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Stage 1</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Ideation & Topic Planning</span>
        </div>
        <h1 className="text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white">Topic Discovery & Analysis</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">Leveraging multi-source intelligence to identify high-potential content angles and structured outlines.</p>
      </header>

      {/* ========== Stepper Container ========== */}
      <div className="space-y-16">
        {/* ========== Section 1: Input ========== */}
        <section ref={inputRef} className="relative step-line step-line-active pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">input</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Input: Multi-source Discovery</h3>
            <div className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-bold rounded-full flex items-center gap-2">
              <span className="material-symbols-outlined text-xs">hub</span>
              Quality Evaluation & Competitors
            </div>
          </div>
          
          <div className="input-grid">
            {/* 选题质量评估 */}
            {evaluation && (
              <div className="info-card input-card glass-card">
                <h3 className="card-title">
                  <span className="icon">📊</span> 选题综合评估
                </h3>
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
                        <span className="score-label" style={{color:'black'}}>分</span>
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

                {evaluation?.analysis && (
                  <div className="evaluation-analysis mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <strong>AI 分析建议：</strong>{evaluation.analysis}
                  </div>
                )}
              </div>
            )}

            {/* 竞品分析 */}
            {competitorAnalysis.reports?.length > 0 && (
              <div className="info-card input-card glass-card">
                <h3 className="card-title">
                  <span className="icon">⚔️</span> 竞品分析与情报接入
                </h3>
                <p className="competitor-summary text-sm text-slate-500 mb-4">
                  成功挖掘到 {competitorAnalysis.summary?.totalFound || competitorAnalysis.reports.length} 篇结构化相关研报与资讯。
                </p>

                {competitorAnalysis.differentiationSuggestions?.length > 0 && (
                  <div className="differentiation-suggestions">
                    {competitorAnalysis.differentiationSuggestions.slice(0, 3).map((s: any, i: number) => (
                      <div key={i} className="diff-suggestion-card mb-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="diff-header flex justify-between items-center mb-1">
                          <span className="diff-angle font-bold text-slate-700 dark:text-slate-300">{s.angle}</span>
                          <span className={`diff-value text-xs px-2 py-0.5 rounded ${s.potentialValue === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {s.potentialValue === 'high' ? '高价值角度' : '中低价值'}
                          </span>
                        </div>
                        <p className="diff-rationale text-xs text-slate-500">{s.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ========== Section 2: Process ========== */}
        {(outline?.knowledgeInsights?.length > 0 || outline?.novelAngles?.length > 0) && (
          <section ref={processRef} className="relative step-line step-line-active pl-12">
            <div className="absolute left-0 top-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
              <span className="material-symbols-outlined">memory</span>
            </div>
            <h3 className="text-xl font-bold font-headline mb-6">Process: AI Synthesis & Ranking</h3>

            <div className="info-card full-width process-card glass-card">
              <div className="insights-grid">
                {outline.knowledgeInsights?.length > 0 && (
                  <div className="insights-column">
                    <h4 className="column-subtitle font-bold text-slate-700 dark:text-slate-300 mb-4">📚 基于历史研究的观点聚类</h4>
                    <div className="insight-list space-y-3">
                      {outline.knowledgeInsights.map((insight: any, i: number) => (
                        <div key={i} className="insight-card-premium p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                          <div className="insight-header flex justify-between items-center mb-2">
                            <span className="insight-type-badge text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                              {insight.type === 'trend' ? '📈 趋势延续' : insight.type === 'gap' ? '🔍 研究空白' : '📖 观点演变'}
                            </span>
                            <span className="insight-relevance text-xs text-slate-400">相似度 {(insight.relevance * 100).toFixed(0)}%</span>
                          </div>
                          <p className="insight-content text-sm text-slate-600 dark:text-slate-400">{insight.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {outline.novelAngles?.length > 0 && (
                  <div className="insights-column mt-6 md:mt-0">
                    <h4 className="column-subtitle font-bold text-slate-700 dark:text-slate-300 mb-4">✨ 推荐新维度挖掘</h4>
                    <div className="angle-list space-y-3">
                      {outline.novelAngles.map((angle: any, i: number) => {
                        const impact = angle.potentialImpact || (angle.differentiation_score >= 8 ? 'high' : 'medium');
                        return (
                          <div key={i} className="angle-card-premium p-4 border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 rounded-lg">
                            <div className="angle-header flex justify-between items-center mb-2">
                              <strong className="angle-title text-sm">{angle.angle}</strong>
                              <span className={`impact-badge text-xs px-2 py-0.5 rounded ${impact === 'high' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                {impact === 'high' ? '高潜' : '中潜'}
                              </span>
                            </div>
                            <p className="angle-desc text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">{angle.description || angle.rationale}</p>
                            <div className="angle-footer pt-3 border-t border-orange-200/50 dark:border-orange-800/50">
                              <span className="diff-score text-xs text-orange-700 dark:text-orange-400 font-bold">差异化评分: {angle.differentiation_score || 0}/10</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ========== Section 3: Output ========== */}
        <section ref={outputRef} className="relative pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Output: Streaming Outline Generation</h3>
            {actionLoading === 'confirm-outline' ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-full">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Streaming Generation...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {versions.length > 0 && (
                  <select 
                    value={selectedVersion || ''} 
                    onChange={(e) => handleVersionChange(e.target.value ? parseInt(e.target.value) : null)}
                    className="version-select border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm rounded-lg px-2 py-1"
                  >
                    <option value="">当前最新版本</option>
                    {versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        V{v.version} - {new Date(v.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="info-card full-width output-card border-none shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="card-header-with-actions flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="card-title text-lg font-bold flex items-center m-0 border-none pb-0">
                <span className="icon mr-2 text-xl">📝</span> 文章分层大纲 (Macro/Meso/Micro)
                {selectedVersion && <span className="version-badge highlight ml-3 text-xs bg-orange-500 text-white px-2 py-1 rounded">历史版本 {selectedVersion}</span>}
              </h3>
              <div className="header-actions flex gap-2">
                {!editingOutline && displayOutline.sections && displayOutline.sections.length > 0 && !selectedVersion && (
                  <div className="editor-mode-toggle flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                    <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${editorMode === 'edit' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`} onClick={() => setEditorMode('edit')}>✏️ Edit</button>
                    <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${editorMode === 'preview' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`} onClick={() => setEditorMode('preview')}>👁️ Preview</button>
                    <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${editorMode === 'split' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`} onClick={() => setEditorMode('split')}>⬌ Split</button>
                  </div>
                )}
              </div>
            </div>

            {editingOutline ? (
              <div className={`outline-container mode-${editorMode}`}>
                {(editorMode === 'edit' || editorMode === 'split') && (
                  <div className="outline-editor-panel">
                    <div className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Markdown Editor</div>
                    <textarea
                      value={outlineDraft}
                      onChange={(e) => onOutlineChange(e.target.value)}
                      className="outline-textarea w-full p-4 font-mono text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                      rows={editorMode === 'split' ? 25 : 20}
                    />
                    <div className="editor-actions mt-4 flex justify-end gap-3">
                      <button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-bold" onClick={handleCancelClick}>Cancel</button>
                      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold shadow-md" onClick={handleSaveClick}>Save Draft</button>
                    </div>
                  </div>
                )}
                {(editorMode === 'preview' || editorMode === 'split') && (
                  <div className="outline-preview-panel bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 rounded-lg prose dark:prose-invert max-w-none">
                    <MarkdownRenderer content={outlineToMarkdown()} />
                  </div>
                )}
              </div>
            ) : displayOutline.sections && displayOutline.sections.length > 0 ? (
               <div className={`outline-container mode-${editorMode}`}>
                {editorMode === 'edit' ? (
                  <div className="outline-editor-panel relative">
                    <div className="absolute top-2 right-2 flex gap-2">
                       <button className="p-2 bg-white shadow rounded text-slate-500 hover:text-blue-600" onClick={() => { onEditOutline(); setEditorMode('split'); }}>🔗 Start Editing</button>
                    </div>
                    <pre className="outline-source bg-slate-50 dark:bg-slate-900 p-6 rounded-lg overflow-auto max-h-[600px] border border-slate-200 dark:border-slate-800">
                      <code className="text-sm font-mono text-slate-800 dark:text-slate-300">{outlineToMarkdown(displayOutline)}</code>
                    </pre>
                  </div>
                ) : editorMode === 'preview' ? (
                  <div className="outline-preview-panel bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 prose dark:prose-invert max-w-none">
                    <MarkdownRenderer content={outlineToMarkdown(displayOutline)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="outline-editor-panel relative group">
                      <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button className="p-2 bg-white shadow rounded text-xs font-bold text-blue-600" onClick={() => { onEditOutline(); }}>Start Editing</button>
                      </div>
                      <pre className="outline-source bg-slate-50 dark:bg-slate-900 p-6 rounded-lg overflow-auto max-h-[800px] border border-slate-200 dark:border-slate-800">
                        <code className="text-sm font-mono whitespace-pre-wrap">{outlineToMarkdown(displayOutline)}</code>
                      </pre>
                    </div>
                    <div className="outline-preview-panel p-6 overflow-auto max-h-[800px] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 prose dark:prose-invert max-w-none">
                      <MarkdownRenderer content={outlineToMarkdown(displayOutline)} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state py-20 text-center">
                <div className="empty-icon text-6xl mb-4 opacity-50">📝</div>
                <div className="empty-title text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Awaiting Generation</div>
                <p className="text-slate-500">The outline generation process will commence automatically based on parameters.</p>
              </div>
            )}
          </div>
        </section>

        {/* ========== Section 4: Feedback & Versions Board ========== */}
        <section className="pt-8 mt-16 border-t border-slate-200 dark:border-slate-800">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             {/* 评论交互区 */}
             <div>
                <h3 className="text-lg font-bold font-headline mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-orange-500">chat</span> Feedback Interventions</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="comment-input-area mb-4">
                    <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Drop expert critiques or manual overrides here..." className="w-full p-3 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 mb-2" rows={3} />
                    <button className="px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors" onClick={handleAddComment} disabled={!newComment.trim()}>Push Feedback</button>
                  </div>
                  
                  <div className="comments-list space-y-3 max-h-[400px] overflow-auto">
                    {loadingComments ? (
                      <div className="text-sm text-slate-400 p-4 text-center">Loading...</div>
                    ) : comments.length === 0 ? (
                      <div className="text-sm text-slate-400 p-4 text-center italic">No interventions tracked.</div>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="comment-item bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                          <div className="comment-header flex justify-between items-center mb-2">
                            <span className="comment-author text-xs font-bold text-orange-600 dark:text-orange-400">{comment.created_by}</span>
                            <div className="flex items-center gap-2">
                              <span className="comment-time text-[10px] text-slate-400">{new Date(comment.created_at).toLocaleString()}</span>
                              <button className="text-slate-400 hover:text-red-500 text-xs" onClick={() => handleDeleteComment(comment.id)}>✕</button>
                            </div>
                          </div>
                          <div className="comment-content text-sm text-slate-700 dark:text-slate-300">{comment.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
             </div>

             {/* 版本历史区 */}
             <div>
                <h3 className="text-lg font-bold font-headline mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-blue-500">history</span> Version Timeline</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 max-h-[600px] overflow-auto">
                   {versions.length === 0 ? (
                      <div className="text-sm text-slate-400 p-4 text-center italic">No snapshots recorded yet.</div>
                   ) : (
                      <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-6">
                        {versions.map((v) => (
                          <div key={v.version} className="relative pl-6">
                            <span className="absolute -left-[9px] top-1 w-4 h-4 bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-full"></span>
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-start">
                              <div>
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">v{v.version}</span>
                                <p className="text-[10px] text-slate-400 mt-1">{new Date(v.created_at).toLocaleString()}</p>
                                {v.comment && <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 italic">{v.comment}</p>}
                              </div>
                              <button className="text-xs text-blue-600 hover:underline font-bold" onClick={() => handleVersionChange(v.version)}>View</button>
                            </div>
                          </div>
                        ))}
                      </div>
                   )}
                </div>
             </div>
           </div>
        </section>
      </div>

      {/* ========== Bottom Global Action Bar ========== */}
      <div className="fixed bottom-0 left-[256px] right-0 h-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-center px-8 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
             <span className="text-sm font-medium text-slate-500">
               Status: <span className={`uppercase font-bold ${task.status === 'planning' ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'}`}>{task.status.replace('_', ' ')}</span>
             </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2" onClick={handleRedoClick}>
                <span className="material-symbols-outlined text-lg">sync</span>
                Regenerate Stage
            </button>
            {(task.status === 'planning' || (task as any).status === 'outline_pending') && !editingOutline && !selectedVersion && (
            <button className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-lg shadow-md hover:bg-blue-700 transition-all flex items-center gap-2"
                onClick={onConfirmOutline}
                disabled={actionLoading === 'confirm-outline'}>
                {actionLoading === 'confirm-outline' ? 'Streaming...' : 'Proceed Details'}
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
            )}
          </div>
        </div>
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
