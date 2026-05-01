// Project Atlas 客户端 API + fallback

export interface AtlasStar {
  id: string;
  name: string;
  kind: 'main' | 'branch' | 'drift';
  alignmentScore: number | null;
  health: 'healthy' | 'warn' | 'danger' | 'silent';
  cx: number;
  cy: number;
  r: number;
  risk: number;
}

export interface DangerCard {
  name: string;
  riskScore: number;
  trend: 'up' | 'flat' | 'down';
  signals: Array<{ tag: string; severity: 'crit' | 'warn' | 'info' }>;
  text: string;
}

export interface AtlasData {
  stars: AtlasStar[];
  legend: Array<{ label: string; color: string }>;
  dangerBoard: DangerCard[];
  meta: { total: number; healthy: number; warn: number; danger: number; silent: number };
}

const FALLBACK_STARS: AtlasStar[] = [
  { id: 's1', name: 'Halycon',  kind: 'main',   alignmentScore: 0.82, health: 'healthy', cx: 364, cy: 186, r: 26, risk: 0.18 },
  { id: 's2', name: 'Beacon',   kind: 'main',   alignmentScore: 0.76, health: 'healthy', cx: 236, cy: 186, r: 26, risk: 0.24 },
  { id: 's3', name: 'Stellar',  kind: 'branch', alignmentScore: 0.62, health: 'warn',    cx: 138, cy: 308, r: 18, risk: 0.38 },
  { id: 's4', name: 'Echo',     kind: 'branch', alignmentScore: 0.58, health: 'warn',    cx: 462, cy: 308, r: 18, risk: 0.42 },
  { id: 's5', name: 'Crucible', kind: 'drift',  alignmentScore: 0.28, health: 'danger',  cx: 462, cy: 134, r: 14, risk: 0.72 },
  { id: 's6', name: 'Pyre',     kind: 'drift',  alignmentScore: 0.22, health: 'danger',  cx: 138, cy: 134, r: 14, risk: 0.78 },
];

export const ATLAS_FALLBACK: AtlasData = {
  stars: FALLBACK_STARS,
  legend: [
    { label: '健康', color: '#4FB3A9' },
    { label: '预警', color: '#E8A547' },
    { label: '危险', color: '#D85A5A' },
    { label: '沉默/边缘', color: 'rgba(180,180,180,0.5)' },
  ],
  dangerBoard: [
    { name: 'Pyre',     riskScore: 0.78, trend: 'up',   signals: [{ tag: '注意力流失', severity: 'warn' }, { tag: '承诺-行动差距', severity: 'crit' }, { tag: '信念背离', severity: 'crit' }], text: '风险值持续偏高 — 评估处置 (止损 / 重组 / 安乐死)' },
    { name: 'Crucible', riskScore: 0.72, trend: 'up',   signals: [{ tag: '注意力流失', severity: 'warn' }, { tag: '承诺-行动差距', severity: 'crit' }, { tag: '信念背离', severity: 'crit' }], text: '已连续 5 周未在 IC 议程出现 · 距核心战略 0.72' },
    { name: 'Echo',     riskScore: 0.42, trend: 'flat', signals: [{ tag: '信念一致性 ↓', severity: 'warn' }], text: '风险监控中' },
    { name: 'Stellar',  riskScore: 0.38, trend: 'flat', signals: [{ tag: '信念一致性 ↓', severity: 'warn' }], text: '风险监控中' },
    { name: 'Beacon',   riskScore: 0.24, trend: 'flat', signals: [], text: '风险监控中' },
  ],
  meta: { total: 6, healthy: 2, warn: 2, danger: 2, silent: 0 },
};

export async function fetchProjectAtlas(scopeId?: string): Promise<AtlasData> {
  try {
    const url = scopeId ? `/api/v1/ceo/compass/atlas?scopeId=${encodeURIComponent(scopeId)}` : '/api/v1/ceo/compass/atlas';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as AtlasData;
  } catch {
    return ATLAS_FALLBACK;
  }
}
