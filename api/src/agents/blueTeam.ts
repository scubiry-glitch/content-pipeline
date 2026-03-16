// BlueTeam Agent - 蓝军评审专家 v2.0
// 负责: 4位专家评审(事实核查员/逻辑检察官/行业专家/读者代表) × 2轮 深度评审
// 支持: 专家库动态匹配

import { BaseAgent, AgentContext, AgentResult } from './base.js';
import { query } from '../db/connection.js';
import { generate } from '../services/llm.js';
import { expertLibrary, Expert, ExpertRole, ROLE_NAMES, ROLE_DESCRIPTIONS } from '../services/expertLibrary.js';

export interface BlueTeamConfig {
  expertCount: number;        // 4 (固定四位专家)
  questionsPerExpert: number; // 2-3
  rounds: number;             // 2
}

export interface BlueTeamExpert {
  id: string;
  name: string;
  title: string;
  role: ExpertRole;
  systemPrompt: string;
}

export interface BlueTeamQuestion {
  id: string;
  expertId: string;
  expertName: string;
  expertTitle?: string;
  role: ExpertRole;
  roleName: string;
  location?: string;
  question: string;
  issue?: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  checkItems?: string[];
  logicGap?: string;
  expertiseArea?: string;
  readabilityIssue?: string;
  rationale?: string;
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
    expertCount: 4,
    questionsPerExpert: 2,
    rounds: 2
  };

  constructor() {
    super('BlueTeamAgent', {} as any);
  }

  async execute(input: BlueTeamInput, context?: AgentContext): Promise<AgentResult<BlueTeamOutput>> {
    this.clearLogs();
    this.log('info', 'Starting BlueTeam review v2.0', { taskId: input.taskId, config: this.config });

    try {
      // 根据主题匹配四位专家
      this.experts = await expertLibrary.matchFourExperts(input.topic);
      this.log('info', '4 Experts matched for topic', {
        topic: input.topic,
        experts: this.experts.map(e => ({ name: e.name, role: e.role, roleName: ROLE_NAMES[e.role], domains: e.domains }))
      });

      // 确保四位专家都匹配到
      if (this.experts.length < 4) {
        throw new Error(`专家匹配不完整，只匹配到 ${this.experts.length} 位专家`);
      }

      // 更新任务状态为 reviewing，并记录专家信息
      await query(
        `UPDATE tasks SET status = 'reviewing', current_stage = 'blue_team_round_1', updated_at = NOW() WHERE id = $1`,
        [input.taskId]
      );

      // 保存专家信息到任务
      await query(
        `UPDATE tasks SET research_data = COALESCE(research_data, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ blue_team_experts: this.experts.map(e => ({ id: e.id, name: e.name, title: e.title, role: e.role, roleName: ROLE_NAMES[e.role] })) }), input.taskId]
      );

      let currentDraft = input.draftContent;
      const rounds: BlueTeamRound[] = [];

      // 执行2轮评审
      for (let round = 1; round <= this.config.rounds; round++) {
        this.log('info', `BlueTeam Round ${round} started`);

        // 4位专家并行评审
        const roundQuestions: BlueTeamQuestion[] = [];

        for (const expert of this.experts) {
          this.log('info', `Expert ${expert.name} (${ROLE_NAMES[expert.role]}) reviewing`);

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
    const roleName = ROLE_NAMES[expert.role];
    const roleDesc = ROLE_DESCRIPTIONS[expert.role];

    const prompt = `${expert.system_prompt}

## 当前评审任务
- 评审轮次：第${round}轮
- 你的角色：${roleName}
- 角色职责：${roleDesc}
- 研究主题：${topic}

## 待评审文稿
${draft.substring(0, 8000)}

## 评审要求
1. 第1轮关注结构性问题（框架、逻辑、关键遗漏）
2. 第2轮关注细节完善（数据准确性、表达优化）
3. 问题要具体、专业，能直接指导修改
4. 必须按角色的专业视角进行评审
5. 识别问题时同时指出亮点（praise）

## 严重等级定义
- 🔴 high - 严重问题（事实错误、逻辑断裂、专业错误），必须修改
- 🟡 medium - 建议问题（可优化、可补充），推荐修改
- 🟢 praise - 表扬亮点（好的洞察、精彩表达、数据扎实），保持发扬

## 输出格式
请输出JSON数组，每个问题包含：
{
  "location": "问题所在位置（如：P3第二段）",
  "issue": "具体问题描述，要求详细、专业",
  "severity": "high/medium/praise",
  "suggestion": "具体的、可执行的修改建议",
  "check_items": ["数据来源", "统计时间"],
  "rationale": "为什么这个问题重要/这个亮点值得表扬"
}

请输出2-3个问题（包含 praise），每个问题必须符合你的角色定位。`;

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
            expertTitle: expert.title,
            role: expert.role,
            roleName: ROLE_NAMES[expert.role],
            question: q.issue || q.question,
            severity: q.severity || 'medium',
            suggestion: q.suggestion || '',
            checkItems: q.check_items || q.checkItems || [],
            logicGap: q.logic_gap || q.logicGap,
            expertiseArea: q.expertise_area || q.expertiseArea,
            readabilityIssue: q.readability_issue || q.readabilityIssue,
            rationale: q.rationale || ''
          }));
        }
      }
    } catch (error) {
      this.log('warn', `Failed to generate questions for ${expert.name}`, { error });
    }

    // Fallback - 基于角色的默认反馈
    const roleFallbacks: Record<ExpertRole, { question: string; suggestion: string }> = {
      fact_checker: {
        question: '请核查关键数据的来源和时效性',
        suggestion: '补充数据来源标注，确认统计口径一致，更新过期数据'
      },
      logic_checker: {
        question: '请检查论证逻辑的严密性',
        suggestion: '梳理论证链条，补充隐含假设说明，强化因果推理依据'
      },
      domain_expert: {
        question: '请评估专业分析的深度',
        suggestion: '补充行业洞察，引用专业理论，深化趋势判断'
      },
      reader_rep: {
        question: '请评估报告的可读性',
        suggestion: '优化段落结构，简化专业术语，提升行文流畅度'
      }
    };

    const fallback = roleFallbacks[expert.role];
    return [{
      id: `q_${round}_${expert.id}_0`,
      expertId: expert.id,
      expertName: expert.name,
      expertTitle: expert.title,
      role: expert.role,
      roleName: ROLE_NAMES[expert.role],
      question: `${expert.name}（${ROLE_NAMES[expert.role]}）：${fallback.question}`,
      severity: 'medium',
      suggestion: fallback.suggestion,
      checkItems: [],
      rationale: `从${ROLE_NAMES[expert.role]}角度进行评审`
    }];
  }

  private async reviseDraft(
    draft: string,
    questions: BlueTeamQuestion[],
    round: number,
    topic: string
  ): Promise<{ content: string; summary: string }> {
    // 按角色分组问题
    const byRole: Record<ExpertRole, BlueTeamQuestion[]> = {
      fact_checker: [],
      logic_checker: [],
      domain_expert: [],
      reader_rep: []
    };

    questions.forEach(q => {
      if (byRole[q.role]) {
        byRole[q.role].push(q);
      }
    });

    // 统计各类型问题数量
    const highCount = questions.filter(q => q.severity === 'high').length;
    const mediumCount = questions.filter(q => q.severity === 'medium').length;
    const praiseCount = questions.filter(q => q.severity === 'praise').length;

    const prompt = `你是一位资深研究报告修订专家。请基于Blue Team四位专家评审的反馈修改报告。

## 研究主题
${topic}

## 当前版本：第${round}轮修订
## 问题统计：严重${highCount}个 / 建议${mediumCount}个 / 亮点${praiseCount}个

## 事实核查员意见（准确性问题 - 必须解决）
${byRole.fact_checker.map((q, i) => `
${i + 1}. [${q.severity}] ${q.location || ''} ${q.question}
建议：${q.suggestion}
`).join('\n') || '无'}

## 逻辑检察官意见（严密性问题 - 必须解决）
${byRole.logic_checker.map((q, i) => `
${i + 1}. [${q.severity}] ${q.location || ''} ${q.question}
建议：${q.suggestion}
`).join('\n') || '无'}

## 行业专家意见（专业度问题 - 推荐解决）
${byRole.domain_expert.map((q, i) => `
${i + 1}. [${q.severity}] ${q.location || ''} ${q.question}
建议：${q.suggestion}
`).join('\n') || '无'}

## 读者代表意见（可读性问题 - 推荐解决）
${byRole.reader_rep.map((q, i) => `
${i + 1}. [${q.severity}] ${q.location || ''} ${q.question}
建议：${q.suggestion}
`).join('\n') || '无'}

## 当前报告
${draft.substring(0, 6000)}...

## 修订要求
1. 🔴 优先解决 high severity 问题（事实错误、逻辑断裂）
2. 🟡 其次处理 medium severity 建议
3. 🟢 保持并强化 praise 亮点
4. 逐条回应，不要遗漏
5. 保持报告整体风格一致
6. 补充必要的数据支撑

请输出修订后的完整报告，并在开头附上修订说明（分类说明解决了哪些问题）。`;

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
        [taskId, round, q.role, JSON.stringify(q)]
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
