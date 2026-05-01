// Panorama · 全景画板 service
// 聚合 6 房间 metric + 5 组步骤完成度（PR12 LLM 接通后从 mn_runs(module='ceo') 计数）
// + 4 源 + 12+ 产出 总览
//
// 重构 (改动六)：SOURCES / OUTPUTS 改为从 axes/registry 派生，消除与
// _panoramaApi.ts 双写硬编码；STEP_GROUPS 增加 stageCounts 字段映射 L1/L2 DAG。

import type { CeoEngineDeps, PrismKind } from '../types.js';
import { computeAlignmentScore } from '../rooms/compass/aggregator.js';
import { computeForwardPct } from '../rooms/boardroom/aggregator.js';
import { computeResponsibilityClarity } from '../rooms/tower/aggregator.js';
import { computeFormationHealth } from '../rooms/war-room/aggregator.js';
import { computeCoverage } from '../rooms/situation/aggregator.js';
import { computeWeeklyRoi } from '../rooms/balcony/aggregator.js';
import { ALL_PRODUCES, ALL_CONSUMES } from '../../meeting-notes/axes/registry.js';

export interface PanoramaData {
  prisms: Array<{
    id: PrismKind;
    icon: string;
    label: string;
    color: string;
    room: string;
    metric: { label: string; value: string };
    sector: { source: string; step: string; output: string; app: string };
  }>;
  stepGroups: Array<{
    id: 'g1' | 'g2' | 'g3' | 'g4' | 'g5';
    label: string;
    sub: string;
    members: string;
    runCount: number; // PR12 接 mn_runs(module='ceo' AND axis='gN')
    /** 改动六：拆 L1/L2 stage 计数（来自 mn_runs.stage） */
    stageCounts?: { L1: number; L2: number };
  }>;
  sources: Array<{ id: string; label: string; sub: string }>;
  outputs: string[];
  meta: {
    sourceCount: number;
    stepGroupCount: number;
    outputCount: number;
    prismCount: number;
  };
}

const PRISM_DEFS: Array<{
  id: PrismKind;
  icon: string;
  label: string;
  color: string;
  room: string;
  sector: { source: string; step: string; output: string; app: string };
}> = [
  {
    id: 'direction', icon: '🧭', label: '方向', color: '#7BA7C4', room: 'Compass',
    sector: { source: '历史纪要', step: '跨会联动', output: '一页纸摘要', app: '战略对齐度 / 破坏浣熊' },
  },
  {
    id: 'board', icon: '🏛️', label: '董事会', color: '#C8A15C', room: 'Boardroom',
    sector: { source: '专家库', step: '外脑批注', output: '外脑批注资产', app: '董事关切雷达 / 预读包' },
  },
  {
    id: 'coord', icon: '🎯', label: '协调', color: '#7FD6A0', room: 'Tower',
    sector: { source: '会议原材料', step: '实体 & 承诺抽取', output: '承诺清单', app: '责任盘点 / 会后 10 分钟卡' },
  },
  {
    id: 'team', icon: '⚔️', label: '团队', color: '#E6A6A6', room: 'War Room',
    sector: { source: '会议原材料', step: '矛盾识别', output: '盲区档案', app: '阵型 / 兵棋推演' },
  },
  {
    id: 'ext', icon: '🌐', label: '各方', color: '#A8A0D9', room: 'Situation',
    sector: { source: '内容库 assets', step: 'Rubric 评分', output: 'Rubric 矩阵', app: '利益相关方热力图' },
  },
  {
    id: 'self', icon: '🧘', label: '个人', color: '#D9B88E', room: 'Balcony',
    sector: { source: '历史纪要', step: '棱镜聚合', output: '六棱镜指标', app: '时间 ROI / 阳台时光' },
  },
];

const STEP_GROUPS: PanoramaData['stepGroups'] = [
  { id: 'g1', label: 'ASR & 实体', sub: '转写 · diarize · 承诺抽取', members: '01·02', runCount: 0 },
  { id: 'g2', label: '评分 & 信念', sub: 'Rubric · 信念提取', members: '03·04·05', runCount: 0 },
  { id: 'g3', label: '矛盾 & 专家', sub: '自认/外识 · 互补专家匹配', members: '06·07·08', runCount: 0 },
  { id: 'g4', label: '跨会 & 批注', sub: 'rehash · 外脑批注生成', members: '09·10', runCount: 0 },
  { id: 'g5', label: '棱镜聚合', sub: '六面指标合成', members: '11', runCount: 0 },
];

// 改动六：SOURCES / OUTPUTS 不再硬编码，由 axes/registry 反向聚合派生。
// SOURCES 的 sub 描述 (录音/录像/RSS 等) 与 axis 无关，在这里维护一份 label→sub 字典。
const SOURCE_SUB: Record<string, { id: string; sub: string }> = {
  '会议原材料':    { id: 'src-rec',  sub: '录音 / 录像 / 文档' },
  '内容库 assets': { id: 'src-lib',  sub: 'RSS · 手动 · 深度分析' },
  '专家库':        { id: 'src-exp',  sub: 'S 级 · 心智模型' },
  '历史纪要':      { id: 'src-hist', sub: '信念 · 决策链' },
};

// CEO 全局产物（不属于 mn axes 但在 panorama 时间轴上可见）：
// 由 ceo runHandlers (g1..g5) 产出，axes/registry 无法表达，独立维护
const CEO_PRODUCES = [
  '转写',           // g1 ASR
  'rehash 指数',    // g4 跨会
  '外脑批注',       // g4 外脑
  '六棱镜指标',     // g5 棱镜聚合
  '一页纸摘要',     // g5 简报
];

const SOURCES = ALL_CONSUMES.map((label) => ({
  id: SOURCE_SUB[label]?.id ?? `src-${label.replace(/\s+/g, '-')}`,
  label,
  sub: SOURCE_SUB[label]?.sub ?? '',
}));

// 合并 mn axes 产物 + CEO 自己的产物，按出现顺序去重
const OUTPUTS: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  // ALL_PRODUCES 顺序优先（mn axes）
  for (const p of ALL_PRODUCES) {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  // CEO 全局产物补到末尾
  for (const p of CEO_PRODUCES) {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
})();

export async function getPanoramaData(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<PanoramaData> {
  // 6 房间指标并行计算
  const [alignment, forwardPct, respClarity, formHealth, cov, roi] = await Promise.all([
    computeAlignmentScore(deps, scopeId),
    computeForwardPct(deps, scopeId),
    computeResponsibilityClarity(deps, scopeId),
    computeFormationHealth(deps, scopeId),
    computeCoverage(deps, scopeId),
    computeWeeklyRoi(deps),
  ]);

  const metricByPrism: Record<PrismKind, { label: string; value: string }> = {
    direction: { label: '战略对齐度', value: alignment.toFixed(2) },
    board: { label: '前瞻占比', value: `${(forwardPct * 100).toFixed(0)}%` },
    coord: { label: '责任清晰度', value: `${(respClarity * 100).toFixed(0)}%` },
    team: { label: '阵型健康', value: `${(formHealth * 100).toFixed(0)}` },
    ext: { label: '覆盖度', value: `${cov.covered}/${cov.total}` },
    self: { label: '本周 ROI', value: roi.toFixed(2) },
  };

  // 5 组步骤的 run 数（按 module='ceo' 分组）+ DAG stage 拆分（mn module）
  const stepGroups = STEP_GROUPS.map((g) => ({ ...g, stageCounts: { L1: 0, L2: 0 } }));
  try {
    const r = await deps.db.query(
      `SELECT axis, COUNT(*)::int AS n
         FROM mn_runs
        WHERE module = 'ceo'
          AND axis IN ('g1','g2','g3','g4','g5')
        GROUP BY axis`,
    );
    const cnt = new Map<string, number>();
    for (const row of r.rows) cnt.set(row.axis, Number(row.n));
    for (const g of stepGroups) g.runCount = cnt.get(g.id) ?? 0;
  } catch {
    // 模块未上线 / 无数据 — 保持 runCount=0
  }

  // 改动六：mn module 的 L1/L2 stage 计数 — 全 mn axes 总数，按 stage 分桶
  // 简化：把总数挂到 g1 (体征 ≈ L1) 和 g2 (聚合 ≈ L2)，让时间轴可染色显示 DAG 进度
  try {
    const r = await deps.db.query(
      `SELECT stage, COUNT(*)::int AS n
         FROM mn_runs
        WHERE module = 'mn' AND stage IS NOT NULL
        GROUP BY stage`,
    );
    let l1 = 0;
    let l2 = 0;
    for (const row of r.rows) {
      if (row.stage === 'L1_meeting') l1 = Number(row.n);
      else if (row.stage === 'L2_aggregate') l2 = Number(row.n);
    }
    if (stepGroups[0]) stepGroups[0].stageCounts = { L1: l1, L2: 0 };
    if (stepGroups[1]) stepGroups[1].stageCounts = { L1: 0, L2: l2 };
  } catch {
    // 024 migration 未跑 / 无数据 — stageCounts 保持 0
  }

  return {
    prisms: PRISM_DEFS.map((p) => ({
      ...p,
      metric: metricByPrism[p.id],
    })),
    stepGroups,
    sources: SOURCES,
    outputs: OUTPUTS,
    meta: {
      sourceCount: SOURCES.length,
      stepGroupCount: STEP_GROUPS.length,
      outputCount: OUTPUTS.length,
      prismCount: PRISM_DEFS.length,
    },
  };
}
