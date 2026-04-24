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
    { id: 'T1', between: ['p2', 'p3'], topic: '中游 vs 训练层',   intensity: 0.82 },
    { id: 'T2', between: ['p1', 'p5'], topic: '集中度 vs LP 偏好', intensity: 0.61 },
    { id: 'T3', between: ['p2', 'p6'], topic: '北美配售 vs 本土化', intensity: 0.44 },
  ],
  newCognition: [
    { id: 'N1', who: 'p1', before: '推理层=毛利陷阱', after: '推理层在特定 workload 下具备价格歧视空间' },
    { id: 'N2', who: 'p3', before: '中国团队很难拿到北美 deal flow', after: '通过 subadvisor 结构每月 3-5 个 warm intro 可行' },
    { id: 'N3', who: 'p2', before: 'H-chip 短缺是利好',   after: '若配额再收紧，portfolio 头部两家将被迫降价' },
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
