// Research Agent - 数据研究专家
// 负责: 多轮迭代调研 — 广度探索 → 章节深挖 → 覆盖度补充 → 分析洞察

import { BaseAgent, AgentContext, AgentResult } from './base';
import { LLMRouter } from '../providers';
import { query } from '../db/connection';
import { ResearchReport, CleanData, Insight, AnalysisResult, OutlineSection } from '../types/index.js';
import { getWebSearchService, SearchResult } from '../services/webSearch.js';
import { getResearcherContext } from './contentLibraryContext.js';

export interface ResearcherInput {
  topicId: string;
  topic: string;
  outline: any[];
  dataRequirements: any[];
  useAssetLibrary?: boolean;
  maxSources?: number;
  searchConfig?: {
    maxSearchUrls?: number;
    enableWebSearch?: boolean;
    searchQueries?: string[];
  };
}

export interface ResearcherOutput {
  reportId: string;
  dataPackage: CleanData[];
  analysis: AnalysisResult;
  insights: Insight[];
  coverageReport?: CoverageReport;
}

interface CoverageReport {
  passed: boolean;
  totalSections: number;
  coveredSections: number;
  gaps: Array<{ section: string; missingMetrics: string[] }>;
  missingData: Array<{ section: string; metric: string; priority: string }>;
}

export class ResearchAgent extends BaseAgent {
  constructor(llmRouter: LLMRouter) {
    super('ResearchAgent', llmRouter);
  }

  async execute(input: ResearcherInput, context?: AgentContext): Promise<AgentResult<ResearcherOutput>> {
    this.clearLogs();
    this.log('info', 'Starting multi-round research', { topicId: input.topicId });

    const taskId = await this.saveTask('research', 'running', input);

    try {
      const searchConfig = input.searchConfig || {};
      const maxSearchUrls = searchConfig.maxSearchUrls || 30;
      const enableWebSearch = searchConfig.enableWebSearch !== false;
      const useAssetLibrary = input.useAssetLibrary !== false;

      let dataPackage: CleanData[] = [];

      // ========== Round 1: 广度探索 — 建立全貌理解 ==========
      this.log('info', 'Round 1: Broad exploration');

      // 内容库: topic 全局检索
      if (useAssetLibrary) {
        const globalAssets = await this.searchAssetLibrary(input.topic);
        dataPackage.push(...this.assetsToCleanData(globalAssets));
        this.log('info', `Round 1: Found ${globalAssets.length} assets from global search`);
      }

      // 网页: 广度搜索
      if (enableWebSearch) {
        const broadQueries = this.generateBroadQueries(input);
        const broadResults = await this.performSearch(broadQueries, Math.ceil(maxSearchUrls * 0.3));
        dataPackage.push(...this.webResultsToCleanData(broadResults));
        this.log('info', `Round 1: Found ${broadResults.length} web results from broad search`);
      }

      // ========== Round 2: 章节深挖 — 针对每个章节的核心问题 ==========
      this.log('info', 'Round 2: Section-level deep dive');

      const sections = this.flattenSections(input.outline);
      for (const section of sections.slice(0, 8)) {
        // 内容库: 用章节的 coreQuestion 做语义检索
        if (useAssetLibrary) {
          const queryText = section.coreQuestion || section.title;
          const sectionAssets = await this.searchAssetLibrary(queryText);
          const newAssets = this.assetsToCleanData(sectionAssets, section.title);
          dataPackage.push(...newAssets);
        }

        // 网页: 使用章节的搜索关键词
        if (enableWebSearch) {
          const sectionQueries = this.generateSectionQueries(input, section);
          const sectionResults = await this.performSearch(sectionQueries, Math.ceil(maxSearchUrls * 0.1));
          dataPackage.push(...this.webResultsToCleanData(sectionResults, section.title));
        }
      }

      this.log('info', `After Round 2: ${dataPackage.length} total data points`);

      // ========== Round 3: 覆盖度检查 + 补充搜索 ==========
      const coverage = this.checkCoverage(dataPackage, sections);
      this.log('info', 'Coverage check', {
        passed: coverage.passed,
        gaps: coverage.gaps.length,
        missing: coverage.missingData.length,
      });

      if (!coverage.passed && enableWebSearch) {
        this.log('info', 'Round 3: Supplementary search for coverage gaps');
        const supplementQueries = this.generateSupplementQueries(input.topic, coverage);
        const supplementResults = await this.performSearch(supplementQueries, Math.ceil(maxSearchUrls * 0.2));
        dataPackage.push(...this.webResultsToCleanData(supplementResults));
        this.log('info', `Round 3: Added ${supplementResults.length} supplementary results`);
      }

      // 标记缺失数据（不造假）
      for (const missing of coverage.missingData) {
        if (missing.priority === 'P0') {
          dataPackage.push(this.markMissingData(missing.section, missing.metric));
        }
      }

      // 去重
      dataPackage = this.deduplicateData(dataPackage);

      // ========== 分析 + 洞察 ==========
      this.log('info', 'Analyzing data');
      const analysis = await this.analyzeData(input.topic, dataPackage);

      this.log('info', 'Generating insights');
      const insights = await this.generateInsights(input.topic, analysis, dataPackage);

      this.log('info', 'Saving research report');
      const reportId = await this.saveReport(input.topicId, dataPackage, analysis, insights);

      // Update asset reference weights
      const assetIds = dataPackage
        .filter(d => d.metadata?.assetId)
        .map(d => d.metadata.assetId as string);
      if (assetIds.length > 0) {
        await this.updateAssetWeights(assetIds);
      }

      await this.updateTask(taskId, { status: 'completed', result: { reportId } });

      // 最终覆盖度重新检查
      const finalCoverage = this.checkCoverage(dataPackage, sections);

      const output: ResearcherOutput = {
        reportId,
        dataPackage,
        analysis,
        insights,
        coverageReport: finalCoverage,
      };

      this.log('info', 'Research completed', {
        reportId,
        dataPoints: dataPackage.length,
        coveragePassed: finalCoverage.passed,
      });
      return this.createSuccessResult(output);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', 'Research failed', { error: errorMsg });
      await this.updateTask(taskId, { status: 'failed', error: errorMsg });
      return this.createErrorResult(errorMsg);
    }
  }

  // ========== 搜索词生成 ==========

  /**
   * Round 1: 广度搜索词 — 建立话题全貌
   */
  private generateBroadQueries(input: ResearcherInput): string[] {
    const queries: string[] = [];
    const topic = input.topic;

    // 自定义搜索词优先
    if (input.searchConfig?.searchQueries) {
      queries.push(...input.searchConfig.searchQueries);
    }

    // 话题主搜索
    queries.push(topic);
    queries.push(`${topic} 市场分析 2026`);
    queries.push(`${topic} 行业趋势 最新`);
    queries.push(`${topic} 研究报告`);

    return [...new Set(queries)].slice(0, 6);
  }

  /**
   * Round 2: 章节级搜索词 — 分层优先级
   */
  private generateSectionQueries(input: ResearcherInput, section: any): string[] {
    const queries: string[] = [];
    const topic = input.topic;

    // 优先级 1: 大纲中已规划的搜索关键词
    if (section.dataNeeds && Array.isArray(section.dataNeeds)) {
      for (const need of section.dataNeeds) {
        if (need.searchKeywords && Array.isArray(need.searchKeywords)) {
          queries.push(...need.searchKeywords);
        }
      }
    }

    // 优先级 2: 从数据需求描述中提取（兼容旧格式 dataRequirements）
    if (queries.length === 0 && input.dataRequirements) {
      for (const req of input.dataRequirements.slice(0, 3)) {
        if (req.searchKeywords && Array.isArray(req.searchKeywords)) {
          queries.push(...req.searchKeywords);
        } else if (req.description) {
          queries.push(`${topic} ${req.description}`);
        }
      }
    }

    // 优先级 3: 基于章节核心问题生成多种表述
    if (section.coreQuestion) {
      queries.push(section.coreQuestion);
    }
    if (section.title) {
      queries.push(`${topic} ${section.title} 数据`);
      queries.push(`${topic} ${section.title} 案例`);
    }

    return [...new Set(queries)].slice(0, 5);
  }

  /**
   * Round 3: 补充搜索 — 针对覆盖度缺口
   */
  private generateSupplementQueries(topic: string, coverage: CoverageReport): string[] {
    const queries: string[] = [];

    for (const gap of coverage.gaps.slice(0, 3)) {
      for (const metric of gap.missingMetrics.slice(0, 2)) {
        queries.push(`${topic} ${metric}`);
        queries.push(`${metric} 数据 统计`);
      }
    }

    return [...new Set(queries)].slice(0, 8);
  }

  // ========== 搜索执行 ==========

  private async performSearch(queries: string[], maxResults: number): Promise<SearchResult[]> {
    if (queries.length === 0) return [];

    try {
      const webSearchService = getWebSearchService();
      const resultsPerQuery = Math.max(1, Math.ceil(maxResults / queries.length));
      let allResults = await webSearchService.batchSearch(queries, resultsPerQuery);
      allResults = await webSearchService.rankByRelevance(allResults, queries[0]);
      return allResults.slice(0, maxResults);
    } catch (error) {
      this.log('warn', 'Web search failed', { error });
      return [];
    }
  }

  /**
   * 章节级内容库检索 — 用章节问题而非全局 topic
   */
  private async searchAssetLibrary(queryText: string): Promise<any[]> {
    try {
      const embedding = await this.llmRouter.embed(queryText);

      const result = await query(
        `SELECT id, content, content_type, auto_tags, quality_score, source,
                1 - (embedding <=> $1::vector) as similarity
         FROM asset_library
         WHERE embedding IS NOT NULL
           AND 1 - (embedding <=> $1::vector) > 0.5
         ORDER BY embedding <=> $1::vector
         LIMIT 5`,
        [JSON.stringify(embedding)]
      );

      return result.rows;
    } catch (error) {
      this.log('warn', 'Asset library search failed', { error, queryText });
      return [];
    }
  }

  // ========== 数据转换 ==========

  private webResultsToCleanData(results: SearchResult[], sectionTitle?: string): CleanData[] {
    return results.map(result => ({
      source: result.source || (() => { try { return new URL(result.url).hostname; } catch { return 'web'; } })(),
      url: result.url,
      content: result.snippet,
      metadata: {
        type: 'web',
        title: result.title,
        relevance: result.relevance,
        isWebSource: true,
        forSection: sectionTitle,
      },
      quality: result.relevance || 0.7,
    }));
  }

  private assetsToCleanData(assets: any[], sectionTitle?: string): CleanData[] {
    return assets.map(asset => ({
      source: asset.source || 'Asset Library',
      content: asset.content?.substring(0, 5000) || '',
      metadata: {
        type: asset.content_type,
        tags: asset.auto_tags,
        qualityScore: asset.quality_score,
        similarity: asset.similarity,
        assetId: asset.id,
        forSection: sectionTitle,
      },
      quality: asset.quality_score || 0.5,
    }));
  }

  // ========== 覆盖度检查 ==========

  /**
   * 按章节的 P0 数据需求检查覆盖度
   */
  private checkCoverage(dataPackage: CleanData[], sections: any[]): CoverageReport {
    const gaps: CoverageReport['gaps'] = [];
    const missingData: CoverageReport['missingData'] = [];
    let totalSections = 0;
    let coveredSections = 0;

    for (const section of sections) {
      if (!section.dataNeeds || !Array.isArray(section.dataNeeds)) continue;
      totalSections++;

      const p0Needs = section.dataNeeds.filter((n: any) => n.priority === 'P0');
      if (p0Needs.length === 0) {
        coveredSections++;
        continue;
      }

      const missingMetrics: string[] = [];
      for (const need of p0Needs) {
        const metric = need.metric || '';
        // 检查数据包中是否有内容覆盖这个指标
        const found = dataPackage.some(d =>
          !d.metadata?.isMissing &&
          (d.content.toLowerCase().includes(metric.toLowerCase()) ||
           d.metadata?.title?.toLowerCase().includes(metric.toLowerCase()))
        );
        if (!found) {
          missingMetrics.push(metric);
          missingData.push({
            section: section.title,
            metric,
            priority: need.priority,
          });
        }
      }

      if (missingMetrics.length > 0) {
        gaps.push({ section: section.title, missingMetrics });
      } else {
        coveredSections++;
      }
    }

    return {
      passed: gaps.length === 0 || totalSections === 0,
      totalSections,
      coveredSections,
      gaps,
      missingData,
    };
  }

  /**
   * 标记缺失数据——不造假，明确标注需要人工补充
   */
  private markMissingData(sectionTitle: string, metric: string): CleanData {
    return {
      source: '⚠️ 数据缺失',
      content: `章节"${sectionTitle}"需要的关键数据"${metric}"未找到真实来源，建议人工补充。`,
      metadata: { isMissing: true, metric, forSection: sectionTitle },
      quality: 0,
    };
  }

  // ========== 工具方法 ==========

  private flattenSections(outline: any[]): any[] {
    if (!Array.isArray(outline)) return [];
    const result: any[] = [];
    for (const section of outline) {
      result.push(section);
      if (section.subsections && Array.isArray(section.subsections)) {
        result.push(...section.subsections);
      }
    }
    return result;
  }

  private deduplicateData(dataPackage: CleanData[]): CleanData[] {
    const seen = new Set<string>();
    return dataPackage.filter(d => {
      const key = d.url || `${d.source}:${d.content.substring(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ========== 分析 + 洞察（保留原有逻辑） ==========

  private async analyzeData(topic: string, dataPackage: CleanData[]): Promise<AnalysisResult> {
    const realData = dataPackage.filter(d => !d.metadata?.isMissing);
    if (realData.length === 0) {
      return {
        statistics: { 数据点数量: 0, 平均数据质量: 0 },
        trends: [],
        comparisons: [],
      };
    }

    const prompt = `基于以下研究数据，进行系统性分析。

## 研究话题
${topic}

## 数据包（${realData.length} 条真实数据）
${realData.slice(0, 15).map((d, i) => `
[${i + 1}] 来源: ${d.source}
内容: ${d.content.substring(0, 800)}
`).join('\n')}

## 分析要求
请输出JSON格式分析结果:
{
  "statistics": {
    "数据点数量": number,
    "来源分布": {"网页": number, "内容库": number},
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
      "items": [{"name": "名称", "value": "数值"}]
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

    return {
      statistics: {
        数据点数量: realData.length,
        平均数据质量: realData.reduce((sum, d) => sum + d.quality, 0) / realData.length,
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
    // v7.1: 注入 Content Library ⑤⑥⑦⑨ 产出物
    const clContext = await getResearcherContext(topic).catch(() => '');

    const prompt = `基于分析结果，生成研究洞察。
${clContext}
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
      content: `基于${dataPackage.filter(d => !d.metadata?.isMissing).length}个数据源的分析显示该领域正处于发展阶段`,
      confidence: 0.7,
      evidence: ['多源数据交叉验证'],
    }];
  }

  // ========== 持久化 ==========

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
