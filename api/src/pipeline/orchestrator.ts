// Content Pipeline Orchestrator
// 负责: 任务调度 → Agent协调 → 状态管理

import { LLMRouter } from '../providers';
import { PlannerAgent, ResearchAgent, WriterAgent } from '../agents';
import { AssetLibraryService } from '../services/assetLibrary';
import { query } from '../db/connection';

export interface PipelineConfig {
  llmRouter: LLMRouter;
  enableBlueTeam: boolean;
  blueTeamRounds: number;
  maxRetries: number;
}

export interface PipelineInput {
  topic: string;
  context?: string;
  targetAudience?: string;
  desiredDepth?: 'macro' | 'meso' | 'micro' | 'comprehensive';
}

export interface PipelineStatus {
  pipelineId: string;
  status: 'pending' | 'planning' | 'researching' | 'writing' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  topicId?: string;
  reportId?: string;
  documentId?: string;
  logs: string[];
  errors: string[];
}

export class PipelineOrchestrator {
  private config: PipelineConfig;
  private planner: PlannerAgent;
  private researcher: ResearchAgent;
  private writer: WriterAgent;
  private assetLibrary: AssetLibraryService;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.planner = new PlannerAgent(config.llmRouter);
    this.researcher = new ResearchAgent(config.llmRouter);
    this.writer = new WriterAgent(config.llmRouter);
    this.assetLibrary = new AssetLibraryService(config.llmRouter);
  }

  async run(input: PipelineInput): Promise<PipelineStatus> {
    const pipelineId = `pipeline-${Date.now()}`;
    const status: PipelineStatus = {
      pipelineId,
      status: 'pending',
      currentStep: '初始化',
      progress: 0,
      logs: ['Pipeline started'],
      errors: [],
    };

    console.log(`[Pipeline ${pipelineId}] Starting pipeline for: ${input.topic}`);

    try {
      // Step 1: Planning
      status.status = 'planning';
      status.currentStep = '选题规划';
      status.progress = 10;
      await this.updatePipelineLog(pipelineId, status);

      const planResult = await this.planner.execute({
        topic: input.topic,
        context: input.context,
        targetAudience: input.targetAudience,
        desiredDepth: input.desiredDepth,
      });

      if (!planResult.success || !planResult.data) {
        throw new Error(`Planning failed: ${planResult.error}`);
      }

      status.topicId = planResult.data.topicId;
      status.logs.push(`✓ 选题规划完成: ${planResult.data.plan.title}`);
      status.progress = 30;
      await this.updatePipelineLog(pipelineId, status);

      // Step 2: Research
      status.status = 'researching';
      status.currentStep = '数据研究';
      status.progress = 40;
      await this.updatePipelineLog(pipelineId, status);

      const researchResult = await this.researcher.execute({
        topicId: planResult.data.topicId,
        topic: input.topic,
        outline: planResult.data.outline,
        dataRequirements: planResult.data.dataRequirements,
        useAssetLibrary: true,
      });

      if (!researchResult.success || !researchResult.data) {
        throw new Error(`Research failed: ${researchResult.error}`);
      }

      status.reportId = researchResult.data.reportId;
      status.logs.push(`✓ 数据研究完成: ${researchResult.data.dataPackage.length} 数据源, ${researchResult.data.insights.length} 洞察`);
      status.progress = 60;
      await this.updatePipelineLog(pipelineId, status);

      // Step 3: Writing with Blue Team
      status.status = 'writing';
      status.currentStep = this.config.enableBlueTeam ? '写作 + Blue Team审核' : '写作';
      status.progress = 70;
      await this.updatePipelineLog(pipelineId, status);

      const writerResult = await this.writer.execute({
        topicId: planResult.data.topicId,
        topic: input.topic,
        outline: planResult.data.outline,
        researchReport: {
          dataPackage: researchResult.data.dataPackage,
          analysis: researchResult.data.analysis,
          insights: researchResult.data.insights,
        },
        blueTeamConfig: this.config.enableBlueTeam ? {
          expertCount: 3,
          questionsPerExpert: 5,
          rounds: this.config.blueTeamRounds,
        } : undefined,
      });

      if (!writerResult.success || !writerResult.data) {
        throw new Error(`Writing failed: ${writerResult.error}`);
      }

      status.documentId = writerResult.data.documentId;
      status.logs.push(`✓ 写作完成: 版本 ${writerResult.data.finalVersion}`);
      if (this.config.enableBlueTeam) {
        const totalQuestions = writerResult.data.blueTeamHistory.reduce((sum, r) => sum + r.questions.length, 0);
        status.logs.push(`  Blue Team: ${writerResult.data.blueTeamHistory.length} 轮审核, ${totalQuestions} 个问题`);
      }
      status.progress = 100;

      // Finalize
      status.status = 'completed';
      status.currentStep = '完成';
      console.log(`[Pipeline ${pipelineId}] Completed successfully`);

    } catch (error) {
      status.status = 'failed';
      const errorMsg = error instanceof Error ? error.message : String(error);
      status.errors.push(errorMsg);
      status.logs.push(`✗ 失败: ${errorMsg}`);
      console.error(`[Pipeline ${pipelineId}] Failed:`, errorMsg);
    }

    return status;
  }

  async importDocumentsToLibrary(documents: Array<{
    content: string;
    source: string;
    sourceUrl?: string;
    publishDate?: Date;
  }>): Promise<{ imported: number; failed: number }> {
    let imported = 0;
    let failed = 0;

    for (const doc of documents) {
      try {
        await this.assetLibrary.importAsset({
          content: doc.content,
          contentType: 'text',
          source: doc.source,
          sourceUrl: doc.sourceUrl,
          publishDate: doc.publishDate,
        });
        imported++;
      } catch (error) {
        console.error(`Failed to import ${doc.source}:`, error);
        failed++;
      }
    }

    return { imported, failed };
  }

  async getPipelineStatus(pipelineId: string): Promise<PipelineStatus | null> {
    // In a real implementation, this would fetch from database
    // For now, return null as we don't persist pipeline status
    return null;
  }

  private async updatePipelineLog(pipelineId: string, status: PipelineStatus): Promise<void> {
    // Persist pipeline status to database for tracking
    // This is a placeholder - in production, you'd save to a pipelines table
  }
}
