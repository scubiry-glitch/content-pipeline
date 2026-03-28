/**
 * DocumentEditor - 统一文档编辑器组件
 * 
 * 结合 code.html 和 EditorPipeline.html 的设计：
 * - 左侧：文档正文区域（带高亮标注支持）
 * - 右侧：评论/反馈面板（带标签切换）
 * 
 * 使用 8:4 网格布局（桌面端），移动端堆叠显示
 */

import { useState, useMemo } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { Annotation } from './content';

export type CommentTab = 'comments' | 'history' | 'tasks';

export interface CommentItem {
  id: string;
  content: string;
  author: string;
  authorType: 'ai' | 'human';
  authorRole?: string;
  authorAvatar?: string;
  severity: 'critical' | 'warning' | 'info' | 'praise';
  timestamp: string;
  location?: string;
  suggestion?: string;
  status: 'pending' | 'accepted' | 'ignored';
  rawDecision?: string;
}

export interface HistoryItem {
  id: string;
  version: string;
  title: string;
  timestamp: string;
  author?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignee?: string;
}

export interface DocumentEditorProps {
  /** 文档标题 */
  title?: string;
  /** Markdown 内容 */
  content: string;
  /** 评论列表 */
  comments?: CommentItem[];
  /** 历史版本列表 */
  history?: HistoryItem[];
  /** 任务列表 */
  tasks?: TaskItem[];
  /** 当前版本号 */
  version?: string;
  /** 高亮配置（用于标记文本位置） */
  highlights?: Array<{
    id: string;
    text: string;
    color: 'blue' | 'orange' | 'red';
  }>;
  /** 评论操作回调 */
  onCommentAccept?: (id: string) => void;
  onCommentIgnore?: (id: string) => void;
  onCommentSelect?: (id: string) => void;
  /** 历史版本点击回调 */
  onHistorySelect?: (item: HistoryItem) => void;
  /** 任务操作回调 */
  onTaskToggle?: (id: string) => void;
  /** 自定义类名 */
  className?: string;
  /** 是否显示头部 */
  showHeader?: boolean;
  /** 默认激活的标签页 */
  defaultTab?: CommentTab;
  /** 质量指标 */
  metrics?: {
    readability?: number;
    factCheck?: number;
    wordCount?: number;
  };
  /** 批量选择模式 */
  selectMode?: boolean;
  /** 已选择的评论 */
  selectedComments?: Set<string>;
  /** 切换选择回调 */
  onToggleSelect?: (id: string) => void;
}

const severityConfig = {
  critical: {
    label: 'Critical',
    icon: 'error',
    borderColor: 'border-l-error',
    bgColor: 'bg-error/5',
    iconColor: 'text-error',
  },
  warning: {
    label: 'Warning',
    icon: 'warning',
    borderColor: 'border-l-tertiary',
    bgColor: 'bg-tertiary/5',
    iconColor: 'text-tertiary',
  },
  info: {
    label: 'Info',
    icon: 'info',
    borderColor: 'border-l-primary',
    bgColor: 'bg-primary/5',
    iconColor: 'text-primary',
  },
  praise: {
    label: 'Praise',
    icon: 'thumb_up',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-500',
  },
};

const roleIcons: Record<string, string> = {
  challenger: 'bolt',
  expander: 'open_in_full',
  synthesizer: 'hub',
  fact_checker: 'fact_check',
  logic_checker: 'rule',
  domain_expert: 'school',
  reader_rep: 'visibility',
  default: 'person',
};

export function DocumentEditor({
  title = 'Document',
  content,
  comments = [],
  history = [],
  tasks = [],
  version,
  highlights = [],
  onCommentAccept,
  onCommentIgnore,
  onCommentSelect,
  onHistorySelect,
  onTaskToggle,
  className = '',
  showHeader = true,
  defaultTab = 'comments',
  metrics,
  selectMode = false,
  selectedComments = new Set(),
  onToggleSelect,
}: DocumentEditorProps) {
  const [activeTab, setActiveTab] = useState<CommentTab>(defaultTab);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  
  // Debug: log content
  console.log('[DocumentEditor] Content length:', content?.length, 'Preview:', content?.slice(0, 100));

  // 处理带高亮的文本渲染
  const renderContent = useMemo(() => {
    if (!highlights.length) return content;
    
    // 简单的文本替换高亮（实际项目中可能需要更复杂的标记系统）
    let processedContent = content;
    highlights.forEach(h => {
      const colorClass = {
        blue: 'bg-blue-50 border-b-2 border-blue-400',
        orange: 'bg-orange-50 border-b-2 border-orange-400',
        red: 'bg-red-50 border-b-2 border-red-400',
      }[h.color];
      
      // 使用 span 包裹高亮文本
      processedContent = processedContent.replace(
        h.text,
        `<span class="${colorClass} px-1 cursor-help transition-colors hover:brightness-95" data-highlight-id="${h.id}">${h.text}</span>`
      );
    });
    return processedContent;
  }, [content, highlights]);

  const handleCommentClick = (comment: CommentItem) => {
    setSelectedCommentId(comment.id);
    onCommentSelect?.(comment.id);
  };

  const pendingComments = comments.filter(c => c.status === 'pending');
  const acceptedComments = comments.filter(c => c.status === 'accepted');
  const ignoredComments = comments.filter(c => c.status === 'ignored');

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden ${className}`}>
      {/* Editor Header */}
      {showHeader && (
        <div className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary">edit_document</span>
              <div>
                <h2 className="font-headline font-bold text-lg leading-none">{title}</h2>
                {version && (
                  <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-tighter">
                    Version {version}
                  </p>
                )}
              </div>
            </div>
            
            {/* Quality Metrics */}
            {metrics && (
              <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                {metrics.readability !== undefined && (
                  <div className="flex items-center gap-2 border-r border-slate-200 dark:border-slate-700 pr-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Readability</span>
                    <span className="text-sm font-bold text-primary">{metrics.readability}%</span>
                  </div>
                )}
                {metrics.factCheck !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Fact-Check</span>
                    <span className="text-sm font-bold text-tertiary">{metrics.factCheck}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid - 无高度限制，根据内容自适应 */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left: Document Content */}
        <div className="lg:col-span-8 p-8 border-r border-slate-200 dark:border-slate-800">
          <div className="document-content" style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            fontSize: '15px',
            lineHeight: '1.7',
            color: '#1f2937',
            minHeight: '400px'
          }}>
            {content ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
            ) : (
              <div className="text-center text-slate-400 py-12">
                <p>No content available</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Comments Panel - 无高度限制 */}
        <div className="lg:col-span-4 bg-slate-50/50 dark:bg-slate-900/30">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <button
              onClick={() => setActiveTab('comments')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'comments'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-sm">forum</span>
              Comments ({pendingComments.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'history'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-sm">history</span>
              History
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'tasks'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Tasks ({tasks.length})
            </button>
          </div>

          {/* Panel Content - 无高度限制 */}
          <div className="p-4 space-y-3">
            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <>
                {pendingComments.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                    <p className="text-sm">No pending comments</p>
                  </div>
                ) : (
                  pendingComments.map((comment) => {
                    const config = severityConfig[comment.severity];
                    const isSelected = selectedCommentId === comment.id;
                    const icon = roleIcons[comment.authorRole || 'default'];

                    return (
                      <div
                        key={comment.id}
                        onClick={() => !selectMode && handleCommentClick(comment)}
                        className={`bg-white dark:bg-slate-900 p-4 rounded-xl border-l-4 ${config.borderColor} shadow-sm space-y-2 transition-all hover:shadow-md ${
                          isSelected ? 'ring-2 ring-primary/20' : ''
                        } ${selectMode ? '' : 'cursor-pointer'}`}
                      >
                        {/* Header with Checkbox */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {/* 批量选择复选框 */}
                            {selectMode && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleSelect?.(comment.id);
                                }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  selectedComments.has(comment.id)
                                    ? 'bg-primary border-primary'
                                    : 'border-slate-300 hover:border-primary'
                                }`}
                              >
                                {selectedComments.has(comment.id) && (
                                  <span className="material-symbols-outlined text-white text-sm">check</span>
                                )}
                              </button>
                            )}
                            {comment.authorType === 'ai' ? (
                              <div className={`w-6 h-6 rounded-full ${config.bgColor} flex items-center justify-center`}>
                                <span className={`material-symbols-outlined text-[14px] ${config.iconColor}`}>{icon}</span>
                              </div>
                            ) : (
                              <img
                                src={comment.authorAvatar || '/default-avatar.png'}
                                alt={comment.author}
                                className="w-6 h-6 rounded-full border border-slate-200"
                              />
                            )}
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              {comment.author}
                            </span>
                            {comment.authorRole && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                                {comment.authorRole}
                              </span>
                            )}
                          </div>
                          {comment.location && (
                            <span className="text-[10px] text-slate-400 font-mono">{comment.location}</span>
                          )}
                        </div>

                        {/* Content */}
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          "{comment.content}"
                        </p>

                        {/* Suggestion */}
                        {comment.suggestion && (
                          <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-[11px] text-slate-500">
                            <span className="font-medium">Suggestion:</span> {comment.suggestion}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const btn = e.currentTarget;
                              btn.classList.add('scale-95', 'bg-green-500', 'text-white');
                              btn.classList.remove('bg-primary/10', 'text-primary');
                              setTimeout(() => {
                                onCommentAccept?.(comment.id);
                              }, 200);
                            }}
                            className="flex-1 py-1.5 text-[10px] font-bold bg-primary/10 text-primary rounded-md hover:bg-primary/20 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center gap-1 group"
                          >
                            <span className="material-symbols-outlined text-[12px] transition-transform group-hover:rotate-12">check</span>
                            Accept
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const btn = e.currentTarget;
                              btn.classList.add('scale-95', 'bg-slate-400', 'text-white');
                              btn.classList.remove('border-slate-200', 'text-slate-500');
                              setTimeout(() => {
                                onCommentIgnore?.(comment.id);
                              }, 200);
                            }}
                            className="flex-1 py-1.5 text-[10px] font-bold border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:border-slate-300 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center gap-1 group"
                          >
                            <span className="material-symbols-outlined text-[12px] transition-transform group-hover:rotate-90">close</span>
                            Ignore
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Resolved Comments Summary */}
                {(acceptedComments.length > 0 || ignoredComments.length > 0) && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Resolved ({acceptedComments.length + ignoredComments.length})
                    </span>
                    <div className="mt-2 space-y-2 opacity-60">
                      {acceptedComments.slice(0, 3).map((comment) => (
                        <div key={comment.id} className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="material-symbols-outlined text-green-500 text-sm">check</span>
                          <span className="line-through flex-1 truncate">{comment.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <>
                {history.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-2">history</span>
                    <p className="text-sm">No version history</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onHistorySelect?.(item)}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">
                            description
                          </span>
                          <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {item.title}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {item.author} • {new Date(item.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-slate-400">{item.version}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <>
                {tasks.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                    <p className="text-sm">No pending tasks</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                      >
                        <button
                          onClick={() => onTaskToggle?.(task.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            task.status === 'completed'
                              ? 'bg-green-500 border-green-500'
                              : 'border-slate-300 hover:border-primary'
                          }`}
                        >
                          {task.status === 'completed' && (
                            <span className="material-symbols-outlined text-white text-sm">check</span>
                          )}
                        </button>
                        <div className="flex-1">
                          <div className={`text-sm ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {task.title}
                          </div>
                          {task.assignee && (
                            <div className="text-[10px] text-slate-400">@{task.assignee}</div>
                          )}
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${
                            task.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : task.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
