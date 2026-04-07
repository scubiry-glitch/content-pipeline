// LangGraph Pipeline State Definition
// 声明式状态 schema，替代原有的数据库状态字符串

import { Annotation } from '@langchain/langgraph';

// 阶段产物类型（复用现有 types）
export interface OutlineData {
  sections: Array<{
    title: string;
    level: number;
    content: string;
    subsections?: any[];
  }>;
  title?: string;
}

export interface EvaluationData {
  score: number;
  passed: boolean;
  dimensions: Record<string, number>;
  suggestions?: string[];
}

export interface ResearchData {
  dataPackage: Array<{
    source: string;
    type: string;
    content: string;
    reliability?: number;
  }>;
  analysis: {
    summary: string;
    keyFindings: string[];
    gaps?: string[];
  };
  insights: Array<{
    type: string;
    content: string;
    confidence: number;
  }>;
}

export interface BlueTeamRoundData {
  round: number;
  questions: Array<{
    expertId: string;
    expertName: string;
    role: string;
    question: string;
    severity: 'high' | 'medium' | 'low' | 'praise';
    suggestion: string;
  }>;
  revisionContent?: string;
  revisionSummary?: string;
}

// Pipeline 节点名称常量
export const NODE_NAMES = {
  PLANNER: 'planner',
  HUMAN_OUTLINE: 'human_outline',
  RESEARCHER: 'researcher',
  WRITER: 'writer',
  BLUE_TEAM: 'blue_team',
  HUMAN_APPROVE: 'human_approve',
  OUTPUT: 'output',
} as const;

// LangGraph State Annotation
export const PipelineState = Annotation.Root({
  // 任务标识
  taskId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  topic: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  context: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  searchConfig: Annotation<Record<string, any>>({
    reducer: (_prev, next) => next,
    default: () => ({}),
  }),

  // 阶段产物
  outline: Annotation<OutlineData | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  evaluation: Annotation<EvaluationData | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  competitorAnalysis: Annotation<any | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  researchData: Annotation<ResearchData | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  draftContent: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // 蓝军评审
  blueTeamRounds: Annotation<BlueTeamRoundData[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  currentReviewRound: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  maxReviewRounds: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 2,
  }),
  reviewPassed: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  // 人工交互
  outlineApproved: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  outlineFeedback: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  finalApproved: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  approvalFeedback: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  // 元信息
  status: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'created',
  }),
  progress: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  currentNode: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
});

export type PipelineStateType = typeof PipelineState.State;
