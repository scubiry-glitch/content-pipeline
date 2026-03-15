// Pipeline Service - 内容生产流水线 orchestrator
// 整合: Topic -> Research -> Write -> BlueTeam -> Output

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { generate, generateEmbedding } from './llm.js';
import { BlueTeamAgent } from '../agents/blueTeam.js';

export interface CreateTaskInput {
  topic: string;
  sourceMaterials?: string[];
  targetFormats?: string[];
  context?: string;
}

export class PipelineService {
  private blueTeamAgent: BlueTeamAgent;

  constructor() {
    this.blueTeamAgent = new BlueTeamAgent();
  }

  // Step 1: 创建任务并生成大纲
  async createTask(input: CreateTaskInput) {
    const taskId = `task_${uuidv4().slice(0, 8)}`;

    // 生成大纲
    const outline = await this.generateOutline(input.topic, input.context);

    // 创建任务
    await query(
      `INSERT INTO tasks (id, topic, source_materials, target_formats, status, progress, outline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        taskId,
        input.topic,
        JSON.stringify(input.sourceMaterials || []),
        JSON.stringify(input.targetFormats || ['markdown']),
        'pending',
        5,
        JSON.stringify(outline)
      ]
    );

    return {
      id: taskId,
      status: 'pending',
      topic: input.topic,
      outline,
      progress: 5
    };
  }

  // Step 2: 研究阶段
  async research(taskId: string) {
    await this.updateStatus(taskId, 'researching', 20, 'collecting_data');

    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // 搜索相关素材
    const relevantAssets = await this.searchRelevantAssets(task.topic);

    // 生成研究数据
    const researchData = await this.generateResearchData(task.topic, task.outline, relevantAssets);

    await query(
      `UPDATE tasks SET research_data = $1, progress = 35, current_stage = 'research_completed', updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(researchData), taskId]
    );

    return researchData;
  }

  // Step 3: 写作阶段
  async write(taskId: string) {
    await this.updateStatus(taskId, 'writing', 40, 'generating_draft');

    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    const draft = await this.generateDraft(task.topic, task.outline, task.research_data);

    // 保存初稿
    await query(
      `INSERT INTO draft_versions (id, task_id, version, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), taskId, 1, draft]
    );

    await this.updateStatus(taskId, 'writing', 50, 'draft_generated');

    return draft;
  }

  // Step 4: BlueTeam 评审
  async review(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // 获取最新稿件
    const draftResult = await query(
      `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
      [taskId]
    );

    const draft = draftResult.rows[0]?.content;
    if (!draft) throw new Error('No draft found');

    // 执行 BlueTeam 评审
    const result = await this.blueTeamAgent.execute({
      taskId,
      draftContent: draft,
      topic: task.topic,
      outline: task.outline
    });

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

    // 获取最终稿件
    const draftResult = await query(
      `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
      [taskId]
    );

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
