// 生产任务服务
// 处理: 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { query } from '../db/connection.js';
import { getQueue } from '../utils/queue-manager.js';
import { PipelineService } from './pipeline.js';
import { generate } from './llm.js';

export interface CreateTaskInput {
  topic: string;
  sourceMaterials: string[];
  targetFormats: string[];
}

export interface ApproveTaskInput {
  approved: boolean;
  feedback?: string;
}

export interface AnnotationInput {
  type: 'url' | 'asset';
  url?: string;
  asset_id?: string;
  title: string;
}

export class ProductionService {
  private jobQueue = getQueue('production');
  private pipelineService = new PipelineService();

  constructor() {}

  async createTask(input: CreateTaskInput) {
    // 使用 PipelineService 创建任务
    const result = await this.pipelineService.createTask({
      topic: input.topic,
      sourceMaterials: input.sourceMaterials,
      targetFormats: input.targetFormats
    });

    // 不再自动处理，等待大纲确认
    return result;
  }

  // 异步处理任务流程
  private async processTask(taskId: string) {
    console.log(`[Pipeline] Starting async processing for task ${taskId}`);

    try {
      // Step 1: Research
      console.log(`[Pipeline] Step 1: Research`);
      await this.pipelineService.research(taskId);
      console.log(`[Pipeline] Step 1: Research completed`);

      // Step 2: Writing
      console.log(`[Pipeline] Step 2: Writing`);
      await this.pipelineService.write(taskId);
      console.log(`[Pipeline] Step 2: Writing completed`);

      // Step 3: BlueTeam Review
      console.log(`[Pipeline] Step 3: BlueTeam Review`);
      const reviewResult = await this.pipelineService.review(taskId);

      console.log(`[Pipeline] Task ${taskId} completed, status: ${reviewResult?.status}`);
    } catch (error: any) {
      console.error(`[Pipeline] Task ${taskId} failed:`, error?.message || error);
      console.error(`[Pipeline] Error stack:`, error?.stack || 'No stack trace');

      // Update task status to failed
      try {
        await query(
          `UPDATE tasks SET status = 'failed', current_stage = 'error', updated_at = NOW() WHERE id = $1`,
          [taskId]
        );
      } catch (dbError) {
        console.error(`[Pipeline] Failed to update task status:`, dbError);
      }
    }
  }

  async listTasks(options: { status?: string; limit: number; offset: number; includeHidden?: boolean }) {
    const { status, limit, offset, includeHidden = false } = options;

    let sql = 'SELECT * FROM tasks';
    const params: any[] = [];
    const conditions: string[] = [];

    // 默认不显示隐藏任务
    if (!includeHidden) {
      conditions.push('(is_hidden = false OR is_hidden IS NULL)');
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) FROM tasks';
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await query(countSql, params.slice(0, -2));

    return {
      total: parseInt(countResult.rows[0].count),
      items: result.rows
    };
  }

  async getTask(taskId: string) {
    const result = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);

    if (result.rows.length === 0) {
      return null;
    }

    const task = result.rows[0];

    // Get BlueTeam reviews if available
    const reviewsResult = await query(
      'SELECT * FROM blue_team_reviews WHERE task_id = $1 ORDER BY round, expert_role',
      [taskId]
    );

    // Get draft versions
    const draftsResult = await query(
      'SELECT * FROM draft_versions WHERE task_id = $1 ORDER BY version',
      [taskId]
    );

    return {
      ...task,
      blue_team_reviews: reviewsResult.rows,
      draft_versions: draftsResult.rows
    };
  }

  async approveTask(taskId: string, input: ApproveTaskInput) {
    const task = await this.getTask(taskId);

    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    if (task.status !== 'awaiting_approval') {
      throw Object.assign(new Error('Task is not awaiting approval'), { name: 'APIError', statusCode: 400 });
    }

    const newStatus = input.approved ? 'completed' : 'revision_needed';

    await query(
      `UPDATE tasks SET status = $1, approval_feedback = $2, updated_at = NOW() WHERE id = $3`,
      [newStatus, input.feedback || null, taskId]
    );

    // If approved, generate final outputs
    if (input.approved) {
      setImmediate(() => this.generateOutput(taskId));
    }

    return {
      id: taskId,
      status: newStatus,
      approved: input.approved,
      updated_at: new Date().toISOString()
    };
  }

  private async generateOutput(taskId: string) {
    try {
      await this.pipelineService.generateOutput(taskId);
      console.log(`[Pipeline] Output generated for task ${taskId}`);
    } catch (error) {
      console.error(`[Pipeline] Output generation failed for task ${taskId}:`, error);
    }
  }

  // Add research annotation
  async addAnnotation(taskId: string, input: AnnotationInput) {
    const result = await query(
      `INSERT INTO research_annotations (id, task_id, type, url, asset_id, title, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [taskId, input.type, input.url || null, input.asset_id || null, input.title]
    );

    // Update task's research_data with annotations
    await query(
      `UPDATE tasks SET
        research_data = COALESCE(research_data, '{}'::jsonb) ||
          jsonb_build_object('annotations',
            COALESCE(research_data->'annotations', '[]'::jsonb) || $1::jsonb
          ),
        updated_at = NOW()
      WHERE id = $2`,
      [JSON.stringify([result.rows[0]]), taskId]
    );

    return result.rows[0];
  }

  // Get annotations for a task
  async getAnnotations(taskId: string) {
    const result = await query(
      `SELECT * FROM research_annotations WHERE task_id = $1 ORDER BY created_at DESC`,
      [taskId]
    );
    return result.rows;
  }

  // Multi-round chat about outline
  async chatAboutOutline(taskId: string, message: string) {
    // Get current task and outline
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows.length === 0) {
      throw new Error('Task not found');
    }

    const task = taskResult.rows[0];
    const outline = task.outline || {};
    const chatHistory = outline.chat_history || [];

    // Add user message
    chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Generate AI response
    const prompt = `你是一个专业的研究报告大纲优化助手。请根据用户的反馈，帮助完善研究大纲。

当前大纲：
${JSON.stringify(outline, null, 2)}

用户反馈：${message}

请给出专业的大纲修改建议，并说明如何调整结构。保持友好、专业的语气。`;

    try {
      const aiResponse = await generate(prompt, 'planning', {
        temperature: 0.7,
        maxTokens: 2000
      });

      const responseText = aiResponse.content;

      // Add AI response to chat history
      chatHistory.push({ role: 'ai', content: responseText, timestamp: new Date().toISOString() });

      // Update task with new chat history
      await query(
        `UPDATE tasks SET
          outline = COALESCE(outline, '{}'::jsonb) || jsonb_build_object('chat_history', $1::jsonb),
          updated_at = NOW()
        WHERE id = $2`,
        [JSON.stringify(chatHistory), taskId]
      );

      return { response: responseText, chat_history: chatHistory };
    } catch (error) {
      console.error('Chat generation failed:', error);
      return { response: '收到您的反馈，我们会将其纳入大纲优化考虑。', chat_history: chatHistory };
    }
  }

  // Get draft versions with diff support
  async getVersions(taskId: string) {
    const result = await query(
      `SELECT * FROM draft_versions WHERE task_id = $1 ORDER BY version ASC`,
      [taskId]
    );

    return result.rows.map(row => ({
      ...row,
      change_summary: row.change_summary || `第${row.version}版修订`
    }));
  }

  // Confirm outline and proceed to research (FR-004 ~ FR-006)
  async confirmOutline(taskId: string, updates?: { outline?: any; confirmed?: boolean }) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    if (task.status !== 'outline_pending') {
      throw Object.assign(new Error('Task is not waiting for outline confirmation'), { name: 'APIError', statusCode: 400 });
    }

    // If user rejected, mark as cancelled
    if (updates?.confirmed === false) {
      await query(
        `UPDATE tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [taskId]
      );
      return { id: taskId, status: 'cancelled', message: '大纲已拒绝，任务取消' };
    }

    // Update outline if modified by user
    if (updates?.outline) {
      await query(
        `UPDATE tasks SET outline = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updates.outline), taskId]
      );
    }

    // Call pipeline service to confirm and start research
    const result = await this.pipelineService.confirmOutline(taskId);
    return result;
  }

  // Get BlueTeam reviews formatted for display (FR-017 ~ FR-023)
  async getBlueTeamReviews(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    // Get reviews from database
    const reviewsResult = await query(
      'SELECT * FROM blue_team_reviews WHERE task_id = $1 ORDER BY round, expert_role',
      [taskId]
    );

    // Group by expert/angle with severity classification
    const experts = {
      factChecker: { name: '事实核查员', role: 'challenger', icon: '🔍', issues: [] as any[] },
      logicChecker: { name: '逻辑检察官', role: 'expander', icon: '⚖️', issues: [] as any[] },
      industryExpert: { name: '行业专家', role: 'synthesizer', icon: '👔', issues: [] as any[] },
      readerRep: { name: '读者代表', role: 'reader', icon: '👁️', issues: [] as any[] }
    };

    const summary = {
      total: 0,
      critical: 0,
      warning: 0,
      praise: 0,
      accepted: 0,
      pending: 0
    };

    for (const row of reviewsResult.rows) {
      const question = typeof row.questions === 'string'
        ? JSON.parse(row.questions)
        : row.questions;

      const severity = question.severity === 'high' ? 'critical'
        : question.severity === 'medium' ? 'warning'
        : 'praise';

      summary.total++;
      summary[severity]++;

      const issue = {
        id: row.id,
        round: row.round,
        expert: row.expert_role,
        severity,
        location: question.location || '全文',
        question: question.question,
        suggestion: question.suggestion,
        rationale: question.rationale,
        status: row.status || 'pending' // pending, accepted, ignored, resolved
      };

      // Categorize by expert role
      if (row.expert_role === 'challenger') {
        experts.factChecker.issues.push(issue);
      } else if (row.expert_role === 'expander') {
        experts.logicChecker.issues.push(issue);
      } else if (row.expert_role === 'synthesizer') {
        experts.industryExpert.issues.push(issue);
      } else {
        experts.readerRep.issues.push(issue);
      }
    }

    return {
      taskId,
      status: task.status,
      summary,
      experts: Object.values(experts).filter(e => e.issues.length > 0),
      rawReviews: reviewsResult.rows
    };
  }

  // Accept a review suggestion
  async acceptReviewSuggestion(taskId: string, reviewId: string) {
    await query(
      `UPDATE blue_team_reviews SET status = 'accepted', updated_at = NOW() WHERE id = $1 AND task_id = $2`,
      [reviewId, taskId]
    );
    return { success: true, reviewId, status: 'accepted' };
  }

  // ========== 环节重做功能 ==========

  // 1. 选题策划重做 - 重新生成大纲
  async redoPlanning(taskId: string, updates?: { topic?: string; context?: string }) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    console.log(`[Redo] Restarting planning for task ${taskId}`);

    // 清空后续环节的数据
    await query(
      `UPDATE tasks SET
        outline = NULL,
        research_data = NULL,
        status = 'planning',
        progress = 5,
        current_stage = 'regenerating_outline',
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );

    // 删除之前的评审和稿件版本
    await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);

    // 重新生成大纲（使用更新后的主题/背景）
    const topic = updates?.topic || task.topic;
    const context = updates?.context || task.context;

    const outline = await this.pipelineService.regenerateOutline(taskId, topic, context);

    // 更新任务
    await query(
      `UPDATE tasks SET
        topic = $1,
        outline = $2,
        status = 'planning_completed',
        progress = 15,
        current_stage = 'planning_completed',
        updated_at = NOW()
      WHERE id = $3`,
      [topic, JSON.stringify(outline), taskId]
    );

    return {
      id: taskId,
      status: 'planning_completed',
      outline,
      message: '选题策划已重做，大纲已重新生成'
    };
  }

  // 2. 深度研究重做 - 重新执行研究
  async redoResearch(taskId: string, searchConfig?: { maxSearchUrls?: number; enableWebSearch?: boolean }) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    console.log(`[Redo] Restarting research for task ${taskId}`);

    // 清空研究和后续数据
    await query(
      `UPDATE tasks SET
        research_data = NULL,
        status = 'researching',
        progress = 20,
        current_stage = 're_researching',
        search_config = COALESCE($1, search_config),
        updated_at = NOW()
      WHERE id = $2`,
      [searchConfig ? JSON.stringify(searchConfig) : null, taskId]
    );

    // 删除之前的评审和稿件版本
    await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);

    // 重新执行研究
    await this.pipelineService.research(taskId);

    return {
      id: taskId,
      status: 'research_completed',
      message: '深度研究已重做，数据已重新收集'
    };
  }

  // 3. 文稿生成重做 - 重新生成初稿
  async redoWriting(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    console.log(`[Redo] Restarting writing for task ${taskId}`);

    // 清空稿件和评审数据
    await query(
      `UPDATE tasks SET
        status = 'writing',
        progress = 40,
        current_stage = 'regenerating_draft',
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );

    // 删除之前的评审和稿件版本
    await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);

    // 重新生成初稿
    await this.pipelineService.write(taskId);

    return {
      id: taskId,
      status: 'writing_completed',
      message: '文稿生成已重做，初稿已重新生成'
    };
  }

  // 4. 蓝军评审重做 - 重新执行评审
  async redoReview(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    console.log(`[Redo] Restarting BlueTeam review for task ${taskId}`);

    // 清空评审数据
    await query(
      `UPDATE tasks SET
        status = 'reviewing',
        progress = 70,
        current_stage = 're_reviewing',
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );

    // 删除之前的评审
    await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);

    // 保留最新版稿件，删除其他版本
    await query(
      `DELETE FROM draft_versions
       WHERE task_id = $1
       AND id NOT IN (
         SELECT id FROM draft_versions
         WHERE task_id = $1
         ORDER BY version DESC
         LIMIT 1
       )`,
      [taskId]
    );

    // 重新执行评审
    await this.pipelineService.review(taskId);

    return {
      id: taskId,
      status: 'awaiting_approval',
      message: '蓝军评审已重做，评审结果已更新'
    };
  }

  // 从指定环节重新开始完整流程
  async restartFromStage(taskId: string, stage: 'planning' | 'research' | 'writing' | 'review') {
    switch (stage) {
      case 'planning':
        return this.redoPlanning(taskId);
      case 'research':
        return this.redoResearch(taskId);
      case 'writing':
        return this.redoWriting(taskId);
      case 'review':
        return this.redoReview(taskId);
      default:
        throw Object.assign(new Error('Invalid stage'), { name: 'APIError', statusCode: 400 });
    }
  }

  // ===== 任务删除和隐藏功能 =====

  async deleteTask(taskId: string) {
    // 检查任务是否存在
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    // 删除关联数据
    await query('DELETE FROM blue_team_reviews WHERE task_id = $1', [taskId]);
    await query('DELETE FROM draft_versions WHERE task_id = $1', [taskId]);
    await query('DELETE FROM research_annotations WHERE task_id = $1', [taskId]);

    // 删除任务
    await query('DELETE FROM tasks WHERE id = $1', [taskId]);

    return {
      id: taskId,
      message: '任务已删除',
      deletedAt: new Date().toISOString()
    };
  }

  async hideTask(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    await query(
      `UPDATE tasks SET is_hidden = true, updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    return {
      id: taskId,
      isHidden: true,
      message: '任务已隐藏'
    };
  }

  async unhideTask(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    await query(
      `UPDATE tasks SET is_hidden = false, updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    return {
      id: taskId,
      isHidden: false,
      message: '任务已取消隐藏'
    };
  }

  async listHiddenTasks(options: { limit: number; offset: number }) {
    const { limit, offset } = options;

    const result = await query(
      `SELECT * FROM tasks WHERE is_hidden = true ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM tasks WHERE is_hidden = true`
    );

    return {
      total: parseInt(countResult.rows[0].count),
      items: result.rows
    };
  }
}
