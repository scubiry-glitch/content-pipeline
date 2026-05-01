// Boardroom 房间 fixture 兜底数据
// 来源: 07-archive/会议纪要 (20260501)/boardroom.html

export interface DirectorCard {
  name: string;
  role: string;
  count: string;
  text: string;
  warn?: boolean;
  calm?: boolean;
}

export const DIRECTOR_CARDS: DirectorCard[] = [
  {
    name: '林雾',
    role: 'LP 代表',
    count: '3 次 · 未回应',
    text: '退出路径再不明确,Q3 LP 大会怎么开?',
    warn: true,
  },
  {
    name: 'Wei Zhao',
    role: '独立董事',
    count: '2 次',
    text: 'Stellar 估值反复 5 次,你们的尽调标准到底是什么?',
  },
  {
    name: 'Omar K.',
    role: '独立董事',
    count: '2 次',
    text: '基金部署节奏比预期慢 18 个月 — 是市场变了还是判断变了?',
  },
  {
    name: '陆景行',
    role: '创始合伙人',
    count: '1 次 · 平稳',
    text: '下个新人储备得抓紧 — Halycon 团队该补人了。',
    calm: true,
  },
  {
    name: 'Sara M.',
    role: '法务顾问',
    count: '1 次 · 平稳',
    text: 'Crucible 的合规备案需在月内完成。',
    calm: true,
  },
];

export interface PrebriefSection {
  num: string;
  title: string;
  pages: string;
  highlight?: boolean;
}

export const PREBRIEF = {
  meta: '2026 Q2 · BOARD #14 · DRAFT v0.3',
  title: '下次董事会预读包 · 自动汇编自近 4 周 12 份 readings',
  sections: [
    { num: '01', title: '基金部署节奏 vs 部署计划', pages: 'p.2-4' },
    { num: '02', title: 'Halycon 进展 + 团队补员', pages: 'p.5-7' },
    { num: '03', title: 'Stellar 尽调结论 / 估值分歧', pages: 'p.8-10' },
    { num: '04', title: 'Crucible 处置建议', pages: 'p.11-12' },
    { num: '05', title: '退出路径回应(林雾)', pages: 'p.13-15', highlight: true },
    { num: '06', title: '风险与合规附录', pages: 'p.16' },
  ] as PrebriefSection[],
  footer: '16 PAGES · 12 READINGS · 6 LAWS',
};

export interface PromiseRow {
  what: string;
  owner: string;
  status: 'late' | 'in_progress' | 'done';
  statusText: string;
}

export const PROMISES: PromiseRow[] = [
  { what: '建立 LP 反馈闭环机制', owner: '陈汀', status: 'late', statusText: '逾期 28 天' },
  { what: 'Halycon 团队补员 3 人', owner: '陆景行', status: 'in_progress', statusText: '1/3 进行中' },
  { what: 'Stellar 估值锚定方法书面化', owner: 'Wei + 陈汀', status: 'late', statusText: '逾期 14 天' },
  { what: 'Crucible 合规备案', owner: 'Sara M.', status: 'in_progress', statusText: '80%' },
  { what: 'Q1 季度报告交付', owner: '陈汀', status: 'done', statusText: '已完成' },
  { what: 'Beacon 退出策略评审', owner: 'Omar K.', status: 'done', statusText: '已完成' },
];

export interface RebuttalCard {
  attacker: string;
  attack: string;
  defense: string;
  strength: number;
}

export const REBUTTALS: RebuttalCard[] = [
  {
    attacker: '林雾(LP代表)',
    attack: '退出路径都讲不清楚,凭什么相信你们的部署节奏?',
    defense:
      '承认这是过去 3 季的盲点。给出具体补救:Q3 起每月报告增加"3 个有效退出窗口预测",并由 Omar 独立验证。',
    strength: 0.62,
  },
  {
    attacker: 'Wei Zhao(独立董事)',
    attack: 'Stellar 估值反复 5 次 — 这不是项目问题,是你们的尽调流程问题。',
    defense:
      '同意。已起草《估值锚定五条》(沿用 Wei 的 rubric),下次会议前书面化、签字、归档。承诺一年内复用 ≥10 次。',
    strength: 0.78,
  },
  {
    attacker: 'Omar K.(独立董事)',
    attack: '部署节奏放慢 18 个月 — 是策略,还是判断失准?',
    defense:
      '策略。明示前提:估值未充分回调,而 IRR 目标 25%+ 不可妥协。给出 IF/THEN 触发条件:若市场指标跌穿 X,则恢复正常节奏。',
    strength: 0.54,
  },
];

export const ANNOTATIONS = [
  {
    from: 'Wei Zhao',
    target: 'Stellar 备忘录',
    tag: '04-23 · rubric 7.2',
    quote: '估值不应反复;反复 3 次以上 = 尽调流程出问题,而不是项目本身。',
  },
  {
    from: 'Omar K.',
    target: '部署节奏',
    tag: '04-19 · rubric 6.8',
    quote: '放慢部署节奏不是错,但要明示这是策略选择,不是市场逼迫。',
  },
  {
    from: 'Sara M.',
    target: 'Crucible 合规',
    tag: '04-12 · rubric 8.5',
    quote: '3 周失联法则若已生效,合规备案须同步更新 — 别等到月底。',
  },
];
