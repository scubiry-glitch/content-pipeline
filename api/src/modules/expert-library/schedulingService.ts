// Scheduling Service — 专家任务调度与工作量管理
// 功能: 分配任务 → 追踪负载 → 负载均衡

import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertLibraryDeps, ExpertProfile } from './types.js';

export interface TaskAssignment {
  id: string;
  expertId: string;
  expertName: string;
  taskId: string;
  role: string;
  status: 'assigned' | 'active' | 'completed';
  assignedAt: string;
  deadline?: string;
  completedAt?: string;
}

export interface ExpertWorkload {
  expertId: string;
  expertName: string;
  domain: string[];
  activeTaskCount: number;
  completedTaskCount: number;
  totalInvocations: number;
  avgResponseTimeMs: number;
  availability: 'available' | 'busy' | 'unavailable';
  recentTasks: TaskAssignment[];
}

export class SchedulingService {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 获取单个专家的工作量
   */
  async getWorkload(expertId: string): Promise<ExpertWorkload | null> {
    const expert = await this.engine.loadExpert(expertId);
    if (!expert) return null;

    let activeCount = 0;
    let completedCount = 0;
    let totalInvocations = 0;
    let avgTime = 0;
    let recentTasks: TaskAssignment[] = [];

    try {
      // 从 expert_task_assignments 表查询（若不存在则 fallback）
      const [activeRes, completedRes, invocRes, tasksRes] = await Promise.all([
        this.deps.db.query(
          `SELECT COUNT(*) as cnt FROM expert_task_assignments WHERE expert_id = $1 AND status IN ('assigned', 'active')`,
          [expertId]
        ).catch(() => ({ rows: [{ cnt: '0' }] })),
        this.deps.db.query(
          `SELECT COUNT(*) as cnt FROM expert_task_assignments WHERE expert_id = $1 AND status = 'completed'`,
          [expertId]
        ).catch(() => ({ rows: [{ cnt: '0' }] })),
        this.deps.db.query(
          `SELECT COUNT(*) as cnt, AVG(processing_time_ms) as avg_time FROM expert_invocations WHERE expert_id = $1`,
          [expertId]
        ).catch(() => ({ rows: [{ cnt: '0', avg_time: null }] })),
        this.deps.db.query(
          `SELECT * FROM expert_task_assignments WHERE expert_id = $1 ORDER BY assigned_at DESC LIMIT 10`,
          [expertId]
        ).catch(() => ({ rows: [] })),
      ]);

      activeCount = parseInt(activeRes.rows[0]?.cnt || '0');
      completedCount = parseInt(completedRes.rows[0]?.cnt || '0');
      totalInvocations = parseInt(invocRes.rows[0]?.cnt || '0');
      avgTime = parseFloat(invocRes.rows[0]?.avg_time || '0');
      recentTasks = tasksRes.rows.map(this.rowToAssignment);
    } catch {
      // DB 不可用时使用默认值
    }

    return {
      expertId: expert.expert_id,
      expertName: expert.name,
      domain: expert.domain,
      activeTaskCount: activeCount,
      completedTaskCount: completedCount,
      totalInvocations,
      avgResponseTimeMs: Math.round(avgTime),
      availability: activeCount <= 2 ? 'available' : activeCount <= 5 ? 'busy' : 'unavailable',
      recentTasks,
    };
  }

  /**
   * 获取所有专家的工作量汇总
   */
  async getAllWorkloads(): Promise<ExpertWorkload[]> {
    const experts = await this.engine.listExperts();
    const workloads = await Promise.all(
      experts.map(async (expert) => {
        const workload = await this.getWorkload(expert.expert_id);
        return workload!;
      })
    );
    return workloads.filter(Boolean);
  }

  /**
   * 分配任务给专家
   */
  async assignTask(
    expertId: string,
    taskId: string,
    role: string,
    deadline?: string
  ): Promise<TaskAssignment> {
    const expert = await this.engine.loadExpert(expertId);
    if (!expert) throw new Error(`Expert not found: ${expertId}`);

    const id = `assign-${expertId}-${taskId}-${Date.now()}`;
    const now = new Date().toISOString();

    try {
      await this.deps.db.query(
        `INSERT INTO expert_task_assignments (id, expert_id, task_id, role, status, assigned_at, deadline)
         VALUES ($1, $2, $3, $4, 'assigned', $5, $6)
         ON CONFLICT (expert_id, task_id) DO UPDATE SET role = $4, status = 'assigned', assigned_at = $5`,
        [id, expertId, taskId, role, now, deadline || null]
      );
    } catch (err) {
      console.warn('[Scheduling] DB insert failed, proceeding in-memory:', err);
    }

    return {
      id,
      expertId,
      expertName: expert.name,
      taskId,
      role,
      status: 'assigned',
      assignedAt: now,
      deadline,
    };
  }

  /**
   * 标记任务完成
   */
  async completeTask(expertId: string, taskId: string): Promise<void> {
    try {
      await this.deps.db.query(
        `UPDATE expert_task_assignments SET status = 'completed', completed_at = NOW()
         WHERE expert_id = $1 AND task_id = $2 AND status IN ('assigned', 'active')`,
        [expertId, taskId]
      );
    } catch {
      // 静默失败
    }
  }

  /**
   * 获取可用专家（按负载排序）
   */
  async getAvailableExperts(domain?: string): Promise<Array<{ expert: ExpertProfile; workload: ExpertWorkload }>> {
    const experts = await this.engine.listExperts(domain ? { domain } : undefined);
    const results = await Promise.all(
      experts.map(async (expert) => {
        const workload = await this.getWorkload(expert.expert_id);
        return { expert, workload: workload! };
      })
    );

    return results
      .filter(r => r.workload && r.workload.availability !== 'unavailable')
      .sort((a, b) => a.workload.activeTaskCount - b.workload.activeTaskCount);
  }

  /**
   * 更新专家可用状态
   */
  async updateAvailability(expertId: string, status: 'available' | 'busy' | 'unavailable'): Promise<void> {
    await this.deps.db.query(
      `UPDATE expert_profiles SET availability_status = $1 WHERE expert_id = $2`,
      [status, expertId]
    ).catch(() => {});
  }

  /**
   * 基于任务主题推荐专家（复用 ExpertMatcher）
   */
  async recommendExperts(taskTopic: string, limit = 3): Promise<Array<{ expert: ExpertProfile; workload: ExpertWorkload; matchScore: number }>> {
    const { ExpertMatcher } = await import('./expertMatcher.js');
    const matcher = new ExpertMatcher(this.engine, this.deps);
    const matchResult = await matcher.match({ topic: taskTopic, importance: 0.6 });

    const candidates = matchResult.domainExperts.map(e => ({
      expert: e.expert,
      score: e.matchScore,
    }));
    if (matchResult.seniorExpert) {
      candidates.unshift({
        expert: matchResult.seniorExpert.expert,
        score: matchResult.seniorExpert.matchScore,
      });
    }

    const results = await Promise.all(
      candidates.slice(0, limit + 2).map(async (c) => {
        const workload = await this.getWorkload(c.expert.expert_id);
        return { expert: c.expert, workload: workload!, matchScore: c.score };
      })
    );

    return results
      .filter(r => r.workload)
      .sort((a, b) => {
        // 优先匹配度高且负载低的
        const scoreA = a.matchScore * 0.6 + (1 - a.workload.activeTaskCount / 10) * 0.4;
        const scoreB = b.matchScore * 0.6 + (1 - b.workload.activeTaskCount / 10) * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  private rowToAssignment(row: any): TaskAssignment {
    return {
      id: row.id,
      expertId: row.expert_id,
      expertName: row.expert_name || '',
      taskId: row.task_id,
      role: row.role,
      status: row.status,
      assignedAt: row.assigned_at,
      deadline: row.deadline,
      completedAt: row.completed_at,
    };
  }
}
