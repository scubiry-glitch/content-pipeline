// 3 个预设策略组合 — UI 勾选用
// lite: 最少 LLM 调用，适合日常批量
// standard: 引入案例锚定 + 校准 + 心智模型轮询
// max: 全量 12 策略堆叠

import type { StrategyMapping } from './types.js';

export type PresetId = 'lite' | 'standard' | 'max';

export interface PresetCombo {
  id: PresetId;
  name: string;
  desc: string;
  mapping: StrategyMapping;
}

export const PRESET_COMBOS: Record<PresetId, PresetCombo> = {
  lite: {
    id: 'lite',
    name: '精简模式',
    desc: '单专家 + 失效自检 + EMM 校验（最少 LLM 调用，适合日常批量）',
    mapping: {
      '⑩insights':          'failure_check|emm_iterative|single',
      '⑫consensus':         'failure_check|emm_iterative|single',
      '⑬controversy':       'failure_check|emm_iterative|single',
      '⑭beliefEvolution':   'failure_check|single',
      '①topic-enrich':      'failure_check|single',
      'step3-fact-review':  'failure_check|emm_iterative|single',
      'step5-synthesis':    'failure_check|emm_iterative|single',
    },
  },
  standard: {
    id: 'standard',
    name: '深度模式',
    desc: '引入案例锚定 + 校准 + 心智模型轮询；争议走多专家辩论',
    mapping: {
      '⑩insights':          'calibrated_confidence|failure_check|signature_style|mental_model_rotation',
      '⑫consensus':         'calibrated_confidence|contradictions_surface|emm_iterative|debate',
      '⑬controversy':       'evidence_anchored|emm_iterative|contradictions_surface|debate',
      '⑭beliefEvolution':   'track_record_verify|evidence_anchored|single',
      '①topic-enrich':      'knowledge_grounded|failure_check|signature_style|single',
      'step3-fact-review':  'calibrated_confidence|failure_check|emm_iterative|single',
      'step5-synthesis':    'calibrated_confidence|evidence_anchored|signature_style|mental_model_rotation',
    },
  },
  max: {
    id: 'max',
    name: '极致模式',
    desc: '全量 12 策略堆叠；慢 5-8 倍，但每条产出都带专家 DNA',
    mapping: {
      '⑩insights':          'calibrated_confidence|evidence_anchored|knowledge_grounded|failure_check|contradictions_surface|signature_style|rubric_anchored_output|mental_model_rotation',
      '⑫consensus':         'calibrated_confidence|track_record_verify|contradictions_surface|signature_style|emm_iterative|debate',
      '⑬controversy':       'calibrated_confidence|evidence_anchored|knowledge_grounded|contradictions_surface|signature_style|emm_iterative|debate',
      '⑭beliefEvolution':   'track_record_verify|evidence_anchored|knowledge_grounded|contradictions_surface|signature_style|mental_model_rotation',
      '①topic-enrich':      'knowledge_grounded|evidence_anchored|failure_check|signature_style|rubric_anchored_output|heuristic_trigger_first',
      'step3-fact-review':  'calibrated_confidence|knowledge_grounded|failure_check|emm_iterative|heuristic_trigger_first',
      'step5-synthesis':    'calibrated_confidence|evidence_anchored|contradictions_surface|signature_style|rubric_anchored_output|mental_model_rotation',
    },
  },
};

export const DEFAULT_PRESET: PresetId = 'standard';

/** 无显式配置时的最终兜底 */
export const FALLBACK_SPEC = 'single';
