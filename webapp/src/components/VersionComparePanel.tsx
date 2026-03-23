// 版本对比面板 - Side-by-side Version Comparison Panel
// 参考设计: dashboard_open_editor_version_comparison_view
import { useState, useMemo } from 'react';
import type { DraftVersion } from '../types';

interface VersionComparePanelProps {
  versions?: DraftVersion[];
  currentVersion?: number;
  onRollback?: (versionId: string) => void;
  onApprove?: () => void;
  /** 初始要对比的版本号数组 [v1, v2] */
  initialCompareVersions?: [number, number];
}

interface DiffLine {
  type: 'same' | 'added' | 'removed';
  content: string;
}

export function VersionComparePanel({
  versions = [],
  currentVersion,
  onRollback,
  onApprove,
  initialCompareVersions,
}: VersionComparePanelProps) {
  const [compareSelection, setCompareSelection] = useState<number[]>(initialCompareVersions || []);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // 按版本号降序排列
  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  // 切换版本选择
  const toggleVersionSelection = (versionNum: number) => {
    if (compareSelection.includes(versionNum)) {
      const newSelection = compareSelection.filter((v) => v !== versionNum);
      setCompareSelection(newSelection);
    } else if (compareSelection.length < 2) {
      const newSelection = [...compareSelection, versionNum];
      setCompareSelection(newSelection);
    }
  };
  
  // 清除选择，回到选择模式
  const clearSelection = () => {
    setCompareSelection([]);
  };

  // 计算差异
  const getDiff = (oldText: string = '', newText: string = ''): DiffLine[] => {
    const oldLines = oldText.split('\n').filter(l => l.trim());
    const newLines = newText.split('\n').filter(l => l.trim());
    const result: DiffLine[] = [];

    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        result.push({ type: 'added', content: newLines[j] });
        j++;
      } else if (j >= newLines.length) {
        result.push({ type: 'removed', content: oldLines[i] });
        i++;
      } else if (oldLines[i] === newLines[j]) {
        result.push({ type: 'same', content: oldLines[i] });
        i++;
        j++;
      } else {
        // 简单差异：标记整行变化
        result.push({ type: 'removed', content: oldLines[i] });
        result.push({ type: 'added', content: newLines[j] });
        i++;
        j++;
      }
    }
    return result;
  };

  // 高亮行内差异
  const highlightInlineDiff = (oldLine: string, newLine: string): { old: JSX.Element; new: JSX.Element } => {
    const oldWords = oldLine.split(/(\s+)/);
    const newWords = newLine.split(/(\s+)/);
    
    const oldResult: JSX.Element[] = [];
    const newResult: JSX.Element[] = [];

    let i = 0, j = 0;
    while (i < oldWords.length || j < newWords.length) {
      if (i >= oldWords.length) {
        newResult.push(<span key={`add-${j}`} className="diff-add-inline">{newWords[j]}</span>);
        j++;
      } else if (j >= newWords.length) {
        oldResult.push(<span key={`del-${i}`} className="diff-del-inline">{oldWords[i]}</span>);
        i++;
      } else if (oldWords[i] === newWords[j]) {
        oldResult.push(<span key={`same-${i}`}>{oldWords[i]}</span>);
        newResult.push(<span key={`same-${j}`}>{newWords[j]}</span>);
        i++;
        j++;
      } else {
        oldResult.push(<span key={`del-${i}`} className="diff-del-inline">{oldWords[i]}</span>);
        newResult.push(<span key={`add-${j}`} className="diff-add-inline">{newWords[j]}</span>);
        i++;
        j++;
      }
    }

    return { old: <>{oldResult}</>, new: <>{newResult}</> };
  };

  // 计算对比结果
  const diffResult = useMemo(() => {
    if (compareSelection.length !== 2) return null;
    
    const v1 = versions.find((v) => v.version === compareSelection[0]);
    const v2 = versions.find((v) => v.version === compareSelection[1]);
    if (!v1 || !v2) return null;

    const oldVersion = v1.version < v2.version ? v1 : v2;
    const newVersion = v1.version < v2.version ? v2 : v1;

    const changes = getDiff(oldVersion.content, newVersion.content).filter(
      (l) => l.type !== 'same'
    ).length;

    return {
      oldVersion,
      newVersion,
      changes,
    };
  }, [compareSelection, versions]);

  // 计算行内差异渲染
  const inlineDiffContent = useMemo(() => {
    if (!diffResult) return null;
    
    const oldLines = (diffResult.oldVersion.content || '').split('\n').filter(l => l.trim());
    const newLines = (diffResult.newVersion.content || '').split('\n').filter(l => l.trim());
    const rows: Array<{ id: number; left?: JSX.Element; right?: JSX.Element; type: 'same' | 'changed' | 'added' | 'removed' }> = [];
    
    let i = 0, j = 0, id = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        // 纯新增行
        rows.push({ id: id++, right: <span className="diff-add-line">{newLines[j]}</span>, type: 'added' });
        j++;
      } else if (j >= newLines.length) {
        // 纯删除行
        rows.push({ id: id++, left: <span className="diff-del-line">{oldLines[i]}</span>, type: 'removed' });
        i++;
      } else if (oldLines[i] === newLines[j]) {
        // 相同行
        rows.push({ id: id++, left: <>{oldLines[i]}</>, right: <>{newLines[j]}</>, type: 'same' });
        i++;
        j++;
      } else {
        // 修改行 - 显示行内差异
        const highlighted = highlightInlineDiff(oldLines[i], newLines[j]);
        rows.push({ id: id++, left: highlighted.old, right: highlighted.new, type: 'changed' });
        i++;
        j++;
      }
    }
    
    return rows;
  }, [diffResult]);

  if (versions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl mb-3">history</span>
          <p className="text-sm">暂无历史版本</p>
        </div>
      </div>
    );
  }

  // 对比视图
  if (diffResult && inlineDiffContent) {
    return (
      <div className="h-full flex flex-col bg-surface">
        {/* 顶部元数据栏 */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">对比</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">
                v{diffResult.newVersion.version}
              </span>
              <span className="text-slate-400">→</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded">
                v{diffResult.oldVersion.version}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="material-symbols-outlined text-sm">compare_arrows</span>
              <span>检测到 <span className="font-bold text-slate-700">{diffResult.changes}</span> 处变更</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCompareSelection([])}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              退出对比
            </button>
          </div>
        </div>

        {/* 对比主体区 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：旧版本 */}
          <section className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden">
            <header className="p-4 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-600 tracking-tight">
                  v{diffResult.oldVersion.version} 旧版本
                </h3>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter mt-0.5">
                  {new Date(diffResult.oldVersion.created_at).toLocaleDateString('zh-CN')}
                </p>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
              <div className="max-w-prose mx-auto space-y-3">
                {inlineDiffContent.map((row) => (
                  <p key={`left-${row.id}`} className="text-sm leading-relaxed text-slate-700">
                    {row.left || <span className="text-slate-300">—</span>}
                  </p>
                ))}
              </div>
            </div>
          </section>

          {/* 右侧：新版本 */}
          <section className="flex-1 flex flex-col overflow-hidden bg-white/50">
            <header className="p-4 bg-blue-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-blue-700 tracking-tight">
                  v{diffResult.newVersion.version} 当前版本
                </h3>
                <p className="text-[10px] text-blue-500 font-bold uppercase tracking-tighter mt-0.5">
                  {new Date(diffResult.newVersion.created_at).toLocaleDateString('zh-CN')}
                </p>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
              <div className="max-w-prose mx-auto space-y-3">
                {inlineDiffContent.map((row) => (
                  <p key={`right-${row.id}`} className="text-sm leading-relaxed text-slate-700">
                    {row.right || <span className="text-slate-300">—</span>}
                  </p>
                ))}
              </div>
            </div>
          </section>

          {/* 右侧注释栏 */}
          {showAnnotations && (
            <aside className="w-72 border-l border-slate-200 bg-slate-50 flex flex-col shrink-0 overflow-y-auto">
              <div className="p-4 border-b border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">comment</span>
                  评审注释
                </h4>
              </div>
              <div className="p-4 space-y-4">
                {/* 变更统计卡片 */}
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
                  <div className="text-xs font-bold text-slate-600 mb-2">变更概览</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-red-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        删除
                      </span>
                      <span className="font-bold text-slate-700">
                        {inlineDiffContent.filter(r => r.type === 'removed' || r.type === 'changed').length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-green-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        新增
                      </span>
                      <span className="font-bold text-slate-700">
                        {inlineDiffContent.filter(r => r.type === 'added' || r.type === 'changed').length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 旧版本摘要 */}
                {diffResult.oldVersion.change_summary && (
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 opacity-60">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-slate-400">v{diffResult.oldVersion.version}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">旧版本</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">
                      {diffResult.oldVersion.change_summary}
                    </p>
                  </div>
                )}

                {/* 新版本摘要 */}
                {diffResult.newVersion.change_summary && (
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[10px] text-white">auto_awesome</span>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600">v{diffResult.newVersion.version}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-snug">
                      {diffResult.newVersion.change_summary}
                    </p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="h-14 flex justify-between items-center px-6 bg-white border-t border-slate-200">
          <span className="text-xs text-slate-400">
            对比 v{diffResult.oldVersion.version} 与 v{diffResult.newVersion.version}
          </span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => onRollback?.(diffResult.oldVersion.id)}
              className="text-xs text-slate-500 hover:text-blue-700 underline"
            >
              回滚到 v{diffResult.oldVersion.version}
            </button>
            <button
              className="text-xs text-slate-500 hover:text-blue-700 underline"
              onClick={() => {
                const data = {
                  old: diffResult.oldVersion,
                  new: diffResult.newVersion,
                  diff: inlineDiffContent,
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `diff-v${diffResult.oldVersion.version}-to-v${diffResult.newVersion.version}.json`;
                a.click();
              }}
            >
              导出差异报告
            </button>
            <button
              onClick={onApprove}
              className="bg-blue-600 text-white px-5 py-2 rounded-md text-xs font-bold hover:bg-blue-700 transition-colors"
            >
              确认 v{diffResult.newVersion.version}
            </button>
          </div>
        </div>

        {/* 样式 */}
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 2px;
          }
          .diff-add-inline {
            background-color: #d1fae5;
            border-bottom: 2px solid #10b981;
            padding: 0 2px;
          }
          .diff-del-inline {
            background-color: #fee2e2;
            text-decoration: line-through;
            color: #b91c1c;
            padding: 0 2px;
          }
          .diff-add-line {
            background-color: #d1fae5;
            display: block;
            padding: 2px 4px;
            border-radius: 2px;
          }
          .diff-del-line {
            background-color: #fee2e2;
            text-decoration: line-through;
            color: #b91c1c;
            display: block;
            padding: 2px 4px;
            border-radius: 2px;
          }
        `}</style>
      </div>
    );
  }

  // 版本选择视图
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">compare</span>
            版本对比
          </h3>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          选择两个版本进行对比
        </p>
      </div>

      {/* 版本列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative border-l-2 border-slate-200 ml-3 space-y-4">
          {sortedVersions.map((version) => {
            const isSelected = compareSelection.includes(version.version);
            const isCurrent = version.version === currentVersion;

            return (
              <div key={version.id} className="relative pl-6">
                {/* 选择圆圈 */}
                <button
                  onClick={() => toggleVersionSelection(version.version)}
                  className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 transition-all ${
                    isSelected
                      ? 'bg-blue-500 border-blue-500 scale-125'
                      : isCurrent
                      ? 'bg-white border-blue-500'
                      : 'bg-white border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold">
                      {compareSelection.indexOf(version.version) + 1}
                    </span>
                  )}
                </button>

                {/* 版本卡片 */}
                <div
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200'
                      : isCurrent
                      ? 'bg-white border-blue-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => toggleVersionSelection(version.version)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${isCurrent ? 'text-blue-600' : 'text-slate-600'}`}>
                        v{version.version}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                          当前
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(version.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  {version.change_summary && (
                    <p className="text-xs text-slate-500 line-clamp-2">{version.change_summary}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部操作 */}
      {compareSelection.length === 2 && (
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => {}}
            className="w-full py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">visibility</span>
            查看 v{Math.min(...compareSelection)} 与 v{Math.max(...compareSelection)} 的差异
          </button>
        </div>
      )}
    </div>
  );
}
