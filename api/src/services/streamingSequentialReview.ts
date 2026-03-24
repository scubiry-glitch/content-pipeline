// Streaming Sequential Review Service
// 串行评审的流式推送支持 - 在现有 sequentialReview 基础上添加实时 SSE 推送

import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

// 复用 streamingBlueTeam 的 SSE 基础设施
import { registerSSEConnection } from './streamingBlueTeam.js';

export interface SequentialReviewEvent {
  type: 'round_started' | 'expert_reviewing' | 'comment_generated' | 'draft_revised' | 'round_completed' | 'review_completed' | 'error';
  round?: number;
  totalRounds?: number;
  expertName?: string;
  expertRole?: string;
  comment?: any;
  draftId?: string;
  progress?: {
    currentRound: number;
    totalRounds: number;
    currentExpert: string;
    status: string;
  };
  message?: string;
  error?: string;
}

type SequentialEventCallback = (event: SequentialReviewEvent) => void;

// 存储活跃的任务监听器
const taskListeners = new Map<string, Set<SequentialEventCallback>>();

/**
 * 注册串行评审事件监听
 */
export function registerSequentialReviewListener(
  taskId: string, 
  callback: SequentialEventCallback
): () => void {
  if (!taskListeners.has(taskId)) {
    taskListeners.set(taskId, new Set());
  }
  taskListeners.get(taskId)!.add(callback);
  
  return () => {
    taskListeners.get(taskId)?.delete(callback);
  };
}

/**
 * 广播串行评审事件
 */
export function broadcastSequentialEvent(taskId: string, event: SequentialReviewEvent): void {
  const listeners = taskListeners.get(taskId);
  if (listeners) {
    listeners.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error('[StreamingSequential] Broadcast error:', e);
      }
    });
  }
  
  // 同时通过 SSE 广播（与 BlueTeam 共享连接）
  const sseCallback = (data: any) => {
    // 包装成统一格式
  };
}

/**
 * 包装 AI 专家评审，添加流式推送
 * 在原有 conductAIExpertReview 基础上，逐条推送生成的评论
 */
export async function conductAIExpertReviewStreaming(
  taskId: string,
  round: number,
  draftContent: string,
  expertConfig: { role?: string; name: string; profile?: string },
  generateQuestions: () => Promise<Array<{
    question: string;
    severity: 'high' | 'medium' | 'low' | 'praise';
    suggestion: string;
    category?: string;
    location?: string;
  }>>
): Promise<{ questions: any[]; score: number; summary: string }> {
  
  console.log(`[StreamingSequential] Round ${round}: ${expertConfig.name} starting review`);
  
  // 广播轮次开始
  broadcastSequentialEvent(taskId, {
    type: 'round_started',
    round,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `第 ${round} 轮评审开始：${expertConfig.name}`
  });
  
  try {
    // 广播专家开始评审
    broadcastSequentialEvent(taskId, {
      type: 'expert_reviewing',
      round,
      expertName: expertConfig.name,
      expertRole: expertConfig.role,
      message: `${expertConfig.name} 正在评审...`
    });
    
    // 调用原有的问题生成逻辑
    const questions = await generateQuestions();
    
    // 逐条推送生成的评论（模拟流式效果）
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      // 广播单条评论
      broadcastSequentialEvent(taskId, {
        type: 'comment_generated',
        round,
        expertName: expertConfig.name,
        expertRole: expertConfig.role,
        comment: {
          id: `${taskId}-${round}-${i}`,
          question: q.question,
          severity: q.severity,
          suggestion: q.suggestion,
          category: q.category,
          location: q.location,
          expertName: expertConfig.name,
          expertRole: expertConfig.role,
          round
        },
        progress: {
          currentRound: round,
          totalRounds: 0, // 由调用方填充
          currentExpert: expertConfig.name,
          status: 'processing'
        }
      });
      
      // 添加小延迟让用户感知流式效果
      if (i < questions.length - 1) {
        await delay(300);
      }
    }
    
    // 计算评分和总结
    const score = calculateScore(questions);
    const summary = generateSummary(expertConfig.name, questions);
    
    // 广播轮次完成
    broadcastSequentialEvent(taskId, {
      type: 'round_completed',
      round,
      expertName: expertConfig.name,
      expertRole: expertConfig.role,
      message: `${expertConfig.name} 完成评审，发现 ${questions.length} 个问题`
    });
    
    return { questions, score, summary };
    
  } catch (error: any) {
    console.error(`[StreamingSequential] Round ${round} failed:`, error);
    
    broadcastSequentialEvent(taskId, {
      type: 'error',
      round,
      expertName: expertConfig.name,
      error: error.message,
      message: `第 ${round} 轮评审失败: ${error.message}`
    });
    
    throw error;
  }
}

/**
 * 广播修订稿生成进度
 */
export async function broadcastDraftRevising(
  taskId: string,
  round: number,
  expertName: string
): Promise<void> {
  broadcastSequentialEvent(taskId, {
    type: 'draft_revised',
    round,
    expertName,
    message: `${expertName} 正在生成修订稿...`
  });
}

/**
 * 广播评审全部完成
 */
export function broadcastReviewCompleted(taskId: string, totalRounds: number): void {
  broadcastSequentialEvent(taskId, {
    type: 'review_completed',
    totalRounds,
    message: `串行评审完成，共 ${totalRounds} 轮`
  });
}

// 辅助函数
function calculateScore(questions: any[]): number {
  const deductions = questions.reduce((sum, q) => {
    if (q.severity === 'high') return sum + 15;
    if (q.severity === 'medium') return sum + 8;
    if (q.severity === 'low') return sum + 3;
    return sum;
  }, 0);
  return Math.max(60, 100 - deductions);
}

function generateSummary(expertName: string, questions: any[]): string {
  const highCount = questions.filter(q => q.severity === 'high').length;
  const mediumCount = questions.filter(q => q.severity === 'medium').length;
  const praiseCount = questions.filter(q => q.severity === 'praise').length;
  
  if (highCount > 0) {
    return `${expertName} 发现 ${highCount} 个严重问题需要优先解决`;
  } else if (mediumCount > 0) {
    return `${expertName} 提出 ${mediumCount} 条改进建议`;
  } else if (praiseCount > 0) {
    return `${expertName} 对文稿质量表示认可`;
  }
  return `${expertName} 完成评审`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取串行评审状态（用于 SSE 连接时恢复）
 */
export async function getSequentialReviewStreamingStatus(taskId: string): Promise<{
  status: string;
  currentRound: number;
  totalRounds: number;
  currentExpert: string | null;
  events: SequentialReviewEvent[];
}> {
  try {
    const progressResult = await query(
      `SELECT * FROM task_review_progress WHERE task_id = $1`,
      [taskId]
    );
    
    if (progressResult.rows.length === 0) {
      return {
        status: 'not_configured',
        currentRound: 0,
        totalRounds: 0,
        currentExpert: null,
        events: []
      };
    }
    
    const progress = progressResult.rows[0];
    const reviewQueue = progress.review_queue || [];
    
    return {
      status: progress.status,
      currentRound: progress.current_round || 0,
      totalRounds: progress.total_rounds,
      currentExpert: progress.current_expert_role,
      events: [] // 可以扩展为存储最近事件
    };
    
  } catch (error) {
    console.error('[StreamingSequential] Get status failed:', error);
    throw error;
  }
}
