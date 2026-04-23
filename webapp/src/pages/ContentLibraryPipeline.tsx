// 数据生产流水线可视化页面
// v7.3: 流程图 + 分析摘要 + 点击弹窗 (上下游复用 PRODUCT_META)
// v7.3b: SVG 连线 + 按阶段/按步骤切换
// v7.4: 反映「深度模式」(enableDeep / expertStrategy) + 专家库 CDT 参与的 Step 2/3/5/topics
//       · 新增 asset_deep_analysis 产出线 · Step 4 新增 BeliefPattern(8) / TrendSignalQuality
//       · 应用场景新增「深度分析详情」「专家体系全景」
// v7.5: 争议 L1/L2/L3 三层召回 + 议题 7 场景分类 + 角度卡 + why 三问 + 目的倒推
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT_META, type ProductMetaDef } from '../components/ContentLibraryProductMeta';
import './ContentLibraryPipeline.css';

const API = '/api/v1/content-library';

// ============================================================
// 统计数据类型
// ============================================================
interface OverviewStats {
  assets: { total: number; ai_analyzed: number; fact_extracted: number; pending_ai: number; failed_ai: number; rss_imported: number };
  rssItems: number;
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
interface OutputDef {
  key: string;
  meta: ProductMetaDef;
  statKey?: keyof OverviewStats | ((s: OverviewStats) => number | null);
  /** 主要数据来源步骤 */
  sourceStep: 'step2' | 'step3' | 'step4' | 'step5' | 'step5a' | 'step5b' | 'step6';
  /** 预计算 vs 查询时计算 */
  mode: 'precomputed' | 'query-time';
  /** v7.4: 是否支持「深度模式」—— 勾选 Step 2/3/5/topics 深度开关时走专家 CDT 路径 */
  supportsDeep?: boolean;
  /** v7.4: 深度模式下的增量产出说明 (弹窗展示) */
  deepNote?: string;
}

const OUTPUTS: OutputDef[] = [
  // 选题阶段
  { key: 'topics',    meta: PRODUCT_META.topics,    statKey: (s) => null,   sourceStep: 'step5a', mode: 'query-time',
    supportsDeep: true, deepNote: 'Step topics 深度模式 → 专家 CDT 生成角度矩阵 (mode=\'deep\' 缓存)；v7.5: 7 场景分类 (🔥 争议 / 📈 新变化 / ⚠️ 被忽视的风险 / 🪞 反常识 / 🧩 认知拼图 / 🧭 决策转折 / 🎭 人物切片) + 角度卡 + why 三问 (why_now / why_you / why_it_works) + 目的倒推 (自动从历史任务推断，UI 可覆盖)' },
  { key: 'trends',    meta: PRODUCT_META.trends,                            sourceStep: 'step3',  mode: 'query-time' },
  { key: 'angles',    meta: PRODUCT_META.angles,                            sourceStep: 'step5a', mode: 'query-time',
    supportsDeep: true, deepNote: '随 topics 深度模式一起产出' },
  { key: 'gaps',      meta: PRODUCT_META.gaps,                              sourceStep: 'step3',  mode: 'query-time' },
  // 研究阶段
  { key: 'facts',     meta: PRODUCT_META.facts,     statKey: 'facts',       sourceStep: 'step3',  mode: 'precomputed',
    supportsDeep: true, deepNote: 'Step 3 深度模式 → content_facts.context.expert_review 写入专家审定记录' },
  { key: 'entities',  meta: PRODUCT_META.entities,  statKey: 'entities',    sourceStep: 'step3',  mode: 'precomputed' },
  { key: 'delta',     meta: PRODUCT_META.delta,                             sourceStep: 'step3',  mode: 'query-time' },
  { key: 'freshness', meta: PRODUCT_META.freshness,                         sourceStep: 'step3',  mode: 'query-time' },
  { key: 'cards',     meta: PRODUCT_META.cards,                             sourceStep: 'step3',  mode: 'query-time' },
  // 写作阶段
  { key: 'synthesis',  meta: PRODUCT_META.synthesis,  statKey: 'synthesisCached', sourceStep: 'step5b', mode: 'precomputed',
    supportsDeep: true, deepNote: 'Step 5 深度模式 → content_synthesis_cache.scope_type=\'entity_deep\' (专家 CDT 替代泛型)' },
  { key: 'materials',  meta: PRODUCT_META.materials,                              sourceStep: 'step2',  mode: 'query-time' },
  { key: 'consensus',  meta: PRODUCT_META.consensus,                              sourceStep: 'step3',  mode: 'query-time',
    supportsDeep: true, deepNote: 'Step 2 深度模式 → asset_deep_analysis.expert_consensus (专家补充判断)' },
  // 审核阶段
  { key: 'contradictions', meta: PRODUCT_META.contradictions, statKey: 'contradictions', sourceStep: 'step4', mode: 'precomputed',
    supportsDeep: true, deepNote: 'v7.5 三层召回: L1 SQL 字面对冲 + L2 embedding 语义对冲 (cosine ≥ 0.75, Jaccard < 0.6) + L3 LLM 张力分类 (立场/叙事归因/利益/时序/定义漂移 5 类) → TensionCandidate 扩展 Contradiction (+tensionType +divergenceAxis +parties +timeSlice +recallLayer)。v7.4 深度分析: ControversyDeepAnalyzer 读新字段做 stakeholders / steelmanA-B / realWorldImpact' },
  { key: 'beliefs',        meta: PRODUCT_META.beliefs,        statKey: 'beliefs',        sourceStep: 'step4', mode: 'precomputed',
    supportsDeep: true, deepNote: 'Step 4 输出 8 种 BeliefPattern + Step 2 深度模式产出 belief_evolution' },
  { key: 'crossDomain',    meta: PRODUCT_META.crossDomain,                               sourceStep: 'step4', mode: 'query-time' },
];

/** 步骤 → 产出物映射 (用于流程图连线标注) */
const STEP_OUTPUTS: Record<string, string[]> = {
  // v7.4: Step 2 深度模式开启时会一次性生成 15 个 deliverable 写入 asset_deep_analysis，
  // 所以 Step 2 的产出远不止 materials —— 把深度下的 11 个（⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮）都挂上。
  step2:  ['materials', 'facts', 'entities', 'delta', 'freshness', 'cards', 'synthesis', 'consensus', 'contradictions', 'beliefs', 'crossDomain'],
  step3:  ['facts', 'entities', 'trends', 'gaps', 'delta', 'freshness', 'cards', 'consensus'],
  step4:  ['contradictions', 'beliefs', 'crossDomain'],
  step5a: ['topics', 'angles'],
  step5b: ['synthesis'],
  step6:  ['wiki'],
};

const PHASES = [
  { key: '选题', label: '选题阶段', cssClass: 'phase-selection' },
  { key: '研究', label: '研究阶段', cssClass: 'phase-research' },
  { key: '写作', label: '写作阶段', cssClass: 'phase-writing' },
  { key: '审核', label: '审核阶段', cssClass: 'phase-review' },
] as const;

/** 每个步骤的颜色 (与步骤节点 step-number 背景色一致) */
const STEP_COLORS: Record<string, string> = {
  step2:  'hsl(220, 50%, 55%)',
  step3:  'hsl(220, 50%, 55%)',
  step4:  'hsl(140, 45%, 40%)',
  step5a: 'hsl(30, 50%, 50%)',
  step5b: 'hsl(30, 50%, 50%)',
  step6:  'hsl(270, 40%, 50%)',
};

// ============================================================
// 应用场景定义 (第 4 列)
// ============================================================
interface AppDef {
  key: string;
  label: string;
  icon: string;
  description: string;
  /** 相对路径 (对应系统内已有页面) */
  href: string;
  /** 消费的产出物 key 列表 (连线目标) */
  consumes: string[];
  /** 连线颜色 */
  color: string;
}

const APPLICATIONS: AppDef[] = [
  {
    key: 'expert-chat', label: '专家对话', icon: '👥',
    description: 'AI Agent 检索专家观点 + 实体关系',
    href: '/expert-chat',
    consumes: ['entities', 'cards', 'synthesis', 'consensus'],
    color: 'hsl(260, 50%, 55%)',
  },
  {
    key: 'expert-panorama', label: '专家体系全景', icon: '🧠',
    description: 'CDT 专家库 · 4 基础策略 + 9 装饰器 + 3 预设',
    href: '/expert-library/panorama',
    consumes: ['synthesis', 'consensus', 'contradictions', 'beliefs'],
    color: 'hsl(280, 50%, 55%)',
  },
  {
    key: 'deep-analysis', label: '深度分析详情', icon: '🧬',
    description: '单资产 15 产出物 + 专家调用痕迹',
    href: '/assets',
    consumes: ['facts', 'entities', 'cards', 'synthesis', 'consensus', 'contradictions', 'beliefs', 'crossDomain'],
    color: 'hsl(320, 50%, 55%)',
  },
  {
    key: 'enterprise-report', label: '企业研报', icon: '📊',
    description: '自动生成研究报告草稿',
    href: '/tasks',
    consumes: ['facts', 'delta', 'cards', 'synthesis', 'materials'],
    color: 'hsl(200, 55%, 50%)',
  },
  {
    key: 'ppt-minutes', label: 'PPT/会议纪要/内部汇报', icon: '📑',
    description: '会议要点 + 观点对比 + 内部汇报材料',
    href: '/tasks',
    consumes: ['cards', 'synthesis', 'consensus'],
    color: 'hsl(180, 45%, 45%)',
  },
  {
    key: 'knowledge-base', label: '知识库/客服', icon: '🤖',
    description: 'RAG 检索问答, 客户服务知识检索',
    href: '/content-library',
    consumes: ['facts', 'entities', 'cards', 'wiki'],
    color: 'hsl(160, 50%, 40%)',
  },
  {
    key: 'topic-decision', label: '选题决策', icon: '🎯',
    description: '编辑部选题会参考 · 支持深度模式角度生成',
    href: '/hot-topics',
    consumes: ['topics', 'trends', 'angles', 'gaps', 'delta'],
    color: 'hsl(40, 60%, 50%)',
  },
  {
    key: 'risk-audit', label: '风控审核/舆情监控', icon: '🛡️',
    description: '发布前风险检查 + 情感倾向监测',
    href: '/sentiment',
    consumes: ['freshness', 'contradictions', 'beliefs', 'crossDomain'],
    color: 'hsl(0, 55%, 55%)',
  },
];

/** 步骤分组定义 (按步骤视图用) */
const STEP_GROUPS = [
  { stepKey: 'step2',  label: 'Step 2: AI 分析',   color: STEP_COLORS.step2 },
  { stepKey: 'step3',  label: 'Step 3: 事实提取',  color: STEP_COLORS.step3 },
  { stepKey: 'step4',  label: 'Step 4: 图谱重算',  color: STEP_COLORS.step4 },
  { stepKey: 'step5a', label: 'Step 5a: 议题叙事', color: STEP_COLORS.step5a },
  { stepKey: 'step5b', label: 'Step 5b: 认知综合', color: STEP_COLORS.step5b },
];

type GroupMode = 'phase' | 'step';

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
  const [zepStatus, setZepStatus] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [modalNode, setModalNode] = useState<{ type: 'output' | 'step' | 'source'; key: string } | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>('phase');
  const navigate = useNavigate();

  // SVG 连线
  const flowRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const outputRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const appRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; color: string; key: string }>>([]);

  const computeLines = useCallback(() => {
    const container = flowRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newLines: typeof lines = [];
    // 步骤 → 产出物 连线 (第 2 列 → 第 3 列)
    for (const [stepKey, outputKeys] of Object.entries(STEP_OUTPUTS)) {
      const stepEl = stepRefs.current[stepKey];
      if (!stepEl) continue;
      const sRect = stepEl.getBoundingClientRect();
      const sx = sRect.right - rect.left;
      const sy = sRect.top + sRect.height / 2 - rect.top;
      const color = STEP_COLORS[stepKey] || '#999';
      for (const ok of outputKeys) {
        const outEl = outputRefs.current[ok];
        if (!outEl) continue;
        const oRect = outEl.getBoundingClientRect();
        const ox = oRect.left - rect.left;
        const oy = oRect.top + oRect.height / 2 - rect.top;
        newLines.push({ x1: sx, y1: sy, x2: ox, y2: oy, color, key: `${stepKey}-${ok}` });
      }
    }
    // 产出物 → 应用场景 连线 (第 3 列 → 第 4 列)
    for (const app of APPLICATIONS) {
      const appEl = appRefs.current[app.key];
      if (!appEl) continue;
      const aRect = appEl.getBoundingClientRect();
      const ax = aRect.left - rect.left;
      const ay = aRect.top + aRect.height / 2 - rect.top;
      for (const outKey of app.consumes) {
        const outEl = outputRefs.current[outKey];
        if (!outEl) continue;
        const oRect = outEl.getBoundingClientRect();
        const ox = oRect.right - rect.left;
        const oy = oRect.top + oRect.height / 2 - rect.top;
        newLines.push({ x1: ox, y1: oy, x2: ax, y2: ay, color: app.color, key: `${outKey}-${app.key}` });
      }
    }
    setLines(newLines);
  }, []);

  useEffect(() => {
    fetch(`${API}/stats/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Zep 状态检查 (异步, 不阻塞)
    fetch(`${API}/zep/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setZepStatus(d); })
      .catch(() => {});
  }, []);

  // 重算连线 (加载完成 / 切换模式后)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(computeLines, 100);
    const onResize = () => computeLines();
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [loading, groupMode, computeLines]);

  const outputsByPhase = (phase: string) => OUTPUTS.filter(o => o.meta.phase === phase);
  const outputsByStep = (stepKey: string) => OUTPUTS.filter(o => o.sourceStep === stepKey);

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
    let deepModeNote: string | undefined;

    if (modalNode.type === 'output') {
      const o = OUTPUTS.find(x => x.key === modalNode.key);
      if (!o) return null;
      const stepLabels: Record<string, string> = {
        step2: 'Step 2: AI 批量分析', step3: 'Step 3: 事实提取',
        step4: 'Step 4: 图谱重算', step5a: 'Step 5a: 议题叙事',
        step5b: 'Step 5b: 认知综合预生成', step6: 'Step 6: Wiki',
      };
      title = `${o.meta.id} ${o.meta.name}`;
      upstream = [
        `数据源步骤: ${stepLabels[o.sourceStep] || o.sourceStep}`,
        `生产模式: ${o.mode === 'precomputed' ? '✅ 预计算 (由步骤直接写入)' : '⚡ 查询时实时计算'}`,
        ...o.meta.upstream,
      ];
      downstream = o.meta.downstream;
      pagePath = o.meta.page;
      deepModeNote = o.deepNote;
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
      const stepDefs: Record<string, { title: string; desc: string; stats: Array<{ value: string; label: string }>; deepDesc?: string }> = {
        step2: {
          title: 'Step 2: AI 批量分析',
          desc: '向量化 + 质量评分 + 主题检测 + 去重',
          deepDesc: '🧬 深度模式 (enableDeepAnalysis): DeepAnalysisOrchestrator 编排 15 个 deliverable + 专家匹配 (ExpertMatcher) + 专家应用策略 (expert-application: 4 基础 + 9 装饰器 + 3 预设) + EMM 门控 → 写入 asset_deep_analysis 表；⑬ 争议单独走 ControversyDeepAnalyzer 产出 stakeholders/steelmanA-B/矛盾分类 5 类',
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
          deepDesc: '🧬 深度模式 (extractDeep): Stage 3 专家审定 — factExtractor.runExpertReview 通过 ExpertMatcher 选 CDT 专家对提取出的事实逐条裁决 (keep / refine / drop / flag)，将 expert_review 写入 content_facts.context',
          stats: stats ? [
            { value: String(stats.facts), label: '事实总数' },
            { value: String(stats.entities), label: '实体总数' },
            { value: String(stats.assets.fact_extracted), label: '已提取素材' },
            { value: String(stats.assets.total - stats.assets.fact_extracted), label: '未提取' },
          ] : [],
        },
        step4: {
          title: 'Step 4: 知识图谱重算',
          desc: 'Louvain 社区发现 + 4 信号边表 (direct/source-overlap/type-affinity/adamic-adar) + BeliefPattern 8 种模式检测 + TrendSignal 质量治理',
          deepDesc: '🧬 v7.5 三层召回 (enableDeepRecall=true): ⑬ 争议不再是纯 SQL 字面对冲，而是 L1 SQL + L2 embedding 语义对冲 (cosine ≥ 0.75, Jaccard < 0.6) + L3 LLM 张力分类器 (立场/叙事归因/利益/时序/定义漂移 5 类) → TensionCandidate。L2 无 pgvector 时自动降级，L3 失败 → tensionType=\'unknown\' 不阻塞下游。',
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
        step5a: {
          title: 'Step 5a: 议题叙事预生成',
          desc: 'Top 议题 → 标题/导语/角度矩阵，缓存至 content_topic_enrichments',
          deepDesc: '🧬 v7.4 深度模式 (topicsDeep): 专家 CDT 替代 LLMEnricher 泛型 prompt — 走 expert-application \'①topic-enrich\' deliverable (默认策略: knowledge_grounded | failure_check | signature_style | single)，缓存 mode=\'deep\' 与 generic 并存不冲突。\n\n🎯 v7.5 场景化 (enableSceneClassification=true): 7 类场景 (🔥 争议 / 📈 新变化 / ⚠️ 被忽视的风险 / 🪞 反常识 / 🧩 认知拼图 / 🧭 决策转折 / 🎭 人物切片) — 规则优先 + LLM 兜底。每条议题附角度卡 (hook / who_cares / promise) + why 三问 (why_now / why_you / why_it_works) + purpose 目的倒推 (自动从 userId 的历史任务聚类推断，也接收请求体 purpose 字段覆盖)。',
          stats: [],
        },
        step5b: {
          title: 'Step 5b: 认知综合预生成',
          desc: '按实体逐一调 LLM 提炼洞察并写缓存 (content_synthesis_cache, scope_type=\'entity\')',
          deepDesc: '🧬 深度模式 (synthesisDeep): synthesizeInsightsDeep 调 ExpertMatcher 选专家 → ExpertEngine.invoke (expert-application 策略) → 写入独立命名空间 (cache_key=\'entity:{name}:deep\', scope_type=\'entity_deep\')，专家失败时 fallback 到泛型',
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
      deepModeNote = sd.deepDesc;
      // 上游: 从 PRODUCT_META 汇总
      const stepUpstreamMap: Record<string, string[]> = {
        step2: ['Assets 素材 (文件上传/目录绑定/RSS 导入)', '可选: retryFailed 重试失败素材'],
        step3: ['Assets 素材正文 (content 字段)', 'Step 2 的 ai_quality_score / ai_theme_id (可选过滤)'],
        step4: ['⑤ content_facts (is_current=true)', '⑥ content_entities', 'content_facts 共现关系'],
        step5a: ['⑤ content_entities + content_facts', 'LLM 调用 (completeWithSystem)'],
        step5b: ['⑤ 高置信度事实 (confidence > 0.5)', 'LLM 综合提炼 (completeWithSystem)'],
        step6: ['全部 content_entities + content_facts', 'asset_library L0 摘要', '.obsidian 配置'],
      };
      upstream = stepUpstreamMap[modalNode.key] || ['参见流程图上游连线'];
      // 下游: 从 STEP_OUTPUTS 自动生成
      const stepOutputKeys = STEP_OUTPUTS[modalNode.key] || [];
      downstream = stepOutputKeys.map(k => {
        const o = OUTPUTS.find(x => x.key === k);
        return o ? `${o.meta.id} ${o.meta.name} (${o.mode === 'precomputed' ? '预计算' : '查询时'})` : k;
      });
      if (downstream.length === 0) downstream = ['无直接产出物'];
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
          : [
              { value: String(stats.rssItems), label: 'RSS 条目' },
              { value: String(stats.assets.rss_imported), label: '已导入素材' },
            ];
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

            <div className="pipeline-modal-section section-upstream">
              <h4>⬆️ 上游来源</h4>
              <ul>{upstream.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="pipeline-modal-section section-downstream">
              <h4>⬇️ {modalNode.type === 'step' ? '产出物' : '下游引用'}</h4>
              <ul>{downstream.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>

            {deepModeNote && (
              <div className="pipeline-modal-section section-deep">
                <h4>🧬 深度模式 (v7.4)</h4>
                <p>{deepModeNote}</p>
              </div>
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
  // 产出物节点渲染 (共用)
  // ============================================================
  const renderOutputNode = (o: OutputDef) => {
    const c = getCount(o, stats);
    const stepNum = o.sourceStep.replace('step', '');
    const stepColor = STEP_COLORS[o.sourceStep] || '#999';
    const titleParts = [`来源: Step ${stepNum}`, o.mode === 'precomputed' ? '预计算' : '查询时计算'];
    if (o.supportsDeep) titleParts.push('🧬 支持深度模式 (专家 CDT)');
    return (
      <div
        key={o.key}
        ref={el => { outputRefs.current[o.key] = el; }}
        className={`output-node ${o.mode === 'precomputed' ? 'output-precomputed' : 'output-querytime'} ${o.supportsDeep ? 'output-deep-capable' : ''}`}
        onClick={() => setModalNode({ type: 'output', key: o.key })}
        title={titleParts.join(' · ')}
        style={{ borderLeftColor: stepColor, borderLeftWidth: 3 }}
      >
        <span className="output-id">{o.meta.id}</span>
        <span className="output-name">{o.meta.name}</span>
        <span className="output-step-tag" style={{ color: stepColor, background: `color-mix(in srgb, ${stepColor} 12%, white)` }}>S{stepNum}</span>
        {c !== null && <span className="output-count">{c}</span>}
        {o.mode === 'precomputed' && <span className="output-mode-badge precomputed-badge">预</span>}
        {o.mode === 'query-time' && <span className="output-mode-badge querytime-badge">⚡</span>}
        {o.supportsDeep && <span className="output-mode-badge deep-badge" title="支持深度模式">🧬</span>}
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

      {/* 分组切换 + 图例 */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button onClick={() => setGroupMode('phase')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${groupMode === 'phase' ? 'bg-white dark:bg-gray-700 shadow text-indigo-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700'}`}>
            按阶段
          </button>
          <button onClick={() => setGroupMode('step')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${groupMode === 'step' ? 'bg-white dark:bg-gray-700 shadow text-indigo-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700'}`}>
            按步骤
          </button>
        </div>
        <div className="flex gap-3 text-[10px] text-gray-400 flex-wrap">
          <span>步骤连线:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: STEP_COLORS.step3 }} /> S3</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: STEP_COLORS.step4 }} /> S4</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: STEP_COLORS.step5a }} /> S5</span>
          <span className="ml-2">应用连线:</span>
          {APPLICATIONS.map(a => (
            <span key={a.key} className="flex items-center gap-1" title={a.label}>
              <span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: a.color }} />
              {a.icon}
            </span>
          ))}
        </div>
      </div>

      {/* 流程图 */}
      <div className="pipeline-flow" ref={flowRef}>
        {/* SVG 连线层 */}
        {lines.length > 0 && (
          <svg className="pipeline-svg-overlay">
            {lines.map(l => {
              const dx = l.x2 - l.x1;
              const cp = dx * 0.4;
              return (
                <path
                  key={l.key}
                  d={`M ${l.x1} ${l.y1} C ${l.x1 + cp} ${l.y1}, ${l.x2 - cp} ${l.y2}, ${l.x2} ${l.y2}`}
                  stroke={l.color}
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  fill="none"
                  opacity="0.55"
                />
              );
            })}
          </svg>
        )}

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
                  <span className="source-count">{stats?.rssItems ?? '-'} 条</span>
                </div>
                <div className="source-node" onClick={() => navigate('/meeting-note-sources')}>
                  <span className="source-icon">🎙️</span>
                  <span className="source-label">会议纪要</span>
                  <span className="source-count">lark / zoom / upload</span>
                </div>
                <div className="flow-arrow">→</div>
              </div>
            </div>

            {/* 列 2: 加工步骤 (带 ref) */}
            <div>
              <div className="pipeline-col-label">加工步骤</div>
              <div className="pipeline-steps">
                <div className="step-node parallel-hint" ref={el => { stepRefs.current['step2'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step2' })}>
                  <div className="step-header">
                    <span className="step-number">2</span>
                    <span className="step-label">AI 批量分析</span>
                    <span className="step-deep-badge" title="支持深度模式 (enableDeepAnalysis)">🧬</span>
                  </div>
                  <div className="step-desc">向量化 + 质量评分 + 主题 + 去重 <br/><span className="step-desc-deep">🧬 深度: 15 deliverable + 专家 CDT + EMM 门控</span></div>
                  {stats && <div className="step-stat">{stats.assets.ai_analyzed}/{stats.assets.total} 已分析</div>}
                </div>
                <div className="step-node parallel-hint" ref={el => { stepRefs.current['step3'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step3' })}>
                  <div className="step-header">
                    <span className="step-number">3</span>
                    <span className="step-label">两段式事实提取</span>
                    <span className="step-deep-badge" title="支持深度模式 (extractDeep)">🧬</span>
                  </div>
                  <div className="step-desc">analyze → extract → delta → resolve <br/><span className="step-desc-deep">🧬 深度: +Stage 3 CDT 专家审定事实</span></div>
                  {stats && <div className="step-stat">{stats.facts} 事实 · {stats.entities} 实体</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" ref={el => { stepRefs.current['step4'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step4' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(140, 45%, 40%)' }}>4</span>
                    <span className="step-label">知识图谱重算</span>
                  </div>
                  <div className="step-desc">Louvain 社区 + 4 信号边表 + BeliefPattern(8) + 趋势信号治理</div>
                  {stats && <div className="step-stat">{stats.communities} 社区 · {stats.relations} 边 · {stats.beliefs} 观点</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" ref={el => { stepRefs.current['step5a'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step5a' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(30, 50%, 50%)' }}>5a</span>
                    <span className="step-label">议题叙事预生成</span>
                    <span className="step-deep-badge" title="支持深度模式 (topicsDeep)">🧬</span>
                  </div>
                  <div className="step-desc">Top 议题 → 标题/导语/角度矩阵 <br/><span className="step-desc-deep">🧬 深度: 专家 CDT 角度生成 · mode='deep' 缓存</span></div>
                </div>
                <div className="step-node" ref={el => { stepRefs.current['step5b'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step5b' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(30, 50%, 50%)' }}>5b</span>
                    <span className="step-label">认知综合预生成</span>
                    <span className="step-deep-badge" title="支持深度模式 (synthesisDeep)">🧬</span>
                  </div>
                  <div className="step-desc">按实体 LLM 提炼洞察 → 缓存 <br/><span className="step-desc-deep">🧬 深度: 专家 CDT 替代泛型 · entity_deep 命名空间</span></div>
                  {stats && <div className="step-stat">{stats.synthesisCached} 条综合缓存</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" ref={el => { stepRefs.current['step6'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step6' })}>
                  <div className="step-header">
                    <span className="step-number" style={{ background: 'hsl(270, 40%, 50%)' }}>6</span>
                    <span className="step-label">Wiki 物化</span>
                  </div>
                  <div className="step-desc">Obsidian 兼容 Markdown vault</div>
                </div>
              </div>
            </div>

            {/* 列 3: 产出物 */}
            <div>
              <div className="pipeline-col-label">15 个产出物</div>
              <div className="pipeline-outputs">
                {/* 按阶段分组 */}
                {groupMode === 'phase' && PHASES.map(phase => {
                  const items = outputsByPhase(phase.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={phase.key} className={`phase-group ${phase.cssClass}`}>
                      <div className="phase-label">{phase.label}</div>
                      <div className="phase-items">
                        {items.map(o => renderOutputNode(o))}
                      </div>
                    </div>
                  );
                })}

                {/* 按步骤分组 */}
                {groupMode === 'step' && STEP_GROUPS.map(sg => {
                  const items = outputsByStep(sg.stepKey);
                  if (items.length === 0) return null;
                  return (
                    <div key={sg.stepKey} className="phase-group" style={{ borderColor: sg.color, background: `color-mix(in srgb, ${sg.color} 6%, white)` }}>
                      <div className="phase-label" style={{ color: sg.color }}>{sg.label} ({items.length} 个产出物)</div>
                      <div className="phase-items">
                        {items.map(o => renderOutputNode(o))}
                      </div>
                    </div>
                  );
                })}

                {/* Wiki (始终显示) */}
                <div className="phase-group" style={{ borderColor: 'hsl(270, 30%, 75%)', background: 'hsl(270, 20%, 98%)' }}>
                  <div className="phase-label" style={{ color: 'hsl(270, 40%, 40%)' }}>物化输出</div>
                  <div className="phase-items">
                    <div className="output-node" ref={el => { outputRefs.current['wiki'] = el; }} onClick={() => setModalNode({ type: 'output', key: 'wiki' })}>
                      <span className="output-id">📖</span>
                      <span className="output-name">{PRODUCT_META.wiki.name}</span>
                      <span className="output-step-tag">S6</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 列 4: 应用场景 */}
            <div>
              <div className="pipeline-col-label">应用场景</div>
              <div className="pipeline-apps">
                {APPLICATIONS.map(app => (
                  <div
                    key={app.key}
                    ref={el => { appRefs.current[app.key] = el; }}
                    className="app-node"
                    style={{ borderLeftColor: app.color, borderLeftWidth: 3 }}
                    onClick={() => navigate(app.href)}
                    title={`${app.description} → ${app.href}`}
                  >
                    <div className="app-header">
                      <span className="app-icon">{app.icon}</span>
                      <span className="app-label">{app.label}</span>
                    </div>
                    <div className="app-desc">{app.description}</div>
                    <div className="app-link">{app.href} →</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部全局统计 */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { v: stats.assets.total, l: '总素材', icon: '📁' },
            { v: stats.facts, l: '事实三元组', icon: '📋' },
            { v: stats.entities, l: '实体', icon: '���' },
            { v: stats.relations, l: '关系边', icon: '🌐' },
          ].map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{s.icon} {s.v}</div>
              <div className="text-xs text-gray-500 mt-1">{s.l}</div>
            </div>
          ))}
          {/* Zep 增强状态 */}
          <div className={`border rounded-lg p-4 text-center ${
            zepStatus?.connected
              ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}>
            <div className={`text-2xl font-bold ${zepStatus?.connected ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`}>
              {zepStatus?.connected ? '🟢' : zepStatus?.enabled ? '🟡' : '⚪'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Zep {zepStatus?.connected ? '已连接' : zepStatus?.enabled ? '未连接' : '未启用'}
            </div>
          </div>
        </div>
      )}

      {/* 弹窗 */}
      {renderModal()}
    </div>
  );
}
