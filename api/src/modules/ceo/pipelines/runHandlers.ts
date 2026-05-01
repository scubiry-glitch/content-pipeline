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

/**
 * g3 sandbox — 兵棋推演分支：基于 topic_text 生成决策树 + evaluation
 *   输出: 更新 ceo_sandbox_runs (branches, evaluation, status='completed')
 */
async function handleG3Sandbox(
  deps: CeoEngineDeps,
  run: CeoRunRow,
): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const sandboxId = meta.sandboxId as string | undefined;
  const topicText = (meta.topicText as string | undefined) ?? '未命名推演';

  if (!sandboxId) {
    return { ok: false, result: { error: 'sandbox: metadata.sandboxId required' } };
  }

  let branches: unknown = [
    {
      id: 'r0',
      label: topicText,
      options: [
        {
          id: 'r0-a',
          label: '路径 A · 激进',
          confidence: 0.55,
          expected: '[stub] LLM 未配置 — 输出占位推演',
          children: [],
        },
        {
          id: 'r0-b',
          label: '路径 B · 折衷',
          confidence: 0.7,
          expected: '[stub] LLM 未配置 — 输出占位推演',
          children: [],
        },
        {
          id: 'r0-c',
          label: '路径 C · 保守',
          confidence: 0.42,
          expected: '[stub] LLM 未配置 — 输出占位推演',
          children: [],
        },
      ],
    },
  ];
  let evaluation: any = {
    recommendedPath: 'r0 → r0-b',
    recommendedLabel: '路径 B · 折衷',
    riskScore: 0.5,
    expectedReversibility: 'medium',
    summaryMd: `### 推演结论 (stub)\n\nLLM 未配置时的占位输出。配置 \`CLAUDE_API_KEY\` / \`KIMI_API_KEY\` / \`OPENAI_API_KEY\` 后将基于 topic 实际生成 3 路径决策树。\n\n**主题**: ${topicText}`,
  };
  let mode: 'stub' | 'llm' = 'stub';

  if (deps.llm?.isAvailable()) {
    try {
      const result = await deps.llm.invoke({
        system:
          '你是 CEO 的兵棋推演助理。基于推演主题，输出一棵 2-3 层的决策树 (3 个根选项, 每个 0-2 个子选项) + 总评估。\n输出 JSON 格式: {"branches":[{...}], "evaluation":{recommendedPath, recommendedLabel, riskScore (0..1), expectedReversibility (low|medium|high), summaryMd}}\n每个 option 字段: {id, label, confidence (0..1), expected, children}',
        prompt: `推演主题: ${topicText}\n\n请生成决策树 JSON。`,
        responseFormat: 'json',
        maxTokens: 1500,
        taskTag: 'g3-sandbox',
      });
      const parsed = JSON.parse(result.text) as {
        branches?: unknown;
        evaluation?: any;
      };
      if (Array.isArray(parsed.branches) && parsed.branches.length > 0) {
        branches = parsed.branches;
      }
      if (parsed.evaluation && typeof parsed.evaluation === 'object') {
        evaluation = { ...evaluation, ...parsed.evaluation };
      }
      mode = 'llm';
    } catch (e) {
      console.warn('[g3-sandbox] LLM invoke failed, fallback to stub:', (e as Error).message);
    }
  }

  await deps.db.query(
    `UPDATE ceo_sandbox_runs
        SET status = 'completed',
            branches = $1::jsonb,
            evaluation = $2::jsonb,
            completed_at = NOW()
      WHERE id = $3::uuid`,
    [JSON.stringify(branches), JSON.stringify(evaluation), sandboxId],
  );

  return { ok: true, result: { mode, sandboxId, optionsCount: countOptions(branches) } };
}

function countOptions(branches: unknown): number {
  if (!Array.isArray(branches)) return 0;
  let count = 0;
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (Array.isArray(n.options)) {
        count += n.options.length;
        n.options.forEach((opt: any) => {
          if (Array.isArray(opt.children)) walk([{ options: opt.children }]);
        });
      }
    }
  };
  walk(branches as any[]);
  return count;
}

/** g3 — 矛盾&专家：deps.llm 注入则真调，否则 stub
 *
 * metadata.kind === 'g3-sandbox' → 兵棋推演分支 (写 ceo_sandbox_runs)
 * 其他 → 反方演练分支 (写 ceo_rebuttal_rehearsals)
 */
async function handleG3(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const kind = (meta.kind as string | undefined) ?? 'g3-rebuttal';

  if (kind === 'g3-sandbox') {
    return handleG3Sandbox(deps, run);
  }

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

/**
 * g4 annotations — 外脑批注: 基于 brief + 专家画像生成一条 synthesis/contrast/counter
 *   metadata.briefId / expertId / expertName / contextHint
 *   输出: 写 ceo_boardroom_annotations
 */
async function handleG4Annotations(
  deps: CeoEngineDeps,
  run: CeoRunRow,
): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const briefId = (meta.briefId as string | undefined) ?? null;
  const expertId = meta.expertId as string | undefined;
  const expertName = meta.expertName as string | undefined;
  const contextHint = (meta.contextHint as string | undefined) ?? '';

  if (!expertId || !expertName) {
    return { ok: false, result: { error: 'g4-annotations: expertId/expertName required' } };
  }

  let highlight = `[stub g4-annotations] LLM 未配置时的占位批注 — by ${expertName}`;
  let bodyMd = `## 外脑批注 (stub)\n\nLLM 未配置 — 真接 \`CLAUDE_API_KEY\` / \`KIMI_API_KEY\` / \`OPENAI_API_KEY\` 后将基于预读包+专家画像生成具体批注。\n\n**专家**: ${expertName}\n**模式**: synthesis`;
  let mode: 'synthesis' | 'contrast' | 'counter' | 'extension' = 'synthesis';
  let citations: Array<{ type: string; id?: string; label: string }> = [];
  let llmMode: 'stub' | 'llm' = 'stub';

  if (deps.llm?.isAvailable()) {
    try {
      // 拉 brief toc + 最近董事关切
      let briefContext = '';
      if (briefId) {
        const r = await deps.db.query(
          `SELECT board_session, version, toc, page_count FROM ceo_briefs WHERE id = $1::uuid`,
          [briefId],
        );
        if (r.rows[0]) {
          briefContext = `预读包: ${r.rows[0].board_session} v${r.rows[0].version}, ${r.rows[0].page_count} 页\nTOC: ${JSON.stringify(r.rows[0].toc)}`;
        }
      }
      const concerns = await deps.db.query(
        `SELECT topic FROM ceo_director_concerns WHERE status = 'pending' ORDER BY raised_count DESC LIMIT 5`,
      );
      const topicLines = concerns.rows.map((r) => `- ${r.topic}`).join('\n');

      const result = await deps.llm.invoke({
        system:
          '你是被聘请的外部专家，给 CEO 的董事会预读包写一条专家批注。你必须有立场、有锚点、有数据。\n输出 JSON: {"mode":"synthesis|contrast|counter|extension","highlight":"一句话核心观点 (不超过 40 字)","body_md":"完整批注正文 200-400 字","citations":[{"type":"meeting|asset|echo","label":"引用名"}]}',
        prompt: `专家画像: ${expertName} (id: ${expertId})\n${contextHint ? `上下文提示: ${contextHint}\n` : ''}${briefContext}\n董事关切:\n${topicLines}\n\n请基于专家身份给出一条批注。`,
        responseFormat: 'json',
        maxTokens: 800,
        taskTag: 'g4-annotations',
      });
      const parsed = JSON.parse(result.text) as {
        mode?: string;
        highlight?: string;
        body_md?: string;
        citations?: any[];
      };
      if (parsed.highlight) highlight = parsed.highlight;
      if (parsed.body_md) bodyMd = parsed.body_md;
      if (
        parsed.mode === 'synthesis' ||
        parsed.mode === 'contrast' ||
        parsed.mode === 'counter' ||
        parsed.mode === 'extension'
      ) {
        mode = parsed.mode;
      }
      if (Array.isArray(parsed.citations)) citations = parsed.citations;
      llmMode = 'llm';
    } catch (e) {
      console.warn('[g4-annotations] LLM invoke failed, fallback to stub:', (e as Error).message);
    }
  }

  const ins = await deps.db.query(
    `INSERT INTO ceo_boardroom_annotations
       (brief_id, scope_id, expert_id, expert_name, mode, highlight, body_md, citations, generated_run_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING id::text`,
    [
      briefId,
      run.scope_id,
      expertId,
      expertName,
      mode,
      highlight,
      bodyMd,
      JSON.stringify(citations),
      run.id,
    ],
  );

  return {
    ok: true,
    result: { annotationId: ins.rows[0]?.id, mode: llmMode, expertName, llmMode: mode },
  };
}

/**
 * g4 balcony-prompt — 阳台反思 prompt 填充
 *   metadata.userId / weekStart / prismId
 *   把 ceo_balcony_reflections.prompt 字段从空填到具体的本周 context
 */
async function handleG4BalconyPrompt(
  deps: CeoEngineDeps,
  run: CeoRunRow,
): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const userId = (meta.userId as string | undefined) ?? 'system';
  const weekStart = meta.weekStart as string | undefined;
  const prismId = meta.prismId as string | undefined;

  if (!weekStart || !prismId) {
    return { ok: false, result: { error: 'balcony-prompt: weekStart/prismId required' } };
  }

  // 拉本周 reflection question
  const r = await deps.db.query(
    `SELECT id::text, question FROM ceo_balcony_reflections
      WHERE user_id = $1 AND week_start = $2 AND prism_id = $3 LIMIT 1`,
    [userId, weekStart, prismId],
  );
  const reflection = r.rows[0];
  if (!reflection) {
    return { ok: false, result: { error: 'reflection row not found' } };
  }

  let promptText =
    '[stub g4-balcony-prompt] LLM 未配置 — 真接配置后将基于本周会议+承诺+张力信号生成具体 context';
  let mode: 'stub' | 'llm' = 'stub';

  if (deps.llm?.isAvailable()) {
    try {
      // 拉本周 mn_judgments + commitments + sparks 作 context
      const judgments = await deps.db.query(
        `SELECT kind, text FROM mn_judgments
          WHERE created_at > $1::timestamptz - INTERVAL '8 days'
            AND created_at < $1::timestamptz + INTERVAL '8 days'
          LIMIT 8`,
        [weekStart],
      );
      const commitments = await deps.db.query(
        `SELECT text, due_at FROM mn_commitments
          WHERE created_at > $1::timestamptz - INTERVAL '8 days'
          LIMIT 8`,
        [weekStart],
      );
      const ctx = [
        `本周关键判断 (${judgments.rows.length}):`,
        ...judgments.rows.map((j) => `- [${j.kind}] ${j.text}`),
        `本周新承诺 (${commitments.rows.length}):`,
        ...commitments.rows.map((c) => `- ${c.text}${c.due_at ? ` (due ${c.due_at})` : ''}`),
      ].join('\n');

      const result = await deps.llm.invoke({
        system:
          '你是 CEO 的反思教练。基于本周的判断/承诺/张力数据，给出一段具体、有钩子、唤起记忆的 prompt 文本，作为该 prism 反思问题的上下文。\n要求:\n- 直接陈述事实（如"周三下午 2:14 你在陈汀发言时沉默 2 分 14 秒"），不要"建议"\n- 80-150 字\n- 输出纯文本, 不要 markdown',
        prompt: `Prism: ${prismId}\n反思问题: ${reflection.question}\n\n本周数据:\n${ctx || '(本周暂无明显信号)'}`,
        maxTokens: 400,
        taskTag: 'g4-balcony-prompt',
      });
      promptText = result.text.trim();
      mode = 'llm';
    } catch (e) {
      console.warn(
        '[g4-balcony-prompt] LLM invoke failed, fallback to stub:',
        (e as Error).message,
      );
    }
  }

  await deps.db.query(
    `UPDATE ceo_balcony_reflections SET prompt = $1 WHERE id = $2::uuid`,
    [promptText, reflection.id],
  );

  return { ok: true, result: { reflectionId: reflection.id, mode } };
}

/**
 * g4 — 跨会&批注：deps.llm 注入则真调，否则 stub
 *
 * metadata.kind:
 *   undefined / 'echo'      → 战略回响 (默认, 写 ceo_strategic_echos)
 *   'annotations'           → 外脑批注 (写 ceo_boardroom_annotations)
 *   'balcony-prompt'        → 阳台反思 prompt (更新 ceo_balcony_reflections.prompt)
 */
async function handleG4(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const kind = (meta.kind as string | undefined) ?? 'echo';

  if (kind === 'annotations') {
    return handleG4Annotations(deps, run);
  }
  if (kind === 'balcony-prompt') {
    return handleG4BalconyPrompt(deps, run);
  }

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

/**
 * g1 ASR & 实体: 不重做，委托给 mn 现有 ingest pipeline
 *   CEO 任务通常没有 audio 文件，需要绑定一个 mn meeting → 触发 mn 的 axis 重算
 *   metadata.targetMeetingId 必填；否则 noop 返回 (避免 silently 失败)
 */
async function handleG1(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const meta = run.metadata ?? {};
  const targetMeetingId = (meta.targetMeetingId as string | undefined) ?? null;
  const targetAxis = (meta.targetAxis as string | undefined) ?? 'all';

  if (!targetMeetingId) {
    return {
      ok: true,
      result: {
        mode: 'noop',
        reason: 'g1 委托模式需要 metadata.targetMeetingId — 当前未提供 (CEO 视角不直接持 audio)',
      },
    };
  }

  // 复用 mn 的 enqueue API
  const mn = deps.meetingNotes as { enqueue?: (req: unknown) => Promise<{ ok: boolean; runId?: string }> } | undefined;
  if (!mn?.enqueue) {
    return { ok: false, result: null };
  }

  try {
    const enq = await mn.enqueue({
      scope: { kind: 'meeting', id: targetMeetingId },
      axis: targetAxis,
      preset: meta.preset ?? 'standard',
      triggeredBy: 'auto',
      parentRunId: run.id,
    });
    return {
      ok: true,
      result: {
        mode: 'delegated-to-mn',
        delegatedToMnRunId: enq.runId,
        targetMeetingId,
        targetAxis,
      },
    };
  } catch (e) {
    return { ok: false, result: { mode: 'failed', error: (e as Error).message } };
  }
}

/**
 * g2 评分 & 信念: LLM 算 5 维 rubric (战略清晰/节奏匹配/沟通透明/流程严谨/回应速度)
 *   输入: 最近 30 天 mn_judgments
 *   输出: 写 ceo_rubric_scores
 */
async function handleG2(deps: CeoEngineDeps, run: CeoRunRow): Promise<{ ok: boolean; result: any }> {
  const RUBRIC_DIMENSIONS = ['战略清晰', '节奏匹配', '沟通透明', '流程严谨', '回应速度'];
  const stakeholderId = ((run.metadata ?? {}).stakeholderId as string | undefined) ?? null;

  if (!deps.llm?.isAvailable()) {
    // stub: 写 5 个 0.6 兜底分
    for (const dim of RUBRIC_DIMENSIONS) {
      await deps.db.query(
        `INSERT INTO ceo_rubric_scores
           (scope_id, stakeholder_id, dimension, score, evidence_run_id, evidence_text)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
        [run.scope_id, stakeholderId, dim, 0.6, run.id, '[stub g2] LLM 未配置时的中性兜底'],
      );
    }
    return {
      ok: true,
      result: { mode: 'stub', dimensions: RUBRIC_DIMENSIONS.length },
    };
  }

  // 拉最近 30 天 mn_judgments
  let judgments: Array<{ kind: string; text: string }> = [];
  try {
    const r = await deps.db.query(
      `SELECT kind, text FROM mn_judgments
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND ($1::uuid IS NULL OR scope_id = $1::uuid)
        ORDER BY created_at DESC
        LIMIT 80`,
      [run.scope_id ?? null],
    );
    judgments = r.rows;
  } catch {
    /* mn_judgments schema 不一致时跳过 */
  }

  let scores: Record<string, number> = {};
  let mode: 'stub' | 'llm' = 'stub';
  try {
    const result = await deps.llm.invoke({
      system: `你是 CEO 视角的评分员。基于近 30 天的 mn_judgments 列表，给 5 维 rubric 打分 (每维 0..1)。
维度: ${RUBRIC_DIMENSIONS.join(' / ')}
仅输出 JSON: {"战略清晰":0.x,"节奏匹配":0.x,"沟通透明":0.x,"流程严谨":0.x,"回应速度":0.x}`,
      prompt: judgments.length > 0
        ? `近 30 天 ${judgments.length} 条 judgment:\n${judgments
            .slice(0, 40)
            .map((j) => `- [${j.kind}] ${j.text}`)
            .join('\n')}`
        : '近 30 天暂无 judgment 数据，按中性分给',
      responseFormat: 'json',
      maxTokens: 200,
      taskTag: 'g2-rubric',
    });
    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    for (const dim of RUBRIC_DIMENSIONS) {
      const v = parsed[dim];
      scores[dim] = typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.6;
    }
    mode = 'llm';
  } catch (e) {
    console.warn('[g2] LLM invoke failed, falling back to stub:', (e as Error).message);
    for (const dim of RUBRIC_DIMENSIONS) scores[dim] = 0.6;
  }

  for (const dim of RUBRIC_DIMENSIONS) {
    await deps.db.query(
      `INSERT INTO ceo_rubric_scores
         (scope_id, stakeholder_id, dimension, score, evidence_run_id, evidence_text)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [run.scope_id, stakeholderId, dim, scores[dim], run.id, mode === 'llm' ? null : '[stub g2]'],
    );
  }
  return { ok: true, result: { mode, dimensions: RUBRIC_DIMENSIONS.length, scores } };
}

const HANDLERS: Record<string, (deps: CeoEngineDeps, run: CeoRunRow) => Promise<{ ok: boolean; result: any }>> = {
  g1: handleG1,
  g2: handleG2,
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
