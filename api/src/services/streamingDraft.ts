// Streaming Draft Generation Service
// 流式文稿生成服务 - 支持分段生成、上下文传递、实时进度推送

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { generate } from './llm.js';
import { getLLMRouter } from '../providers/index.js';

export interface DraftSection {
  id: string;
  outlineNodeId: string;
  title: string;
  level: number;
  content: string;
  wordCount: number;
  sources: string[];
  status: 'pending' | 'processing' | 'done' | 'error';
}

export interface DraftProgress {
  currentIndex: number;
  total: number;
  currentTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  generatedWordCount: number;
  estimatedTotalWordCount: number;
  sections: SectionProgress[];
  currentSection: SectionProgress | null;
  accumulatedContent: string;
}

export interface SectionProgress {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  wordCount?: number;
}

export interface StreamingDraftConfig {
  taskId: string;
  topic: string;
  outline: any;
  researchData: any;
  style?: 'formal' | 'casual' | 'academic';
  tone?: 'professional' | 'friendly' | 'critical';
  options?: {
    includeContext?: boolean;
    realtimePreview?: boolean;
    saveProgress?: boolean;
  };
}

export type ProgressCallback = (progress: DraftProgress) => void | Promise<void>;

/**
 * 流式生成文稿 - 分段生成，带上文上下文
 */
export async function generateDraftStreaming(
  config: StreamingDraftConfig,
  onProgress: ProgressCallback
): Promise<{ draftId: string; content: string; sections: DraftSection[] }> {
  const { taskId, topic, outline, researchData, style = 'formal', options = {} } = config;
  const { includeContext = true, saveProgress = true } = options;

  console.log(`[StreamingDraft] Starting streaming generation for task ${taskId}`);

  // 1. 解析大纲
  const flatOutline = flattenOutline(outline);
  console.log(`[StreamingDraft] Total sections: ${flatOutline.length}`);

  // 2. 准备上下文
  const context = buildGenerationContext(topic, outline, researchData);

  // 3. 初始化进度
  const sections: DraftSection[] = flatOutline.map(node => ({
    id: uuidv4(),
    outlineNodeId: node.id || uuidv4(),
    title: node.title,
    level: node.level || 1,
    content: '',
    wordCount: 0,
    sources: [],
    status: 'pending'
  }));

  let accumulatedContent = '';
  const estimatedTotalWordCount = estimateTotalWordCount(flatOutline);

  // 4. 串行生成段落
  for (let i = 0; i < flatOutline.length; i++) {
    const node = flatOutline[i];
    const section = sections[i];

    // 4.1 更新状态为处理中
    section.status = 'processing';

    // 4.2 推送进度 - 开始生成
    const progress: DraftProgress = {
      currentIndex: i,
      total: flatOutline.length,
      currentTitle: node.title,
      status: 'processing',
      generatedWordCount: countWords(accumulatedContent),
      estimatedTotalWordCount,
      sections: sections.map(s => ({ id: s.id, title: s.title, status: s.status })),
      currentSection: { id: section.id, title: section.title, status: 'processing' },
      accumulatedContent
    };
    await onProgress(progress);

    try {
      // 4.3 生成段落（带上前文上下文）
      const generatedContent = await generateSectionWithContext({
        node,
        section,
        researchData,
        accumulatedContent: includeContext ? accumulatedContent : '',
        context,
        topic,
        style
      });

      // 4.4 更新段落内容
      section.content = generatedContent;
      section.wordCount = countWords(generatedContent);
      section.status = 'done';

      // 4.5 更新累计内容
      const sectionMarkdown = `${'#'.repeat(node.level || 1)} ${section.title}\n\n${generatedContent}\n\n`;
      accumulatedContent += sectionMarkdown;

      console.log(`[StreamingDraft] Section ${i + 1}/${flatOutline.length} completed: ${section.title} (${section.wordCount} words)`);

      // 4.6 推送进度 - 段落完成
      const completedProgress: DraftProgress = {
        currentIndex: i + 1,
        total: flatOutline.length,
        currentTitle: node.title,
        status: i === flatOutline.length - 1 ? 'completed' : 'processing',
        generatedWordCount: countWords(accumulatedContent),
        estimatedTotalWordCount,
        sections: sections.map(s => ({ id: s.id, title: s.title, status: s.status, wordCount: s.wordCount })),
        currentSection: null,
        accumulatedContent
      };
      await onProgress(completedProgress);

      // 4.7 保存中间进度
      if (saveProgress) {
        await saveDraftProgress({
          taskId,
          sections,
          accumulatedContent,
          progress: (i + 1) / flatOutline.length
        });
      }

    } catch (error) {
      console.error(`[StreamingDraft] Failed to generate section ${i}:`, error);
      section.status = 'error';
      throw error;
    }
  }

  // 5. 生成标题和摘要
  const title = `# ${topic}\n\n`;
  const summary = await generateSummary(topic, sections);

  // 6. 组装最终内容
  const finalContent = `${title}${summary}\n${accumulatedContent}`;

  // 7. 保存最终版本
  const draftId = uuidv4();
  await query(
    `INSERT INTO draft_versions (id, task_id, version, status, outline, content, sections, word_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      draftId,
      taskId,
      1,
      'draft',
      JSON.stringify(outline),
      finalContent,
      JSON.stringify(sections),
      countWords(finalContent)
    ]
  );

  // 8. 清理进度记录
  await query(
    `DELETE FROM draft_generation_progress WHERE task_id = $1`,
    [taskId]
  );

  console.log(`[StreamingDraft] Generation completed: ${draftId}`);

  return {
    draftId,
    content: finalContent,
    sections
  };
}

/**
 * 带上下文的段落生成
 */
async function generateSectionWithContext(params: {
  node: any;
  section: DraftSection;
  researchData: any;
  accumulatedContent: string;
  context: GenerationContext;
  topic: string;
  style: string;
}): Promise<string> {
  const { node, section, researchData, accumulatedContent, context, topic, style } = params;

  // 筛选相关数据
  const relevantData = extractRelevantData(researchData, node);
  const relevantInsights = extractRelevantInsights(researchData, node);

  // 构建上下文
  const previousContext = accumulatedContent
    ? extractKeyContext(accumulatedContent, 2000)
    : '这是文章的第一个段落，需要引人入胜的开篇。';

  // 找到相邻段落
  const siblingInfo = findSiblingInfo(node, context.fullOutline);

  const prompt = buildContextualPrompt({
    topic,
    node,
    relevantData,
    relevantInsights,
    previousContext,
    siblingInfo,
    style
  });

  const result = await generate(prompt, 'writing', {
    temperature: 0.7,
    maxTokens: (node.requiredLength || 500) * 2
  });

  return result.content.trim();
}

/**
 * 构建上下文感知的 Prompt
 */
function buildContextualPrompt(params: {
  topic: string;
  node: any;
  relevantData: any[];
  relevantInsights: any[];
  previousContext: string;
  siblingInfo: { previous?: string; next?: string };
  style: string;
}): string {
  const { topic, node, relevantData, relevantInsights, previousContext, siblingInfo, style } = params;

  const styleGuides: Record<string, string> = {
    formal: '语言专业、客观、严谨，适合正式研究报告',
    casual: '语言通俗易懂，适合大众阅读',
    academic: '语言学术化，引用规范，适合学术论文'
  };
  const styleGuide = styleGuides[style] || styleGuides.formal;

  return `
你是一位资深财经产业研究撰稿人，正在撰写关于"${topic}"的深度研究报告。

【当前段落任务】
撰写"${node.title}"部分的内容

【前文上下文】（已完成的内容摘要，用于保持连贯性）
${previousContext}

【段落定位】
- 标题：${node.title}
- 层级：${node.level || 1}级标题
- 建议字数：${node.requiredLength || 500}字
- 前置段落：${siblingInfo.previous || '无（这是第一个段落）'}
- 后置段落：${siblingInfo.next || '无（这是最后一个段落）'}

【相关研究数据】
${relevantData.length > 0
  ? relevantData.map((d, i) => `${i + 1}. [${d.source || 'Unknown'}] ${d.summary || d.content?.substring(0, 200)}...`).join('\n')
  : '暂无特定数据'}

【相关洞察】
${relevantInsights.length > 0
  ? relevantInsights.map((ins, i) => `${i + 1}. [${ins.type || 'Insight'}] ${ins.content}`).join('\n')
  : '暂无特定洞察'}

【写作要求】
1. 承接上文：与前文逻辑连贯，自然过渡
2. 承上启下：${siblingInfo.previous ? '承接前置段落的结论；' : ''}${siblingInfo.next ? '为后续内容做好铺垫；' : ''}
3. 专业深度：数据支撑充分，观点有深度
4. 结构清晰：段落内部层次分明
5. 字数控制：严格控制在${node.requiredLength || 500}字左右
6. 语言风格：${styleGuide}

【输出要求】
- 只输出段落正文内容，不要包含标题
- 使用 Markdown 格式
- 适当使用列表、表格等增强可读性

请直接输出段落正文：
`;
}

/**
 * 生成摘要
 */
async function generateSummary(topic: string, sections: DraftSection[]): Promise<string> {
  const sectionSummaries = sections.map(s => `- ${s.title}: ${s.content.substring(0, 100)}...`).join('\n');

  const prompt = `
请为以下研究报告撰写一段 200 字左右的执行摘要：

报告主题：${topic}

主要章节：
${sectionSummaries}

要求：
1. 概括全文核心观点
2. 突出关键数据支撑
3. 语言精炼专业
4. 控制在 200 字以内

请直接输出摘要内容（不含"执行摘要"标题）：
`;

  try {
    const result = await generate(prompt, 'writing', { temperature: 0.5, maxTokens: 500 });
    return `## 执行摘要\n\n${result.content.trim()}\n\n---\n\n`;
  } catch (error) {
    console.error('[StreamingDraft] Failed to generate summary:', error);
    return `## 执行摘要\n\n关于${topic}的深度研究报告。\n\n---\n\n`;
  }
}

// ==================== 辅助函数 ====================

/**
 * 解析大纲为扁平数组
 */
function flattenOutline(outline: any): any[] {
  const result: any[] = [];

  const traverse = (nodes: any[], level = 1) => {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      if (!node) continue;

      result.push({
        ...node,
        level,
        id: node.id || uuidv4(),
        requiredLength: node.requiredLength || estimateSectionLength(node, level)
      });

      if (node.subsections && node.subsections.length > 0) {
        traverse(node.subsections, level + 1);
      }
    }
  };

  const sections = outline.sections || outline;
  traverse(sections, 1);

  return result;
}

/**
 * 估算段落长度
 */
function estimateSectionLength(node: any, level: number): number {
  if (node.requiredLength) return node.requiredLength;
  if (level === 1) return 800;  // 一级标题 800 字
  if (level === 2) return 500;  // 二级标题 500 字
  return 300;  // 三级标题 300 字
}

/**
 * 估算总字数
 */
function estimateTotalWordCount(outline: any[]): number {
  return outline.reduce((sum, node) => sum + (node.requiredLength || 500), 0);
}

/**
 * 统计字数
 */
function countWords(content: string): number {
  // 中文字符 + 英文单词
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) || [] as string[]).length;
  return chineseChars + englishWords;
}

/**
 * 构建生成上下文
 */
function buildGenerationContext(topic: string, outline: any, researchData: any): GenerationContext {
  return {
    topic,
    outline,
    fullOutline: flattenOutline(outline),
    researchData
  };
}

interface GenerationContext {
  topic: string;
  outline: any;
  fullOutline: any[];
  researchData: any;
}

/**
 * 提取相关数据
 */
function extractRelevantData(researchData: any, node: any): any[] {
  if (!researchData) return [];

  const keywords = extractKeywords(node);
  const dataPoints = researchData.dataPoints || researchData.annotations || [];

  return dataPoints.filter((d: any) => {
    const content = (d.summary || d.content || d.title || '').toLowerCase();
    return keywords.some(k => content.includes(k.toLowerCase()));
  }).slice(0, 5);
}

/**
 * 提取相关洞察
 */
function extractRelevantInsights(researchData: any, node: any): any[] {
  if (!researchData) return [];

  const keywords = extractKeywords(node);
  const insights = researchData.insights || [];

  return insights.filter((i: any) => {
    const content = (i.content || i.title || '').toLowerCase();
    return keywords.some(k => content.includes(k.toLowerCase()));
  }).slice(0, 3);
}

/**
 * 提取关键词
 */
function extractKeywords(node: any): string[] {
  const keywords: string[] = [];

  if (node.title) {
    keywords.push(node.title);
    // 提取标题中的关键词（去除停用词）
    const words = node.title.split(/[\s:：，,]+/);
    keywords.push(...words.filter((w: string) => w.length >= 2));
  }

  if (node.keywords && Array.isArray(node.keywords)) {
    keywords.push(...node.keywords);
  }

  return [...new Set(keywords)];
}

/**
 * 提取关键上下文
 */
function extractKeyContext(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;

  // 提取最后 maxLength 字符，并在段落边界截断
  const truncated = content.slice(-maxLength);
  const firstNewline = truncated.indexOf('\n\n');
  return firstNewline > 0 ? truncated.slice(firstNewline + 2) : truncated.slice(0, 200);
}

/**
 * 找到相邻段落信息
 */
function findSiblingInfo(node: any, fullOutline: any[]): { previous?: string; next?: string } {
  const index = fullOutline.findIndex(n => n.id === node.id || n.title === node.title);

  return {
    previous: index > 0 ? fullOutline[index - 1].title : undefined,
    next: index < fullOutline.length - 1 ? fullOutline[index + 1].title : undefined
  };
}

/**
 * 保存草稿进度
 */
async function saveDraftProgress(params: {
  taskId: string;
  sections: DraftSection[];
  accumulatedContent: string;
  progress: number;
}) {
  const { taskId, sections, accumulatedContent, progress } = params;

  try {
    await query(
      `INSERT INTO draft_generation_progress (
        id, task_id, status, current_section_index, total_sections,
        accumulated_content, sections, progress, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (task_id) DO UPDATE SET
        current_section_index = EXCLUDED.current_section_index,
        accumulated_content = EXCLUDED.accumulated_content,
        sections = EXCLUDED.sections,
        progress = EXCLUDED.progress,
        updated_at = NOW()`,
      [
        uuidv4(),
        taskId,
        'running',
        sections.filter(s => s.status === 'done').length,
        sections.length,
        accumulatedContent,
        JSON.stringify(sections),
        progress
      ]
    );
  } catch (error) {
    console.error('[StreamingDraft] Failed to save progress:', error);
  }
}

/**
 * 查询草稿生成进度
 */
export async function getDraftProgress(taskId: string): Promise<DraftProgress | null> {
  const result = await query(
    `SELECT * FROM draft_generation_progress WHERE task_id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const sections: DraftSection[] = typeof row.sections === 'string'
    ? JSON.parse(row.sections)
    : row.sections;

  return {
    currentIndex: row.current_section_index,
    total: row.total_sections,
    currentTitle: sections[row.current_section_index]?.title || '',
    status: row.status,
    generatedWordCount: countWords(row.accumulated_content || ''),
    estimatedTotalWordCount: estimateTotalWordCount(sections),
    sections: sections.map(s => ({ id: s.id, title: s.title, status: s.status, wordCount: s.wordCount })),
    currentSection: sections[row.current_section_index]
      ? { id: sections[row.current_section_index].id, title: sections[row.current_section_index].title, status: sections[row.current_section_index].status }
      : null,
    accumulatedContent: row.accumulated_content || ''
  };
}
