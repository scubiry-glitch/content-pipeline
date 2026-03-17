// 版本对比面板 - Version Compare Panel
import { useState, useMemo } from 'react';
import type { DraftVersion } from '../types';

interface VersionComparePanelProps {
  versions?: DraftVersion[];
  currentVersion?: number;
  onRollback?: (versionId: string) => void;
}

export function VersionComparePanel({
  versions = [],
  currentVersion,
  onRollback,
}: VersionComparePanelProps) {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  const handleSelectVersion = (versionId: string) => {
    if (compareMode) {
      if (selectedVersions.includes(versionId)) {
        setSelectedVersions(selectedVersions.filter((id) => id !== versionId));
      } else if (selectedVersions.length < 2) {
        setSelectedVersions([...selectedVersions, versionId]);
      }
    } else {
      setSelectedVersions([versionId]);
    }
  };

  const getDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: Array<{ type: 'same' | 'added' | 'removed'; content: string }> = [];

    let i = 0,
      j = 0;
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
        result.push({ type: 'removed', content: oldLines[i] });
        result.push({ type: 'added', content: newLines[j] });
        i++;
        j++;
      }
    }

    return result;
  };

  const diffResult = useMemo(() => {
    if (selectedVersions.length !== 2) return null;
    const v1 = versions.find((v) => v.id === selectedVersions[0]);
    const v2 = versions.find((v) => v.id === selectedVersions[1]);
    if (!v1 || !v2) return null;

    const oldVersion = v1.version < v2.version ? v1 : v2;
    const newVersion = v1.version < v2.version ? v2 : v1;

    return {
      oldVersion,
      newVersion,
      diff: getDiff(oldVersion.content, newVersion.content),
    };
  }, [selectedVersions, versions]);

  if (versions.length === 0) {
    return (
      <div className="version-compare-panel">
        <div className="no-versions-data">
          <div className="info-icon">📄</div>
          <h4>暂无历史版本</h4>
          <p>文稿生成后将保存版本历史</p>
        </div>
      </div>
    );
  }

  return (
    <div className="version-compare-panel">
      {/* 操作栏 */}
      <div className="version-actions-bar">
        <div className="compare-toggle">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={compareMode}
              onChange={(e) => {
                setCompareMode(e.target.checked);
                setSelectedVersions([]);
              }}
            />
            对比模式
          </label>
          {compareMode && (
            <span className="select-hint">选择两个版本进行对比</span>
          )}
        </div>
        {selectedVersions.length === 2 && compareMode && (
          <button className="btn btn-sm btn-secondary" onClick={() => setSelectedVersions([])}>
            清除选择
          </button>
        )}
      </div>

      {/* 版本列表 */}
      <div className="version-list">
        {sortedVersions.map((version, index) => {
          const isSelected = selectedVersions.includes(version.id);
          const isCurrent = version.version === currentVersion;
          const isDisabled =
            compareMode &&
            selectedVersions.length >= 2 &&
            !selectedVersions.includes(version.id);

          return (
            <div
              key={version.id}
              className={`version-item ${isSelected ? 'selected' : ''} ${
                isCurrent ? 'current' : ''
              } ${isDisabled ? 'disabled' : ''}`}
              onClick={() => !isDisabled && handleSelectVersion(version.id)}
            >
              <div className="version-header">
                <div className="version-info">
                  <span className="version-number">V{version.version}</span>
                  {isCurrent && <span className="current-badge">当前</span>}
                  {index === 0 && !isCurrent && <span className="latest-badge">最新</span>}
                </div>
                <span className="version-date">
                  {new Date(version.created_at).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="version-summary">{version.change_summary}</p>
              {!compareMode && (
                <div className="version-actions">
                  {!isCurrent && (
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRollback?.(version.id);
                      }}
                    >
                      回滚到此版本
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 对比结果 */}
      {compareMode && diffResult && (
        <div className="diff-panel">
          <div className="diff-header">
            <span className="diff-title">
              对比: V{diffResult.oldVersion.version} → V{diffResult.newVersion.version}
            </span>
            <div className="diff-legend">
              <span className="legend-item removed">删除</span>
              <span className="legend-item added">新增</span>
            </div>
          </div>
          <div className="diff-content">
            {diffResult.diff.map((line, idx) => (
              <div key={idx} className={`diff-line ${line.type}`}>
                <span className="line-marker">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="line-content">{line.content || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 单版本预览 */}
      {!compareMode && selectedVersions.length === 1 && (
        <div className="version-preview">
          {(() => {
            const version = versions.find((v) => v.id === selectedVersions[0]);
            if (!version) return null;
            return (
              <>
                <div className="preview-header">
                  <span className="preview-title">V{version.version} 预览</span>
                  <span className="preview-meta">
                    {new Date(version.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="preview-content">
                  <pre>{version.content}</pre>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
