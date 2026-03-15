// 生产任务服务
// 处理: 选题 → 研究 → 写作 → BlueTeam评审 → 人工确认

import { query } from '../db/connection.js';
import { getQueue } from '../utils/queue-manager.js';
import { PipelineService } from './pipeline.js';

export interface CreateTaskInput {
  topic: string;
  sourceMaterials: string[];
  targetFormats: string[];
}

export interface ApproveTaskInput {
  approved: boolean;
  feedback?: string;
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

    // 异步处理任务（不阻塞API响应）
    setImmediate(() => this.processTask(result.id));

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

  async listTasks(options: { status?: string; limit: number; offset: number }) {
    const { status, limit, offset } = options;

    let sql = 'SELECT * FROM tasks';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    const countResult = await query(
      status ? 'SELECT COUNT(*) FROM tasks WHERE status = $1' : 'SELECT COUNT(*) FROM tasks',
      status ? [status] : []
    );

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
}
