// BlueTeam Agent - 蓝军评审专家
// 负责: 3专家 × 3角度(挑战/扩展/归纳) × 2轮 深度评审
// 支持: 专家库动态匹配

import { BaseAgent, AgentContext, AgentResult } from './base.js';
import { query } from '../db/connection.js';
import { generate } from '../services/llm.js';
import { expertLibrary, Expert } from '../services/expertLibrary.js';

export interface BlueTeamConfig {
  expertCount: number;        // 3
  anglesPerExpert: number;    // 3 (挑战/扩展/归纳)
  questionsPerAngle: number;  // 1
  rounds: number;             // 2
}

export interface BlueTeamExpert {
  id: string;
  name: string;
  title: string;
  angle: 'challenger' | 'expander' | 'synthesizer';
  systemPrompt: string;
}

export interface BlueTeamQuestion {
  id: string;
  expertId: string;
  expertName: string;
  angle: string;
  question: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface BlueTeamRound {
  round: number;
  questions: BlueTeamQuestion[];
  revisionContent?: string;
  revisionSummary?: string;
}

export interface BlueTeamInput {
  taskId: string;
  draftContent: string;
  topic: string;
  outline?: any[];
}

export interface BlueTeamOutput {
  rounds: BlueTeamRound[];
  finalDraft: string;
  status: 'completed' | 'awaiting_approval';
}

export class BlueTeamAgent extends BaseAgent {
  private experts: Expert[] = [];
  private config: BlueTeamConfig = {
    expertCount: 3,
    anglesPerExpert: 3,
    questionsPerAngle: 1,
    rounds: 2
  };

  constructor() {
    super('BlueTeamAgent', {} as any);
  }

  async execute(input: BlueTeamInput, context?: AgentContext): Promise<AgentResult<BlueTeamOutput>> {
    this.clearLogs();
    this.log('info', 'Starting BlueTeam review', { taskId: input.taskId, config: this.config });

    try {
      // 根据主题匹配专家
      this.experts = await expertLibrary.matchExperts(input.topic, this.config.expertCount);
      this.log('info', 'Experts matched for topic', {
        topic: input.topic,
        experts: this.experts.map(e => ({ name: e.name, angle: e.angle, domains: e.domains }))
      });

      // 更新任务状态为 reviewing，并记录专家信息
      await query(
        `UPDATE tasks SET status = 'reviewing', current_stage = 'blue_team_round_1', updated_at = NOW() WHERE id = $1`,
        [input.taskId]
      );

      // 保存专家信息到任务
      await query(
        `UPDATE tasks SET research_data = COALESCE(research_data, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ blue_team_experts: this.experts.map(e => ({ id: e.id, name: e.name, title: e.title, angle: e.angle })) }), input.taskId]
      );

      let currentDraft = input.draftContent;
      const rounds: BlueTeamRound[] = [];

      // 执行2轮评审
      for (let round = 1; round <= this.config.rounds; round++) {
        this.log('info', `BlueTeam Round ${round} started`);

        // 3专家并行评审
        const roundQuestions: BlueTeamQuestion[] = [];

        for (const expert of this.experts) {
          this.log('info', `Expert ${expert.name} (${expert.angle}) reviewing`);

          const questions = await this.generateExpertQuestions(
            expert,
            currentDraft,
            input.topic,
            round
          );

          roundQuestions.push(...questions);
        }

        // 保存评审问题到数据库
        await this.saveQuestions(input.taskId, round, roundQuestions);

        // 根据问题修改稿件
        this.log('info', `Revising draft based on ${roundQuestions.length} questions`);
        const revision = await this.reviseDraft(currentDraft, roundQuestions, round, input.topic);

        // 保存修改版本
        await this.saveDraftVersion(input.taskId, round, revision.content);

        rounds.push({
          round,
          questions: roundQuestions,
          revisionContent: revision.content,
          revisionSummary: revision.summary
        });

        currentDraft = revision.content;

        // 更新任务进度
        await query(
          `UPDATE tasks SET
            progress = $1,
            current_stage = $2,
            updated_at = NOW()
          WHERE id = $3`,
          [50 + round * 20, `blue_team_round_${round}_completed`, input.taskId]
        );
      }

      // 2轮结束后，设置为等待人工确认
      await query(
        `UPDATE tasks SET
          status = 'awaiting_approval',
          progress = 90,
          current_stage = 'awaiting_human_approval',
          updated_at = NOW()
        WHERE id = $1`,
        [input.taskId]
      );

      this.log('info', 'BlueTeam review completed, awaiting human approval');

      return this.createSuccessResult({
        rounds,
        finalDraft: currentDraft,
        status: 'awaiting_approval'
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'BlueTeam review failed', { error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  private async generateExpertQuestions(
    expert: Expert,
    draft: string,
    topic: string,
    round: number
  ): Promise<BlueTeamQuestion[]> {
    const angleNames: Record<string, string> = {
      challenger: '挑战',
      expander: '扩展',
      synthesizer: '归纳'
    };

    const prompt = `${expert.system_prompt}

## 专家简介
${expert.bio || expert.title}
擅长领域：${expert.domains.join('、')}

## 当前评审
- 评审轮次：第${round}轮
- 你的角度：${angleNames[expert.angle]}
- 研究主题：${topic}

## 待评审文稿
${draft.substring(0, 8000)}

## 输出要求
请输出JSON数组，每个问题包含：
{
  "question": "具体的批判性问题",
  "severity": "high/medium/low",
  "suggestion": "具体的修改建议"
}

注意：
1. 第1轮关注结构性问题，第2轮关注细节完善
2. 提出3个不同层面的问题
3. 问题要具体，能直接指导修改
4. 使用你所在领域的专业术语和视角`;

    try {
      const result = await generate(prompt, 'blue_team', {
        temperature: 0.8,
        maxTokens: 4000
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(questions)) {
          return questions.slice(0, 3).map((q, idx) => ({
            id: `q_${round}_${expert.id}_${idx}`,
            expertId: expert.id,
            expertName: expert.name,
            angle: expert.angle,
            question: q.question,
            severity: q.severity || 'medium',
            suggestion: q.suggestion || ''
          }));
        }
      }
    } catch (error) {
      this.log('warn', `Failed to generate questions for ${expert.name}`, { error });
    }

    // Fallback
    return [{
      id: `q_${round}_${expert.id}_0`,
      expertId: expert.id,
      expertName: expert.name,
      angle: expert.angle,
      question: `${expert.name}建议从${angleNames[expert.angle]}角度进一步完善`,
      severity: 'medium',
      suggestion: '请参考专家意见进行修改'
    }];
  }

  private async reviseDraft(
    draft: string,
    questions: BlueTeamQuestion[],
    round: number,
    topic: string
  ): Promise<{ content: string; summary: string }> {
    // 按角度分组问题
    const byAngle: Record<string, BlueTeamQuestion[]> = {
      challenger: [],
      expander: [],
      synthesizer: []
    };

    questions.forEach(q => {
      if (byAngle[q.angle]) {
        byAngle[q.angle].push(q);
      }
    });

    const prompt = `你是一位资深研究报告修订专家。请基于Blue Team的反馈修改报告。

## 研究主题
${topic}

## 当前版本：第${round}轮修订

## 挑战类问题（必须解决逻辑和证据问题）
${byAngle.challenger.map((q, i) => `
${i + 1}. [${q.severity}] ${q.expertName}: ${q.question}
建议：${q.suggestion}
`).join('\n')}

## 扩展类问题（补充视角和信息）
${byAngle.expander.map((q, i) => `
${i + 1}. [${q.severity}] ${q.expertName}: ${q.question}
建议：${q.suggestion}
`).join('\n')}

## 归纳类问题（优化结构和表达）
${byAngle.synthesizer.map((q, i) => `
${i + 1}. [${q.severity}] ${q.expertName}: ${q.question}
建议：${q.suggestion}
`).join('\n')}

## 当前报告
${draft.substring(0, 6000)}...

## 修订要求
1. 优先解决high severity问题
2. 逐条回应，不要遗漏
3. 保持报告整体风格一致
4. 补充必要的数据支撑

请输出修订后的完整报告，并在开头附上修订说明（简要说明解决了哪些问题）。`;

    try {
      const result = await generate(prompt, 'writing', {
        temperature: 0.7,
        maxTokens: 8000
      });

      const content = result.content;
      const summaryMatch = content.match(/修订说明[:：]?\s*([\s\S]{0,500}?)\n\n/);
      const summary = summaryMatch
        ? summaryMatch[1].trim()
        : `第${round}轮完成：处理了${questions.length}条专家意见`;

      return { content, summary };
    } catch (error) {
      this.log('error', 'Failed to revise draft', { error });
      return { content: draft, summary: '修订失败，保持原稿' };
    }
  }

  private async saveQuestions(
    taskId: string,
    round: number,
    questions: BlueTeamQuestion[]
  ): Promise<void> {
    for (const q of questions) {
      await query(
        `INSERT INTO blue_team_reviews (task_id, round, expert_role, questions)
         VALUES ($1, $2, $3, $4)`,
        [taskId, round, q.angle, JSON.stringify(q)]
      );
    }
  }

  private async saveDraftVersion(
    taskId: string,
    version: number,
    content: string
  ): Promise<void> {
    const { v4: uuidv4 } = await import('uuid');
    await query(
      `INSERT INTO draft_versions (id, task_id, version, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), taskId, version, content]
    );
  }
}
