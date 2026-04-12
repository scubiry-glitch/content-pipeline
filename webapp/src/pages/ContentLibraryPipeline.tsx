// 数据生产流水线可视化页面
// v7.3: 流程图 + 分析摘要 + 点击弹窗 (上下游复用 PRODUCT_META)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT_META, type ProductMetaDef } from '../components/ContentLibraryProductMeta';
import './ContentLibraryPipeline.css';

const API = '/api/v1/content-library';

// ============================================================
// 统计数据类型
// ============================================================
interface OverviewStats {
  assets: { total: number; ai_analyzed: number; fact_extracted: number; pending_ai: number; failed_ai: number };
  facts: number;
  entities: number;
  contradictions: number;
  beliefs: number;
  synthesisCached: number;
  relations: number;
  communities: number;
}

// ============================================================
// 节点定义 — 与 PRODUCT_META 保持一致
// ============================================================
const OUTPUTS: Array<{
  key: string;
  meta: ProductMetaDef;
  /** stats 字段名或取值函数 */
  statKey?: keyof OverviewStats | ((s: OverviewStats) => number | null);
}> = [
  { key: 'topics',         meta: PRODUCT_META.topics,         statKey: (s) => null },
  { key: 'trends',         meta: PRODUCT_META.trends },
  { key: 'angles',         meta: PRODUCT_META.angles },
  { key: 'gaps',           meta: PRODUCT_META.gaps },
  { key: 'facts',          meta: PRODUCT_META.facts,          statKey: 'facts' },
  { key: 'entities',       meta: PRODUCT_META.entities,       statKey: 'entities' },
  { key: 'delta',          meta: PRODUCT_META.delta },
  { key: 'freshness',      meta: PRODUCT_META.freshness },
  { key: 'cards',          meta: PRODUCT_META.cards },
  { key: 'synthesis',      meta: PRODUCT_META.synthesis,      statKey: 'synthesisCached' },
  { key: 'materials',      meta: PRODUCT_META.materials },
  { key: 'consensus',      meta: PRODUCT_META.consensus },
  { key: 'contradictions',  meta: PRODUCT_META.contradictions,  statKey: 'contradictions' },
  { key: 'beliefs',        meta: PRODUCT_META.beliefs,        statKey: 'beliefs' },
  { key: 'crossDomain',    meta: PRODUCT_META.crossDomain },
];

const PHASES = [
  { key: '选题', label: '选题阶段', cssClass: 'phase-selection' },
  { key: '研究', label: '研究阶段', cssClass: 'phase-research' },
  { key: '写作', label: '写作阶段', cssClass: 'phase-writing' },
  { key: '审核', label: '审核阶段', cssClass: 'phase-review' },
] as const;

function getCount(o: typeof OUTPUTS[0], stats: OverviewStats | null): number | null {
  if (!stats || !o.statKey) return null;
  if (typeof o.statKey === 'function') return o.statKey(stats);
  return (stats as any)[o.statKey] ?? null;
}

// ============================================================
// 主组件
// ============================================================
export function ContentLibraryPipeline() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [modalNode, setModalNode] = useState<{ type: 'output' | 'step' | 'source'; key: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/stats/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const outputsByPhase = (phase: string) => OUTPUTS.filter(o => o.meta.phase === phase);

  // ============================================================
  // 弹窗内容
  // ============================================================
  const renderModal = () => {
    if (!modalNode) return null;

    let title = '';
    let statCards: Array<{ value: string; label: string }> = [];
    let upstream: string[] = [];
    let downstream: string[] = [];
    let pagePath: string | undefined;
    let batchOpsLink = true;

    if (modalNode.type === 'output') {
      const o = OUTPUTS.find(x => x.key === modalNode.key);
      if (!o) return null;
      title = `${o.meta.id} ${o.meta.name}`;
      upstream = o.meta.upstream;
      downstream = o.meta.downstream;
      pagePath = o.meta.page;
      const c = getCount(o, stats);
      if (c !== null) {
        statCards.push({ value: String(c), label: '当前数量' });
      }
      if (stats) {
        statCards.push({ value: String(stats.assets.ai_analyzed), label: 'AI 已分析素材' });
        statCards.push({ value: String(stats.assets.fact_extracted), label: '已提取事实素材' });
        statCards.push({ value: `${stats.assets.pending_ai}`, label: '待处理素材' });
      }
    } else if (modalNode.type === 'step') {
      const stepDefs: Record<string, { title: string; desc: string; stats: Array<{ value: string; label: string }> }> = {
        step2: {
          title: 'Step 2: AI 批量分析',
          desc: '向量化 + 质量评分 + 主题检测 + 去重',
          stats: stats ? [
            { value: String(stats.assets.ai_analyzed), label: '已分析' },
            { value: String(stats.assets.pending_ai), label: '待处理' },
            { value: String(stats.assets.failed_ai), label: '失败' },
            { value: String(stats.assets.total), label: '总素材' },
          ] : [],
        },
        step3: {
          title: 'Step 3: 两段式事实提取',
          desc: 'analyze → extract → delta compress → entity resolve (断点续传)',
          stats: stats ? [
            { value: String(stats.facts), label: '事实总数' },
            { value: String(stats.entities), label: '实体总数' },
            { value: String(stats.assets.fact_extracted), label: '已提取素材' },
            { value: String(stats.assets.total - stats.assets.fact_extracted), label: '未提取' },
          ] : [],
        },
        step4: {
          title: 'Step 4: 知识图谱重算',
          desc: 'Louvain 社区发现 + 4 信号边表 + 观点推断',
          stats: stats ? [
            { value: String(stats.communities), label: '社区数' },
            { value: String(stats.relations), label: '关系边数' },
            { value: String(stats.beliefs), label: '观点数' },
          ] : [],
        },
        step5: {
          title: 'Step 5: AI 产出物预生成',
          desc: '5a 议题叙事 + 5b 认知综合 (LLM 缓存)',
          stats: stats ? [
            { value: String(stats.synthesisCached), label: '综合缓存数' },
          ] : [],
        },
        step6: {
          title: 'Step 6: Wiki 物化',
          desc: '生成 Obsidian 兼容 Markdown vault',
          stats: [],
        },
      };
      const sd = stepDefs[modalNode.key];
      if (!sd) return null;
      title = sd.title;
      statCards = sd.stats;
      upstream = ['参见流程图上游连线'];
      downstream = ['参见流程图下游产出物'];
    } else if (modalNode.type === 'source') {
      title = modalNode.key === 'assets' ? '📁 素材库 (Assets)' : '📡 RSS 源';
      if (stats) {
        statCards = modalNode.key === 'assets'
          ? [
              { value: String(stats.assets.total), label: '总素材数' },
              { value: String(stats.assets.ai_analyzed), label: 'AI 已分析' },
              { value: String(stats.assets.fact_extracted), label: '事实已提取' },
              { value: String(stats.assets.failed_ai), label: '处理失败' },
            ]
          : [{ value: '-', label: 'RSS 源' }];
      }
      upstream = modalNode.key === 'assets'
        ? ['文件上传 / 目录绑定扫描 / API 导入']
        : ['RSS 订阅源自动同步'];
      downstream = ['Step 2: AI 批量分析', 'Step 3: 两段式事实提取'];
      pagePath = modalNode.key === 'assets' ? '/assets' : '/rss-sources';
      batchOpsLink = true;
    }

    return (
      <div className="modal-overlay pipeline-modal" onClick={() => setModalNode(null)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{title}</h3>
            <button className="close-btn" onClick={() => setModalNode(null)}>&times;</button>
          </div>
          <div className="modal-body">
            {statCards.length > 0 && (
              <div className="pipeline-modal-stats">
                {statCards.map((sc, i) => (
                  <div key={i} className="pipeline-stat-card">
                    <div className="pipeline-stat-value">{sc.value}</div>
                    <div className="pipeline-stat-label">{sc.label}</div>
                  </div>
                ))}
              </div>
            )}

            {modalNode.type !== 'step' && (
              <>
                <div className="pipeline-modal-section section-upstream">
                  <h4>⬆️ 上游来源</h4>
                  <ul>{upstream.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div className="pipeline-modal-section section-downstream">
                  <h4>⬇️ 下游引用</h4>
                  <ul>{downstream.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </>
            )}

            <div className="pipeline-modal-actions">
              {pagePath && (
                <a href={pagePath} className="action-primary" onClick={e => { e.preventDefault(); setModalNode(null); navigate(pagePath!); }}>
                  查看完整页面 →
                </a>
              )}
              {batchOpsLink && (
                <a href="/content-library/batch-ops" className="action-secondary" onClick={e => { e.preventDefault(); setModalNode(null); navigate('/content-library/batch-ops'); }}>
                  在批量操作中执行
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="pipeline-page">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">数据生产流水线</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          从素材导入到知识产出的完整数据加工链路 · 点击节点查看详情
        </p>
      </div>

      {/* 分析摘要 */}
      <div className="pipeline-analysis">
        <button className="pipeline-analysis-toggle" onClick={() => setShowAnalysis(v => !v)}>
          <span>📊 现有入口分析 — /content-library vs /batch-ops vs 本页</span>
          <span>{showAnalysis ? '▲' : '▼'}</span>
        </button>
        {showAnalysis && (
          <div className="pipeline-analysis-body">
            <div className="pipeline-analysis-grid">
              <div className="pipeline-analysis-card card-overview">
                <h4>/content-library (产出物总览)</h4>
                <p className="analysis-pro">✅ 全景概览 15 个产出物及数量</p>
                <p className="analysis-pro">✅ 按阶段快速筛选</p>
                <p className="analysis-con">❌ 看不到数据流向和依赖关系</p>
                <p className="analysis-con">❌ 不知道每个产出物从哪来</p>
              </div>
              <div className="pipeline-analysis-card card-batchops">
                <h4>/batch-ops (批量操作)</h4>
                <p className="analysis-pro">✅ 操作执行一站式完成</p>
                <p className="analysis-pro">✅ SSE 实时进度 + 断点续传</p>
                <p className="analysis-con">❌ 不清楚每步影响哪些产出物</p>
                <p className="analysis-con">❌ 无法一眼看到全局知识量</p>
              </div>
              <div className="pipeline-analysis-card card-pipeline" style={{ gridColumn: '1 / -1' }}>
                <h4>本页定位: 数据流向可视化 + 每环节状态检视 + 快速跳转</h4>
                <p>补充上述两个入口的不足：展示从数据源 → 加工步骤 → 15 个产出物的完整链路，每个节点可点击查看数量、上下游关系、并跳转到对应页面。</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 流程图 */}
      <div className="pipeline-flow">
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载统计数据中...</div>
        ) : (
          <div className="pipeline-flow-inner">
            {/* 列 1: 数据源 */}
            <div>
              <div className="pipeline-col-label">数据源</div>
              <div className="pipeline-source">
                <div className="source-node" onClick={() => setModalNode({ type: 'source', key: 'assets' })}>
                  <span className="source-icon">📁</span>
                  <span className="source-label">素材库</span>
                  <span className="source-count">{stats?.assets.total ?? '-'} 个</span>
                </div>
                <div className="source-node" onClick={() => setModalNode({ type: 'source', key: 'rss' })}>
                  <span className="source-icon">📡</span>
                  <span className="source-label">RSS 源</span>
                </div>
                <div className="flow-arrow">→</div>
              </div>
            </div>

            {/* 列 2: 加工步骤 */}
            <div>
              <div className="pipeline-col-label">加工步骤</div>
              <div className="pipeline-steps">
                <div className="step-node parallel-hint" onClick={() => setModalNode({ type: 'step', key: 'step2' })}>
                  <div className="step-header">
                    <span className="step-number">2</span>
                    <span className="step-label">AI 批量分析</span>
                  </div>
                  <div className="step-desc">向量化 + 质量评分 + 主题 + 去重</div>
                  {stats && <div className="step-stat">{stats.assets.ai_analyzed}/{stats.assets.total} 已分析</div>}
                </div>
                <div className="step-node parallel-hint" onClick={() => setModalNode({ type: 'step', key: 'step3' })}>
                  <div className="step-header">
                    <span className="step-number">3</span>
                    <span className="step-label">两段式事实提取</span>
                  </div>
                  <div className="step-desc">analyze → extract → delta → resolve</div>
                  {stats && <div className="step-stat">{stats.facts} 事实 · {stats.entities} 实体</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" onClick={() => setModalNode({ type: 'step', key: 'step4' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(140 45% 40%)' }}>4</span>
                    <span className="step-label">知识图谱重算</span>
                  </div>
                  <div className="step-desc">Louvain 社区 + 4 信号边表 + 观点</div>
                  {stats && <div className="step-stat">{stats.communities} 社区 · {stats.relations} 边 · {stats.beliefs} 观点</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" onClick={() => setModalNode({ type: 'step', key: 'step5' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(30 50% 50%)' }}>5</span>
                    <span className="step-label">AI 产出物预生成</span>
                  </div>
                  <div className="step-desc">5a 议题叙事 + 5b 认知综合</div>
                  {stats && <div className="step-stat">{stats.synthesisCached} 条综合缓存</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" onClick={() => setModalNode({ type: 'step', key: 'step6' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(270 40% 50%)' }}>6</span>
                    <span className="step-label">Wiki 物化</span>
                  </div>
                  <div className="step-desc">Obsidian 兼容 Markdown vault</div>
                </div>
              </div>
            </div>

            {/* 列 3: 产出物 (按阶段分组) */}
            <div>
              <div className="pipeline-col-label">15 个产出物</div>
              <div className="pipeline-outputs">
                {PHASES.map(phase => {
                  const items = outputsByPhase(phase.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={phase.key} className={`phase-group ${phase.cssClass}`}>
                      <div className="phase-label">{phase.label}</div>
                      <div className="phase-items">
                        {items.map(o => {
                          const c = getCount(o, stats);
                          return (
                            <div
                              key={o.key}
                              className="output-node"
                              onClick={() => setModalNode({ type: 'output', key: o.key })}
                            >
                              <span className="output-id">{o.meta.id}</span>
                              <span className="output-name">{o.meta.name}</span>
                              {c !== null && <span className="output-count">{c}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Wiki (无 phase) */}
                <div className="phase-group" style={{ borderColor: 'hsl(270 30% 75%)', background: 'hsl(270 20% 98%)' }}>
                  <div className="phase-label" style={{ color: 'hsl(270 40% 40%)' }}>物化输出</div>
                  <div className="phase-items">
                    <div className="output-node" onClick={() => setModalNode({ type: 'output', key: 'wiki' })}>
                      <span className="output-id">📖</span>
                      <span className="output-name">{PRODUCT_META.wiki.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部全局统计 */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { v: stats.assets.total, l: '总素材', icon: '📁' },
            { v: stats.facts, l: '事实三元组', icon: '📋' },
            { v: stats.entities, l: '实体', icon: '🔗' },
            { v: stats.relations, l: '关系边', icon: '🌐' },
          ].map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{s.icon} {s.v}</div>
              <div className="text-xs text-gray-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* 弹窗 */}
      {renderModal()}
    </div>
  );
}
