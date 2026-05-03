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

// pg numeric/decimal 列经常以 string 形式返回 ("0.82" 而非 0.82)，
// 直接 .toFixed() 会抛 "is not a function"。统一在边界处强转为 number。
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeAtlas(raw: unknown): AtlasData {
  const r = (raw ?? {}) as Partial<AtlasData>;
  const stars: AtlasStar[] = Array.isArray(r.stars) ? r.stars.map((s: any) => ({
    id: String(s?.id ?? ''),
    name: String(s?.name ?? ''),
    kind: (s?.kind ?? 'main') as AtlasStar['kind'],
    alignmentScore: toNumOrNull(s?.alignmentScore),
    health: (s?.health ?? 'silent') as AtlasStar['health'],
    cx: toNum(s?.cx),
    cy: toNum(s?.cy),
    r: toNum(s?.r),
    risk: toNum(s?.risk),
  })) : ATLAS_FALLBACK.stars;
  const dangerBoard: DangerCard[] = Array.isArray(r.dangerBoard) ? r.dangerBoard.map((c: any) => ({
    name: String(c?.name ?? ''),
    riskScore: toNum(c?.riskScore),
    trend: (c?.trend ?? 'flat') as DangerCard['trend'],
    signals: Array.isArray(c?.signals) ? c.signals : [],
    text: String(c?.text ?? ''),
  })) : ATLAS_FALLBACK.dangerBoard;
  const meta = r.meta ?? ATLAS_FALLBACK.meta;
  const legend = Array.isArray(r.legend) ? r.legend : ATLAS_FALLBACK.legend;
  return { stars, legend, dangerBoard, meta };
}

export async function fetchProjectAtlas(scopeId?: string): Promise<AtlasData> {
  try {
    const url = scopeId ? `/api/v1/ceo/compass/atlas?scopeId=${encodeURIComponent(scopeId)}` : '/api/v1/ceo/compass/atlas';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return normalizeAtlas(await res.json());
  } catch {
    return ATLAS_FALLBACK;
  }
}
