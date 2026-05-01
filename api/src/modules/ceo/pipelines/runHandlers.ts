// CEO 模块 LLM 任务处理器 — PR12
//
// 5 组加工步骤接生成中心：
//   g3 矛盾&专家  → 生成 ceo_rebuttal_rehearsals (LLM stub)
//   g4 跨会&批注  → 生成 ceo_strategic_echos / ceo_director_concerns (LLM stub)
//   g5 棱镜聚合   → 规则计算，持久化 ceo_prisms (确定性)
//
// 当前 stub 实现：g3/g4 不真正调 claude-cli (需要 LLM adapter 注入)，
// 而是写入"占位结果 + 标记为 stub"，让 UI 看到 run 走完整生命周期。
// 真正接入 claude-cli 由独立 commit 完成（依赖 mn_runs.runEngine.dispatchPlan 路由）。

import type { CeoEngineDeps, PrismKind } from '../types.js';
import { computeAlignmentScore } from '../rooms/compass/aggregator.js';
import { computeForwardPct } from '../rooms/boardroom/aggregator.js';
import { computeResponsibilityClarity } from '../rooms/tower/aggregator.js';
import { computeFormationHealth } from '../rooms/war-room/aggregator.js';
import { computeCoverage } from '../rooms/situation/aggregator.js';
import { computeWeeklyRoi } from '../rooms/balcony/aggregator.js';

export type CeoAxis = 'g1' | 'g2' | 'g3' | 'g4' | 'g5';

export interface CeoRunRow {
  id: string;
  axis: CeoAxis | string;
  scope_kind: string;
  scope_id: string | null;
  metadata: Record<string, unknown> | null;
}

/** g5 — 棱镜聚合：规则计算，写 ceo_prisms (周快照) */
async function handleG5(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const scopeId = run.scope_id ?? null;
  const [alignment, forward, coord, team, ext, self] = await Promise.all([
    computeAlignmentScore(deps, scopeId ?? undefined),
    computeForwardPct(deps, scopeId ?? undefined),
    computeResponsibilityClarity(deps, scopeId ?? undefined),
    computeFormationHealth(deps, scopeId ?? undefined),
    computeCoverage(deps, scopeId ?? undefined).then((c) => c.covered / Math.max(c.total, 1)),
    computeWeeklyRoi(deps),
  ]);

  // 写 ceo_prisms
  const r = await deps.db.query(
    `INSERT INTO ceo_prisms
      (scope_id, week_start, alignment, board_score, coord, team, ext, self, computed_at, metadata)
     VALUES ($1, DATE_TRUNC('week', NOW())::date, $2, $3, $4, $5, $6, $7, NOW(), $8::jsonb)
     ON CONFLICT (scope_id, week_start) DO UPDATE
       SET alignment = EXCLUDED.alignment,
           board_score = EXCLUDED.board_score,
           coord = EXCLUDED.coord,
           team = EXCLUDED.team,
           ext = EXCLUDED.ext,
           self = EXCLUDED.self,
           computed_at = NOW(),
           metadata = EXCLUDED.metadata
     RETURNING id::text, week_start`,
    [
      scopeId,
      alignment,
      forward,
      coord,
      team,
      ext,
      self,
      JSON.stringify({ ranBy: 'g5-prism-aggregator', runId: run.id }),
    ],
  );

  return {
    ok: true,
    result: {
      prismId: r.rows[0]?.id,
      weekStart: r.rows[0]?.week_start,
      scores: { direction: alignment, board: forward, coord, team, ext, self },
    },
  };
}

/** g3 — 矛盾&专家：deps.llm 注入则真调，否则 stub */
async function handleG3(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const briefId = (meta.briefId as string) ?? null;
  const stakes = await deps.db.query(
    `SELECT name, kind FROM ceo_directors LIMIT 1`,
  );
  const attacker = stakes.rows[0]?.name ?? '匿名董事';

  let attackText = `[stub g3] LLM 接入后将基于关切雷达 + 棱镜推演生成具体攻击点`;
  let defenseText = `[stub g3] 回防草稿待 LLM 填充`;
  let strength = 0.5;
  let mode: 'stub' | 'llm' = 'stub';

  if (deps.llm && deps.llm.isAvailable()) {
    try {
      const concerns = await deps.db.query(
        `SELECT topic FROM ceo_director_concerns WHERE status = 'pending' ORDER BY raised_count DESC LIMIT 5`,
      );
      const topics = concerns.rows.map((r) => r.topic).join(' / ');
      const result = await deps.llm.invoke({
        system:
          '你是 CEO 的反方教练。基于董事会近 90 天的关切，演练最尖锐的一次攻击 + CEO 的回防草稿。输出 JSON: {attack, defense, strength: 0..1}',
        prompt: `攻击者: ${attacker}\n董事关切话题: ${topics}\n请生成一个具体、有数据支撑的攻击 + 回防。`,
        responseFormat: 'json',
        maxTokens: 600,
        taskTag: 'g3-rebuttal',
      });
      const parsed = JSON.parse(result.text) as { attack?: string; defense?: string; strength?: number };
      if (parsed.attack) attackText = parsed.attack;
      if (parsed.defense) defenseText = parsed.defense;
      if (typeof parsed.strength === 'number') strength = Math.max(0, Math.min(1, parsed.strength));
      mode = 'llm';
    } catch (e) {
      console.warn('[g3] LLM invoke failed, falling back to stub:', (e as Error).message);
    }
  }

  const ins = await deps.db.query(
    `INSERT INTO ceo_rebuttal_rehearsals
       (brief_id, scope_id, attacker, attack_text, defense_text, strength_score, generated_run_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
     RETURNING id::text`,
    [briefId, run.scope_id, attacker, attackText, defenseText, strength, run.id],
  );
  return { ok: true, result: { rebuttalId: ins.rows[0]?.id, mode } };
}

/** g4 — 跨会&批注：deps.llm 注入则真调，否则 stub */
async function handleG4(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const lines = await deps.db.query(
    `SELECT id::text, name, description FROM ceo_strategic_lines
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
      ORDER BY established_at DESC LIMIT 1`,
    [run.scope_id ?? null],
  );
  if (lines.rows.length === 0) {
    return { ok: true, result: { mode: 'noop', reason: '无战略主线可挂载' } };
  }
  const line = lines.rows[0];

  let hypothesisText = '[stub g4] 假设描述将由 LLM 跨会议综合产出';
  let factText = '[stub g4] 现实回响待 LLM 抽取';
  let fate: 'confirm' | 'refute' | 'pending' = 'pending';
  let mode: 'stub' | 'llm' = 'stub';

  if (deps.llm && deps.llm.isAvailable()) {
    try {
      const result = await deps.llm.invoke({
        system:
          '你是 CEO 的跨会综合官。基于战略线和最近会议，给出一条 hypothesis (假设) ↔ fact (现实回响) ↔ fate (confirm/refute/pending) 三元组。输出 JSON。',
        prompt: `战略线: ${line.name}\n描述: ${line.description ?? ''}\n请生成 {hypothesis, fact, fate}。`,
        responseFormat: 'json',
        maxTokens: 500,
        taskTag: 'g4-cross-meeting',
      });
      const parsed = JSON.parse(result.text) as { hypothesis?: string; fact?: string; fate?: string };
      if (parsed.hypothesis) hypothesisText = parsed.hypothesis;
      if (parsed.fact) factText = parsed.fact;
      if (parsed.fate === 'confirm' || parsed.fate === 'refute' || parsed.fate === 'pending') {
        fate = parsed.fate;
      }
      mode = 'llm';
    } catch (e) {
      console.warn('[g4] LLM invoke failed, falling back to stub:', (e as Error).message);
    }
  }

  const ins = await deps.db.query(
    `INSERT INTO ceo_strategic_echos
       (line_id, hypothesis_text, fact_text, fate, evidence_run_ids)
     VALUES ($1::uuid, $2, $3, $4, ARRAY[$5]::text[])
     RETURNING id::text`,
    [line.id, hypothesisText, factText, fate, run.id],
  );
  return { ok: true, result: { echoId: ins.rows[0]?.id, mode } };
}

const HANDLERS: Record<string, (deps: CeoEngineDeps, run: CeoRunRow) => Promise<{ ok: boolean; result: any }>> = {
  g3: handleG3,
  g4: handleG4,
  g5: handleG5,
};

/** 通用入口：runEngine 路由到这里时调用 */
export async function handleCeoRun(
  deps: CeoEngineDeps,
  run: CeoRunRow,
): Promise<{ ok: boolean; result: any; error?: string }> {
  const handler = HANDLERS[run.axis];
  if (!handler) {
    return { ok: false, result: null, error: `[CEO] unknown axis: ${run.axis}` };
  }
  try {
    return await handler(deps, run);
  } catch (e) {
    return { ok: false, result: null, error: (e as Error).message };
  }
}
