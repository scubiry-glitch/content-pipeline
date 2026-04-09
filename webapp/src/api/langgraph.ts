// LangGraph API Client
// 封装 /api/v1/langgraph/* 的调用，复用现有 axios 实例

import axios from 'axios';
import { API_KEY, BASE_URL } from './client';

// 独立的 LangGraph axios 实例（复用相同配置）
const lgClient = axios.create({
  baseURL: BASE_URL.replace(/\/api\/v1$/, '/api/v1/langgraph'),
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes - LangGraph pipeline 可能较慢
});

// 响应拦截器：直接返回 data
lgClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('[LangGraph API] Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// --- Types ---

export interface LGTaskCreateInput {
  topic: string;
  context?: string;
  searchConfig?: {
    maxSearchUrls?: number;
    enableWebSearch?: boolean;
    searchQueries?: string[];
  };
  maxReviewRounds?: number;
}

export interface LGTaskCreateResult {
  threadId: string;
  taskId: string;
  status: string;
  outline: any;
  evaluation: any;
  competitorAnalysis: any;
  progress: number;
  message: string;
}

export interface LGResumeInput {
  approved: boolean;
  feedback?: string;
  outline?: any;
}

export interface LGResumeResult {
  threadId: string;
  taskId: string;
  status: string;
  progress: number;
  currentNode: string;
  draftContent?: string;
  blueTeamRounds: number;
  reviewPassed: boolean;
}

export interface LGTaskState {
  threadId: string;
  values: {
    taskId: string;
    topic: string;
    status: string;
    progress: number;
    currentNode: string;
    outlineApproved: boolean;
    reviewPassed: boolean;
    finalApproved: boolean;
    blueTeamRoundsCount: number;
    currentReviewRound: number;
    maxReviewRounds: number;
    errors: string[];
  };
  next: string[];
  metadata: any;
}

export interface LGTaskDetail {
  threadId: string;
  taskId: string;
  topic: string;
  status: string;
  progress: number;
  currentNode: string;
  outline: any;
  evaluation: any;
  researchData: any;
  draftContent: string;
  blueTeamRounds: any[];
  reviewPassed: boolean;
  outlineApproved: boolean;
  finalApproved: boolean;
  errors: string[];
}

export interface LGGraphData {
  format: string;
  graph: string;
}

// 注释条目类型（对应 draft_annotations 表）
export interface LGAnnotation {
  id: string;
  expertName: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  comment: string;
  suggestion?: string;
  location?: string;
  startOffset?: number;
  endOffset?: number;
  resolved: boolean;
  createdAt: string;
}

export interface LGStateHistoryItem {
  checkpoint_id: string;
  values: {
    taskId: string;
    topic: string;
    status: string;
    progress: number;
    currentNode: string;
    outlineApproved: boolean;
    reviewPassed: boolean;
    hasOutline: boolean;
    hasDraft: boolean;
    blueTeamRoundsCount: number;
  };
  next: string[];
  metadata: any;
  createdAt: string;
  parentConfig: string | null;
}

export interface LGStateHistory {
  threadId: string;
  history: LGStateHistoryItem[];
}

// --- API Functions ---

export const langgraphApi = {
  /** 创建新任务 */
  createTask: (data: LGTaskCreateInput): Promise<LGTaskCreateResult> =>
    lgClient.post('/tasks', data) as any,

  /** 恢复中断的任务 */
  resumeTask: (threadId: string, data: LGResumeInput): Promise<LGResumeResult> =>
    lgClient.post(`/tasks/${threadId}/resume`, data) as any,

  /** 获取任务状态 */
  getTaskState: (threadId: string): Promise<LGTaskState> =>
    lgClient.get(`/tasks/${threadId}/state`) as any,

  /** 获取任务详情（含产物） */
  getTaskDetail: (threadId: string): Promise<LGTaskDetail> =>
    lgClient.get(`/tasks/${threadId}/detail`) as any,

  /** 获取 Mermaid 流程图 */
  getGraph: (): Promise<LGGraphData> =>
    lgClient.get('/graph') as any,

  /** 获取已保存的评审配置 */
  getReviewConfig: (threadId: string): Promise<any> =>
    lgClient.get(`/tasks/${threadId}/review-config`) as any,

  /** 获取草稿标注列表（评审高亮段落） */
  getAnnotations: (threadId: string): Promise<LGAnnotation[]> =>
    lgClient.get(`/tasks/${threadId}/annotations`) as any,

  /** 获取状态历史（checkpoint 快照列表） */
  getStateHistory: (threadId: string, limit?: number): Promise<LGStateHistory> =>
    lgClient.get(`/tasks/${threadId}/history`, { params: { limit } }) as any,

  /** 获取 SSE 流的 URL */
  getStreamUrl: (threadId: string): string =>
    `${lgClient.defaults.baseURL}/tasks/${threadId}/stream`,
};
