// Balcony · 个人房间 service
// 周日反思 + 时间 ROI + 棱镜雷达
// R3-6: prompt 字段为空时 lazy enqueue g4-balcony-prompt LLM 任务填充

import type { CeoEngineDeps, PrismKind } from '../../types.js';
import { computeWeeklyRoi, computePrismScores } from './aggregator.js';
import { enqueueCeoRun } from '../../pipelines/runQueue.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

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
  filter: { userId?: string; weekStart?: string; workspaceId?: string | null },
): Promise<{ items: any[]; weekStart: string }> {
  const userId = filter.userId ?? 'system';
  const weekStart = filter.weekStart ?? thisWeekStart();
  const wsId = filter.workspaceId ?? null;
  const r = await deps.db.query(
    `SELECT id::text, user_id, week_start, prism_id, question, prompt, user_answer, mood, answered_at
       FROM ceo_balcony_reflections
      WHERE user_id = $1 AND week_start = $2
        AND ($3::uuid IS NULL OR workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
      ORDER BY prism_id`,
    [userId, weekStart, wsId],
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
        `INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question, workspace_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, week_start, prism_id) DO UPDATE SET question = EXCLUDED.question
         RETURNING id::text, user_id, week_start, prism_id, question, prompt, user_answer, mood, answered_at`,
        [userId, weekStart, t.prism, t.question, wsId],
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
  body: { userId?: string; weekStart?: string; prismId?: PrismKind; userAnswer?: string; mood?: string; workspaceId?: string | null },
): Promise<{ ok: boolean; id?: string }> {
  const userId = body.userId ?? 'system';
  const weekStart = body.weekStart ?? thisWeekStart();
  const wsId = body.workspaceId ?? null;
  if (!body.prismId) return { ok: false };
  const r = await deps.db.query(
    `UPDATE ceo_balcony_reflections
        SET user_answer = $4,
            mood = $5,
            answered_at = NOW()
      WHERE user_id = $1 AND week_start = $2 AND prism_id = $3
        AND ($6::uuid IS NULL OR workspace_id = $6)
      RETURNING id::text`,
    [userId, weekStart, body.prismId, body.userAnswer ?? null, body.mood ?? null, wsId],
  );
  if (r.rows.length === 0) return { ok: false };
  return { ok: true, id: r.rows[0].id };
}

export async function getTimeRoi(
  deps: CeoEngineDeps,
  filter: { userId?: string; weekStart?: string; workspaceId?: string | null },
): Promise<any> {
  const userId = filter.userId ?? 'system';
  const weekStart = filter.weekStart ?? thisWeekStart();
  const wsId = filter.workspaceId ?? null;
  const r = await deps.db.query(
    `SELECT id::text, user_id, week_start, total_hours, deep_focus_hours,
            meeting_hours, target_focus_hours, weekly_roi
       FROM ceo_time_roi
      WHERE user_id = $1 AND week_start = $2
        AND ($3::uuid IS NULL OR workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
      LIMIT 1`,
    [userId, weekStart, wsId],
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

const MOOD_ENUM = ['clear', 'cloudy', 'conflicted', 'grateful', 'spent'] as const;

export async function getBalconyDashboard(
  deps: CeoEngineDeps,
  userId?: string,
  workspaceId?: string | null,
): Promise<{
  question: string;
  metric: { label: string; value: string; delta: string };
  weeklyRoi: number;
  prismScores: Record<PrismKind, number>;
  weakest: { prism: PrismKind; score: number };
  strongest: { prism: PrismKind; score: number };
  moodEnum: readonly string[];
}> {
  const weeklyRoi = await computeWeeklyRoi(deps, userId, workspaceId);
  const prismScores = await computePrismScores(deps, workspaceId);

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
    moodEnum: MOOD_ENUM,
  };
}

// ─── samples-s 对齐：5 个新 endpoint ────────────────────────────

/**
 * GET /balcony/roi-trend?weeks=8 — 8 周 weekly_roi 时序 + 当周 metrics
 */
export async function getRoiTrend(
  deps: CeoEngineDeps,
  filter: { userId?: string; weeks?: number; workspaceId?: string | null },
): Promise<{
  weekStart: string;
  metrics: {
    weekly_roi: { value: number; delta: string };
    deep_focus_hours: { value: number; target: number; delta: string };
    meeting_hours: { value: number; vs_last_week: number };
    high_roi_block_h: { value: number };
  };
  trend_8w: Array<{ weekStart: string; weekly_roi: number }>;
}> {
  const userId = filter.userId ?? 'system';
  const weeks = filter.weeks ?? 8;
  const wsId = filter.workspaceId ?? null;
  const r = await deps.db.query(
    `SELECT week_start::text AS week_start, weekly_roi, deep_focus_hours,
            meeting_hours, target_focus_hours
       FROM ceo_time_roi
      WHERE user_id = $1
        AND ($3::uuid IS NULL OR workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
      ORDER BY week_start DESC
      LIMIT $2`,
    [userId, weeks, wsId],
  );
  const rows = r.rows.reverse(); // 旧 → 新
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const weekStart = cur?.week_start ? String(cur.week_start).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const curRoi = Number(cur?.weekly_roi ?? 0);
  const prevRoi = prev?.weekly_roi != null ? Number(prev.weekly_roi) : null;
  const roiDelta = prevRoi != null ? `${curRoi - prevRoi >= 0 ? '+' : ''}${(curRoi - prevRoi).toFixed(2)}` : '—';

  const deep = Number(cur?.deep_focus_hours ?? 0);
  const target = Number(cur?.target_focus_hours ?? 18);
  const meet = Number(cur?.meeting_hours ?? 0);
  const meetPrev = Number(prev?.meeting_hours ?? 0);

  return {
    weekStart,
    metrics: {
      weekly_roi: { value: Number(curRoi.toFixed(3)), delta: roiDelta },
      deep_focus_hours: {
        value: deep,
        target,
        delta: deep < target ? `差 ${(target - deep).toFixed(1)}h` : `+${(deep - target).toFixed(1)}h`,
      },
      meeting_hours: { value: meet, vs_last_week: Number((meet - meetPrev).toFixed(1)) },
      high_roi_block_h: { value: deep },
    },
    trend_8w: rows.map((row) => ({
      weekStart: String(row.week_start).slice(0, 10),
      weekly_roi: Number(row.weekly_roi ?? 0),
    })),
  };
}

/**
 * GET /balcony/reflections-history?weeks=12 — 反思赴约率
 */
export async function getReflectionsHistory(
  deps: CeoEngineDeps,
  filter: { userId?: string; weeks?: number; workspaceId?: string | null },
): Promise<{
  items: Array<{ weekStart: string; total: number; answered: number; rate: number }>;
  summary: { total_weeks: number; answered_weeks: number; avg_rate: number };
}> {
  const userId = filter.userId ?? 'system';
  const weeks = filter.weeks ?? 12;
  const wsId = filter.workspaceId ?? null;
  const r = await deps.db.query(
    `SELECT week_start::text AS week_start,
            COUNT(*)::int AS total,
            SUM(CASE WHEN user_answer IS NOT NULL THEN 1 ELSE 0 END)::int AS answered
       FROM ceo_balcony_reflections
      WHERE user_id = $1
        AND week_start > (NOW()::date - ($2::int * 7) * INTERVAL '1 day')
        AND ($3::uuid IS NULL OR workspace_id = $3 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
      GROUP BY week_start
      ORDER BY week_start`,
    [userId, weeks, wsId],
  );
  const items = r.rows.map((row) => {
    const total = Number(row.total);
    const answered = Number(row.answered);
    const rate = total > 0 ? Number((answered / total).toFixed(2)) : 0;
    return { weekStart: String(row.week_start).slice(0, 10), total, answered, rate };
  });
  const total_weeks = items.length;
  const answered_weeks = items.filter((x) => x.answered > 0).length;
  const avg_rate =
    total_weeks > 0
      ? Number((items.reduce((s, x) => s + x.rate, 0) / total_weeks).toFixed(2))
      : 0;
  return { items, summary: { total_weeks, answered_weeks, avg_rate } };
}

/**
 * GET /balcony/silence-signals?days=30 — mn_silence_signals
 */
export async function getSilenceSignals(
  deps: CeoEngineDeps,
  filter: { days?: number; workspaceId?: string | null },
): Promise<{ items: any[] }> {
  const days = filter.days ?? 30;
  const wsId = filter.workspaceId ?? null;
  try {
    const r = await deps.db.query(
      `SELECT s.id::text, s.meeting_id::text, s.person_id::text,
              s.topic_id, s.state, s.anomaly_score, s.computed_at,
              p.canonical_name AS person_name
         FROM mn_silence_signals s
         LEFT JOIN mn_people p ON p.id = s.person_id
        WHERE s.state = 'abnormal_silence'
          AND s.computed_at > NOW() - ($1::int * INTERVAL '1 day')
          AND ${wsFilterClause(2, 's.workspace_id')}
        ORDER BY s.anomaly_score DESC
        LIMIT 5`,
      [days, wsId],
    );
    return {
      items: r.rows.map((row) => ({
        id: String(row.id),
        date: row.computed_at ? String(row.computed_at).slice(0, 10) : null,
        person_name: row.person_name ?? '匿名',
        person_id: row.person_id ?? null,
        duration_sec: 0,
        context: `主题 ${row.topic_id ?? '—'} · anomaly=${Number(row.anomaly_score ?? 0).toFixed(2)}`,
        is_long: Number(row.anomaly_score ?? 0) >= 0.8,
        tag: '异常沉默',
        linked_meeting_id: row.meeting_id ?? null,
      })),
    };
  } catch {
    return { items: [] };
  }
}

/**
 * GET /balcony/echos?weeks=6 — 决策回声轨迹
 */
export async function getEchos(
  deps: CeoEngineDeps,
  filter: { weeks?: number; workspaceId?: string | null },
): Promise<{ items: any[] }> {
  const weeks = filter.weeks ?? 6;
  const wsId = filter.workspaceId ?? null;
  try {
    const r = await deps.db.query(
      `SELECT e.id::text, e.line_id::text, e.hypothesis_text, e.fact_text, e.fate,
              e.updated_at, l.name AS line_name
         FROM ceo_strategic_echos e
         LEFT JOIN ceo_strategic_lines l ON l.id = e.line_id
        WHERE e.updated_at > NOW() - ($1::int * 7) * INTERVAL '1 day'
          AND ${wsFilterClause(2, 'e.workspace_id')}
        ORDER BY e.updated_at DESC
        LIMIT 8`,
      [weeks, wsId],
    );
    return {
      items: r.rows.map((row) => {
        const polarity =
          row.fate === 'confirm' ? 'positive' : row.fate === 'refute' ? 'negative' : 'neutral_warn';
        return {
          decision_date: row.updated_at ? String(row.updated_at).slice(0, 10) : null,
          decision: row.line_name ?? '未命名战略线',
          assumption_at_decision: row.hypothesis_text ?? '',
          fact_now: row.fact_text ?? '',
          echo_polarity: polarity,
          echo_label: row.fate === 'confirm' ? '回声正向' : row.fate === 'refute' ? '反方回响' : '待验证',
          linked_compass_echo_id: String(row.id),
        };
      }),
    };
  } catch {
    return { items: [] };
  }
}

/**
 * GET /balcony/self-promises — 自我承诺 vs 兑现
 * 把 ceo_balcony_reflections 含 user_answer 的记录按 keep/partial/broken 分类
 */
export async function getSelfPromises(
  deps: CeoEngineDeps,
  filter: { userId?: string; workspaceId?: string | null },
): Promise<{
  items: Array<{
    id: string;
    type: '已兑现' | '自批评' | '未兑现';
    tick: 'kept' | 'partial' | 'broken';
    what: string;
    evidence: string;
    linked_reflection_ids: string[];
  }>;
  summary: { kept_count: number; partial_count: number; broken_count: number; kept_rate: number };
}> {
  const userId = filter.userId ?? 'system';
  const wsId = filter.workspaceId ?? null;
  const r = await deps.db.query(
    `SELECT id::text, prism_id, mood, user_answer, week_start::text AS week_start
       FROM ceo_balcony_reflections
      WHERE user_id = $1 AND user_answer IS NOT NULL
        AND ($2::uuid IS NULL OR workspace_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))
      ORDER BY week_start DESC
      LIMIT 30`,
    [userId, wsId],
  );
  // 简化分类: mood='clear'→kept, 'grateful'→kept, 'tense'/'tired'/'restless'→broken, 其他→partial
  const items = r.rows.map((row) => {
    const mood = String(row.mood ?? '');
    let tick: 'kept' | 'partial' | 'broken' = 'partial';
    let type: '已兑现' | '自批评' | '未兑现' = '自批评';
    if (mood === 'clear' || mood === 'grateful' || mood === 'focused') {
      tick = 'kept';
      type = '已兑现';
    } else if (mood === 'tense' || mood === 'tired' || mood === 'restless') {
      tick = 'broken';
      type = '未兑现';
    }
    return {
      id: `sp-${row.id}`,
      type,
      tick,
      what: String(row.user_answer ?? '').slice(0, 80),
      evidence: `${row.week_start} · prism=${row.prism_id ?? '—'}`,
      linked_reflection_ids: [String(row.id)],
    };
  });
  const kept_count = items.filter((x) => x.tick === 'kept').length;
  const partial_count = items.filter((x) => x.tick === 'partial').length;
  const broken_count = items.filter((x) => x.tick === 'broken').length;
  const total = items.length || 1;
  return {
    items,
    summary: {
      kept_count,
      partial_count,
      broken_count,
      kept_rate: Number((kept_count / total).toFixed(2)),
    },
  };
}
