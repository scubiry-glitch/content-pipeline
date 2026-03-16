// Agent base class

import { LLMRouter } from '../providers';
import { query } from '../db/connection';

export interface AgentContext {
  topicId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  logs: AgentLog[];
}

export interface AgentLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export abstract class BaseAgent {
  protected name: string;
  protected llmRouter: LLMRouter;
  protected logs: AgentLog[] = [];

  constructor(name: string, llmRouter: LLMRouter) {
    this.name = name;
    this.llmRouter = llmRouter;
  }

  abstract execute(payload: any, context?: AgentContext): Promise<AgentResult>;

  protected log(level: AgentLog['level'], message: string, metadata?: Record<string, any>): void {
    const entry: AgentLog = {
      timestamp: new Date(),
      level,
      message,
      metadata,
    };
    this.logs.push(entry);
    console.log(`[${this.name}] ${level}: ${message}`, metadata || '');
  }

  protected async saveTask(type: string, status: string, payload: any, result?: any): Promise<string> {
    const res = await query(
      `INSERT INTO pipeline_tasks (type, status, payload, result)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [type, status, JSON.stringify(payload), result ? JSON.stringify(result) : null]
    );
    return res.rows[0].id;
  }

  protected async updateTask(taskId: string, updates: { status?: string; result?: any; error?: string }): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status) {
      sets.push(`status = $${idx++}`);
      values.push(updates.status);
      if (updates.status === 'running') {
        sets.push(`started_at = NOW()`);
      }
      if (updates.status === 'completed' || updates.status === 'failed') {
        sets.push(`completed_at = NOW()`);
      }
    }
    if (updates.result !== undefined) {
      sets.push(`result = $${idx++}`);
      values.push(JSON.stringify(updates.result));
    }
    if (updates.error !== undefined) {
      sets.push(`error = $${idx++}`);
      values.push(updates.error);
    }

    if (sets.length > 0) {
      values.push(taskId);
      await query(
        `UPDATE pipeline_tasks SET ${sets.join(', ')} WHERE id = $${idx}`,
        values
      );
    }
  }

  protected createSuccessResult<T>(data: T): AgentResult<T> {
    return {
      success: true,
      data,
      logs: this.logs,
    };
  }

  protected createErrorResult(error: string): AgentResult {
    return {
      success: false,
      error,
      logs: this.logs,
    };
  }

  protected clearLogs(): void {
    this.logs = [];
  }
}
