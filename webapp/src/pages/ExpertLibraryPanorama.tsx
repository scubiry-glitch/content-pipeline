// 专家体系全景图 — 数据源 → 加工步骤 → 产出物 → 应用场景
// 镜像 ContentLibraryPipeline 设计，面向专家体系 5 表 + 40+ 端点
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXPERT_PRODUCT_META, type ExpertProductMetaDef } from '../components/ExpertProductMeta';
import './ExpertLibraryPanorama.css';

const API = '/api/v1/expert-library';

// ============================================================
// 统计数据类型 (对应后端 getExpertOverviewStats)
// ============================================================
interface ExpertOverviewStats {
  experts: {
    total: number;
    active: number;
    builtin: number;
    generated: number;
    byLevel: Record<string, number>;
  };
  knowledgeSources: number;
  mentalModels: number;
  invocations: {
    total: number;
    analysis: number;
    evaluation: number;
    generation: number;
    debate: number;
    hotTopic: number;
    assetAnnotation: number;
  };
  feedback: { total: number; avgScore: number | null };
  scheduling: { activeAssignments: number; completedAssignments: number };
}

// ============================================================
// 节点定义
// ============================================================
interface OutputDef {
  key: string;
  meta: ExpertProductMetaDef;
  sourceStep: 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6';
  mode: 'precomputed' | 'query-time';
  statValue?: (s: ExpertOverviewStats) => number | null;
}

const OUTPUTS: OutputDef[] = [
  // 档案阶段
  { key: 'profile',      meta: EXPERT_PRODUCT_META.profile,      sourceStep: 'step1', mode: 'precomputed', statValue: s => s.experts.active },
  { key: 'knowledge',    meta: EXPERT_PRODUCT_META.knowledge,    sourceStep: 'step2', mode: 'precomputed', statValue: s => s.knowledgeSources },
  { key: 'mentalModels', meta: EXPERT_PRODUCT_META.mentalModels, sourceStep: 'step3', mode: 'precomputed', statValue: s => s.mentalModels },
  { key: 'heuristics',   meta: EXPERT_PRODUCT_META.heuristics,   sourceStep: 'step1', mode: 'precomputed' },
  // 匹配阶段
  { key: 'match',        meta: EXPERT_PRODUCT_META.match,        sourceStep: 'step4', mode: 'query-time' },
  { key: 'workload',     meta: EXPERT_PRODUCT_META.workload,     sourceStep: 'step4', mode: 'query-time', statValue: s => s.scheduling.activeAssignments },
  { key: 'availability', meta: EXPERT_PRODUCT_META.availability, sourceStep: 'step4', mode: 'query-time' },
  // 产出阶段
  { key: 'analysis',     meta: EXPERT_PRODUCT_META.analysis,     sourceStep: 'step5', mode: 'query-time', statValue: s => s.invocations.analysis },
  { key: 'evaluation',   meta: EXPERT_PRODUCT_META.evaluation,   sourceStep: 'step5', mode: 'query-time', statValue: s => s.invocations.evaluation },
  { key: 'generation',   meta: EXPERT_PRODUCT_META.generation,   sourceStep: 'step5', mode: 'query-time', statValue: s => s.invocations.generation },
  { key: 'outlineReview',meta: EXPERT_PRODUCT_META.outlineReview,sourceStep: 'step5', mode: 'query-time' },
  // 协作阶段
  { key: 'debate',          meta: EXPERT_PRODUCT_META.debate,          sourceStep: 'step5', mode: 'precomputed', statValue: s => s.invocations.debate },
  { key: 'hotTopic',        meta: EXPERT_PRODUCT_META.hotTopic,        sourceStep: 'step5', mode: 'precomputed', statValue: s => s.invocations.hotTopic },
  { key: 'assetAnnotation', meta: EXPERT_PRODUCT_META.assetAnnotation, sourceStep: 'step5', mode: 'precomputed', statValue: s => s.invocations.assetAnnotation },
  // 沉淀阶段
  { key: 'feedback', meta: EXPERT_PRODUCT_META.feedback, sourceStep: 'step6', mode: 'precomputed', statValue: s => s.feedback.total },
];

const STEP_OUTPUTS: Record<string, string[]> = {
  step1: ['profile', 'heuristics'],
  step2: ['knowledge'],
  step3: ['mentalModels'],
  step4: ['match', 'workload', 'availability'],
  step5: ['analysis', 'evaluation', 'generation', 'outlineReview', 'debate', 'hotTopic', 'assetAnnotation'],
  step6: ['feedback'],
};

const PHASES = [
  { key: '档案', label: '档案阶段', cssClass: 'phase-profile' },
  { key: '匹配', label: '匹配阶段', cssClass: 'phase-match' },
  { key: '产出', label: '产出阶段', cssClass: 'phase-output' },
  { key: '协作', label: '协作阶段', cssClass: 'phase-collab' },
  { key: '沉淀', label: '沉淀阶段', cssClass: 'phase-feedback' },
] as const;

const STEP_COLORS: Record<string, string> = {
  step1: 'hsl(220, 50%, 55%)',
  step2: 'hsl(220, 50%, 55%)',
  step3: 'hsl(180, 45%, 45%)',
  step4: 'hsl(140, 45%, 40%)',
  step5: 'hsl(30, 50%, 50%)',
  step6: 'hsl(270, 40%, 50%)',
};

// ============================================================
// 应用场景
// ============================================================
interface AppDef {
  key: string; label: string; icon: string; description: string;
  href: string; consumes: string[]; color: string;
}

const APPLICATIONS: AppDef[] = [
  {
    key: 'expert-chat', label: '专家对话', icon: '💬',
    description: '1v1 多轮对话 · 激活心智模型 + 检索知识',
    href: '/expert-chat',
    consumes: ['profile', 'knowledge', 'mentalModels', 'analysis', 'generation'],
    color: 'hsl(260, 50%, 55%)',
  },
  {
    key: 'debate', label: '多专家辩论', icon: '⚔️',
    description: '3 轮辩论产出共识与分歧',
    href: '/expert-debate',
    consumes: ['profile', 'mentalModels', 'match', 'debate'],
    color: 'hsl(0, 55%, 55%)',
  },
  {
    key: 'task-review', label: '任务蓝军评审', icon: '🛡️',
    description: '大纲评审 + 草稿评估 + rubric 打分',
    href: '/tasks',
    consumes: ['profile', 'evaluation', 'outlineReview'],
    color: 'hsl(200, 55%, 50%)',
  },
  {
    key: 'scheduling', label: '任务调度', icon: '🎯',
    description: '匹配 → 分配 → 负载均衡',
    href: '/expert-scheduling',
    consumes: ['match', 'workload', 'availability'],
    color: 'hsl(140, 50%, 40%)',
  },
  {
    key: 'mental-models', label: '心智模型', icon: '🧠',
    description: '共享模型检索 · 领域分布',
    href: '/mental-models',
    consumes: ['mentalModels', 'heuristics'],
    color: 'hsl(40, 60%, 50%)',
  },
  {
    key: 'asset-credibility', label: '素材可信度 / 热点观点', icon: '🗂️',
    description: '素材标注 + 热点话题专家解读',
    href: '/hot-topics',
    consumes: ['hotTopic', 'assetAnnotation'],
    color: 'hsl(160, 50%, 40%)',
  },
];

const STEP_GROUPS = [
  { stepKey: 'step1', label: 'Step 1: 档案规范化',   color: STEP_COLORS.step1 },
  { stepKey: 'step2', label: 'Step 2: 知识向量化',   color: STEP_COLORS.step2 },
  { stepKey: 'step3', label: 'Step 3: 心智模型构建', color: STEP_COLORS.step3 },
  { stepKey: 'step4', label: 'Step 4: 匹配与调度',   color: STEP_COLORS.step4 },
  { stepKey: 'step5', label: 'Step 5: 调用执行',     color: STEP_COLORS.step5 },
  { stepKey: 'step6', label: 'Step 6: 反馈校准',     color: STEP_COLORS.step6 },
];

type GroupMode = 'phase' | 'step';

// ============================================================
// 主组件
// ============================================================
export function ExpertLibraryPanorama() {
  const [stats, setStats] = useState<ExpertOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalNode, setModalNode] = useState<{ type: 'output' | 'step' | 'source'; key: string } | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>('phase');
  const navigate = useNavigate();

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
  }, []);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(computeLines, 100);
    const onResize = () => computeLines();
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [loading, groupMode, computeLines]);

  const outputsByPhase = (phase: string) => OUTPUTS.filter(o => o.meta.phase === phase);
  const outputsByStep = (stepKey: string) => OUTPUTS.filter(o => o.sourceStep === stepKey);

  const getCount = (o: OutputDef): number | null => {
    if (!stats || !o.statValue) return null;
    return o.statValue(stats);
  };

  // ============================================================
  // 弹窗
  // ============================================================
  const renderModal = () => {
    if (!modalNode) return null;
    let title = '';
    let statCards: Array<{ value: string; label: string }> = [];
    let upstream: string[] = [];
    let downstream: string[] = [];
    let pagePath: string | undefined;

    if (modalNode.type === 'output') {
      const o = OUTPUTS.find(x => x.key === modalNode.key);
      if (!o) return null;
      const stepLabels: Record<string, string> = {
        step1: 'Step 1: 档案规范化',
        step2: 'Step 2: 知识向量化',
        step3: 'Step 3: 心智模型构建',
        step4: 'Step 4: 匹配与调度',
        step5: 'Step 5: 调用执行',
        step6: 'Step 6: 反馈校准',
      };
      title = `${o.meta.id} ${o.meta.name}`;
      upstream = [
        `数据源步骤: ${stepLabels[o.sourceStep] || o.sourceStep}`,
        `生产模式: ${o.mode === 'precomputed' ? '✅ 预计算 (DB 缓存)' : '⚡ 查询时实时计算'}`,
        ...o.meta.upstream,
      ];
      downstream = o.meta.downstream;
      pagePath = o.meta.page;
      const c = getCount(o);
      if (c !== null) statCards.push({ value: String(c), label: '当前数量' });
    } else if (modalNode.type === 'step') {
      const stepDefs: Record<string, { title: string; desc: string; stats: Array<{ value: string; label: string }> }> = {
        step1: {
          title: 'Step 1: 档案规范化',
          desc: 'Seed + 研究生成 → persona/method/EMM/constraints 标准化写入 expert_profiles',
          stats: stats ? [
            { value: String(stats.experts.active), label: '活跃专家' },
            { value: String(stats.experts.builtin), label: '内置' },
            { value: String(stats.experts.generated), label: '研究生成' },
          ] : [],
        },
        step2: {
          title: 'Step 2: 知识向量化',
          desc: 'knowledgeService: 上传 → LLM 抽取 key_insights → pgvector embedding',
          stats: stats ? [{ value: String(stats.knowledgeSources), label: '知识源' }] : [],
        },
        step3: {
          title: 'Step 3: 心智模型构建',
          desc: 'mentalModelGraph 聚合所有专家 cognition.mentalModels (5min TTL 缓存)',
          stats: stats ? [{ value: String(stats.mentalModels), label: '心智模型' }] : [],
        },
        step4: {
          title: 'Step 4: 匹配与调度',
          desc: 'ExpertMatcher 评分 + SchedulingService 负载均衡',
          stats: stats ? [
            { value: String(stats.scheduling.activeAssignments), label: '活跃分配' },
            { value: String(stats.scheduling.completedAssignments), label: '已完成' },
          ] : [],
        },
        step5: {
          title: 'Step 5: 调用执行 (EMM 门控)',
          desc: 'Input → Retrieve → Prompt → LLM → EMM Gate → Format',
          stats: stats ? [
            { value: String(stats.invocations.total), label: '总调用' },
            { value: String(stats.invocations.analysis), label: '分析' },
            { value: String(stats.invocations.evaluation), label: '评估' },
            { value: String(stats.invocations.debate), label: '辩论' },
          ] : [],
        },
        step6: {
          title: 'Step 6: 反馈与校准',
          desc: 'FeedbackLoop 收集 human_score → weightCalibration 调整 EMM weight',
          stats: stats ? [
            { value: String(stats.feedback.total), label: '反馈条数' },
            { value: stats.feedback.avgScore ? stats.feedback.avgScore.toFixed(2) : '-', label: '平均评分' },
          ] : [],
        },
      };
      const sd = stepDefs[modalNode.key];
      if (!sd) return null;
      title = sd.title;
      statCards = sd.stats;
      const stepUpstreamMap: Record<string, string[]> = {
        step1: ['17+ seed profile (musk/buffett/feynman...)', 'researchService.researchAndGenerateProfile', '手动编辑'],
        step2: ['用户上传 (PPT/PDF/访谈)', 'LLM 生成 summary/key_insights', 'pgvector embedding'],
        step3: ['全部活跃专家的 persona.cognition.mentalModels', '领域共享模型推断'],
        step4: ['任务上下文 (domain/keywords)', '专家档案 profile.domain', 'expert_task_assignments'],
        step5: ['专家档案 + 知识源 + 心智模型 + heuristics', 'LLM 调用 (completeWithSystem)', 'EMM 门控规则'],
        step6: ['expert_feedback (human_score/rubric_scores)', 'actual_outcome 对比基线'],
      };
      upstream = stepUpstreamMap[modalNode.key] || [];
      const outKeys = STEP_OUTPUTS[modalNode.key] || [];
      downstream = outKeys.map(k => {
        const o = OUTPUTS.find(x => x.key === k);
        return o ? `${o.meta.id} ${o.meta.name} (${o.mode === 'precomputed' ? '预计算' : '查询时'})` : k;
      });
      if (downstream.length === 0) downstream = ['无直接产出物'];
    } else if (modalNode.type === 'source') {
      const sourceDefs: Record<string, { title: string; upstream: string[]; downstream: string[]; stats: Array<{ value: string; label: string }>; path?: string }> = {
        builtin: {
          title: '📁 内置专家库',
          upstream: ['17+ seed files (data/*.ts)', 'topExperts.ts (S 级特级)', 'frontendExperts.ts'],
          downstream: ['Step 1 档案规范化', '所有调用入口'],
          stats: stats ? [
            { value: String(stats.experts.builtin), label: '内置数量' },
            { value: String(stats.experts.active), label: '活跃总数' },
          ] : [],
          path: '/expert-library',
        },
        knowledge: {
          title: '📚 用户知识源',
          upstream: ['上传 PPT/PDF/访谈/会议纪要', 'LLM 自动解析'],
          downstream: ['Step 2 知识向量化', '调用时检索注入'],
          stats: stats ? [{ value: String(stats.knowledgeSources), label: '知识源数' }] : [],
          path: '/expert-knowledge-graph',
        },
        research: {
          title: '🔬 研究生成',
          upstream: ['6-agent research-generate 管线', '公开资料检索'],
          downstream: ['新专家档案写入 expert_profiles'],
          stats: stats ? [{ value: String(stats.experts.generated), label: '生成专家' }] : [],
        },
        feedback: {
          title: '🔁 反馈闭环',
          upstream: ['任务评审打分', '人工 rubric 评分', '实际业务结果对比'],
          downstream: ['Step 6 反馈校准', 'EMM weight 调整'],
          stats: stats ? [
            { value: String(stats.feedback.total), label: '反馈条数' },
            { value: String(stats.invocations.total), label: '调用总数' },
          ] : [],
        },
      };
      const sd = sourceDefs[modalNode.key];
      if (!sd) return null;
      title = sd.title;
      upstream = sd.upstream;
      downstream = sd.downstream;
      statCards = sd.stats;
      pagePath = sd.path;
    }

    return (
      <div className="modal-overlay panorama-modal" onClick={() => setModalNode(null)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{title}</h3>
            <button className="close-btn" onClick={() => setModalNode(null)}>&times;</button>
          </div>
          <div className="modal-body">
            {statCards.length > 0 && (
              <div className="panorama-modal-stats">
                {statCards.map((sc, i) => (
                  <div key={i} className="panorama-stat-card">
                    <div className="panorama-stat-value">{sc.value}</div>
                    <div className="panorama-stat-label">{sc.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="panorama-modal-section section-upstream">
              <h4>⬆️ 上游来源</h4>
              <ul>{upstream.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="panorama-modal-section section-downstream">
              <h4>⬇️ {modalNode.type === 'step' ? '产出物' : '下游引用'}</h4>
              <ul>{downstream.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            {pagePath && (
              <div className="panorama-modal-actions">
                <a href={pagePath} className="action-primary" onClick={e => { e.preventDefault(); setModalNode(null); navigate(pagePath!); }}>
                  查看完整页面 →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOutputNode = (o: OutputDef) => {
    const c = getCount(o);
    const stepNum = o.sourceStep.replace('step', '');
    const stepColor = STEP_COLORS[o.sourceStep] || '#999';
    return (
      <div
        key={o.key}
        ref={el => { outputRefs.current[o.key] = el; }}
        className={`output-node ${o.mode === 'precomputed' ? 'output-precomputed' : 'output-querytime'}`}
        onClick={() => setModalNode({ type: 'output', key: o.key })}
        title={`来源: Step ${stepNum} · ${o.mode === 'precomputed' ? '预计算' : '查询时计算'}`}
        style={{ borderLeftColor: stepColor, borderLeftWidth: 3 }}
      >
        <span className="output-id">{o.meta.id}</span>
        <span className="output-name">{o.meta.name}</span>
        <span className="output-step-tag" style={{ color: stepColor, background: `color-mix(in srgb, ${stepColor} 12%, white)` }}>S{stepNum}</span>
        {c !== null && <span className="output-count">{c}</span>}
        {o.mode === 'precomputed' && <span className="output-mode-badge precomputed-badge">预</span>}
        {o.mode === 'query-time' && <span className="output-mode-badge querytime-badge">⚡</span>}
      </div>
    );
  };

  return (
    <div className="panorama-page">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">专家体系全景图</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          专家档案 → 知识 → 调用 → 反馈的完整加工链路 · 点击节点查看详情
        </p>
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
          <span>应用连线:</span>
          {APPLICATIONS.map(a => (
            <span key={a.key} className="flex items-center gap-1" title={a.label}>
              <span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: a.color }} />
              {a.icon}
            </span>
          ))}
        </div>
      </div>

      {/* 流程图 */}
      <div className="panorama-flow" ref={flowRef}>
        {lines.length > 0 && (
          <svg className="panorama-svg-overlay">
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
          <div className="panorama-flow-inner">
            {/* 列 1: 数据源 */}
            <div>
              <div className="panorama-col-label">数据源</div>
              <div className="panorama-source">
                <div className="source-node" onClick={() => setModalNode({ type: 'source', key: 'builtin' })}>
                  <span className="source-icon">📁</span>
                  <span className="source-label">内置专家</span>
                  <span className="source-count">{stats?.experts.builtin ?? '-'} 位</span>
                </div>
                <div className="source-node" onClick={() => setModalNode({ type: 'source', key: 'knowledge' })}>
                  <span className="source-icon">📚</span>
                  <span className="source-label">知识源</span>
                  <span className="source-count">{stats?.knowledgeSources ?? '-'} 条</span>
                </div>
                <div className="source-node" onClick={() => setModalNode({ type: 'source', key: 'research' })}>
                  <span className="source-icon">🔬</span>
                  <span className="source-label">研究生成</span>
                  <span className="source-count">{stats?.experts.generated ?? 0} 位</span>
                </div>
                <div className="source-node" onClick={() => setModalNode({ type: 'source', key: 'feedback' })}>
                  <span className="source-icon">🔁</span>
                  <span className="source-label">反馈流</span>
                  <span className="source-count">{stats?.feedback.total ?? 0} 条</span>
                </div>
              </div>
            </div>

            {/* 列 2: 加工步骤 */}
            <div>
              <div className="panorama-col-label">加工步骤</div>
              <div className="panorama-steps">
                <div className="step-node parallel-hint" ref={el => { stepRefs.current['step1'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step1' })}>
                  <div className="step-header"><span className="step-number">1</span><span className="step-label">档案规范化</span></div>
                  <div className="step-desc">persona + method + EMM 标准化</div>
                  {stats && <div className="step-stat">{stats.experts.active} 位活跃</div>}
                </div>
                <div className="step-node parallel-hint" ref={el => { stepRefs.current['step2'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step2' })}>
                  <div className="step-header"><span className="step-number">2</span><span className="step-label">知识向量化</span></div>
                  <div className="step-desc">embedding + ILIKE 降级</div>
                  {stats && <div className="step-stat">{stats.knowledgeSources} 源</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" ref={el => { stepRefs.current['step3'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step3' })}>
                  <div className="step-header"><span className="step-number" style={{ background: STEP_COLORS.step3 }}>3</span><span className="step-label">心智模型构建</span></div>
                  <div className="step-desc">5min TTL 缓存</div>
                  {stats && <div className="step-stat">{stats.mentalModels} 模型</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node parallel-hint" ref={el => { stepRefs.current['step4'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step4' })}>
                  <div className="step-header"><span className="step-number" style={{ background: STEP_COLORS.step4 }}>4</span><span className="step-label">匹配与调度</span></div>
                  <div className="step-desc">ExpertMatcher + Scheduling</div>
                  {stats && <div className="step-stat">{stats.scheduling.activeAssignments} 活跃</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node parallel-hint" ref={el => { stepRefs.current['step5'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step5' })}>
                  <div className="step-header"><span className="step-number" style={{ background: STEP_COLORS.step5 }}>5</span><span className="step-label">调用执行 (EMM 门控)</span></div>
                  <div className="step-desc">Input → Retrieve → Prompt → Gate</div>
                  {stats && <div className="step-stat">{stats.invocations.total} 次调用</div>}
                </div>
                <div className="flow-arrow">↓</div>
                <div className="step-node" ref={el => { stepRefs.current['step6'] = el; }} onClick={() => setModalNode({ type: 'step', key: 'step6' })}>
                  <div className="step-header"><span className="step-number" style={{ background: STEP_COLORS.step6 }}>6</span><span className="step-label">反馈校准</span></div>
                  <div className="step-desc">human_score → EMM weight</div>
                  {stats && <div className="step-stat">{stats.feedback.total} 反馈 · 均分 {stats.feedback.avgScore ? stats.feedback.avgScore.toFixed(2) : '-'}</div>}
                </div>
              </div>
            </div>

            {/* 列 3: 产出物 */}
            <div>
              <div className="panorama-col-label">15 个产出物</div>
              <div className="panorama-outputs">
                {groupMode === 'phase' && PHASES.map(phase => {
                  const items = outputsByPhase(phase.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={phase.key} className={`phase-group ${phase.cssClass}`}>
                      <div className="phase-label">{phase.label}</div>
                      <div className="phase-items">{items.map(o => renderOutputNode(o))}</div>
                    </div>
                  );
                })}
                {groupMode === 'step' && STEP_GROUPS.map(sg => {
                  const items = outputsByStep(sg.stepKey);
                  if (items.length === 0) return null;
                  return (
                    <div key={sg.stepKey} className="phase-group" style={{ borderColor: sg.color, background: `color-mix(in srgb, ${sg.color} 6%, white)` }}>
                      <div className="phase-label" style={{ color: sg.color }}>{sg.label} ({items.length} 个产出物)</div>
                      <div className="phase-items">{items.map(o => renderOutputNode(o))}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 列 4: 应用场景 */}
            <div>
              <div className="panorama-col-label">应用场景</div>
              <div className="panorama-apps">
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
            { v: stats.experts.active, l: '活跃专家', icon: '👥' },
            { v: stats.knowledgeSources, l: '知识源', icon: '📚' },
            { v: stats.invocations.total, l: '总调用', icon: '📞' },
            { v: stats.feedback.avgScore ? stats.feedback.avgScore.toFixed(2) : '-', l: '平均评分', icon: '⭐' },
            { v: stats.invocations.debate, l: '辩论次数', icon: '⚔️' },
          ].map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{s.icon} {s.v}</div>
              <div className="text-xs text-gray-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {renderModal()}
    </div>
  );
}
