// LG Planning Tab - 选题策划
// 大纲结构化展示 + 选题评估 + 竞品分析 + 人工确认面板 + 三模式 Markdown 编辑器 + 多源发现

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';
import { langgraphApi, type LGStateHistoryItem } from '../../api/langgraph';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { hotTopicsApi, type HotTopic } from '../../api/client';

type EditorMode = 'edit' | 'preview' | 'split';

// 评论类型
interface OutlineComment {
  id: string;
  sectionTitle: string;  // 关联的章节标题（可为空表示通用评论）
  author: string;
  content: string;
  createdAt: string;
}

function loadComments(threadId: string): OutlineComment[] {
  try {
    return JSON.parse(localStorage.getItem(`lg-outline-comments:${threadId}`) || '[]');
  } catch {
    return [];
  }
}

function saveComments(threadId: string, comments: OutlineComment[]) {
  try {
    localStorage.setItem(`lg-outline-comments:${threadId}`, JSON.stringify(comments));
  } catch {}
}

// 大纲 sections → Markdown 文本
function outlineToMarkdown(sections: any[], titleParam?: string): string {
  const lines: string[] = [];
  if (titleParam) lines.push(`# ${titleParam}\n`);

  const renderSection = (section: any, depth: number) => {
    const level = Math.min(depth + 1, 6);
    const heading = '#'.repeat(level);
    lines.push(`${heading} ${section.title || '(无标题)'}`);
    if (section.content) {
      lines.push(section.content);
    }
    lines.push('');
    if (Array.isArray(section.subsections)) {
      section.subsections.forEach((sub: any) => renderSection(sub, depth + 1));
    }
  };

  sections.forEach((s) => renderSection(s, 1));
  return lines.join('\n').trim();
}

// Markdown 文本 → 大纲 sections（基于 # 标题层级）
function markdownToOutline(md: string): { title?: string; sections: any[] } {
  const lines = md.split('\n');
  let title: string | undefined;
  const root: any[] = [];
  const stack: Array<{ level: number; section: any }> = [];

  for (const rawLine of lines) {
    const line = rawLine;
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      if (level === 1 && !title && root.length === 0) {
        // 第一个 # 当作总标题
        title = heading;
        continue;
      }
      const newSection: any = { title: heading, level, content: '', subsections: [] };
      // 弹出所有比当前 level >= 的栈顶
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      if (stack.length === 0) {
        root.push(newSection);
      } else {
        stack[stack.length - 1].section.subsections.push(newSection);
      }
      stack.push({ level, section: newSection });
    } else if (line.trim()) {
      // 内容行，添加到当前栈顶 section
      if (stack.length > 0) {
        const cur = stack[stack.length - 1].section;
        cur.content = cur.content ? `${cur.content}\n${line}` : line;
      }
    }
  }

  // 清理空 subsections
  const clean = (sec: any) => {
    if (!sec.subsections || sec.subsections.length === 0) {
      delete sec.subsections;
    } else {
      sec.subsections.forEach(clean);
    }
    if (!sec.content) delete sec.content;
    delete sec.level;
  };
  root.forEach(clean);

  return { title, sections: root };
}

export function LGPlanningTab() {
  const { detail, pendingAction, onResume, resuming } = useOutletContext<LGTaskContext>();
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedOutlineText, setEditedOutlineText] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('split');
  const [editorFormat, setEditorFormat] = useState<'json' | 'markdown'>('markdown');
  const [history, setHistory] = useState<LGStateHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [comments, setComments] = useState<OutlineComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentSection, setNewCommentSection] = useState<string>('');
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  // 加载 checkpoint 历史
  useEffect(() => {
    const threadId = detail?.threadId;
    if (!threadId) return;
    setLoadingHistory(true);
    langgraphApi.getStateHistory(threadId, 10)
      .then(res => setHistory(res.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [detail?.threadId]);

  // 加载评论
  useEffect(() => {
    if (!detail?.threadId) return;
    setComments(loadComments(detail.threadId));
  }, [detail?.threadId]);

  // 加载多源发现数据（折叠展开时按需加载）
  useEffect(() => {
    if (!showDiscovery || hotTopics.length > 0) return;
    setDiscoveryLoading(true);
    hotTopicsApi.getAll({ limit: 10 })
      .then((res) => setHotTopics(res.items || []))
      .catch(() => setHotTopics([]))
      .finally(() => setDiscoveryLoading(false));
  }, [showDiscovery, hotTopics.length]);

  // AI 排名计算（基于话题与当前 detail.topic 的关键词重叠度）
  const computeRelevance = (text: string): number => {
    if (!detail?.topic) return 50;
    const topicWords = detail.topic.toLowerCase().split(/[\s,，。\/]+/).filter(w => w.length >= 2);
    const textLower = text.toLowerCase();
    let matches = 0;
    topicWords.forEach(w => { if (textLower.includes(w)) matches += 1; });
    return Math.min(100, 30 + matches * 25);
  };

  const toggleTopicSelection = (id: string) => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addComment = () => {
    if (!newCommentText.trim() || !detail?.threadId) return;
    const next: OutlineComment = {
      id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sectionTitle: newCommentSection,
      author: 'You',
      content: newCommentText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [next, ...comments];
    setComments(updated);
    saveComments(detail.threadId, updated);
    setNewCommentText('');
    setNewCommentSection('');
  };

  const deleteComment = (id: string) => {
    if (!detail?.threadId) return;
    const updated = comments.filter((c) => c.id !== id);
    setComments(updated);
    saveComments(detail.threadId, updated);
  };

  // 收集所有 outline section title 作为下拉选项
  const sectionTitles: string[] = [];
  if (detail?.outline?.sections) {
    const collect = (secs: any[]) => {
      secs.forEach((s) => {
        if (s.title) sectionTitles.push(s.title);
        if (Array.isArray(s.subsections)) collect(s.subsections);
      });
    };
    collect(detail.outline.sections);
  }

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  // 开始编辑大纲
  const startEditing = () => {
    if (detail?.outline) {
      if (editorFormat === 'json') {
        setEditedOutlineText(JSON.stringify(detail.outline.sections || [], null, 2));
      } else {
        setEditedOutlineText(outlineToMarkdown(detail.outline.sections || [], detail.outline.title));
      }
    }
    setEditing(true);
  };

  // 切换编辑格式时转换文本
  const switchFormat = (newFormat: 'json' | 'markdown') => {
    if (newFormat === editorFormat) return;
    try {
      let next = '';
      if (newFormat === 'markdown') {
        // JSON → MD
        const parsed = JSON.parse(editedOutlineText || '[]');
        next = outlineToMarkdown(Array.isArray(parsed) ? parsed : parsed.sections || [], detail?.outline?.title);
      } else {
        // MD → JSON
        const { sections } = markdownToOutline(editedOutlineText || '');
        next = JSON.stringify(sections, null, 2);
      }
      setEditedOutlineText(next);
      setEditorFormat(newFormat);
    } catch {
      // 转换失败仅切换格式，不动文本
      setEditorFormat(newFormat);
    }
  };

  const handleConfirm = async () => {
    // 如果用户编辑了大纲，解析并传递
    let editedOutline: any = undefined;
    if (editing && editedOutlineText.trim()) {
      try {
        if (editorFormat === 'json') {
          const parsed = JSON.parse(editedOutlineText);
          editedOutline = { sections: parsed, title: detail?.outline?.title };
        } else {
          const { title, sections } = markdownToOutline(editedOutlineText);
          editedOutline = { sections, title: title || detail?.outline?.title };
        }
      } catch {
        // parse failed, ignore edit
      }
    }
    // onResume 的第三个参数为 outline（通过 LGTaskContext.onResume 扩展）
    await (onResume as any)(true, feedback, editedOutline);
    setFeedback('');
    setEditing(false);
  };

  // 计算预览内容（markdown 格式时）
  const previewMarkdown = (() => {
    if (editorFormat === 'markdown') return editedOutlineText;
    try {
      const parsed = JSON.parse(editedOutlineText || '[]');
      return outlineToMarkdown(Array.isArray(parsed) ? parsed : parsed.sections || [], detail?.outline?.title);
    } catch {
      return '_无效的 JSON 格式_';
    }
  })();

  const handleReject = async () => {
    await onResume(false, feedback);
    setFeedback('');
    setEditing(false);
  };

  return (
    <div className="tab-panel">
      {/* 人工确认面板 */}
      {pendingAction === 'outline_review' && (
        <div className="lg-action-panel" style={{ marginBottom: '24px' }}>
          <h3 className="lg-action-title">大纲确认</h3>
          <p className="lg-action-desc">
            {detail.evaluation?.passed
              ? '大纲已生成，请审阅后确认进入研究阶段'
              : `选题评分 ${detail.evaluation?.score || '?'} 分，建议调整角度后再继续`
            }
          </p>
          {/* 编辑大纲模式 — 三模式 */}
          {editing && (
            <div className="lg-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="lg-label" style={{ margin: 0 }}>编辑大纲结构</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* 格式切换 */}
                  <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--divider)' }}>
                    {(['markdown', 'json'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => switchFormat(f)}
                        style={{
                          padding: '4px 12px',
                          fontSize: '11px',
                          border: 'none',
                          background: editorFormat === f ? 'var(--primary)' : 'var(--surface)',
                          color: editorFormat === f ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* 视图模式切换 */}
                  <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--divider)' }}>
                    {(['edit', 'split', 'preview'] as const).map((m) => {
                      const labels = { edit: '编辑', split: '分屏', preview: '预览' };
                      const icons = { edit: 'edit', split: 'splitscreen', preview: 'visibility' };
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setEditorMode(m)}
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            border: 'none',
                            background: editorMode === m ? 'var(--primary)' : 'var(--surface)',
                            color: editorMode === m ? '#fff' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                            {icons[m]}
                          </span>
                          {labels[m]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    editorMode === 'split' ? '1fr 1fr' : '1fr',
                  gap: '12px',
                  border: '1px solid var(--divider)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                {/* 编辑区 */}
                {(editorMode === 'edit' || editorMode === 'split') && (
                  <textarea
                    className="lg-textarea"
                    value={editedOutlineText}
                    onChange={e => setEditedOutlineText(e.target.value)}
                    rows={16}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      border: 'none',
                      borderRadius: 0,
                      resize: 'vertical',
                      minHeight: '300px',
                    }}
                  />
                )}

                {/* 预览区 */}
                {(editorMode === 'preview' || editorMode === 'split') && (
                  <div
                    style={{
                      padding: '12px 16px',
                      maxHeight: '400px',
                      overflow: 'auto',
                      background: 'var(--surface-alt)',
                      borderLeft: editorMode === 'split' ? '1px solid var(--divider)' : 'none',
                      fontSize: '13px',
                    }}
                  >
                    <MarkdownRenderer content={previewMarkdown} />
                  </div>
                )}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {editorFormat === 'markdown'
                  ? '使用 Markdown 标题语法 (#, ##, ###) 表示章节层级。提交时自动转换为 LangGraph outline 结构。'
                  : 'JSON 数组格式，每项包含 title, content, subsections 字段。'}
              </div>
            </div>
          )}

          <div className="lg-form-group">
            <textarea
              className="lg-textarea"
              placeholder="反馈意见（可选，退回时将作为修改建议）"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
            />
          </div>
          <div className="lg-action-buttons">
            {!editing && (
              <button className="lg-btn lg-btn-secondary" onClick={startEditing} disabled={resuming}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>edit</span>
                编辑大纲
              </button>
            )}
            {editing && (
              <button className="lg-btn lg-btn-secondary" onClick={() => setEditing(false)} disabled={resuming}>
                取消编辑
              </button>
            )}
            <button className="lg-btn lg-btn-danger" onClick={handleReject} disabled={resuming}>
              {resuming ? '处理中...' : '退回修改'}
            </button>
            <button className="lg-btn lg-btn-primary" onClick={handleConfirm} disabled={resuming}>
              {resuming ? '处理中...' : editing ? '确认并提交修改' : '确认大纲'}
            </button>
          </div>
        </div>
      )}

      {/* 大纲结构 */}
      <div className="panel-grid">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">article</span>
            大纲结构
          </div>
          <div className="section-desc">LangGraph Planner 生成的文章大纲</div>
        </div>

        {detail.outline ? (
          <div className="info-card full-width">
            {detail.outline.title && (
              <div className="card-title">
                <span className="material-symbols-outlined">title</span>
                {detail.outline.title}
              </div>
            )}
            <div className="lg-outline-tree">
              {(detail.outline.sections || []).map((section: any, i: number) => (
                <OutlineSection key={i} section={section} index={i + 1} />
              ))}
            </div>
          </div>
        ) : (
          <div className="info-card full-width">
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              大纲尚未生成
            </p>
          </div>
        )}
      </div>

      {/* 多源发现 + AI 排名 (P1+P2) */}
      <div className="panel-grid" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <div
            className="section-title"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowDiscovery(!showDiscovery)}
          >
            <span className="material-symbols-outlined">explore</span>
            多源情报发现
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              {showDiscovery ? 'expand_less' : 'expand_more'}
            </span>
          </div>
          <div className="section-desc">RSS / 热点话题 / 全网搜索 — 辅助选题决策</div>
        </div>

        {showDiscovery && (
          <>
            {discoveryLoading ? (
              <div className="info-card full-width" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                正在加载情报数据...
              </div>
            ) : hotTopics.length === 0 ? (
              <div className="info-card full-width" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                暂无情报数据，可在「内容情报中心」添加 RSS 源或刷新热点
              </div>
            ) : (
              <>
                {/* AI 排名摘要 */}
                <div
                  className="info-card full-width"
                  style={{
                    background: 'linear-gradient(90deg, hsla(199, 89%, 48%, 0.05), transparent)',
                    borderLeft: '3px solid #3b82f6',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>auto_awesome</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>AI 排名引擎</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        基于当前选题「{detail.topic}」与情报内容的关键词重叠度智能排序
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      已选 {selectedTopics.size} 项
                    </span>
                  </div>
                </div>

                {/* 热点话题列表 */}
                <div className="info-card full-width">
                  <div className="card-title">
                    <span className="material-symbols-outlined">local_fire_department</span>
                    热点话题（按 AI 相关度排序）
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[...hotTopics]
                      .map((t: any) => ({ ...t, _relevance: computeRelevance(t.name || t.topic || t.title || '') }))
                      .sort((a, b) => b._relevance - a._relevance)
                      .map((topic: any, i: number) => {
                        const id = topic.id || `topic-${i}`;
                        const isSelected = selectedTopics.has(id);
                        const relevanceColor =
                          topic._relevance >= 75 ? '#22c55e' : topic._relevance >= 55 ? '#3b82f6' : '#64748b';
                        return (
                          <div
                            key={id}
                            onClick={() => toggleTopicSelection(id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: isSelected ? 'hsla(210, 80%, 50%, 0.08)' : 'transparent',
                              border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ pointerEvents: 'none' }}
                            />
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', width: '24px' }}>
                              #{i + 1}
                            </span>
                            <span style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>
                              {topic.name || topic.topic || topic.title}
                            </span>
                            {/* AI 相关度评分 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '110px' }}>
                              <div style={{ flex: 1, height: '4px', background: 'var(--surface-alt)', borderRadius: '2px' }}>
                                <div
                                  style={{
                                    width: `${topic._relevance}%`,
                                    height: '100%',
                                    background: relevanceColor,
                                    borderRadius: '2px',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: relevanceColor, minWidth: '28px', textAlign: 'right' }}>
                                {topic._relevance}%
                              </span>
                            </div>
                            {topic.trend && (
                              <span
                                className="material-symbols-outlined"
                                style={{
                                  fontSize: '14px',
                                  color: topic.trend === 'up' ? '#22c55e' : topic.trend === 'down' ? '#ef4444' : '#64748b',
                                }}
                              >
                                {topic.trend === 'up' ? 'trending_up' : topic.trend === 'down' ? 'trending_down' : 'trending_flat'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* 已选项汇总 */}
                {selectedTopics.size > 0 && (
                  <div
                    className="info-card full-width"
                    style={{
                      background: 'hsla(142, 45%, 45%, 0.05)',
                      border: '1px solid hsla(142, 45%, 45%, 0.2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        已选择 {selectedTopics.size} 个情报项作为下次大纲生成的参考素材
                      </div>
                      <button
                        type="button"
                        className="lg-btn lg-btn-secondary"
                        onClick={() => setSelectedTopics(new Set())}
                        style={{ fontSize: '11px', padding: '4px 10px' }}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 评论/反馈系统 (P5) */}
      {detail.outline && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">forum</span>
              评论与反馈
            </div>
            <div className="section-desc">{comments.length} 条评论 · 本地保存</div>
          </div>
          <div className="info-card full-width">
            {/* 添加评论表单 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              <select
                className="lg-select"
                value={newCommentSection}
                onChange={(e) => setNewCommentSection(e.target.value)}
                style={{ fontSize: '12px' }}
              >
                <option value="">通用评论（不关联章节）</option>
                {sectionTitles.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <textarea
                  className="lg-textarea"
                  placeholder="输入评论或反馈意见..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  rows={2}
                  style={{ flex: 1, fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="lg-btn lg-btn-primary"
                  onClick={addComment}
                  disabled={!newCommentText.trim()}
                  style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '12px' }}
                >
                  发布
                </button>
              </div>
            </div>

            {/* 评论列表 */}
            {comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                暂无评论，输入上方文本框开始反馈
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-alt)',
                      borderLeft: '3px solid var(--primary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.author}</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
                      {c.sectionTitle && (
                        <>
                          <span style={{ color: 'var(--text-muted)' }}>·</span>
                          <span
                            style={{
                              padding: '1px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: 'var(--primary-alpha)',
                              color: 'var(--primary)',
                              fontWeight: 600,
                            }}
                          >
                            {c.sectionTitle}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        style={{
                          marginLeft: 'auto',
                          padding: '2px 8px',
                          fontSize: '10px',
                          border: '1px solid var(--divider)',
                          borderRadius: '3px',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        删除
                      </button>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>{c.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pipeline 版本历史 (Checkpoints) */}
      {history.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">history</span>
              Pipeline 版本历史
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="section-desc">{history.length} 条快照</div>
              <button
                type="button"
                className="lg-btn lg-btn-secondary"
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: showCompare ? 'hsla(210, 80%, 50%, 0.1)' : undefined,
                  color: showCompare ? '#3b82f6' : undefined,
                }}
                onClick={() => {
                  setShowCompare(!showCompare);
                  if (showCompare) setCompareSelection([]);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>compare_arrows</span>
                {showCompare ? '退出对比' : '版本对比'}
              </button>
            </div>
          </div>
          {showCompare && (
            <div
              className="info-card full-width"
              style={{
                background: 'hsla(210, 80%, 50%, 0.05)',
                border: '1px solid hsla(210, 80%, 50%, 0.2)',
                marginBottom: '12px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              💡 已选择 {compareSelection.length}/2 个 checkpoint。点击下方 checkpoint 卡片即可加入对比。
            </div>
          )}
          <div className="info-card full-width">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {history.map((item, i) => {
                const nodeLabels: Record<string, string> = {
                  planner: '选题策划', human_outline: '大纲确认', researcher: '数据研究',
                  writer: '内容写作', blue_team: '蓝军评审', human_approve: '最终审批', output: '输出发布',
                };
                const cpId = item.checkpoint_id || `idx-${i}`;
                const isSelected = compareSelection.includes(cpId);
                const handleClick = () => {
                  if (!showCompare) return;
                  if (isSelected) {
                    setCompareSelection(compareSelection.filter((id) => id !== cpId));
                  } else if (compareSelection.length < 2) {
                    setCompareSelection([...compareSelection, cpId]);
                  }
                };
                return (
                  <div
                    key={item.checkpoint_id || i}
                    onClick={handleClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected
                        ? 'hsla(210, 80%, 50%, 0.12)'
                        : i === 0
                          ? 'var(--primary-alpha)'
                          : 'transparent',
                      border: isSelected
                        ? '1px solid #3b82f6'
                        : i === 0
                          ? '1px solid var(--primary)'
                          : '1px solid transparent',
                      cursor: showCompare ? 'pointer' : 'default',
                    }}
                  >
                    {showCompare && (
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: isSelected ? '#3b82f6' : 'var(--text-muted)' }}>
                        {isSelected ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    )}
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: i === 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {i === 0 ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '12px', fontWeight: i === 0 ? 700 : 400, color: 'var(--text)' }}>
                        {nodeLabels[item.values.currentNode] || item.values.currentNode || 'unknown'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        {item.values.status} · {item.values.progress}%
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {item.checkpoint_id?.slice(0, 8) || ''}
                    </span>
                  </div>
                );
              })}
            </div>
            {loadingHistory && <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>加载中...</p>}
          </div>

          {/* 版本对比面板 */}
          {showCompare && compareSelection.length === 2 && (
            <CheckpointComparePanel
              history={history}
              selectedIds={compareSelection}
            />
          )}
        </div>
      )}

      {/* 大纲编辑实时 Diff（编辑模式时） */}
      {editing && detail.outline && (
        <OutlineEditDiffPanel
          original={detail.outline.sections || []}
          editedText={editedOutlineText}
        />
      )}

      {/* 选题评估 */}
      {detail.evaluation && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">assessment</span>
              选题评估
            </div>
          </div>

          <div className="info-card">
            <div className="card-title">
              <span className="material-symbols-outlined">score</span>
              评分概览
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div className="score-circle" style={{ width: '64px', height: '64px', flexShrink: 0 }}>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{detail.evaluation.score}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: detail.evaluation.passed ? 'var(--success)' : 'var(--warning)' }}>
                {detail.evaluation.passed ? '评估通过' : '建议调整'}
              </div>
            </div>
            {detail.evaluation.dimensions && (
              <div className="lg-quality-kv-list">
                {Object.entries(detail.evaluation.dimensions).map(([key, val]) => (
                  <div key={key} className="lg-quality-kv-row">
                    <span className="lg-quality-kv-label">{mapEvaluationDimensionLabel(key)}</span>
                    <span className="lg-quality-kv-value">{val as number} 分</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {detail.evaluation.suggestions && detail.evaluation.suggestions.length > 0 && (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">tips_and_updates</span>
                优化建议
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {normalizeSuggestions(detail.evaluation.suggestions).map((s: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 竞品分析 */}
      {detail.competitorAnalysis && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">compare_arrows</span>
              竞品分析
            </div>
          </div>
          <div className="info-card full-width">
            <CompetitorAnalysisView data={detail.competitorAnalysis} />
          </div>
        </div>
      )}
    </div>
  );
}

// 大纲 Section 递归渲染
function OutlineSection({ section, index }: { section: any; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const level = section.level || 1;
  const indent = (level - 1) * 20;

  return (
    <div style={{ marginLeft: `${indent}px`, marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
          background: level === 1 ? 'var(--primary-alpha)' : 'transparent',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
          {expanded ? 'expand_more' : 'chevron_right'}
        </span>
        <span style={{
          fontWeight: level === 1 ? 700 : 500,
          fontSize: level === 1 ? '15px' : '14px',
          color: 'var(--text)',
        }}>
          {index}. {section.title}
        </span>
      </div>
      {expanded && section.content && (
        <div style={{
          marginLeft: '32px', marginTop: '4px',
          fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          {section.content}
        </div>
      )}
      {expanded && section.subsections && section.subsections.map((sub: any, j: number) => (
        <OutlineSection key={j} section={{ ...sub, level: (sub.level || level + 1) }} index={j + 1} />
      ))}
    </div>
  );
}

// 竞品分析展示
function CompetitorAnalysisView({ data }: { data: any }) {
  if (!data) return null;

  // 字符串优先尝试解析 JSON，避免把长 JSON 原文直接渲染到页面
  if (typeof data === 'string') {
    const parsed = safeParseJson(data);
    if (parsed !== null) {
      return <CompetitorAnalysisView data={parsed} />;
    }
    return <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{data}</div>;
  }

  if (Array.isArray(data)) {
    return (
      <div className="data-review-table-wrapper">
        <table className="data-review-table">
          <thead>
            <tr>
              <th>竞品</th>
              <th>特点</th>
              <th>差异化机会</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item: any, i: number) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{item.name || item.competitor || `竞品 ${i + 1}`}</td>
                <td>{item.features || item.description || '-'}</td>
                <td>{item.opportunity || item.gap || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Object format
  const reportLikeList = extractReportLikeList(data);
  if (reportLikeList.length > 0) {
    return (
      <div className="data-review-table-wrapper">
        <table className="data-review-table">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>竞品/来源</th>
              <th style={{ width: '48%' }}>摘要</th>
              <th style={{ width: '20%' }}>相关度</th>
            </tr>
          </thead>
          <tbody>
            {reportLikeList.map((item: any, i: number) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>
                  {item.title || item.name || item.source || `条目 ${i + 1}`}
                </td>
                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {item.coreView || item.features || item.description || summarizeObject(item)}
                </td>
                <td>
                  {typeof item.relevance === 'number' ? `${item.relevance}%` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {Object.entries(data).map(([key, val]) => (
        <div key={key} className="info-item">
          <span className="label">{key}</span>
          <span className="value" style={{ maxWidth: '60%', textAlign: 'right' }}>
            {formatValue(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

function safeParseJson(text: string): any | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractReportLikeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function summarizeObject(obj: any): string {
  if (!obj || typeof obj !== 'object') return String(obj ?? '-');
  const keys = Object.keys(obj);
  return `字段: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ' ...' : ''}`;
}

function formatValue(val: any): string {
  if (val == null) return '-';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return `数组(${val.length})`;
  if (typeof val === 'object') return summarizeObject(val);
  return String(val);
}

function mapEvaluationDimensionLabel(key: string): string {
  const labelMap: Record<string, string> = {
    dataAvailability: '数据可得性',
    topicHeat: '选题热度',
    differentiation: '差异化',
    timeliness: '时效性',
    credibility: '可信度',
    novelty: '新颖性',
    audienceFit: '受众匹配',
  };
  return labelMap[key] || key;
}

function normalizeSuggestions(input: any): string[] {
  if (Array.isArray(input)) return input.map(x => String(x)).filter(Boolean);
  if (typeof input === 'string') return [input];
  return [];
}

// Checkpoint 对比面板：side-by-side 展示两个 checkpoint 的状态字段差异
function CheckpointComparePanel({
  history,
  selectedIds,
}: {
  history: LGStateHistoryItem[];
  selectedIds: string[];
}) {
  const cp1 = history.find((h) => (h.checkpoint_id || '') === selectedIds[0]);
  const cp2 = history.find((h) => (h.checkpoint_id || '') === selectedIds[1]);
  if (!cp1 || !cp2) return null;

  const fields: Array<{ key: keyof LGStateHistoryItem['values']; label: string }> = [
    { key: 'currentNode', label: '当前节点' },
    { key: 'status', label: '状态' },
    { key: 'progress', label: '进度 %' },
    { key: 'outlineApproved', label: '大纲已批准' },
    { key: 'reviewPassed', label: '评审通过' },
    { key: 'hasOutline', label: '已生成大纲' },
    { key: 'hasDraft', label: '已生成草稿' },
    { key: 'blueTeamRoundsCount', label: '评审轮数' },
  ];

  const formatVal = (v: any) => {
    if (v === true) return '✓';
    if (v === false) return '✗';
    if (v == null || v === '') return '-';
    return String(v);
  };

  return (
    <div className="info-card full-width" style={{ marginTop: '12px' }}>
      <div className="card-title">
        <span className="material-symbols-outlined">compare_arrows</span>
        Checkpoint 对比
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
        <div style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #3b82f6' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Checkpoint A</div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{cp1.checkpoint_id?.slice(0, 16)}...</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{new Date(cp1.createdAt).toLocaleString('zh-CN')}</div>
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #22c55e' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Checkpoint B</div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{cp2.checkpoint_id?.slice(0, 16)}...</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{new Date(cp2.createdAt).toLocaleString('zh-CN')}</div>
        </div>
      </div>
      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>字段</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#3b82f6', fontWeight: 600 }}>A</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#22c55e', fontWeight: 600 }}>B</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, width: '60px' }}>变更</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const v1 = (cp1.values as any)[f.key];
            const v2 = (cp2.values as any)[f.key];
            const changed = v1 !== v2;
            return (
              <tr
                key={f.key}
                style={{
                  borderBottom: '1px solid var(--divider)',
                  background: changed ? 'hsla(45, 90%, 50%, 0.05)' : undefined,
                }}
              >
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{f.label}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{formatVal(v1)}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{formatVal(v2)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {changed ? (
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>●</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 大纲编辑实时 Diff 面板
function OutlineEditDiffPanel({
  original,
  editedText,
}: {
  original: any[];
  editedText: string;
}) {
  let edited: any[] = [];
  let parseError: string | null = null;
  try {
    if (editedText.trim()) {
      edited = JSON.parse(editedText);
    }
  } catch (e: any) {
    parseError = 'JSON 解析失败：' + (e.message || 'invalid JSON');
  }

  const originalTitles = original.map((s) => s?.title || '').filter(Boolean);
  const editedTitles = edited.map((s) => s?.title || '').filter(Boolean);

  // 计算差异（基于 title 集合）
  const added = editedTitles.filter((t) => !originalTitles.includes(t));
  const removed = originalTitles.filter((t) => !editedTitles.includes(t));
  const kept = editedTitles.filter((t) => originalTitles.includes(t));

  return (
    <div className="panel-grid" style={{ marginTop: '24px' }}>
      <div className="section-header">
        <div className="section-title">
          <span className="material-symbols-outlined">difference</span>
          编辑 Diff
        </div>
        <div className="section-desc">实时显示你的编辑相对原大纲的变化</div>
      </div>
      <div className="info-card full-width">
        {parseError ? (
          <div style={{ color: '#ef4444', fontSize: '12px', padding: '8px' }}>{parseError}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span>
                新增 ({added.length})
              </div>
              {added.length > 0 ? (
                added.map((t, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text)', padding: '4px 6px', background: 'hsla(142, 45%, 45%, 0.08)', borderRadius: '3px', marginBottom: '3px' }}>
                    + {t}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>无</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>remove_circle</span>
                删除 ({removed.length})
              </div>
              {removed.length > 0 ? (
                removed.map((t, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text)', padding: '4px 6px', background: 'hsla(0, 72%, 51%, 0.08)', borderRadius: '3px', marginBottom: '3px' }}>
                    - {t}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>无</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>radio_button_checked</span>
                保留 ({kept.length})
              </div>
              {kept.length > 0 ? (
                kept.slice(0, 5).map((t, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 6px', marginBottom: '3px' }}>
                    {t}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>无</div>
              )}
              {kept.length > 5 && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  以及 {kept.length - 5} 个其他章节...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
