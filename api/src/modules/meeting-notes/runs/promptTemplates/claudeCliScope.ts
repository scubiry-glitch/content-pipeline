// runs/promptTemplates/claudeCliScope.ts — scope-level claude session prompt
//
// 由 runEngine.execute() 在 claude-cli 模式下"meeting spawn 完成后"追加 spawn 一次。
// 用 --resume <scopeSessionId> 续接该 scope 的对话历史，让 claude 在累积了
// "前 N 场会议" 的上下文里"加入这第 N+1 场会议的更新"，输出 scopeUpdates JSON。
//
// 跟 meeting-level prompt 的区别：
//   - 不再喂整段转写（claude 在 session history 里已经看过了）
//   - 只喂"本次新增 meeting 的轴 + facts + wikiMarkdown 摘要" + 任务指令
//   - prompt 体积小（~3-5KB），不必搞 schema spec / few-shot / 专家 personas
//   - 输出契约只有 scopeUpdates 一个顶层 key

export interface ClaudeCliScopePromptCtx {
  scope: {
    kind: 'project' | 'client' | 'topic';
    id: string;
    name: string;
    /** scope 级 expert-config 提供的 preset / strategies / decorators */
    config?: { preset: string; strategies?: string[]; decorators?: string[] } | null;
  };
  /** 本次刚跑完的 meeting 的摘要，注入 prompt 让 claude 在 session 累积视图里加入它 */
  newMeeting: {
    meetingId: string;
    title: string;
    date: string | null;
    /** analysis.summary.decision + tension topics + consensus 关键条目，trim 到 ~2KB */
    digest: string;
  };
  /** 是否首次起 session（首次需要让 claude 知道 scope 上下文从空起步） */
  isFreshSession: boolean;
}

const SCOPE_OUTPUT_DISCIPLINE = `
=== OUTPUT DISCIPLINE ===
1. 严格 JSON, 顶层只有 scopeUpdates 一个 key, 不要包 markdown 代码块。
2. judgmentsToReuse: 只列出**前几场会议中已经被你抽出过**的判断 (from session history) 在本次又被命中。
   不要凭空创造 judgmentId — 必须是 session history 中你之前输出过的 J-XX 形式的 id。
3. openQuestionsToReopen: 只列出**前几场提过但仍 open / chronic** 的问题, 在本次又被提起。
4. judgmentDrifts: 只在转写中**显式表达**"以前的判断不再成立、被新事实推翻"时才输出, 否则空数组。
5. 不要编造数据。
`.trim();

const SCOPE_OUTPUT_SHAPE = `
=== OUTPUT SHAPE ===
{
  "scopeUpdates": {
    "judgmentsToReuse": [
      {
        "judgmentId": "J-XX",                      // 来自 session history 的局部 id
        "newReuseCount": 4,                        // 累计被命中次数 (从 session history 里读出之前的值并 +1)
        "additionalLinkedMeetingId": "<meetingId>" // 本次 meetingId
      }
    ],
    "openQuestionsToReopen": [
      {
        "questionText": "<text>",
        "newStatus": "chronic",                    // open | chronic
        "timesRaisedDelta": 1                      // 这次新增几次提及, 一般是 1
      }
    ],
    "judgmentDrifts": [
      {
        "from": "J-XX",                            // 旧判断 id
        "to": "J-YY",                              // 新判断 id (本次新提炼的)
        "reason": "<short>"                        // 为什么演化
      }
    ]
  }
}
`.trim();

export function buildScopePrompt(ctx: ClaudeCliScopePromptCtx): string {
  const lines: string[] = [];

  // ── 1. Role + scope 上下文 ──────────────────────────────────
  lines.push(`=== ROLE ===
你正在以下面这个 scope 的累积视角更新跨会议判断。你的对话历史 (来自 --resume) 里
已经累积了这个 scope 下前 N 场会议的全部 axes / facts / 决议 / 张力。
本次要加入第 N+1 场, 然后输出"哪些前面的判断被复用、哪些 open question 又被提起、
哪些 judgment 演化了"的 JSON。`);

  // ── 2. Scope 上下文 ─────────────────────────────────────────
  const scopeLines: string[] = ['=== SCOPE CONTEXT ==='];
  scopeLines.push(`scope.kind: ${ctx.scope.kind}`);
  scopeLines.push(`scope.id: ${ctx.scope.id}`);
  scopeLines.push(`scope.name: ${ctx.scope.name}`);
  if (ctx.scope.config) {
    scopeLines.push(`preset: ${ctx.scope.config.preset}`);
    if (ctx.scope.config.strategies?.length) {
      scopeLines.push(`额外 strategies: ${ctx.scope.config.strategies.join(', ')}`);
    }
    if (ctx.scope.config.decorators?.length) {
      scopeLines.push(`额外 decorators: ${ctx.scope.config.decorators.join(' | ')}`);
    }
  }
  if (ctx.isFreshSession) {
    scopeLines.push('');
    scopeLines.push('注: 这是该 scope 首次跑 claude session, 没有历史会议累积。');
    scopeLines.push('     judgmentsToReuse / judgmentDrifts 应该是空数组, 因为还没有"以前的判断"。');
    scopeLines.push('     openQuestionsToReopen 也只有当本次 meeting 自己提到"长期未解的问题"时才填。');
  } else {
    scopeLines.push('');
    scopeLines.push('注: --resume 模式, 你应该能看到该 scope 历史会议的完整上下文。');
  }
  lines.push(scopeLines.join('\n'));

  // ── 3. 本次新增 meeting ──────────────────────────────────────
  const newLines: string[] = ['=== NEW MEETING ADDED ==='];
  newLines.push(`meetingId: ${ctx.newMeeting.meetingId}`);
  newLines.push(`title: ${ctx.newMeeting.title}`);
  if (ctx.newMeeting.date) newLines.push(`date: ${ctx.newMeeting.date}`);
  newLines.push('');
  newLines.push('--- digest (analysis.summary + tension topics + consensus 关键条目) ---');
  newLines.push(ctx.newMeeting.digest);
  lines.push(newLines.join('\n'));

  // ── 4. Output discipline + shape ────────────────────────────
  lines.push(SCOPE_OUTPUT_DISCIPLINE);
  lines.push(SCOPE_OUTPUT_SHAPE);

  // ── 5. Final ────────────────────────────────────────────────
  lines.push(`=== TASK ===
基于"前 N 场 (来自 session history) + 本次新增"的累积视图, 输出 scopeUpdates JSON。
不要重复 meeting-level 已经做过的工作 (analysis / axes 不要再生成)。
仅输出 JSON, 无 prose, 无 markdown 围栏。
现在开始输出 JSON:`);

  return lines.join('\n\n');
}

/**
 * 给 buildScopePrompt 用的 digest 生成器：把 meeting-level 的 analysis + axes 摘出来 ~2KB。
 * runEngine 在拿到 spawn #1 结果后，传给 spawn #2 之前调一次。
 */
export function buildMeetingDigest(meetingResult: {
  analysis: any;
  axes: any;
}): string {
  const lines: string[] = [];
  const a = meetingResult.analysis ?? {};
  if (a.summary?.decision) {
    lines.push(`决议: ${a.summary.decision}`);
  }
  const tensions = Array.isArray(a.tension) ? a.tension : [];
  if (tensions.length > 0) {
    lines.push('');
    lines.push('张力:');
    for (const t of tensions.slice(0, 6)) {
      lines.push(`  - ${t.id}: ${t.topic} (强度 ${t.intensity})`);
    }
  }
  const consensus = Array.isArray(a.consensus) ? a.consensus : [];
  const cons = consensus.filter((c: any) => c.kind === 'consensus').slice(0, 5);
  const divs = consensus.filter((c: any) => c.kind === 'divergence').slice(0, 5);
  if (cons.length > 0) {
    lines.push('');
    lines.push('共识:');
    for (const c of cons) lines.push(`  - ${c.id}: ${c.text}`);
  }
  if (divs.length > 0) {
    lines.push('');
    lines.push('分歧:');
    for (const d of divs) lines.push(`  - ${d.id}: ${d.text}`);
  }
  const newCog = Array.isArray(a.newCognition) ? a.newCognition : [];
  if (newCog.length > 0) {
    lines.push('');
    lines.push('信念更新:');
    for (const n of newCog.slice(0, 6)) {
      lines.push(`  - ${n.id} (${n.who}): ${n.before} → ${n.after}`);
    }
  }
  // axes 摘要
  const ax = meetingResult.axes ?? {};
  const decisions = ax.projects?.decisionChain ?? [];
  const assumptions = ax.projects?.assumptions ?? [];
  const openQs = ax.projects?.openQuestions ?? [];
  const judgments = ax.knowledge?.reusableJudgments ?? [];
  if (decisions.length || assumptions.length || openQs.length || judgments.length) {
    lines.push('');
    lines.push('axes 摘要:');
    if (decisions.length) lines.push(`  decisions: ${decisions.length} 条 (top: ${decisions[0]?.title ?? '-'})`);
    if (assumptions.length) lines.push(`  assumptions: ${assumptions.length} 条 (top evidence: ${assumptions[0]?.evidenceGrade ?? '-'})`);
    if (openQs.length) {
      const chronic = openQs.filter((q: any) => q.status === 'chronic').length;
      lines.push(`  openQuestions: ${openQs.length} 条 (chronic: ${chronic})`);
    }
    if (judgments.length) lines.push(`  reusableJudgments: ${judgments.length} 条`);
  }
  return lines.join('\n');
}
