// 原型 mock 数据 — 来自 /tmp/mn-proto/shared.jsx 直译
// Phase 2+ 逐个被真实 API 替换，未替换前页面显示 [mock] 角标

import type { Tone } from './_atoms';

// ── Meeting ──
export const MEETING = {
  id: 'M-2026-04-11-0237',
  title: '2026 Q2 远翎资本 · AI 基础设施投资策略评审',
  date: '2026-04-11',
  duration: '118 分钟',
  room: '上海 · 外滩 22 号 5F',
  source: 'zoom-recording-237.m4a + 会议纪要初稿.docx',
  tokens: '41,382',
};

// ── Participants ──
export interface Participant {
  id: string;
  name: string;
  role: string;
  initials: string;
  tone: Tone;
  speakingPct: number;
}

export const PARTICIPANTS: Participant[] = [
  { id: 'p1', name: '陈汀',     role: '管理合伙人',             initials: '陈',  tone: 'neutral', speakingPct: 28 },
  { id: 'p2', name: '沈岚',     role: '基础设施方向负责人',     initials: '沈',  tone: 'warm',    speakingPct: 23 },
  { id: 'p3', name: 'Wei Tan',  role: '硅谷顾问',               initials: 'WT', tone: 'cool',    speakingPct: 19 },
  { id: 'p4', name: '周劭然',   role: '分析师 · 本场纪要作者',  initials: '周',  tone: 'neutral', speakingPct: 11 },
  { id: 'p5', name: '林雾',     role: 'LP 代表(旁听)',          initials: '林',  tone: 'cool',    speakingPct: 8 },
  { id: 'p6', name: 'Omar K.',  role: '行业顾问(远程)',         initials: 'OK', tone: 'warm',    speakingPct: 11 },
];

export const P = (id: string): Participant =>
  PARTICIPANTS.find((x) => x.id === id) ?? ({ id, name: id, role: '', initials: '?', tone: 'neutral', speakingPct: 0 });

// API 模式下从后端拿到的 person_id 通常是 UUID，配套返回 person_name。
// 这个 helper 用于 mapping 时选最适合 P() 的输入：
// - 命中 fixture id（demo 数据）→ 用 id
// - 否则用 name → P() 返回 { name, initials: '?' } 占位 Participant，避免显示 UUID
// - 全空 → '—'（render 端用 === '—' 判定显示"—"）
export const pickPerson = (id?: string | null, name?: string | null): string => {
  if (id && PARTICIPANTS.some((p) => p.id === id)) return id;
  if (name && name.trim()) return name.trim();
  if (id) return id;
  return '—';
};

// ── Experts ──
export interface ExpertMock {
  id: string;
  name: string;
  field: string;
  style: string;
  match: number;
  calibration: string;
  mentalModels: string[];
  signature: string;
  recommendedFor: string[];
  selected: boolean;
}

export const EXPERTS: ExpertMock[] = [
  {
    id: 'E09-09',
    name: '二阶思考者 · Howard',
    field: '投资哲学 / 概率思维',
    style: '冷静、反共识、偏好通过否定逼近答案',
    match: 0.94,
    calibration: 'Brier 0.18 · overbias -0.04',
    mentalModels: ['二阶效应', '反身性', '基础利率', '失败前提 pre-mortem'],
    signature: '从市场共识的反面开始提问',
    recommendedFor: ['tension', 'belief_evolution'],
    selected: true,
  },
  {
    id: 'E04-12',
    name: '产业链测绘师 · Marco',
    field: '硬科技 / 供应链',
    style: '以事实链条锚定判断，重证据',
    match: 0.91,
    calibration: 'Brier 0.21 · overbias +0.02',
    mentalModels: ['瓶颈分析', '替代弹性', '单点故障', "Wright's Law"],
    signature: '追溯到 BOM 与产能瓶颈',
    recommendedFor: ['focus_map', 'consensus'],
    selected: true,
  },
  {
    id: 'E11-03',
    name: '叙事追踪者 · 清野',
    field: '市场心理 / 叙事周期',
    style: '擅长识别叙事曲线与反身性拐点',
    match: 0.86,
    calibration: 'Brier 0.24 · overbias +0.08',
    mentalModels: ['叙事的生命周期', '反身性', 'meme → 资本 → 基本面'],
    signature: '用叙事强度预估资金流向',
    recommendedFor: ['new_cognition', 'tension'],
    selected: true,
  },
  {
    id: 'E07-18',
    name: '基础利率检察官',
    field: '统计直觉 / 归因',
    style: '以基础利率质疑每一个"这次不一样"',
    match: 0.78,
    calibration: 'Brier 0.16 · overbias -0.09',
    mentalModels: ['Base Rate', '幸存者偏差', '参考类预测'],
    signature: '提供同类样本的历史命中率',
    recommendedFor: ['consensus', 'belief_evolution'],
    selected: false,
  },
  {
    id: 'E02-41',
    name: '制度与治理观察者',
    field: '合规 / 地缘',
    style: '自底向上的政策敏感度',
    match: 0.69,
    calibration: 'Brier 0.28 · overbias +0.11',
    mentalModels: ['监管捕获', '合规阈值', '地缘摩擦'],
    signature: '识别被低估的制度摩擦',
    recommendedFor: ['focus_map'],
    selected: false,
  },
];

// ── Dimensions ──
export const DIMENSIONS = [
  { id: 'minutes',       label: '常规纪要',                sub: '发言序列 · 决议 · 行动项',  accent: 'ink' },
  { id: 'tension',       label: '张力',                    sub: '观点之间的推拉、犹豫与让步', accent: 'accent' },
  { id: 'new_cognition', label: '新认知',                  sub: '会议中被更新/翻转的信念',    accent: 'teal' },
  { id: 'focus_map',     label: '各自关注点',              sub: '每位参与者反复回到的议题',   accent: 'amber' },
  { id: 'consensus',     label: '共识与分歧',              sub: '哪些已对齐、哪些仍在分岔',   accent: 'accent' },
  { id: 'cross_view',    label: '关键观点的他人观点',       sub: '对一条主张，其他人如何回应', accent: 'teal' },
] as const;

// ── Analysis (简化版 — 给 variants A/B/C 使用) ──
export const ANALYSIS = {
  summary: {
    decision: '对 AI 基础设施方向从「加配」调整为「精选加配」：单笔上限 6,000 万美元，优先布局中游推理效率层。',
    actionItems: [
      { id: 'A1', who: 'p2', what: '两周内提交推理层 3 家 candidate 尽调包', due: '2026-04-25' },
      { id: 'A2', who: 'p3', what: '整理北美 5 家同业在推理层的退出路径对比', due: '2026-04-22' },
      { id: 'A3', who: 'p4', what: '补充 2023-2025 基础设施细分赛道基础利率', due: '2026-04-18' },
    ],
    risks: ['LP 对集中度担忧尚未回应', 'H-chip 进口配额 Q3 可能再次收紧'],
  },
  tension: [
    {
      id: 'T1', between: ['p2', 'p3'], topic: '中游 vs 训练层', intensity: 0.82,
      summary: '沈岚认为中游推理层有价格歧视空间，毛利结构更耐周期；Wei Tan 坚持训练层规模效应是真正护城河，一旦摊薄单位成本会碾过毛利曲线。',
      moments: [
        '"我坚持的是：推理层在特定 workload 下有价格歧视空间，毛利结构比训练层更耐得住周期。"',
        '"规模你守不住。训练层一旦摊到 10^27 flops，单位成本会碾过毛利曲线。"',
      ],
    },
    {
      id: 'T2', between: ['p1', 'p5'], topic: '集中度 vs LP 偏好', intensity: 0.61,
      summary: '陈汀倾向于单笔上限 8,000 万以保持集中度，林雾担忧 LP 对集中度的接受度，提出合规边界。',
      moments: ['"上限可以谈，但 8000 万那种单笔，我们要准备好跟 LP 沟通预案。"'],
    },
    {
      id: 'T3', between: ['p2', 'p6'], topic: '北美配售 vs 本土化', intensity: 0.44,
      summary: '沈岚偏向北美配售节奏，Omar K. 提出本土化路径（subadvisor 结构）正在验证中。',
      moments: [],
    },
  ],
  newCognition: [
    {
      id: 'N1', who: 'p1', before: '推理层=毛利陷阱', after: '推理层在特定 workload 下具备价格歧视空间',
      trigger: 'Wei Tan 给出的北美 3 家推理层案例数据，以及 Omar K. 的 warm intro 成功率',
    },
    {
      id: 'N2', who: 'p3', before: '中国团队很难拿到北美 deal flow', after: '通过 subadvisor 结构每月 3-5 个 warm intro 可行',
      trigger: 'Omar K. 分享的 18 次 warm intro、4 个 term sheet 的实证数据',
    },
    {
      id: 'N3', who: 'p2', before: 'H-chip 短缺是利好', after: '若配额再收紧，portfolio 头部两家将被迫降价',
      trigger: '周劭然补充的 Q3 配额收紧政策信号与现有 portfolio 头寸测算',
    },
  ],
  focusMap: [
    { who: 'p1', themes: ['单笔上限', '集中度', 'LP 沟通'],   returnsTo: 7 },
    { who: 'p2', themes: ['推理层', '毛利', '价格歧视'],       returnsTo: 9 },
    { who: 'p3', themes: ['训练层', '规模效应', '退出路径'],   returnsTo: 6 },
    { who: 'p4', themes: ['基础利率', '历史中位数', '数据'],   returnsTo: 4 },
    { who: 'p5', themes: ['合规 / LP', '边界条件'],            returnsTo: 3 },
    { who: 'p6', themes: ['warm intro', 'subadvisor', '北美'], returnsTo: 5 },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus' as const, text: '推理层是本轮优先布局方向，单笔上限定在 6,000 万美元。', supportedBy: ['p1','p2','p3','p4','p5','p6'], sides: [] },
    { id: 'C2', kind: 'consensus' as const, text: 'subadvisor 结构可作为北美 deal flow 的补充渠道。', supportedBy: ['p1','p2','p6'], sides: [] },
    { id: 'D1', kind: 'divergence' as const, text: '单笔上限究竟应为 6,000 万还是 8,000 万？', supportedBy: [], sides: [
      { stance: '6000万', reason: '集中度已到 LP 接受上限', by: ['p1','p5'] },
      { stance: '8000万', reason: '单笔更大才能拿到核心头部份额', by: ['p2'] },
    ]},
    { id: 'D2', kind: 'divergence' as const, text: '中游 vs 训练层：哪一层的毛利护城河更深？', supportedBy: [], sides: [
      { stance: '中游护城河', reason: '价格歧视空间 + workload 粘性', by: ['p2','p6'] },
      { stance: '训练层护城河', reason: '规模效应不可逆，一旦摊薄碾压中游', by: ['p3'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p2',
      claim: '推理层在特定 workload 下有价格歧视空间，毛利结构比训练层更耐得住周期。',
      responses: [
        { who: 'p3', stance: 'oppose'   as const, text: '规模摊薄效应不可逆，3 年内训练层会碾过推理层毛利曲线。' },
        { who: 'p1', stance: 'partial'  as const, text: '认同，但需要先确认 H-chip 配额风险敞口。' },
        { who: 'p6', stance: 'support'  as const, text: '北美案例证实：特定工作负载的粘性很强。' },
        { who: 'p4', stance: 'neutral'  as const, text: '历史同类中位数 38%，需要拆 cohort 再做判断。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p6',
      claim: '过去 6 个月提供了 18 个 warm intro，4 个进到 term sheet，subadvisor 渠道已验证。',
      responses: [
        { who: 'p1', stance: 'support'  as const, text: '认可渠道有效性，可以列为标准 deal flow 来源。' },
        { who: 'p3', stance: 'partial'  as const, text: '进入率 22% 不算高，但对我们的规模已够用。' },
        { who: 'p2', stance: 'support'  as const, text: '这解决了我们对北美 deal flow 最大的担忧。' },
      ],
    },
  ],
};

// ── 最近会议列表（Today 页和 Library 页共用） ──
export const RECENT_MEETINGS = [
  { id: 'M-2026-04-11-0237', date: '2026-04-11', title: '2026 Q2 远翎资本 · AI 基础设施投资策略评审', n: '6 人 · 118 分钟', scope: '远翎 Q2' },
  { id: 'M-2026-03-28',      date: '2026-03-28', title: '远翎资本 · Q1 复盘 · 基础设施方向',         n: '8 人 · 142 分钟', scope: '远翎 Q1' },
  { id: 'M-2026-03-14',      date: '2026-03-14', title: '团队内部 · 推理层 subadvisor 选择讨论',     n: '4 人 · 68 分钟',  scope: '推理层' },
  { id: 'M-2026-02-22',      date: '2026-02-22', title: 'LP 沟通会 · Q1 进度披露',                   n: '12 人 · 95 分钟', scope: 'LP 关系' },
];

// ── Scopes（项目/客户/主题） ──
export const SCOPES = {
  project: [
    { id: 'scope-far-2026', name: '远翎 2026 基础设施', n: 14, lastUpdate: '今天' },
    { id: 'scope-reason',   name: '推理层研究',         n: 9,  lastUpdate: '2 天前' },
  ],
  client: [
    { id: 'scope-farl',     name: '远翎资本',           n: 22, lastUpdate: '今天' },
    { id: 'scope-sunflower',name: '向日葵 Fund',        n: 7,  lastUpdate: '1 周前' },
  ],
  topic: [
    { id: 'scope-infra',    name: 'AI 基础设施',         n: 18, lastUpdate: '今天' },
    { id: 'scope-geo',      name: '地缘 · 硬件配额',     n: 6,  lastUpdate: '3 天前' },
  ],
};

// ── Strategies / Decorators / Presets（来自 strategy-panel.jsx） ──
export const STRATEGIES = [
  { id: 'single',    label: '单专家',     note: '轻量 baseline',              cost: 'low',    when: '简单主题、需要快速判断' },
  { id: 'committee', label: '委员会',     note: '3-5 专家取中位',              cost: 'medium', when: '多视角、需要稳定结果' },
  { id: 'debate',    label: '辩论',       note: '两轮互反驳 + judge 裁决',     cost: 'high',   when: '争议强 / 张力高' },
  { id: 'tree',      label: '树搜索',     note: '多路径假设 + 回溯',           cost: 'high',   when: '开放问题、路径不确定' },
];

export const DECORATORS = [
  { id: 'failure_check',         label: '失败前提检查',  note: 'pre-mortem 预设失败' },
  { id: 'evidence_anchored',     label: '证据锚定',     note: '每个断言必带 evidence id' },
  { id: 'calibrated_confidence', label: '校准置信',     note: 'overbias 纠偏' },
  { id: 'knowledge_grounded',    label: '知识接地',     note: '引用判断库 / 心智模型' },
  { id: 'rubric_anchored_output',label: 'rubric 输出',  note: '按 rubric 5 维评分' },
  { id: 'counter_example',       label: '反例收集',     note: '生成 3 条归谬' },
  { id: 'base_rate',             label: '基础利率',     note: '同类样本中位数' },
  { id: 'numerical_sanity',      label: '数值校验',     note: '单位/量纲检查' },
  { id: 'cross_check',           label: '交叉验证',     note: '多来源对照' },
];

export const PRESETS = [
  { id: 'lite',     label: 'lite',     position: '快速通道 · 1 专家 · 基础装饰器',        experts: 1, decorators: 2, cost: '~$0.04' },
  { id: 'standard', label: 'standard', position: '常规场景 · 3 专家 · 完整装饰器栈',        experts: 3, decorators: 5, cost: '~$0.22' },
  { id: 'max',      label: 'max',      position: '深度分析 · 5+ 专家 · 辩论 + 复核',        experts: 5, decorators: 9, cost: '~$1.20' },
];
