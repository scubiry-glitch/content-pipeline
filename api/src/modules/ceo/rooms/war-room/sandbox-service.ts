// War Room · Sandbox 兵棋推演服务
//
// listSandboxRuns / getSandboxRun / startSandboxRun
//   - list/get 直接读 ceo_sandbox_runs
//   - start 入队一个 mn_runs(module='ceo', axis='g3') 异步生成决策树 + evaluation
//     · 入队前先把 status 置 running
//     · run handler (handleG3) 完成后回填 branches / evaluation / generated_run_id / completed_at

import { randomUUID } from 'node:crypto';
import type { CeoEngineDeps } from '../../types.js';
import { enqueueCeoRun } from '../../pipelines/runQueue.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export type SandboxStatus = 'pending' | 'running' | 'completed' | 'failed' | 'archived';

export interface SandboxRun {
  id: string;
  scope_id: string | null;
  topic_text: string;
  source_spark_id: string | null;
  status: SandboxStatus;
  branches: unknown;
  evaluation: unknown;
  generated_run_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function listSandboxRuns(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  filter: { scopeIds?: string[]; status?: SandboxStatus; limit?: number },
): Promise<{ items: SandboxRun[]; total: number }> {
  const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
  const r = await deps.db.query(
    `SELECT id::text, scope_id::text, topic_text, source_spark_id::text, status,
            branches, evaluation, generated_run_id, created_by,
            created_at, completed_at
       FROM ceo_sandbox_runs
      WHERE ($1::uuid[] IS NULL OR scope_id = ANY($1::uuid[]))
        AND ($2::text IS NULL OR status = $2)
        AND status <> 'archived'
        AND ${wsFilterClause(4)}
      ORDER BY created_at DESC
      LIMIT $3`,
    [
      filter.scopeIds && filter.scopeIds.length > 0 ? filter.scopeIds : null,
      filter.status ?? null,
      limit,
      workspaceId,
    ],
  );
  return {
    items: r.rows.map(coerceRow),
    total: r.rows.length,
  };
}

export async function getSandboxRun(
  deps: CeoEngineDeps,
  id: string,
): Promise<SandboxRun | null> {
  const r = await deps.db.query(
    `SELECT id::text, scope_id::text, topic_text, source_spark_id::text, status,
            branches, evaluation, generated_run_id, created_by,
            created_at, completed_at
       FROM ceo_sandbox_runs WHERE id = $1::uuid LIMIT 1`,
    [id],
  );
  return r.rows[0] ? coerceRow(r.rows[0]) : null;
}

/**
 * 创建一条新的 sandbox run（status=pending） + 入队 g3 任务
 */
export async function createSandboxRun(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  payload: {
    topicText: string;
    scopeId?: string | null;
    sourceSparkId?: string | null;
    seedBranches?: unknown;
    createdBy?: string;
  },
): Promise<SandboxRun> {
  if (!workspaceId) throw new Error('workspace required for write');
  const id = randomUUID();
  await deps.db.query(
    `INSERT INTO ceo_sandbox_runs (id, scope_id, topic_text, source_spark_id, status, branches, created_by, workspace_id)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'pending', $5::jsonb, $6, $7)`,
    [
      id,
      payload.scopeId ?? null,
      payload.topicText,
      payload.sourceSparkId ?? null,
      JSON.stringify(payload.seedBranches ?? defaultSeedBranches(payload.topicText)),
      payload.createdBy ?? 'system',
      workspaceId,
    ],
  );
  const created = await getSandboxRun(deps, id);
  if (!created) throw new Error('Failed to create sandbox run');
  return created;
}

/**
 * 启动推演：把 sandbox 标 running，入队 g3 LLM 任务
 * 返回 { sandboxId, runId }，前端用 runId 接 SSE 进度
 */
export async function startSandboxRun(
  deps: CeoEngineDeps,
  sandboxId: string,
): Promise<{ sandboxId: string; runId: string }> {
  const sandbox = await getSandboxRun(deps, sandboxId);
  if (!sandbox) throw new Error(`Sandbox run ${sandboxId} not found`);
  if (sandbox.status === 'running' && sandbox.generated_run_id) {
    return { sandboxId, runId: sandbox.generated_run_id };
  }

  const enq = await enqueueCeoRun(deps, {
    axis: 'warroom-sandbox',
    scopeId: sandbox.scope_id,
    metadata: {
      kind: 'g3-sandbox', // legacy kind 兼容 handleG3Sandbox 内部判断
      sandboxId,
      topicText: sandbox.topic_text,
      sourceSparkId: sandbox.source_spark_id,
      currentStep: 'queued',
    },
  });

  if (!enq.ok || !enq.runId) {
    throw new Error('Failed to enqueue sandbox run');
  }

  await deps.db.query(
    `UPDATE ceo_sandbox_runs
        SET status = 'running', generated_run_id = $1
      WHERE id = $2::uuid`,
    [enq.runId, sandboxId],
  );

  return { sandboxId, runId: enq.runId };
}

/**
 * 推演完成回填 — 由 run handler (handleG3 sandbox 分支) 调用
 */
export async function completeSandboxRun(
  deps: CeoEngineDeps,
  sandboxId: string,
  result: { branches: unknown; evaluation: unknown },
): Promise<void> {
  await deps.db.query(
    `UPDATE ceo_sandbox_runs
        SET status = 'completed',
            branches = $1::jsonb,
            evaluation = $2::jsonb,
            completed_at = NOW()
      WHERE id = $3::uuid`,
    [JSON.stringify(result.branches), JSON.stringify(result.evaluation), sandboxId],
  );
}

export async function failSandboxRun(
  deps: CeoEngineDeps,
  sandboxId: string,
): Promise<void> {
  await deps.db.query(
    `UPDATE ceo_sandbox_runs SET status = 'failed' WHERE id = $1::uuid`,
    [sandboxId],
  );
}

function coerceRow(row: any): SandboxRun {
  return {
    id: row.id,
    scope_id: row.scope_id ?? null,
    topic_text: row.topic_text,
    source_spark_id: row.source_spark_id ?? null,
    status: row.status as SandboxStatus,
    branches: typeof row.branches === 'string' ? JSON.parse(row.branches) : row.branches ?? [],
    evaluation:
      row.evaluation == null
        ? null
        : typeof row.evaluation === 'string'
        ? JSON.parse(row.evaluation)
        : row.evaluation,
    generated_run_id: row.generated_run_id ?? null,
    created_by: row.created_by ?? null,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    completed_at:
      row.completed_at == null
        ? null
        : row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : String(row.completed_at),
  };
}

function defaultSeedBranches(topic: string): unknown {
  return [
    {
      id: 'r0',
      label: topic,
      options: [
        { id: 'r0-a', label: '路径 A · 激进', confidence: 0, expected: '待推演', children: [] },
        { id: 'r0-b', label: '路径 B · 折衷', confidence: 0, expected: '待推演', children: [] },
        { id: 'r0-c', label: '路径 C · 保守', confidence: 0, expected: '待推演', children: [] },
      ],
    },
  ];
}
