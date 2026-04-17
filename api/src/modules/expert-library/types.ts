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
  /** 可选：文本向量化，用于语义检索 */
  embed?(text: string): Promise<number[]>;
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
// Cognitive Distillation Types (借鉴 nuwa-skill 认知蒸馏)
// ============================================================

/** 结构化心智模型 — 必须有跨域证据 + 失败条件 */
export interface MentalModel {
  name: string;                 // 模型名称（如"第一性原理"）
  summary: string;              // 一句话描述
  evidence: string[];           // 证据（2+ 不同领域出现过）
  applicationContext: string;   // 适用场景
  failureCondition: string;     // 失败/不适用条件
}

/** 决策启发式 — 触发条件 + 规则 + 实例 */
export interface DecisionHeuristic {
  trigger: string;              // 触发条件（如"面对需求列表时"）
  rule: string;                 // 决策规则（如"给每条需求找到署名人"）
  example?: string;             // 实际案例
}

/** 表达 DNA — 量化语言特征，比 style/tone 更精细 */
export interface ExpressionDNA {
  sentencePattern: string;      // 句式偏好（如"极简陈述句，3-6个字"）
  vocabularyPreference: string; // 用词偏好（如"工程术语泛化到所有领域"）
  certaintyCali: string;        // 确定性校准（如"结论式，不说'我认为'"）
  citationHabit: string;        // 引用习惯（如"优先物理定律，其次工程实例"）
}

/** 已知矛盾 — 显式管理内部矛盾，让 LLM 知道何时展现矛盾 */
export interface Contradiction {
  tension: string;              // 矛盾描述
  context: string;              // 在什么场景下出现
  resolution: string;           // 如何共存
}

/** Agentic 协议 — 先研究再回答，不凭感觉说话 */
export interface AgenticProtocol {
  requiresResearch: boolean;    // 是否需要先调研再回答
  researchSteps?: string[];     // 调研步骤
  noGuessPolicy: boolean;       // 不凭感觉说话
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
    mentalModel: string;          // 保留：一句话概述（向后兼容）
    mentalModels?: MentalModel[]; // 新增：结构化心智模型列表
    decisionStyle: string;
    riskAttitude: string;
    timeHorizon: string;
    heuristics?: DecisionHeuristic[];  // 新增：决策启发式
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
    informationCutoff?: string;       // 新增：信息截止说明
    confidenceThreshold?: string;     // 新增：何时应表达不确定
    explicitLimitations?: string[];   // 新增：显式能力边界声明
  };

  // ===== nuwa-skill 启发的新增字段 =====
  expressionDNA?: ExpressionDNA;      // 表达 DNA（比 style/tone 更细粒度）
  contradictions?: Contradiction[];   // 已知矛盾管理
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

  // ===== nuwa-skill 启发的新增字段 =====
  agenticProtocol?: AgenticProtocol;  // 先研究再回答协议
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

/** 结构化 rubric 评分 — LLM 输出可被 ExpertEngine 解析存入 metadata */
export interface RubricScore {
  dimension: string;           // 对应 EvaluationRubric.dimension
  score: number;               // 1-5
  rationale: string;           // 一句话评分依据
}

/**
 * 心智模型应用记录 — 结构化 analysis 输出的骨架
 * 让 LLM 明确说明"哪个结论用了哪个心智模型"
 */
export interface ModelApplication {
  modelName: string;           // 对应 MentalModel.name
  application: string;         // 如何应用到当前主题（具体推理过程）
  conclusion: string;          // 由该模型得出的子结论
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
    /** 结构化 rubric 评分（仅 evaluation 任务且专家配置了 rubrics 时填充）*/
    rubric_scores?: RubricScore[];
    /** 心智模型应用记录（仅 analysis 任务且专家配置了 mentalModels 时填充）*/
    model_applications?: ModelApplication[];
    /** Phase 9: 是否执行了 agenticProtocol 的主题感知知识检索 */
    agentic_research_performed?: boolean;
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
  /** 按 expert.output_schema.rubrics 维度的评分（仅当 rubrics 存在时）*/
  rubric_scores?: RubricScore[];
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
  human_score?: number;        // 1-5 (overall)
  human_notes?: string;
  /** Phase 6: 按 rubric 维度分别打分；key 为 dimension 名，value 为 1-5 */
  rubric_scores?: Record<string, number>;
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

// ============================================================
// Outline Review (大纲专家评审)
// ============================================================

export interface OutlineSection {
  id?: string;
  title: string;
  description?: string;
  subsections?: OutlineSection[];
  level?: number;
}

export interface OutlineReviewRequest {
  taskId: string;
  topic: string;
  outline: { sections: OutlineSection[]; layers?: any[]; insights?: any[]; novelAngles?: any[] };
  expertIds?: string[];          // 指定专家，不传则自动匹配
  autoRevise?: boolean;          // 是否自动生成修订版大纲
}

export interface ExpertOutlineReview {
  expertId: string;
  expertName: string;
  overallScore: number;          // 1-10
  overallComment: string;        // 总体评价
  sectionReviews: SectionReview[];
  suggestions: string[];         // 修改建议列表
  strengths: string[];           // 亮点
  risks: string[];               // 潜在风险
}

export interface SectionReview {
  sectionTitle: string;
  score: number;                 // 1-10
  comment: string;
  suggestedChange?: string;      // 建议的修改内容
}

export interface OutlineReviewResult {
  taskId: string;
  reviews: ExpertOutlineReview[];
  consensus: {
    avgScore: number;
    commonStrengths: string[];
    commonIssues: string[];
    keyRecommendations: string[];
  };
  revisedOutline?: { sections: OutlineSection[] };  // 基于评审意见的修订版
}

// ============================================================
// Debate (多专家协作辩论)
// ============================================================

export interface DebateRequest {
  topic: string;
  content: string;
  expertIds: string[];           // 参与辩论的专家（2-4位）
  rounds?: number;               // 辩论轮数，默认3
  temperature?: number;          // 创造性温度 0.1-1.0，默认0.7
  context?: string;
}

export interface DebateRound {
  round: number;
  phase: 'independent' | 'cross_examination' | 'verdict';
  opinions: Array<{
    expertId: string;
    expertName: string;
    content: string;
    targetExpertId?: string;     // cross_examination 时质疑的目标
  }>;
}

export interface DebateResult {
  id?: string;                   // 持久化后的 UUID
  topic: string;
  rounds: DebateRound[];
  consensus: string[];           // 共识点
  disagreements: string[];       // 分歧点
  finalVerdict: string;          // 综合裁决
  participantSummary: Array<{
    expertId: string;
    expertName: string;
    position: string;            // 核心立场
  }>;
}

// ============================================================
// Expert Matching (专家匹配)
// ============================================================

export interface ExpertMatchRequest {
  topic: string;
  industry?: string;
  taskType?: string;
  importance?: number;           // 0-1, 决定是否匹配特级专家
}

export interface ExpertMatchResult {
  domainExperts: Array<{ expert: ExpertProfile; matchScore: number; matchReason: string }>;
  seniorExpert?: { expert: ExpertProfile; matchScore: number; matchReason: string };
  matchReasons: string[];
}

// ============================================================
// Calibration (校准)
// ============================================================

export interface CalibrationResult {
  expertId: string;
  status: 'applied' | 'no_feedback' | 'db_unavailable' | 'llm_unavailable';
  suggestions: string[];
  weightChanges?: Record<string, { before: number; after: number }>;
}
