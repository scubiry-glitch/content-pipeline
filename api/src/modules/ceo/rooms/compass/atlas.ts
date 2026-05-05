// Project Atlas — Compass 子房间
// 复用 ceo_strategic_lines 作为"项目星图"数据源
// 把 alignment_score → 健康色 / kind → 距中心远近 / 名字长度 → 半径

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export interface AtlasStar {
  id: string;
  name: string;
  kind: 'main' | 'branch' | 'drift';
  alignmentScore: number | null;
  /** 健康度: healthy / warn / danger / silent */
  health: 'healthy' | 'warn' | 'danger' | 'silent';
  /** SVG 坐标 (viewBox 0 0 600 500) */
  cx: number;
  cy: number;
  r: number;
  /** 风险评分 0..1 (越高越危险) */
  risk: number;
}

export interface DangerCard {
  name: string;
  riskScore: number;
  trend: 'up' | 'flat' | 'down';
  signals: Array<{ tag: string; severity: 'crit' | 'warn' | 'info' }>;
  text: string;
}

const HEALTH_COLOR: Record<AtlasStar['health'], string> = {
  healthy: '#4FB3A9',
  warn: '#E8A547',
  danger: '#D85A5A',
  silent: 'rgba(180,180,180,0.5)',
};

function classifyHealth(score: number | null, status: string): AtlasStar['health'] {
  if (status === 'paused' || status === 'retired') return 'silent';
  if (score == null) return 'silent';
  if (score >= 0.7) return 'healthy';
  if (score >= 0.4) return 'warn';
  return 'danger';
}

/**
 * 给定线列表，分配 SVG 坐标
 * - main: 中心带 (距中心 60-130)
 * - branch: 中环 (130-200)
 * - drift: 外环 (200-260)
 * - 按 kind 内顺序在同心圆上等距分布
 */
function layoutStars(
  lines: Array<{ id: string; name: string; kind: string; alignment_score: number | null; status: string }>,
): AtlasStar[] {
  const cx0 = 300;
  const cy0 = 250;
  const groups: Record<string, typeof lines> = { main: [], branch: [], drift: [] };
  for (const l of lines) {
    if (l.kind in groups) groups[l.kind].push(l);
  }
  const radii: Record<string, number> = { main: 90, branch: 165, drift: 230 };
  const startAngles: Record<string, number> = { main: -45, branch: -135, drift: 45 };

  const result: AtlasStar[] = [];
  for (const kind of ['main', 'branch', 'drift'] as const) {
    const arr = groups[kind];
    const total = arr.length;
    arr.forEach((l, i) => {
      const baseAngle = startAngles[kind];
      const span = total > 1 ? 90 : 0; // 同 kind 项目铺在 90° 内
      const angle = baseAngle + (total > 1 ? (span * i) / (total - 1) : 0);
      const rad = (angle * Math.PI) / 180;
      const distance = radii[kind];
      const cx = cx0 + distance * Math.cos(rad);
      const cy = cy0 + distance * Math.sin(rad);
      const score = l.alignment_score ?? null;
      const health = classifyHealth(score, l.status);
      // 半径基于 kind: main 大, branch 中, drift 小
      const baseR = kind === 'main' ? 26 : kind === 'branch' ? 18 : 14;
      // Risk = 1 - alignment_score (限 0..1); silent → 0.4 中性
      const risk = score == null ? 0.4 : Number((1 - score).toFixed(2));
      result.push({
        id: l.id,
        name: l.name,
        kind: kind as AtlasStar['kind'],
        alignmentScore: score,
        health,
        cx: Math.round(cx),
        cy: Math.round(cy),
        r: baseR,
        risk,
      });
    });
  }
  return result;
}

export async function getProjectAtlas(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<{
  stars: AtlasStar[];
  legend: Array<{ label: string; color: string }>;
  dangerBoard: DangerCard[];
  meta: { total: number; healthy: number; warn: number; danger: number; silent: number };
}> {
  const r = await deps.db.query(
    `SELECT id::text, name, kind, alignment_score, status, description
       FROM ceo_strategic_lines
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND ${wsFilterClause(2)}
      ORDER BY kind, alignment_score DESC NULLS LAST`,
    [scopeId ?? null, workspaceId],
  );
  const stars = layoutStars(r.rows);

  const meta = {
    total: stars.length,
    healthy: stars.filter((s) => s.health === 'healthy').length,
    warn: stars.filter((s) => s.health === 'warn').length,
    danger: stars.filter((s) => s.health === 'danger').length,
    silent: stars.filter((s) => s.health === 'silent').length,
  };

  // 危险榜：按 risk 倒序前 5
  const dangerBoard: DangerCard[] = stars
    .slice()
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 5)
    .map((s) => {
      const signals: DangerCard['signals'] = [];
      if (s.kind === 'drift') signals.push({ tag: '注意力流失', severity: 'warn' });
      if (s.health === 'danger') {
        signals.push({ tag: '承诺-行动差距', severity: 'crit' });
        signals.push({ tag: '信念背离', severity: 'crit' });
      } else if (s.health === 'warn') {
        signals.push({ tag: '信念一致性 ↓', severity: 'warn' });
      } else if (s.health === 'silent') {
        signals.push({ tag: '长期沉默', severity: 'info' });
      }
      return {
        name: s.name,
        riskScore: s.risk,
        trend: s.kind === 'drift' ? 'up' : 'flat',
        signals,
        text:
          s.kind === 'drift'
            ? `已连续 5 周未在 IC 议程出现 · 距核心战略 ${s.risk.toFixed(2)}`
            : s.health === 'danger'
            ? '风险值持续偏高 — 评估处置 (止损 / 重组 / 安乐死)'
            : '风险监控中',
      };
    });

  const legend = [
    { label: '健康', color: HEALTH_COLOR.healthy },
    { label: '预警', color: HEALTH_COLOR.warn },
    { label: '危险', color: HEALTH_COLOR.danger },
    { label: '沉默/边缘', color: HEALTH_COLOR.silent },
  ];

  return { stars, legend, dangerBoard, meta };
}
