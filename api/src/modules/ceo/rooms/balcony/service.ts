// Balcony · 个人房间 service
// 周日反思 + 时间 ROI + 棱镜雷达
// R3-6: prompt 字段为空时 lazy enqueue g4-balcony-prompt LLM 任务填充

import type { CeoEngineDeps, PrismKind } from '../../types.js';
import { computeWeeklyRoi, computePrismScores } from './aggregator.js';
import { enqueueCeoRun } from '../../pipelines/runQueue.js';

const REFLECTION_TEMPLATES: Array<{ prism: PrismKind; question: string }> = [
  { prism: 'direction', question: '你这周做的决定里，哪一个 是在承诺而非选择?' },
  { prism: 'team', question: '你有多久 没和某个关键团队成员 单独说过话了?' },
  { prism: 'self', question: '这周有 一件事，你觉得再来一次会做得不一样吗?' },
  { prism: 'board', question: '你下一次董事会能拿出的最强一句话是什么?' },
  { prism: 'coord', question: '你欠谁一个回复? 这个回复迟了多久?' },
  { prism: 'ext', question: '上一次主动发声给外部世界，是什么时候?' },
];

function thisWeekStart(): string {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Mon
  const d = new Date(now);
  d.setDate(now.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function listReflections(
  deps: CeoEngineDeps,
  filter: { userId?: string; weekStart?: string },
): Promise<{ items: any[]; weekStart: string }> {
  const userId = filter.userId ?? 'system';
  const weekStart = filter.weekStart ?? thisWeekStart();
  const r = await deps.db.query(
    `SELECT id::text, user_id, week_start, prism_id, question, prompt, user_answer, mood, answered_at
       FROM ceo_balcony_reflections
      WHERE user_id = $1 AND week_start = $2
      ORDER BY prism_id`,
    [userId, weekStart],
  );

  if (r.rows.length === 0) {
    // 按周从模板池轮换 3 张 (week-of-year 决定 startIdx, 让每周问题不同)
    const wk = weekOfYear(weekStart);
    const startIdx = wk % REFLECTION_TEMPLATES.length;
    const picks: typeof REFLECTION_TEMPLATES = [];
    for (let i = 0; i < 3; i++) {
      picks.push(REFLECTION_TEMPLATES[(startIdx + i) % REFLECTION_TEMPLATES.length]);
    }
    const seeded = [];
    for (const t of picks) {
      const ins = await deps.db.query(
        `INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, week_start, prism_id) DO UPDATE SET question = EXCLUDED.question
         RETURNING id::text, user_id, week_start, prism_id, question, prompt, user_answer, mood, answered_at`,
        [userId, weekStart, t.prism, t.question],
      );
      seeded.push(ins.rows[0]);
    }
    // 后台异步 enqueue g4-balcony-prompt 填充每条 prompt (不阻塞首次响应)
    if (deps.llm?.isAvailable()) {
      for (const row of seeded) {
        enqueueCeoRun(deps, {
          axis: 'balcony-prompt',
          metadata: {
            kind: 'balcony-prompt',
            userId,
            weekStart,
            prismId: row.prism_id,
            currentStep: 'queued',
          },
        }).catch(() => {/* 非致命: 失败 → 下次再试 */});
      }
    }
    return { items: seeded, weekStart };
  }
  return { items: r.rows, weekStart };
}

function weekOfYear(weekStart: string): number {
  const d = new Date(weekStart);
  const start = new Date(d.getFullYear(), 0, 1);
  const diffMs = d.getTime() - start.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export async function upsertReflection(
  deps: CeoEngineDeps,
  body: { userId?: string; weekStart?: string; prismId?: PrismKind; userAnswer?: string; mood?: string },
): Promise<{ ok: boolean; id?: string }> {
  const userId = body.userId ?? 'system';
  const weekStart = body.weekStart ?? thisWeekStart();
  if (!body.prismId) return { ok: false };
  const r = await deps.db.query(
    `UPDATE ceo_balcony_reflections
        SET user_answer = $4,
            mood = $5,
            answered_at = NOW()
      WHERE user_id = $1 AND week_start = $2 AND prism_id = $3
      RETURNING id::text`,
    [userId, weekStart, body.prismId, body.userAnswer ?? null, body.mood ?? null],
  );
  if (r.rows.length === 0) return { ok: false };
  return { ok: true, id: r.rows[0].id };
}

export async function getTimeRoi(
  deps: CeoEngineDeps,
  filter: { userId?: string; weekStart?: string },
): Promise<any> {
  const userId = filter.userId ?? 'system';
  const weekStart = filter.weekStart ?? thisWeekStart();
  const r = await deps.db.query(
    `SELECT id::text, user_id, week_start, total_hours, deep_focus_hours,
            meeting_hours, target_focus_hours, weekly_roi
       FROM ceo_time_roi
      WHERE user_id = $1 AND week_start = $2
      LIMIT 1`,
    [userId, weekStart],
  );
  if (r.rows.length > 0) return r.rows[0];
  // 兜底：当前周占位
  return {
    user_id: userId,
    week_start: weekStart,
    total_hours: 0,
    deep_focus_hours: 0,
    meeting_hours: 0,
    target_focus_hours: 0,
    weekly_roi: null,
  };
}

export async function getBalconyDashboard(
  deps: CeoEngineDeps,
  userId?: string,
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  weeklyRoi: number;
  prismScores: Record<PrismKind, number>;
  weakest: { prism: PrismKind; score: number };
  strongest: { prism: PrismKind; score: number };
}> {
  const weeklyRoi = await computeWeeklyRoi(deps, userId);
  const prismScores = await computePrismScores(deps);

  const entries = (Object.entries(prismScores) as Array<[PrismKind, number]>);
  entries.sort((a, b) => a[1] - b[1]);
  const weakest = { prism: entries[0]?.[0] ?? 'self', score: entries[0]?.[1] ?? 0 };
  const strongest = {
    prism: entries[entries.length - 1]?.[0] ?? 'self',
    score: entries[entries.length - 1]?.[1] ?? 0,
  };

  return {
    question: '我还是我想成为的那个 CEO 吗?',
    metric: { label: '本周 ROI', value: weeklyRoi.toFixed(2), delta: '本周' },
    weeklyRoi,
    prismScores,
    weakest,
    strongest,
  };
}
