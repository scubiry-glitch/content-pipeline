// Compass 房间 fixture 兜底数据
// 当 API 返回空 (新装 schema 没数据) 时用这套作为视觉填充
// 来源: 07-archive/会议纪要 (20260501)/compass.html

export interface CompassNode {
  name: string;
  kind: 'main' | 'branch' | 'drift';
  share: number;            // 占比 (% 整数)
  cx: number;
  cy: number;
  r: number;
}

export const COMPASS_NODES: CompassNode[] = [
  // 主线
  { name: 'Halycon', kind: 'main', share: 35, cx: 300, cy: 160, r: 22 },
  { name: 'Beacon', kind: 'main', share: 18, cx: 380, cy: 220, r: 18 },
  // 支线
  { name: 'Stellar', kind: 'branch', share: 22, cx: 220, cy: 220, r: 16 },
  { name: 'Echo', kind: 'branch', share: 8, cx: 440, cy: 160, r: 14 },
  // 漂移
  { name: 'Crucible', kind: 'drift', share: 11, cx: 280, cy: 370, r: 14 },
  { name: 'Pyre', kind: 'drift', share: 6, cx: 380, cy: 380, r: 12 },
];

export interface DriftCard {
  name: string;
  delta: string;
  text: string;
  warn?: boolean;
}

export const DRIFT_CARDS: DriftCard[] = [
  {
    name: 'Crucible 救火',
    delta: '+8% ↑',
    text: '原本只占 3% 注意力,本周冲到 11% — 主线被稀释',
  },
  {
    name: 'Stellar 估值反复',
    delta: '+5% →',
    text: '分歧未结晶,会议时长第三周连续上升',
    warn: true,
  },
  {
    name: 'LP 沟通延迟',
    delta: '未出现 ⊘',
    text: '林雾 3 次问退出路径,本周仍未排进议程',
    warn: true,
  },
];

export const TIME_PIE = {
  total: 38,
  main: 53,        // %
  branch: 30,      // %
  firefighting: 17, // %
  warning: '上周救火 9% → 本周 17%。Crucible 创始人失联拉走太多注意力 — 该按"3 周失联法则"处理。',
};

export const ATLAS_STATS = {
  active: 8,
  danger: 2,
  warn: 3,
  healthy: 2,
};
