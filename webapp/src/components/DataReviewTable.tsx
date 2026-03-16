// 数据审核表格组件 - Data Review Table Component
import { useState, useMemo } from 'react';
import type { ResearchAnnotation } from '../api/client';

interface DataReviewTableProps {
  annotations: ResearchAnnotation[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onConfirm?: (selectedIds: string[]) => void;
}

const levelColors: Record<string, { bg: string; color: string }> = {
  A: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  B: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  C: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  D: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
};

function getCredibilityLevel(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 0.9) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.5) return 'C';
  return 'D';
}

export function DataReviewTable({ annotations, onSelectionChange, onConfirm }: DataReviewTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    annotations.map(a => a.id)
  );
  const [credFilter, setCredFilter] = useState<'all' | 'A' | 'B' | 'C' | 'D'>('all');

  const filteredAnnotations = useMemo(() => {
    if (credFilter === 'all') return annotations;
    return annotations.filter(a => {
      const level = getCredibilityLevel(a.credibility?.overall || 0.6);
      return level === credFilter;
    });
  }, [annotations, credFilter]);

  const stats = useMemo(() => {
    const total = annotations.length;
    const selected = selectedIds.length;
    const aLevel = annotations.filter(a => getCredibilityLevel(a.credibility?.overall || 0.6) === 'A').length;
    return { total, selected, aLevel };
  }, [annotations, selectedIds]);

  const toggleAnnotation = (id: string) => {
    const newSelected = selectedIds.includes(id)
      ? selectedIds.filter(i => i !== id)
      : [...selectedIds, id];
    setSelectedIds(newSelected);
    onSelectionChange?.(newSelected);
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredAnnotations.map(a => a.id);
    const allSelected = visibleIds.every(id => selectedIds.includes(id));
    const newSelected = allSelected
      ? selectedIds.filter(id => !visibleIds.includes(id))
      : [...new Set([...selectedIds, ...visibleIds])];
    setSelectedIds(newSelected);
    onSelectionChange?.(newSelected);
  };

  const selectAll = filteredAnnotations.length > 0 &&
    filteredAnnotations.every(a => selectedIds.includes(a.id));

  return (
    <div className="data-review-card">
      <div className="card-header-with-actions">
        <h3 className="card-title">📊 数据审核</h3>
        <div className="review-stats">
          <span>总数据: <strong>{stats.total}</strong></span>
          <span>已选: <strong style={{ color: '#10b981' }}>{stats.selected}</strong></span>
          <span>A级信源: <strong style={{ color: '#10b981' }}>{stats.aLevel}</strong></span>
        </div>
      </div>

      {/* 筛选按钮 */}
      <div className="filter-buttons">
        {(['all', 'A', 'B', 'C', 'D'] as const).map((level) => (
          <button
            key={level}
            className={`btn-filter ${credFilter === level ? 'active' : ''}`}
            onClick={() => setCredFilter(level)}
            style={level !== 'all' ? { color: levelColors[level].color } : undefined}
          >
            {level === 'all' ? '全部' : `${level}级`}
          </button>
        ))}
      </div>

      {/* 数据表格 */}
      <div className="data-review-table-wrapper">
        <table className="data-review-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>来源</th>
              <th style={{ width: 60, textAlign: 'center' }}>等级</th>
              <th style={{ width: 80, textAlign: 'center' }}>可信度</th>
              <th>标题</th>
            </tr>
          </thead>
          <tbody>
            {filteredAnnotations.map((annotation) => {
              const cred = annotation.credibility?.overall || 0.6;
              const level = getCredibilityLevel(cred);
              const style = levelColors[level];
              return (
                <tr key={annotation.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(annotation.id)}
                      onChange={() => toggleAnnotation(annotation.id)}
                    />
                  </td>
                  <td className="source-cell">
                    {annotation.type === 'url'
                      ? new URL(annotation.url || 'http://example.com').hostname
                      : '素材库'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="credibility-badge" style={{ background: style.bg, color: style.color }}>
                      {level}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{(cred * 100).toFixed(0)}%</td>
                  <td>
                    {annotation.type === 'url' ? (
                      <a href={annotation.url} target="_blank" rel="noopener noreferrer" className="annotation-link">
                        {annotation.title}
                      </a>
                    ) : (
                      <span>{annotation.title}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 确认按钮 */}
      <div className="review-actions-footer">
        <button className="btn btn-primary" onClick={() => onConfirm?.(selectedIds)}>
          ✓ 确认选择并生成报告 ({selectedIds.length})
        </button>
      </div>
    </div>
  );
}
