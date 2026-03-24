// Streaming BlueTeam Review Routes
// 流式蓝军评审路由 - SSE 实时推送

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerSSEConnection, executeStreamingBlueTeamReview, BlueTeamProgress } from '../services/streamingBlueTeam.js';
import { query } from '../db/connection.js';

// 存储活跃的 SSE 连接
const sseClients = new Map<string, Set<FastifyReply>>();

export async function streamingBlueTeamRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /api/v1/streaming/blue-team/:taskId
   * SSE 端点 - 实时接收蓝军评审进度和评论
   */
  fastify.get('/:taskId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    
    // 设置 SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // 禁用 Nginx 缓冲
    });
    
    // 发送初始连接成功消息
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);
    
    // 注册连接
    if (!sseClients.has(taskId)) {
      sseClients.set(taskId, new Set());
    }
    sseClients.get(taskId)!.add(reply);
    
    // 注册到 streaming service
    const unregister = registerSSEConnection(taskId, (data) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        console.error('[SSE] Write error:', e);
      }
    });
    
    // 心跳保持连接
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 30000);
    
    // 清理函数
    const cleanup = () => {
      clearInterval(heartbeat);
      unregister();
      sseClients.get(taskId)?.delete(reply);
      if (sseClients.get(taskId)?.size === 0) {
        sseClients.delete(taskId);
      }
    };
    
    // 监听连接关闭
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
    
    // 保持连接打开
    await new Promise(() => {});
  });
  
  /**
   * POST /api/v1/streaming/blue-team/:taskId/start
   * 启动流式蓝军评审
   */
  fastify.post('/:taskId/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const body = request.body as any;
    
    try {
      // 获取任务信息和最新草稿
      const taskResult = await query(
        'SELECT final_draft, topic FROM tasks WHERE id = $1',
        [taskId]
      );
      
      if (taskResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      
      const task = taskResult.rows[0];
      
      // 如果没有 final_draft，从 draft_versions 获取最新版本
      let draftContent = task.final_draft;
      if (!draftContent) {
        const draftResult = await query(
          'SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1',
          [taskId]
        );
        if (draftResult.rows.length > 0) {
          draftContent = draftResult.rows[0].content;
        }
      }
      
      if (!draftContent) {
        return reply.status(400).send({ error: 'No draft content available' });
      }
      
      // 在后台启动流式评审（不阻塞响应）
      executeStreamingBlueTeamReview(
        taskId,
        draftContent,
        task.topic,
        {
          mode: body.mode || 'parallel',
          rounds: body.rounds || 2,
          experts: body.experts || ['challenger', 'expander', 'synthesizer']
        }
      ).catch(err => {
        console.error('[StreamingBlueTeam] Background execution failed:', err);
      });
      
      return reply.send({
        success: true,
        message: 'Streaming review started',
        taskId,
        sseUrl: `/api/v1/streaming/blue-team/${taskId}`
      });
      
    } catch (error) {
      console.error('[StreamingBlueTeam] Start failed:', error);
      return reply.status(500).send({ error: 'Failed to start streaming review' });
    }
  });
  
  /**
   * GET /api/v1/streaming/blue-team/:taskId/status
   * 获取当前评审状态（用于重连时恢复）
   */
  fastify.get('/:taskId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    
    try {
      // 获取任务状态
      const taskResult = await query(
        'SELECT status, current_stage, progress FROM tasks WHERE id = $1',
        [taskId]
      );
      
      if (taskResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      
      const task = taskResult.rows[0];
      
      // 获取已生成的评论
      const reviewsResult = await query(
        `SELECT r.id, r.round, r.expert_role, r.questions, r.created_at,
                (SELECT COUNT(*) FROM question_decisions d WHERE d.review_id = r.id) as decision_count
         FROM blue_team_reviews r
         WHERE r.task_id = $1
         ORDER BY r.round, r.expert_role, r.created_at`,
        [taskId]
      );
      
      const comments = reviewsResult.rows.flatMap((r: any) => {
        const questions = r.questions || [];
        return questions.map((q: any, idx: number) => ({
          id: `${r.id}::${idx}`,
          expertRole: r.expert_role,
          expertName: getExpertDisplayName(r.expert_role),
          question: q.question || q.issue,
          severity: q.severity || 'medium',
          suggestion: q.suggestion,
          location: q.location,
          rationale: q.rationale,
          round: r.round,
          timestamp: r.created_at,
          hasDecision: parseInt(r.decision_count) > 0
        }));
      });
      
      const isActive = sseClients.has(taskId) && sseClients.get(taskId)!.size > 0;
      
      return reply.send({
        taskStatus: task.status,
        currentStage: task.current_stage,
        progress: task.progress,
        isStreamingActive: isActive,
        commentCount: comments.length,
        comments: comments
      });
      
    } catch (error) {
      console.error('[StreamingBlueTeam] Get status failed:', error);
      return reply.status(500).send({ error: 'Failed to get status' });
    }
  });
}

function getExpertDisplayName(role: string): string {
  const names: Record<string, string> = {
    challenger: '批判者',
    expander: '拓展者',
    synthesizer: '提炼者',
    factChecker: '事实核查员',
    logicChecker: '逻辑检查员',
    industryExpert: '行业专家'
  };
  return names[role] || role;
}
