// Pipeline Service - 内容生产流水线 orchestrator
// 整合: Topic -> Research -> Write -> BlueTeam -> Output

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { generate, generateEmbedding } from './llm.js';
import { BlueTeamAgent } from '../agents/blueTeam.js';
import { ResearchAgent } from '../agents/researcher.js';
import { getLLMRouter } from '../providers/index.js';
import { getWebSearchService } from './webSearch.js';
import { evaluateTopic } from './topicEvaluation.js';
import { analyzeCompetitors } from './competitorAnalysis.js';
import { generateDraftStreaming, DraftProgress } from './streamingDraft.js';
import { withTimeout } from '../utils/timeout.js';

export interface CreateTaskInput {
  topic: string;
  sourceMaterials?: string[];
  targetFormats?: string[];
  context?: string;
  searchConfig?: {
    maxSearchUrls?: number;
    enableWebSearch?: boolean;
    searchQueries?: string[];
  };
  workspaceId?: string;
}

export class PipelineService {
  private blueTeamAgent: BlueTeamAgent;
  private researchAgent: ResearchAgent;

  constructor() {
    this.blueTeamAgent = new BlueTeamAgent();
    this.researchAgent = new ResearchAgent(getLLMRouter());
  }

  // Step 1: 创建任务并生成大纲
  async createTask(input: CreateTaskInput) {
    const taskId = `task_${uuidv4().slice(0, 8)}`;

    // 并行执行：生成大纲 + 选题评估 + 竞品分析
    const [outline, evaluation, competitorAnalysis] = await Promise.all([
      this.generateOutline(input.topic, input.context),
      evaluateTopic({ topic: input.topic, context: input.context }),
      analyzeCompetitors(input.topic, input.context)
    ]);

    // 创建任务 - 状态为 outline_pending，等待用户确认
    // workspace_id 显式传入；不传时由表的 DEFAULT (default workspace) 兜底
    if (input.workspaceId) {
      await query(
        `INSERT INTO tasks (id, topic, source_materials, target_formats, status, progress, outline, search_config, evaluation, competitor_analysis, workspace_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [
          taskId,
          input.topic,
          JSON.stringify(input.sourceMaterials || []),
          JSON.stringify(input.targetFormats || ['markdown']),
          'outline_pending',
          10,
          JSON.stringify(outline),
          JSON.stringify(input.searchConfig || { maxSearchUrls: 20, enableWebSearch: true }),
          JSON.stringify(evaluation),
          JSON.stringify(competitorAnalysis),
          input.workspaceId,
        ]
      );
    } else {
      await query(
        `INSERT INTO tasks (id, topic, source_materials, target_formats, status, progress, outline, search_config, evaluation, competitor_analysis, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          taskId,
          input.topic,
          JSON.stringify(input.sourceMaterials || []),
          JSON.stringify(input.targetFormats || ['markdown']),
          'outline_pending',
          10,
          JSON.stringify(outline),
          JSON.stringify(input.searchConfig || { maxSearchUrls: 20, enableWebSearch: true }),
          JSON.stringify(evaluation),
          JSON.stringify(competitorAnalysis),
        ]
      );
    }

    return {
      id: taskId,
      status: 'outline_pending',
      topic: input.topic,
      outline,
      evaluation,
      competitorAnalysis,
      progress: 10,
      message: evaluation.passed
        ? '大纲已生成，请确认后继续'
        : `⚠️ 选题评分 ${evaluation.score} 分，建议调整角度后再继续`
    };
  }

  // 确认大纲并进入研究阶段
  async confirmOutline(taskId: string, updates?: { outline?: any; confirmed?: boolean }) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'outline_pending') {
      throw new Error('Task is not waiting for outline confirmation');
    }

    // 如果用户修改了大纲，更新它
    if (updates?.outline) {
      await query(
        `UPDATE tasks SET outline = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updates.outline), taskId]
      );
    }

    // 更新状态为 pending，准备进入研究阶段
    await query(
      `UPDATE tasks SET status = 'pending', progress = 15, current_stage = 'outline_confirmed', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    // 异步启动研究阶段（带超时控制）
    setImmediate(async () => {
      try {
        await withTimeout(this.research(taskId), 5 * 60 * 1000, `Research for ${taskId}`);
      } catch (error) {
        console.error(`[Pipeline] Research failed/timed out for ${taskId}:`, error);
        await query(
          `UPDATE tasks SET status = 'failed', current_stage = 'research_failed', updated_at = NOW() WHERE id = $1`,
          [taskId]
        );
      }
    });

    return {
      id: taskId,
      status: 'researching',
      message: '大纲已确认，开始研究阶段'
    };
  }

  // 重新生成大纲（用于重做选题策划）
  async regenerateOutline(taskId: string, topic: string, context?: string, comments?: string[]) {
    // 获取任务当前的搜索配置
    const taskResult = await query('SELECT search_config FROM tasks WHERE id = $1', [taskId]);
    const searchConfig = taskResult.rows[0]?.search_config || {};

    // 使用 PlannerAgent 重新生成完整大纲
    const { PlannerAgent } = await import('../agents/planner.js');
    const planner = new PlannerAgent(getLLMRouter());

    const result = await planner.execute({
      topic,
      context,
      targetAudience: '产业研究人员和投资者',
      desiredDepth: 'comprehensive',
      comments,
      existingTaskId: taskId // 传递现有 taskId，避免创建新 task
    });

    if (!result.success) {
      throw new Error(`Planning failed: ${result.error}`);
    }

    // 构建大纲对象
    const outline = {
      title: result.data?.plan?.title || topic,
      sections: result.data?.outline || [],
      knowledgeInsights: result.data?.knowledgeInsights || [],
      novelAngles: result.data?.novelAngles || [],
      dataRequirements: result.data?.dataRequirements || [],
      regeneratedAt: new Date().toISOString()
    };

    return outline;
  }

  // Step 2: 研究阶段
  async research(taskId: string) {
    await this.updateStatus(taskId, 'researching', 20, 'collecting_data');

    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // 解析大纲
    const outline = typeof task.outline === 'string' ? JSON.parse(task.outline) : task.outline;

    // 获取搜索配置
    const searchConfig = task.search_config ?
      (typeof task.search_config === 'string' ? JSON.parse(task.search_config) : task.search_config) :
      { maxSearchUrls: 20, enableWebSearch: true };

    // 使用 ResearchAgent 进行研究（包含网页搜索）
    console.log(`[Pipeline] Starting ResearchAgent for ${taskId}, topic: ${task.topic}, sections: ${(outline?.sections || []).length}, dataReqs: ${(outline?.dataRequirements || []).length}`);
    const researchResult = await this.researchAgent.execute({
      topicId: taskId,
      topic: task.topic,
      outline: outline?.sections || [],
      dataRequirements: outline?.dataRequirements || [],
      searchConfig: {
        maxSearchUrls: searchConfig.maxSearchUrls || 20,
        enableWebSearch: searchConfig.enableWebSearch !== false,
        searchQueries: searchConfig.searchQueries
      }
    });

    if (!researchResult.success) {
      console.error(`[Pipeline] Research failed for ${taskId}:`, researchResult.error, researchResult.logs);
      throw new Error(`Research failed: ${researchResult.error}`);
    }

    // 构建研究数据格式
    const researchData = {
      insights: researchResult.data?.insights || [],
      dataPoints: researchResult.data?.dataPackage || [],
      analysis: researchResult.data?.analysis || {},
      annotations: [],
      blue_team_experts: [],
      searchStats: {
        webSources: researchResult.data?.dataPackage?.filter((d: any) => d.metadata?.isWebSource).length || 0,
        assetSources: researchResult.data?.dataPackage?.filter((d: any) => d.metadata?.type && !d.metadata?.isWebSource).length || 0,
      }
    };

    await query(
      `UPDATE tasks SET research_data = $1, progress = 35, current_stage = 'research_completed', updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(researchData), taskId]
    );

    return researchData;
  }

  // Step 3: 写作阶段（流式分段生成）
  async write(taskId: string, onProgress?: (progress: DraftProgress) => void | Promise<void>) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // 前置条件守卫：确保研究数据充分
    const researchDataRaw = task.research_data
      ? (typeof task.research_data === 'string' ? JSON.parse(task.research_data) : task.research_data)
      : null;
    if (!researchDataRaw || (!researchDataRaw.insights?.length && !researchDataRaw.dataPoints?.length && !researchDataRaw.keyFindings?.length)) {
      throw new Error(`Cannot write: research data insufficient for task ${taskId}. Run research first.`);
    }

    // 前置条件守卫：确保大纲已确认
    if (!task.outline) {
      throw new Error(`Cannot write: outline not confirmed for task ${taskId}.`);
    }

    await this.updateStatus(taskId, 'writing', 40, 'generating_draft');

    const outline = typeof task.outline === 'string' ? JSON.parse(task.outline) : task.outline;
    const researchData = typeof task.research_data === 'string'
      ? JSON.parse(task.research_data)
      : task.research_data;

    // 使用流式生成
    const result = await generateDraftStreaming({
      taskId,
      topic: task.topic,
      outline,
      researchData,
      style: 'formal',
      options: {
        includeContext: true,
        realtimePreview: true,
        saveProgress: true
      }
    }, onProgress || (() => {}));

    await this.updateStatus(taskId, 'writing', 50, 'draft_generated');

    return {
      draftId: result.draftId,
      content: result.content,
      sections: result.sections
    };
  }

  // 传统非流式写作（兼容旧版）
  async writeLegacy(taskId: string) {
    await this.updateStatus(taskId, 'writing', 40, 'generating_draft');

    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    const draft = await this.generateDraft(task.topic, task.outline, task.research_data);

    await query(
      `INSERT INTO draft_versions (id, task_id, version, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), taskId, 1, draft]
    );

    await this.updateStatus(taskId, 'writing', 50, 'draft_generated');

    return draft;
  }

  // Step 4: BlueTeam 评审
  async review(taskId: string, config?: any) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // 获取最新稿件
    const draftResult = await query(
      `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
      [taskId]
    );

    const draft = draftResult.rows[0]?.content;
    if (!draft) throw new Error('No draft found');

    // 前置条件守卫：确保稿件内容充分
    if (draft.trim().length < 100) {
      throw new Error(`Cannot review: draft content too short (${draft.trim().length} chars) for task ${taskId}.`);
    }

    // 执行 BlueTeam 评审（传递配置）
    const result = await this.blueTeamAgent.execute({
      taskId,
      draftContent: draft,
      topic: task.topic,
      outline: task.outline
    }, config);

    if (!result.success) {
      throw new Error(`BlueTeam review failed: ${result.error}`);
    }

    // 保存最终稿件
    await query(
      `INSERT INTO draft_versions (id, task_id, version, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), taskId, 3, result.data!.finalDraft]
    );

    return result.data;
  }

  // Step 5: 人工确认后生成输出
  async generateOutput(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // 质量门控：检查评审报告
    const reviewReport = await query(
      `SELECT decision, final_score, critical_count FROM review_reports
       WHERE task_id = $1 ORDER BY generated_at DESC LIMIT 1`,
      [taskId]
    );

    if (reviewReport.rows.length > 0) {
      const report = reviewReport.rows[0];
      if (report.decision === 'reject') {
        throw new Error(`Quality gate: review decision is 'reject' (score: ${report.final_score}). Cannot generate output.`);
      }
      // 串行评审中，critical_count 是所有轮次累计发现数（已通过修订稿解决），仅当决策为 reject 时阻塞
      if (report.critical_count > 0 && report.decision === 'reject') {
        throw new Error(`Quality gate: ${report.critical_count} critical issues unresolved.`);
      }
      if (report.critical_count > 0) {
        console.warn(`[Pipeline] Quality note: ${report.critical_count} critical findings across review rounds (decision: ${report.decision}, score: ${report.final_score})`);
      }
    }

    // 获取最终稿件
    const draftResult = await query(
      `SELECT id, content, status FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
      [taskId]
    );

    // 状态生命周期检查（仅日志警告，不阻塞旧任务）
    if (reviewReport.rows.length > 0 && draftResult.rows[0]?.status !== 'final') {
      console.warn(`[Pipeline] Draft status is '${draftResult.rows[0]?.status}', expected 'final' for task ${taskId}`);
    }

    const content = draftResult.rows[0]?.content;
    if (!content) throw new Error('No content found');

    // 生成 Markdown 输出
    const outputId = `output_${uuidv4().slice(0, 8)}`;
    await query(
      `INSERT INTO outputs (id, task_id, format, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [outputId, taskId, 'markdown', content]
    );

    // 更新任务状态
    await query(
      `UPDATE tasks SET status = 'completed', progress = 100, current_stage = 'completed', completed_at = NOW(), output_ids = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify([outputId]), taskId]
    );

    return { outputId, format: 'markdown' };
  }

  // 获取任务详情
  async getTask(taskId: string) {
    const result = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    return result.rows[0] || null;
  }

  // 辅助方法
  private async updateStatus(taskId: string, status: string, progress: number, stage: string) {
    await query(
      `UPDATE tasks SET status = $1, progress = $2, current_stage = $3, updated_at = NOW() WHERE id = $4`,
      [status, progress, stage, taskId]
    );
  }

  private async generateOutline(topic: string, context?: string) {
    const prompt = `你是一位资深产业研究专家。请为以下研究话题设计详细大纲，采用"三层穿透"结构。

## 研究话题
${topic}

${context ? `## 背景信息\n${context}` : ''}

## 输出要求
请输出JSON格式：
{
  "title": "报告标题",
  "sections": [
    {
      "title": "章节标题",
      "level": 1,
      "content": "核心要点",
      "subsections": [...]
    }
  ]
}

要求：
1. 包含三层结构：宏观视野、中观解剖、微观行动
2. 每个章节有2-3个子章节
3. 宏观关注政策/趋势，中观关注产业/机制，微观关注案例/建议`;

    try {
      const result = await generate(prompt, 'planning', { temperature: 0.7 });
      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) || result.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (error) {
      console.error('[Pipeline] Failed to generate outline:', error);
    }

    // Fallback
    return {
      title: topic,
      sections: [
        { title: '一、宏观视野', level: 1, content: '政策与趋势分析', subsections: [] },
        { title: '二、中观解剖', level: 1, content: '产业与机制分析', subsections: [] },
        { title: '三、微观行动', level: 1, content: '案例与建议', subsections: [] }
      ]
    };
  }

  private async searchRelevantAssets(topic: string) {
    try {
      // 获取素材并向量化匹配
      const result = await query('SELECT * FROM assets LIMIT 10');
      return result.rows;
    } catch (error) {
      console.error('[Pipeline] Failed to search assets:', error);
      return [];
    }
  }

  private async generateResearchData(topic: string, outline: any, assets: any[]) {
    const prompt = `基于以下研究话题和大纲，生成研究数据摘要。

## 话题
${topic}

## 大纲
${JSON.stringify(outline, null, 2)}

## 参考素材
${assets.map(a => `- ${a.title}: ${a.content?.substring(0, 200)}...`).join('\n')}

请输出JSON格式：
{
  "insights": [
    { "type": "trend", "content": "趋势洞察", "confidence": 0.85 }
  ],
  "dataPoints": [
    { "metric": "指标名", "value": "数值", "source": "来源" }
  ],
  "keyFindings": ["发现1", "发现2"]
}`;

    try {
      const result = await generate(prompt, 'analysis', { temperature: 0.5 });
      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) || result.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (error) {
      console.error('[Pipeline] Failed to generate research data:', error);
    }

    return { insights: [], dataPoints: [], keyFindings: [] };
  }

  private async generateDraft(topic: string, outline: any, researchData: any) {
    const prompt = `你是一位资深财经产业研究撰稿人。请基于以下信息撰写深度研究报告。

## 研究话题
${topic}

## 大纲结构
${JSON.stringify(outline, null, 2)}

## 研究数据
${JSON.stringify(researchData, null, 2)}

## 写作要求
1. 采用"三层穿透"结构：宏观视野 → 中观解剖 → 微观行动
2. 每个观点必须有数据支撑
3. 语言专业、客观、有洞察力
4. 包含：执行摘要、宏观视野、中观解剖、微观行动、风险提示
5. 总字数5000-8000字

请直接输出完整的报告正文（Markdown格式）。`;

    const result = await generate(prompt, 'writing', {
      temperature: 0.7,
      maxTokens: 8000
    });

    return result.content;
  }
}
