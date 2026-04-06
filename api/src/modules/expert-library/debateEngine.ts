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

export class DebateEngine {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 执行多专家辩论
   */
  async debate(request: DebateRequest): Promise<DebateResult> {
    const { topic, content, expertIds, rounds = 3, context } = request;

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
    const round1 = await this.independentOpinions(experts, topic, content, context);
    debateRounds.push(round1);

    // Round 2: 交叉质疑 — 专家之间互相质疑
    if (rounds >= 2) {
      const round2 = await this.crossExamination(experts, topic, round1);
      debateRounds.push(round2);
    }

    // Round 3: 综合裁决 — 各专家总结立场
    if (rounds >= 3) {
      const round3 = await this.finalVerdict(experts, topic, debateRounds);
      debateRounds.push(round3);
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

    // 持久化辩论记录
    this.saveDebate(result).catch(err =>
      console.warn('[DebateEngine] Failed to save debate:', err)
    );

    return result;
  }

  /**
   * Round 1: 独立观点
   */
  private async independentOpinions(
    experts: ExpertProfile[],
    topic: string,
    content: string,
    context?: string
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

        const reply = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
          temperature: 0.6,
          maxTokens: 800,
        });

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
   */
  private async crossExamination(
    experts: ExpertProfile[],
    topic: string,
    round1: DebateRound
  ): Promise<DebateRound> {
    const opinions = await Promise.all(
      experts.map(async (expert, index) => {
        // 选择一位不同的专家作为质疑目标
        const targetIndex = (index + 1) % experts.length;
        const targetExpert = experts[targetIndex];
        const targetOpinion = round1.opinions[targetIndex];

        const systemPrompt = `你是 ${expert.name}，${expert.domain.join('/')} 领域专家。
风格: ${expert.persona.style}
语气: ${expert.persona.tone}

你正在一场研讨会中，需要对 ${targetExpert.name} 的观点进行质疑和讨论。
要求：指出对方观点中的漏洞或不足，提出你的反驳或补充。200字以内。`;

        const userPrompt = `议题: ${topic}

${targetExpert.name} 的观点:
${targetOpinion.content}

请对以上观点进行质疑或补充:`;

        const reply = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
          temperature: 0.5,
          maxTokens: 600,
        });

        return {
          expertId: expert.expert_id,
          expertName: expert.name,
          content: reply.trim(),
          targetExpertId: targetExpert.expert_id,
        };
      })
    );

    return { round: 2, phase: 'cross_examination', opinions };
  }

  /**
   * Round 3: 综合裁决
   */
  private async finalVerdict(
    experts: ExpertProfile[],
    topic: string,
    previousRounds: DebateRound[]
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

        const reply = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
          temperature: 0.4,
          maxTokens: 600,
        });

        return {
          expertId: expert.expert_id,
          expertName: expert.name,
          content: reply.trim(),
        };
      })
    );

    return { round: 3, phase: 'verdict', opinions };
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
    const allContent = rounds.map(round =>
      round.opinions.map(o => `[${o.expertName}] ${o.content}`).join('\n')
    ).join('\n---\n');

    const prompt = `以下是 ${experts.map(e => e.name).join('、')} 关于「${topic}」的多轮辩论记录。
请分析并输出 JSON：
{
  "consensus": ["共识点1", "共识点2"],
  "disagreements": ["分歧点1", "分歧点2"],
  "finalVerdict": "200字以内的综合裁决",
  "participants": [
    { "expertId": "id", "expertName": "名字", "position": "核心立场一句话" }
  ]
}

辩论记录：
${allContent}

只输出 JSON:`;

    try {
      const result = await this.deps.llm.complete(prompt, {
        temperature: 0.3,
        maxTokens: 1500,
        responseFormat: 'json',
      });

      let jsonStr = result.trim();
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) jsonStr = match[1].trim();

      const parsed = JSON.parse(jsonStr);
      return {
        consensus: parsed.consensus || [],
        disagreements: parsed.disagreements || [],
        finalVerdict: parsed.finalVerdict || '',
        participantSummary: (parsed.participants || []).map((p: any) => ({
          expertId: p.expertId || '',
          expertName: p.expertName || '',
          position: p.position || '',
        })),
      };
    } catch {
      return {
        consensus: [],
        disagreements: [],
        finalVerdict: '辩论综合分析生成失败',
        participantSummary: experts.map(e => ({
          expertId: e.expert_id,
          expertName: e.name,
          position: '',
        })),
      };
    }
  }

  /**
   * 保存辩论记录到数据库
   */
  private async saveDebate(result: DebateResult): Promise<void> {
    const id = `debate-${Date.now()}`;
    await this.deps.db.query(
      `INSERT INTO expert_invocations (id, expert_id, task_type, input_type, input_summary, output_sections, params)
       VALUES ($1, $2, 'debate', 'text', $3, $4, $5)`,
      [
        id,
        result.participantSummary.map(p => p.expertId).join(','),
        result.topic.substring(0, 500),
        JSON.stringify(result),
        JSON.stringify({
          expertIds: result.participantSummary.map(p => p.expertId),
          roundCount: result.rounds.length,
        }),
      ]
    );
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
