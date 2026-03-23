/**
 * InlineAnnotationArea - 行内批注与反馈锚定区
 * 
 * 用于显示行内批注、反馈和高亮，支持不同严重程度的标记
 * 参考设计: Expert Review Stage 4 的标注互动列表
 */
import { useState } from 'react';

export type AnnotationSeverity = 'critical' | 'warning' | 'info' | 'praise';

export interface Annotation {
  id: string;
  /** 批注内容 */
  content: string;
  /** 严重程度 */
  severity: AnnotationSeverity;
  /** 作者/来源 */
  author?: string;
  /** 时间 */
  timestamp?: string;
  /** 关联的文本位置 */
  location?: string;
  /** 建议 */
  suggestion?: string;
  /** 是否已解决 */
  resolved?: boolean;
}

export interface InlineAnnotationAreaProps {
  /** 批注列表 */
  annotations: Annotation[];
  /** 标题 */
  title?: string;
  /** 图标 */
  icon?: string;
  /** 选择回调 */
  onSelect?: (annotation: Annotation) => void;
  /** 解决回调 */
  onResolve?: (id: string) => void;
  /** 自定义类名 */
  className?: string;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否折叠 */
  defaultCollapsed?: boolean;
}

const severityConfig: Record<AnnotationSeverity, { 
  label: string; 
  icon: string; 
  bgColor: string; 
  borderColor: string;
  textColor: string;
}> = {
  critical: {
    label: '严重',
    icon: 'error',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-700 dark:text-red-400',
  },
  warning: {
    label: '警告',
    icon: 'warning',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-700 dark:text-orange-400',
  },
  info: {
    label: '提示',
    icon: 'info',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
  praise: {
    label: '赞赏',
    icon: 'thumb_up',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-400',
  },
};

export function InlineAnnotationArea({
  annotations,
  title = 'Feedback & Annotations',
  icon = 'chat',
  onSelect,
  onResolve,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
}: InlineAnnotationAreaProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (annotation: Annotation) => {
    setSelectedId(annotation.id);
    onSelect?.(annotation);
  };

  const handleResolve = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onResolve?.(id);
  };

  // 按严重程度分组统计
  const severityCounts = annotations.reduce((acc, ann) => {
    acc[ann.severity] = (acc[ann.severity] || 0) + 1;
    return acc;
  }, {} as Record<AnnotationSeverity, number>);

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
      {/* Header */}
      <div 
        className={`flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 ${
          collapsible ? 'cursor-pointer' : ''
        }`}
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500">{icon}</span>
          <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded-full">
            {annotations.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 严重程度徽章 */}
          {(['critical', 'warning', 'info', 'praise'] as AnnotationSeverity[]).map((sev) => (
            severityCounts[sev] > 0 && (
              <span 
                key={sev}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severityConfig[sev].bgColor} ${severityConfig[sev].textColor}`}
              >
                {severityConfig[sev].label} {severityCounts[sev]}
              </span>
            )
          ))}
          {collapsible && (
            <span className="material-symbols-outlined text-slate-400">
              {collapsed ? 'expand_more' : 'expand_less'}
            </span>
          )}
        </div>
      </div>

      {/* Annotation List */}
      {!collapsed && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {annotations.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <span className="material-symbols-outlined text-3xl mb-2">check_circle</span>
              <p className="text-sm">No annotations</p>
            </div>
          ) : (
            annotations.map((annotation) => {
              const config = severityConfig[annotation.severity];
              const isSelected = selectedId === annotation.id;
              
              return (
                <div
                  key={annotation.id}
                  className={`p-4 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    isSelected ? 'bg-slate-50 dark:bg-slate-800/50' : ''
                  } ${annotation.resolved ? 'opacity-50' : ''}`}
                  onClick={() => handleSelect(annotation)}
                >
                  <div className="flex items-start gap-3">
                    {/* Severity Indicator */}
                    <div className={`w-1 h-full min-h-[40px] rounded-full ${config.bgColor.replace('bg-', 'bg-').replace('/20', '').replace('/50', '')}`} />
                    
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.bgColor} ${config.textColor}`}>
                            {config.label}
                          </span>
                          {annotation.location && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {annotation.location}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {annotation.timestamp && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(annotation.timestamp).toLocaleString()}
                            </span>
                          )}
                          {onResolve && !annotation.resolved && (
                            <button
                              onClick={(e) => handleResolve(e, annotation.id)}
                              className="p-1 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                              title="标记为已解决"
                            >
                              <span className="material-symbols-outlined text-sm">check</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <p className={`text-sm mb-1 ${annotation.resolved ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {annotation.content}
                      </p>

                      {/* Suggestion */}
                      {annotation.suggestion && (
                        <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-medium">建议:</span> {annotation.suggestion}
                        </div>
                      )}

                      {/* Author */}
                      {annotation.author && (
                        <div className="mt-2 text-[10px] text-slate-400">
                          by {annotation.author}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
