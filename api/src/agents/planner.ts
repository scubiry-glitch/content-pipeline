// Planner Agent - 选题规划专家
// 负责: 话题解构 → 结构推导 → 章节展开（含数据需求和可视化规划）

import { BaseAgent, AgentContext, AgentResult } from './base';
import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { TopicPlan, OutlineSection, DataRequirement, DataNeed } from '../types/index.js';

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
      // Step 0: 知识库洞察 + 新角度（并行执行）
      this.log('info', 'Analyzing knowledge base for insights and novel angles');
      const [knowledgeInsights, novelAngles] = await Promise.all([
        this.generateKnowledgeInsights(input),
        this.generateNovelAnglesSimple(input)
      ]);

      // Step 1: 内容驱动的大纲生成（含数据需求和可视化规划）
      this.log('info', 'Generating content-driven outline');
      const outline = await this.generateOutline(input, knowledgeInsights, novelAngles);

      // Step 2: 从大纲中提取数据需求（向后兼容）
      const dataRequirements = this.extractDataRequirements(outline);

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

  /**
   * 从大纲的 dataNeeds 中提取 DataRequirement（向后兼容旧接口）
   */
  private extractDataRequirements(outline: OutlineSection[]): DataRequirement[] {
    const requirements: DataRequirement[] = [];

    const extract = (sections: OutlineSection[]) => {
      for (const section of sections) {
        if (section.dataNeeds) {
          for (const need of section.dataNeeds) {
            requirements.push({
              type: 'industry',
              description: need.metric,
              priority: need.priority === 'P0' ? 'high' : need.priority === 'P1' ? 'medium' : 'low',
              searchKeywords: need.searchKeywords,
              timeRange: need.timeRange,
            });
          }
        }
        if (section.subsections) {
          extract(section.subsections);
        }
      }
    };

    extract(outline);

    // 如果大纲没有 dataNeeds（兼容旧格式），返回基础需求
    if (requirements.length === 0) {
      return this.createFallbackRequirements();
    }

    return requirements;
  }

  private validateAndNormalizeOutline(outline: any[]): OutlineSection[] {
    if (!Array.isArray(outline)) {
      throw new Error('Outline must be an array');
    }

    return outline.map((section, idx) => ({
      title: section.title || `Section ${idx + 1}`,
      level: section.level || 1,
      content: section.content || '',
      coreQuestion: section.coreQuestion || undefined,
      analysisApproach: section.analysisApproach || undefined,
      hypothesis: section.hypothesis || undefined,
      dataNeeds: Array.isArray(section.dataNeeds)
        ? section.dataNeeds.map((d: any) => ({
            metric: d.metric || d.description || '',
            searchKeywords: Array.isArray(d.searchKeywords) ? d.searchKeywords : [],
            priority: (['P0', 'P1', 'P2'].includes(d.priority) ? d.priority : 'P1') as DataNeed['priority'],
            timeRange: d.timeRange || undefined,
          }))
        : undefined,
      visualizationPlan: section.visualizationPlan
        ? {
            chartType: section.visualizationPlan.chartType || '',
            title: section.visualizationPlan.title || '',
            dataMapping: section.visualizationPlan.dataMapping || '',
          }
        : undefined,
      subsections: section.subsections?.map((sub: any, subIdx: number) => ({
        title: sub.title || `Subsection ${subIdx + 1}`,
        level: sub.level || 2,
        content: sub.content || '',
        coreQuestion: sub.coreQuestion || undefined,
        analysisApproach: sub.analysisApproach || undefined,
        hypothesis: sub.hypothesis || undefined,
        dataNeeds: Array.isArray(sub.dataNeeds)
          ? sub.dataNeeds.map((d: any) => ({
              metric: d.metric || d.description || '',
              searchKeywords: Array.isArray(d.searchKeywords) ? d.searchKeywords : [],
              priority: (['P0', 'P1', 'P2'].includes(d.priority) ? d.priority : 'P1') as DataNeed['priority'],
              timeRange: d.timeRange || undefined,
            }))
          : undefined,
      })) || [],
    }));
  }

  private createFallbackOutline(input: PlannerInput): OutlineSection[] {
    return [
      {
        title: `${input.topic}：全景扫描`,
        level: 1,
        content: '梳理话题的基本面和关键背景',
        coreQuestion: `${input.topic}的现状和基本面是怎样的？`,
        subsections: [
          { title: '背景与定义', level: 2, content: '厘清核心概念和范畴' },
          { title: '现状概览', level: 2, content: '关键数据和当前格局' },
        ],
      },
      {
        title: '驱动因素与关键张力',
        level: 1,
        content: '分析推动变化的核心因素和矛盾',
        coreQuestion: '是什么力量在推动变化？关键矛盾在哪？',
        subsections: [
          { title: '核心驱动力', level: 2, content: '技术/政策/市场等驱动分析' },
          { title: '挑战与约束', level: 2, content: '阻碍因素和关键瓶颈' },
        ],
      },
      {
        title: '趋势研判与行动建议',
        level: 1,
        content: '基于分析得出判断和建议',
        coreQuestion: '未来会怎样？应该怎么做？',
        subsections: [
          { title: '趋势判断', level: 2, content: '基于数据和逻辑的趋势推导' },
          { title: '行动路径', level: 2, content: '针对目标受众的可操作建议' },
        ],
      },
    ];
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
      const relatedContent = await this.queryKnowledgeBase(input.topic);

      if (relatedContent.length === 0) {
        this.log('info', 'No related content found in knowledge base');
        return [];
      }

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
      const keywords = topic.split(/\s+/).filter(w => w.length > 1);

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
   * 内容驱动的大纲生成 - 从话题解构到章节展开
   */
  private async generateOutline(
    input: PlannerInput,
    insights?: KnowledgeInsight[],
    novelAngles?: NovelAngle[]
  ): Promise<OutlineSection[]> {
    const prompt = this.buildContentDrivenPrompt(input, insights, novelAngles);

    const result = await this.llmRouter.generate(prompt, 'planning', {
      temperature: 0.7,
      maxTokens: 6000,
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
   * 内容驱动的大纲 prompt — 从问题出发推导结构，而非套用固定模板
   */
  private buildContentDrivenPrompt(
    input: PlannerInput,
    insights?: KnowledgeInsight[],
    novelAngles?: NovelAngle[]
  ): string {
    const insightsSection = insights && insights.length > 0
      ? `## 知识库洞察（基于历史内容分析）
${insights.map((i, idx) => `${idx + 1}. [${i.type}] ${i.content} (相关度: ${(i.relevance * 100).toFixed(0)}%)`).join('\n')}

这些洞察揭示了已有研究的趋势和空白，请让它们塑造章节结构——而不仅仅是"提到"它们。`
      : '';

    const anglesSection = novelAngles && novelAngles.length > 0
      ? `## 新研究角度
${novelAngles.map((a, idx) => `${idx + 1}. **${a.angle}** [影响: ${a.potentialImpact}]
   - 差异化: ${a.differentiation}
   - 理由: ${a.rationale}`).join('\n')}

如果某个角度值得成为独立章节，请将它设计为一个完整的分析单元。`
      : '';

    const commentsSection = input.comments && input.comments.length > 0
      ? `## 用户反馈与修改建议
${input.comments.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}

**重要：请务必根据以上用户反馈调整大纲结构或内容。**`
      : '';

    return `你是一位资深产业研究专家。你的任务不是填充模板，而是针对具体话题设计最合适的分析路径。

## 话题
${input.topic}

## 背景信息
${input.context || '无特定背景'}

## 目标受众
${input.targetAudience || '产业研究人员和投资者'}

${insightsSection}

${anglesSection}

${commentsSection}

## 你的工作流程

### 第一步：话题解构（先思考，再动笔）
分析这个话题：
- 核心实体是什么？（市场？品牌？技术？政策？消费群体？企业？）
- 最关键的张力或矛盾是什么？
- 读者最想回答的3-5个核心问题是什么？
- 上述洞察揭示了哪些被忽视的角度？

### 第二步：结构推导（从问题出发，不套模板）
基于解构结果设计章节。要求：
- 每个章节对应一个核心问题或分析维度
- 章节之间有逻辑递进关系（而非简单并列）
- 为每个章节选择最适合的分析方法。可以是经典框架（SWOT、Porter五力、STP、BCG矩阵、TAM-SAM-SOM、消费者决策旅程、价值链、AARRR 等），也可以是话题特有的分析角度
- 不同话题需要完全不同的结构——消费者研究、产业分析、投资评估不应该长一样

### 第三步：章节展开（每章是完整的研究单元）

## 输出要求
请输出JSON格式：
\`\`\`json
{
  "outline": [
    {
      "title": "章节标题（用问题或判断句，不要用'宏观视野'这类标签）",
      "level": 1,
      "coreQuestion": "这一章要回答什么核心问题",
      "analysisApproach": "用什么分析方法/框架，为什么选这个方法",
      "hypothesis": "初始假设（待数据验证或推翻）",
      "content": "核心论述要点",
      "dataNeeds": [
        {
          "metric": "需要的具体数据指标",
          "searchKeywords": ["可直接搜索的关键词1", "关键词2"],
          "priority": "P0|P1|P2",
          "timeRange": "如 2020-2026"
        }
      ],
      "visualizationPlan": {
        "chartType": "推荐的图表类型（折线图/柱状图/饼图/雷达图/桑基图等）",
        "title": "图表标题",
        "dataMapping": "数据如何映射到图表（如 X轴:年份, Y轴:市场规模）"
      },
      "subsections": [
        {
          "title": "子章节标题",
          "level": 2,
          "content": "子章节要点",
          "coreQuestion": "子问题（可选）"
        }
      ]
    }
  ]
}
\`\`\`

## 质量要求
1. 至少3个一级章节，每个有2-3个子章节
2. 每个一级章节必须有 coreQuestion、analysisApproach、至少1条 dataNeeds
3. dataNeeds 中的 searchKeywords 必须是可直接用于搜索引擎的具体查询词
4. P0 数据需求是该章节论证所必需的，缺失则无法成文
5. 章节标题应是具体的问题或判断，而非抽象标签`;
  }

  private async savePlan(
    input: PlannerInput,
    outline: OutlineSection[],
    dataRequirements: DataRequirement[],
    knowledgeInsights?: KnowledgeInsight[],
    novelAngles?: NovelAngle[]
  ): Promise<string> {
    const enrichedOutline = {
      sections: outline,
      knowledgeInsights: knowledgeInsights || [],
      novelAngles: novelAngles || [],
      dataRequirements: dataRequirements || [],
      generatedAt: new Date().toISOString(),
    };

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
    let time = 4;
    time += outline.length * 2;
    time += requirements.filter(r => r.priority === 'high').length * 0.5;
    return Math.ceil(time);
  }
}
