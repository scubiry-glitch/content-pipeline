// Expert Library Module — Core Type Definitions
// 独立模块，零外部依赖，所有外部服务通过 Adapter 接口注入

// ============================================================
// Adapter Interfaces (可插拔外部依赖)
// ============================================================

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

export interface LLMAdapter {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
  completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: 'text' | 'json';
}

export interface FileParserAdapter {
  parse(filePath: string): Promise<ParsedDocument>;
}

export interface ParsedDocument {
  text: string;
  metadata?: Record<string, any>;
  pages?: Array<{ pageNumber: number; text: string }>;
  slides?: Array<{ slideNumber: number; text: string; notes?: string; layout?: string }>;
}

export interface StorageAdapter {
  save(key: string, data: Buffer | string): Promise<string>;
  load(key: string): Promise<Buffer | null>;
}

/** 注入 ExpertEngine 的全部外部依赖 */
export interface ExpertLibraryDeps {
  db: DatabaseAdapter;
  llm: LLMAdapter;
  fileParser?: FileParserAdapter;
  storage?: StorageAdapter;
}

// ============================================================
// Expert Profile (专家数据结构)
// ============================================================

export interface ExpertProfile {
  expert_id: string;
  name: string;
  domain: string[];

  // ===== 人格层 (WHO) — 5层解构 =====
  persona: ExpertPersona;

  // ===== 方法层 (HOW) — 3层解构 =====
  method: ExpertMethod;

  // ===== EMM 门控规则 =====
  emm?: ExpertEMM;

  // ===== 约束 =====
  constraints: {
    must_conclude: boolean;
    allow_assumption: boolean;
  };

  // ===== 输出格式 =====
  output_schema: {
    format: string;
    sections: string[];
    rubrics?: EvaluationRubric[];  // 透明评估量表
  };

  anti_patterns: string[];
  signature_phrases: string[];
}

// ----- Persona 人格层 -----

export interface ExpertPersona {
  // 基础接口（必填）
  style: string;
  tone: string;
  bias: string[];

  // 深度人格（可选，逐步补充）
  cognition?: {
    mentalModel: string;
    decisionStyle: string;
    riskAttitude: string;
    timeHorizon: string;
  };
  values?: {
    excites: string[];
    irritates: string[];
    qualityBar: string;
    dealbreakers: string[];
  };
  taste?: {
    admires: string[];
    disdains: string[];
    benchmark: string;
  };
  voice?: {
    disagreementStyle: string;
    praiseStyle: string;
  };
  blindSpots?: {
    knownBias: string[];
    weakDomains: string[];
    selfAwareness: string;
  };
}

// ----- Method 方法层 -----

export interface ExpertMethod {
  // 基础接口（必填）
  frameworks: string[];
  reasoning: string;
  analysis_steps: string[];

  // 深度方法论（可选）
  reviewLens?: {
    firstGlance: string;
    deepDive: string[];
    killShot: string;
    bonusPoints: string[];
  };
  dataPreference?: string;
  evidenceStandard?: string;
}

// ----- EMM 门控 -----

export interface ExpertEMM {
  critical_factors: string[];
  factor_hierarchy: Record<string, number>;
  veto_rules: string[];
  aggregation_logic: 'weighted_score' | 'majority_vote' | 'strictest' | string;
}

// ----- 透明评估量表 -----

export interface EvaluationRubric {
  dimension: string;           // "论证质量" | "封面吸引力"
  levels: RubricLevel[];
}

export interface RubricLevel {
  score: number;               // 1-5
  description: string;         // 客观可检验的准则
}

// ============================================================
// Request / Response (调用接口)
// ============================================================

export type TaskType = 'analysis' | 'evaluation' | 'generation';
export type InputType = 'text' | 'ppt' | 'image' | 'pdf' | 'video' | 'meeting_minutes';

export interface ExpertRequest {
  expert_id: string;
  task_type: TaskType;
  input_type: InputType;
  input_data: string;
  context?: string;
  params?: ExpertRequestParams;
}

export interface ExpertRequestParams {
  depth?: 'quick' | 'standard' | 'deep';
  methodology?: string;
  focus_areas?: string[];
  output_format?: string;
}

export interface ExpertResponse {
  expert_id: string;
  expert_name: string;
  task_type: string;
  output: {
    sections: OutputSection[];
  };
  metadata: {
    input_analysis: InputAnalysis;
    emm_result: EMMGateResult;
    confidence: number;
    processing_time_ms: number;
    invoke_id: string;
  };
}

export interface OutputSection {
  title: string;
  content: string;
}

// ============================================================
// Input Analysis (输入增强)
// ============================================================

export interface InputAnalysis {
  facts: string[];
  opinions: string[];
  conflicts: string[];
  hidden_assumptions: string[];
  data_points: string[];
  sentiment_shifts?: string[];
  source_quality: 'high' | 'medium' | 'low';
}

// ============================================================
// EMM Gate (门控结果)
// ============================================================

export interface EMMGateResult {
  passed: boolean;
  violation_cost: ViolationCost;
  veto_triggered: string[];       // 触发的否决规则
  factor_coverage: Record<string, boolean>;  // 各因子是否被覆盖
  retries: number;
}

export interface ViolationCost {
  structural: number;  // 逻辑跳跃成本
  semantic: number;    // 语义偏离成本
  logical: number;     // 逻辑冲突成本
  total: number;
}

// ============================================================
// Analyze-then-Judge (多模态评估)
// ============================================================

export interface AnalysisResult {
  extraction: ExtractionResult;
  comparison: ComparisonResult;
  verdict: VerdictResult;
}

export interface ExtractionResult {
  elements: string[];          // 穷尽式特征列表
  structure?: Record<string, any>;  // 结构化特征（PPT页/视频时间线等）
}

export interface ComparisonResult {
  faithfulness: ComparisonAxis;  // 忠实度：描述 vs 实际输入
  factuality: ComparisonAxis;    // 事实性：是否符合客观常识
}

export interface ComparisonAxis {
  matches: string[];
  contradictions: string[];
  gaps: string[];
}

export interface VerdictResult {
  overall_score?: number;
  sections: OutputSection[];
  evidence_chain: string[];
}

// ============================================================
// Knowledge Source (知识源)
// ============================================================

export interface KnowledgeSource {
  id?: string;
  expert_id: string;
  source_type: 'meeting_minutes' | 'interview' | 'conference' | 'publication' | 'link' | 'custom';
  title: string;
  original_file_url?: string;
  parsed_content?: string;
  summary?: string;
  key_insights?: string[];
  metadata?: Record<string, any>;
  is_active?: boolean;
  created_at?: string;
}

// ============================================================
// Feedback (反馈闭环)
// ============================================================

export interface ExpertFeedback {
  expert_id: string;
  invoke_id: string;
  human_score?: number;        // 1-5
  human_notes?: string;
  actual_outcome?: {
    metric_name: string;
    predicted_value?: number;
    actual_value: number;
    measurement_date: string;
  };
  comparison?: {
    better_than_baseline: boolean;
    baseline_value?: number;
  };
}

export interface ExpertPerformance {
  expert_id: string;
  total_invocations: number;
  avg_human_score: number | null;
  avg_confidence: number;
  feedback_count: number;
  outcome_accuracy?: number;   // 预测vs实际的偏差统计
  top_task_types: Array<{ task_type: string; count: number }>;
}
