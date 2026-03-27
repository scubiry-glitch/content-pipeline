// Streaming Draft Generation Service
// 流式文稿生成服务 - 支持分段生成、上下文传递、实时进度推送

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
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
): Promise<{ draftId: string; content: string; sections: DraftSection[]; structureReport?: StructureReport }> {
  const { taskId, topic, outline, researchData, style = 'formal', options = {} } = config;
  const { includeContext = true, saveProgress = true } = options;

  console.log(`[StreamingDraft] Starting streaming generation for task ${taskId}`);

  // 1. 解析大纲
  const flatOutline = flattenOutline(outline);
  console.log(`[StreamingDraft] Total sections: ${flatOutline.length}`);

  // 2. 准备上下文
  const context = buildGenerationContext(topic, outline, researchData);

  // 3. 初始化进度（支持断点续传）
  let startIndex = 0;
  let accumulatedContent = '';
  const sections: DraftSection[] = flatOutline.map(node => ({
    id: uuidv4(),
    outlineNodeId: node.id || uuidv4(),
    title: node.title,
    level: node.level || 1,
    content: '',
    wordCount: 0,
    sources: [],
    status: 'pending' as const
  }));

  // 检查是否有可恢复的进度
  const existingProgress = await getDraftProgress(taskId);
  if (existingProgress && existingProgress.status === 'processing' && existingProgress.sections?.length > 0) {
    const doneSections = existingProgress.sections.filter((s: any) => s.status === 'done');
    if (doneSections.length > 0) {
      startIndex = doneSections.length;
      accumulatedContent = existingProgress.accumulatedContent || '';
      // 恢复已完成段落的状态
      for (let j = 0; j < startIndex && j < sections.length; j++) {
        sections[j].status = 'done';
        sections[j].wordCount = existingProgress.sections[j]?.wordCount || 0;
      }
      console.log(`[StreamingDraft] Resuming from section ${startIndex}/${flatOutline.length}`);
    }
  }

  const estimatedTotalWordCount = estimateTotalWordCount(flatOutline);

  // 4. 串行生成段落（从 startIndex 开始支持续传）
  for (let i = startIndex; i < flatOutline.length; i++) {
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

      // 4.4.1 字数校验 + 单次重试
      const validated = await validateSectionWordCount(section, node);
      if (validated !== section.content) {
        section.content = validated;
        section.wordCount = countWords(validated);
      }

      section.status = 'done';

      // 4.5 更新累计内容
      const sectionMarkdown = `${'#'.repeat(node.level || 1)} ${section.title}\n\n${section.content}\n\n`;
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
      // 保存失败进度，支持后续续传
      if (saveProgress) {
        await saveDraftProgress({
          taskId,
          sections,
          accumulatedContent,
          progress: i / flatOutline.length,
          status: 'error'
        });
      }
      throw error;
    }
  }

  // 5. 生成标题和摘要
  const title = `# ${topic}\n\n`;
  const summary = await generateSummary(topic, sections);

  // 6. 组装原始内容
  const rawContent = `${title}${summary}\n${accumulatedContent}`;

  // 7. 先保存初始版本（status='draft'）
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
      rawContent,
      JSON.stringify(sections),
      countWords(rawContent)
    ]
  );

  // 7.5 润色阶段（status: draft → polishing → draft）
  await query(`UPDATE draft_versions SET status = 'polishing' WHERE id = $1`, [draftId]);
  console.log(`[StreamingDraft] Starting content polishing for ${taskId}...`);
  const finalContent = await polishContent(topic, rawContent);
  console.log(`[StreamingDraft] Polishing completed: ${countWords(rawContent)} → ${countWords(finalContent)} words`);
  await query(
    `UPDATE draft_versions SET status = 'draft', content = $2, word_count = $3 WHERE id = $1`,
    [draftId, finalContent, countWords(finalContent)]
  );

  // 7.6 结构完整性校验
  const structureReport = validateStructureCompleteness(flatOutline, finalContent);
  if (structureReport.missingHeadings.length > 0) {
    console.warn(`[StreamingDraft] ⚠️ Structure completeness check FAILED for ${taskId}:`);
    console.warn(`  Expected ${structureReport.expectedCount} headings, found ${structureReport.foundCount}`);
    console.warn(`  Missing headings: ${structureReport.missingHeadings.join(', ')}`);
    // 将校验结果存入 draft_versions 的 metadata
    await query(
      `UPDATE draft_versions SET sections = $2 WHERE id = $1`,
      [draftId, JSON.stringify({
        ...JSON.parse(JSON.stringify(sections)),
        _structureCheck: structureReport
      })]
    );
  } else {
    console.log(`[StreamingDraft] ✅ Structure check passed: ${structureReport.foundCount}/${structureReport.expectedCount} headings present`);
  }

  // 8. 清理进度记录
  await query(
    `DELETE FROM draft_generation_progress WHERE task_id = $1`,
    [taskId]
  );

  console.log(`[StreamingDraft] Generation completed: ${draftId}`);

  return {
    draftId,
    content: finalContent,
    sections,
    structureReport
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

  const llmRouter = getLLMRouter();
  const result = await llmRouter.generate(prompt, 'writing', {
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
    const llmRouter = getLLMRouter();
    const result = await llmRouter.generate(prompt, 'writing', { temperature: 0.5, maxTokens: 500 });
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
 * 结构完整性校验 — 对比大纲节点 vs 生成内容中的标题
 * 检查是否有大纲段落在生成过程中丢失
 */
interface StructureReport {
  expectedCount: number;
  foundCount: number;
  missingHeadings: string[];
  extraHeadings: string[];
  coverageRate: number;
}

function validateStructureCompleteness(flatOutline: any[], content: string): StructureReport {
  // 提取大纲中所有预期的标题
  const expectedTitles = flatOutline.map(node => ({
    title: (node.title || '').trim(),
    level: node.level || 1
  })).filter(n => n.title);

  // 提取内容中实际生成的标题
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const actualHeadings: { title: string; level: number }[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    actualHeadings.push({
      level: match[1].length,
      title: match[2].trim()
    });
  }

  // 模糊匹配：标题可能被润色微调，用包含关系判定
  const foundTitles = new Set<string>();
  const missingHeadings: string[] = [];

  for (const expected of expectedTitles) {
    const normalizedExpected = normalizeTitle(expected.title);
    const found = actualHeadings.some(actual => {
      const normalizedActual = normalizeTitle(actual.title);
      // 完全匹配 或 包含关系（任一方向）
      return normalizedActual === normalizedExpected
        || normalizedActual.includes(normalizedExpected)
        || normalizedExpected.includes(normalizedActual);
    });
    if (found) {
      foundTitles.add(expected.title);
    } else {
      missingHeadings.push(`[${'#'.repeat(expected.level)}] ${expected.title}`);
    }
  }

  // 检查多余标题（内容中有但大纲中没有的）
  const extraHeadings: string[] = [];
  for (const actual of actualHeadings) {
    const normalizedActual = normalizeTitle(actual.title);
    const inOutline = expectedTitles.some(exp => {
      const normalizedExp = normalizeTitle(exp.title);
      return normalizedActual === normalizedExp
        || normalizedActual.includes(normalizedExp)
        || normalizedExp.includes(normalizedActual);
    });
    if (!inOutline) {
      extraHeadings.push(`[${'#'.repeat(actual.level)}] ${actual.title}`);
    }
  }

  const coverageRate = expectedTitles.length > 0
    ? foundTitles.size / expectedTitles.length
    : 1;

  return {
    expectedCount: expectedTitles.length,
    foundCount: foundTitles.size,
    missingHeadings,
    extraHeadings,
    coverageRate
  };
}

/**
 * 标题归一化 — 去除标点、空格差异
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/[\s\u3000]+/g, '')           // 去除空格
    .replace(/[，。、；：！？（）【】""''—·…]/g, '')  // 去除中文标点
    .replace(/[,.;:!?()[\]"'\-]/g, '')     // 去除英文标点
    .toLowerCase();
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

  const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
  if (paragraphs.length <= 2) return content.slice(-maxLength);

  // 30% 给开篇（保留核心论点），70% 给最近内容（保持上下文连贯）
  const openingBudget = Math.floor(maxLength * 0.3);
  const recentBudget = maxLength - openingBudget;

  let opening = '';
  for (const p of paragraphs) {
    if ((opening + p + '\n\n').length > openingBudget) break;
    opening += p + '\n\n';
  }
  if (!opening) opening = paragraphs[0].slice(0, openingBudget) + '...\n\n';

  let recent = '';
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const candidate = paragraphs[i] + '\n\n' + recent;
    if (candidate.length > recentBudget) break;
    recent = candidate;
  }
  if (!recent) {
    recent = content.slice(-recentBudget);
    const nl = recent.indexOf('\n\n');
    if (nl > 0) recent = recent.slice(nl + 2);
  }

  return `${opening.trim()}\n\n[...]\n\n${recent.trim()}`;
}

/**
 * 段落字数校验 + 单次重试
 */
async function validateSectionWordCount(
  section: DraftSection,
  node: any
): Promise<string> {
  const target = node.requiredLength || estimateWordCountForNode(node);
  const ratio = section.wordCount / target;

  if (ratio >= 0.6 && ratio <= 1.5) return section.content;

  console.log(`[StreamingDraft] Section "${section.title}" ${section.wordCount}字，目标${target}字 (${Math.round(ratio * 100)}%)，重试中...`);

  const direction = ratio < 0.6 ? 'expand' : 'condense';
  const prompt = direction === 'expand'
    ? `以下段落过短（当前${section.wordCount}字，目标${target}字）。请扩展补充数据和分析，达到${target}字左右。保持原有观点和风格。\n\n${section.content}`
    : `以下段落过长（当前${section.wordCount}字，目标${target}字）。请精简冗余，保留核心论点和数据，精简到${target}字左右。\n\n${section.content}`;

  try {
    const llmRouter = getLLMRouter();
    const result = await llmRouter.generate(prompt, 'writing', { temperature: 0.5 });
    const adjusted = (result.content || '').trim();
    if (adjusted && adjusted.length > 50) {
      console.log(`[StreamingDraft] Retry result: ${countWords(adjusted)}字`);
      return adjusted;
    }
  } catch (error) {
    console.error(`[StreamingDraft] Word count retry failed for "${section.title}":`, error);
  }

  return section.content;
}

function estimateWordCountForNode(node: any): number {
  const level = node.level || 1;
  return level === 1 ? 800 : level === 2 ? 500 : 300;
}

/**
 * 内容润色 — 语言优化、风格统一、可读性提升
 * 支持分段润色：将长文按一级标题拆分，分段处理后合并
 */
async function polishContent(topic: string, content: string): Promise<string> {
  const CHUNK_CHAR_LIMIT = 12000;

  // 短文直接整体润色
  if (content.length <= CHUNK_CHAR_LIMIT) {
    return polishChunk(topic, content, '完整文稿');
  }

  // 长文：按一级标题 (# ) 拆分为多个 chunk
  console.log(`[StreamingDraft] Content too long (${content.length} chars), splitting into chunks for polishing`);
  const chunks = splitByTopHeadings(content);
  console.log(`[StreamingDraft] Split into ${chunks.length} chunks: ${chunks.map(c => `"${c.title}" (${c.content.length}ch)`).join(', ')}`);

  const polishedChunks: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const label = `第${i + 1}/${chunks.length}段: ${chunk.title}`;
    console.log(`[StreamingDraft] Polishing chunk ${i + 1}/${chunks.length}: "${chunk.title}" (${chunk.content.length} chars)`);

    // 如果单个 chunk 仍然超长，截取但保留完整段落
    let chunkContent = chunk.content;
    if (chunkContent.length > CHUNK_CHAR_LIMIT * 1.5) {
      // 在段落边界截取
      const cutPoint = chunkContent.lastIndexOf('\n\n', CHUNK_CHAR_LIMIT);
      const safeCut = cutPoint > CHUNK_CHAR_LIMIT * 0.5 ? cutPoint : CHUNK_CHAR_LIMIT;
      const remaining = chunkContent.substring(safeCut);
      chunkContent = chunkContent.substring(0, safeCut);
      // 超长段落的剩余部分单独润色
      const polishedMain = await polishChunk(topic, chunkContent, label + '(上)');
      const polishedRest = await polishChunk(topic, remaining, label + '(下)');
      polishedChunks.push(polishedMain + '\n\n' + polishedRest);
    } else {
      polishedChunks.push(await polishChunk(topic, chunkContent, label));
    }
  }

  const finalContent = polishedChunks.join('\n\n');

  // 全局安全校验
  const originalHeadings = (content.match(/^#{1,3}\s+.+$/gm) || []).length;
  const polishedHeadings = (finalContent.match(/^#{1,3}\s+.+$/gm) || []).length;
  if (polishedHeadings < originalHeadings * 0.7) {
    console.warn(`[StreamingDraft] Chunk-polishing lost too many headings (${polishedHeadings}/${originalHeadings}), using original`);
    return content;
  }

  const lengthRatio = finalContent.length / content.length;
  if (lengthRatio < 0.5 || lengthRatio > 1.5) {
    console.warn(`[StreamingDraft] Chunk-polishing length anomaly (ratio: ${lengthRatio.toFixed(2)}), using original`);
    return content;
  }

  console.log(`[StreamingDraft] Chunk-polishing completed: ${content.length} → ${finalContent.length} chars`);
  return finalContent;
}

/**
 * 按一级标题拆分内容为多个 chunk
 */
function splitByTopHeadings(content: string): { title: string; content: string }[] {
  // 匹配一级标题行: "# 标题"
  const h1Regex = /^# .+$/gm;
  const matches: { index: number; title: string }[] = [];
  let match;
  while ((match = h1Regex.exec(content)) !== null) {
    matches.push({ index: match.index, title: match[0].replace(/^#\s+/, '') });
  }

  // 没有一级标题 → 整体返回
  if (matches.length === 0) {
    return [{ title: '全文', content }];
  }

  const chunks: { title: string; content: string }[] = [];

  // 标题前的内容（标题、摘要等）
  if (matches[0].index > 0) {
    const preamble = content.substring(0, matches[0].index).trim();
    if (preamble) {
      chunks.push({ title: '导言与摘要', content: preamble });
    }
  }

  // 按一级标题分段
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : content.length;
    chunks.push({ title: matches[i].title, content: content.substring(start, end).trim() });
  }

  return chunks;
}

/**
 * 润色单个 chunk
 */
async function polishChunk(topic: string, content: string, label: string): Promise<string> {
  const llmRouter = getLLMRouter();
  const prompt = `你是一位资深文稿编辑。请对以下研究报告片段进行润色，不改变核心观点和数据。

## 润色要求
1. 消除口语化表达，统一专业术语
2. 确保语气、人称、时态一致
3. 优化过长句子，改善段落过渡
4. 合并重复论点，删除冗余表达
5. 统一标点、数字格式
6. **保留所有 Markdown 标题（#、##、###）**，不合并不删除

## 原文
${content}

请输出润色后的完整内容（Markdown格式）。仅做语言润色，不增删核心内容：`;

  try {
    const maxTokens = Math.max(10000, Math.ceil(content.length / 2));
    const result = await llmRouter.generate(prompt, 'writing', { temperature: 0.3, maxTokens });
    const polished = (result.content || '').trim();

    // 安全校验
    if (!polished || polished.length < content.length * 0.5 || polished.length > content.length * 1.5) {
      console.warn(`[StreamingDraft] Polish chunk "${label}" length anomaly (${polished.length} vs ${content.length}), using original`);
      return content;
    }
    if (!/^#{1,6}\s/m.test(polished) && /^#{1,6}\s/m.test(content)) {
      console.warn(`[StreamingDraft] Polish chunk "${label}" lost headings, using original`);
      return content;
    }

    return polished;
  } catch (error) {
    console.error(`[StreamingDraft] Polish chunk "${label}" failed, using original:`, error);
    return content;
  }
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
  status?: string;
}) {
  const { taskId, sections, accumulatedContent, progress, status = 'running' } = params;

  try {
    await query(
      `INSERT INTO draft_generation_progress (
        id, task_id, status, current_section_index, total_sections,
        accumulated_content, sections, progress, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (task_id) DO UPDATE SET
        status = EXCLUDED.status,
        current_section_index = EXCLUDED.current_section_index,
        accumulated_content = EXCLUDED.accumulated_content,
        sections = EXCLUDED.sections,
        progress = EXCLUDED.progress,
        updated_at = NOW()`,
      [
        uuidv4(),
        taskId,
        status,
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
