// Situation 房间 fixture
// 来源: 07-archive/会议纪要 (20260501)/situation.html

export interface StakeholderNode {
  id: string;
  name: string;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  arrow: string;
  arrowColor: string;
}

export const HEATMAP_NODES: StakeholderNode[] = [
  {
    id: 'lp', name: 'LP',
    cx: 0, cy: -100, r: 18,
    fill: 'rgba(196,106,80,0.7)', stroke: '#C46A50',
    arrow: '↑↑↑', arrowColor: '#C46A50',
  },
  {
    id: 'board', name: '董事会',
    cx: 76, cy: -44, r: 22,
    fill: 'rgba(196,155,77,0.5)', stroke: '#C49B4D',
    arrow: '↑↑', arrowColor: '#C49B4D',
  },
  {
    id: 'media', name: '媒体',
    cx: 100, cy: 60, r: 14,
    fill: 'rgba(102,121,181,0.4)', stroke: '#6679B5',
    arrow: '→', arrowColor: '#8B9BC8',
  },
  {
    id: 'reg', name: '监管',
    cx: -65, cy: 55, r: 13,
    fill: 'rgba(102,121,181,0.4)', stroke: '#6679B5',
    arrow: '→', arrowColor: '#8B9BC8',
  },
  {
    id: 'peers', name: '同行',
    cx: -90, cy: -30, r: 15,
    fill: 'rgba(196,155,77,0.45)', stroke: '#C49B4D',
    arrow: '↑', arrowColor: '#C49B4D',
  },
  {
    id: 'team', name: '团队',
    cx: 42, cy: 80, r: 16,
    fill: 'rgba(95,163,158,0.5)', stroke: '#5FA39E',
    arrow: '↗', arrowColor: '#5FA39E',
  },
];

export interface StakeholderRow {
  name: string;
  scope: string;
  temp: string;
  text: string;
  hot?: boolean;
  warm?: boolean;
  calm?: boolean;
}

export const STAKEHOLDERS: StakeholderRow[] = [
  { name: 'LP', scope: '林雾 + 3 位机构', temp: '温度 ↑↑↑ · 28 天升温', text: '退出路径 + 部署节奏两个问题叠加，Q3 大会临近', hot: true },
  { name: '董事会', scope: 'Wei + Omar 主导', temp: '温度 ↑↑ · 流程问题升级', text: '从"项目层"上升到"流程层"的关切', warm: true },
  { name: '同行', scope: '3 家友基扫描中', temp: '温度 ↑ · Stellar 关注', text: 'Sequoia + Lightspeed 都在看 Stellar — 估值反复传到外面', warm: true },
  { name: '团队', scope: '内部', temp: '温度 ↗ · 紧绷但不裂', text: '陆景行连续 2 周加班，需关注', calm: true },
  { name: '监管', scope: '港 SFC + 美 SEC', temp: '温度 → · 平稳', text: '无新规变化；Crucible 合规进度可追' },
  { name: '媒体', scope: '财经口', temp: '温度 → · 无负面', text: '本季无 inbound，本基金未上头条' },
];

export interface SignalCard {
  source: string;
  date: string;
  text: string;
  tag: string;
  impact: string;
  tone: 'pos' | 'neg' | 'warn' | 'neutral';
}

export const SIGNALS: SignalCard[] = [
  { source: 'Bloomberg', date: '05-01', text: '亚洲 PE 估值 H1 普跌 12%，IRR 中位数下滑', tag: 'PE 行业', impact: '影响 Stellar 估值锚', tone: 'neg' },
  { source: 'FT', date: '04-30', text: 'SFC 拟将 PE 报告周期由半年改季度', tag: '监管', impact: 'Sara 已在跟进', tone: 'warn' },
  { source: 'Halycon 创始人', date: '04-29', text: 'Q1 ARR +47%，新签 2 单战略客户', tag: 'portfolio', impact: '强信号', tone: 'pos' },
  { source: '业内传言', date: '04-28', text: 'Stellar 估值反复传至 3 家同行', tag: '声誉', impact: '流程层风险', tone: 'neg' },
  { source: 'Reuters', date: '04-26', text: 'Sequoia 完成第 IV 期亚洲基金募集', tag: '同行', impact: '中性', tone: 'neutral' },
  { source: '林雾(私聊)', date: '04-25', text: '"Q3 大会前我需要看到方案"', tag: 'LP', impact: '直接信号', tone: 'warn' },
  { source: 'Beacon 团队', date: '04-24', text: '退出协议主体条款达成，5 月签', tag: 'portfolio', impact: '验证策略', tone: 'pos' },
  { source: 'Crucible 媒体', date: '04-23', text: '业内自媒体提及该公司"动向不明"', tag: 'portfolio', impact: '加快宣判', tone: 'neg' },
];

export const RUBRIC_DIMS = ['战略清晰', '节奏匹配', '沟通透明', '流程严谨', '回应速度'];

export const RUBRIC_ROWS: Array<{ who: string; sub: string; scores: number[] }> = [
  { who: 'LP · 林雾', sub: '3 位机构 LP 平均', scores: [6.5, 4.2, 5.0, 7.0, 3.8] },
  { who: '董事会', sub: 'Wei + Omar + 陆景行', scores: [8.2, 6.8, 7.5, 8.0, 7.2] },
  { who: '同行', sub: '3 家友基匿名打分', scores: [7.5, 6.5, 6.0, 7.8, 6.2] },
  { who: '团队', sub: '内部 14 人调研', scores: [7.8, 6.5, 7.0, 7.5, 7.0] },
  { who: '监管', sub: '合规自评 + Sara', scores: [7.0, 7.5, 7.0, 8.5, 7.2] },
  { who: '媒体', sub: '舆情评分 + 合作记者', scores: [6.8, 5.5, 6.5, 6.8, 6.0] },
];

export const BLINDSPOTS = [
  { kind: '⚠️ 长期未照',  text: '媒体口你已 8 个月没主动出声 — 一旦出事会失去叙事权' },
  { kind: '⚠️ 反差巨大',  text: 'LP 给你 沟通透明 5.0 / 团队给你 7.0 — 你在讲不同的故事' },
  { kind: '⚠️ 单点依赖',  text: '7 成外部信号来自林雾一人 — 应增第二信源' },
];

export const HORIZON_TABS = [
  { id: 'now', label: '本周', items: ['LP 私聊待回应', 'Beacon 退出协议签字', 'Halycon ARR 战报对外'] },
  { id: 'q3', label: 'Q3 临近', items: ['LP 大会预读包', '退出路径年度路线图', 'Stellar 估值书面化'] },
  { id: 'long', label: '长尾', items: ['SFC 季度报告改革跟进', '同行扫描机制建立', '媒体长期叙事策略'] },
];
