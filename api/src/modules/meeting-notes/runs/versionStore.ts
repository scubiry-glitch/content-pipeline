// runs/versionStore.ts — mn_axis_versions 读写 + diff
//
// 版本号命名：vN（N = 当前 scope×axis 最大版本号 + 1）
// diff_vs_prev：记录 snapshot 与上一版的 added/changed/removed（按 id 比对）

import type { MeetingNotesDeps } from '../types.js';

export interface AxisSnapshotInput {
  runId: string;
  scopeKind: 'library' | 'project' | 'client' | 'topic' | 'meeting';
  scopeId: string | null;
  axis: 'people' | 'projects' | 'knowledge' | 'meta' | 'longitudinal' | 'all';
  data: any;   // 任意 JSON 快照（通常是 Engine.getMeetingAxes 返回的结构）
}

export interface AxisDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export class VersionStore {
  constructor(private readonly deps: MeetingNotesDeps) {}

  /** 写入新 snapshot，返回 { id, versionLabel, diffVsPrev } */
  async snapshot(input: AxisSnapshotInput): Promise<{
    id: string;
    versionLabel: string;
    prevVersionId: string | null;
    diff: AxisDiff;
  }> {
    const prev = await this.latestVersion(input.scopeKind, input.scopeId, input.axis);

    // 取下一版号
    const r = await this.deps.db.query(
      `SELECT MAX(
          CAST(NULLIF(regexp_replace(version_label, '^v', ''), '') AS INT)
       ) AS max_v
         FROM mn_axis_versions
         WHERE scope_kind = $1
           AND COALESCE(scope_id::text, '') = COALESCE($2::text, '')
           AND axis = $3`,
      [input.scopeKind, input.scopeId, input.axis],
    );
    const nextNum = (Number(r.rows[0]?.max_v) || 0) + 1;
    const versionLabel = `v${nextNum}`;

    const diff = prev ? this.computeDiff(prev.snapshot, input.data) : { added: [], changed: [], removed: [] };

    const ins = await this.deps.db.query(
      `INSERT INTO mn_axis_versions
         (run_id, scope_kind, scope_id, axis, version_label, snapshot, diff_vs_prev, prev_version_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       RETURNING id`,
      [
        input.runId,
        input.scopeKind,
        input.scopeId,
        input.axis,
        versionLabel,
        JSON.stringify(input.data ?? {}),
        JSON.stringify(diff),
        prev?.id ?? null,
      ],
    );

    return {
      id: ins.rows[0].id,
      versionLabel,
      prevVersionId: prev?.id ?? null,
      diff,
    };
  }

  /** 取某 (scopeKind, scopeId, axis) 最新版本 */
  async latestVersion(
    scopeKind: string,
    scopeId: string | null,
    axis: string,
  ): Promise<{ id: string; versionLabel: string; snapshot: any } | null> {
    const r = await this.deps.db.query(
      `SELECT id, version_label, snapshot
         FROM mn_axis_versions
         WHERE scope_kind = $1
           AND COALESCE(scope_id::text,'') = COALESCE($2::text,'')
           AND axis = $3
         ORDER BY created_at DESC
         LIMIT 1`,
      [scopeKind, scopeId, axis],
    );
    if (r.rows.length === 0) return null;
    return {
      id: r.rows[0].id,
      versionLabel: r.rows[0].version_label,
      snapshot: r.rows[0].snapshot,
    };
  }

  async listVersions(
    scopeKind: string,
    scopeId: string | null,
    axis: string,
    limit = 20,
  ): Promise<Array<{ id: string; versionLabel: string; createdAt: string; runId: string }>> {
    const r = await this.deps.db.query(
      `SELECT id, version_label, created_at, run_id
         FROM mn_axis_versions
         WHERE scope_kind = $1
           AND COALESCE(scope_id::text,'') = COALESCE($2::text,'')
           AND axis = $3
         ORDER BY created_at DESC
         LIMIT $4`,
      [scopeKind, scopeId, axis, limit],
    );
    return r.rows.map((row) => ({
      id: row.id,
      versionLabel: row.version_label,
      createdAt: row.created_at,
      runId: row.run_id,
    }));
  }

  async diff(aId: string, bId: string): Promise<{
    a: { id: string; versionLabel: string; snapshot: any };
    b: { id: string; versionLabel: string; snapshot: any };
    diff: AxisDiff;
  } | null> {
    const r = await this.deps.db.query(
      `SELECT id, version_label, snapshot FROM mn_axis_versions WHERE id = ANY($1::uuid[])`,
      [[aId, bId]],
    );
    if (r.rows.length !== 2) return null;
    const a = r.rows.find((x) => x.id === aId);
    const b = r.rows.find((x) => x.id === bId);
    if (!a || !b) return null;
    return {
      a: { id: a.id, versionLabel: a.version_label, snapshot: a.snapshot },
      b: { id: b.id, versionLabel: b.version_label, snapshot: b.snapshot },
      diff: this.computeDiff(a.snapshot, b.snapshot),
    };
  }

  /**
   * 按 id 比对两个 snapshot 的各 axis 子维度数组。
   * snapshot 预期是 { people: {commitments: [...], ...}, projects: {...}, ... } 的嵌套结构
   * （= Engine.getMeetingAxes 返回形状）。
   * 标量字段和 object 字段若 id 变化即记为 changed。
   */
  private computeDiff(prev: any, next: any): AxisDiff {
    const added: string[] = [];
    const changed: string[] = [];
    const removed: string[] = [];
    try {
      const flatten = (obj: any, prefix = ''): Map<string, any> => {
        const out = new Map<string, any>();
        if (!obj || typeof obj !== 'object') return out;
        for (const [axis, axisData] of Object.entries(obj)) {
          if (!axisData || typeof axisData !== 'object') continue;
          for (const [subDim, items] of Object.entries(axisData as Record<string, any>)) {
            if (Array.isArray(items)) {
              for (const it of items) {
                if (it?.id) out.set(`${axis}/${subDim}/${it.id}`, it);
              }
            } else if (items && typeof items === 'object') {
              out.set(`${axis}/${subDim}`, items);
            }
          }
        }
        return out;
      };
      const A = flatten(prev);
      const B = flatten(next);
      for (const [k, v] of B) {
        if (!A.has(k)) added.push(k);
        else if (JSON.stringify(A.get(k)) !== JSON.stringify(v)) changed.push(k);
      }
      for (const k of A.keys()) if (!B.has(k)) removed.push(k);
    } catch {
      /* 出错则返回空 diff */
    }
    return { added, changed, removed };
  }
}
