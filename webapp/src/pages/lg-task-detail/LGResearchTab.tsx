// LG Research Tab - 深度研究
// 数据包展示 + 分析摘要 + 关键洞察 + 引用可靠性 + 工具操作栏 + Stage 头部 + 多源配置

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { LGTaskContext } from '../LGTaskDetailLayout';

interface ResearchConfig {
  autoCollect: boolean;
  maxResults: number;
  minCredibility: number;
  timeRange: '7d' | '30d' | '90d' | '1y';
  keywords: string[];
  excludeKeywords: string[];
  sources: {
    web: boolean;
    rss: boolean;
    assets: boolean;
    hotTopics: boolean;
  };
}

const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  autoCollect: true,
  maxResults: 20,
  minCredibility: 0.6,
  timeRange: '30d',
  keywords: [],
  excludeKeywords: [],
  sources: { web: true, rss: true, assets: true, hotTopics: false },
};

function loadResearchConfig(threadId: string): ResearchConfig {
  try {
    const raw = localStorage.getItem(`lg-research-config:${threadId}`);
    if (raw) return { ...DEFAULT_RESEARCH_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_RESEARCH_CONFIG;
}

function saveResearchConfig(threadId: string, config: ResearchConfig) {
  try {
    localStorage.setItem(`lg-research-config:${threadId}`, JSON.stringify(config));
  } catch {}
}

export function LGResearchTab() {
  const { detail, onRefresh } = useOutletContext<LGTaskContext>();
  const [showStrategy, setShowStrategy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<ResearchConfig>(DEFAULT_RESEARCH_CONFIG);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  // 加载配置
  useEffect(() => {
    if (!detail?.threadId) return;
    const cfg = loadResearchConfig(detail.threadId);
    setConfig(cfg);
    setKeywordsInput(cfg.keywords.join(', '));
    setExcludeInput(cfg.excludeKeywords.join(', '));
  }, [detail?.threadId]);

  // 保存配置
  const handleSaveConfig = () => {
    if (!detail?.threadId) return;
    const next: ResearchConfig = {
      ...config,
      keywords: keywordsInput.split(',').map((k) => k.trim()).filter(Boolean),
      excludeKeywords: excludeInput.split(',').map((k) => k.trim()).filter(Boolean),
    };
    setConfig(next);
    saveResearchConfig(detail.threadId, next);
    setShowConfig(false);
  };

  if (!detail) {
    return <div className="tab-panel"><p style={{ color: 'var(--text-muted)' }}>暂无任务数据</p></div>;
  }

  const research = detail.researchData;
  const dataPackage = normalizeDataPackage(research?.dataPackage);

  if (!research) {
    return (
      <div className="tab-panel">
        <div className="info-card full-width" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>
            hourglass_empty
          </span>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>研究阶段尚未启动</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            请先在「选题策划」中确认大纲，Pipeline 将自动进入研究阶段
          </p>
          <div className="lg-progress-bar" style={{ maxWidth: '300px', margin: '16px auto 0', height: '4px', borderRadius: '2px' }}>
            <div className="lg-progress-fill" style={{ width: `${detail.progress || 0}%`, height: '100%', borderRadius: '2px' }} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>当前进度: {detail.progress || 0}%</span>
        </div>
      </div>
    );
  }

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  // 计算可靠度等级 A/B/C/D
  const getReliabilityGrade = (raw?: number): { grade: string; color: string } => {
    if (typeof raw !== 'number') return { grade: '-', color: 'var(--text-muted)' };
    const pct = raw > 1 ? raw : raw * 100;
    if (pct >= 85) return { grade: 'A', color: '#22c55e' };
    if (pct >= 70) return { grade: 'B', color: '#3b82f6' };
    if (pct >= 50) return { grade: 'C', color: '#f59e0b' };
    return { grade: 'D', color: '#ef4444' };
  };

  // 引用统计
  const reliabilityStats = dataPackage.reduce(
    (acc, item) => {
      const { grade } = getReliabilityGrade(item.reliability);
      if (grade !== '-') acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="tab-panel">
      {/* Re8: Stage 标题头部 */}
      <div
        className="info-card full-width"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          background: 'linear-gradient(90deg, hsla(199, 89%, 48%, 0.05), transparent)',
          borderLeft: '4px solid var(--primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}
          >
            STAGE 2
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
              深度研究
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              基于大纲展开多维度数据采集与洞察提炼
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="lg-btn lg-btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              background: showConfig ? 'hsla(210, 80%, 50%, 0.1)' : undefined,
              color: showConfig ? '#3b82f6' : undefined,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>tune</span>
            研究配置
          </button>
          <button
            type="button"
            onClick={() => setShowStrategy(!showStrategy)}
            className="lg-btn lg-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {showStrategy ? 'visibility_off' : 'visibility'}
            </span>
            {showStrategy ? '隐藏策略' : '查看策略'}
          </button>
        </div>
      </div>

      {/* 多源引擎配置面板 (Re1) */}
      {showConfig && (
        <div className="info-card full-width" style={{ marginBottom: '20px' }}>
          <div className="card-title">
            <span className="material-symbols-outlined">tune</span>
            研究引擎配置
          </div>

          {/* 数据源开关 */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
              数据源
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {([
                { key: 'web', label: '🌐 全网搜索', desc: 'Tavily AI' },
                { key: 'rss', label: '📡 RSS 订阅', desc: '已订阅源' },
                { key: 'assets', label: '📚 私有素材', desc: '向量库' },
                { key: 'hotTopics', label: '🔥 热点话题', desc: '社区追踪' },
              ] as const).map((s) => {
                const active = config.sources[s.key];
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        sources: { ...config.sources, [s.key]: !active },
                      })
                    }
                    style={{
                      flex: '1 1 140px',
                      padding: '10px 12px',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--divider)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: active ? 'var(--primary-alpha)' : 'var(--surface)',
                      color: active ? 'var(--primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '12px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{s.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.7 }}>{s.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 参数配置 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                自动采集
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.autoCollect}
                  onChange={(e) => setConfig({ ...config, autoCollect: e.target.checked })}
                />
                启用自动采集
              </label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                最大结果数
              </label>
              <input
                type="number"
                className="lg-input"
                min={5}
                max={50}
                value={config.maxResults}
                onChange={(e) => setConfig({ ...config, maxResults: Number(e.target.value) || 20 })}
                style={{ fontSize: '12px', padding: '6px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                最低可信度 ({Math.round(config.minCredibility * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.minCredibility}
                onChange={(e) => setConfig({ ...config, minCredibility: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                时间范围
              </label>
              <select
                className="lg-select"
                value={config.timeRange}
                onChange={(e) => setConfig({ ...config, timeRange: e.target.value as any })}
                style={{ fontSize: '12px', padding: '6px 8px' }}
              >
                <option value="7d">近 7 天</option>
                <option value="30d">近 30 天</option>
                <option value="90d">近 90 天</option>
                <option value="1y">近 1 年</option>
              </select>
            </div>
          </div>

          {/* 关键词 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                关键词（逗号分隔）
              </label>
              <input
                type="text"
                className="lg-input"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="例如：REITs, 保租房, 政策"
                style={{ fontSize: '12px', padding: '6px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                排除关键词
              </label>
              <input
                type="text"
                className="lg-input"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                placeholder="例如：广告, 宣传"
                style={{ fontSize: '12px', padding: '6px 8px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="lg-btn lg-btn-secondary" onClick={() => setShowConfig(false)} style={{ fontSize: '12px' }}>
              取消
            </button>
            <button type="button" className="lg-btn lg-btn-primary" onClick={handleSaveConfig} style={{ fontSize: '12px' }}>
              保存配置
            </button>
          </div>
        </div>
      )}

      {/* 研究策略说明（折叠） */}
      {showStrategy && (
        <div className="info-card full-width" style={{ marginBottom: '20px', background: 'var(--surface-alt)' }}>
          <div className="card-title">
            <span className="material-symbols-outlined">tune</span>
            研究策略
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>多源数据采集：行业报告、公开新闻、市场研究、社区话题</li>
            <li>事实交叉验证：通过多源比对剔除孤立信息</li>
            <li>洞察提炼：识别趋势、风险、机会三类核心结论</li>
            <li>可信度评级：A 级 ≥85%，B 级 ≥70%，C 级 ≥50%，D 级 &lt;50%</li>
          </ul>
        </div>
      )}

      {/* Re7: 工具操作栏 */}
      <div
        className="info-card full-width"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>storage</span>
            数据来源：<strong style={{ color: 'var(--text)' }}>{dataPackage.length}</strong>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>psychology</span>
            洞察：<strong style={{ color: 'var(--text)' }}>{research.insights?.length || 0}</strong>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>verified</span>
            A 级来源：<strong style={{ color: '#22c55e' }}>{reliabilityStats.A || 0}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="lg-btn lg-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span>
            {refreshing ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>

      {/* 分析摘要 */}
      {research.analysis && (
        <div className="panel-grid">
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">summarize</span>
              研究分析
            </div>
          </div>

          <div className="info-card full-width">
            <div className="card-title">
              <span className="material-symbols-outlined">description</span>
              摘要
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.7 }}>
              {research.analysis.summary || '暂无摘要'}
            </p>
          </div>

          {research.analysis.keyFindings && research.analysis.keyFindings.length > 0 && (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">lightbulb</span>
                关键发现
              </div>
              <ol style={{ margin: 0, paddingLeft: '20px' }}>
                {research.analysis.keyFindings.map((finding: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                    {finding}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {research.analysis.gaps && research.analysis.gaps.length > 0 && (
            <div className="info-card">
              <div className="card-title">
                <span className="material-symbols-outlined">warning</span>
                研究空白
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {research.analysis.gaps.map((gap: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--warning, #f59e0b)', marginBottom: '8px' }}>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 数据包 */}
      {dataPackage.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">storage</span>
              数据来源 ({dataPackage.length})
            </div>
            {/* Re6: 引用可靠性分级摘要 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['A', 'B', 'C', 'D'] as const).map((g) => {
                const count = reliabilityStats[g] || 0;
                const colorMap: Record<string, string> = { A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
                return (
                  <span
                    key={g}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: `${colorMap[g]}15`,
                      color: colorMap[g],
                      border: `1px solid ${colorMap[g]}40`,
                    }}
                  >
                    {g}: {count}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="info-card full-width">
            <div className="data-review-table-wrapper">
              <table className="data-review-table">
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>来源</th>
                    <th style={{ width: '80px' }}>类型</th>
                    <th>内容摘要</th>
                    <th style={{ width: '50px' }}>等级</th>
                    <th style={{ width: '100px' }}>可靠度</th>
                  </tr>
                </thead>
                <tbody>
                  {dataPackage.map((item: any, i: number) => {
                    const { grade, color } = getReliabilityGrade(item.reliability);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.source || '未知'}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-full)',
                            fontSize: '11px', fontWeight: 600,
                            background: 'var(--primary-alpha)', color: 'var(--primary)',
                          }}>
                            {item.type || 'data'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                          {formatDataPackageContent(item)}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 800,
                              background: grade === '-' ? 'var(--surface-alt)' : `${color}15`,
                              color,
                              border: grade === '-' ? '1px dashed var(--divider)' : `1px solid ${color}40`,
                            }}
                          >
                            {grade}
                          </span>
                        </td>
                        <td>
                          <ReliabilityBar value={item.reliability} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 关键洞察 */}
      {research.insights && research.insights.length > 0 && (
        <div className="panel-grid" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">
              <span className="material-symbols-outlined">psychology</span>
              关键洞察 ({research.insights.length})
            </div>
          </div>

          {research.insights.map((insight: any, i: number) => (
            <div key={i} className="info-card lg-insight-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 'var(--radius-full)',
                  fontSize: '11px', fontWeight: 600,
                  background: getInsightColor(insight.type).bg,
                  color: getInsightColor(insight.type).text,
                }}>
                  {insight.type || 'insight'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  置信度: {Math.round((insight.confidence || 0) * 100)}%
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                {insight.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReliabilityBar({ value }: { value?: number }) {
  const raw = typeof value === 'number' ? value : 0;
  const pct = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--surface-alt)', borderRadius: '2px', minWidth: '40px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

function getInsightColor(type: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    trend: { bg: 'hsla(199, 89%, 48%, 0.1)', text: 'var(--info, #3b82f6)' },
    risk: { bg: 'hsla(0, 72%, 51%, 0.1)', text: 'var(--danger, #ef4444)' },
    opportunity: { bg: 'hsla(142, 45%, 45%, 0.1)', text: 'var(--success)' },
    data: { bg: 'hsla(270, 50%, 50%, 0.1)', text: '#8b5cf6' },
  };
  return map[type] || { bg: 'var(--surface-alt)', text: 'var(--text-secondary)' };
}

function normalizeDataPackage(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'object') {
    return Object.entries(input).map(([key, value]) => ({
      source: key,
      type: inferTypeFromKey(key),
      content: value,
    }));
  }
  return [{ source: 'raw', type: 'text', content: input }];
}

function inferTypeFromKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('report')) return 'report';
  if (k.includes('news')) return 'news';
  if (k.includes('web')) return 'web';
  return 'data';
}

function formatDataPackageContent(item: any): string {
  const content = item?.content;
  if (content == null) return '-';
  if (typeof content === 'string') {
    const parsed = safeParseJson(content);
    if (parsed !== null) return summarizeStructuredContent(parsed);
    return truncate(content);
  }
  if (typeof content === 'object') {
    return summarizeStructuredContent(content);
  }
  return String(content);
}

function summarizeStructuredContent(value: any): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '空数组';
    if (typeof value[0] === 'object' && value[0] !== null) {
      const previews = value.slice(0, 3).map((x: any) => x.title || x.name || x.id || '未命名条目');
      const suffix = value.length > 3 ? ` 等 ${value.length} 条` : ` 共 ${value.length} 条`;
      return `${previews.join(' / ')}${suffix}`;
    }
    return `${value.slice(0, 5).join(', ')}${value.length > 5 ? ' ...' : ''}`;
  }
  if (value && typeof value === 'object') {
    // 处理常见的 reports 结构：{ reports: [...] }
    if (Array.isArray((value as any).reports)) {
      return summarizeStructuredContent((value as any).reports);
    }
    const keys = Object.keys(value);
    return `对象字段: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ' ...' : ''}`;
  }
  return truncate(String(value));
}

function safeParseJson(text: string): any | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function truncate(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
