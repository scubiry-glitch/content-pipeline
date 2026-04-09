// LangGraph Pipeline Routes
// 完全独立的路由，不修改任何现有 route
// Prefix: /api/v1/langgraph

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createPipelineRun,
  resumePipelineRun,
  getPipelineState,
  getPipelineStateHistory,
  getGraphMermaid,
} from '../langgraph/index.js';
import { query } from '../db/connection.js';

interface CreateTaskBody {
  topic: string;
  context?: string;
  searchConfig?: {
    maxSearchUrls?: number;
    enableWebSearch?: boolean;
    searchQueries?: string[];
  };
  maxReviewRounds?: number;
}

interface ResumeTaskBody {
  approved: boolean;
  feedback?: string;
  outline?: any;
}

export async function langgraphRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/langgraph/tasks
   * 创建新的 LangGraph 任务（启动 graph，在大纲确认处暂停）
   */
  fastify.post('/tasks', async (request: FastifyRequest<{ Body: CreateTaskBody }>, reply: FastifyReply) => {
    const { topic, context, searchConfig, maxReviewRounds } = request.body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      reply.status(400);
      return { error: 'topic is required' };
    }

    try {
      const result = await createPipelineRun({
        topic: topic.trim(),
        context,
        searchConfig,
        maxReviewRounds,
      });

      reply.status(201);
      return {
        threadId: result.threadId,
        taskId: result.state.taskId,
        status: result.state.status,
        outline: result.state.outline,
        evaluation: result.state.evaluation,
        competitorAnalysis: result.state.competitorAnalysis,
        progress: result.state.progress,
        message: '大纲已生成，请通过 resume 接口确认',
      };
    } catch (error: any) {
      console.error('[LangGraph] Create task error:', error);
      reply.status(500);
      return { error: 'Failed to create task', detail: error.message };
    }
  });

  /**
   * POST /api/v1/langgraph/tasks/:threadId/resume
   * 恢复中断的任务（大纲确认 / 最终审批）
   */
  fastify.post('/tasks/:threadId/resume', async (
    request: FastifyRequest<{ Params: { threadId: string }; Body: ResumeTaskBody }>,
    reply: FastifyReply,
  ) => {
    const { threadId } = request.params;
    const { approved, feedback, outline } = request.body;

    if (typeof approved !== 'boolean') {
      reply.status(400);
      return { error: 'approved (boolean) is required' };
    }

    try {
      const result = await resumePipelineRun(threadId, {
        approved,
        feedback,
        outline,
      });

      return {
        threadId: result.threadId,
        taskId: result.state.taskId,
        status: result.state.status,
        progress: result.state.progress,
        currentNode: result.state.currentNode,
        draftContent: result.state.draftContent ? result.state.draftContent.slice(0, 500) + '...' : undefined,
        blueTeamRounds: result.state.blueTeamRounds?.length || 0,
        reviewPassed: result.state.reviewPassed,
      };
    } catch (error: any) {
      console.error('[LangGraph] Resume task error:', error);
      reply.status(500);
      return { error: 'Failed to resume task', detail: error.message };
    }
  });

  /**
   * GET /api/v1/langgraph/tasks/:threadId/state
   * 查看 graph 当前状态
   */
  fastify.get('/tasks/:threadId/state', async (
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ) => {
    const { threadId } = request.params;

    try {
      const state = await getPipelineState(threadId);

      return {
        threadId: state.threadId,
        values: {
          taskId: state.values.taskId,
          topic: state.values.topic,
          status: state.values.status,
          progress: state.values.progress,
          currentNode: state.values.currentNode,
          outlineApproved: state.values.outlineApproved,
          reviewPassed: state.values.reviewPassed,
          finalApproved: state.values.finalApproved,
          blueTeamRoundsCount: state.values.blueTeamRounds?.length || 0,
          currentReviewRound: state.values.currentReviewRound,
          maxReviewRounds: state.values.maxReviewRounds,
          errors: state.values.errors,
        },
        next: state.next,
        metadata: state.metadata,
      };
    } catch (error: any) {
      console.error('[LangGraph] Get state error:', error);
      reply.status(500);
      return { error: 'Failed to get task state', detail: error.message };
    }
  });

  /**
   * GET /api/v1/langgraph/tasks/:threadId/detail
   * 获取完整的任务详情（包含产物数据）
   */
  fastify.get('/tasks/:threadId/detail', async (
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ) => {
    const { threadId } = request.params;

    try {
      const state = await getPipelineState(threadId);
      const values = { ...state.values };

      // ★ Fallback: 如果 LangGraph state 中没有草稿，从 draft_versions 表读取
      if (!values.draftContent && values.taskId) {
        try {
          const draftResult = await query(
            `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
            [values.taskId]
          );
          if (draftResult.rows[0]?.content) {
            values.draftContent = draftResult.rows[0].content;
          }
        } catch (e) {
          console.warn('[LangGraph] Failed to load draft fallback:', e);
        }
      }

      return {
        threadId: state.threadId,
        ...values,
        next: state.next,
      };
    } catch (error: any) {
      console.error('[LangGraph] Get detail error:', error);
      reply.status(500);
      return { error: 'Failed to get task detail', detail: error.message };
    }
  });

  /**
   * GET /api/v1/langgraph/tasks/:threadId/history
   * 获取 pipeline 状态历史（checkpoint 快照列表）
   */
  fastify.get('/tasks/:threadId/history', async (
    request: FastifyRequest<{ Params: { threadId: string }; Querystring: { limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const { threadId } = request.params;
    const limit = parseInt((request.query as any).limit || '20', 10);

    try {
      const result = await getPipelineStateHistory(threadId, limit);
      return result;
    } catch (error: any) {
      console.error('[LangGraph] Get history error:', error);
      reply.status(500);
      return { error: 'Failed to get state history', detail: error.message };
    }
  });

  /**
   * GET /api/v1/langgraph/tasks/:threadId/stream
   * SSE 端点 - 实时推送 pipeline 状态变化
   * 每 2s 检查一次 state，当 status/progress/currentNode 变化时推送事件
   */
  fastify.get('/tasks/:threadId/stream', async (
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ) => {
    const { threadId } = request.params;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', threadId })}\n\n`);

    let lastStatus = '';
    let lastProgress = -1;
    let lastNode = '';
    let stopped = false;

    const poll = setInterval(async () => {
      if (stopped) return;
      try {
        const state = await getPipelineState(threadId);
        const values = state.values;
        const status = values.status || '';
        const progress = values.progress || 0;
        const currentNode = values.currentNode || '';

        if (status !== lastStatus || progress !== lastProgress || currentNode !== lastNode) {
          lastStatus = status;
          lastProgress = progress;
          lastNode = currentNode;

          reply.raw.write(`data: ${JSON.stringify({
            type: 'progress',
            threadId,
            status,
            progress,
            currentNode,
            outlineApproved: values.outlineApproved,
            reviewPassed: values.reviewPassed,
            blueTeamRoundsCount: values.blueTeamRounds?.length || 0,
            next: state.next,
          })}\n\n`);
        }

        // 终态时关闭流
        const terminal = ['completed', 'failed', 'planning_failed', 'research_failed', 'writing_failed', 'review_failed'];
        const humanPending = ['outline_pending', 'awaiting_approval'];
        if (terminal.includes(status) || humanPending.includes(status)) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'done', status })}\n\n`);
          clearInterval(poll);
          reply.raw.end();
          stopped = true;
        }
      } catch {
        // state read failed, skip
      }
    }, 2000);

    request.raw.on('close', () => {
      stopped = true;
      clearInterval(poll);
    });
  });

  /**
   * GET /api/v1/langgraph/graph
   * 获取 Mermaid 流程图定义
   */
  fastify.get('/graph', async (_request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const mermaid = getGraphMermaid();
      return {
        format: 'mermaid',
        graph: mermaid,
      };
    } catch (error: any) {
      console.error('[LangGraph] Get graph error:', error);
      return { error: 'Failed to generate graph', detail: error.message };
    }
  });
}
