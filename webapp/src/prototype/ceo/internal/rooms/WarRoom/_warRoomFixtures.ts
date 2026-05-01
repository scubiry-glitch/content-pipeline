// War Room 房间 fixture
// 来源: 07-archive/会议纪要 (20260501)/war-room.html

export interface FormationNode {
  id: string;
  name: string;
  role: string;
  cx: number;
  cy: number;
  r: number;
  variant: 'self' | 'ally' | 'advisor' | 'edge';
}

export const NODES: FormationNode[] = [
  { id: 'chen', name: '陈', role: 'CEO', cx: 300, cy: 250, r: 28, variant: 'self' },
  { id: 'shen', name: '沈', role: '主战 · IC', cx: 300, cy: 130, r: 22, variant: 'ally' },
  { id: 'zhou', name: '周', role: '侦察 · 纪要', cx: 300, cy: 370, r: 20, variant: 'ally' },
  { id: 'wei', name: 'Wei', role: '智囊 · 远', cx: 465, cy: 180, r: 20, variant: 'advisor' },
  { id: 'omar', name: 'Omar', role: '外援 · 行业', cx: 135, cy: 180, r: 20, variant: 'advisor' },
  { id: 'lin', name: '林', role: 'LP · 边缘', cx: 500, cy: 380, r: 18, variant: 'edge' },
];

export interface FormationLine {
  from: string;
  to: string;
  kind: 'support' | 'advisor' | 'tension' | 'silent';
}

export const LINES: FormationLine[] = [
  { from: 'chen', to: 'shen', kind: 'support' },
  { from: 'chen', to: 'zhou', kind: 'support' },
  { from: 'chen', to: 'wei', kind: 'advisor' },
  { from: 'chen', to: 'omar', kind: 'advisor' },
  { from: 'chen', to: 'lin', kind: 'silent' },
  { from: 'shen', to: 'zhou', kind: 'tension' },
];

export interface SandboxCard {
  topic: string;
  pct: number;
  branches: number;
}

export const SANDBOX: SandboxCard[] = [
  { topic: 'Q2 投资决策推演 · "AI 基础设施加配 $40M"', pct: 62, branches: 7 },
  { topic: 'LP 沟通策略推演 · "如何向林雾解释暂缓"', pct: 34, branches: 4 },
  { topic: '头部项目暂缓的 6 月后果 · "Project Halycon"', pct: 88, branches: 12 },
];

export interface GapCard {
  text: string;
  action: string;
}

export const GAPS: GapCard[] = [
  {
    text: '你的团队 已经 4 周没人唱反调 了 —— 该招个人,还是该让某人换角色?',
    action: '让 Wei Tan 主导一次反方推演',
  },
  {
    text: 'Wei Tan 与林雾 至今从未在同一议题上交锋 —— 缺一种张力',
    action: '安排一次三方会议',
  },
  {
    text: '沈岚承担了 67% 的关键决策 —— 单点风险太高',
    action: '把下一次评审的主持权给周劭然',
  },
  {
    text: '陈汀(你)在 沈岚发言时沉默 2\'14" —— 本月最长一次,值得回放',
    action: '跳到张力流复盘',
  },
];

export interface SparkCard {
  tag: string;
  headline: string;
  evidence: string;
}

export const SPARKS: SparkCard[] = [
  {
    tag: '🔮 跨项目人才嫁接',
    headline: '让 Wei Tan 主导 LP 沟通方案 —— 也许他的二阶思考能给林雾一个交代',
    evidence: '过去 6 场会议中,Wei 的 3 次反事实提问被 LP 提到 2 次',
  },
  {
    tag: '⚙️ 角色对换实验',
    headline: '让 周劭然 主持下次投委会 —— 沈岚转做反方质询',
    evidence: '周的纪要质量近 4 周提升明显，已具备主持张力的判断力',
  },
  {
    tag: '🪞 沉默激活',
    headline: '邀请林雾参与一场非 LP 议题 —— 看他真实的判断节奏',
    evidence: '林在 LP 议题外的 1 次发言被 Wei 评为"出乎意料的清醒"',
  },
];

export const CONFLICT = {
  total: 9,
  build: 7,
  destructive: 2,
  silent: 1,
  verdict: '健康 — 略偏冷,可再激发一次反方思考',
};
