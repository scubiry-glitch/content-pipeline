// 交叉验证结果展示组件 - Cross Validation Panel
import { useState, useMemo } from 'react';

interface ValidationResult {
  id: string;
  metric: string;
  values: {
    source: string;
    value: number;
    unit: string;
    credibility: number;
  }[];
  average: number;
  deviation: number;
  status: 'consistent' | 'conflict' | 'pending';
}

interface CrossValidationPanelProps {
  results?: ValidationResult[];
  onResolve?: (id: string, selectedSource: string) => void;
}

export function CrossValidationPanel({ results = [], onResolve }: CrossValidationPanelProps) {
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    const total = results.length;
    const consistent = results.filter((r) => r.status === 'consistent').length;
    const conflict = results.filter((r) => r.status === 'conflict').length;
    const pending = results.filter((r) => r.status === 'pending').length;
    return { total, consistent, conflict, pending };
  }, [results]);

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'consistent':
        return '✅';
      case 'conflict':
        return '⚠️';
      case 'pending':
        return '⏳';
    }
  };

  const getStatusText = (status: ValidationResult['status']) => {
    switch (status) {
      case 'consistent':
        return '数据一致';
      case 'conflict':
        return '存在冲突';
      case 'pending':
        return '待确认';
    }
  };

  const getDeviationColor = (deviation: number) => {
    if (deviation <= 5) return '#10b981';
    if (deviation <= 10) return '#f59e0b';
    return '#ef4444';
  };

  if (results.length === 0) {
    return (
      <div className="cross-validation-panel">
        <div className="no-validation-data">
          <div className="info-icon">📊</div>
          <h4>暂无交叉验证数据</h4>
          <p>系统将对多来源数据进行交叉验证</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cross-validation-panel">
      {/* 统计概览 */}
      <div className="validation-stats">
        <div className="stat-box total">
          <span className="stat-number">{stats.total}</span>
          <span className="stat-label">验证指标</span>
        </div>
        <div className="stat-box consistent">
          <span className="stat-number">{stats.consistent}</span>
          <span className="stat-label">✅ 一致</span>
        </div>
        <div className="stat-box conflict">
          <span className="stat-number">{stats.conflict}</span>
          <span className="stat-label">⚠️ 冲突</span>
        </div>
        <div className="stat-box pending">
          <span className="stat-number">{stats.pending}</span>
          <span className="stat-label">⏳ 待确认</span>
        </div>
      </div>

      {/* 验证结果列表 */}
      <div className="validation-results">
        {results.map((result) => (
          <div
            key={result.id}
            className={`validation-item ${result.status}`}
          >
            <div className="validation-header">
              <div className="metric-info">
                <span className="status-icon">{getStatusIcon(result.status)}</span>
                <span className="metric-name">{result.metric}</span>
                <span className={`status-badge ${result.status}`}>
                  {getStatusText(result.status)}
                </span>
              </div>
              {result.status === 'conflict' && (
                <div
                  className="deviation-badge"
                  style={{
                    background: `${getDeviationColor(result.deviation)}20`,
                    color: getDeviationColor(result.deviation),
                  }}
                >
                  偏差 {result.deviation.toFixed(1)}%
                </div>
              )}
            </div>

            {/* 多源数据对比 */}
            <div className="source-values">
              {result.values.map((v, idx) => (
                <div key={idx} className="source-value-item">
                  <div className="value-header">
                    <span className="source-name">{v.source}</span>
                    <span
                      className="credibility-tag"
                      style={{
                        background:
                          v.credibility >= 0.9
                            ? 'rgba(16,185,129,0.1)'
                            : v.credibility >= 0.7
                            ? 'rgba(59,130,246,0.1)'
                            : 'rgba(245,158,11,0.1)',
                        color:
                          v.credibility >= 0.9
                            ? '#10b981'
                            : v.credibility >= 0.7
                            ? '#3b82f6'
                            : '#f59e0b',
                      }}
                    >
                      可信度 {(v.credibility * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="value-display">
                    <span
                      className="value-number"
                      style={{
                        color:
                          result.status === 'conflict' &&
                          Math.abs(v.value - result.average) / result.average > 0.1
                            ? '#ef4444'
                            : undefined,
                      }}
                    >
                      {v.value.toLocaleString()}
                    </span>
                    <span className="value-unit">{v.unit}</span>
                    {result.status === 'conflict' && (
                      <span className="value-diff">
                        {v.value > result.average ? '+' : ''}
                        {(((v.value - result.average) / result.average) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 冲突解决建议 */}
            {result.status === 'conflict' && (
              <div className="conflict-resolution">
                <p className="resolution-hint">
                  💡 建议选择可信度最高的数据源，或手动核实后选择
                </p>
                <div className="resolution-actions">
                  {result.values
                    .sort((a, b) => b.credibility - a.credibility)
                    .slice(0, 2)
                    .map((v, idx) => (
                      <button
                        key={idx}
                        className="btn btn-sm"
                        onClick={() => onResolve?.(result.id, v.source)}
                      >
                        采用 {v.source} ({(v.credibility * 100).toFixed(0)}%)
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* 参考平均值 */}
            <div className="average-reference">
              <span>参考平均值: </span>
              <strong>{result.average.toLocaleString()}</strong>
              <span> ({result.values.length} 个来源)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
