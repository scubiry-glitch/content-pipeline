// Balcony 房间 fixture
// 来源: 07-archive/会议纪要 (20260501)/balcony.html

export const REFLECTIONS = [
  {
    label: 'question 01 · 方向',
    question: '你这周做的决定里,哪一个 是在承诺而非选择?',
    prompt:
      '周三董事会 · AI 基础设施 Q2 加配决议 —— 你在会上说"同意",但从张力图看,你在陈汀发言时沉默了 2 分 14 秒,这是本月最长的一次。那次沉默后,事情没变。',
  },
  {
    label: 'question 02 · 团队',
    question: '你有多久 没和周劭然 单独说过话了?',
    prompt:
      '本周他在 4 场会议里都在场,但只发言 3 次,共 47 秒。他的「沉默时长 / 发言时长」比率从 Q1 的 4.2 涨到了 Q2 的 11.8。也许这周末给他发一条消息。',
  },
  {
    label: 'question 03 · 自己',
    question: '这周有 一件事,你觉得再来一次会做得不一样吗?',
    prompt:
      'Copilot 注意到:周四和 Omar K. 的会议中,你三次用了"我们再看一下"这样的措辞,都发生在他提出反对意见后 8 秒内。这不是结论,只是一个 观察。',
  },
];

export interface PrismPoint {
  prism: 'direction' | 'board' | 'coord' | 'team' | 'ext' | 'self';
  label: string;
  score: number;
  // 6 边形顶点 (从北开始顺时针，匹配原型)
  cx: number;
  cy: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'middle' | 'start' | 'end';
}

export const PRISM_POINTS: PrismPoint[] = [
  { prism: 'direction', label: '方向', score: 0.72, cx: 0, cy: -65, labelX: 0, labelY: -88, labelAnchor: 'middle' },
  { prism: 'board', label: '董事会', score: 0.58, cx: 56, cy: -26, labelX: 78, labelY: -32, labelAnchor: 'start' },
  { prism: 'coord', label: '协调', score: 0.78, cx: 48, cy: 38, labelX: 68, labelY: 50, labelAnchor: 'start' },
  { prism: 'team', label: '团队', score: 0.78, cx: -8, cy: 72, labelX: 0, labelY: 92, labelAnchor: 'middle' },
  { prism: 'ext', label: '各方', score: 0.6, cx: -55, cy: 28, labelX: -78, labelY: 36, labelAnchor: 'end' },
  { prism: 'self', label: '个人', score: 0.41, cx: -52, cy: -30, labelX: -72, labelY: -32, labelAnchor: 'end' },
];

export const BALCONY_RHYTHM = [
  { h: 65, miss: false },
  { h: 8, miss: true },
  { h: 55, miss: false },
  { h: 70, miss: false },
  { h: 5, miss: true },
  { h: 50, miss: false },
  { h: 6, miss: true },
  { h: 60, miss: false },
  { h: 80, miss: false },
  { h: 5, miss: true },
  { h: 65, miss: false },
  { h: 90, miss: false, now: true as boolean | undefined },
];

export const SILENCE_CARDS = [
  { name: '周三 董事会 · AI 加配决议', meta: '沉默 2\'14"', text: '本月最长沉默 — 在陈汀发言后', long: true },
  { name: '周劭然 沉默/发言', meta: '11.8 ↑', text: '从 Q1 4.2 涨到 Q2 11.8 — 有事' },
  { name: '你的"我们再看一下"', meta: '3 次', text: '都在 Omar 反对意见后 8 秒内' },
];

export const ECHOS = [
  { when: '04-22', text: 'Halycon 追加投资', pos: '回声正向', detail: 'ARR +47%' },
  { when: '04-15', text: 'Beacon 退出策略', pos: '已盖章', detail: '5 月签' },
  { when: '04-12', text: 'Stellar 估值锚', neg: '5 次反复', detail: '流程问题' },
  { when: '03-28', text: 'LP 反馈闭环', neg: '逾期 28 天', detail: '' },
  { when: '03-15', text: 'Crucible 入场', neg: '即将宣判', detail: '' },
];

export const SELF_PROMISES = [
  { kept: true, text: '每周写一段反思', sub: '已 4/4 周' },
  { kept: true, text: '周三晚 7 点不开会', sub: '已 3/4 周' },
  { kept: false, text: '每月一次和林雾喝咖啡', sub: '欠 1 次' },
  { kept: false, text: '每周一对一周劭然', sub: '已 2 周未见' },
];

export const TIME_ROI = {
  roi: 0.6,
  highRoi: 11,
  meetingH: 29,
  deepH: 11,
  targetDeep: 18,
};
