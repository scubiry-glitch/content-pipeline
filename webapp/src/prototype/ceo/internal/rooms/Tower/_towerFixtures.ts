// Tower 房间 fixture
// 来源: 07-archive/会议纪要 (20260501)/tower.html

export interface KanbanCard {
  from: string;
  date: string;
  text: string;
  due: string;
  warn?: boolean;
  late?: boolean;
  done?: boolean;
}

export const KANBAN: { name: string; tone: string; count: number; cards: KanbanCard[] }[] = [
  {
    name: '○ 提出',
    tone: '#7BA9C2',
    count: 5,
    cards: [
      { from: '林雾 → 陈汀', date: '04-28', text: '退出路径方案的书面回复', due: '未排期' },
      { from: '陆景行 → Wei', date: '04-26', text: 'Halycon 候选人 X 的同行尽调', due: '5 月初' },
      { from: '陈汀 → Sara', date: '04-25', text: 'Crucible 暂停的合规口径', due: '本周' },
    ],
  },
  {
    name: '◐ 进行中',
    tone: '#C49B4D',
    count: 7,
    cards: [
      { from: 'Wei 欠 陈汀', date: '04-19', text: '《估值锚定五条》起草', due: '原 04-23 · 推迟', warn: true },
      { from: '陆景行 欠 董事会', date: '04-12', text: 'Halycon 团队补员 3 人(1/3)', due: 'Q2 内' },
      { from: 'Sara 欠 陈汀', date: '04-10', text: 'Crucible 合规备案 80%', due: '月底前' },
    ],
  },
  {
    name: '⊗ 逾期',
    tone: '#C46A50',
    count: 4,
    cards: [
      { from: '陈汀 欠 林雾', date: '03-28', text: 'LP 反馈闭环机制设计', due: '逾期 28 天', late: true },
      { from: '陈汀 欠 董事会', date: '04-05', text: '退出路径年度路线图', due: '逾期 21 天', late: true },
      { from: 'Wei 欠 陈汀', date: '04-09', text: 'Stellar 估值反复复盘报告', due: '逾期 14 天', late: true },
    ],
  },
  {
    name: '✓ 完成',
    tone: '#5FA39E',
    count: 5,
    cards: [
      { from: '陈汀 → 董事会', date: '04-22', text: 'Q1 季度报告', due: '已交付', done: true },
      { from: 'Omar → 陈汀', date: '04-15', text: 'Beacon 退出策略评审', due: '已盖章', done: true },
      { from: '陈汀 → Halycon', date: '04-08', text: '追加投资批准', due: '已签', done: true },
    ],
  },
];

export interface BlockerCard {
  name: string;
  days: string;
  text: string;
  warn?: boolean;
}

export const BLOCKERS: BlockerCard[] = [
  {
    name: 'LP 反馈闭环 · 无人接',
    days: '28 天',
    text: '陈汀挂名,但实际负责人未指派。林雾已 3 次催促。',
  },
  {
    name: 'Stellar 估值复盘 · 卡在 Wei',
    days: '14 天',
    text: 'Wei 在等陈汀的尽调材料 — 而陈汀以为 Wei 主写。',
  },
  {
    name: '退出路径路线图 · 议程被挤',
    days: '21 天',
    text: '连续 3 次会议被 Crucible 救火挤掉。',
    warn: true,
  },
];

export const POST_MEETING = {
  title: '投委会 #34',
  date: '04-29',
  duration: '90 min',
  meta: '5 项 / 3 未闭',
  items: [
    { text: 'Crucible 是否官方暂停 — 需投票表决', who: 'RSP: 陈汀 · 本周', due: true },
    { text: 'Stellar 估值方法书面化由谁主笔', who: 'RSP: Wei · 待定' },
    { text: '林雾的退出路径问题排进下次议程', who: 'RSP: 陈汀 · 必须', due: true },
  ],
};

// rhythm pulse 8 周数据 — main / firefighting / plan
export const PULSE_WEEKS = {
  main: [60, 45, 52, 40, 48, 55, 42, 30],         // y 坐标 (越小代表小时数越多 — SVG 上方)
  firefighting: [108, 102, 98, 95, 90, 82, 78, 55],
  plan: 50,
};

export const DEFICIT = {
  pct: 112,
  totalH: 56,
  budgetH: 50,
  warning: '透支 6h ≈ 1 个半工作日。本周第 3 周连续透支。',
};
