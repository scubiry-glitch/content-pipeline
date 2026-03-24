// Planner Agent - 选题规划专家
// 负责: 话题选择 → 大纲生成 → 数据需求分析

import { BaseAgent, AgentContext, AgentResult } from './base';
import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { TopicPlan, OutlineSection, DataRequirement } from '../types/index.js';

export interface PlannerInput {
  topic: string;
  context?: string;
  targetAudience?: string;
  desiredDepth?: 'macro' | 'meso' | 'micro' | 'comprehensive';
  comments?: string[]; // 用户评论，用于指导大纲生成
  existingTaskId?: string; // 如果提供，则更新现有task而不是创建新task
}

export interface PlannerOutput {
  topicId: string;
  plan: TopicPlan;
  outline: OutlineSection[];
  dataRequirements: DataRequirement[];
  knowledgeInsights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
}

export interface KnowledgeInsight {
  source: string;
  type: 'historical' | 'trend' | 'gap';
  content: string;
  relevance: number;
}

export interface NovelAngle {
  angle: string;
  rationale: string;
  differentiation: string;
  potentialImpact: 'high' | 'medium' | 'low';
}

export class PlannerAgent extends BaseAgent {
  constructor(llmRouter: LLMRouter) {
    super('PlannerAgent', llmRouter);
  }

  async execute(input: PlannerInput, context?: AgentContext): Promise<AgentResult<PlannerOutput>> {
    this.clearLogs();
    this.log('info', 'Starting topic planning', { topic: input.topic });

    const taskId = await this.saveTask('planning', 'running', input);

    try {
      // Step 0: Analyze knowledge base for insights and novel angles (并行执行)
      this.log('info', 'Analyzing knowledge base for insights and novel angles');
      const [knowledgeInsights, novelAngles] = await Promise.all([
        this.generateKnowledgeInsights(input),
        this.generateNovelAnglesSimple(input) // 使用不依赖 insights 的版本
      ]);

      // Step 1: Generate comprehensive outline using 三层穿透结构 (enhanced with insights)
      this.log('info', 'Generating outline with three-layer structure');
      const outline = await this.generateOutline(input, knowledgeInsights, novelAngles);

      // Step 2: Analyze data requirements
      this.log('info', 'Analyzing data requirements');
      const dataRequirements = await this.analyzeDataRequirements(input, outline);

      // Step 3: Save to database
      this.log('info', 'Saving plan to database');
      const topicId = await this.savePlan(input, outline, dataRequirements, knowledgeInsights, novelAngles);

      // Step 4: Calculate estimated time
      const estimatedTime = this.calculateEstimatedTime(outline, dataRequirements);

      await this.updateTask(taskId, { status: 'completed', result: { topicId } });

      const output: PlannerOutput = {
        topicId,
        plan: {
          id: topicId,
          title: input.topic,
          outline,
          dataRequirements,
          priority: 5,
          estimatedTime,
          status: 'draft',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        outline,
        dataRequirements,
        knowledgeInsights,
        novelAngles,
      };

      this.log('info', 'Planning completed successfully', { topicId, insightsCount: knowledgeInsights.length, novelAnglesCount: novelAngles.length });
      return this.createSuccessResult(output);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'Planning failed', { error: errorMsg });
      await this.updateTask(taskId, { status: 'failed', error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  private buildOutlinePrompt(input: PlannerInput): string {
    const depthMap = {
      macro: '宏观视野层（政策、趋势、周期）',
      meso: '中观解剖层（行业、区域、机制）',
      micro: '微观行动层（项目、企业、操作）',
      comprehensive: '完整三层结构（宏观→中观→微观）',
    };

    return `你是一位资深产业研究专家，擅长构建系统性研究框架。

请为以下研究话题设计详细大纲，采用"三层穿透"结构：

## 话题
${input.topic}

## 背景信息
${input.context || '无特定背景'}

## 目标受众
${input.targetAudience || '产业研究人员和投资者'}

## 深度要求
${depthMap[input.desiredDepth || 'comprehensive']}

## 输出要求
请输出JSON格式，包含以下结构：
{
  "outline": [
    {
      "title": "章节标题",
      "level": 1,
      "content": "核心论述要点",
      "subsections": [
        {
          "title": "子章节",
          "level": 2,
          "content": "子章节要点"
        }
      ]
    }
  ]
}

要求：
1. 至少包含3个一级章节，每个章节有2-3个子章节
2. 宏观层关注：政策导向、经济周期、国际比较
3. 中观层关注：产业链分析、区域差异、商业模式
4. 微观层关注：标杆案例、数据验证、行动建议
5. 标注每个章节的关键数据需求`;
  }

  private validateAndNormalizeOutline(outline: any[]): OutlineSection[] {
    if (!Array.isArray(outline)) {
      throw new Error('Outline must be an array');
    }

    return outline.map((section, idx) => ({
      title: section.title || `Section ${idx + 1}`,
      level: section.level || 1,
      content: section.content || '',
      subsections: section.subsections?.map((sub: any, subIdx: number) => ({
        title: sub.title || `Subsection ${subIdx + 1}`,
        level: sub.level || 2,
        content: sub.content || '',
      })) || [],
    }));
  }

  private createFallbackOutline(input: PlannerInput): OutlineSection[] {
    return [
      {
        title: '一、宏观视野：政策与趋势',
        level: 1,
        content: '从政策导向和经济周期角度分析',
        subsections: [
          { title: '1.1 政策背景与演变', level: 2, content: '梳理相关政策历史脉络' },
          { title: '1.2 宏观经济影响', level: 2, content: '分析经济周期对话题的影响' },
        ],
      },
      {
        title: '二、中观解剖：产业与机制',
        level: 1,
        content: '产业链分析和商业模式探讨',
        subsections: [
          { title: '2.1 产业链全景图', level: 2, content: '绘制产业各环节关系' },
          { title: '2.2 商业模式分析', level: 2, content: '解析主要盈利模式' },
        ],
      },
      {
        title: '三、微观行动：案例与建议',
        level: 1,
        content: '具体项目案例和行动建议',
        subsections: [
          { title: '3.1 标杆案例研究', level: 2, content: '深度剖析典型案例' },
          { title: '3.2 行动建议', level: 2, content: '给出可操作建议' },
        ],
      },
    ];
  }

  private async analyzeDataRequirements(
    input: PlannerInput,
    outline: OutlineSection[]
  ): Promise<DataRequirement[]> {
    const prompt = `基于以下研究大纲，分析每个章节需要的数据类型和来源。

## 话题
${input.topic}

## 大纲
${JSON.stringify(outline, null, 2)}

## 输出要求
输出JSON数组，每个数据需求包含：
{
  "type": "government" | "industry" | "academic" | "expert",
  "description": "具体数据描述",
  "priority": "high" | "medium" | "low"
}

请识别所有需要的数据点，并标注优先级。`;

    try {
      const result = await this.llmRouter.generate(prompt, 'analysis', {
        temperature: 0.5,
        maxTokens: 2000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return Array.isArray(parsed) ? parsed.slice(0, 10) : this.createFallbackRequirements();
      }
    } catch (error) {
      this.log('warn', 'Failed to parse data requirements', { error });
    }

    return this.createFallbackRequirements();
  }

  private createFallbackRequirements(): DataRequirement[] {
    return [
      { type: 'government', description: '相关政策文件和官方统计数据', priority: 'high' },
      { type: 'industry', description: '行业研究报告和市场数据', priority: 'high' },
      { type: 'academic', description: '学术论文和理论模型', priority: 'medium' },
    ];
  }

  /**
   * 基于知识库生成洞见 - 分析历史内容，发现趋势和空白
   */
  private async generateKnowledgeInsights(input: PlannerInput): Promise<KnowledgeInsight[]> {
    try {
      // 1. 从数据库获取相关历史内容
      const relatedContent = await this.queryKnowledgeBase(input.topic);

      if (relatedContent.length === 0) {
        this.log('info', 'No related content found in knowledge base');
        return [];
      }

      // 2. 使用 LLM 分析历史内容，生成洞见
      const prompt = `你是一位资深产业研究专家，擅长从历史研究中发现趋势和空白。

## 待研究话题
${input.topic}

## 背景信息
${input.context || '无特定背景'}

## 知识库中的相关历史内容
${relatedContent.map(c => `- ${c.title} (${c.type}): ${c.summary?.substring(0, 200)}...`).join('\n')}

## 分析任务
请基于以上历史内容，生成3-5个深度洞见，重点关注：

1. **趋势延续 (trend)**: 从历史内容中发现的持续趋势
2. **研究空白 (gap)**: 已有内容未覆盖的重要角度
3. **观点演变 (historical)**: 该话题的观点如何随时间变化

## 输出格式
请输出JSON数组：
[
  {
    "source": "引用的历史内容标题",
    "type": "trend|gap|historical",
    "content": "洞见内容，要求具体、可验证",
    "relevance": 0.85
  }
]

要求：
- 每个洞见必须有具体的历史内容支撑
- 洞见要有差异化视角，避免泛泛而谈
- 重点关注被忽视的角度和潜在机会`;

      const result = await this.llmRouter.generate(prompt, 'analysis', {
        temperature: 0.7,
        maxTokens: 3000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 5).map((item: any) => ({
            source: item.source || '知识库分析',
            type: item.type || 'historical',
            content: item.content,
            relevance: Math.min(1, Math.max(0, item.relevance || 0.7)),
          }));
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to generate knowledge insights', { error });
    }

    return [];
  }

  /**
   * 生成新观点 - 基于洞见提出差异化选题角度
   */
  private async generateNovelAngles(
    input: PlannerInput,
    insights: KnowledgeInsight[]
  ): Promise<NovelAngle[]> {
    if (insights.length === 0) {
      return [];
    }

    try {
      const prompt = `你是一位富有洞察力的产业研究专家，擅长提出创新性的研究角度。

## 待研究话题
${input.topic}

## 背景信息
${input.context || '无特定背景'}

## 基于知识库分析的关键洞见
${insights.map((i, idx) => `${idx + 1}. [${i.type}] ${i.content}`).join('\n')}

## 任务
基于以上洞见，提出3-4个**新的研究角度**，要求：

1. **差异化**：与现有研究形成明显区隔
2. **创新性**：提出新观点、新框架或新解释
3. **可行性**：有数据支撑的可能性
4. **价值性**：对读者有实际启发

## 输出格式
请输出JSON数组：
[
  {
    "angle": "新角度标题（15字以内）",
    "rationale": "为什么这个角度有价值，基于什么洞见",
    "differentiation": "与现有研究的主要区别",
    "potentialImpact": "high|medium|low"
  }
]

要求：
- 角度必须具体，避免空泛（如不要只说"深入分析"）
- 要有明确的方法论或框架支撑
- 优先考虑反共识但合理的视角`;

      const result = await this.llmRouter.generate(prompt, 'planning', {
        temperature: 0.8,
        maxTokens: 3000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 4).map((item: any) => ({
            angle: item.angle,
            rationale: item.rationale,
            differentiation: item.differentiation,
            potentialImpact: ['high', 'medium', 'low'].includes(item.potentialImpact)
              ? item.potentialImpact
              : 'medium',
          }));
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to generate novel angles', { error });
    }

    return [];
  }

  /**
   * 生成新观点 - 简单版本（不依赖知识洞见，可并行执行）
   */
  private async generateNovelAnglesSimple(input: PlannerInput): Promise<NovelAngle[]> {
    try {
      const prompt = `你是一位富有洞察力的产业研究专家，擅长提出创新性的研究角度。

## 待研究话题
${input.topic}

## 背景信息
${input.context || '无特定背景'}

## 任务
基于以上话题，提出2-3个**新的研究角度**，要求：

1. **差异化**：与现有研究形成明显区隔
2. **创新性**：提出新观点、新框架或新解释
3. **可行性**：有数据支撑的可能性
4. **价值性**：对读者有实际启发

## 输出格式
请输出JSON数组：
[
  {
    "angle": "新角度标题（15字以内）",
    "rationale": "为什么这个角度有价值",
    "differentiation": "与现有研究的主要区别",
    "potentialImpact": "high|medium|low"
  }
]

要求：
- 角度必须具体，避免空泛
- 要有明确的方法论或框架支撑
- 优先考虑反共识但合理的视角`;

      const result = await this.llmRouter.generate(prompt, 'planning', {
        temperature: 0.8,
        maxTokens: 2000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 3).map((item: any) => ({
            angle: item.angle,
            rationale: item.rationale,
            differentiation: item.differentiation,
            potentialImpact: ['high', 'medium', 'low'].includes(item.potentialImpact)
              ? item.potentialImpact
              : 'medium',
          }));
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to generate novel angles (simple)', { error });
    }

    return [];
  }

  /**
   * 查询知识库 - 获取相关历史内容
   */
  private async queryKnowledgeBase(topic: string): Promise<any[]> {
    try {
      // 提取关键词
      const keywords = topic.split(/\s+/).filter(w => w.length > 1);

      // 查询历史任务/文章
      const tasksResult = await query(
        `SELECT id, topic as title, outline, research_data, created_at, 'task' as type
         FROM tasks
         WHERE status = 'completed'
         AND (
           topic ILIKE ANY($1)
           OR research_data->>'insights' ILIKE ANY($1)
         )
         ORDER BY created_at DESC
         LIMIT 10`,
        [keywords.map((k: string) => `%${k}%`)]
      );

      // 查询素材库
      const assetsResult = await query(
        `SELECT id, title, content_preview as summary, content_type, tags, created_at, 'asset' as type
         FROM assets
         WHERE (
           title ILIKE ANY($1)
           OR content_preview ILIKE ANY($1)
           OR tags && $2::text[]
         )
         ORDER BY quality_score DESC, created_at DESC
         LIMIT 10`,
        [keywords.map((k: string) => `%${k}%`), keywords]
      );

      return [
        ...tasksResult.rows.map((r: any) => ({
          ...r,
          summary: r.outline?.title || r.title,
        })),
        ...assetsResult.rows,
      ];
    } catch (error) {
      this.log('warn', 'Failed to query knowledge base', { error });
      return [];
    }
  }

  /**
   * 增强大纲生成 - 融入知识库洞见和新角度
   */
  private async generateOutline(
    input: PlannerInput,
    insights?: KnowledgeInsight[],
    novelAngles?: NovelAngle[]
  ): Promise<OutlineSection[]> {
    const prompt = this.buildEnhancedOutlinePrompt(input, insights, novelAngles);

    const result = await this.llmRouter.generate(prompt, 'planning', {
      temperature: 0.7,
      maxTokens: 4000,
    });

    try {
      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return this.validateAndNormalizeOutline(parsed.outline || parsed);
    } catch (error) {
      this.log('warn', 'Failed to parse structured outline, using fallback', { error });
      return this.createFallbackOutline(input);
    }
  }

  /**
   * 构建增强的大纲生成提示词
   */
  private buildEnhancedOutlinePrompt(
    input: PlannerInput,
    insights?: KnowledgeInsight[],
    novelAngles?: NovelAngle[]
  ): string {
    const depthMap = {
      macro: '宏观视野层（政策、趋势、周期）',
      meso: '中观解剖层（行业、区域、机制）',
      micro: '微观行动层（项目、企业、操作）',
      comprehensive: '完整三层结构（宏观→中观→微观）',
    };

    const insightsSection = insights && insights.length > 0
      ? `## 基于知识库的关键洞见\n${insights.map((i, idx) => `${idx + 1}. [${i.type}] ${i.content} (相关度: ${(i.relevance * 100).toFixed(0)}%)`).join('\n')}`
      : '';

    const anglesSection = novelAngles && novelAngles.length > 0
      ? `## 建议的新研究角度\n${novelAngles.map((a, idx) => `${idx + 1}. **${a.angle}** [影响: ${a.potentialImpact}]\n   - 差异化: ${a.differentiation}\n   - 理由: ${a.rationale}`).join('\n')}`
      : '';

    // 新增：用户评论反馈
    const commentsSection = input.comments && input.comments.length > 0
      ? `## 用户反馈与修改建议\n${input.comments.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}\n\n**重要：请务必根据以上用户反馈调整大纲结构或内容，体现用户的修改意图。**`
      : '';

    return `你是一位资深产业研究专家，擅长构建系统性研究框架并提出创新观点。

## 话题
${input.topic}

## 背景信息
${input.context || '无特定背景'}

## 目标受众
${input.targetAudience || '产业研究人员和投资者'}

## 深度要求
${depthMap[input.desiredDepth || 'comprehensive']}

${insightsSection}

${anglesSection}

${commentsSection}

## 输出要求
请输出JSON格式，包含以下结构：
{
  "outline": [
    {
      "title": "章节标题",
      "level": 1,
      "content": "核心论述要点，要求融入上述洞见或新角度",
      "subsections": [
        {
          "title": "子章节",
          "level": 2,
          "content": "子章节要点"
        }
      ]
    }
  ]
}

要求：
1. 至少包含3个一级章节，每个章节有2-3个子章节
2. 必须融入上述洞见中的至少2个，体现知识积累
3. 优先采用建议的新研究角度，形成差异化
4. 如有用户反馈，必须根据反馈调整相应章节的内容或结构
5. 宏观层关注：政策导向、经济周期、国际比较
6. 中观层关注：产业链分析、区域差异、商业模式
7. 微观层关注：标杆案例、数据验证、行动建议
8. 标注每个章节的关键数据需求`;
  }

  private async savePlan(
    input: PlannerInput,
    outline: OutlineSection[],
    dataRequirements: DataRequirement[],
    knowledgeInsights?: KnowledgeInsight[],
    novelAngles?: NovelAngle[]
  ): Promise<string> {
    // Store knowledge insights and novel angles within the outline object
    const enrichedOutline = {
      sections: outline,
      knowledgeInsights: knowledgeInsights || [],
      novelAngles: novelAngles || [],
      dataRequirements: dataRequirements || [],
      generatedAt: new Date().toISOString(),
    };

    // 如果提供了 existingTaskId，则更新现有 task
    if (input.existingTaskId) {
      await query(
        `UPDATE tasks 
         SET outline = $1, 
             status = 'outline_pending', 
             progress = 10,
             current_stage = 'outline_pending',
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(enrichedOutline), input.existingTaskId]
      );
      return input.existingTaskId;
    }

    // 否则创建新 task
    const result = await query(
      `INSERT INTO tasks (id, topic, outline, status, progress, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [
        `task_${Date.now()}`,
        input.topic,
        JSON.stringify(enrichedOutline),
        'planning',
        10,
      ]
    );
    return result.rows[0].id;
  }

  private calculateEstimatedTime(outline: OutlineSection[], requirements: DataRequirement[]): number {
    // Base time: 4 hours
    let time = 4;
    // Add time for each section
    time += outline.length * 2;
    // Add time for high priority data requirements
    time += requirements.filter(r => r.priority === 'high').length * 0.5;
    return Math.ceil(time);
  }
}
