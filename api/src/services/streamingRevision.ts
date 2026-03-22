// Streaming Revision Service - Stage4 蓝军评审后流式修改服务
// 支持流式生成、版本保存、实时进度推送

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { getLLMRouter } from '../providers/index.js';

export interface RevisionSection {
  id: string;
  outlineNodeId: string;
  title: string;
  level: number;
  originalContent: string;
  revisedContent: string;
  revisionNotes: string[];
  wordCount: number;
  status: 'pending' | 'processing' | 'done' | 'error';
}

export interface RevisionProgress {
  currentIndex: number;
  total: number;
  currentTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  revisedWordCount: number;
  totalWordCount: number;
  sections: SectionProgress[];
  currentSection: SectionProgress | null;
  accumulatedContent: string;
  appliedSuggestions: number;
  totalSuggestions: number;
}

export interface SectionProgress {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  wordCount?: number;
  appliedSuggestions?: number;
}

export interface ReviewSuggestion {
  id: string;
  expertName: string;
  expertRole: string;
  question: string;
  suggestion: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  location?: string;
  category?: string;
  status: 'pending' | 'applied' | 'ignored';
}

export interface StreamingRevisionConfig {
  taskId: string;
  draftId: string;
  topic: string;
  outline: any;
  originalContent: string;
  suggestions: ReviewSuggestion[];
  revisionMode?: 'conservative' | 'balanced' | 'aggressive';
  options?: {
    includeContext?: boolean;
    realtimePreview?: boolean;
    saveProgress?: boolean;
    saveVersions?: boolean;
  };
}

export type RevisionProgressCallback = (progress: RevisionProgress) => void | Promise<void>;

/**
 * 流式修订文稿 - 基于评审意见分段修订
 */
export async function reviseDraftStreaming(
  config: StreamingRevisionConfig,
  onProgress: RevisionProgressCallback
): Promise<{
  revisionId: string;
  draftId: string;
  content: string;
  sections: RevisionSection[];
  appliedSuggestions: number;
  version: number;
}> {
  const {
    taskId,
    draftId,
    topic,
    outline,
    originalContent,
    suggestions,
    revisionMode = 'balanced',
    options = {}
  } = config;
  const { includeContext = true, saveProgress = true, saveVersions = true } = options;

  console.log(`[StreamingRevision] Starting streaming revision for task ${taskId}, draft ${draftId}`);
  console.log(`[StreamingRevision] Total suggestions: ${suggestions.length}`);

  // 1. 解析大纲和原文
  const flatOutline = flattenOutline(outline);
  const originalSections = parseOriginalContent(originalContent, flatOutline);
  console.log(`[StreamingRevision] Total sections: ${originalSections.length}`);

  // 2. 将建议按段落分组
  const suggestionsBySection = groupSuggestionsBySection(suggestions, originalSections);

  // 3. 获取新版本号
  const newVersion = await getNextVersionNumber(taskId);

  // 4. 初始化进度
  const sections: RevisionSection[] = originalSections.map((orig, idx) => ({
    id: uuidv4(),
    outlineNodeId: orig.outlineNodeId,
    title: orig.title,
    level: orig.level,
    originalContent: orig.content,
    revisedContent: '',
    revisionNotes: [],
    wordCount: 0,
    status: 'pending'
  }));

  let accumulatedContent = '';
  const totalWordCount = countWords(originalContent);
  let appliedSuggestionsCount = 0;

  // 5. 串行修订段落
  for (let i = 0; i < originalSections.length; i++) {
    const origSection = originalSections[i];
    const section = sections[i];
    const sectionSuggestions = suggestionsBySection.get(origSection.id) || [];

    // 5.1 更新状态为处理中
    section.status = 'processing';

    // 5.2 推送进度 - 开始修订
    const progress: RevisionProgress = {
      currentIndex: i,
      total: originalSections.length,
      currentTitle: origSection.title,
      status: 'processing',
      revisedWordCount: countWords(accumulatedContent),
      totalWordCount,
      sections: sections.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        appliedSuggestions: s.revisionNotes.length
      })),
      currentSection: { id: section.id, title: section.title, status: 'processing' },
      accumulatedContent,
      appliedSuggestions: appliedSuggestionsCount,
      totalSuggestions: suggestions.length
    };
    await onProgress(progress);

    try {
      // 5.3 检查是否需要修订
      if (sectionSuggestions.length === 0) {
        // 无需修订，保留原文
        section.revisedContent = origSection.content;
        section.wordCount = countWords(origSection.content);
        section.status = 'done';
        console.log(`[StreamingRevision] Section ${i + 1}/${originalSections.length} unchanged: ${section.title}`);
      } else {
        // 5.4 修订段落（带上前文上下文）
        const revisedContent = await reviseSectionWithContext({
          section,
          originalContent: origSection.content,
          suggestions: sectionSuggestions,
          accumulatedContent: includeContext ? accumulatedContent : '',
          topic,
          revisionMode
        });

        // 5.5 更新段落内容
        section.revisedContent = revisedContent;
        section.wordCount = countWords(revisedContent);
        section.revisionNotes = sectionSuggestions.map(s => s.suggestion);
        section.status = 'done';
        appliedSuggestionsCount += sectionSuggestions.length;

        console.log(`[StreamingRevision] Section ${i + 1}/${originalSections.length} revised: ${section.title} (${section.wordCount} words, ${sectionSuggestions.length} suggestions applied)`);
      }

      // 5.6 更新累计内容
      const sectionMarkdown = `${'#'.repeat(origSection.level || 1)} ${section.title}\n\n${section.revisedContent}\n\n`;
      accumulatedContent += sectionMarkdown;

      // 5.7 推送进度 - 段落完成
      const completedProgress: RevisionProgress = {
        currentIndex: i + 1,
        total: originalSections.length,
        currentTitle: origSection.title,
        status: i === originalSections.length - 1 ? 'completed' : 'processing',
        revisedWordCount: countWords(accumulatedContent),
        totalWordCount,
        sections: sections.map(s => ({
          id: s.id,
          title: s.title,
          status: s.status,
          wordCount: s.wordCount,
          appliedSuggestions: s.revisionNotes.length
        })),
        currentSection: null,
        accumulatedContent,
        appliedSuggestions: appliedSuggestionsCount,
        totalSuggestions: suggestions.length
      };
      await onProgress(completedProgress);

      // 5.8 保存中间进度
      if (saveProgress) {
        await saveRevisionProgress({
          taskId,
          draftId,
          sections,
          accumulatedContent,
          progress: (i + 1) / originalSections.length,
          appliedSuggestions: appliedSuggestionsCount,
          totalSuggestions: suggestions.length
        });
      }

      // 5.9 保存中间版本（可选）
      if (saveVersions && (i + 1) % 3 === 0) {
        await saveIntermediateVersion({
          taskId,
          draftId,
          version: newVersion,
          subVersion: i + 1,
          content: accumulatedContent,
          sectionsCompleted: i + 1,
          totalSections: originalSections.length
        });
      }

    } catch (error) {
      console.error(`[StreamingRevision] Failed to revise section ${i}:`, error);
      section.status = 'error';
      throw error;
    }
  }

  // 6. 生成修订说明
  const revisionSummary = generateRevisionSummary(suggestions, appliedSuggestionsCount);

  // 7. 组装最终内容
  const title = `# ${topic}\n\n`;
  const finalContent = `${title}${revisionSummary}${accumulatedContent}`;

  // 8. 保存最终版本
  const newDraftId = uuidv4();
  const revisionId = uuidv4();

  await query(
    `INSERT INTO draft_versions (id, task_id, version, status, outline, content, sections, word_count, parent_id, revision_notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      newDraftId,
      taskId,
      newVersion,
      'revised',
      JSON.stringify(outline),
      finalContent,
      JSON.stringify(sections),
      countWords(finalContent),
      draftId, // 父版本ID
      JSON.stringify({
        revisionId,
        appliedSuggestions: appliedSuggestionsCount,
        totalSuggestions: suggestions.length,
        revisionMode,
        appliedAt: new Date().toISOString()
      })
    ]
  );

  // 9. 保存修订记录
  await query(
    `INSERT INTO draft_revisions (id, task_id, draft_id, new_draft_id, version, suggestions_applied, suggestions_total, mode, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      revisionId,
      taskId,
      draftId,
      newDraftId,
      newVersion,
      appliedSuggestionsCount,
      suggestions.length,
      revisionMode
    ]
  );

  // 10. 更新建议状态为已应用
  await updateSuggestionsStatus(suggestions.filter(s => s.status !== 'ignored').map(s => s.id), 'applied');

  // 11. 清理进度记录
  await query(
    `DELETE FROM draft_revision_progress WHERE task_id = $1 AND draft_id = $2`,
    [taskId, draftId]
  );

  console.log(`[StreamingRevision] Revision completed: ${revisionId} -> ${newDraftId} (v${newVersion})`);

  return {
    revisionId,
    draftId: newDraftId,
    content: finalContent,
    sections,
    appliedSuggestions: appliedSuggestionsCount,
    version: newVersion
  };
}

/**
 * 带上下文的段落修订
 */
async function reviseSectionWithContext(params: {
  section: RevisionSection;
  originalContent: string;
  suggestions: ReviewSuggestion[];
  accumulatedContent: string;
  topic: string;
  revisionMode: 'conservative' | 'balanced' | 'aggressive';
}): Promise<string> {
  const { section, originalContent, suggestions, accumulatedContent, topic, revisionMode } = params;

  const llmRouter = getLLMRouter();

  const modeInstructions = {
    conservative: '请尽量保持原文结构和表达，仅修改被明确指出问题的部分',
    balanced: '在保持原文风格的基础上，根据建议进行合理修改',
    aggressive: '根据建议全面优化，可以重构段落结构和表达方式'
  }[revisionMode];

  const previousContext = accumulatedContent
    ? extractKeyContext(accumulatedContent, 1500)
    : '这是文章的第一个段落。';

  const prompt = `
你是一位资深财经产业研究撰稿人，正在根据专家评审意见修订研究报告。

【报告主题】
${topic}

【当前段落】
标题：${section.title}

【原文内容】
${originalContent}

【前文上下文】（已完成修订的内容，用于保持连贯性）
${previousContext}

【评审意见】（请根据以下意见进行修订）
${suggestions.map((s, i) => `
${i + 1}. [${s.expertName} - ${s.severity}]
   问题：${s.question}
   建议：${s.suggestion}
`).join('\n')}

【修订原则】
${modeInstructions}

【修订要求】
1. 针对性修改：逐一回应评审意见中的问题
2. 保持连贯：与前文逻辑连贯，自然过渡
3. 保持风格：维持专业、严谨的财经研究风格
4. 完整性：确保修改后的段落内容完整、论证充分
5. 字数控制：修订后的字数与原文相近（${countWords(originalContent)}字左右）

【输出要求】
- 只输出修订后的段落正文，不要包含标题
- 使用 Markdown 格式
- 不要添加"修订后"、"修改后"等标记

请直接输出修订后的段落正文：
`;

  const response = await llmRouter.generate(prompt, 'writing', {
    maxTokens: Math.max(2000, originalContent.length * 2),
  });

  return response.content.trim();
}

/**
 * 生成修订说明
 */
function generateRevisionSummary(suggestions: ReviewSuggestion[], appliedCount: number): string {
  const highPriority = suggestions.filter(s => s.severity === 'high').length;
  const mediumPriority = suggestions.filter(s => s.severity === 'medium').length;
  const praiseCount = suggestions.filter(s => s.severity === 'praise').length;

  return `## 修订说明

本次修订基于专家评审意见，共处理 ${appliedCount} 条建议：
- 高优先级问题：${highPriority} 条
- 中优先级问题：${mediumPriority} 条
- 肯定与表扬：${praiseCount} 条

---

`;
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
        id: node.id || uuidv4()
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
 * 解析原始内容为段落
 */
function parseOriginalContent(content: string, outline: any[]): any[] {
  const sections: any[] = [];
  const lines = content.split('\n');

  for (const node of outline) {
    // 尝试在内容中找到对应段落
    const titlePattern = new RegExp(`^#{1,6}\\s*${escapeRegex(node.title)}`, 'm');
    const match = content.match(titlePattern);

    if (match) {
      const startIndex = content.indexOf(match[0]);
      const nextTitleMatch = content.slice(startIndex + match[0].length).match(/^#{1,6}\s/m);
      const endIndex = nextTitleMatch
        ? startIndex + match[0].length + content.slice(startIndex + match[0].length).indexOf(nextTitleMatch[0])
        : content.length;

      const sectionContent = content.slice(startIndex, endIndex)
        .replace(titlePattern, '')
        .trim();

      sections.push({
        id: node.id,
        outlineNodeId: node.id,
        title: node.title,
        level: node.level,
        content: sectionContent
      });
    } else {
      // 如果找不到，使用空内容
      sections.push({
        id: node.id,
        outlineNodeId: node.id,
        title: node.title,
        level: node.level,
        content: ''
      });
    }
  }

  return sections;
}

/**
 * 将建议按段落分组
 */
function groupSuggestionsBySection(
  suggestions: ReviewSuggestion[],
  sections: any[]
): Map<string, ReviewSuggestion[]> {
  const map = new Map<string, ReviewSuggestion[]>();

  for (const section of sections) {
    map.set(section.id, []);
  }

  for (const suggestion of suggestions) {
    if (suggestion.status === 'ignored') continue;

    // 尝试根据 location 匹配段落
    let matched = false;
    if (suggestion.location) {
      for (const section of sections) {
        if (suggestion.location.includes(section.title) ||
            section.title.includes(suggestion.location)) {
          map.get(section.id)!.push(suggestion);
          matched = true;
          break;
        }
      }
    }

    // 如果没有匹配到，分配给所有段落（通用建议）
    if (!matched) {
      // 分配给第一个未完成的段落
      for (const section of sections) {
        if (!map.get(section.id)!.some(s => s.id === suggestion.id)) {
          map.get(section.id)!.push(suggestion);
          break;
        }
      }
    }
  }

  return map;
}

/**
 * 获取下一个版本号
 */
async function getNextVersionNumber(taskId: string): Promise<number> {
  const result = await query(
    `SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM draft_versions WHERE task_id = $1`,
    [taskId]
  );
  return result.rows[0]?.next_version || 1;
}

/**
 * 统计字数
 */
function countWords(content: string): number {
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
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
 * 转义正则特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 保存修订进度
 */
async function saveRevisionProgress(params: {
  taskId: string;
  draftId: string;
  sections: RevisionSection[];
  accumulatedContent: string;
  progress: number;
  appliedSuggestions: number;
  totalSuggestions: number;
}) {
  const { taskId, draftId, sections, accumulatedContent, progress, appliedSuggestions, totalSuggestions } = params;

  try {
    await query(
      `INSERT INTO draft_revision_progress (
        id, task_id, draft_id, status, current_section_index, total_sections,
        accumulated_content, sections, progress, applied_suggestions, total_suggestions, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (task_id, draft_id) DO UPDATE SET
        current_section_index = EXCLUDED.current_section_index,
        accumulated_content = EXCLUDED.accumulated_content,
        sections = EXCLUDED.sections,
        progress = EXCLUDED.progress,
        applied_suggestions = EXCLUDED.applied_suggestions,
        total_suggestions = EXCLUDED.total_suggestions,
        updated_at = NOW()`,
      [
        uuidv4(),
        taskId,
        draftId,
        'running',
        sections.filter(s => s.status === 'done').length,
        sections.length,
        accumulatedContent,
        JSON.stringify(sections),
        progress,
        appliedSuggestions,
        totalSuggestions
      ]
    );
  } catch (error) {
    console.error('[StreamingRevision] Failed to save progress:', error);
  }
}

/**
 * 保存中间版本
 */
async function saveIntermediateVersion(params: {
  taskId: string;
  draftId: string;
  version: number;
  subVersion: number;
  content: string;
  sectionsCompleted: number;
  totalSections: number;
}) {
  const { taskId, draftId, version, subVersion, content, sectionsCompleted, totalSections } = params;

  try {
    await query(
      `INSERT INTO draft_intermediate_versions (
        id, task_id, parent_draft_id, version, sub_version, content,
        sections_completed, total_sections, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        uuidv4(),
        taskId,
        draftId,
        version,
        subVersion,
        content,
        sectionsCompleted,
        totalSections
      ]
    );
    console.log(`[StreamingRevision] Saved intermediate version: v${version}.${subVersion}`);
  } catch (error) {
    console.error('[StreamingRevision] Failed to save intermediate version:', error);
  }
}

/**
 * 更新建议状态
 */
async function updateSuggestionsStatus(suggestionIds: string[], status: 'applied' | 'ignored') {
  if (suggestionIds.length === 0) return;

  try {
    await query(
      `UPDATE blue_team_reviews SET status = $1 WHERE id = ANY($2)`,
      [status, suggestionIds]
    );
  } catch (error) {
    console.error('[StreamingRevision] Failed to update suggestions status:', error);
  }
}

/**
 * 查询修订进度
 */
export async function getRevisionProgress(taskId: string, draftId: string): Promise<RevisionProgress | null> {
  const result = await query(
    `SELECT * FROM draft_revision_progress WHERE task_id = $1 AND draft_id = $2`,
    [taskId, draftId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const sections: RevisionSection[] = typeof row.sections === 'string'
    ? JSON.parse(row.sections)
    : row.sections;

  return {
    currentIndex: row.current_section_index,
    total: row.total_sections,
    currentTitle: sections[row.current_section_index]?.title || '',
    status: row.status,
    revisedWordCount: countWords(row.accumulated_content || ''),
    totalWordCount: countWords(row.accumulated_content || '') + 1000, // 估算
    sections: sections.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      wordCount: s.wordCount,
      appliedSuggestions: s.revisionNotes?.length
    })),
    currentSection: sections[row.current_section_index]
      ? {
          id: sections[row.current_section_index].id,
          title: sections[row.current_section_index].title,
          status: sections[row.current_section_index].status
        }
      : null,
    accumulatedContent: row.accumulated_content || '',
    appliedSuggestions: row.applied_suggestions || 0,
    totalSuggestions: row.total_suggestions || 0
  };
}

/**
 * 获取修订历史
 */
export async function getRevisionHistory(taskId: string): Promise<any[]> {
  const result = await query(
    `SELECT dr.*, dv.content, dv.word_count
     FROM draft_revisions dr
     JOIN draft_versions dv ON dr.new_draft_id = dv.id
     WHERE dr.task_id = $1
     ORDER BY dr.created_at DESC`,
    [taskId]
  );

  return result.rows;
}

/**
 * 获取版本对比
 */
export async function getRevisionDiff(oldDraftId: string, newDraftId: string): Promise<{
  oldContent: string;
  newContent: string;
  changes: any[];
}> {
  const result = await query(
    `SELECT id, content FROM draft_versions WHERE id IN ($1, $2)`,
    [oldDraftId, newDraftId]
  );

  const oldDraft = result.rows.find((r: any) => r.id === oldDraftId);
  const newDraft = result.rows.find((r: any) => r.id === newDraftId);

  if (!oldDraft || !newDraft) {
    throw new Error('Draft not found');
  }

  // 简单的行级对比
  const oldLines = oldDraft.content.split('\n');
  const newLines = newDraft.content.split('\n');
  const changes: any[] = [];

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      changes.push({ type: 'added', line: j + 1, content: newLines[j] });
      j++;
    } else if (j >= newLines.length) {
      changes.push({ type: 'removed', line: i + 1, content: oldLines[i] });
      i++;
    } else if (oldLines[i] !== newLines[j]) {
      changes.push({ type: 'modified', oldLine: i + 1, newLine: j + 1, old: oldLines[i], new: newLines[j] });
      i++;
      j++;
    } else {
      i++;
      j++;
    }
  }

  return {
    oldContent: oldDraft.content,
    newContent: newDraft.content,
    changes
  };
}
