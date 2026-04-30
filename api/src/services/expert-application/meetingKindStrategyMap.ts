// 会议纪要 meetingKind → ExpertStrategySpec 映射
//
// 背景：Round 2 引入的 expert-application 模块提供 4 基础策略 + 9 装饰器，
// 以 "decorator1|decorator2|base" 字符串表达"本次专家调用用到哪些字段"。
// 会议纪要采集渠道按 meetingKind 选取不同组合，避免把整个 ExpertProfile
// 塞进 prompt（字段过多 + 焦点漂移）。
//
// 下游用法：
//   const spec = resolveStrategyForMeeting(asset.metadata.meeting_kind);
//   if (spec) {
//     const resolver = createStrategyResolver(spec);
//     const strategy = resolver(deliverable);
//     await strategy.apply(ctx);
//   }
// internal_ops 走 lite preset 单专家轻量分析（evidence_anchored + calibrated_confidence
// + signature_style + single），让常规纪要能拿到 16 维 schema 数据；
// shouldSkipExpertAnalysis 改为按 strategy 是否 null 判断，以后再调整无需改两处。

import type { ExpertStrategySpec } from './types.js';

export type MeetingKind =
  | 'strategy_roadshow'
  | 'tech_review'
  | 'expert_interview'
  | 'industry_research'
  | 'internal_ops';

/**
 * 按 meetingKind 给出默认策略组合。
 *
 * 选字段的理由（见 plans/tidy-conjuring-panda.md §B3）：
 * - strategy_roadshow: 否决式决策 → debate + failureCheck (dealbreakers) +
 *   emmIterative (veto_rules) + rubricAnchoredOutput + calibratedConfidence
 * - tech_review: 方法论最重 → mental_model_rotation + 全家桶装饰
 * - expert_interview: 访谈对话 → single + contradictionsSurface (真实度) +
 *   knowledgeGrounded (RAG 访谈资料); 不开 EMM / rubrics
 * - industry_research: 归纳式 → heuristic_trigger_first + evidenceAnchored +
 *   knowledgeGrounded; 不开 EMM（否决过早收窄）
 * - internal_ops: lite 单专家 → evidenceAnchored + calibratedConfidence +
 *   signatureStyle + single; 周会/站会场景不需要 debate / EMM / mental_model_rotation,
 *   但需要决议附原文锚点 + 信心度 + 一致口吻
 */
export const MEETING_KIND_STRATEGY: Record<MeetingKind, ExpertStrategySpec | null> = {
  strategy_roadshow: {
    preset: 'standard',
    default:
      'failure_check|emm_iterative|rubric_anchored_output|calibrated_confidence|signature_style|debate',
  },
  tech_review: {
    preset: 'max',
    default:
      'failure_check|emm_iterative|evidence_anchored|rubric_anchored_output|track_record_verify|signature_style|mental_model_rotation',
  },
  expert_interview: {
    preset: 'lite',
    default:
      'contradictions_surface|calibrated_confidence|knowledge_grounded|signature_style|single',
  },
  industry_research: {
    preset: 'standard',
    default:
      'evidence_anchored|calibrated_confidence|knowledge_grounded|signature_style|heuristic_trigger_first',
  },
  internal_ops: {
    preset: 'lite',
    default: 'evidence_anchored|calibrated_confidence|signature_style|single',
  },
};

export function resolveStrategyForMeeting(
  kind: MeetingKind | string | undefined | null,
): ExpertStrategySpec | null {
  if (!kind) return null;
  return (MEETING_KIND_STRATEGY as Record<string, ExpertStrategySpec | null>)[kind] ?? null;
}

/** 路由层决定是否跳过整个专家分析链路。
 *  按 strategy 是否 null 判断，避免改了 MEETING_KIND_STRATEGY 但跳过逻辑不同步。
 *  unknown kind (undefined/null/未注册) 默认不跳过 — 让分析走完，安全侧。
 */
export function shouldSkipExpertAnalysis(kind: MeetingKind | string | undefined | null): boolean {
  if (!kind) return false;
  if (!(kind in MEETING_KIND_STRATEGY)) return false;
  return resolveStrategyForMeeting(kind) === null;
}
