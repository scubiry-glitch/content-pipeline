// longitudinal/beliefDriftComputer.ts — 信念漂移
//
// 对每个 (person × topic × scope) 收集其跨会议的判断 value：
//   value: -1..1，由 LLM 对该人就该 topic 的语气打分（或从现有 commitments/judgments 里反推）
//
// PR5：采用简化实现——从 mn_judgments 里按 author_person_id + domain 抽
//       polarity；用 LLM 对每个点打 valence 是 PR6 细化项。

import type { MeetingNotesDeps } from '../types.js';

interface DriftPoint {
  meeting_id: string;
  date: string;
  value: number;
  confidence: number;
  note?: string;
}

export class BeliefDriftComputer {
  constructor(private readonly deps: MeetingNotesDeps) {}

  /**
   * 为一个 scope 下所有 (person × topic) 组合重算漂移序列。
   * topic 来自 mn_judgments.domain；value 采用 generality_score * 2 - 1 作粗略信号，
   * 后续可替换为 LLM 情绪打分。
   */
  async recomputeForScope(scopeId: string, runId?: string | null): Promise<{ updated: number }> {
    // 拉 scope 下所有相关 judgments
    const r = await this.deps.db.query(
      `SELECT
          j.id,
          j.text,
          j.author_person_id,
          j.domain,
          j.generality_score,
          j.abstracted_from_meeting_id AS meeting_id,
          a.created_at AS date
        FROM mn_judgments j
        JOIN mn_scope_members m ON m.meeting_id = j.abstracted_from_meeting_id
        JOIN assets a ON a.id = j.abstracted_from_meeting_id::text
        WHERE m.scope_id = $1
          AND j.author_person_id IS NOT NULL
          AND j.domain IS NOT NULL
        ORDER BY a.created_at ASC`,
      [scopeId],
    );

    // 按 (person, topic) 分组
    const groups = new Map<string, { person_id: string; topic_id: string; pts: DriftPoint[] }>();
    for (const row of r.rows) {
      const key = `${row.author_person_id}::${row.domain}`;
      const val = Math.max(-1, Math.min(1, Number(row.generality_score) * 2 - 1));
      const entry = groups.get(key) ?? {
        person_id: row.author_person_id,
        topic_id: String(row.domain),
        pts: [] as DriftPoint[],
      };
      entry.pts.push({
        meeting_id: row.meeting_id,
        date: row.date,
        value: val,
        confidence: 0.6,
        note: row.text.slice(0, 60),
      });
      groups.set(key, entry);
    }

    let updated = 0;
    for (const g of groups.values()) {
      await this.deps.db.query(
        `INSERT INTO mn_belief_drift_series
           (person_id, topic_id, scope_id, points, last_updated_run_id, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
         ON CONFLICT (person_id, topic_id, scope_id)
         DO UPDATE SET
           points = EXCLUDED.points,
           last_updated_run_id = EXCLUDED.last_updated_run_id,
           updated_at = NOW()`,
        [g.person_id, g.topic_id, scopeId, JSON.stringify(g.pts), runId ?? null],
      );
      updated += 1;
    }
    return { updated };
  }

  async list(scopeId: string, filter?: { personId?: string; topicId?: string }) {
    const where: string[] = ['scope_id = $1'];
    const params: any[] = [scopeId];
    if (filter?.personId) { params.push(filter.personId); where.push(`person_id = $${params.length}`); }
    if (filter?.topicId)  { params.push(filter.topicId);  where.push(`topic_id  = $${params.length}`); }
    const r = await this.deps.db.query(
      `SELECT person_id, topic_id, points, updated_at
         FROM mn_belief_drift_series
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC`,
      params,
    );
    return r.rows;
  }
}
