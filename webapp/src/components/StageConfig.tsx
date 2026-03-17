// 阶段配置面板 - 恢复原版 HTML 的详细配置功能
import { useState, useEffect } from 'react';
import './StageConfig.css';

interface StageConfigProps {
  stage: number | null;
  isOpen: boolean;
  onClose: () => void;
}

interface StageConfigData {
  // 阶段1: 选题策划
  scoringWeights?: {
    timeliness: number;
    depth: number;
    interest: number;
    differentiation: number;
  };
  targetAudience?: string;
  desiredDepth?: string;
  outlineDepth?: number;
  hotTopicDays?: number;
  competitorAnalysis?: number;
  enableQualityInput?: boolean;
  qualityDimensions?: {
    freshness: boolean;
    credibility: boolean;
    differentiation: boolean;
    audienceMatch: boolean;
  };
  rssCategories?: string[];
  enableSentimentAnalysis?: boolean;
  enableSmartRecommend?: boolean;

  // 阶段2: 深度研究
  maxSearchUrls?: number;
  enableWebSearch?: boolean;
  analysisDepth?: string;
  dataSources?: string[];
  assetLibrarySearch?: number;
  sourceCredibility?: number;
  dataRecency?: number;
  crossValidation?: boolean;
  conflictHighlight?: boolean;
  insightMinConfidence?: number;

  // 阶段3: 文稿生成
  writingStyle?: string;
  targetLength?: string;
  enableBlueTeam?: boolean;
  blueTeamRounds?: number;
  experts?: string[];
  citationFormat?: string;
  maxCharts?: number;
  blueTeamStrictness?: string;
  autoAcceptMinor?: boolean;
  evidenceCheck?: boolean;
  coherenceThreshold?: number;

  // 阶段4: 多态转换
  outputFormats?: string[];
  summaryLength?: number;
  enableVisualization?: boolean;
  enablePPT?: boolean;
  pptTemplate?: string;
  infographicTheme?: string;
  keyPointsExtract?: number;
  summaryStyle?: string;
  highlightQuotes?: boolean;
  autoTags?: boolean;
}

const DEFAULT_CONFIGS: Record<number, StageConfigData> = {
  1: {
    scoringWeights: { timeliness: 30, depth: 25, interest: 25, differentiation: 20 },
    targetAudience: 'researchers',
    desiredDepth: 'comprehensive',
    outlineDepth: 3,
    hotTopicDays: 7,
    competitorAnalysis: 5,
    enableQualityInput: true,
    qualityDimensions: { freshness: true, credibility: true, differentiation: true, audienceMatch: true },
    rssCategories: ['tech', 'finance', 'research'],
    enableSentimentAnalysis: true,
    enableSmartRecommend: true,
  },
  2: {
    maxSearchUrls: 20,
    enableWebSearch: true,
    analysisDepth: 'comprehensive',
    dataSources: ['government', 'industry', 'academic', 'expert'],
    assetLibrarySearch: 10,
    sourceCredibility: 0.6,
    dataRecency: 365,
    crossValidation: true,
    conflictHighlight: true,
    insightMinConfidence: 0.75,
  },
  3: {
    writingStyle: 'professional',
    targetLength: '5000-8000',
    enableBlueTeam: true,
    blueTeamRounds: 2,
    experts: ['challenger', 'expander', 'synthesizer'],
    citationFormat: 'gb7714',
    maxCharts: 5,
    blueTeamStrictness: 'standard',
    autoAcceptMinor: false,
    evidenceCheck: true,
    coherenceThreshold: 0.8,
  },
  4: {
    outputFormats: ['markdown', 'summary', 'infographic'],
    summaryLength: 3000,
    enableVisualization: true,
    enablePPT: true,
    pptTemplate: 'professional',
    infographicTheme: 'blue',
    keyPointsExtract: 10,
    summaryStyle: 'executive',
    highlightQuotes: true,
    autoTags: true,
  },
};

const STAGE_INFO: Record<number, { name: string; icon: string; color: string }> = {
  1: { name: '选题策划', icon: '💡', color: '#6366f1' },
  2: { name: '深度研究', icon: '🔍', color: '#8b5cf6' },
  3: { name: '文稿生成', icon: '✍️', color: '#ec4899' },
  4: { name: '多态转换', icon: '🎯', color: '#f59e0b' },
};

export function StageConfig({ stage, isOpen, onClose }: StageConfigProps) {
  const [config, setConfig] = useState<StageConfigData>({});
  const [activeTab, setActiveTab] = useState<string>('basic');

  useEffect(() => {
    if (stage) {
      // 从 localStorage 加载已保存的配置
      const saved = localStorage.getItem(`stage-config-${stage}`);
      if (saved) {
        setConfig({ ...DEFAULT_CONFIGS[stage], ...JSON.parse(saved) });
      } else {
        setConfig(DEFAULT_CONFIGS[stage]);
      }
    }
  }, [stage]);

  const handleSave = () => {
    if (stage) {
      localStorage.setItem(`stage-config-${stage}`, JSON.stringify(config));
    }
    onClose();
  };

  const updateConfig = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateNestedConfig = (parentKey: string, key: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [parentKey]: { ...(prev as any)[parentKey], [key]: value },
    }));
  };

  if (!isOpen || !stage) return null;

  const stageInfo = STAGE_INFO[stage];

  return (
    <div className="stage-config-overlay active" onClick={onClose}>
      <div className="stage-config-panel" onClick={(e) => e.stopPropagation()}>
        <div className="stage-config-header" style={{ borderColor: stageInfo.color }}>
          <div className="stage-config-title">
            <span className="stage-icon" style={{ background: stageInfo.color }}>
              {stageInfo.icon}
            </span>
            <div>
              <h3>{stageInfo.name}配置</h3>
              <p>阶段 {stage}/4 - 自定义该阶段的行为参数</p>
            </div>
          </div>
          <button className="stage-config-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="stage-config-tabs">
          <button
            className={`config-tab ${activeTab === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            基础配置
          </button>
          <button
            className={`config-tab ${activeTab === 'advanced' ? 'active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            高级选项
          </button>
          {stage === 1 && (
            <button
              className={`config-tab ${activeTab === 'quality' ? 'active' : ''}`}
              onClick={() => setActiveTab('quality')}
            >
              质量输入(v3.0)
            </button>
          )}
        </div>

        <div className="stage-config-content">
          {stage === 1 && <Stage1Config config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} activeTab={activeTab} />}
          {stage === 2 && <Stage2Config config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} activeTab={activeTab} />}
          {stage === 3 && <Stage3Config config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} activeTab={activeTab} />}
          {stage === 4 && <Stage4Config config={config} updateConfig={updateConfig} updateNestedConfig={updateNestedConfig} activeTab={activeTab} />}
        </div>

        <div className="stage-config-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            style={{ background: stageInfo.color }}
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}

// 阶段1: 选题策划配置
function Stage1Config({
  config,
  updateConfig,
  updateNestedConfig,
  activeTab,
}: {
  config: StageConfigData;
  updateConfig: (key: string, value: any) => void;
  updateNestedConfig: (parentKey: string, key: string, value: any) => void;
  activeTab: string;
}) {
  if (activeTab === 'basic') {
    return (
      <div className="config-form">
        <div className="config-section">
          <div className="config-section-title">📊 评分维度权重</div>
          <div className="config-grid">
            {Object.entries(config.scoringWeights || {}).map(([key, value]) => (
              <div key={key} className="form-group">
                <label className="form-label">
                  {key === 'timeliness' && '时效性 (%) - 主题新鲜度'}
                  {key === 'depth' && '深度价值 (%) - 内容专业度'}
                  {key === 'interest' && '读者兴趣 (%) - 受众关注度'}
                  {key === 'differentiation' && '差异化 (%) - 内容独特性'}
                </label>
                <div className="range-input">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={value}
                    onChange={(e) =>
                      updateNestedConfig('scoringWeights', key, parseInt(e.target.value))
                    }
                  />
                  <span className="range-value">{value}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="config-section">
          <div className="config-section-title">🎯 输出配置</div>
          <div className="config-grid">
            <div className="form-group">
              <label className="form-label">目标读者</label>
              <select
                className="form-select"
                value={config.targetAudience}
                onChange={(e) => updateConfig('targetAudience', e.target.value)}
              >
                <option value="researchers">产业研究人员</option>
                <option value="investors">投资者</option>
                <option value="general">大众读者</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">内容深度</label>
              <select
                className="form-select"
                value={config.desiredDepth}
                onChange={(e) => updateConfig('desiredDepth', e.target.value)}
              >
                <option value="overview">概览 (适合快速了解)</option>
                <option value="standard">标准 (适合一般分析)</option>
                <option value="comprehensive">全面 (适合深度研究)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">大纲层级深度</label>
              <select
                className="form-select"
                value={config.outlineDepth}
                onChange={(e) => updateConfig('outlineDepth', parseInt(e.target.value))}
              >
                <option value={2}>2层 (章-节)</option>
                <option value={3}>3层 (章-节-点)</option>
                <option value={4}>4层 (章-节-点-细)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="config-section">
          <div className="config-section-title">🔥 热点与竞品</div>
          <div className="config-grid">
            <div className="form-group">
              <label className="form-label">热点追踪天数</label>
              <input
                type="number"
                className="form-input"
                min="1"
                max="30"
                value={config.hotTopicDays}
                onChange={(e) => updateConfig('hotTopicDays', parseInt(e.target.value))}
              />
              <span className="form-hint">追踪近几天内的热点事件</span>
            </div>
            <div className="form-group">
              <label className="form-label">竞品分析数量</label>
              <input
                type="number"
                className="form-input"
                min="0"
                max="10"
                value={config.competitorAnalysis}
                onChange={(e) => updateConfig('competitorAnalysis', parseInt(e.target.value))}
              />
              <span className="form-hint">分析同类主题的报告数量</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'quality') {
    return (
      <div className="config-form">
        <div className="config-section">
          <div className="config-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>📊 内容质量输入 (v3.0)</span>
            <a href="http://localhost:8080" target="_blank" rel="noopener noreferrer" className="dashboard-link">
              打开仪表盘 →
            </a>
          </div>
          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={config.enableQualityInput}
                onChange={(e) => updateConfig('enableQualityInput', e.target.checked)}
              />
              <span>启用质量输入体系</span>
            </label>
            <span className="form-hint">RSS聚合 + 质量评估 + 情感分析</span>
          </div>

          <div className="form-group">
            <label className="form-label">质量评估维度</label>
            <div className="checkbox-list">
              {Object.entries(config.qualityDimensions || {}).map(([key, value]) => (
                <label key={key} className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => updateNestedConfig('qualityDimensions', key, e.target.checked)}
                  />
                  <span>
                    {key === 'freshness' && '🕐 时效性 - 发布时间、更新频率'}
                    {key === 'credibility' && '✅ 可信度 - 来源权威性、交叉验证'}
                    {key === 'differentiation' && '🎯 差异化 - 竞品对比、原创性'}
                    {key === 'audienceMatch' && '👥 受众匹配 - 难度适配、平台适配'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">RSS源类别</label>
            <select
              className="form-select"
              multiple
              style={{ height: '100px' }}
              value={config.rssCategories}
              onChange={(e) => {
                const options = Array.from(e.target.selectedOptions).map((o) => o.value);
                updateConfig('rssCategories', options);
              }}
            >
              <option value="tech">科技 (36氪、机器之心等)</option>
              <option value="finance">财经 (财新、第一财经等)</option>
              <option value="research">研究 (艾瑞、易观等)</option>
              <option value="industry">行业 (虎嗅、雷锋网等)</option>
            </select>
            <span className="form-hint">按住Ctrl多选，24个RSS源</span>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={config.enableSentimentAnalysis}
                onChange={(e) => updateConfig('enableSentimentAnalysis', e.target.checked)}
              />
              <span>启用情感分析 (v3.2)</span>
            </label>
            <span className="form-hint">MSI市场情绪指数、情感分布</span>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={config.enableSmartRecommend}
                onChange={(e) => updateConfig('enableSmartRecommend', e.target.checked)}
              />
              <span>启用智能推荐 (v3.1)</span>
            </label>
            <span className="form-hint">基于用户画像的个性化推荐</span>
          </div>
        </div>
      </div>
    );
  }

  return <div className="empty-config">暂无高级选项</div>;
}

// 阶段2: 深度研究配置
function Stage2Config({
  config,
  updateConfig,
  updateNestedConfig,
  activeTab,
}: {
  config: StageConfigData;
  updateConfig: (key: string, value: any) => void;
  updateNestedConfig: (parentKey: string, key: string, value: any) => void;
  activeTab: string;
}) {
  return (
    <div className="config-form">
      <div className="config-section">
        <div className="config-section-title">🔍 研究配置</div>
        <div className="config-grid">
          <div className="form-group">
            <label className="form-label">最大搜索URL数</label>
            <input
              type="number"
              className="form-input"
              min="5"
              max="50"
              value={config.maxSearchUrls}
              onChange={(e) => updateConfig('maxSearchUrls', parseInt(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">素材库搜索数</label>
            <input
              type="number"
              className="form-input"
              min="5"
              max="30"
              value={config.assetLibrarySearch}
              onChange={(e) => updateConfig('assetLibrarySearch', parseInt(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">分析深度</label>
            <select
              className="form-select"
              value={config.analysisDepth}
              onChange={(e) => updateConfig('analysisDepth', e.target.value)}
            >
              <option value="overview">概览</option>
              <option value="standard">标准</option>
              <option value="comprehensive">全面</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">数据源可信度阈值</label>
            <input
              type="range"
              className="form-input"
              min="0"
              max="1"
              step="0.1"
              value={config.sourceCredibility}
              onChange={(e) => updateConfig('sourceCredibility', parseFloat(e.target.value))}
            />
            <span className="range-value">{(config.sourceCredibility || 0) * 100}%</span>
          </div>
          <div className="form-group">
            <label className="form-label">数据时效性(天)</label>
            <input
              type="number"
              className="form-input"
              min="30"
              max="1095"
              value={config.dataRecency}
              onChange={(e) => updateConfig('dataRecency', parseInt(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">洞察可信度阈值</label>
            <input
              type="range"
              className="form-input"
              min="0"
              max="1"
              step="0.05"
              value={config.insightMinConfidence}
              onChange={(e) => updateConfig('insightMinConfidence', parseFloat(e.target.value))}
            />
            <span className="range-value">{(config.insightMinConfidence || 0) * 100}%</span>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label">数据源类型</label>
          <div className="checkbox-list">
            {['government', 'industry', 'academic', 'expert'].map((source) => (
              <label key={source} className="form-checkbox">
                <input
                  type="checkbox"
                  checked={config.dataSources?.includes(source)}
                  onChange={(e) => {
                    const newSources = e.target.checked
                      ? [...(config.dataSources || []), source]
                      : (config.dataSources || []).filter((s) => s !== source);
                    updateConfig('dataSources', newSources);
                  }}
                />
                <span>
                  {source === 'government' && '🏛️ 政府公开数据'}
                  {source === 'industry' && '🏭 行业报告'}
                  {source === 'academic' && '🎓 学术论文'}
                  {source === 'expert' && '👤 专家观点'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={config.enableWebSearch}
              onChange={(e) => updateConfig('enableWebSearch', e.target.checked)}
            />
            <span>启用网络搜索</span>
          </label>
        </div>
        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={config.crossValidation}
              onChange={(e) => updateConfig('crossValidation', e.target.checked)}
            />
            <span>启用交叉验证</span>
          </label>
        </div>
        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={config.conflictHighlight}
              onChange={(e) => updateConfig('conflictHighlight', e.target.checked)}
            />
            <span>高亮数据冲突</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// 阶段3: 文稿生成配置
function Stage3Config({
  config,
  updateConfig,
  updateNestedConfig,
  activeTab,
}: {
  config: StageConfigData;
  updateConfig: (key: string, value: any) => void;
  updateNestedConfig: (parentKey: string, key: string, value: any) => void;
  activeTab: string;
}) {
  return (
    <div className="config-form">
      <div className="config-section">
        <div className="config-section-title">✍️ 写作配置</div>
        <div className="config-grid">
          <div className="form-group">
            <label className="form-label">写作风格</label>
            <select
              className="form-select"
              value={config.writingStyle}
              onChange={(e) => updateConfig('writingStyle', e.target.value)}
            >
              <option value="professional">专业严谨</option>
              <option value="business">商业通俗</option>
              <option value="academic">学术规范</option>
              <option value="journalistic">新闻报导</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">目标字数</label>
            <select
              className="form-select"
              value={config.targetLength}
              onChange={(e) => updateConfig('targetLength', e.target.value)}
            >
              <option value="3000-5000">3000-5000字 (简报)</option>
              <option value="5000-8000">5000-8000字 (标准)</option>
              <option value="8000-12000">8000-12000字 (深度)</option>
              <option value="12000+">12000字以上 (专著)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">引用格式</label>
            <select
              className="form-select"
              value={config.citationFormat}
              onChange={(e) => updateConfig('citationFormat', e.target.value)}
            >
              <option value="gb7714">GB/T 7714 (国标)</option>
              <option value="apa">APA</option>
              <option value="mla">MLA</option>
              <option value="chicago">Chicago</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">最大图表数</label>
            <input
              type="number"
              className="form-input"
              min="0"
              max="20"
              value={config.maxCharts}
              onChange={(e) => updateConfig('maxCharts', parseInt(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="config-section">
        <div className="config-section-title">👥 蓝军评审配置</div>
        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={config.enableBlueTeam}
              onChange={(e) => updateConfig('enableBlueTeam', e.target.checked)}
            />
            <span>启用蓝军评审</span>
          </label>
        </div>
        {config.enableBlueTeam && (
          <>
            <div className="config-grid" style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">评审轮数</label>
                <select
                  className="form-select"
                  value={config.blueTeamRounds}
                  onChange={(e) => updateConfig('blueTeamRounds', parseInt(e.target.value))}
                >
                  <option value={1}>1轮 (快速)</option>
                  <option value={2}>2轮 (标准)</option>
                  <option value={3}>3轮 (严格)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">评审严格度</label>
                <select
                  className="form-select"
                  value={config.blueTeamStrictness}
                  onChange={(e) => updateConfig('blueTeamStrictness', e.target.value)}
                >
                  <option value="lenient">宽松</option>
                  <option value="standard">标准</option>
                  <option value="strict">严格</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">连贯性阈值</label>
                <input
                  type="range"
                  className="form-input"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={config.coherenceThreshold}
                  onChange={(e) => updateConfig('coherenceThreshold', parseFloat(e.target.value))}
                />
                <span className="range-value">{(config.coherenceThreshold || 0) * 100}%</span>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={config.autoAcceptMinor}
                  onChange={(e) => updateConfig('autoAcceptMinor', e.target.checked)}
                />
                <span>自动接受轻微问题</span>
              </label>
            </div>
            <div className="form-group">
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={config.evidenceCheck}
                  onChange={(e) => updateConfig('evidenceCheck', e.target.checked)}
                />
                <span>启用证据核查</span>
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 阶段4: 多态转换配置
function Stage4Config({
  config,
  updateConfig,
  updateNestedConfig,
  activeTab,
}: {
  config: StageConfigData;
  updateConfig: (key: string, value: any) => void;
  updateNestedConfig: (parentKey: string, key: string, value: any) => void;
  activeTab: string;
}) {
  return (
    <div className="config-form">
      <div className="config-section">
        <div className="config-section-title">📄 输出格式配置</div>
        <div className="form-group">
          <label className="form-label">输出格式</label>
          <div className="checkbox-list">
            {[
              { key: 'markdown', label: '📝 Markdown文档', desc: '标准研究报告格式' },
              { key: 'pdf', label: '📑 PDF文档', desc: '适合打印和分享' },
              { key: 'summary', label: '📋 执行摘要', desc: '高管快速阅读版本' },
              { key: 'infographic', label: '🎨 信息图', desc: '可视化展示' },
              { key: 'ppt', label: '📊 PPT演示', desc: '演示文稿' },
            ].map(({ key, label, desc }) => (
              <label key={key} className="form-checkbox">
                <input
                  type="checkbox"
                  checked={config.outputFormats?.includes(key)}
                  onChange={(e) => {
                    const newFormats = e.target.checked
                      ? [...(config.outputFormats || []), key]
                      : (config.outputFormats || []).filter((f) => f !== key);
                    updateConfig('outputFormats', newFormats);
                  }}
                />
                <span>
                  <strong>{label}</strong>
                  <small style={{ display: 'block', color: 'var(--gray-500)', fontSize: '11px' }}>
                    {desc}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {config.outputFormats?.includes('summary') && (
        <div className="config-section">
          <div className="config-section-title">📋 摘要配置</div>
          <div className="config-grid">
            <div className="form-group">
              <label className="form-label">摘要长度</label>
              <select
                className="form-select"
                value={config.summaryLength}
                onChange={(e) => updateConfig('summaryLength', parseInt(e.target.value))}
              >
                <option value={1000}>1000字 (极简)</option>
                <option value={2000}>2000字 (简短)</option>
                <option value={3000}>3000字 (标准)</option>
                <option value={5000}>5000字 (详细)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">摘要风格</label>
              <select
                className="form-select"
                value={config.summaryStyle}
                onChange={(e) => updateConfig('summaryStyle', e.target.value)}
              >
                <option value="executive">执行摘要 (决策导向)</option>
                <option value="academic">学术摘要 (研究导向)</option>
                <option value="marketing">营销摘要 (推广导向)</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={config.highlightQuotes}
                onChange={(e) => updateConfig('highlightQuotes', e.target.checked)}
              />
              <span>高亮引用观点</span>
            </label>
          </div>
        </div>
      )}

      {config.outputFormats?.includes('ppt') && (
        <div className="config-section">
          <div className="config-section-title">📊 PPT配置</div>
          <div className="form-group">
            <label className="form-label">PPT模板</label>
            <select
              className="form-select"
              value={config.pptTemplate}
              onChange={(e) => updateConfig('pptTemplate', e.target.value)}
            >
              <option value="professional">专业商务</option>
              <option value="minimal">极简风格</option>
              <option value="creative">创意设计</option>
              <option value="academic">学术报告</option>
            </select>
          </div>
        </div>
      )}

      {config.outputFormats?.includes('infographic') && (
        <div className="config-section">
          <div className="config-section-title">🎨 信息图配置</div>
          <div className="form-group">
            <label className="form-label">主题配色</label>
            <select
              className="form-select"
              value={config.infographicTheme}
              onChange={(e) => updateConfig('infographicTheme', e.target.value)}
            >
              <option value="blue">蓝色系 (商务)</option>
              <option value="green">绿色系 (生态)</option>
              <option value="orange">橙色系 (活力)</option>
              <option value="purple">紫色系 (科技)</option>
            </select>
          </div>
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">关键要点数</label>
            <input
              type="number"
              className="form-input"
              min="5"
              max="20"
              value={config.keyPointsExtract}
              onChange={(e) => updateConfig('keyPointsExtract', parseInt(e.target.value))}
            />
          </div>
        </div>
      )}

      <div className="form-group" style={{ marginTop: '16px' }}>
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={config.autoTags}
            onChange={(e) => updateConfig('autoTags', e.target.checked)}
          />
          <span>自动生成标签</span>
        </label>
      </div>
    </div>
  );
}
