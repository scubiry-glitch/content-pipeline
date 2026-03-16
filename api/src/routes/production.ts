// 生产任务路由
// 核心流程: 创建任务 → 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProductionService } from '../services/production.js';
import { evaluateTopic } from '../services/topicEvaluation.js';
import { authenticate } from '../middleware/auth.js';

// Validation schemas
const createTaskSchema = z.object({
  topic: z.string().min(1).max(500),
  source_materials: z.array(z.string()).optional(),
  target_formats: z.array(z.enum(['markdown', 'html', 'summary', 'infographic', 'ppt'])).default(['markdown'])
});

const approveTaskSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().optional()
});

const annotationSchema = z.object({
  type: z.enum(['url', 'asset']),
  url: z.string().optional(),
  asset_id: z.string().optional(),
  title: z.string().min(1)
});

const outlineChatSchema = z.object({
  message: z.string().min(1)
});

export async function productionRoutes(fastify: FastifyInstance) {
  const productionService = new ProductionService();

  // Evaluate topic quality (FR-001 ~ FR-003)
  fastify.post('/evaluate-topic', { preHandler: authenticate }, async (request) => {
    const { topic, context } = request.body as any;
    const evaluation = await evaluateTopic({ topic, context });
    return evaluation;
  });

  // Create production task
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const body = createTaskSchema.parse(request.body);

    const task = await productionService.createTask({
      topic: body.topic,
      sourceMaterials: body.source_materials || [],
      targetFormats: body.target_formats
    });

    reply.status(201);
    return task;
  });

  // List tasks
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const { status, limit = '10', offset = '0' } = request.query as any;

    return await productionService.listTasks({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  });

  // Get task detail
  fastify.get('/:taskId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const task = await productionService.getTask(taskId);

    if (!task) {
      reply.status(404);
      return { error: 'Task not found', code: 'TASK_NOT_FOUND' };
    }

    return task;
  });

  // Manual approval endpoint
  fastify.post('/:taskId/approve', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = approveTaskSchema.parse(request.body);

    const result = await productionService.approveTask(taskId, {
      approved: body.approved,
      feedback: body.feedback
    });

    return result;
  });

  // Add research annotation
  fastify.post('/:taskId/annotations', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = annotationSchema.parse(request.body);

    const result = await productionService.addAnnotation(taskId, body);
    return result;
  });

  // Get annotations
  fastify.get('/:taskId/annotations', { preHandler: authenticate }, async (request) => {
    const { taskId } = request.params as any;
    return await productionService.getAnnotations(taskId);
  });

  // Outline chat - multi-round conversation
  fastify.post('/:taskId/outline-chat', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = outlineChatSchema.parse(request.body);

    const result = await productionService.chatAboutOutline(taskId, body.message);
    return result;
  });

  // Confirm outline and proceed to research (FR-004 ~ FR-006)
  fastify.post('/:taskId/outline/confirm', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = request.body as any;

    const result = await productionService.confirmOutline(taskId, {
      outline: body?.outline,
      confirmed: body?.confirmed !== false // default true
    });
    return result;
  });

  // Get draft versions with diff
  fastify.get('/:taskId/versions', { preHandler: authenticate }, async (request) => {
    const { taskId } = request.params as any;
    return await productionService.getVersions(taskId);
  });

  // Get BlueTeam reviews (FR-017 ~ FR-023)
  fastify.get('/:taskId/reviews', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const reviews = await productionService.getBlueTeamReviews(taskId);
    return reviews;
  });

  // Accept a review suggestion
  fastify.post('/:taskId/reviews/:reviewId/accept', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, reviewId } = request.params as any;
    const result = await productionService.acceptReviewSuggestion(taskId, reviewId);
    return result;
  });

  // ===== 用户决策交互 API (FR-021 ~ FR-023) =====

  // 获取评审项列表（带用户决策状态）
  fastify.get('/:taskId/review-items', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getReviewItems } = await import('../services/reviewDecision.js');
    const items = await getReviewItems(taskId);
    return { items };
  });

  // 提交单个评审项决策
  fastify.post('/:taskId/review-items/:reviewId/decide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, reviewId } = request.params as any;
    const { decision, note } = request.body as any;

    if (!decision || !['accept', 'ignore', 'manual_resolved'].includes(decision)) {
      reply.status(400);
      return { error: 'Invalid decision. Must be one of: accept, ignore, manual_resolved' };
    }

    const { submitDecision } = await import('../services/reviewDecision.js');
    const result = await submitDecision(taskId, reviewId, decision, note);
    return result;
  });

  // 批量提交评审决策
  fastify.post('/:taskId/review-items/batch-decide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { decisions } = request.body as any;

    if (!decisions || !Array.isArray(decisions)) {
      reply.status(400);
      return { error: 'decisions array is required' };
    }

    const { batchSubmitDecisions } = await import('../services/reviewDecision.js');
    const result = await batchSubmitDecisions(taskId, decisions);
    return result;
  });

  // 获取决策汇总统计
  fastify.get('/:taskId/review-summary', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getDecisionSummary } = await import('../services/reviewDecision.js');
    const summary = await getDecisionSummary(taskId);
    return summary;
  });

  // 检查是否可以进入确认环节 (FR-022)
  fastify.get('/:taskId/can-proceed', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { canProceedToConfirmation } = await import('../services/reviewDecision.js');
    const result = await canProceedToConfirmation(taskId);
    return result;
  });

  // 申请重新评审 (FR-023)
  fastify.post('/:taskId/review-items/re-review', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { expertRole, reason } = request.body as any;

    if (!expertRole) {
      reply.status(400);
      return { error: 'expertRole is required' };
    }

    const { requestReReview } = await import('../services/reviewDecision.js');
    const result = await requestReReview(taskId, expertRole, reason);
    return result;
  });

  // 获取专家评审统计
  fastify.get('/:taskId/expert-stats', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getExpertReviewStats } = await import('../services/reviewDecision.js');
    const stats = await getExpertReviewStats(taskId);
    return { stats };
  });

  // ===== 环节重做 API =====

  // 1. 选题策划重做
  fastify.post('/:taskId/redo/planning', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = (request.body || {}) as any;

    const result = await productionService.redoPlanning(taskId, {
      topic: body?.topic,
      context: body?.context
    });

    return result;
  });

  // 2. 深度研究重做
  fastify.post('/:taskId/redo/research', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = request.body as any;

    // 异步执行研究（不阻塞响应）
    setImmediate(async () => {
      try {
        await productionService.redoResearch(taskId, body?.searchConfig);
      } catch (error) {
        console.error(`[Redo] Research failed for task ${taskId}:`, error);
      }
    });

    return {
      message: '深度研究重做已启动',
      taskId,
      status: 'researching'
    };
  });

  // 3. 文稿生成重做
  fastify.post('/:taskId/redo/writing', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;

    // 异步执行写作（不阻塞响应）
    setImmediate(async () => {
      try {
        await productionService.redoWriting(taskId);
      } catch (error) {
        console.error(`[Redo] Writing failed for task ${taskId}:`, error);
      }
    });

    return {
      message: '文稿生成重做已启动',
      taskId,
      status: 'writing'
    };
  });

  // 4. 蓝军评审重做
  fastify.post('/:taskId/redo/review', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;

    // 异步执行评审（不阻塞响应）
    setImmediate(async () => {
      try {
        await productionService.redoReview(taskId);
      } catch (error) {
        console.error(`[Redo] Review failed for task ${taskId}:`, error);
      }
    });

    return {
      message: '蓝军评审重做已启动',
      taskId,
      status: 'reviewing'
    };
  });

  // 通用：从指定环节重新开始
  fastify.post('/:taskId/redo', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = request.body as any;
    const stage = body?.stage;

    if (!stage || !['planning', 'research', 'writing', 'review'].includes(stage)) {
      reply.status(400);
      return { error: 'Invalid stage. Must be one of: planning, research, writing, review' };
    }

    const result = await productionService.restartFromStage(taskId, stage);
    return result;
  });

  // ===== 任务删除和隐藏 API =====

  // 删除任务
  fastify.delete('/:taskId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const result = await productionService.deleteTask(taskId);
    return result;
  });

  // 隐藏任务
  fastify.post('/:taskId/hide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const result = await productionService.hideTask(taskId);
    return result;
  });

  // 取消隐藏任务
  fastify.post('/:taskId/unhide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const result = await productionService.unhideTask(taskId);
    return result;
  });

  // 获取隐藏任务列表
  fastify.get('/hidden', { preHandler: authenticate }, async (request) => {
    const { limit = '10', offset = '0' } = request.query as any;
    return await productionService.listHiddenTasks({
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  });

  // ===== 数据审核 API (FR-011 ~ FR-014) =====

  // 获取数据审核列表
  fastify.get('/:taskId/data-review', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getDataReviewList } = await import('../services/dataReview.js');
    const result = await getDataReviewList(taskId);
    return result;
  });

  // 更新数据项选择状态
  fastify.patch('/:taskId/data-review/:itemId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, itemId } = request.params as any;
    const { isSelected } = request.body as any;
    const { updateDataSelection } = await import('../services/dataReview.js');
    await updateDataSelection(taskId, itemId, isSelected);
    return { success: true };
  });

  // 批量更新数据选择
  fastify.post('/:taskId/data-review/batch', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { selections } = request.body as any;
    const { batchUpdateSelection } = await import('../services/dataReview.js');
    await batchUpdateSelection(taskId, selections);
    return { success: true };
  });

  // 获取数据审核统计
  fastify.get('/:taskId/data-review/stats', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getDataReviewStats } = await import('../services/dataReview.js');
    const stats = await getDataReviewStats(taskId);
    return stats;
  });

  // ===== 交叉验证 API (FR-015 ~ FR-016) =====

  // 执行交叉验证
  fastify.post('/:taskId/cross-validate', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { dataPoints } = request.body as any;

    if (!dataPoints || !Array.isArray(dataPoints)) {
      reply.status(400);
      return { error: 'dataPoints is required and must be an array' };
    }

    const { validateDataPoints } = await import('../services/crossValidation.js');
    const result = await validateDataPoints(dataPoints);
    return result;
  });

  // 快速验证单个数值
  fastify.post('/quick-validate', { preHandler: authenticate }, async (request, reply) => {
    const { value, metric, context } = request.body as any;
    const { quickValidate } = await import('../services/crossValidation.js');
    const result = quickValidate(value, metric, context);
    return result;
  });

  // ===== 终稿编辑 API (FR-024 ~ FR-025) =====

  // 获取最终稿件内容
  fastify.get('/:taskId/final-draft', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getFinalDraft } = await import('../services/finalDraftEditor.js');
    const draft = await getFinalDraft(taskId);
    if (!draft) {
      reply.status(404);
      return { error: 'Draft not found' };
    }
    return draft;
  });

  // 保存编辑后的终稿
  fastify.post('/:taskId/final-draft/edit', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { content, editedBy } = request.body as any;

    if (!content) {
      reply.status(400);
      return { error: 'content is required' };
    }

    const { saveEditedDraft } = await import('../services/finalDraftEditor.js');
    const result = await saveEditedDraft(taskId, content, editedBy);
    return result;
  });

  // 获取修改痕迹对比
  fastify.get('/:taskId/final-draft/diff', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getEditDiff } = await import('../services/finalDraftEditor.js');
    const diff = await getEditDiff(taskId);
    return { diff };
  });

  // 获取编辑历史
  fastify.get('/:taskId/final-draft/history', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getEditHistory } = await import('../services/finalDraftEditor.js');
    const history = await getEditHistory(taskId);
    return { history };
  });
}
