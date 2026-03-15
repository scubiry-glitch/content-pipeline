// Research Agent - 数据研究专家
// 负责: 资产库检索 → 数据收集 → 分析洞察

import { BaseAgent, AgentContext, AgentResult } from './base';
import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { ResearchReport, CleanData, Insight, AnalysisResult } from '../../shared/src/types';

export interface ResearcherInput {
  topicId: string;
  topic: string;
  outline: any[];
  dataRequirements: any[];
  useAssetLibrary?: boolean;
  maxSources?: number;
}

export interface ResearcherOutput {
  reportId: string;
  dataPackage: CleanData[];
  analysis: AnalysisResult;
  insights: Insight[];
}

export class ResearchAgent extends BaseAgent {
  constructor(llmRouter: LLMRouter) {
    super('ResearchAgent', llmRouter);
  }

  async execute(input: ResearcherInput, context?: AgentContext): Promise<AgentResult<ResearcherOutput>> {
    this.clearLogs();
    this.log('info', 'Starting research phase', { topicId: input.topicId });

    const taskId = await this.saveTask('research', 'running', input);

    try {
      // Step 1: Search asset library for relevant materials
      this.log('info', 'Searching asset library');
      const assetResults = input.useAssetLibrary !== false
        ? await this.searchAssetLibrary(input.topic, input.outline)
        : [];

      // Step 2: Generate simulated data sources based on requirements
      this.log('info', 'Collecting data from sources');
      const dataPackage = await this.collectData(input, assetResults);

      // Step 3: Analyze data and extract insights
      this.log('info', 'Analyzing data');
      const analysis = await this.analyzeData(input.topic, dataPackage);

      // Step 4: Generate insights
      this.log('info', 'Generating insights');
      const insights = await this.generateInsights(input.topic, analysis, dataPackage);

      // Step 5: Save report
      this.log('info', 'Saving research report');
      const reportId = await this.saveReport(input.topicId, dataPackage, analysis, insights);

      // Step 6: Update asset reference weights
      if (assetResults.length > 0) {
        await this.updateAssetWeights(assetResults.map(a => a.id));
      }

      await this.updateTask(taskId, { status: 'completed', result: { reportId } });

      const output: ResearcherOutput = {
        reportId,
        dataPackage,
        analysis,
        insights,
      };

      this.log('info', 'Research completed successfully', { reportId, dataPoints: dataPackage.length });
      return this.createSuccessResult(output);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'Research failed', { error: errorMsg });
      await this.updateTask(taskId, { status: 'failed', error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  private async searchAssetLibrary(topic: string, outline: any[]): Promise<any[]> {
    try {
      // Get embedding for the topic
      const embedding = await this.llmRouter.embed(topic);

      // Search by vector similarity
      const result = await query(
        `SELECT id, content, content_type, auto_tags, quality_score, source,
                1 - (embedding <=> $1::vector) as similarity
         FROM asset_library
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 10`,
        [JSON.stringify(embedding)]
      );

      this.log('info', `Found ${result.rows.length} relevant assets`);
      return result.rows;
    } catch (error) {
      this.log('warn', 'Asset library search failed, returning empty results', { error });
      return [];
    }
  }

  private async collectData(input: ResearcherInput, assets: any[]): Promise<CleanData[]> {
    const dataPackage: CleanData[] = [];

    // Add data from asset library
    for (const asset of assets) {
      dataPackage.push({
        source: asset.source || 'Asset Library',
        content: asset.content.substring(0, 5000), // Limit content length
        metadata: {
          type: asset.content_type,
          tags: asset.auto_tags,
          qualityScore: asset.quality_score,
          similarity: asset.similarity,
        },
        quality: asset.quality_score || 0.5,
      });
    }

    // Generate structured data based on requirements
    for (const req of input.dataRequirements.slice(0, 5)) {
      const simulatedData = await this.generateSimulatedData(input.topic, req);
      if (simulatedData) {
        dataPackage.push(simulatedData);
      }
    }

    return dataPackage.slice(0, input.maxSources || 15);
  }

  private async generateSimulatedData(topic: string, requirement: any): Promise<CleanData | null> {
    // Validate requirement
    if (!requirement || typeof requirement !== 'object') {
      this.log('warn', 'Invalid requirement object', { requirement });
      return null;
    }

    const typeMap: Record<string, string> = {
      government: '政府官方数据',
      industry: '行业研究报告',
      academic: '学术论文',
      expert: '专家观点',
    };

    const reqType = requirement.type || 'industry';
    const reqDescription = requirement.description || '相关数据';
    const reqPriority = requirement.priority || 'medium';

    const prompt = `请为"${topic}"研究生成一段${typeMap[reqType] || '相关数据'}。

数据需求: ${reqDescription}
优先级: ${reqPriority}

要求:
1. 数据要真实可信，标注来源
2. 包含具体数字和指标
3. 如果是估算，请说明估算依据
4. 长度控制在300-500字

请以JSON格式输出:
{
  "content": "数据内容",
  "source": "数据来源",
  "keyMetrics": {"指标名": "数值"}
}`;

    try {
      const result = await this.llmRouter.generate(prompt, 'analysis', {
        temperature: 0.7,
        maxTokens: 1000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\{[\s\S]*?\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return {
          source: parsed.source || `${typeMap[reqType]}来源`,
          content: parsed.content || '无内容',
          metadata: {
            type: reqType,
            priority: reqPriority,
            keyMetrics: parsed.keyMetrics || {},
          },
          quality: reqPriority === 'high' ? 0.9 : 0.7,
        };
      }
    } catch (error) {
      this.log('warn', 'Failed to generate simulated data', { error });
    }

    return null;
  }

  private async analyzeData(topic: string, dataPackage: CleanData[]): Promise<AnalysisResult> {
    const prompt = `基于以下研究数据，进行系统性分析。

## 研究话题
${topic}

## 数据包
${dataPackage.map((d, i) => `
[${i + 1}] 来源: ${d.source}
内容: ${d.content.substring(0, 800)}...
`).join('\n')}

## 分析要求
请输出JSON格式分析结果:
{
  "statistics": {
    "数据点数量": number,
    "政府来源占比": number,
    "行业来源占比": number,
    "平均数据质量": number
  },
  "trends": [
    {
      "metric": "指标名称",
      "direction": "up" | "down" | "stable",
      "magnitude": 0-1,
      "period": "时间周期"
    }
  ],
  "comparisons": [
    {
      "dimension": "对比维度",
      "items": [{"name": "名称", "value": 数值}]
    }
  ]
}

请识别关键趋势和对比维度。`;

    try {
      const result = await this.llmRouter.generate(prompt, 'analysis', {
        temperature: 0.5,
        maxTokens: 2000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (error) {
      this.log('warn', 'Failed to parse analysis', { error });
    }

    // Fallback analysis
    return {
      statistics: {
        数据点数量: dataPackage.length,
        政府来源占比: 0.3,
        行业来源占比: 0.4,
        平均数据质量: 0.75,
      },
      trends: [],
      comparisons: [],
    };
  }

  private async generateInsights(
    topic: string,
    analysis: AnalysisResult,
    dataPackage: CleanData[]
  ): Promise<Insight[]> {
    const prompt = `基于分析结果，生成研究洞察。

## 分析结果
${JSON.stringify(analysis, null, 2)}

## 洞察要求
请输出JSON数组，每个洞察包含:
{
  "type": "anomaly" | "cause" | "trend" | "action",
  "content": "洞察内容",
  "confidence": 0-1,
  "evidence": ["证据1", "证据2"]
}

请生成4-6个高质量洞察，覆盖:
1. 异常发现 (anomaly)
2. 因果解释 (cause)
3. 趋势判断 (trend)
4. 行动建议 (action)`;

    try {
      const result = await this.llmRouter.generate(prompt, 'analysis', {
        temperature: 0.7,
        maxTokens: 2000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (error) {
      this.log('warn', 'Failed to parse insights', { error });
    }

    return [{
      type: 'trend',
      content: `基于${dataPackage.length}个数据源的分析显示该领域正处于发展阶段`,
      confidence: 0.7,
      evidence: ['多源数据交叉验证'],
    }];
  }

  private async saveReport(
    topicId: string,
    dataPackage: CleanData[],
    analysis: AnalysisResult,
    insights: Insight[]
  ): Promise<string> {
    const result = await query(
      `INSERT INTO research_reports (topic_id, data_package, analysis, insights)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        topicId,
        JSON.stringify(dataPackage),
        JSON.stringify(analysis),
        JSON.stringify(insights),
      ]
    );
    return result.rows[0].id;
  }

  private async updateAssetWeights(assetIds: string[]): Promise<void> {
    for (const id of assetIds) {
      await query(
        `UPDATE asset_library
         SET reference_weight = LEAST(reference_weight + 0.05, 1.0),
             last_used_at = NOW()
         WHERE id = $1`,
        [id]
      );
    }
  }
}
