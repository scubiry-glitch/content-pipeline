// Planner Agent - 选题规划专家
// 负责: 话题选择 → 大纲生成 → 数据需求分析

import { BaseAgent, AgentContext, AgentResult } from './base';
import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { TopicPlan, OutlineSection, DataRequirement } from '../../shared/src/types';

export interface PlannerInput {
  topic: string;
  context?: string;
  targetAudience?: string;
  desiredDepth?: 'macro' | 'meso' | 'micro' | 'comprehensive';
}

export interface PlannerOutput {
  topicId: string;
  plan: TopicPlan;
  outline: OutlineSection[];
  dataRequirements: DataRequirement[];
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
      // Step 1: Generate comprehensive outline using 三层穿透结构
      this.log('info', 'Generating outline with three-layer structure');
      const outline = await this.generateOutline(input);

      // Step 2: Analyze data requirements
      this.log('info', 'Analyzing data requirements');
      const dataRequirements = await this.analyzeDataRequirements(input, outline);

      // Step 3: Save to database
      this.log('info', 'Saving plan to database');
      const topicId = await this.savePlan(input, outline, dataRequirements);

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
      };

      this.log('info', 'Planning completed successfully', { topicId });
      return this.createSuccessResult(output);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'Planning failed', { error: errorMsg });
      await this.updateTask(taskId, { status: 'failed', error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  private async generateOutline(input: PlannerInput): Promise<OutlineSection[]> {
    const prompt = this.buildOutlinePrompt(input);

    const result = await this.llmRouter.generate(prompt, 'planning', {
      temperature: 0.7,
      maxTokens: 4000,
    });

    try {
      // Parse JSON from response
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

  private async savePlan(
    input: PlannerInput,
    outline: OutlineSection[],
    dataRequirements: DataRequirement[]
  ): Promise<string> {
    const result = await query(
      `INSERT INTO topics (title, outline, data_requirements, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        input.topic,
        JSON.stringify(outline),
        JSON.stringify(dataRequirements),
        'draft',
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
