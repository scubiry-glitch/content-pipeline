// 生产任务路由
// 核心流程: 创建任务 → 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProductionService } from '../services/production.js';
import { evaluateTopic } from '../services/topicEvaluation.js';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db/connection.js';

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

    // 异步执行选题策划重做（不阻塞响应，避免前端超时）
    setImmediate(async () => {
      try {
        await productionService.redoPlanning(taskId, {
          topic: body?.topic,
          context: body?.context,
          comments: body?.comments || [],
          comment: body?.comment
        });
      } catch (error) {
        console.error(`[Redo] Planning failed for task ${taskId}:`, error);
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

  // ===== 串行多轮评审 API (v5.0) =====

  // 配置串行评审
  fastify.post('/:taskId/sequential-review/configure', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;
    const { topic } = request.body as any;

    const { configureSequentialReview } = await import('../services/sequentialReview.js');
    const config = await configureSequentialReview(taskId, topic);

    // 保存配置到任务
    await query(
      `UPDATE tasks SET sequential_review_config = $1 WHERE id = $2`,
      [JSON.stringify(config), taskId]
    );

    return config;
  });

  // 执行串行评审
  fastify.post('/:taskId/sequential-review/conduct', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;

    // 获取任务信息
    const taskResult = await query(
      `SELECT sequential_review_config FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Task not found' };
    }

    const config = taskResult.rows[0].sequential_review_config;
    if (!config) {
      reply.status(400);
      return { error: 'Sequential review not configured. Please call configure endpoint first.' };
    }

    // 异步执行串行评审
    setImmediate(async () => {
      try {
        const { conductSequentialReview } = await import('../services/sequentialReview.js');

        // 获取当前草稿
        const draftResult = await query(
          `SELECT id, task_id, version, content, status FROM draft_versions
           WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
          [taskId]
        );

        if (draftResult.rows.length === 0) {
          console.error(`[SequentialReview] No draft found for task ${taskId}`);
          return;
        }

        const initialDraft = draftResult.rows[0];

        // 获取事实核查和逻辑检查结果
        const checkResult = await query(
          `SELECT fact_check, logic_check FROM blue_team_checks WHERE task_id = $1`,
          [taskId]
        );

        const factCheck = checkResult.rows[0]?.fact_check || { overallScore: 80, claims: [] };
        const logicCheck = checkResult.rows[0]?.logic_check || { overallScore: 80 };

        // 执行串行评审
        const result = await conductSequentialReview(
          taskId,
          initialDraft,
          factCheck,
          logicCheck,
          config
        );

        console.log(`[SequentialReview] Completed for task ${taskId}. Final draft: ${result.finalDraft.id}`);
      } catch (error) {
        console.error(`[SequentialReview] Failed for task ${taskId}:`, error);
      }
    });

    return {
      message: '串行评审已启动',
      taskId,
      expertCount: config.reviewQueue.length,
    };
  });

  // 获取串行评审结果
  fastify.get('/:taskId/sequential-review/results', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;

    const reviewsResult = await query(
      `SELECT * FROM expert_reviews WHERE task_id = $1 ORDER BY round`,
      [taskId]
    );

    const chainResult = await query(
      `SELECT * FROM review_chains WHERE task_id = $1 ORDER BY round`,
      [taskId]
    );

    return {
      reviews: reviewsResult.rows,
      chain: chainResult.rows,
      totalReviews: reviewsResult.rows.length,
      completedReviews: reviewsResult.rows.filter((r: any) => r.status === 'completed').length,
      averageScore: reviewsResult.rows.length > 0
        ? reviewsResult.rows.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / reviewsResult.rows.length
        : 0,
    };
  });

  // 获取单轮评审详情
  fastify.get('/:taskId/sequential-review/round/:round', { preHandler: authenticate }, async (request, reply) => {
    const { taskId, round } = request.params as any;

    const reviewResult = await query(
      `SELECT * FROM expert_reviews WHERE task_id = $1 AND round = $2`,
      [taskId, parseInt(round)]
    );

    if (reviewResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Review round not found' };
    }

    return reviewResult.rows[0];
  });

  // 获取评审进度
  fastify.get('/:taskId/sequential-review/progress', { preHandler: authenticate }, async (request, reply) => {
    const { taskId } = request.params as any;

    const progressResult = await query(
      `SELECT * FROM task_review_progress WHERE task_id = $1`,
      [taskId]
    );

    if (progressResult.rows.length === 0) {
      return {
        taskId,
        progress: 0,
        currentRound: 0,
        totalRounds: 0,
        status: 'not_started',
      };
    }

    const progress = progressResult.rows[0];
    const config = await query(
      `SELECT sequential_review_config FROM tasks WHERE id = $1`,
      [taskId]
    );
    const totalRounds = config.rows[0]?.sequential_review_config?.totalRounds || 5;

    return {
      taskId,
      progress: Math.round((progress.completed_reviews / totalRounds) * 100),
      currentRound: progress.latest_round || 0,
      totalRounds,
      averageScore: progress.avg_score,
      status: progress.completed_reviews >= totalRounds ? 'completed' : 'in_progress',
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

    // 设置 SSE 头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
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
      reply.raw.write(`event: complete\ndata: ${JSON.stringify({ taskId, status: 'completed' })}\n\n`);
      reply.raw.end();

    } catch (error) {
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

    // 设置 SSE 头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
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
}
