// Debate Engine — 多专家协作辩论模块
// 3轮辩论: 独立观点 → 交叉质疑 → 综合裁决

import type { ExpertEngine } from './ExpertEngine.js';
import type {
  ExpertProfile,
  ExpertLibraryDeps,
  DebateRequest,
  DebateRound,
  DebateResult,
} from './types.js';
import { expertProfileToDbParams } from './expertProfileDb.js';

/** 从 LLM 输出中提取 JSON 对象，兼容代码块和裸 JSON */
function extractJSON(raw: string): any {
  let s = raw.trim();
  // 去除 ```json ... ``` 代码块（贪婪匹配到最后一个 ```，避免 JSON 字符串内含 ``` 时截断）
  const fenceEnd = s.lastIndexOf('```');
  if (s.startsWith('```') && fenceEnd > 3) {
    const inner = s.slice(s.indexOf('\n') + 1, fenceEnd).trim();
    if (inner.length > 0) s = inner.replace(/^json\s*/i, '').trim();
  } else {
    const codeBlock = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlock) s = codeBlock[1].trim();
  }
  // 规范化容易弄坏 JSON.parse 的字符
  s = s
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  // 尝试直接解析
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  // 找到第一个 { 到最后一个 }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(s.slice(start, end + 1));
  }
  throw new Error('No valid JSON found in response');
}

/** 模型综合分析失败时，用各轮原文生成可用的结论与列表（非空、可持久化） */
function buildFallbackSynthesis(
  experts: ExpertProfile[],
  topic: string,
  rounds: DebateRound[]
): {
  consensus: string[];
  disagreements: string[];
  finalVerdict: string;
  participantSummary: DebateResult['participantSummary'];
} {
  const verdictRound = rounds.find(r => r.phase === 'verdict');
  const crossRound = rounds.find(r => r.phase === 'cross_examination');
  const independent = rounds.find(r => r.phase === 'independent');

  const sourceRound =
    verdictRound?.opinions?.length ? verdictRound : independent;
  const participantSummary = sourceRound?.opinions?.length
    ? sourceRound.opinions.map(o => ({
        expertId: o.expertId,
        expertName: o.expertName,
        position:
          o.content.length > 160 ? `${o.content.slice(0, 160)}…` : o.content,
      }))
    : experts.map(e => ({
        expertId: e.expert_id,
        expertName: e.name,
        position: '',
      }));

  const verdictLines = (verdictRound?.opinions ?? []).map(
    o => `【${o.expertName}】${o.content}`
  );
  const finalVerdict =
    verdictLines.length > 0
      ? `（系统自动摘录各专家最终立场，未使用模型综合段落）\n\n${verdictLines.join('\n\n')}`
      : independent
        ? `（无单独「裁决」轮）以下为首轮独立观点摘录：\n\n${independent.opinions.map(o => `【${o.expertName}】${o.content}`).join('\n\n')}`
        : '暂无可摘录的辩论原文。';

  const consensus: string[] = [];
  if (verdictRound?.opinions.length) {
    consensus.push(
      `各方在「${topic}」下已分别给出最终立场，核心表述见下方「综合裁决」中的分专家摘录。`
    );
  } else if (independent?.opinions.length) {
    consensus.push(
      `已完成独立观点轮次；若模型未返回结构化共识，请阅读首轮各专家发言。`
    );
  }

  const disagreements: string[] = [];
  if (crossRound?.opinions.length) {
    disagreements.push(
      '交叉质疑轮中各方对彼此观点提出了反驳或补充，详见第二轮原文。'
    );
  } else {
    disagreements.push(
      '未进行交叉质疑轮或未摘录到结构化分歧，请结合各轮发言自行对照。'
    );
  }

  return { consensus, disagreements, finalVerdict, participantSummary };
}

export class DebateEngine {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 调用 LLM 的安全包装：单次失败不抛出，返回可展示的降级文本。
   * 避免某位专家失败导致整个 /debate 请求 500。
   */
  private async safeCompleteWithSystem(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature: number; maxTokens: number },
    fallback: string
  ): Promise<string> {
    try {
      const reply = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, options);
      const text = typeof reply === 'string' ? reply.trim() : '';
      return text || fallback;
    } catch (err) {
      const hint = err instanceof Error ? err.message : String(err);
      console.warn('[DebateEngine] LLM call failed, using fallback:', hint);
      return fallback;
    }
  }

  /**
   * 执行多专家辩论
   */
  async debate(request: DebateRequest): Promise<DebateResult> {
    const { topic, content, expertIds, rounds = 3, temperature = 0.7, context } = request;

    if (expertIds.length < 2 || expertIds.length > 4) {
      throw new Error('Debate requires 2-4 experts');
    }

    // 加载专家
    const experts: ExpertProfile[] = [];
    for (const id of expertIds) {
      const expert = await this.engine.loadExpert(id);
      if (!expert) throw new Error(`Expert not found: ${id}`);
      experts.push(expert);
    }

    const debateRounds: DebateRound[] = [];

    // Round 1: 独立观点 — 每位专家独立发表意见
    const round1 = await this.independentOpinions(experts, topic, content, context, temperature);
    debateRounds.push(round1);

    // Round 2..N-1: 交叉质疑 — 专家之间互相质疑
    for (let r = 2; r < rounds; r++) {
      const crossRound = await this.crossExamination(experts, topic, debateRounds[debateRounds.length - 1], temperature, r);
      debateRounds.push(crossRound);
    }

    // Final Round: 综合裁决 — 各专家总结立场
    if (rounds >= 2) {
      const verdictRound = await this.finalVerdict(experts, topic, debateRounds, temperature);
      debateRounds.push(verdictRound);
    }

    // 生成共识分析
    const { consensus, disagreements, finalVerdict, participantSummary } =
      await this.synthesize(experts, topic, debateRounds);

    const result: DebateResult = {
      topic,
      rounds: debateRounds,
      consensus,
      disagreements,
      finalVerdict,
      participantSummary,
    };

    // 持久化：expert_invocations.expert_id 外键要求行必须存在于 expert_profiles；
    // 仅用内存 register 的专家未入库时 INSERT 会失败，故先补齐 profiles。
    const savedId = await this.persistDebate(experts, result);
    if (savedId) result.id = savedId;

    return result;
  }

  /**
   * 将参与辩论的专家写入 expert_profiles（已存在则跳过），再保存 invocation。
   * 返回生成的 UUID（持久化失败时返回 undefined）。
   */
  private async persistDebate(
    experts: ExpertProfile[],
    result: DebateResult
  ): Promise<string | undefined> {
    try {
      await this.ensureExpertsInDb(experts);
      const primaryExpertId = experts[0]?.expert_id;
      if (!primaryExpertId) {
        console.warn('[DebateEngine] persistDebate: empty experts');
        return undefined;
      }
      return await this.saveDebate(result, primaryExpertId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      console.warn('[DebateEngine] Failed to persist debate:', msg, stack || '');
      return undefined;
    }
  }

  /** 保证外键：仅缓存、未落库的专家先 INSERT（不覆盖已有行） */
  private async ensureExpertsInDb(experts: ExpertProfile[]): Promise<void> {
    const sql = `
      INSERT INTO expert_profiles (
        expert_id, name, domain, persona, method, emm, constraints_config, output_schema, anti_patterns, signature_phrases, is_active
      ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, true)
      ON CONFLICT (expert_id) DO NOTHING
    `;
    for (const ex of experts) {
      try {
        const row = expertProfileToDbParams(ex);
        await this.deps.db.query(sql, [
          row.expert_id,
          row.name,
          row.domain,
          JSON.stringify(row.persona),
          JSON.stringify(row.method),
          row.emm ? JSON.stringify(row.emm) : null,
          JSON.stringify(row.constraints_config),
          JSON.stringify(row.output_schema),
          row.anti_patterns,
          row.signature_phrases,
        ]);
      } catch (e) {
        console.warn(
          '[DebateEngine] ensureExpertsInDb failed for',
          ex.expert_id,
          e instanceof Error ? e.message : e
        );
      }
    }
  }

  /**
   * Round 1: 独立观点
   */
  private async independentOpinions(
    experts: ExpertProfile[],
    topic: string,
    content: string,
    context?: string,
    temperature = 0.7
  ): Promise<DebateRound> {
    const opinions = await Promise.all(
      experts.map(async (expert) => {
        const systemPrompt = `你是 ${expert.name}，${expert.domain.join('/')} 领域专家。
风格: ${expert.persona.style}
语气: ${expert.persona.tone}
分析框架: ${expert.method.frameworks.join('、')}

你正在参与一场专家研讨会，请就以下议题发表你的独立观点。
要求：观点鲜明，有理有据，体现你的专业特色。300字以内。`;

        const userPrompt = `议题: ${topic}
${context ? `背景: ${context}\n` : ''}
待讨论内容:
${content}

请发表你的独立观点:`;

        const reply = await this.safeCompleteWithSystem(
          systemPrompt,
          userPrompt,
          { temperature, maxTokens: 800 },
          `【降级输出】${expert.name} 暂时无法生成独立观点，请稍后重试。`
        );

        return {
          expertId: expert.expert_id,
          expertName: expert.name,
          content: reply.trim(),
        };
      })
    );

    return { round: 1, phase: 'independent', opinions };
  }

  /**
   * Round 2: 交叉质疑
   * 升级版：利用 target 的 contradictions（已知内部矛盾）+ attacker 的 mentalModels
   * 构造针对性质询，从"自由发挥"升级为"击中对方认知软肋"。
   */
  private async crossExamination(
    experts: ExpertProfile[],
    topic: string,
    previousRound: DebateRound,
    temperature = 0.7,
    roundNumber = 2
  ): Promise<DebateRound> {
    const opinions = await Promise.all(
      experts.map(async (expert, index) => {
        // 选择一位不同的专家作为质疑目标
        const targetIndex = (index + 1) % experts.length;
        const targetExpert = experts[targetIndex];
        const targetOpinion = previousRound.opinions[targetIndex];

        const { systemPrompt, userPrompt } = this.buildCrossExamPrompt(
          expert,
          targetExpert,
          topic,
          targetOpinion.content,
        );

        const reply = await this.safeCompleteWithSystem(
          systemPrompt,
          userPrompt,
          { temperature: Math.max(0.1, temperature - 0.1), maxTokens: 600 },
          `【降级输出】${expert.name} 暂时无法完成交叉质疑。`
        );

        return {
          expertId: expert.expert_id,
          expertName: expert.name,
          content: reply.trim(),
          targetExpertId: targetExpert.expert_id,
        };
      })
    );

    return { round: roundNumber, phase: 'cross_examination', opinions };
  }

  /**
   * 构造 cross_examination 轮次的 prompt
   * - target 的 contradictions: 作为"可追击的认知软肋"提示给 attacker
   * - target 的 blindSpots.knownBias / weakDomains: 补充弱点
   * - attacker 的 mentalModels[0-2]: 作为反驳武器视角
   *
   * 任何字段缺失都优雅降级为通用质询提示（保留向后兼容）
   */
  private buildCrossExamPrompt(
    attacker: ExpertProfile,
    target: ExpertProfile,
    topic: string,
    targetOpinionText: string,
  ): { systemPrompt: string; userPrompt: string } {
    // 提取 attacker 的 mentalModels 作为质询武器
    const attackerModels = attacker.persona.cognition?.mentalModels ?? [];
    const modelsBlock = attackerModels.slice(0, 3).length > 0
      ? `\n\n你可以用以下自己的心智模型作为质询武器（不必全部使用，选最相关的）：\n` +
        attackerModels
          .slice(0, 3)
          .map((m, i) => `${i + 1}. 【${m.name}】${m.summary}`)
          .join('\n')
      : '';

    // 提取 target 的 contradictions 作为认知软肋
    const targetContradictions = target.persona.contradictions ?? [];
    const contradictionsBlock = targetContradictions.length > 0
      ? `\n\n对方（${target.name}）有以下**已知的认知矛盾**，可在场景契合时针对性追问：\n` +
        targetContradictions
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.tension}（场景：${c.context}；通常解释：${c.resolution}）`)
          .join('\n') +
        `\n\n如果当前议题触及上述任一矛盾，请明确指出并追问对方"在这个具体场景下你会倒向哪一边"。`
      : '';

    // 提取 target 的 blindSpots 作为额外攻击面
    const targetBlindSpots = target.persona.blindSpots;
    const blindSpotsBlock = targetBlindSpots && (targetBlindSpots.knownBias?.length || targetBlindSpots.weakDomains?.length)
      ? `\n\n对方公开承认的偏见/弱项：\n` +
        (targetBlindSpots.knownBias?.length
          ? `- 已知偏见：${targetBlindSpots.knownBias.join('、')}\n`
          : '') +
        (targetBlindSpots.weakDomains?.length
          ? `- 薄弱领域：${targetBlindSpots.weakDomains.join('、')}`
          : '')
      : '';

    const systemPrompt = `你是 ${attacker.name}，${attacker.domain.join('/')} 领域专家。
风格: ${attacker.persona.style}
语气: ${attacker.persona.tone}

你正在一场研讨会中，需要对 ${target.name} 的观点进行**精准质疑**。
要求：
1. 不要泛泛而谈，找到对方论证中最具体的软肋
2. 优先针对对方已知的认知矛盾或盲区发起追问
3. 用你自己的心智模型作为反驳框架
4. 250字以内，论据+质问两段式${modelsBlock}${contradictionsBlock}${blindSpotsBlock}`;

    const userPrompt = `议题: ${topic}

${target.name} 在第一轮的观点:
${targetOpinionText}

请对以上观点进行精准质疑——优先针对上面 system prompt 中提到的认知矛盾或盲区，
用你自己的心智模型框架发起反驳:`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Round 3: 综合裁决
   */
  private async finalVerdict(
    experts: ExpertProfile[],
    topic: string,
    previousRounds: DebateRound[],
    temperature = 0.7
  ): Promise<DebateRound> {
    // 汇总前几轮讨论
    const discussionSummary = previousRounds.map(round =>
      `=== 第${round.round}轮 (${round.phase === 'independent' ? '独立观点' : '交叉质疑'}) ===\n` +
      round.opinions.map(o =>
        `【${o.expertName}】${o.targetExpertId ? `(回应 ${previousRounds[0].opinions.find(p => p.expertId === o.targetExpertId)?.expertName})` : ''}: ${o.content}`
      ).join('\n\n')
    ).join('\n\n');

    const opinions = await Promise.all(
      experts.map(async (expert) => {
        const systemPrompt = `你是 ${expert.name}。经过前面的讨论，请总结你的最终立场。
要求：考虑其他专家的质疑，明确你坚持的观点和修正的部分。200字以内。`;

        const userPrompt = `议题: ${topic}

前面的讨论:
${discussionSummary}

请总结你的最终立场:`;

        const reply = await this.safeCompleteWithSystem(
          systemPrompt,
          userPrompt,
          { temperature: Math.max(0.1, temperature - 0.2), maxTokens: 600 },
          `【降级输出】${expert.name} 暂时无法给出最终立场。`
        );

        return {
          expertId: expert.expert_id,
          expertName: expert.name,
          content: reply.trim(),
        };
      })
    );

    return { round: previousRounds.length + 1, phase: 'verdict', opinions };
  }

  /**
   * 合成辩论结果
   */
  private async synthesize(
    experts: ExpertProfile[],
    topic: string,
    rounds: DebateRound[]
  ): Promise<{
    consensus: string[];
    disagreements: string[];
    finalVerdict: string;
    participantSummary: DebateResult['participantSummary'];
  }> {
    const fallback = buildFallbackSynthesis(experts, topic, rounds);

    const allContent = rounds.map(round =>
      round.opinions.map(o => `[${o.expertName}] ${o.content}`).join('\n')
    ).join('\n---\n');

    const systemPrompt =
      '你是一位学术辩论裁判。只输出一个合法的 JSON 对象，键名必须是英文：consensus、disagreements、finalVerdict、participants。不要输出任何 JSON 之外的文字、解释或 markdown。';

    const userPrompt = `专家：${experts.map(e => `${e.name}(${e.expert_id})`).join('、')}
议题：「${topic}」

多轮辩论记录：
${allContent}

请输出 JSON，格式示例（请把内容换成真实分析）：
{"consensus":["…","…"],"disagreements":["…","…"],"finalVerdict":"不超过300字的综合裁决","participants":[{"expertId":"${experts[0]?.expert_id || ''}","expertName":"${experts[0]?.name || ''}","position":"一句话立场"}]}

要求：
- participants 须覆盖本次参与辩论的全部专家（expertId 与上文括号内一致）。
- consensus / disagreements 各至少 1 条；
- 字符串内如需引号请使用单引号 ' ，避免出现未转义的双引号。`;

    const tryParse = (raw: string) => {
      const parsed = extractJSON(raw);
      const consensus = Array.isArray(parsed.consensus)
        ? parsed.consensus.filter((x: unknown) => typeof x === 'string' && String(x).trim())
        : [];
      const disagreements = Array.isArray(parsed.disagreements)
        ? parsed.disagreements.filter((x: unknown) => typeof x === 'string' && String(x).trim())
        : [];
      const finalVerdict =
        typeof parsed.finalVerdict === 'string' ? parsed.finalVerdict.trim() : '';
      let participantSummary = Array.isArray(parsed.participants)
        ? parsed.participants.map((p: any) => ({
            expertId: String(p.expertId || p.expert_id || '').trim(),
            expertName: String(p.expertName || p.name || '').trim(),
            position: String(p.position || '').trim(),
          }))
        : [];
      const idSet = new Set(experts.map(e => e.expert_id));
      participantSummary = participantSummary.filter(
        (p: DebateResult['participantSummary'][number]) =>
          p.expertId && idSet.has(p.expertId)
      );
      return { consensus, disagreements, finalVerdict, participantSummary };
    };

    const mergeWithFallback = (partial: {
      consensus: string[];
      disagreements: string[];
      finalVerdict: string;
      participantSummary: DebateResult['participantSummary'];
    }) => ({
      consensus:
        partial.consensus.length > 0 ? partial.consensus : fallback.consensus,
      disagreements:
        partial.disagreements.length > 0
          ? partial.disagreements
          : fallback.disagreements,
      finalVerdict:
        partial.finalVerdict.length > 0
          ? partial.finalVerdict
          : fallback.finalVerdict,
      participantSummary:
        partial.participantSummary.length >= experts.length
          ? partial.participantSummary
          : fallback.participantSummary,
    });

    try {
      const result = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 4096,
      });

      const first = tryParse(result);
      if (
        first.finalVerdict.length > 0 &&
        first.consensus.length > 0 &&
        first.disagreements.length > 0 &&
        first.participantSummary.length >= experts.length
      ) {
        return {
          consensus: first.consensus,
          disagreements: first.disagreements,
          finalVerdict: first.finalVerdict,
          participantSummary: first.participantSummary,
        };
      }

      const retryPrompt = `${userPrompt}\n\n上一次输出无效或不完整。请重新只输出一行紧凑 JSON（无换行、无 markdown），且 participants 必须包含全部 ${experts.length} 位专家的 expertId。`;
      const retryRaw = await this.deps.llm.completeWithSystem(
        systemPrompt,
        retryPrompt,
        { temperature: 0.1, maxTokens: 4096 }
      );
      const second = tryParse(retryRaw);
      return mergeWithFallback(second);
    } catch (err) {
      const hint =
        err instanceof Error ? err.message : String(err);
      console.warn('[DebateEngine] synthesize failed:', hint);
      return fallback;
    }
  }

  /**
   * 保存辩论记录到数据库（primaryExpertId 须已在 expert_profiles 中存在）
   * 返回生成的 UUID。
   */
  private async saveDebate(
    result: DebateResult,
    primaryExpertId: string
  ): Promise<string> {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    await this.deps.db.query(
      `INSERT INTO expert_invocations (id, expert_id, task_type, input_type, input_summary, output_sections, params)
       VALUES ($1, $2, 'debate', 'text', $3, $4, $5)`,
      [
        id,
        primaryExpertId,
        result.topic.substring(0, 500),
        JSON.stringify(result),
        JSON.stringify({
          expertIds: result.participantSummary.map(p => p.expertId).filter(Boolean),
          roundCount: result.rounds.length,
        }),
      ]
    );
    return id;
  }

  /**
   * 查询辩论历史
   */
  async listDebates(limit = 20): Promise<Array<{ id: string; topic: string; expertNames: string[]; createdAt: string; result: DebateResult }>> {
    try {
      const res = await this.deps.db.query(
        `SELECT id, input_summary as topic, output_sections, created_at
         FROM expert_invocations
         WHERE task_type = 'debate'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return res.rows.map((row: any) => {
        const result = JSON.parse(row.output_sections || '{}');
        return {
          id: row.id,
          topic: row.topic || result.topic || '',
          expertNames: (result.participantSummary || []).map((p: any) => p.expertName),
          createdAt: row.created_at,
          result,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * 获取单条辩论详情
   */
  async getDebate(debateId: string): Promise<DebateResult | null> {
    try {
      const res = await this.deps.db.query(
        `SELECT output_sections FROM expert_invocations WHERE id = $1 AND task_type = 'debate'`,
        [debateId]
      );
      if (res.rows.length === 0) return null;
      return JSON.parse(res.rows[0].output_sections || '{}');
    } catch {
      return null;
    }
  }
}
