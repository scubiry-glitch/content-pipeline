// 生产任务服务
// 处理: 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { query } from '../db/connection.js';
import { getQueue } from '../utils/queue-manager.js';
import { PipelineService } from './pipeline.js';
import { generate } from './llm.js';
import { evaluateSource } from './sourceCredibility.js';

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
    // 如果是URL类型，评估信源可信度
    let credibility = null;
    if (input.type === 'url' && input.url) {
      const credibilityResult = evaluateSource(input.url);
      credibility = {
        level: credibilityResult.level,
        score: credibilityResult.score,
        reason: credibilityResult.reason
      };
    }

    const result = await query(
      `INSERT INTO research_annotations (id, task_id, type, url, asset_id, title, credibility, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [taskId, input.type, input.url || null, input.asset_id || null, input.title, credibility ? JSON.stringify(credibility) : null]
    );

    // Update task's research_data with annotations
    const annotationWithCredibility = {
      ...result.rows[0],
      credibility
    };

    await query(
      `UPDATE tasks SET
        research_data = COALESCE(research_data, '{}'::jsonb) ||
          jsonb_build_object('annotations',
            COALESCE(research_data->'annotations', '[]'::jsonb) || $1::jsonb
          ),
        updated_at = NOW()
      WHERE id = $2`,
      [JSON.stringify([annotationWithCredibility]), taskId]
    );

    return annotationWithCredibility;
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
  async getBlueTeamReviews(taskId: string, includeHistorical: boolean = false) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    // Get parallel reviews (blue_team_reviews), 默认排除历史记录
    const reviewsResult = await query(
      includeHistorical
        ? 'SELECT * FROM blue_team_reviews WHERE task_id = $1 ORDER BY round, expert_role'
        : 'SELECT * FROM blue_team_reviews WHERE task_id = $1 AND (is_historical IS NULL OR is_historical = false) ORDER BY round, expert_role',
      [taskId]
    );

    // Get sequential reviews (expert_reviews) and convert to same format
    const sequentialReviewsResult = await query(
      `SELECT 
        id,
        task_id,
        round,
        expert_role,
        expert_name,
        questions,
        status,
        created_at,
        completed_at as decided_at
      FROM expert_reviews 
      WHERE task_id = $1 
      ORDER BY round`,
      [taskId]
    );

    // Merge sequential reviews into the results
    const allReviews = [...reviewsResult.rows];
    for (const seqReview of sequentialReviewsResult.rows) {
      // Only add if not already exists (avoid duplicates)
      const exists = allReviews.some(r => 
        r.round === seqReview.round && 
        (r.expert_role === seqReview.expert_role || r.expert_name === seqReview.expert_name)
      );
      if (!exists) {
        allReviews.push({
          ...seqReview,
          expert_role: seqReview.expert_role || 'domain_expert',
          user_decision: null,
          decision_note: null
        });
      }
    }

    // Get question-level decisions
    const questionDecisionsResult = await query(
      'SELECT review_id, question_index, decision, note FROM question_decisions WHERE task_id = $1',
      [taskId]
    );
    
    // Build a map of question decisions for quick lookup
    const questionDecisionsMap = new Map<string, Map<number, { decision: string; note?: string }>>();
    for (const qd of questionDecisionsResult.rows) {
      if (!questionDecisionsMap.has(qd.review_id)) {
        questionDecisionsMap.set(qd.review_id, new Map());
      }
      questionDecisionsMap.get(qd.review_id)!.set(qd.question_index, {
        decision: qd.decision,
        note: qd.note
      });
    }

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
      pending: 0,
      ignored: 0
    };

    // Process reviews with question-level decisions
    const processedReviews = allReviews.map(row => {
      const questions = typeof row.questions === 'string'
        ? JSON.parse(row.questions)
        : row.questions;
      const questionsArray = Array.isArray(questions) ? questions : [questions];
      
      // Merge question decisions into questions
      const reviewDecisions = questionDecisionsMap.get(row.id);
      const processedQuestions = questionsArray.map((q: any, idx: number) => {
        const qd = reviewDecisions?.get(idx);
        return {
          ...q,
          decision: qd?.decision || null,
          decisionNote: qd?.note || null
        };
      });
      
      return {
        ...row,
        questions: processedQuestions
      };
    });

    for (const row of processedReviews) {
      const questionsArray = row.questions;
      const reviewStatus = row.status || 'pending';

      for (let idx = 0; idx < questionsArray.length; idx++) {
        const question = questionsArray[idx];
        const severity = question.severity === 'high' ? 'critical'
          : question.severity === 'medium' ? 'warning'
          : 'praise';

        summary.total++;
        summary[severity]++;

        // Use question-level decision if available, otherwise fall back to review status
        const questionStatus = question.decision || reviewStatus;

        const issue = {
          id: `${row.id}-${question.id || idx}`,
          round: row.round,
          expert: row.expert_role,
          severity,
          location: question.location || '全文',
          question: question.question,
          suggestion: question.suggestion,
          rationale: question.rationale,
          status: questionStatus,
          userDecision: row.user_decision,
          decisionNote: row.decision_note,
          decidedAt: row.decided_at,
          questionDecision: question.decision,
          questionDecisionNote: question.decisionNote
        };

        // Count by decision status (question-level or review-level)
        if (questionStatus === 'accept' || questionStatus === 'accepted' || questionStatus === 'manual_resolved') {
          summary.accepted++;
        } else if (questionStatus === 'ignore' || questionStatus === 'ignored') {
          summary.ignored++;
        } else {
          summary.pending++;
        }

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
    }

    return {
      taskId,
      status: task.status,
      summary,
      experts: Object.values(experts).filter(e => e.issues.length > 0),
      rawReviews: processedReviews
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

  // 1. 选题策划重做 - 重新生成大纲（异步执行）
  async redoPlanning(taskId: string, updates?: { topic?: string; context?: string; comments?: string[]; comment?: string }) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    console.log(`[Redo] Restarting planning for task ${taskId}`);

    // 1. 保存当前大纲到历史版本表（如果有）
    if (task.outline) {
      const versionResult = await query(
        `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
         FROM outline_versions WHERE task_id = $1`,
        [taskId]
      );
      const nextVersion = versionResult.rows[0].next_version;

      await query(
        `INSERT INTO outline_versions (task_id, version, outline, comment, created_by, created_at)
         VALUES ($1, $2, $3, $4, 'user', NOW())`,
        [taskId, nextVersion, JSON.stringify(task.outline), updates?.comment || '重做前版本']
      );
      console.log(`[Redo] Saved current outline as version ${nextVersion}`);
    }

    // 2. 清空后续环节的数据
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

    // 3. 删除之前的评审和稿件版本
    await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);

    // 4. 异步重新生成大纲（避免前端超时）
    const topic = updates?.topic || task.topic;
    const context = updates?.context || task.context;
    const comments = updates?.comments || [];

    setImmediate(async () => {
      try {
        console.log(`[Redo] Async generating outline for task ${taskId} with ${comments.length} comments`);
        const outline = await this.pipelineService.regenerateOutline(taskId, topic, context, comments);
        
        // 5. 更新任务
        await query(
          `UPDATE tasks SET
            topic = $1,
            outline = $2,
            status = 'outline_pending',
            progress = 10,
            current_stage = 'outline_pending',
            updated_at = NOW()
          WHERE id = $3`,
          [topic, JSON.stringify(outline), taskId]
        );
        console.log(`[Redo] Outline generated successfully for task ${taskId}`);
      } catch (error: any) {
        console.error(`[Redo] Failed to regenerate outline for task ${taskId}:`, error);
        // 更新任务状态为失败
        await query(
          `UPDATE tasks SET
            current_stage = 'regenerate_failed',
            updated_at = NOW()
          WHERE id = $1`,
          [taskId]
        );
      }
    });

    // 立即返回，不等待大纲生成完成
    return {
      id: taskId,
      status: 'planning',
      current_stage: 'regenerating_outline',
      message: '选题策划重做已启动，大纲生成中...'
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

  // 4a. 蓝军评审重做 - 准备阶段（同步，更新状态+配置）
  async prepareRedoReview(taskId: string, config?: any, preserveHistory?: boolean) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { name: 'APIError', statusCode: 404 });
    }

    const mode = config?.mode || 'parallel';
    const isSequential = mode === 'sequential' || mode === 'serial';
    console.log(`[Redo] Preparing review for task ${taskId}`, { config, preserveHistory, mode, isSequential });

    // 设置正确的 current_stage，便于前端 SSE 自动连接
    const currentStage = isSequential ? 'sequential_review' : 'blue_team_review';
    await query(
      `UPDATE tasks SET
        status = 'reviewing',
        progress = 70,
        current_stage = $2,
        updated_at = NOW()
      WHERE id = $1`,
      [taskId, currentStage]
    );
    // review_mode 列可能不存在（migration 有 bug），安全更新
    try {
      await query(`UPDATE tasks SET review_mode = $2 WHERE id = $1`, [taskId, isSequential ? 'sequential' : 'parallel']);
    } catch { /* ignore if column doesn't exist */ }

    // 根据用户选择：保留所有轮次评论 或 仅保留最新轮次
    if (!preserveHistory) {
      // 删除所有历史评论（重新开始）
      await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
      console.log(`[Redo] Deleted all previous reviews for task ${taskId}`);
    } else {
      // 保留所有轮次评论，新评论将作为新轮次插入
      console.log(`[Redo] Preserving all previous rounds for task ${taskId}`);
    }

    // 只有不保留历史时才删除旧版本稿件
    if (!preserveHistory) {
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
      console.log(`[Redo] Kept only latest draft version for task ${taskId}`);
    }

    // 串行评审：同步配置评审队列（创建 task_review_progress 记录）
    if (isSequential) {
      const { configureSequentialReview } = await import('./sequentialReview.js');
      await configureSequentialReview(taskId, task.topic, config?.experts);
      console.log(`[Redo] Sequential review configured for task ${taskId}`);
    }

    return { taskId, isSequential, topic: task.topic };
  }

  // 4b. 蓝军评审重做 - 执行阶段（异步，实际执行评审）
  async executeRedoReview(taskId: string, config?: any, isSequential?: boolean) {
    console.log(`[Redo] Executing review for task ${taskId}`, { isSequential });

    if (isSequential) {
      const { startSequentialReview } = await import('./sequentialReview.js');

      // 获取最新稿件
      const draftResult = await query(
        `SELECT id, content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
        [taskId]
      );
      const latestDraft = draftResult.rows[0];
      if (!latestDraft) throw new Error('No draft found for sequential review');

      // 启动串行评审
      await startSequentialReview(taskId, latestDraft.id, latestDraft.content);
    } else {
      // 并行评审：使用 Streaming BlueTeam（支持 SSE 实时推送）
      const { executeStreamingBlueTeamReview } = await import('./streamingBlueTeam.js');
      const draftResult = await query(
        `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
        [taskId]
      );
      const draftContent = draftResult.rows[0]?.content;
      if (!draftContent) throw new Error('No draft found for parallel review');
      const task = await this.getTask(taskId);
      await executeStreamingBlueTeamReview(taskId, draftContent, task?.topic || '', config);
    }
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
      case 'review': {
        const prep = await this.prepareRedoReview(taskId);
        await this.executeRedoReview(taskId, undefined, prep.isSequential);
        return { id: taskId, status: 'reviewing' };
      }
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
