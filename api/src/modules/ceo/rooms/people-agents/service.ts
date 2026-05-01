// CEO People Agents · 把 mn_people 绑到 expert-library expert_id
// 调用时走 deps.expert.invoke + 拼 person 上下文 (commitments 等)

import type { CeoEngineDeps } from '../../types.js';

export interface PersonAgentLink {
  id: string;
  person_id: string;
  expert_id: string;
  custom_persona_overrides: Record<string, unknown> | null;
  default_task_type: 'analysis' | 'evaluation' | 'generation';
  created_at: string;
  last_invoked_at: string | null;
  invoke_count: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getLink(
  deps: CeoEngineDeps,
  personId: string,
): Promise<PersonAgentLink | null> {
  if (!UUID_RE.test(personId)) return null;
  const r = await deps.db.query(
    `SELECT id::text, person_id::text, expert_id, custom_persona_overrides,
            default_task_type, created_at, last_invoked_at, invoke_count
       FROM ceo_person_agent_links
      WHERE person_id = $1::uuid
      LIMIT 1`,
    [personId],
  );
  return (r.rows[0] as PersonAgentLink | undefined) ?? null;
}

export async function bindExpert(
  deps: CeoEngineDeps,
  personId: string,
  body: {
    expertId: string;
    overrides?: Record<string, unknown>;
    taskType?: 'analysis' | 'evaluation' | 'generation';
    createdBy?: string;
  },
): Promise<{ ok: boolean; link?: PersonAgentLink; error?: string }> {
  if (!UUID_RE.test(personId)) return { ok: false, error: 'invalid person_id' };
  if (!body.expertId || typeof body.expertId !== 'string') {
    return { ok: false, error: 'expertId required' };
  }
  const r = await deps.db.query(
    `INSERT INTO ceo_person_agent_links
       (person_id, expert_id, custom_persona_overrides, default_task_type, created_by)
     VALUES ($1::uuid, $2, $3::jsonb, $4, $5)
     ON CONFLICT (person_id) DO UPDATE
       SET expert_id = EXCLUDED.expert_id,
           custom_persona_overrides = EXCLUDED.custom_persona_overrides,
           default_task_type = EXCLUDED.default_task_type,
           updated_at = NOW()
     RETURNING id::text, person_id::text, expert_id, custom_persona_overrides,
               default_task_type, created_at, last_invoked_at, invoke_count`,
    [
      personId,
      body.expertId,
      body.overrides ? JSON.stringify(body.overrides) : null,
      body.taskType ?? 'analysis',
      body.createdBy ?? null,
    ],
  );
  return { ok: true, link: r.rows[0] as PersonAgentLink };
}

/**
 * 调用绑定的 expert，注入 person 上下文
 *
 * 上下文拼接策略：
 *   [Person] canonical_name (role @ org) — aliases: ...
 *   [近期承诺]
 *     · text (state, due) — 截至 N 条
 *   [发言质量] avg entropy = X%, abnormal silence = N
 *   ---
 *   <用户问题>
 */
export async function invoke(
  deps: CeoEngineDeps,
  personId: string,
  body: {
    question: string;
    taskType?: 'analysis' | 'evaluation' | 'generation';
    depth?: 'quick' | 'standard' | 'deep';
  },
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!UUID_RE.test(personId)) return { ok: false, error: 'invalid person_id' };
  if (!body.question || !body.question.trim()) return { ok: false, error: 'question required' };

  const link = await getLink(deps, personId);
  if (!link) return { ok: false, error: 'person 未绑定 expert' };

  // 拉 person 上下文
  const person = await deps.db.query(
    `SELECT canonical_name, aliases, role, org FROM mn_people WHERE id = $1::uuid`,
    [personId],
  );
  if (person.rows.length === 0) return { ok: false, error: 'person not found' };
  const p = person.rows[0];

  const commits = await deps.db
    .query(
      `SELECT text, state, due_at FROM mn_commitments
        WHERE person_id = $1::uuid
        ORDER BY due_at NULLS LAST, created_at DESC
        LIMIT 5`,
      [personId],
    )
    .catch(() => ({ rows: [] as any[] }));

  const speech = await deps.db
    .query(
      `SELECT AVG(entropy_pct)::numeric(5,2) AS avg_entropy
         FROM mn_speech_quality
        WHERE person_id = $1::uuid AND created_at > NOW() - INTERVAL '90 days'`,
      [personId],
    )
    .catch(() => ({ rows: [{ avg_entropy: null }] }));

  const ctxLines = [
    `[Person] ${p.canonical_name} (${p.role ?? '—'}${p.org ? ' @ ' + p.org : ''})`,
    p.aliases?.length > 0 ? `别名: ${p.aliases.join(' / ')}` : null,
  ].filter(Boolean);

  if (commits.rows.length > 0) {
    ctxLines.push('[近期承诺]');
    for (const c of commits.rows) {
      const due = c.due_at ? new Date(c.due_at).toLocaleDateString('zh-CN') : '未排期';
      ctxLines.push(`  · ${c.text} (${c.state}, due ${due})`);
    }
  }
  const avgEntropy = speech.rows[0]?.avg_entropy;
  if (avgEntropy != null) {
    ctxLines.push(`[发言质量] 近 90 天平均发言熵 ${Number(avgEntropy).toFixed(0)}%`);
  }
  const personContext = ctxLines.join('\n');

  // 调 expert-library /invoke
  const expert = deps.expert as { invoke?: (req: unknown) => Promise<unknown> } | undefined;
  if (!expert?.invoke) {
    return { ok: false, error: 'expert engine not injected' };
  }

  let invokeResult: unknown;
  try {
    invokeResult = await expert.invoke({
      expert_id: link.expert_id,
      task_type: body.taskType ?? link.default_task_type,
      input_type: 'text',
      input_data: body.question,
      context: personContext,
      params: { depth: body.depth ?? 'standard' },
    });
  } catch (e) {
    return { ok: false, error: `expert invoke failed: ${(e as Error).message}` };
  }

  // 更新 invoke 计数
  await deps.db.query(
    `UPDATE ceo_person_agent_links
        SET last_invoked_at = NOW(), invoke_count = invoke_count + 1
      WHERE person_id = $1::uuid`,
    [personId],
  );

  return { ok: true, result: invokeResult };
}
