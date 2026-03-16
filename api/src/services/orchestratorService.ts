// v4.1 智能流水线编排服务
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowRule {
  id: string;
  name: string;
  description?: string;
  conditionExpression: string;
  actionType: 'back_to_stage' | 'skip_step' | 'add_warning' | 'notify' | 'split_output' | 'block_and_notify';
  actionParams: Record<string, any>;
  priority: number;
  isEnabled: boolean;
  triggerStage?: string;
}

export interface WorkflowContext {
  taskId: string;
  currentStage: number;
  qualityScore?: number;
  hotScore?: number;
  wordCount?: number;
  sentiment?: string;
  complianceScore?: number;
  contentType?: string;
  [key: string]: any;
}

export interface TaskSchedule {
  id: string;
  taskId: string;
  taskType: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  assignedTo?: string;
  stage: number;
  dueTime?: Date;
}

export class OrchestratorEngine {
  // 评估条件
  evaluateCondition(expression: string, context: WorkflowContext): boolean {
    try {
      let evalExpr = expression;

      for (const [key, value] of Object.entries(context)) {
        // 支持驼峰命名和下划线命名
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

        if (typeof value === 'number') {
          evalExpr = evalExpr.replace(new RegExp(`\\b${key}\\b`, 'g'), value.toString());
          evalExpr = evalExpr.replace(new RegExp(`\\b${snakeKey}\\b`, 'g'), value.toString());
          evalExpr = evalExpr.replace(new RegExp(`\\b${camelKey}\\b`, 'g'), value.toString());
        } else if (typeof value === 'string') {
          evalExpr = evalExpr.replace(new RegExp(`\\b${key}\\b`, 'g'), `'${value}'`);
          evalExpr = evalExpr.replace(new RegExp(`\\b${snakeKey}\\b`, 'g'), `'${value}'`);
          evalExpr = evalExpr.replace(new RegExp(`\\b${camelKey}\\b`, 'g'), `'${value}'`);
        }
      }

      return Function('"use strict"; return (' + evalExpr + ')')();
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return false;
    }
  }

  // 执行动作
  async executeAction(
    actionType: string,
    params: Record<string, any>,
    context: WorkflowContext
  ): Promise<{ success: boolean; newStage?: number; message?: string }> {
    switch (actionType) {
      case 'back_to_stage':
        return {
          success: true,
          newStage: params.target,
          message: `退回至 Stage ${params.target}`
        };

      case 'skip_step':
        return {
          success: true,
          message: `跳过步骤: ${params.step}`
        };

      case 'add_warning':
        return {
          success: true,
          message: `添加警告: ${params.message}`
        };

      case 'split_output':
        return {
          success: true,
          message: `输出分割为: ${params.type}`
        };

      case 'block_and_notify':
        return {
          success: false,
          message: `流程被阻止，通知: ${params.target}`
        };

      default:
        return { success: true };
    }
  }

  // 获取启用的规则
  async getActiveRules(stage?: string): Promise<WorkflowRule[]> {
    const result = await query(
      `SELECT * FROM workflow_rules
       WHERE is_enabled = true
       ${stage ? 'AND trigger_stage = $1' : ''}
       ORDER BY priority DESC`,
      stage ? [stage] : []
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      conditionExpression: row.condition_expression,
      actionType: row.action_type,
      actionParams: typeof row.action_params === 'string' ? JSON.parse(row.action_params) : row.action_params,
      priority: row.priority,
      isEnabled: row.is_enabled,
      triggerStage: row.trigger_stage
    }));
  }

  // 处理工作流
  async processWorkflow(context: WorkflowContext): Promise<{
    appliedRules: WorkflowRule[];
    actions: any[];
    shouldProceed: boolean;
    messages: string[];
  }> {
    const rules = await this.getActiveRules(`stage_${context.currentStage}`);
    const appliedRules: WorkflowRule[] = [];
    const actions: any[] = [];
    const messages: string[] = [];
    let shouldProceed = true;

    for (const rule of rules) {
      const conditionMet = this.evaluateCondition(rule.conditionExpression, context);

      if (conditionMet) {
        appliedRules.push(rule);

        const actionResult = await this.executeAction(
          rule.actionType,
          rule.actionParams,
          context
        );

        actions.push(actionResult);

        if (actionResult.message) {
          messages.push(actionResult.message);
        }

        if (!actionResult.success) {
          shouldProceed = false;
          break;
        }

        if (actionResult.newStage) {
          context.currentStage = actionResult.newStage;
        }
      }
    }

    return { appliedRules, actions, shouldProceed, messages };
  }
}

// 任务调度器
export class TaskScheduler {
  // 添加任务到队列
  async enqueueTask(
    taskId: string,
    taskType: string,
    stage: number,
    priority: number = 0,
    dueTime?: Date
  ): Promise<TaskSchedule> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO task_queue (id, task_id, task_type, stage, priority, due_time, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id, taskId, taskType, stage, priority, dueTime]
    );

    return this.formatTaskSchedule(result.rows[0]);
  }

  // 获取待处理任务
  async getPendingTasks(limit: number = 10): Promise<TaskSchedule[]> {
    const result = await query(
      `SELECT * FROM task_queue
       WHERE status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => this.formatTaskSchedule(row));
  }

  // 分配任务
  async assignTask(taskQueueId: string, expertId: string): Promise<boolean> {
    const result = await query(
      `UPDATE task_queue
       SET assigned_to = $1, status = 'processing', started_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING id`,
      [expertId, taskQueueId]
    );

    if (result.rows.length > 0) {
      await query(
        `UPDATE expert_profiles
         SET availability_status = 'busy', current_task_id = $1
         WHERE user_id = $2`,
        [taskQueueId, expertId]
      );
      return true;
    }

    return false;
  }

  // 智能分配专家
  async smartAssign(taskQueueId: string, contentType: string): Promise<string | null> {
    const result = await query(
      `SELECT user_id FROM expert_profiles
       WHERE availability_status = 'available'
       AND specialties @> $1::jsonb
       ORDER BY task_count ASC, rating DESC
       LIMIT 1`,
      [JSON.stringify([contentType])]
    );

    if (result.rows.length > 0) {
      const expertId = result.rows[0].user_id;
      const assigned = await this.assignTask(taskQueueId, expertId);
      return assigned ? expertId : null;
    }

    return null;
  }

  private formatTaskSchedule(row: any): TaskSchedule {
    return {
      id: row.id,
      taskId: row.task_id,
      taskType: row.task_type,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to,
      stage: row.stage,
      dueTime: row.due_time
    };
  }
}

export const orchestratorEngine = new OrchestratorEngine();
export const taskScheduler = new TaskScheduler();
