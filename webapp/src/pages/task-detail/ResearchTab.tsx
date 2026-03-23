// 任务详情 - 深度研究 Tab
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useOutletContext } from 'react-router-dom';
import { DataReviewTable } from '../../components/DataReviewTable';
import { ExternalLinksList } from '../../components/ExternalLinksList';
import { AssetLinksList } from '../../components/AssetLinksList';
import { DataCleaningPanel } from '../../components/DataCleaningPanel';
import { CrossValidationPanel } from '../../components/CrossValidationPanel';
import type { Task } from '../../types';
import type { ResearchConfig } from '../../api/client';

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

  const hasResearchData = !!task.research_data;
  const researchData = task.research_data as any;

  return (
    <div className="tab-panel research-panel animate-fade-in">
      {/* ========== 1. 输入 ========== */}
      <div className="section-header">
        <h3 className="section-title">
          <span className="icon">📥</span> 输入
        </h3>
        <span className="section-desc">定义数据源配置与深度研究的采集参数</span>
      </div>

      <div className="input-grid">
        {/* 数据源配置 */}
        <div className="info-card input-card glass-card">
          <h3 className="card-title">
            <span className="icon">📊</span> 数据源配置
          </h3>
          <div className="data-source-list">
            <div className={`source-item ${researchConfig.sources.includes('web') ? 'active' : ''}`}>
              <span className="source-icon">🌐</span>
              <span className="source-name">网页搜索</span>
              <span className="source-status">{researchConfig.sources.includes('web') ? '✓' : '○'}</span>
            </div>
            <div className={`source-item ${researchConfig.sources.includes('rss') ? 'active' : ''}`}>
              <span className="source-icon">📡</span>
              <span className="source-name">RSS订阅</span>
              <span className="source-status">{researchConfig.sources.includes('rss') ? '✓' : '○'}</span>
            </div>
            <div className={`source-item ${researchConfig.sources.includes('asset') ? 'active' : ''}`}>
              <span className="source-icon">📁</span>
              <span className="source-name">素材库</span>
              <span className="source-status">{researchConfig.sources.includes('asset') ? '✓' : '○'}</span>
            </div>
          </div>
          {task.research_data?.searchStats && (
            <div className="search-stats-summary">
              <span>📊 网页来源: {task.research_data.searchStats.webSources || 0}</span>
              <span>📁 素材来源: {task.research_data.searchStats.assetSources || 0}</span>
            </div>
          )}
        </div>

        {/* 采集参数配置 */}
        <div className="info-card input-card glass-card">
          <h3 className="card-title">
            <span className="icon">⚙️</span> 采集参数
          </h3>
          <div className="param-list">
            <div className="param-item">
              <span className="param-label">最大结果数</span>
              <span className="param-value">{researchConfig.maxResults}</span>
            </div>
            <div className="param-item">
              <span className="param-label">最低可信度</span>
              <span className="param-value">{researchConfig.minCredibility}</span>
            </div>
            <div className="param-item">
              <span className="param-label">时间范围</span>
              <span className="param-value">{researchConfig.timeRange === '7d' ? '最近7天' : researchConfig.timeRange === '30d' ? '最近30天' : researchConfig.timeRange === '90d' ? '最近3个月' : '最近1年'}</span>
            </div>
            <div className="param-item">
              <span className="param-label">自动采集</span>
              <span className="param-value">{researchConfig.autoCollect ? '✓ 开启' : '○ 关闭'}</span>
            </div>
          </div>
          {researchConfig.keywords.length > 0 && (
            <div className="keywords-list">
              <span className="keywords-label">关键词:</span>
              {researchConfig.keywords.map((k, i) => (
                <span key={i} className="keyword-tag">{k}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 研究配置面板（可展开） */}
      {showResearchConfig && (
        <div className="info-card full-width config-panel">
          <h3 className="card-title">⚙️ 配置研究参数</h3>
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

      {hasResearchData ? (
        <>
          {/* ========== 2. 加工 ========== */}
          <div className="section-header">
            <h3 className="section-title">
              <span className="icon">⚙️</span> 加工
            </h3>
            <span className="section-desc">对采集到的数据进行多维度审核、清洗与交叉验证</span>
          </div>

          <div className="process-grid">
            {/* 数据审核表格 */}
            {task.research_data.annotations && task.research_data.annotations.length > 0 && (
              <div className="info-card full-width process-card">
                <h3 className="card-title">📋 数据审核</h3>
                <DataReviewTable
                  annotations={task.research_data.annotations}
                  onSelectionChange={(ids) => console.log('Selected:', ids)}
                  onConfirm={(ids) => alert(`确认选择 ${ids.length} 条数据`)}
                />
              </div>
            )}

            {/* 数据清洗面板 */}
            {task.research_data.annotations && task.research_data.annotations.length > 0 && (
              <div className="info-card process-card">
                <h3 className="card-title">🧹 数据清洗</h3>
                <DataCleaningPanel
                  annotations={task.research_data.annotations}
                  onClean={(cleaned) => console.log('Cleaned annotations:', cleaned)}
                />
              </div>
            )}

            {/* 交叉验证面板 */}
            <div className="info-card process-card">
              <h3 className="card-title">🔍 交叉验证</h3>
              <CrossValidationPanel
                results={task.research_data.validation_results || []}
                onResolve={(id, source) => console.log('Resolved:', id, source)}
              />
            </div>

            {/* 外部链接与素材引用 */}
            {task.research_data.annotations && (
              <div className="references-grid">
                <div className="info-card process-card">
                  <h3 className="card-title">🔗 外部链接</h3>
                  <ExternalLinksList annotations={task.research_data.annotations} />
                </div>
                <div className="info-card process-card">
                  <h3 className="card-title">📁 素材引用</h3>
                  <AssetLinksList annotations={task.research_data.annotations} />
                </div>
              </div>
            )}
          </div>

          {/* ========== 3. 输出 ========== */}
          <div className="section-header">
            <h3 className="section-title">
              <span className="icon">📤</span> 输出
            </h3>
            <span className="section-desc">基于核心数据的研究洞察与权威引用来源</span>
          </div>

          <div className="output-grid">
            {/* 研究洞察 */}
            {task.research_data.insights?.length > 0 && (
              <div className="info-card output-card">
                <h3 className="card-title">💡 研究洞察</h3>
                <div className="insights-list">
                  {task.research_data.insights.map((insight: any, idx: number) => (
                    <div key={insight.id || idx} className="insight-item">
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
              <div className="info-card output-card">
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
        </>
      ) : (
        <div className="empty-state animate-fade-in">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">暂无研究数据</div>
          <p>任务进入深度研究阶段后将自动采集并为您提炼核心内容</p>
        </div>
      )}

      {/* ========== 4. 辅助工具 ========== */}
      <div className="section-header">
        <h3 className="section-title">🛠️ 辅助工具</h3>
        <span className="section-desc">研究采集与阶段重做</span>
      </div>

      <div className="info-card tools-card">
        <h3 className="card-title">⚡ 研究操作</h3>
        <div className="tools-actions">
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
            ⚙️ {showResearchConfig ? '隐藏' : '配置'}采集参数
          </button>
        </div>
      </div>
    </div>
  );
}
