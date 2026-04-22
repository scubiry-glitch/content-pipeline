// 观点演化 — 组合模式检测
// 输入 ContentBelief.history，输出可视化用的 EvolutionPattern 数组
// 纯函数模块，无 DB / LLM 依赖，便于单测

import type { BeliefHistoryEntry, BeliefStance } from '../types.js';

export type EvolutionPatternType =
  | 'correction'               // 纠偏组合
  | 'reinforcement'            // 趋势强化
  | 'risk_reversal'            // 风险反转
  | 'oscillation'              // 反复震荡
  | 'evidence_saturation'      // 证据饱和 / 已定论
  | 'staleness'                // 陈旧老化
  | 'emerging'                 // 弱信号涌现
  | 'bidirectional_buildup';   // 双向积累

export type PatternSeverity = 'info' | 'notice' | 'alert';

export interface EvolutionPattern {
  type: EvolutionPatternType;
  label: string;
  severity: PatternSeverity;
  windowStart: string;
  windowEnd: string;
  affectedStances: BeliefStance[];
  explanation: string;
}

export interface PatternDetectInput {
  history: BeliefHistoryEntry[];
  /** 当前支持/反对事实数（用于 bidirectional_buildup） */
  supportingFactCount?: number;
  contradictingFactCount?: number;
  /** 现在时间，用于老化检测；测试时可注入 */
  now?: Date;
}

export const PATTERN_THRESHOLDS = {
  correction: { windowDays: 30, confidenceDrop: 0.3 },
  reinforcement: { minConsecutive: 3, confidenceRise: 0.15 },
  risk_reversal: { confirmedPeak: 0.85 },
  oscillation: { windowDays: 60, minFlips: 2 },
  evidence_saturation: { stableDays: 90, confidenceFloor: 0.85 },
  staleness: { idleDays: 180 },
  emerging: { recentDays: 30, minConfidenceRise: 0.1 },
  bidirectional_buildup: { minEachSide: 2 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

const STANCE_POLARITY: Record<BeliefStance, number> = {
  confirmed: 1,
  evolving: 0,
  disputed: -1,
  refuted: -2,
};

function sortedHistory(history: BeliefHistoryEntry[]): BeliefHistoryEntry[] {
  return [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function daysBetween(a: Date | string, b: Date | string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;
}

function iso(d: Date | string): string {
  return new Date(d).toISOString();
}

export function detectEvolutionPatterns(input: PatternDetectInput): EvolutionPattern[] {
  const history = sortedHistory(input.history || []);
  if (history.length === 0) return [];
  const now = input.now ?? new Date();
  const patterns: EvolutionPattern[] = [];

  const first = history[0];
  const last = history[history.length - 1];
  const peakConfidence = history.reduce((m, h) => Math.max(m, Number(h.confidence) || 0), 0);

  // 1. risk_reversal — 历史曾 confirmed（置信 ≥ 峰值阈值），之后出现 disputed/refuted
  const peakIdx = history.findIndex(
    h => Number(h.confidence) >= PATTERN_THRESHOLDS.risk_reversal.confirmedPeak && h.stance === 'confirmed',
  );
  if (peakIdx >= 0) {
    const after = history.slice(peakIdx + 1);
    const reversalIdx = after.findIndex(h => h.stance === 'disputed' || h.stance === 'refuted');
    if (reversalIdx >= 0) {
      const reversal = after[reversalIdx];
      patterns.push({
        type: 'risk_reversal',
        label: '风险反转',
        severity: 'alert',
        windowStart: iso(history[peakIdx].timestamp),
        windowEnd: iso(reversal.timestamp),
        affectedStances: ['confirmed', reversal.stance],
        explanation: `曾达到已确认（置信 ${Number(history[peakIdx].confidence).toFixed(2)}），后被${reversal.stance === 'refuted' ? '推翻' : '争议'}（${reversal.reason || '原因未记录'}）`,
      });
    }
  }

  // 2. correction — 短时间窗口内 evolving|confirmed → refuted，且 confidence 显著下降
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (
      (prev.stance === 'evolving' || prev.stance === 'confirmed') &&
      cur.stance === 'refuted' &&
      daysBetween(prev.timestamp, cur.timestamp) <= PATTERN_THRESHOLDS.correction.windowDays &&
      Number(prev.confidence) - Number(cur.confidence) >= PATTERN_THRESHOLDS.correction.confidenceDrop
    ) {
      patterns.push({
        type: 'correction',
        label: '纠偏组合',
        severity: 'notice',
        windowStart: iso(prev.timestamp),
        windowEnd: iso(cur.timestamp),
        affectedStances: [prev.stance, cur.stance],
        explanation: `${Math.round(daysBetween(prev.timestamp, cur.timestamp))} 天内立场从 ${prev.stance} 修正为 refuted，置信 ${Number(prev.confidence).toFixed(2)}→${Number(cur.confidence).toFixed(2)}`,
      });
      break;
    }
  }

  // 3. reinforcement — 连续 ≥ N 条同向条目且 confidence 单调上升且累计涨幅达到阈值
  {
    let runStart = 0;
    for (let i = 1; i <= history.length; i++) {
      const atEnd = i === history.length;
      const sameStance = !atEnd && history[i].stance === history[i - 1].stance;
      const rising = !atEnd && Number(history[i].confidence) >= Number(history[i - 1].confidence);
      if (sameStance && rising) continue;

      const runLen = i - runStart;
      if (runLen >= PATTERN_THRESHOLDS.reinforcement.minConsecutive) {
        const rise = Number(history[i - 1].confidence) - Number(history[runStart].confidence);
        if (rise >= PATTERN_THRESHOLDS.reinforcement.confidenceRise) {
          patterns.push({
            type: 'reinforcement',
            label: '趋势强化',
            severity: 'info',
            windowStart: iso(history[runStart].timestamp),
            windowEnd: iso(history[i - 1].timestamp),
            affectedStances: [history[runStart].stance],
            explanation: `连续 ${runLen} 条同向记录（${history[runStart].stance}），置信累计上升 ${rise.toFixed(2)}`,
          });
        }
      }
      runStart = i;
    }
  }

  // 4. oscillation — 窗口内 ≥ N 次方向相反跳变
  {
    const windowDays = PATTERN_THRESHOLDS.oscillation.windowDays;
    let flips = 0;
    let windowStartIdx = 0;
    for (let i = 1; i < history.length; i++) {
      while (
        windowStartIdx < i &&
        daysBetween(history[windowStartIdx].timestamp, history[i].timestamp) > windowDays
      ) {
        windowStartIdx++;
      }
      const prevSign = Math.sign(
        STANCE_POLARITY[history[i].stance] - STANCE_POLARITY[history[i - 1].stance],
      );
      const prevPrevSign = i >= 2
        ? Math.sign(STANCE_POLARITY[history[i - 1].stance] - STANCE_POLARITY[history[i - 2].stance])
        : 0;
      if (prevSign !== 0 && prevPrevSign !== 0 && prevSign === -prevPrevSign) {
        flips++;
      }
    }
    if (flips >= PATTERN_THRESHOLDS.oscillation.minFlips) {
      patterns.push({
        type: 'oscillation',
        label: '反复震荡',
        severity: 'notice',
        windowStart: iso(first.timestamp),
        windowEnd: iso(last.timestamp),
        affectedStances: Array.from(new Set(history.map(h => h.stance))),
        explanation: `窗口内发生 ${flips} 次方向相反的立场跳变，认知尚未稳定`,
      });
    }
  }

  // 5. evidence_saturation — confidence 长期 ≥ 阈值且立场未变
  {
    const floor = PATTERN_THRESHOLDS.evidence_saturation.confidenceFloor;
    const stableDays = PATTERN_THRESHOLDS.evidence_saturation.stableDays;
    let saturationStart: BeliefHistoryEntry | null = null;
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (h.stance === 'confirmed' && Number(h.confidence) >= floor) {
        if (!saturationStart) saturationStart = h;
      } else {
        saturationStart = null;
      }
    }
    if (
      saturationStart &&
      last.stance === 'confirmed' &&
      Number(last.confidence) >= floor &&
      daysBetween(saturationStart.timestamp, last.timestamp) >= stableDays
    ) {
      patterns.push({
        type: 'evidence_saturation',
        label: '证据饱和',
        severity: 'info',
        windowStart: iso(saturationStart.timestamp),
        windowEnd: iso(last.timestamp),
        affectedStances: ['confirmed'],
        explanation: `已确认立场稳定 ${Math.round(daysBetween(saturationStart.timestamp, last.timestamp))} 天（置信 ≥${floor}），可放心引用`,
      });
    }
  }

  // 6. staleness — 最后变更距今过久且未 refuted
  if (
    last.stance !== 'refuted' &&
    daysBetween(last.timestamp, now) >= PATTERN_THRESHOLDS.staleness.idleDays
  ) {
    patterns.push({
      type: 'staleness',
      label: '陈旧老化',
      severity: 'notice',
      windowStart: iso(last.timestamp),
      windowEnd: iso(now),
      affectedStances: [last.stance],
      explanation: `最后一次变更距今 ${Math.round(daysBetween(last.timestamp, now))} 天，缺乏新证据，建议复验`,
    });
  }

  // 7. emerging — 第一次记录在近期且 evolving 且 confidence 上升
  if (
    history.length >= 2 &&
    daysBetween(first.timestamp, now) <= PATTERN_THRESHOLDS.emerging.recentDays &&
    last.stance === 'evolving' &&
    Number(last.confidence) - Number(first.confidence) >= PATTERN_THRESHOLDS.emerging.minConfidenceRise
  ) {
    patterns.push({
      type: 'emerging',
      label: '弱信号涌现',
      severity: 'info',
      windowStart: iso(first.timestamp),
      windowEnd: iso(last.timestamp),
      affectedStances: ['evolving'],
      explanation: `命题进入系统 ${Math.round(daysBetween(first.timestamp, now))} 天内，置信由 ${Number(first.confidence).toFixed(2)} 升至 ${Number(last.confidence).toFixed(2)}，值得持续关注`,
    });
  }

  // 8. bidirectional_buildup — 支持/反对事实同时增长
  if (
    (input.supportingFactCount ?? 0) >= PATTERN_THRESHOLDS.bidirectional_buildup.minEachSide &&
    (input.contradictingFactCount ?? 0) >= PATTERN_THRESHOLDS.bidirectional_buildup.minEachSide
  ) {
    patterns.push({
      type: 'bidirectional_buildup',
      label: '双向积累',
      severity: 'notice',
      windowStart: iso(first.timestamp),
      windowEnd: iso(last.timestamp),
      affectedStances: Array.from(new Set(history.map(h => h.stance))),
      explanation: `支持事实 ${input.supportingFactCount} 条与反对事实 ${input.contradictingFactCount} 条同时增长，争议正在成形`,
    });
  }

  // 保证 alert 优先、notice 次之、info 最后
  const sevOrder: Record<PatternSeverity, number> = { alert: 0, notice: 1, info: 2 };
  patterns.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  return patterns;
}

/** 计算相邻两条 history 的 confidence 变化，用于时间线渲染 */
export function buildConfidenceDeltas(history: BeliefHistoryEntry[]): number[] {
  const sorted = sortedHistory(history);
  return sorted.map((h, i) =>
    i === 0 ? 0 : Number(h.confidence) - Number(sorted[i - 1].confidence),
  );
}
