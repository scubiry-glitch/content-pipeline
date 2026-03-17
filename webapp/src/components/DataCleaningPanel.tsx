// 数据清洗面板组件 - Data Cleaning Panel
import { useState, useMemo } from 'react';
import type { ResearchAnnotation } from '../api/client';

interface DataCleaningPanelProps {
  annotations: ResearchAnnotation[];
  onClean?: (cleanedAnnotations: ResearchAnnotation[]) => void;
}

interface CleaningIssue {
  id: string;
  type: 'duplicate' | 'outlier' | 'low_quality' | 'incomplete';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedIds: string[];
  suggestion: string;
}

export function DataCleaningPanel({ annotations, onClean }: DataCleaningPanelProps) {
  const [cleaning, setCleaning] = useState(false);
  const [cleaned, setCleaned] = useState(false);

  // 自动检测数据问题
  const issues = useMemo<CleaningIssue[]>(() => {
    const found: CleaningIssue[] = [];

    // 检测重复数据（基于URL或标题相似度）
    const urlMap = new Map<string, string[]>();
    annotations.forEach((a) => {
      const key = a.type === 'url' ? a.url : a.asset_id;
      if (key) {
        const existing = urlMap.get(key) || [];
        existing.push(a.id);
        urlMap.set(key, existing);
      }
    });

    urlMap.forEach((ids, url) => {
      if (ids.length > 1) {
        found.push({
          id: `dup-${url}`,
          type: 'duplicate',
          severity: 'medium',
          description: `发现 ${ids.length} 条重复数据`,
          affectedIds: ids,
          suggestion: '建议合并或删除重复项',
        });
      }
    });

    // 检测低质量数据（可信度低于0.5）
    const lowQuality = annotations.filter(
      (a) => (a.credibility?.overall || 0) < 0.5
    );
    if (lowQuality.length > 0) {
      found.push({
        id: 'low-quality',
        type: 'low_quality',
        severity: 'high',
        description: `发现 ${lowQuality.length} 条低质量数据（可信度<50%）`,
        affectedIds: lowQuality.map((a) => a.id),
        suggestion: '建议删除或重新验证',
      });
    }

    // 检测不完整数据（缺少标题或来源）
    const incomplete = annotations.filter(
      (a) => !a.title || a.title.length < 5
    );
    if (incomplete.length > 0) {
      found.push({
        id: 'incomplete',
        type: 'incomplete',
        severity: 'low',
        description: `发现 ${incomplete.length} 条不完整数据`,
        affectedIds: incomplete.map((a) => a.id),
        suggestion: '建议补充信息或删除',
      });
    }

    return found;
  }, [annotations]);

  // 计算清洗统计
  const stats = useMemo(() => {
    const total = annotations.length;
    const duplicates = issues.find((i) => i.type === 'duplicate')?.affectedIds.length || 0;
    const lowQuality = issues.find((i) => i.type === 'low_quality')?.affectedIds.length || 0;
    const incomplete = issues.find((i) => i.type === 'incomplete')?.affectedIds.length || 0;
    const cleanCount = total - new Set(issues.flatMap((i) => i.affectedIds)).size;
    const qualityScore = total > 0 ? Math.round((cleanCount / total) * 100) : 100;

    return { total, duplicates, lowQuality, incomplete, cleanCount, qualityScore };
  }, [annotations, issues]);

  const handleAutoClean = async () => {
    setCleaning(true);
    // 模拟清洗过程
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 过滤掉有问题的数据
    const problematicIds = new Set(issues.flatMap((i) => i.affectedIds));
    const cleaned = annotations.filter((a) => !problematicIds.has(a.id));

    setCleaning(false);
    setCleaned(true);
    onClean?.(cleaned);
  };

  const getIssueIcon = (type: CleaningIssue['type']) => {
    switch (type) {
      case 'duplicate':
        return '📑';
      case 'outlier':
        return '📊';
      case 'low_quality':
        return '⚠️';
      case 'incomplete':
        return '📝';
    }
  };

  const getSeverityClass = (severity: CleaningIssue['severity']) => {
    switch (severity) {
      case 'high':
        return 'severity-high';
      case 'medium':
        return 'severity-medium';
      case 'low':
        return 'severity-low';
    }
  };

  return (
    <div className="data-cleaning-panel">
      {/* 质量评分卡片 */}
      <div className="quality-score-card">
        <div className="score-display">
          <div className={`score-circle ${stats.qualityScore >= 80 ? 'good' : stats.qualityScore >= 60 ? 'warning' : 'bad'}`}>
            <span className="score-value">{stats.qualityScore}</span>
            <span className="score-label">质量分</span>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">总数据</span>
          </div>
          <div className="stat-item">
            <span className="stat-number text-warning">{stats.duplicates}</span>
            <span className="stat-label">重复</span>
          </div>
          <div className="stat-item">
            <span className="stat-number text-danger">{stats.lowQuality}</span>
            <span className="stat-label">低质量</span>
          </div>
          <div className="stat-item">
            <span className="stat-number text-info">{stats.incomplete}</span>
            <span className="stat-label">不完整</span>
          </div>
        </div>
      </div>

      {/* 问题列表 */}
      {issues.length > 0 && !cleaned && (
        <div className="issues-section">
          <h4>🔍 检测到的问题</h4>
          <div className="issues-list">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={`issue-card ${getSeverityClass(issue.severity)}`}
              >
                <div className="issue-header">
                  <span className="issue-icon">{getIssueIcon(issue.type)}</span>
                  <span className="issue-desc">{issue.description}</span>
                  <span className={`severity-badge ${issue.severity}`}>
                    {issue.severity === 'high' ? '严重' : issue.severity === 'medium' ? '中等' : '轻微'}
                  </span>
                </div>
                <p className="issue-suggestion">💡 {issue.suggestion}</p>
                <div className="affected-count">影响 {issue.affectedIds.length} 条数据</div>
              </div>
            ))}
          </div>

          {/* 自动清洗按钮 */}
          <div className="clean-actions">
            <button
              className="btn btn-primary"
              onClick={handleAutoClean}
              disabled={cleaning || issues.length === 0}
            >
              {cleaning ? (
                <>
                  <span className="spinner" /> 清洗中...
                </>
              ) : (
                <>🧹 自动清洗数据</>
              )}
            </button>
            <p className="clean-hint">将删除重复、低质量和不完整的数据</p>
          </div>
        </div>
      )}

      {/* 清洗完成提示 */}
      {cleaned && (
        <div className="clean-success">
          <div className="success-icon">✅</div>
          <h4>数据清洗完成</h4>
          <p>已清理 {stats.total - stats.cleanCount} 条问题数据</p>
          <p>剩余 {stats.cleanCount} 条高质量数据</p>
          <button className="btn btn-secondary" onClick={() => setCleaned(false)}>
            撤销操作
          </button>
        </div>
      )}

      {/* 无问题提示 */}
      {issues.length === 0 && !cleaned && (
        <div className="no-issues">
          <div className="success-icon">🎉</div>
          <h4>数据质量良好</h4>
          <p>未发现明显问题，数据可直接使用</p>
        </div>
      )}
    </div>
  );
}
