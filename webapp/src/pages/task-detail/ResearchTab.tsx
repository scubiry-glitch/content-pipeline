// 任务详情 - 深度研究 Tab
import { useOutletContext } from 'react-router-dom';
import { DataReviewTable } from '../../components/DataReviewTable';
import { ExternalLinksList } from '../../components/ExternalLinksList';
import { AssetLinksList } from '../../components/AssetLinksList';
import { DataCleaningPanel } from '../../components/DataCleaningPanel';
import { CrossValidationPanel } from '../../components/CrossValidationPanel';
import type { Task, ResearchConfig } from '../../types';

interface TaskContext {
  task: Task;
  researchConfig: ResearchConfig;
  showResearchConfig: boolean;
  actionLoading: string | null;
  onShowResearchConfigChange: (show: boolean) => void;
  onResearchConfigChange: (config: ResearchConfig) => void;
  onSaveResearchConfig: () => void;
  onCollectResearch: () => void;
  onRedoStage: (stage: 'planning' | 'research' | 'writing' | 'review') => void;
  onAddExternalLink: () => void;
}

export function ResearchTab() {
  const {
    task,
    researchConfig,
    showResearchConfig,
    actionLoading,
    onShowResearchConfigChange,
    onResearchConfigChange,
    onSaveResearchConfig,
    onCollectResearch,
    onRedoStage,
    onAddExternalLink,
  } = useOutletContext<TaskContext>();
  return (
    <div className="tab-panel research-panel">
      {/* 操作按钮区 */}
      <div className="info-card actions-card">
        <h3 className="card-title">⚡ 研究操作</h3>
        <div className="research-actions">
          <button
            className="btn btn-primary"
            onClick={onCollectResearch}
            disabled={actionLoading === 'collect-research'}
          >
            {actionLoading === 'collect-research' ? '采集中...' : '🔄 启动研究采集'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onRedoStage('research')}
            disabled={actionLoading === 'redo-research'}
          >
            {actionLoading === 'redo-research' ? '重启中...' : '🔄 重做深度研究'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onAddExternalLink}
          >
            ➕ 添加外部链接
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onShowResearchConfigChange(!showResearchConfig)}
          >
            ⚙️ 配置采集参数
          </button>
        </div>
        {task.research_data?.searchStats && (
          <div className="search-stats">
            <span>📊 网页来源: {task.research_data.searchStats.webSources || 0}</span>
            <span>📁 素材来源: {task.research_data.searchStats.assetSources || 0}</span>
          </div>
        )}
      </div>

      {/* 研究配置面板 */}
      {showResearchConfig && (
        <div className="info-card config-card">
          <h3 className="card-title">⚙️ 深度研究配置</h3>
          <div className="research-config-form">
            <div className="form-row">
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={researchConfig.autoCollect}
                    onChange={(e) => onResearchConfigChange({ ...researchConfig, autoCollect: e.target.checked })}
                  />
                  自动采集
                </label>
              </div>
              <div className="form-group">
                <label>最大结果数</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={researchConfig.maxResults}
                  onChange={(e) => onResearchConfigChange({ ...researchConfig, maxResults: parseInt(e.target.value) || 20 })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>最低可信度 (0-1)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={1}
                  value={researchConfig.minCredibility}
                  onChange={(e) => onResearchConfigChange({ ...researchConfig, minCredibility: parseFloat(e.target.value) || 0.5 })}
                />
              </div>
              <div className="form-group">
                <label>时间范围</label>
                <select
                  value={researchConfig.timeRange}
                  onChange={(e) => onResearchConfigChange({ ...researchConfig, timeRange: e.target.value })}
                >
                  <option value="7d">最近7天</option>
                  <option value="30d">最近30天</option>
                  <option value="90d">最近3个月</option>
                  <option value="1y">最近1年</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>数据源</label>
              <div className="checkbox-group">
                {['web', 'rss', 'asset'].map((source) => (
                  <label key={source} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={researchConfig.sources.includes(source)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onResearchConfigChange({ ...researchConfig, sources: [...researchConfig.sources, source] });
                        } else {
                          onResearchConfigChange({ ...researchConfig, sources: researchConfig.sources.filter((s) => s !== source) });
                        }
                      }}
                    />
                    {source === 'web' ? '网页搜索' : source === 'rss' ? 'RSS源' : '素材库'}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>关键词 (用逗号分隔)</label>
              <input
                type="text"
                value={researchConfig.keywords.join(', ')}
                onChange={(e) => onResearchConfigChange({ ...researchConfig, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                placeholder="输入关键词以精确搜索..."
              />
            </div>
            <div className="form-group">
              <label>排除关键词 (用逗号分隔)</label>
              <input
                type="text"
                value={researchConfig.excludeKeywords.join(', ')}
                onChange={(e) => onResearchConfigChange({ ...researchConfig, excludeKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                placeholder="输入要排除的关键词..."
              />
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={onSaveResearchConfig}
                disabled={actionLoading === 'save-research-config'}
              >
                {actionLoading === 'save-research-config' ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {task.research_data ? (
        <div className="research-content">
          {/* 数据审核表格 */}
          {task.research_data.annotations && task.research_data.annotations.length > 0 && (
            <DataReviewTable
              annotations={task.research_data.annotations}
              onSelectionChange={(ids) => console.log('Selected:', ids)}
              onConfirm={(ids) => alert(`确认选择 ${ids.length} 条数据`)}
            />
          )}

          {/* 外部链接引用 */}
          {task.research_data.annotations && (
            <ExternalLinksList annotations={task.research_data.annotations} />
          )}

          {/* 素材库引用 */}
          {task.research_data.annotations && (
            <AssetLinksList annotations={task.research_data.annotations} />
          )}

          {/* 数据清洗面板 */}
          {task.research_data.annotations && task.research_data.annotations.length > 0 && (
            <div className="info-card">
              <h3 className="card-title">🧹 数据清洗</h3>
              <DataCleaningPanel
                annotations={task.research_data.annotations}
                onClean={(cleaned) => console.log('Cleaned annotations:', cleaned)}
              />
            </div>
          )}

          {/* 交叉验证面板 */}
          <div className="info-card">
            <h3 className="card-title">🔍 交叉验证</h3>
            <CrossValidationPanel
              results={task.research_data.validation_results || []}
              onResolve={(id, source) => console.log('Resolved:', id, source)}
            />
          </div>

          {/* 研究洞察 */}
          {task.research_data.insights?.length > 0 && (
            <div className="info-card">
              <h3 className="card-title">💡 研究洞察</h3>
              <div className="insights-list">
                {task.research_data.insights.map((insight: any) => (
                  <div key={insight.id} className="insight-item">
                    <div className="insight-header">
                      <span className={`insight-type type-${insight.type}`}>
                        {insight.type === 'data' ? '数据' :
                         insight.type === 'trend' ? '趋势' :
                         insight.type === 'case' ? '案例' : '专家'}
                      </span>
                      <span className="insight-source">来源: {insight.source}</span>
                    </div>
                    <p className="insight-content">{insight.content}</p>
                    <div className="insight-confidence">置信度: {(insight.confidence * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 引用来源 */}
          {task.research_data.sources?.length > 0 && (
            <div className="info-card">
              <h3 className="card-title">📚 引用来源</h3>
              <div className="sources-list">
                {task.research_data.sources.map((source: any, idx: number) => {
                  const reliability = source.reliability || 0.6;
                  const level = reliability >= 0.9 ? 'A' : reliability >= 0.7 ? 'B' : reliability >= 0.5 ? 'C' : 'D';
                  const levelColors: Record<string, { bg: string; color: string }> = {
                    A: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
                    B: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
                    C: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
                    D: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
                  };
                  const style = levelColors[level];

                  return (
                    <div key={idx} className="source-item">
                      <div className="source-info">
                        <span className="source-name">{source.name}</span>
                        <span
                          className="source-level"
                          style={{ background: style.bg, color: style.color }}
                        >
                          {level}级 · {(reliability * 100).toFixed(0)}%
                        </span>
                      </div>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-link">
                        查看原文 →
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">暂无研究数据</div>
          <p>任务进入深度研究阶段后将自动采集相关内容</p>
        </div>
      )}
    </div>
  );
}
