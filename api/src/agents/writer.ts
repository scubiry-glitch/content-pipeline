// Writer Agent - 写作专家 + Blue Team审核
// 负责: 初稿生成 → Blue Team批判 → 多轮修改 → 定稿

import { BaseAgent, AgentContext, AgentResult } from './base';
import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { Document, BlueTeamQuestion, ExpertProfile } from '../../shared/src/types';

export interface WriterInput {
  topicId: string;
  topic: string;
  outline: any[];
  researchReport: {
    dataPackage: any[];
    analysis: any;
    insights: any[];
  };
  expertIds?: string[];
  blueTeamConfig?: {
    expertCount: number;
    questionsPerExpert: number;
    rounds: number;
  };
}

export interface WriterOutput {
  documentId: string;
  content: string;
  blueTeamHistory: BlueTeamRound[];
  finalVersion: number;
}

export interface BlueTeamRound {
  round: number;
  questions: BlueTeamQuestion[];
  revisionSummary: string;
}

export class WriterAgent extends BaseAgent {
  private expertCache: Map<string, ExpertProfile> = new Map();

  constructor(llmRouter: LLMRouter) {
    super('WriterAgent', llmRouter);
  }

  async execute(input: WriterInput, context?: AgentContext): Promise<AgentResult<WriterOutput>> {
    this.clearLogs();
    this.log('info', 'Starting writing phase with Blue Team review', { topicId: input.topicId });

    const taskId = await this.saveTask('writing', 'running', input);

    try {
      // Step 1: Generate initial draft
      this.log('info', 'Generating initial draft');
      let currentDraft = await this.generateInitialDraft(input);
      let version = 1;

      // Step 2: Load experts for Blue Team
      this.log('info', 'Loading Blue Team experts');
      const experts = await this.loadExperts(input.expertIds);

      const blueTeamConfig = input.blueTeamConfig || { expertCount: 3, questionsPerExpert: 5, rounds: 3 };
      const blueTeamHistory: BlueTeamRound[] = [];

      // Step 3: Blue Team review rounds
      for (let round = 1; round <= blueTeamConfig.rounds; round++) {
        this.log('info', `Starting Blue Team Round ${round}`);

        // Generate questions from experts
        const questions = await this.generateBlueTeamQuestions(
          currentDraft,
          experts,
          blueTeamConfig.questionsPerExpert,
          round
        );

        // Check if all questions are resolved
        const unresolvedHigh = questions.filter(q => q.severity === 'high' && !q.suggestedImprovement).length;

        if (unresolvedHigh === 0 && round > 1) {
          this.log('info', `Blue Team satisfied at round ${round}`);
          blueTeamHistory.push({ round, questions, revisionSummary: 'No major issues, final polish' });
          break;
        }

        // Revise draft based on questions
        this.log('info', `Revising draft based on ${questions.length} questions`);
        const revisionSummary = await this.reviseDraft(currentDraft, questions, round);
        currentDraft = revisionSummary.revisedContent;
        version++;

        blueTeamHistory.push({ round, questions, revisionSummary: revisionSummary.summary });

        // Save questions to database
        await this.saveBlueTeamQuestions(input.topicId, questions, round);
      }

      // Step 4: Finalize document
      this.log('info', 'Finalizing document');
      const documentId = await this.saveDocument(input.topicId, currentDraft, version, blueTeamHistory);

      await this.updateTask(taskId, { status: 'completed', result: { documentId } });

      const output: WriterOutput = {
        documentId,
        content: currentDraft,
        blueTeamHistory,
        finalVersion: version,
      };

      this.log('info', 'Writing completed successfully', { documentId, version });
      return this.createSuccessResult(output);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'Writing failed', { error: errorMsg });
      await this.updateTask(taskId, { status: 'failed', error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  private async generateInitialDraft(input: WriterInput): Promise<string> {
    const prompt = `你是一位资深财经产业研究撰稿人。请基于以下信息撰写深度研究报告。

## 研究话题
${input.topic}

## 大纲结构
${JSON.stringify(input.outline, null, 2)}

## 研究数据
${input.researchReport.dataPackage.map((d, i) => `
[${i + 1}] ${d.source}: ${d.content.substring(0, 500)}...
`).join('\n')}

## 关键洞察
${input.researchReport.insights.map((insight, i) => `
${i + 1}. [${insight.type}] ${insight.content} (置信度: ${insight.confidence})
`).join('\n')}

## 写作要求
1. 采用"三层穿透"结构：宏观视野 → 中观解剖 → 微观行动
2. 每个观点必须有数据支撑，标注来源
3. 语言专业、客观、有洞察力
4. 总字数控制在5000-8000字
5. 包含以下部分：
   - 执行摘要
   - 宏观视野（政策、趋势）
   - 中观解剖（产业链、机制）
   - 微观行动（案例、建议）
   - 风险提示
   - 数据来源说明

请直接输出完整的报告正文。`;

    const result = await this.llmRouter.generate(prompt, 'writing', {
      temperature: 0.7,
      maxTokens: 8000,
    });

    return result.content;
  }

  private async loadExperts(expertIds?: string[]): Promise<ExpertProfile[]> {
    if (this.expertCache.size > 0) {
      return Array.from(this.expertCache.values());
    }

    let experts: ExpertProfile[] = [];

    if (expertIds && expertIds.length > 0) {
      const result = await query(
        `SELECT * FROM expert_profiles WHERE id = ANY($1)`,
        [expertIds]
      );
      experts = result.rows;
    } else {
      // Load default experts
      const result = await query(
        `SELECT * FROM expert_profiles ORDER BY authority_score DESC LIMIT 5`
      );
      experts = result.rows;
      console.log('[WriterAgent] Loaded experts from DB:', experts.length, experts.map((e: any) => ({ id: e?.id, name: e?.name })));
    }

    if (experts.length === 0) {
      // Create default experts if none exist
      console.log('[WriterAgent] Creating default experts...');
      experts = await this.createDefaultExperts();
      console.log('[WriterAgent] Created experts:', experts.map((e: any) => ({ id: e?.id, name: e?.name })));
    }

    // Validate experts have required fields
    for (const expert of experts) {
      if (!expert.id) {
        console.warn('[WriterAgent] Expert missing id:', expert);
        // Generate a fallback id
        expert.id = `expert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      this.expertCache.set(expert.id, expert);
    }

    return experts;
  }

  private async createDefaultExperts(): Promise<ExpertProfile[]> {
    const defaultExperts = [
      {
        name: '张其光',
        title: '住建部政策研究中心原主任',
        bio: '专注住房政策与REITs制度设计，政策实操派代表',
        authority_score: 0.95,
        credentials: ['住建部政策研究中心原主任', '中国REITs联盟专家'],
        domains: [{ domain: '住房政策', level: 'authority', years: 20 }],
        core_viewpoints: [
          { topic: '保租房REITs', stance: '政策支持是核心驱动力', evidence: ['政策文件分析'], confidence: 0.9 }
        ],
        communication_style: '政策解读型，善用数据和案例',
        question_patterns: ['政策依据是什么？', '数据支撑在哪里？'],
        favorite_frameworks: ['PEST分析', '政策生命周期'],
      },
      {
        name: '陆铭',
        title: '上海交通大学安泰经管学院教授',
        bio: '城市经济学家，专注区域发展与住房市场',
        authority_score: 0.93,
        credentials: ['上海交通大学教授', '中国发展研究院执行院长'],
        domains: [{ domain: '城市经济学', level: 'authority', years: 15 }],
        core_viewpoints: [
          { topic: '住房保障', stance: '市场机制与政府干预需平衡', evidence: ['国际比较研究'], confidence: 0.85 }
        ],
        communication_style: '学术严谨型，善用模型和比较研究',
        question_patterns: ['理论依据是什么？', '国际经验如何？'],
        favorite_frameworks: ['供需模型', '空间均衡模型'],
      },
      {
        name: '刘元春',
        title: '上海财经大学校长',
        bio: '宏观经济学家，专注金融风险与政策',
        authority_score: 0.92,
        credentials: ['上海财经大学校长', '原中国人民大学副校长'],
        domains: [{ domain: '宏观经济学', level: 'authority', years: 18 }],
        core_viewpoints: [
          { topic: '房地产金融', stance: '风险防控是底线', evidence: ['宏观经济数据'], confidence: 0.9 }
        ],
        communication_style: '宏观视野型，善用周期分析',
        question_patterns: ['风险点在哪里？', '对宏观经济的传导效应？'],
        favorite_frameworks: ['金融周期理论', '系统性风险模型'],
      },
      {
        name: '看空派',
        title: '市场 skeptics 代表',
        bio: '关注风险与负面因素，压力测试视角',
        authority_score: 0.75,
        credentials: ['独立分析师'],
        domains: [{ domain: '风险分析', level: 'practitioner', years: 10 }],
        core_viewpoints: [
          { topic: 'REITs投资', stance: '警惕估值泡沫和流动性风险', evidence: ['市场案例分析'], confidence: 0.7 }
        ],
        communication_style: '质疑型，关注例外和反例',
        question_patterns: ['最坏情况是什么？', '什么情况下会失败？'],
        favorite_frameworks: ['压力测试', '情景分析'],
      },
    ];

    const experts: ExpertProfile[] = [];
    for (const expert of defaultExperts) {
      const result = await query(
        `INSERT INTO expert_profiles (name, title, bio, authority_score, credentials, domains, core_viewpoints, communication_style, question_patterns, favorite_frameworks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          expert.name,
          expert.title,
          expert.bio,
          expert.authority_score,
          JSON.stringify(expert.credentials),
          JSON.stringify(expert.domains),
          JSON.stringify(expert.core_viewpoints),
          expert.communication_style,
          JSON.stringify(expert.question_patterns),
          JSON.stringify(expert.favorite_frameworks),
        ]
      );
      console.log('[WriterAgent] Insert result:', result.rows[0]);
      experts.push(result.rows[0]);
    }

    return experts;
  }

  private async generateBlueTeamQuestions(
    draft: string,
    experts: ExpertProfile[],
    questionsPerExpert: number,
    round: number
  ): Promise<BlueTeamQuestion[]> {
    const allQuestions: BlueTeamQuestion[] = [];

    for (const expert of experts.slice(0, 3)) {
      // Validate expert object
      if (!expert) {
        this.log('warn', 'Undefined expert in array');
        continue;
      }

      // Parse JSON fields if they are strings (for in-memory DB)
      const coreViewpoints = typeof expert.core_viewpoints === 'string'
        ? JSON.parse(expert.core_viewpoints)
        : (expert.core_viewpoints || []);
      const favoriteFrameworks = typeof expert.favorite_frameworks === 'string'
        ? JSON.parse(expert.favorite_frameworks)
        : (expert.favorite_frameworks || []);

      const prompt = `你是一位${expert.title || '专家'}，${expert.bio || ''}。

你的核心观点：${coreViewpoints.map((v: any) => v.topic + ': ' + v.stance).join('; ')}

你常用的质疑框架：${favoriteFrameworks.join(', ')}

你的提问风格：${expert.communication_style || '专业严谨'}

## 当前是Blue Team第${round}轮审核

请仔细阅读以下研究报告，并提出${questionsPerExpert}个批判性问题。

## 报告内容
${draft.substring(0, 6000)}...

## 问题类别要求
- logic: 逻辑漏洞、论证跳跃
- evidence: 数据不足、来源存疑
- assumption: 隐含假设未验证
- impact: 影响评估偏差

## 输出格式
JSON数组，每个问题包含：
{
  "expertId": "${expert.id || 'unknown'}",
  "expertName": "${expert.name || '专家'}",
  "question": "具体问题",
  "category": "logic/evidence/assumption/impact",
  "severity": "high/medium/low",
  "suggestedImprovement": "建议如何修改（如知道）"
}

请基于你的专业视角，提出有深度的问题。`;

      try {
        const result = await this.llmRouter.generate(prompt, 'blue_team_review', {
          temperature: 0.8,
          maxTokens: 3000,
        });

        const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                         result.content.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const questions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          if (Array.isArray(questions)) {
            allQuestions.push(...questions.slice(0, questionsPerExpert));
          }
        }
      } catch (error) {
        this.log('warn', `Failed to generate questions for ${expert.name}`, { error });
      }
    }

    return allQuestions;
  }

  private async reviseDraft(
    draft: string,
    questions: BlueTeamQuestion[],
    round: number
  ): Promise<{ revisedContent: string; summary: string }> {
    const highPriorityQuestions = questions.filter(q => q.severity === 'high');
    const mediumPriorityQuestions = questions.filter(q => q.severity === 'medium');

    const prompt = `你是一位资深研究报告修订专家。请基于Blue Team的反馈修改报告。

## 当前版本：第${round}轮修订

## 高优先级问题（必须解决）
${highPriorityQuestions.map((q, i) => `
${i + 1}. [${q.category}] ${q.expertName}: ${q.question}
${q.suggestedImprovement ? `建议：${q.suggestedImprovement}` : ''}
`).join('\n')}

## 中优先级问题（尽量解决）
${mediumPriorityQuestions.slice(0, 5).map((q, i) => `
${i + 1}. [${q.category}] ${q.expertName}: ${q.question}
`).join('\n')}

## 当前报告
${draft.substring(0, 5000)}...

## 修订要求
1. 逐条回应高优先级问题
2. 补充必要的数据支撑
3. 调整论证逻辑
4. 保持整体结构和风格

请输出修订后的完整报告，并在开头附上修订说明（200字以内）。`;

    const result = await this.llmRouter.generate(prompt, 'writing', {
      temperature: 0.7,
      maxTokens: 8000,
    });

    const content = result.content;
    const summaryMatch = content.match(/修订说明[:：]?\s*([\s\S]{0,300}?)\n\n/);
    const summary = summaryMatch ? summaryMatch[1].trim() : `完成${questions.length}条问题修订`;

    return {
      revisedContent: content,
      summary,
    };
  }

  private async saveBlueTeamQuestions(topicId: string, questions: BlueTeamQuestion[], round: number): Promise<void> {
    for (const q of questions) {
      await query(
        `INSERT INTO blue_team_questions (topic_id, expert_id, question, category, severity, suggested_improvement, round)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [topicId, q.expertId, q.question, q.category, q.severity, q.suggestedImprovement, round]
      );
    }
  }

  private async saveDocument(
    topicId: string,
    content: string,
    version: number,
    blueTeamHistory: BlueTeamRound[]
  ): Promise<string> {
    // Parse sections from content
    const sections = this.parseSections(content);

    const wordCount = content.length;
    const readingTime = Math.ceil(wordCount / 300); // 300 chars per minute

    const result = await query(
      `INSERT INTO documents (topic_id, title, sections, metadata, version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        topicId,
        this.extractTitle(content),
        JSON.stringify(sections),
        JSON.stringify({
          author: 'AI Research Agent',
          wordCount,
          readingTime,
          blueTeamRounds: blueTeamHistory.length,
          totalQuestions: blueTeamHistory.reduce((sum, r) => sum + r.questions.length, 0),
        }),
        version,
      ]
    );

    return result.rows[0].id;
  }

  private parseSections(content: string): any[] {
    // Simple section parsing based on headers
    const lines = content.split('\n');
    const sections: any[] = [];
    let currentSection: any = null;
    let sectionContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,2})\s+(.+)$/);
      if (headerMatch) {
        if (currentSection) {
          currentSection.content = sectionContent.join('\n');
          sections.push(currentSection);
        }
        currentSection = {
          id: `section-${sections.length + 1}`,
          title: headerMatch[2],
          level: headerMatch[1].length,
          order: sections.length + 1,
        };
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }

    if (currentSection) {
      currentSection.content = sectionContent.join('\n');
      sections.push(currentSection);
    }

    return sections.length > 0 ? sections : [{
      id: 'section-1',
      title: '正文',
      level: 1,
      content,
      order: 1,
    }];
  }

  private extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1] : 'Untitled Research Report';
  }
}
