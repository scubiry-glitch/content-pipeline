// Streaming Outline Generation Service
// 流式大纲生成服务 - Stage1 选题策划阶段的大纲流式生成

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { getLLMRouter } from '../providers/index.js';

// ===== 类型定义 =====

export interface StreamingOutlineConfig {
  taskId: string;
  topic: string;
  context?: string;
  targetAudience?: string;
  desiredDepth?: 'macro' | 'meso' | 'micro' | 'comprehensive';
  knowledgeInsights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
  comments?: string[];
  options?: {
    enableStreaming?: boolean;
    streamInterval?: number;
    includeContext?: boolean;
    saveProgress?: boolean;
  };
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

export interface OutlineSection {
  id: string;
  title: string;
  level: number;
  content: string;
  subsections?: OutlineSection[];
  dataRequirements?: string[];
}

export interface OutlineLayer {
  id: string;
  name: 'macro' | 'meso' | 'micro';
  title: string;
  sections: OutlineSection[];
  status: 'pending' | 'generating' | 'completed' | 'error';
  generatedAt?: Date;
  error?: string;
}

export interface OutlineProgress {
  currentLayer: 'insights' | 'angles' | 'macro' | 'meso' | 'micro' | 'completed' | 'data_requirements';
  layerProgress: {
    macro: number;
    meso: number;
    micro: number;
  };
  status: 'pending' | 'processing' | 'completed' | 'error';
  layers: OutlineLayer[];
  accumulatedOutline: OutlineSection[];
  insights?: KnowledgeInsight[];
  novelAngles?: NovelAngle[];
  dataRequirements?: DataRequirement[];
  error?: string;
}

export interface DataRequirement {
  type: 'government' | 'industry' | 'academic' | 'expert';
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface OutlineGenerationResult {
  outline: OutlineSection[];
  layers: OutlineLayer[];
  dataRequirements: DataRequirement[];
  insights: KnowledgeInsight[];
  novelAngles: NovelAngle[];
  outlineId: string;
}

export type OutlineProgressCallback = (progress: OutlineProgress) => void | Promise<void>;

// ===== 主服务 =====

export class StreamingOutlineService {
  // 使用 llm.ts 中的 generate 函数

  /**
   * 流式生成大纲 - 分层递进生成，带上下文传递
   */
  async generateOutlineStreaming(
    config: StreamingOutlineConfig,
    onProgress: OutlineProgressCallback
  ): Promise<OutlineGenerationResult> {
    const { taskId, topic, options = {} } = config;
    const { saveProgress = true } = options;

    console.log(`[StreamingOutline] Starting streaming generation for task ${taskId}`);

    try {
      // 1. 并行生成知识洞见和新角度
      await this.pushProgress(onProgress, {
        currentLayer: 'insights',
        layerProgress: { macro: 0, meso: 0, micro: 0 },
        status: 'processing',
        layers: [],
        accumulatedOutline: [],
      });

      const [insights, novelAngles] = await Promise.all([
        config.knowledgeInsights || this.generateKnowledgeInsights(config),
        config.novelAngles || this.generateNovelAngles(config),
      ]);

      console.log(`[StreamingOutline] Generated ${insights.length} insights, ${novelAngles.length} angles`);

      // 2. 初始化三层结构
      const layers: OutlineLayer[] = [
        { id: uuidv4(), name: 'macro', title: '宏观视野层', sections: [], status: 'pending' },
        { id: uuidv4(), name: 'meso', title: '中观解剖层', sections: [], status: 'pending' },
        { id: uuidv4(), name: 'micro', title: '微观行动层', sections: [], status: 'pending' },
      ];

      // 3. 顺序生成各层（带上下文传递）
      let accumulatedContext = '';

      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        layer.status = 'generating';

        // 推送进度 - 开始生成当前层
        await this.pushProgress(onProgress, {
          currentLayer: layer.name,
          layerProgress: this.calculateLayerProgress(layers),
          status: 'processing',
          layers: [...layers],
          accumulatedOutline: this.flattenLayers(layers),
          insights,
          novelAngles,
        });

        try {
          // 生成当前层
          const generatedSections = await this.generateLayerWithContext({
            layer,
            config,
            context: accumulatedContext,
            insights,
            novelAngles,
            previousLayers: layers.slice(0, i),
          });

          layer.sections = generatedSections;
          layer.status = 'completed';
          layer.generatedAt = new Date();

          // 更新累计上下文
          accumulatedContext += this.buildLayerContext(layer);

          console.log(`[StreamingOutline] Layer ${layer.name} completed: ${generatedSections.length} sections`);

          // 推送进度 - 当前层完成
          await this.pushProgress(onProgress, {
            currentLayer: i === layers.length - 1 ? 'completed' : layers[i + 1].name,
            layerProgress: this.calculateLayerProgress(layers),
            status: i === layers.length - 1 ? 'completed' : 'processing',
            layers: [...layers],
            accumulatedOutline: this.flattenLayers(layers),
            insights,
            novelAngles,
          });

          // 保存中间进度
          if (saveProgress) {
            await this.saveOutlineProgress({
              taskId,
              layers,
              currentLayerIndex: i,
              insights,
              novelAngles,
            });
          }
        } catch (error) {
          layer.status = 'error';
          layer.error = error instanceof Error ? error.message : String(error);
          throw error;
        }
      }

      // 4. 生成数据需求
      await this.pushProgress(onProgress, {
        currentLayer: 'data_requirements',
        layerProgress: { macro: 100, meso: 100, micro: 100 },
        status: 'processing',
        layers,
        accumulatedOutline: this.flattenLayers(layers),
        insights,
        novelAngles,
      });

      const dataRequirements = await this.analyzeDataRequirements(
        config,
        this.flattenLayers(layers)
      );

      // 5. 推送最终完成进度
      await this.pushProgress(onProgress, {
        currentLayer: 'completed',
        layerProgress: { macro: 100, meso: 100, micro: 100 },
        status: 'completed',
        layers,
        accumulatedOutline: this.flattenLayers(layers),
        insights,
        novelAngles,
        dataRequirements,
      });

      // 6. 保存最终版本
      const outlineId = await this.saveFinalOutline({
        taskId,
        outline: this.flattenLayers(layers),
        layers,
        dataRequirements,
        insights,
        novelAngles,
      });

      // 7. 清理进度记录
      await this.clearProgress(taskId);

      console.log(`[StreamingOutline] Generation completed: ${outlineId}`);

      return {
        outline: this.flattenLayers(layers),
        layers,
        dataRequirements,
        insights,
        novelAngles,
        outlineId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[StreamingOutline] Generation failed:', error);
      
      await this.pushProgress(onProgress, {
        currentLayer: 'completed',
        layerProgress: { macro: 0, meso: 0, micro: 0 },
        status: 'error',
        layers: [],
        accumulatedOutline: [],
        error: errorMsg,
      });
      
      throw error;
    }
  }

  /**
   * 生成知识洞见
   */
  private async generateKnowledgeInsights(config: StreamingOutlineConfig): Promise<KnowledgeInsight[]> {
    const { topic, context } = config;

    const prompt = `你是一位资深产业研究专家，擅长从历史研究中发现趋势和空白。

## 待研究话题
${topic}

## 背景信息
${context || '无特定背景'}

## 分析任务
请基于你的专业知识，生成3-5个深度洞见，重点关注：

1. **趋势延续 (trend)**: 该话题的持续发展趋势
2. **研究空白 (gap)**: 尚未被充分覆盖的重要角度
3. **观点演变 (historical)**: 该话题的观点如何随时间变化

## 输出格式
请输出JSON数组：
[
  {
    "source": "专业分析",
    "type": "trend|gap|historical",
    "content": "洞见内容，要求具体、可验证",
    "relevance": 0.85
  }
]

要求：
- 每个洞见要有差异化视角，避免泛泛而谈
- 重点关注被忽视的角度和潜在机会`;

    try {
      const result = await getLLMRouter().generate(prompt, 'analysis', {
        temperature: 0.7,
        maxTokens: 2000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 5).map((item: any) => ({
            source: item.source || '专业分析',
            type: item.type || 'trend',
            content: item.content,
            relevance: Math.min(1, Math.max(0, item.relevance || 0.7)),
          }));
        }
      }
    } catch (error) {
      console.warn('[StreamingOutline] Failed to generate knowledge insights:', error);
    }

    return [];
  }

  /**
   * 生成新角度
   */
  private async generateNovelAngles(config: StreamingOutlineConfig): Promise<NovelAngle[]> {
    const { topic, context } = config;

    const prompt = `你是一位富有洞察力的产业研究专家，擅长提出创新性的研究角度。

## 待研究话题
${topic}

## 背景信息
${context || '无特定背景'}

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

    try {
      const result = await getLLMRouter().generate(prompt, 'planning', {
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
      console.warn('[StreamingOutline] Failed to generate novel angles:', error);
    }

    return [];
  }

  /**
   * 带上下文的层生成
   */
  private async generateLayerWithContext(params: {
    layer: OutlineLayer;
    config: StreamingOutlineConfig;
    context: string;
    insights: KnowledgeInsight[];
    novelAngles: NovelAngle[];
    previousLayers?: OutlineLayer[];
  }): Promise<OutlineSection[]> {
    const { layer, config, context, insights, novelAngles, previousLayers } = params;

    // 筛选与当前层相关的洞察和角度
    const relevantInsights = this.filterInsightsByLayer(insights, layer.name);
    const relevantAngles = this.filterAnglesByLayer(novelAngles, layer.name);

    const prompt = this.buildLayerPrompt({
      layer,
      config,
      context,
      insights: relevantInsights,
      angles: relevantAngles,
      previousLayers,
    });

    const result = await getLLMRouter().generate(prompt, 'planning', {
      temperature: 0.7,
      maxTokens: 3000,
    });

    return this.parseAndValidateOutline(result.content);
  }

  /**
   * 构建层生成提示词
   */
  private buildLayerPrompt(params: {
    layer: OutlineLayer;
    config: StreamingOutlineConfig;
    context: string;
    insights: KnowledgeInsight[];
    angles: NovelAngle[];
    previousLayers?: OutlineLayer[];
  }): string {
    const { layer, config, context, insights, angles, previousLayers } = params;
    const { topic, targetAudience, comments } = config;

    const layerGuides: Record<string, { focus: string; requirement: string }> = {
      macro: {
        focus: '政策导向、经济周期、国际比较、宏观趋势',
        requirement: '提供全局视野，建立分析框架',
      },
      meso: {
        focus: '产业链分析、区域差异、商业模式、竞争格局',
        requirement: '承上启下，将宏观趋势落到产业层面',
      },
      micro: {
        focus: '标杆案例、数据验证、行动建议、操作细节',
        requirement: '具体可执行，给出明确建议',
      },
    };

    const guide = layerGuides[layer.name];

    return `
你是一位资深产业研究专家，正在为"${topic}"撰写研究报告大纲。

【当前层级】${layer.title}
${guide.requirement}

【本层关注点】
${guide.focus}

【目标受众】
${targetAudience || '产业研究人员和投资者'}

${previousLayers?.length ? `
【已生成的上层结构】
${previousLayers.map(l => `${l.title}:
${l.sections.map(s => `- ${s.title}`).join('\n')}`).join('\n\n')}
` : ''}

${context ? `
【前文上下文】
${context}
` : ''}

${insights.length ? `
【相关知识洞见】
${insights.map((i, idx) => `${idx + 1}. [${i.type}] ${i.content}`).join('\n')}
` : ''}

${angles.length ? `
【建议采用的新角度】
${angles.map((a, idx) => `${idx + 1}. ${a.angle}: ${a.rationale}`).join('\n')}
` : ''}

${comments?.length ? `
【用户反馈】
${comments.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}
` : ''}

【输出要求】
请生成 ${layer.title} 的章节结构，输出JSON格式：
{
  "sections": [
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
1. 本层生成至少 5 个一级章节（必须覆盖该层的各个关键维度）
2. 每个一级章节包含 2-3 个子章节
3. 必须承接上文逻辑（如有上层结构）
4. 融入相关洞见和新角度
5. 考虑用户反馈进行调整
`;
  }

  /**
   * 解析和验证大纲
   */
  private parseAndValidateOutline(content: string): OutlineSection[] {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      const sections = parsed.sections || parsed;

      if (!Array.isArray(sections)) {
        throw new Error('Invalid outline structure');
      }

      return sections.map((section: any, idx: number) => this.validateSection(section, idx));
    } catch (error) {
      console.error('[StreamingOutline] Failed to parse outline:', error);
      // 返回默认结构
      return [{
        id: uuidv4(),
        title: '默认章节',
        level: 1,
        content: '自动生成',
        subsections: [],
      }];
    }
  }

  /**
   * 验证单个章节
   */
  private validateSection(section: any, idx: number): OutlineSection {
    return {
      id: section.id || uuidv4(),
      title: section.title || `章节 ${idx + 1}`,
      level: section.level || 1,
      content: section.content || '',
      subsections: section.subsections?.map((sub: any, subIdx: number) =>
        this.validateSection(sub, subIdx)
      ) || [],
      dataRequirements: section.dataRequirements || [],
    };
  }

  /**
   * 分析数据需求
   */
  private async analyzeDataRequirements(
    config: StreamingOutlineConfig,
    outline: OutlineSection[]
  ): Promise<DataRequirement[]> {
    const prompt = `基于以下研究大纲，分析每个章节需要的数据类型和来源。

## 话题
${config.topic}

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
      const result = await getLLMRouter().generate(prompt, 'analysis', {
        temperature: 0.5,
        maxTokens: 2000,
      });

      const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       result.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 10).map((item: any) => ({
            type: item.type || 'industry',
            description: item.description,
            priority: item.priority || 'medium',
          }));
        }
      }
    } catch (error) {
      console.warn('[StreamingOutline] Failed to analyze data requirements:', error);
    }

    return [
      { type: 'government', description: '相关政策文件和官方统计数据', priority: 'high' },
      { type: 'industry', description: '行业研究报告和市场数据', priority: 'high' },
      { type: 'academic', description: '学术论文和理论模型', priority: 'medium' },
    ];
  }

  // ===== 辅助方法 =====

  private filterInsightsByLayer(insights: KnowledgeInsight[], layerName: string): KnowledgeInsight[] {
    // 简单的启发式过滤，可以根据实际需求优化
    return insights.slice(0, 3);
  }

  private filterAnglesByLayer(angles: NovelAngle[], layerName: string): NovelAngle[] {
    return angles.slice(0, 2);
  }

  private buildLayerContext(layer: OutlineLayer): string {
    return `
【${layer.title}】
${layer.sections.map(s => `- ${s.title}: ${s.content}`).join('\n')}
`;
  }

  private flattenLayers(layers: OutlineLayer[]): OutlineSection[] {
    return layers.flatMap(layer => layer.sections);
  }

  private calculateLayerProgress(layers: OutlineLayer[]): { macro: number; meso: number; micro: number } {
    const getProgress = (layer: OutlineLayer) => {
      if (layer.status === 'completed') return 100;
      if (layer.status === 'generating') return 50;
      return 0;
    };

    return {
      macro: getProgress(layers.find(l => l.name === 'macro')!),
      meso: getProgress(layers.find(l => l.name === 'meso')!),
      micro: getProgress(layers.find(l => l.name === 'micro')!),
    };
  }

  private async pushProgress(callback: OutlineProgressCallback, progress: OutlineProgress) {
    try {
      await callback(progress);
    } catch (error) {
      console.error('[StreamingOutline] Progress callback error:', error);
    }
  }

  // ===== 数据库存储 =====

  private async saveOutlineProgress(params: {
    taskId: string;
    layers: OutlineLayer[];
    currentLayerIndex: number;
    insights: KnowledgeInsight[];
    novelAngles: NovelAngle[];
  }) {
    const { taskId, layers, currentLayerIndex, insights, novelAngles } = params;

    try {
      await query(
        `INSERT INTO outline_generation_progress (
          task_id, status, current_layer, layers, 
          accumulated_outline, insights, novel_angles, layer_progress, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (task_id) DO UPDATE SET
          status = EXCLUDED.status,
          current_layer = EXCLUDED.current_layer,
          layers = EXCLUDED.layers,
          accumulated_outline = EXCLUDED.accumulated_outline,
          insights = EXCLUDED.insights,
          novel_angles = EXCLUDED.novel_angles,
          layer_progress = EXCLUDED.layer_progress,
          updated_at = NOW()`,
        [
          taskId,
          'running',
          layers[currentLayerIndex]?.name || 'completed',
          JSON.stringify(layers),
          JSON.stringify(this.flattenLayers(layers)),
          JSON.stringify(insights),
          JSON.stringify(novelAngles),
          JSON.stringify(this.calculateLayerProgress(layers)),
        ]
      );
    } catch (error) {
      console.error('[StreamingOutline] Failed to save progress:', error);
    }
  }

  private async saveFinalOutline(params: {
    taskId: string;
    outline: OutlineSection[];
    layers: OutlineLayer[];
    dataRequirements: DataRequirement[];
    insights: KnowledgeInsight[];
    novelAngles: NovelAngle[];
  }): Promise<string> {
    const { taskId, outline, layers, dataRequirements, insights, novelAngles } = params;

    const outlineId = uuidv4();

    // 保存到 outline_versions 表
    await query(
      `INSERT INTO outline_versions (
        id, task_id, version, outline, layers, insights, 
        novel_angles, data_requirements, generation_mode, layer_progress, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        outlineId,
        taskId,
        1,
        JSON.stringify(outline),
        JSON.stringify(layers),
        JSON.stringify(insights),
        JSON.stringify(novelAngles),
        JSON.stringify(dataRequirements),
        'streaming',
        JSON.stringify(this.calculateLayerProgress(layers)),
      ]
    );

    // 更新 tasks 表
    await query(
      `UPDATE tasks 
       SET outline = $1, status = 'outline_pending', progress = 20, updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          sections: outline,
          layers,
          insights,
          novelAngles,
          dataRequirements,
          outlineId,
        }),
        taskId,
      ]
    );

    return outlineId;
  }

  private async clearProgress(taskId: string) {
    try {
      await query(
        `DELETE FROM outline_generation_progress WHERE task_id = $1`,
        [taskId]
      );
    } catch (error) {
      console.error('[StreamingOutline] Failed to clear progress:', error);
    }
  }

  // ===== 公共方法 =====

  /**
   * 查询大纲生成进度
   */
  async getOutlineProgress(taskId: string): Promise<OutlineProgress | null> {
    const result = await query(
      `SELECT * FROM outline_generation_progress WHERE task_id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      currentLayer: row.current_layer,
      layerProgress: row.layer_progress || { macro: 0, meso: 0, micro: 0 },
      status: row.status,
      layers: row.layers || [],
      accumulatedOutline: row.accumulated_outline || [],
      insights: row.insights || [],
      novelAngles: row.novel_angles || [],
    };
  }

  /**
   * 获取大纲版本历史
   */
  async getOutlineVersions(taskId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM outline_versions WHERE task_id = $1 ORDER BY version DESC`,
      [taskId]
    );

    return result.rows.map(row => ({
      id: row.id,
      version: row.version,
      outline: row.outline,
      layers: row.layers,
      insights: row.insights,
      novelAngles: row.novel_angles,
      dataRequirements: row.data_requirements,
      generationMode: row.generation_mode,
      createdAt: row.created_at,
    }));
  }
}

// 单例实例
let streamingOutlineService: StreamingOutlineService | null = null;

export function getStreamingOutlineService(): StreamingOutlineService {
  if (!streamingOutlineService) {
    streamingOutlineService = new StreamingOutlineService();
  }
  return streamingOutlineService;
}
