// Panorama · 全景画板 service
// 聚合 6 房间 metric + 5 组步骤完成度（PR12 LLM 接通后从 mn_runs(module='ceo') 计数）
// + 4 源 + 12 产出 总览

import type { CeoEngineDeps, PrismKind } from '../types.js';
import { computeAlignmentScore } from '../rooms/compass/aggregator.js';
import { computeForwardPct } from '../rooms/boardroom/aggregator.js';
import { computeResponsibilityClarity } from '../rooms/tower/aggregator.js';
import { computeFormationHealth } from '../rooms/war-room/aggregator.js';
import { computeCoverage } from '../rooms/situation/aggregator.js';
import { computeWeeklyRoi } from '../rooms/balcony/aggregator.js';

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

const SOURCES = [
  { id: 'src-rec', label: '会议原材料', sub: '录音 / 录像 / 文档' },
  { id: 'src-lib', label: '内容库 assets', sub: 'RSS · 手动 · 深度分析' },
  { id: 'src-exp', label: '专家库', sub: 'S 级 · 心智模型' },
  { id: 'src-hist', label: '历史纪要', sub: '信念 · 决策链' },
];

const OUTPUTS = [
  '转写',
  '承诺清单',
  '张力清单',
  'Rubric 矩阵',
  '信念轨迹',
  '心智模型命中',
  '盲区档案',
  '互补专家组',
  'rehash 指数',
  '外脑批注',
  '六棱镜指标',
  '一页纸摘要',
];

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

  // 5 组步骤的 run 数（按 module='ceo' 分组）
  const stepGroups = [...STEP_GROUPS];
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
