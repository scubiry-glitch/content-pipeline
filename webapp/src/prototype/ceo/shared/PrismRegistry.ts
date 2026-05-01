// 六棱镜 / 六房间元数据 — 单一数据源
// 来源: 07-archive/会议纪要 (20260501)/world-shell.jsx PRISM_ROOMS
// 任何前端组件需要房间属性（颜色、问题、指标）时统一从这里读

export interface PrismRoom {
  id: 'direction' | 'board' | 'coord' | 'team' | 'ext' | 'self';
  slug: 'compass' | 'boardroom' | 'tower' | 'war-room' | 'situation' | 'balcony';
  icon: string;
  label: string;
  room: string;
  tone: string;
  bg: string;
  ink: string;
  question: string;
  visual: string;
  metric: { label: string; value: string; delta: string };
}

export const PRISM_ROOMS: PrismRoom[] = [
  {
    id: 'direction', slug: 'compass',
    icon: '🧭', label: '方向', room: 'Compass',
    tone: '#7BA7C4', bg: '#F4F1EC', ink: '#1A2E3D',
    question: '我把时间花在战略主线上了吗?',
    visual: '星盘/指南针',
    metric: { label: '战略对齐度', value: '0.72', delta: '+0.04' },
  },
  {
    id: 'board', slug: 'boardroom',
    icon: '🏛️', label: '董事会', room: 'Boardroom',
    tone: '#C8A15C', bg: '#1A1410', ink: '#F3ECDD',
    question: '下次董事会我要带什么?',
    visual: '金线圆桌',
    metric: { label: '前瞻占比', value: '58%', delta: '+12%' },
  },
  {
    id: 'coord', slug: 'tower',
    icon: '🎯', label: '协调', room: 'Tower',
    tone: '#4ADE80', bg: '#0A1410', ink: '#C8E1D2',
    question: '谁欠谁什么? 卡在哪?',
    visual: '雷达扫描',
    metric: { label: '责任清晰度', value: '78%', delta: '-3%' },
  },
  {
    id: 'team', slug: 'war-room',
    icon: '⚔️', label: '团队', room: 'War Room',
    tone: '#D64545', bg: '#1A0E0E', ink: '#F5D9D9',
    question: '团队健康吗? 有建设性冲突吗?',
    visual: '阵型力场',
    metric: { label: '阵型健康', value: '72', delta: '+5' },
  },
  {
    id: 'ext', slug: 'situation',
    icon: '🌐', label: '各方', room: 'Situation',
    tone: '#FFC857', bg: '#0E1428', ink: '#FDF3D4',
    question: '外部世界怎么看我?',
    visual: '世界热力',
    metric: { label: '覆盖度', value: '3/4', delta: '缺监管' },
  },
  {
    id: 'self', slug: 'balcony',
    icon: '🧘', label: '个人', room: 'Balcony',
    tone: '#D9B88E', bg: '#0F0E15', ink: '#E8E3D8',
    question: '我还是我想成为的那个 CEO 吗?',
    visual: '云月远山',
    metric: { label: '本周 ROI', value: '0.64', delta: '-0.08' },
  },
];

export function findRoomBySlug(slug: string): PrismRoom | undefined {
  return PRISM_ROOMS.find((r) => r.slug === slug);
}
