// Streaming Sequential Review Routes
// 串行评审流式路由 - SSE 实时推送

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  registerSequentialReviewListener, 
  getSequentialReviewStreamingStatus,
  SequentialReviewEvent 
} from '../services/streamingSequentialReview.js';
import { query } from '../db/connection.js';

export async function streamingSequentialRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /api/v1/streaming/sequential/:taskId
   * SSE 端点 - 实时接收串行评审进度
   */
  fastify.get('/:taskId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    
    // 验证任务存在
    const taskResult = await query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Task not found' });
    }
    
    // 设置 SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    
    // 发送初始连接成功消息
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);
    
    // 注册事件监听
    const unregister = registerSequentialReviewListener(taskId, (event: SequentialReviewEvent) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (e) {
        console.error('[SSE-Sequential] Write error:', e);
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
    };
    
    // 监听连接关闭
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
    
    // 保持连接打开
    await new Promise(() => {});
  });
  
  /**
   * GET /api/v1/streaming/sequential/:taskId/status
   * 获取串行评审流式状态（用于重连恢复）
   */
  fastify.get('/:taskId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    
    try {
      const status = await getSequentialReviewStreamingStatus(taskId);
      
      // 获取评审历史
      const reviewsResult = await query(
        `SELECT er.round, er.expert_name, er.expert_role, er.questions, er.status,
                dv.id as draft_id
         FROM expert_reviews er
         LEFT JOIN draft_versions dv ON er.output_draft_id = dv.id
         WHERE er.task_id = $1
         ORDER BY er.round`,
        [taskId]
      );
      
      // 获取评审链
      const chainResult = await query(
        `SELECT * FROM review_chains WHERE task_id = $1 ORDER BY round`,
        [taskId]
      );
      
      return reply.send({
        ...status,
        reviews: reviewsResult.rows.map(r => ({
          round: r.round,
          expertName: r.expert_name,
          expertRole: r.expert_role,
          questionCount: r.questions ? r.questions.length : 0,
          status: r.status,
          draftId: r.draft_id
        })),
        chain: chainResult.rows
      });
      
    } catch (error) {
      console.error('[StreamingSequential] Get status failed:', error);
      return reply.status(500).send({ error: 'Failed to get status' });
    }
  });
}
