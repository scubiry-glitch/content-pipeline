/**
 * VersionTimeline - 版本时间轴与比对舱
 * 
 * 用于展示内容版本历史的时间轴，支持版本对比和回滚
 * 参考设计: Copy Generation Stepped Pipeline 的版本历史侧边栏
 */
import { useState } from 'react';

export interface Version {
  id: string;
  version: number;
  /** 创建时间 */
  created_at: string;
  /** 变更摘要 */
  change_summary?: string;
  /** 创建者 */
  created_by?: string;
  /** 版本内容（可选，用于预览） */
  content?: string;
}

export interface VersionTimelineProps {
  /** 版本列表 */
  versions: Version[];
  /** 当前版本号 */
  currentVersion?: number;
  /** 选中的版本 */
  selectedVersion?: number | null;
  /** 版本选择回调 */
  onVersionSelect?: (version: number) => void;
  /** 版本回滚回调 */
  onRollback?: (version: number) => void;
  /** 查看版本详情回调 */
  onViewDetail?: (version: Version) => void;
  /** 标题 */
  title?: string;
  /** 图标 */
  icon?: string;
  /** 自定义类名 */
  className?: string;
  /** 最大高度 */
  maxHeight?: string;
  /** 是否显示对比模式开关 */
  enableCompare?: boolean;
  /** 对比模式回调 */
  onCompare?: (versions: [number, number]) => void;
}

export function VersionTimeline({
  versions,
  currentVersion,
  selectedVersion,
  onVersionSelect,
  onRollback,
  onViewDetail,
  title = 'Version Timeline',
  icon = 'history',
  className = '',
  maxHeight = '600px',
  enableCompare = false,
  onCompare,
}: VersionTimelineProps) {
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  const [hoveredVersion, setHoveredVersion] = useState<number | null>(null);

  // 按版本号降序排列
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

  const handleVersionClick = (version: number) => {
    if (compareMode) {
      // 对比模式：选择/取消选择版本
      if (compareSelection.includes(version)) {
        setCompareSelection(compareSelection.filter(v => v !== version));
      } else if (compareSelection.length < 2) {
        const newSelection = [...compareSelection, version];
        setCompareSelection(newSelection);
        if (newSelection.length === 2 && onCompare) {
          onCompare([newSelection[0], newSelection[1]]);
        }
      }
    } else {
      // 普通模式：选择版本
      onVersionSelect?.(version);
    }
  };

  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setCompareSelection([]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">{icon}</span>
            {title}
          </h3>
          {enableCompare && versions.length >= 2 && (
            <button
              onClick={toggleCompareMode}
              className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                compareMode 
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              {compareMode ? '退出对比' : '对比'}
            </button>
          )}
        </div>
        
        {/* 对比模式提示 */}
        {compareMode && (
          <div className="mt-2 text-[10px] text-slate-500">
            选择两个版本进行对比 ({compareSelection.length}/2)
          </div>
        )}
      </div>

      {/* Timeline */}
      <div 
        className="flex-1 overflow-y-auto p-4"
        style={{ maxHeight }}
      >
        {sortedVersions.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <span className="material-symbols-outlined text-3xl mb-2">history</span>
            <p className="text-sm">No versions yet</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-6">
            {sortedVersions.map((version, index) => {
              const isCurrent = version.version === currentVersion;
              const isSelected = selectedVersion === version.version;
              const isCompareSelected = compareSelection.includes(version.version);
              const isHovered = hoveredVersion === version.version;
              
              // 计算是否是连续的版本
              const prevVersion = sortedVersions[index + 1]?.version;
              const isContinuous = prevVersion !== undefined && version.version - prevVersion === 1;

              return (
                <div 
                  key={version.id}
                  className="relative pl-6"
                  onMouseEnter={() => setHoveredVersion(version.version)}
                  onMouseLeave={() => setHoveredVersion(null)}
                >
                  {/* Timeline Dot */}
                  <button
                    onClick={() => handleVersionClick(version.version)}
                    className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 transition-all ${
                      isCompareSelected
                        ? 'bg-blue-500 border-blue-500 scale-125'
                        : isCurrent
                        ? 'bg-blue-500 border-blue-500'
                        : isSelected
                        ? 'bg-white dark:bg-slate-900 border-blue-500'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    }`}
                  >
                    {isCompareSelected && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold">
                        {compareSelection.indexOf(version.version) + 1}
                      </span>
                    )}
                  </button>

                  {/* Version Card */}
                  <div 
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                        : isCurrent
                        ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-800 shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                    onClick={() => !compareMode && onViewDetail?.(version)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${
                          isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                          v{version.version}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium">
                            当前
                          </span>
                        )}
                        {index === 0 && !isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium">
                            最新
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(version.created_at)}
                      </span>
                    </div>

                    {/* Change Summary */}
                    {version.change_summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                        {version.change_summary}
                      </p>
                    )}

                    {/* Author */}
                    {version.created_by && (
                      <div className="mt-2 text-[10px] text-slate-400">
                        by {version.created_by}
                      </div>
                    )}

                    {/* Actions */}
                    {!compareMode && (isHovered || isSelected) && onRollback && !isCurrent && (
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRollback(version.version);
                          }}
                          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          回滚到此版本
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compare Action Bar */}
      {compareMode && compareSelection.length === 2 && (
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={() => onCompare?.([compareSelection[0], compareSelection[1]])}
            className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">compare</span>
            对比 v{Math.min(...compareSelection)} 与 v{Math.max(...compareSelection)}
          </button>
        </div>
      )}
    </div>
  );
}
