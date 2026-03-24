// Streaming BlueTeam Review Service
// 流式蓝军评审服务 - 支持实时生成评论并推送

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { generate } from './llm.js';

export interface ReviewComment {
  id: string;
  expertRole: string;
  expertName: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  location?: string;
  rationale?: string;
  round: number;
  timestamp: string;
}

export interface BlueTeamProgress {
  status: 'pending' | 'processing' | 'completed' | 'error';
  currentRound: number;
  totalRounds: number;
  currentExpert: string;
  completedComments: number;
  totalComments: number;
  comments: ReviewComment[];
}

export type BlueTeamProgressCallback = (progress: BlueTeamProgress) => void | Promise<void>;

// 内存存储连接（生产环境应使用 Redis）
const activeConnections = new Map<string, Set<(data: any) => void>>();

/**
 * 注册 SSE 连接
 */
export function registerSSEConnection(taskId: string, callback: (data: any) => void): () => void {
  if (!activeConnections.has(taskId)) {
    activeConnections.set(taskId, new Set());
  }
  activeConnections.get(taskId)!.add(callback);
  
  // 返回取消注册函数
  return () => {
    activeConnections.get(taskId)?.delete(callback);
  };
}

/**
 * 广播进度更新
 */
function broadcastProgress(taskId: string, progress: BlueTeamProgress) {
  const callbacks = activeConnections.get(taskId);
  if (callbacks) {
    callbacks.forEach(cb => {
      try {
        cb({ type: 'progress', data: progress });
      } catch (e) {
        console.error('[StreamingBlueTeam] Broadcast error:', e);
      }
    });
  }
}

/**
 * 广播新评论
 */
function broadcastComment(taskId: string, comment: ReviewComment) {
  const callbacks = activeConnections.get(taskId);
  if (callbacks) {
    callbacks.forEach(cb => {
      try {
        cb({ type: 'comment', data: comment });
      } catch (e) {
        console.error('[StreamingBlueTeam] Broadcast error:', e);
      }
    });
  }
}

/**
 * 流式执行蓝军评审
 */
export async function executeStreamingBlueTeamReview(
  taskId: string,
  draftContent: string,
  topic: string,
  config?: {
    mode?: 'parallel' | 'serial';
    rounds?: number;
    experts?: string[];
  }
): Promise<void> {
  const mode = config?.mode || 'parallel';
  const totalRounds = config?.rounds || 2;
  const experts = config?.experts || ['challenger', 'expander', 'synthesizer'];
  
  console.log(`[StreamingBlueTeam] Starting streaming review for task ${taskId}`, { mode, rounds: totalRounds });
  
  // 更新任务状态
  await query(
    `UPDATE tasks SET status = 'reviewing', current_stage = 'blue_team_streaming', progress = 70 WHERE id = $1`,
    [taskId]
  );
  
  const allComments: ReviewComment[] = [];
  
  try {
    // 执行每轮评审
    for (let round = 1; round <= totalRounds; round++) {
      console.log(`[StreamingBlueTeam] Round ${round}/${totalRounds} started`);
      
      // 广播进度 - 轮次开始
      broadcastProgress(taskId, {
        status: 'processing',
        currentRound: round,
        totalRounds,
        currentExpert: '',
        completedComments: allComments.length,
        totalComments: totalRounds * experts.length * 2, // 预估每个专家2条评论
        comments: allComments
      });
      
      // 并行或串行执行专家评审
      if (mode === 'parallel') {
        // 并行：所有专家同时评审
        await Promise.all(experts.map(expert => 
          reviewByExpertStreaming(taskId, draftContent, topic, expert, round, allComments)
        ));
      } else {
        // 串行：专家依次评审
        for (const expert of experts) {
          await reviewByExpertStreaming(taskId, draftContent, topic, expert, round, allComments);
        }
      }
    }
    
    // 广播完成
    broadcastProgress(taskId, {
      status: 'completed',
      currentRound: totalRounds,
      totalRounds,
      currentExpert: '',
      completedComments: allComments.length,
      totalComments: allComments.length,
      comments: allComments
    });
    
    // 更新任务状态
    await query(
      `UPDATE tasks SET status = 'awaiting_approval', current_stage = 'awaiting_human_approval', progress = 90 WHERE id = $1`,
      [taskId]
    );
    
    console.log(`[StreamingBlueTeam] Review completed for task ${taskId}, total comments: ${allComments.length}`);
    
  } catch (error) {
    console.error(`[StreamingBlueTeam] Review failed:`, error);
    
    broadcastProgress(taskId, {
      status: 'error',
      currentRound: 0,
      totalRounds,
      currentExpert: '',
      completedComments: allComments.length,
      totalComments: 0,
      comments: allComments
    });
    
    throw error;
  }
}

/**
 * 单个专家流式评审
 */
async function reviewByExpertStreaming(
  taskId: string,
  draftContent: string,
  topic: string,
  expertRole: string,
  round: number,
  allComments: ReviewComment[]
): Promise<void> {
  console.log(`[StreamingBlueTeam] Expert ${expertRole} reviewing round ${round}`);
  
  // 广播当前专家
  broadcastProgress(taskId, {
    status: 'processing',
    currentRound: round,
    totalRounds: 2,
    currentExpert: expertRole,
    completedComments: allComments.length,
    totalComments: allComments.length + 2,
    comments: allComments
  });
  
  // 生成专家提示词
  const expertConfig = getExpertConfig(expertRole);
  const prompt = buildReviewPrompt(draftContent, topic, expertConfig, round);
  
  try {
    // 调用 LLM 生成评审意见
    const result = await generate(prompt, 'blue_team', {
      temperature: 0.8,
      maxTokens: 2000
    });
    
    // 解析评论（支持流式解析，每解析一条就推送）
    const comments = parseComments(result.content, expertRole, round);
    
    // 逐条保存并推送
    for (const comment of comments) {
      // 保存到数据库
      const reviewId = await saveCommentToDatabase(taskId, comment);
      comment.id = reviewId;
      
      // 添加到列表
      allComments.push(comment);
      
      // 实时推送到前端
      broadcastComment(taskId, comment);
      
      // 更新进度
      broadcastProgress(taskId, {
        status: 'processing',
        currentRound: round,
        totalRounds: 2,
        currentExpert: expertRole,
        completedComments: allComments.length,
        totalComments: allComments.length + 1,
        comments: allComments
      });
      
      // 模拟延迟，让用户能看到逐条出现的效果
      await delay(500);
    }
    
  } catch (error) {
    console.error(`[StreamingBlueTeam] Expert ${expertRole} review failed:`, error);
    throw error;
  }
}

/**
 * 保存评论到数据库
 */
async function saveCommentToDatabase(taskId: string, comment: ReviewComment): Promise<string> {
  const reviewId = uuidv4();
  
  await query(
    `INSERT INTO blue_team_reviews (id, task_id, round, expert_role, questions, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', NOW())`,
    [
      reviewId,
      taskId,
      comment.round,
      comment.expertRole,
      JSON.stringify([{
        question: comment.question,
        severity: comment.severity,
        suggestion: comment.suggestion,
        location: comment.location,
        rationale: comment.rationale
      }])
    ]
  );
  
  return reviewId;
}

/**
 * 解析 LLM 输出为评论列表
 */
function parseComments(content: string, expertRole: string, round: number): ReviewComment[] {
  const comments: ReviewComment[] = [];
  
  try {
    // 尝试解析 JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      content.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const questions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      if (Array.isArray(questions)) {
        questions.forEach((q: any, idx: number) => {
          comments.push({
            id: '', // 由数据库生成
            expertRole,
            expertName: getExpertName(expertRole),
            question: q.question || q.issue || 'No question',
            severity: (q.severity || 'medium').toLowerCase() as any,
            suggestion: q.suggestion || '',
            location: q.location,
            rationale: q.rationale,
            round,
            timestamp: new Date().toISOString()
          });
        });
      }
    }
  } catch (e) {
    console.error('[StreamingBlueTeam] Parse comments failed:', e);
  }
  
  // 如果解析失败，返回一条默认评论
  if (comments.length === 0) {
    comments.push({
      id: '',
      expertRole,
      expertName: getExpertName(expertRole),
      question: `${getExpertName(expertRole)}：请检查内容质量`,
      severity: 'medium',
      suggestion: '建议优化',
      round,
      timestamp: new Date().toISOString()
    });
  }
  
  return comments;
}

/**
 * 构建评审提示词
 */
function buildReviewPrompt(draft: string, topic: string, expert: any, round: number): string {
  return `你是一位${expert.name}（${expert.role}），负责评审研究报告。

## 评审主题
${topic}

## 待评审文稿
${draft.slice(0, 8000)}

## 评审要求
- 这是第${round}轮评审
- 你的角色：${expert.description}
- 请给出2-3条具体、可执行的评审意见
- 每条意见包含：问题描述、严重程度（high/medium/low/praise）、修改建议

## 输出格式
请输出JSON数组：
[{
  "question": "具体问题描述",
  "severity": "high|medium|low|praise",
  "suggestion": "具体修改建议",
  "location": "问题位置（可选）"
}]`;
}

/**
 * 获取专家配置
 */
function getExpertConfig(role: string) {
  const configs: Record<string, any> = {
    challenger: {
      name: '批判者',
      role: '挑战者',
      description: '挑战逻辑漏洞、数据可靠性、隐含假设'
    },
    expander: {
      name: '拓展者',
      role: '拓展者',
      description: '扩展关联因素、国际对比、交叉学科视角'
    },
    synthesizer: {
      name: '提炼者',
      role: '提炼者',
      description: '归纳核心论点、结构优化、金句提炼'
    }
  };
  return configs[role] || configs.challenger;
}

function getExpertName(role: string): string {
  const names: Record<string, string> = {
    challenger: '批判者',
    expander: '拓展者',
    synthesizer: '提炼者'
  };
  return names[role] || role;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
