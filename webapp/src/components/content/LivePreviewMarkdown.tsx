/**
 * LivePreviewMarkdown - 内容直播预览舱
 * 
 * 用于 Markdown 内容的实时预览，支持预览/源码模式切换和文本高亮
 * 参考设计: Copy Generation Stepped Pipeline 的 Markdown 预览容器
 */
import { useState } from 'react';
import { MarkdownRenderer, type HighlightItem } from '../MarkdownRenderer';

export interface LivePreviewMarkdownProps {
  /** 内容标题 */
  title?: string;
  /** Markdown 内容 */
  content: string;
  /** 当前版本号 */
  version?: number;
  /** 底部额外操作区域 */
  footerActions?: React.ReactNode;
  /** 额外头部操作 */
  headerActions?: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 最小高度 */
  minHeight?: string;
  /** 是否显示头部 */
  showHeader?: boolean;
  /** 是否显示底部 */
  showFooter?: boolean;
  /** 高亮文本列表 */
  highlights?: HighlightItem[];
}

type ViewMode = 'rendered' | 'source';

export function LivePreviewMarkdown({
  title = 'Live Editor Preview',
  content,
  version,
  footerActions,
  headerActions,
  className = '',
  minHeight = '600px',
  showHeader = true,
  showFooter = false,
  highlights = [],
}: LivePreviewMarkdownProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('rendered');

  return (
    <div 
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-black/[0.03] flex flex-col ${className}`}
      style={{ minHeight }}
    >
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-t-2xl">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</span>
            <div className="flex gap-1 bg-white dark:bg-slate-800 p-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setViewMode('rendered')} 
                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                  viewMode === 'rendered' 
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' 
                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Preview
              </button>
              <button 
                onClick={() => setViewMode('source')} 
                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                  viewMode === 'source' 
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' 
                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Source
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {version !== undefined && (
              <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded border border-indigo-100 dark:border-indigo-800">
                Version {version}
              </div>
            )}
            {headerActions}
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30 relative">
        {viewMode === 'rendered' ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer 
              content={content} 
              highlights={highlights}
            />
          </div>
        ) : (
          <pre className="w-full h-full whitespace-pre-wrap font-mono text-sm text-slate-700 dark:text-slate-300">
            <code>{content}</code>
          </pre>
        )}
      </div>

      {/* Footer */}
      {showFooter && footerActions && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 rounded-b-2xl">
          {footerActions}
        </div>
      )}
    </div>
  );
}
