// BlueTeam Agent - 蓝军评审专家 v3.0
// 支持: 串行/并行评审模式、可配置专家数量、修订模式选择

import { BaseAgent, AgentContext, AgentResult } from './base.js';
import { query } from '../db/connection.js';
import { generate } from '../services/llm.js';
import { expertLibrary, Expert, ExpertRole, ROLE_NAMES, ROLE_DESCRIPTIONS } from '../services/expertLibrary.js';
import { getExpertEngine } from '../modules/expert-library/singleton.js';
import { buildSystemPrompt } from '../modules/expert-library/promptBuilder.js';
import { getBlueTeamContext } from './contentLibraryContext.js';

export interface BlueTeamConfig {
  mode: 'sequential' | 'parallel';     // 串行或并行模式
  aiExpertCount: number;               // AI专家数量 (1-4)
  humanExpertCount: number;            // 真人专家数量 (0-3)
  rounds: number;                      // 评审轮数 (1-3)
  revisionMode: 'per_round' | 'final'; // 修订模式：每轮后修订 或 最后统一修订
  selectedExpertIds?: string[];        // 指定专家ID列表 (可选)
}

export interface BlueTeamExpert {
  id: string;
  name: string;
  title: string;
  role: ExpertRole;
  systemPrompt: string;
  type: 'ai' | 'human';
}

export interface BlueTeamQuestion {
  id: string;
  expertId: string;
  expertName: string;
  expertTitle?: string;
  role: ExpertRole;
  roleName: string;
  expertType: 'ai' | 'human';
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
  expertReviews: {
    expertId: string;
    expertName: string;
    expertType: 'ai' | 'human';
    status: 'pending' | 'completed' | 'skipped';
    questions: BlueTeamQuestion[];
  }[];
}

export interface BlueTeamInput {
  taskId: string;
  draftContent: string;
  topic: string;
  outline?: any[];
  config?: Partial<BlueTeamConfig>;
}

export interface BlueTeamOutput {
  rounds: BlueTeamRound[];
  finalDraft: string;
  status: 'completed' | 'awaiting_approval' | 'awaiting_human_review';
  config: BlueTeamConfig;
}

// 默认配置
const DEFAULT_CONFIG: BlueTeamConfig = {
  mode: 'parallel',
  aiExpertCount: 4,
  humanExpertCount: 0,
  rounds: 2,
  revisionMode: 'per_round'
};

// AI专家角色模板（使用 expertLibrary 定义的标准角色）
const AI_EXPERT_ROLES: ExpertRole[] = ['fact_checker', 'logic_checker', 'domain_expert', 'reader_rep'];

export class BlueTeamAgent extends BaseAgent {
  private experts: BlueTeamExpert[] = [];
  private config: BlueTeamConfig = DEFAULT_CONFIG;

  constructor() {
    super('BlueTeamAgent', {} as any);
  }

  async execute(input: BlueTeamInput, context?: AgentContext): Promise<AgentResult<BlueTeamOutput>> {
    this.clearLogs();
    
    // 合并配置
    this.config = { ...DEFAULT_CONFIG, ...input.config };
    this.log('info', 'Starting BlueTeam review v3.0', { 
      taskId: input.taskId, 
      config: this.config 
    });

    try {
      // 配置专家
      this.experts = await this.configureExperts(input.topic, input.config?.selectedExpertIds);
      this.log('info', 'Experts configured', {
        mode: this.config.mode,
        expertCount: this.experts.length,
        experts: this.experts.map(e => ({ name: e.name, type: e.type, role: e.role }))
      });

      // 更新任务状态
      await query(
        `UPDATE tasks SET status = 'reviewing', current_stage = 'blue_team_review', updated_at = NOW() WHERE id = $1`,
        [input.taskId]
      );

      // 保存配置到任务
      await query(
        `UPDATE tasks SET research_data = COALESCE(research_data, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ 
          blue_team_config: this.config,
          blue_team_experts: this.experts.map(e => ({ id: e.id, name: e.name, type: e.type, role: e.role }))
        }), input.taskId]
      );

      let currentDraft = input.draftContent;
      const rounds: BlueTeamRound[] = [];

      // 执行评审轮次
      for (let round = 1; round <= this.config.rounds; round++) {
        this.log('info', `BlueTeam Round ${round}/${this.config.rounds} started`, { mode: this.config.mode });

        const roundResult = await this.executeRound(input.taskId, currentDraft, input.topic, round);
        rounds.push(roundResult);

        // 根据修订模式处理
        if (this.config.revisionMode === 'per_round') {
          // 每轮后修订
          if (roundResult.questions.length > 0) {
            this.log('info', `Revising draft after round ${round}`);
            const revision = await this.reviseDraft(currentDraft, roundResult.questions, round, input.topic);
            currentDraft = revision.content;
            roundResult.revisionContent = revision.content;
            roundResult.revisionSummary = revision.summary;
            await this.saveDraftVersion(input.taskId, round, currentDraft);
          }
        }

        // 更新进度
        const progress = 50 + Math.round((round / this.config.rounds) * 30);
        await query(
          `UPDATE tasks SET progress = $1, current_stage = $2, updated_at = NOW() WHERE id = $3`,
          [progress, `blue_team_round_${round}`, input.taskId]
        );
      }

      // 最后统一修订（如果选择此模式）
      if (this.config.revisionMode === 'final') {
        const allQuestions = rounds.flatMap(r => r.questions);
        if (allQuestions.length > 0) {
          this.log('info', 'Final revision after all rounds');
          const revision = await this.reviseDraft(currentDraft, allQuestions, this.config.rounds, input.topic);
          currentDraft = revision.content;
          // 更新最后一轮的修订结果
          rounds[rounds.length - 1].revisionContent = revision.content;
          rounds[rounds.length - 1].revisionSummary = revision.summary;
          await this.saveDraftVersion(input.taskId, this.config.rounds + 1, currentDraft);
        }
      }

      // 检查是否有待处理的真人专家评审
      const hasPendingHumanReview = rounds.some(r => 
        r.expertReviews.some(er => er.expertType === 'human' && er.status === 'pending')
      );

      const finalStatus = hasPendingHumanReview ? 'awaiting_human_review' : 'awaiting_approval';

      await query(
        `UPDATE tasks SET
          status = $1,
          progress = 90,
          current_stage = $2,
          updated_at = NOW()
        WHERE id = $3`,
        [finalStatus, finalStatus === 'awaiting_human_review' ? 'awaiting_human_experts' : 'awaiting_human_approval', input.taskId]
      );

      this.log('info', 'BlueTeam review completed', { status: finalStatus });

      return this.createSuccessResult({
        rounds,
        finalDraft: currentDraft,
        status: finalStatus,
        config: this.config
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'BlueTeam review failed', { error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  // 配置专家
  private async configureExperts(topic: string, selectedIds?: string[]): Promise<BlueTeamExpert[]> {
    const experts: BlueTeamExpert[] = [];

    // 1. 配置 AI 专家
    const aiRoles = AI_EXPERT_ROLES.slice(0, this.config.aiExpertCount);
    for (let i = 0; i < aiRoles.length; i++) {
      const role = aiRoles[i];
      experts.push({
        id: `ai_${role}`,
        name: this.getAIRoleName(role),
        title: ROLE_NAMES[role],
        role: role,
        systemPrompt: this.getAISystemPrompt(role),
        type: 'ai'
      });
    }

    // 2. 配置真人专家
    if (this.config.humanExpertCount > 0) {
      let humanExperts: Expert[] = [];
      
      if (selectedIds && selectedIds.length > 0) {
        // 使用指定的专家
        const result = await query(
          `SELECT * FROM experts WHERE id = ANY($1) AND is_active = true`,
          [selectedIds]
        );
        humanExperts = result.rows.slice(0, this.config.humanExpertCount);
      } else {
        // 从专家库匹配
        const allExperts = await expertLibrary.listExperts();
        // 根据主题相关度排序（简化处理）
        humanExperts = allExperts
          .slice(0, this.config.humanExpertCount);
      }

      for (const he of humanExperts) {
        // CDT 增强：若该专家有深度 profile，使用 buildSystemPrompt 替代 DB 中的 system_prompt
        let systemPrompt = he.system_prompt || '';
        try {
          const engine = getExpertEngine();
          if (engine) {
            const cdtProfile = await engine.loadExpert(he.id);
            if (cdtProfile) {
              systemPrompt = buildSystemPrompt(cdtProfile, { taskType: 'evaluation' });
            }
          }
        } catch { /* CDT not available, use DB system_prompt */ }

        experts.push({
          id: he.id,
          name: he.name,
          title: he.title || '领域专家',
          role: (he.role as ExpertRole) || 'domain_expert',
          systemPrompt,
          type: 'human'
        });
      }
    }

    return experts;
  }

  // 执行一轮评审
  private async executeRound(
    taskId: string,
    draft: string,
    topic: string,
    round: number
  ): Promise<BlueTeamRound> {
    const roundQuestions: BlueTeamQuestion[] = [];
    const expertReviews: BlueTeamRound['expertReviews'] = [];

    if (this.config.mode === 'parallel') {
      // 并行模式：所有专家同时评审
      for (const expert of this.experts) {
        const result = await this.reviewByExpert(expert, draft, topic, round);
        roundQuestions.push(...result.questions);
        expertReviews.push({
          expertId: expert.id,
          expertName: expert.name,
          expertType: expert.type,
          status: result.status,
          questions: result.questions
        });
      }
    } else {
      // 串行模式：专家依次评审
      for (const expert of this.experts) {
        this.log('info', `Sequential review: ${expert.name} (${expert.type})`);
        
        const result = await this.reviewByExpert(expert, draft, topic, round);
        roundQuestions.push(...result.questions);
        expertReviews.push({
          expertId: expert.id,
          expertName: expert.name,
          expertType: expert.type,
          status: result.status,
          questions: result.questions
        });

        // 串行模式下，如果是AI专家且是每轮修订模式，可以实时看到修订
        if (expert.type === 'ai' && this.config.revisionMode === 'per_round' && result.questions.length > 0) {
          this.log('info', `Intermediate revision after ${expert.name}`);
          const revision = await this.reviseDraft(draft, result.questions, round, topic, expert.name);
          // 更新当前稿件供下一位专家评审
          draft = revision.content;
        }
      }
    }

    // 保存所有问题到数据库
    await this.saveQuestions(taskId, round, roundQuestions);

    return {
      round,
      questions: roundQuestions,
      expertReviews
    };
  }

  // 单个专家评审
  private async reviewByExpert(
    expert: BlueTeamExpert,
    draft: string,
    topic: string,
    round: number
  ): Promise<{ questions: BlueTeamQuestion[]; status: 'completed' | 'pending' | 'skipped' }> {
    
    // 真人专家：创建待评审任务
    if (expert.type === 'human') {
      await this.createHumanReviewTask(expert, draft, topic, round);
      return {
        questions: [],
        status: 'pending'
      };
    }

    // AI专家：直接生成评审意见
    const questions = await this.generateExpertQuestions(expert, draft, topic, round);
    return {
      questions,
      status: 'completed'
    };
  }

  // 创建真人专家评审任务
  private async createHumanReviewTask(
    expert: BlueTeamExpert,
    draft: string,
    topic: string,
    round: number
  ): Promise<void> {
    const { v4: uuidv4 } = await import('uuid');
    
    await query(
      `INSERT INTO expert_review_tasks (
        id, expert_id, task_id, draft_content, topic, round, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      ON CONFLICT (expert_id, task_id, round) DO NOTHING`,
      [uuidv4(), expert.id, topic, draft.substring(0, 5000), topic, round]
    );

    this.log('info', `Created human review task for ${expert.name}`);
  }

  // 生成AI专家评审问题
  private async generateExpertQuestions(
    expert: BlueTeamExpert,
    draft: string,
    topic: string,
    round: number
  ): Promise<BlueTeamQuestion[]> {
    const roleName = ROLE_NAMES[expert.role];
    const roleDesc = ROLE_DESCRIPTIONS[expert.role];

    // v7.1: 注入 Content Library ⑧⑬⑭ 产出物 (审核重点)
    const clContext = await getBlueTeamContext(topic).catch(() => '');

    const prompt = `${expert.systemPrompt}
${clContext}
## 当前评审任务
- 评审轮次：第${round}轮
- 你的角色：${roleName}
- 角色职责：${roleDesc}
- 研究主题：${topic}
- 专家类型：AI专家

## 待评审文稿
${draft.substring(0, 8000)}

## 评审要求
1. 第1轮关注结构性问题（框架、逻辑、关键遗漏）
2. 第2轮关注细节完善（数据准确性、表达优化）
3. 第3轮关注整体优化（可读性、专业度提升）
4. 问题要具体、专业，能直接指导修改
5. 必须按角色的专业视角进行评审
6. 识别问题时同时指出亮点（praise）

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
            expertType: 'ai',
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

    // Fallback
    return [{
      id: `q_${round}_${expert.id}_0`,
      expertId: expert.id,
      expertName: expert.name,
      expertTitle: expert.title,
      role: expert.role,
      roleName: ROLE_NAMES[expert.role],
      expertType: 'ai',
      question: `${expert.name}：请检查${roleName}相关的问题`,
      severity: 'medium',
      suggestion: '建议根据角色定位进行优化',
      checkItems: [],
      rationale: `从${roleName}角度进行评审`
    }];
  }

  // 修订稿件
  private async reviseDraft(
    draft: string,
    questions: BlueTeamQuestion[],
    round: number,
    topic: string,
    afterExpert?: string
  ): Promise<{ content: string; summary: string }> {
    // 按专家类型和角色分组
    const aiQuestions = questions.filter(q => q.expertType === 'ai');
    const humanQuestions = questions.filter(q => q.expertType === 'human');

    const byRole: Record<string, BlueTeamQuestion[]> = {
      challenger: [],
      expander: [],
      synthesizer: [],
      fact_checker: [],
      domain_expert: [],
      reader_rep: []
    };

    questions.forEach(q => {
      const key = q.role || 'domain_expert';
      if (!byRole[key]) byRole[key] = [];
      byRole[key].push(q);
    });

    const highCount = questions.filter(q => q.severity === 'high').length;
    const mediumCount = questions.filter(q => q.severity === 'medium').length;
    const praiseCount = questions.filter(q => q.severity === 'praise').length;

    const afterExpertText = afterExpert ? `（在 ${afterExpert} 评审后）` : '';

    const prompt = `你是一位资深研究报告修订专家。请基于Blue Team专家评审的反馈修改报告。

## 研究主题
${topic}

## 当前版本：第${round}轮修订${afterExpertText}
## 问题统计：严重${highCount}个 / 建议${mediumCount}个 / 亮点${praiseCount}个
## AI专家意见：${aiQuestions.length}条 / 真人专家意见：${humanQuestions.length}条

${Object.entries(byRole)
  .filter(([_, qs]) => qs.length > 0)
  .map(([role, qs]) => `
## ${ROLE_NAMES[role as ExpertRole] || role}意见
${qs.map((q, i) => `
${i + 1}. [${q.severity}] ${q.location || ''} ${q.question}
建议：${q.suggestion}
`).join('\n')}
`).join('\n')}

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

  // 保存问题到数据库
  private async saveQuestions(
    taskId: string,
    round: number,
    questions: BlueTeamQuestion[]
  ): Promise<void> {
    for (const q of questions) {
      await query(
        `INSERT INTO blue_team_reviews (task_id, round, expert_role, expert_type, questions, is_historical)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (task_id, round, expert_role) DO UPDATE SET
         questions = EXCLUDED.questions,
         expert_type = EXCLUDED.expert_type,
         is_historical = false`,
        [taskId, round, q.role, q.expertType, JSON.stringify(q)]
      );
    }
  }

  // 保存稿件版本
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

  // 获取AI角色名称
  private getAIRoleName(role: ExpertRole): string {
    const names: Record<string, string> = {
      challenger: '批判者',
      expander: '拓展者',
      synthesizer: '提炼者',
      fact_checker: '事实核查员'
    };
    return names[role] || ROLE_NAMES[role];
  }

  // 获取AI系统提示词
  private getAISystemPrompt(role: ExpertRole): string {
    const prompts: Record<string, string> = {
      challenger: `你是一位严苛的批判者(Challenger)，负责找出文稿中的逻辑漏洞和问题。
你的关注点是：逻辑漏洞、论证跳跃、数据可靠性、隐含假设。
你要以批判的眼光审视每一个细节，找出可能的错误和不足。`,
      expander: `你是一位拓展者(Expander)，负责提供补充视角和扩展内容。
你的关注点是：关联因素、国际对比、交叉学科、长尾效应。
你要帮助作者看到更广阔的视野，补充可能被忽略的内容。`,
      synthesizer: `你是一位提炼者(Synthesizer)，负责优化表达和结构。
你的关注点是：核心论点、结构优化、金句提炼、消除冗余。
你要帮助提升文稿的整体质量和可读性。`,
      fact_checker: `你是一位事实核查员(Fact Checker)，负责验证数据的准确性。
你的关注点是：数据来源、统计口径、时效性、可信度。
你要确保文稿中的每一个数据都是准确可靠的。`
    };
    return prompts[role] || `你是一位专业的文稿评审专家。`;
  }
}
