// 生产任务路由
// 核心流程: 创建任务 → 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProductionService } from '../services/production.js';
import { evaluateTopic } from '../services/topicEvaluation.js';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db/connection.js';
import { withTimeout } from '../utils/timeout.js';

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

  // Update task (including asset association)
  fastify.put('/:taskId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = request.body as any;

    // Check if task exists
    const existingTask = await productionService.getTask(taskId);
    if (!existingTask) {
      reply.status(404);
      return { error: 'Task not found', code: 'TASK_NOT_FOUND' };
    }

    // Update asset_ids if provided
    if (body.asset_ids !== undefined) {
      await query(
        `UPDATE tasks SET asset_ids = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(body.asset_ids), taskId]
      );
    }

    // Update other fields if needed
    if (body.topic !== undefined) {
      await query(
        `UPDATE tasks SET topic = $1, updated_at = NOW() WHERE id = $2`,
        [body.topic, taskId]
      );
    }

    // Return updated task
    const updatedTask = await productionService.getTask(taskId);
    return updatedTask;
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
    const { includeHistorical } = request.query as { includeHistorical?: string };
    // 默认包含历史评审记录，前端可按 is_historical 标识区分显示
    const reviews = await productionService.getBlueTeamReviews(taskId, includeHistorical !== 'false');
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

  // 提交单个评审项决策（支持 question 级别）
  fastify.post('/:taskId/review-items/:reviewId/decide', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, reviewId } = request.params as any;
    const { decision, note, questionIndex } = request.body as any;

    if (!decision || !['accept', 'ignore', 'manual_resolved'].includes(decision)) {
      reply.status(400);
      return { error: 'Invalid decision. Must be one of: accept, ignore, manual_resolved' };
    }

    const { submitDecision } = await import('../services/reviewDecision.js');
    const result = await submitDecision(taskId, reviewId, decision, note, questionIndex);
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

  // 最终确认任务 - Finalize（异步版本）
  fastify.post('/:taskId/finalize', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { selectedReviewIds, force } = request.body as { selectedReviewIds?: string[]; force?: boolean };
    
    try {
      const { startAsyncFinalize } = await import('../services/asyncFinalize.js');
      const result = await startAsyncFinalize(taskId, selectedReviewIds, force);
      
      if (!result.success) {
        reply.status(400);
        return { error: result.error };
      }
      
      return {
        success: true,
        jobId: result.jobId,
        message: 'Finalize 任务已启动，请通过状态接口查询进度',
        status: 'doing'
      };
    } catch (error) {
      reply.status(500);
      return { error: (error as Error).message };
    }
  });

  // 查询 Finalize 状态
  fastify.get('/:taskId/finalize-status', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    
    try {
      const { getFinalizeStatus } = await import('../services/asyncFinalize.js');
      const status = getFinalizeStatus(taskId);
      
      if (!status) {
        reply.status(404);
        return { error: '未找到 Finalize 任务' };
      }
      
      return status;
    } catch (error) {
      reply.status(500);
      return { error: (error as Error).message };
    }
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

  // 批量应用已接受的评审意见（一次 LLM 调用生成一个新版本）
  fastify.post('/:taskId/apply-revisions', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;

    try {
      const { applyAllAcceptedRevisions } = await import('../services/revisionAgent.js');
      const result = await applyAllAcceptedRevisions(taskId);

      if (!result.success) {
        reply.status(400);
        return { error: result.error };
      }

      return {
        success: true,
        newDraftId: result.newDraftId,
        newVersion: result.newVersion,
        appliedCount: result.appliedCount,
        message: `已应用 ${result.appliedCount} 条评审意见，生成版本 v${result.newVersion}`,
      };
    } catch (error) {
      reply.status(500);
      return { error: (error as Error).message };
    }
  });

  // ===== 环节重做 API =====

  // 1. 选题策划重做
  fastify.post('/:taskId/redo/planning', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = (request.body || {}) as any;

    // 异步执行选题策划重做（带超时控制）
    setImmediate(async () => {
      try {
        await withTimeout(
          productionService.redoPlanning(taskId, {
            topic: body?.topic,
            context: body?.context,
            comments: body?.comments || [],
            comment: body?.comment
          }),
          5 * 60 * 1000,
          `Planning redo for ${taskId}`
        );
      } catch (error) {
        console.error(`[Redo] Planning failed/timed out for task ${taskId}:`, error);
        await query(
          `UPDATE tasks SET status = 'failed', current_stage = 'planning_failed', updated_at = NOW() WHERE id = $1`,
          [taskId]
        );
      }
    });

    return {
      message: '选题策划重做已启动',
      taskId,
      status: 'planning'
    };
  });

  // 2. 深度研究重做
  fastify.post('/:taskId/redo/research', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const body = request.body as any;

    // 异步执行研究（带超时控制）
    setImmediate(async () => {
      try {
        await withTimeout(
          productionService.redoResearch(taskId, body?.searchConfig),
          5 * 60 * 1000,
          `Research redo for ${taskId}`
        );
      } catch (error) {
        console.error(`[Redo] Research failed/timed out for task ${taskId}:`, error);
        await query(
          `UPDATE tasks SET status = 'failed', current_stage = 'research_failed', updated_at = NOW() WHERE id = $1`,
          [taskId]
        );
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

    // 异步执行写作（带超时控制）
    setImmediate(async () => {
      try {
        await withTimeout(
          productionService.redoWriting(taskId),
          10 * 60 * 1000,
          `Writing redo for ${taskId}`
        );
      } catch (error) {
        console.error(`[Redo] Writing failed/timed out for task ${taskId}:`, error);
        await query(
          `UPDATE tasks SET status = 'failed', current_stage = 'writing_failed', updated_at = NOW() WHERE id = $1`,
          [taskId]
        );
      }
    });

    return {
      message: '文稿生成重做已启动',
      taskId,
      status: 'writing'
    };
  });

  // 4. 蓝军评审重做（支持配置）
  fastify.post('/:taskId/redo/review', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { config, preserveHistory } = request.body as { config?: any; preserveHistory?: boolean };

    // 同步准备阶段：更新状态、配置评审队列（让前端能立即连接 SSE）
    const prepResult = await productionService.prepareRedoReview(taskId, config, preserveHistory);

    // 异步执行评审（长时间运行，带超时控制）
    setImmediate(async () => {
      try {
        console.log(`[Redo] Starting review execution for task ${taskId}...`);
        await withTimeout(
          productionService.executeRedoReview(taskId, config, prepResult.isSequential),
          15 * 60 * 1000,
          `Review redo for ${taskId}`
        );
        console.log(`[Redo] Review redo completed for task ${taskId}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error(`[Redo] Review failed/timed out for task ${taskId}:`, errorMsg);
        console.error(`[Redo] Error stack:`, errorStack);

        // 记录错误到任务日志
        await query(
          `INSERT INTO task_logs (task_id, action, details, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [taskId, 'review_redo_failed', JSON.stringify({ error: errorMsg, stack: errorStack })]
        );

        await query(
          `UPDATE tasks SET status = 'failed', current_stage = 'review_failed', updated_at = NOW() WHERE id = $1`,
          [taskId]
        );
      }
    });

    return {
      message: prepResult.isSequential ? '串行评审已启动' : '蓝军评审重做已启动',
      taskId,
      mode: prepResult.isSequential ? 'sequential' : 'parallel',
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

  // ===== 大纲评论 API =====

  // 添加大纲评论
  fastify.post('/:taskId/outline/comments', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { content, createdBy = 'user' } = request.body as any;

    if (!content || content.trim().length === 0) {
      reply.status(400);
      return { error: 'Comment content is required' };
    }

    const result = await query(
      `INSERT INTO outline_comments (task_id, content, created_by, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [taskId, content, createdBy]
    );

    reply.status(201);
    return result.rows[0];
  });

  // 获取大纲评论列表
  fastify.get('/:taskId/outline/comments', { preHandler: authenticate }, async (request) => {
    const { taskId } = request.params as any;
    const result = await query(
      `SELECT * FROM outline_comments 
       WHERE task_id = $1 
       ORDER BY created_at DESC`,
      [taskId]
    );
    return { items: result.rows };
  });

  // 删除大纲评论
  fastify.delete('/:taskId/outline/comments/:commentId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, commentId } = request.params as any;
    await query(
      `DELETE FROM outline_comments WHERE id = $1 AND task_id = $2`,
      [commentId, taskId]
    );
    reply.status(204);
  });

  // ===== 大纲版本历史 API =====

  // 获取大纲版本历史
  fastify.get('/:taskId/outline/versions', { preHandler: authenticate }, async (request) => {
    const { taskId } = request.params as any;
    const result = await query(
      `SELECT id, version, comment, created_by, created_at 
       FROM outline_versions 
       WHERE task_id = $1 
       ORDER BY version DESC`,
      [taskId]
    );
    return { items: result.rows };
  });

  // 获取特定版本的大纲
  fastify.get('/:taskId/outline/versions/:version', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, version } = request.params as any;
    const result = await query(
      `SELECT * FROM outline_versions 
       WHERE task_id = $1 AND version = $2`,
      [taskId, parseInt(version)]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Version not found' };
    }

    return result.rows[0];
  });

  // 比较两个版本的大纲
  fastify.post('/:taskId/outline/compare', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { version1, version2 } = request.body as any;

    if (!version1 || !version2) {
      reply.status(400);
      return { error: 'Both version1 and version2 are required' };
    }

    const [v1Result, v2Result] = await Promise.all([
      query(`SELECT * FROM outline_versions WHERE task_id = $1 AND version = $2`, [taskId, version1]),
      query(`SELECT * FROM outline_versions WHERE task_id = $1 AND version = $2`, [taskId, version2])
    ]);

    if (v1Result.rows.length === 0 || v2Result.rows.length === 0) {
      reply.status(404);
      return { error: 'One or both versions not found' };
    }

    // 简单的对比逻辑：返回两个版本的差异
    const v1 = v1Result.rows[0];
    const v2 = v2Result.rows[0];

    return {
      version1: { version: v1.version, created_at: v1.created_at },
      version2: { version: v2.version, created_at: v2.created_at },
      outline1: v1.outline,
      outline2: v2.outline
    };
  });

  // ===== 流式文稿生成 API (v5.0 新增) =====

  // 查询文稿生成进度
  fastify.get('/:taskId/draft/progress', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getDraftProgress } = await import('../services/streamingDraft.js');
    const progress = await getDraftProgress(taskId);

    if (!progress) {
      return {
        status: 'not_started',
        currentSection: 0,
        totalSections: 0,
        currentTitle: '',
        generatedWordCount: 0,
        estimatedTotalWordCount: 0,
        progress: 0,
        sections: [],
        accumulatedContent: ''
      };
    }

    return progress;
  });

  // 启动流式文稿生成（SSE 推送）
  fastify.get('/:taskId/draft/generate-stream', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { generateDraftStreaming, getDraftProgress } = await import('../services/streamingDraft.js');

    // 设置 SSE 头（包含 CORS）
    const origin = request.headers.origin || '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    const task = await productionService.getTask(taskId);
    if (!task) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'Task not found' })}\n\n`);
      reply.raw.end();
      return;
    }

    const outline = typeof task.outline === 'string' ? JSON.parse(task.outline) : task.outline;
    const researchData = typeof task.research_data === 'string'
      ? JSON.parse(task.research_data)
      : task.research_data;

    // SSE 服务端超时（10分钟）
    const SSE_TIMEOUT = 10 * 60 * 1000;
    const sseTimer = setTimeout(() => {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: '生成超时，请重试' })}\n\n`);
      reply.raw.end();
    }, SSE_TIMEOUT);

    try {
      // 推送开始事件
      reply.raw.write(`event: start\ndata: ${JSON.stringify({ taskId, totalSections: countSections(outline) })}\n\n`);

      // 执行流式生成
      await generateDraftStreaming({
        taskId,
        topic: task.topic,
        outline,
        researchData,
        style: 'formal',
        options: { includeContext: true, realtimePreview: true, saveProgress: true }
      }, async (progress) => {
        // 推送进度更新
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
      });

      // 推送完成事件
      clearTimeout(sseTimer);
      reply.raw.write(`event: complete\ndata: ${JSON.stringify({ taskId, status: 'completed' })}\n\n`);
      reply.raw.end();

    } catch (error) {
      clearTimeout(sseTimer);
      console.error('[DraftStream] Generation failed:', error);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`);
      reply.raw.end();
    }
  });

  // 辅助函数：计算大纲段落数
  function countSections(outline: any): number {
    let count = 0;
    const traverse = (nodes: any[]) => {
      for (const node of nodes) {
        count++;
        if (node.subsections?.length) traverse(node.subsections);
      }
    };
    traverse(outline.sections || outline || []);
    return count;
  }

  // ===== Stage4 蓝军评审后流式修改 API (v5.0 新增) =====

  // 查询修订进度
  fastify.get('/:taskId/draft/:draftId/revision/progress', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, draftId } = request.params as any;
    const { getRevisionProgress } = await import('../services/streamingRevision.js');
    const progress = await getRevisionProgress(taskId, draftId);

    if (!progress) {
      return {
        status: 'not_started',
        currentIndex: 0,
        total: 0,
        currentTitle: '',
        revisedWordCount: 0,
        totalWordCount: 0,
        progress: 0,
        sections: [],
        appliedSuggestions: 0,
        totalSuggestions: 0,
        accumulatedContent: ''
      };
    }

    return progress;
  });

  // 启动流式修订（SSE 推送）
  fastify.post('/:taskId/draft/:draftId/revision/stream', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, draftId } = request.params as any;
    const { suggestions, revisionMode = 'balanced' } = request.body as any;

    if (!suggestions || !Array.isArray(suggestions)) {
      reply.status(400);
      return { error: 'suggestions array is required' };
    }

    const { reviseDraftStreaming, getRevisionProgress } = await import('../services/streamingRevision.js');

    // 获取任务和草稿信息
    const task = await productionService.getTask(taskId);
    if (!task) {
      reply.status(404);
      return { error: 'Task not found' };
    }

    const draftResult = await query(
      `SELECT content, outline FROM draft_versions WHERE id = $1 AND task_id = $2`,
      [draftId, taskId]
    );

    if (draftResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Draft not found' };
    }

    const draft = draftResult.rows[0];
    const outline = typeof draft.outline === 'string' ? JSON.parse(draft.outline) : draft.outline;

    // 设置 SSE 头（包含 CORS）
    const origin = request.headers.origin || '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    try {
      // 推送开始事件
      reply.raw.write(`event: start\ndata: ${JSON.stringify({
        taskId,
        draftId,
        totalSuggestions: suggestions.length,
        mode: revisionMode
      })}\n\n`);

      // 执行流式修订
      const result = await reviseDraftStreaming({
        taskId,
        draftId,
        topic: task.topic,
        outline,
        originalContent: draft.content,
        suggestions,
        revisionMode,
        options: { includeContext: true, realtimePreview: true, saveProgress: true, saveVersions: true }
      }, async (progress) => {
        // 推送进度更新
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
      });

      // 推送完成事件
      reply.raw.write(`event: complete\ndata: ${JSON.stringify({
        revisionId: result.revisionId,
        newDraftId: result.draftId,
        version: result.version,
        appliedSuggestions: result.appliedSuggestions,
        wordCount: countWords(result.content)
      })}\n\n`);
      reply.raw.end();

    } catch (error) {
      console.error('[RevisionStream] Revision failed:', error);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`);
      reply.raw.end();
    }
  });

  // 获取修订历史
  fastify.get('/:taskId/revisions', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getRevisionHistory } = await import('../services/streamingRevision.js');
    const history = await getRevisionHistory(taskId);
    return { items: history };
  });

  // 获取版本对比
  fastify.get('/:taskId/draft/:draftId/diff/:newDraftId', { preHandler: authenticate }, async (request, reply) => {
    const { draftId, newDraftId } = request.params as any;
    const { getRevisionDiff } = await import('../services/streamingRevision.js');
    const diff = await getRevisionDiff(draftId, newDraftId);
    return diff;
  });

  // 获取版本树（版本历史链）
  fastify.get('/:taskId/version-tree', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const result = await query(
      `SELECT * FROM draft_version_tree WHERE task_id = $1 ORDER BY version_path`,
      [taskId]
    );
    return { items: result.rows };
  });

  // 获取中间版本列表
  fastify.get('/:taskId/draft/:draftId/intermediate-versions', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, draftId } = request.params as any;
    const result = await query(
      `SELECT * FROM draft_intermediate_versions 
       WHERE task_id = $1 AND parent_draft_id = $2 
       ORDER BY version, sub_version`,
      [taskId, draftId]
    );
    return { items: result.rows };
  });

  // 回滚到指定版本
  fastify.post('/:taskId/draft/:draftId/rollback', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, draftId } = request.params as any;
    const { version } = request.body as any;

    if (!version) {
      reply.status(400);
      return { error: 'version is required' };
    }

    // 查找目标版本
    const targetResult = await query(
      `SELECT * FROM draft_versions WHERE task_id = $1 AND version = $2`,
      [taskId, version]
    );

    if (targetResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Version not found' };
    }

    const targetVersion = targetResult.rows[0];

    // 创建回滚记录
    await query(
      `INSERT INTO draft_revisions (task_id, draft_id, new_draft_id, version, mode, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [taskId, draftId, targetVersion.id, version, 'rollback']
    );

    return {
      success: true,
      message: `Rolled back to version ${version}`,
      draftId: targetVersion.id,
      version
    };
  });

  // 辅助函数：统计字数
  function countWords(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  // ===== 串行评审 API (Sequential Review) =====

  // 获取串行评审状态
  fastify.get('/:taskId/sequential-review/status', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getSequentialReviewProgress } = await import('../services/sequentialReview.js');
    
    const progress = await getSequentialReviewProgress(taskId);
    if (!progress) {
      reply.status(404);
      return { error: 'Sequential review not configured for this task' };
    }
    
    return {
      taskId,
      status: progress.status,
      totalRounds: progress.total_rounds,
      currentRound: progress.current_round,
      reviewQueue: progress.review_queue,
      currentDraftId: progress.current_draft_id,
      finalDraftId: progress.final_draft_id,
      startedAt: progress.started_at,
      completedAt: progress.completed_at,
    };
  });

  // 配置串行评审
  fastify.post('/:taskId/sequential-review/configure', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { topic } = request.body as any;
    
    const { configureSequentialReview } = await import('../services/sequentialReview.js');
    const config = await configureSequentialReview(taskId, topic);
    
    return {
      success: true,
      taskId,
      totalRounds: config.totalRounds,
      reviewQueue: config.reviewQueue.map((e, i) => ({
        round: i + 1,
        name: e.name,
        type: e.type,
        role: e.role,
        profile: e.profile,
      })),
    };
  });

  // 启动串行评审
  fastify.post('/:taskId/sequential-review/start', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { draftId } = request.body as any;
    
    const draftResult = await query(
      `SELECT content FROM draft_versions WHERE id = \$1 AND task_id = \$2`,
      [draftId, taskId]
    );
    
    if (draftResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Draft not found' };
    }
    
    const { startSequentialReview } = await import('../services/sequentialReview.js');
    const result = await startSequentialReview(taskId, draftId, draftResult.rows[0].content);
    
    return result;
  });

  // 获取评审链
  fastify.get('/:taskId/sequential-review/chain', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getReviewChain } = await import('../services/sequentialReview.js');
    
    const chain = await getReviewChain(taskId);
    return {
      taskId,
      chain: chain.map((item: any) => ({
        round: item.round,
        expertName: item.expert_name,
        expertRole: item.expert_role,
        inputDraftId: item.input_draft_id,
        outputDraftId: item.output_draft_id,
        score: item.score,
        status: item.status,
        createdAt: item.created_at,
      })),
    };
  });

  // 获取版本列表
  fastify.get('/:taskId/sequential-review/versions', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { getDraftVersions } = await import('../services/sequentialReview.js');
    
    const versions = await getDraftVersions(taskId);
    return {
      taskId,
      versions: versions.map((v: any) => ({
        id: v.id,
        version: v.version,
        round: v.round,
        expertName: v.expert_name,
        expertRole: v.expert_role,
        changeSummary: v.change_summary,
        previousVersionId: v.previous_version_id,
        createdAt: v.created_at,
      })),
    };
  });

  // 获取单个 draft 版本内容
  fastify.get('/:taskId/drafts/:draftId', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, draftId } = request.params as any;
    
    // 验证 draftId 是否为有效的 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(draftId)) {
      reply.status(400);
      return { error: 'Invalid draft ID format', details: `ID must be a valid UUID, got: ${draftId}` };
    }
    
    try {
      const draftResult = await query(
        `SELECT id, task_id, version, content, change_summary, round, expert_role, created_at 
         FROM draft_versions 
         WHERE id = $1 AND task_id = $2`,
        [draftId, taskId]
      );
      
      if (draftResult.rows.length === 0) {
        reply.status(404);
        return { error: 'Draft version not found' };
      }
      
      const draft = draftResult.rows[0];
      return {
        id: draft.id,
        taskId: draft.task_id,
        version: draft.version,
        round: draft.round,
        expertRole: draft.expert_role,
        content: draft.content,
        changeSummary: draft.change_summary,
        createdAt: draft.created_at,
      };
    } catch (err: any) {
      console.error('[Draft API] Error fetching draft:', err);
      reply.status(500);
      return { error: 'Internal server error', details: err.message };
    }
  });
}
