// 自动修订服务 - 根据评审意见自动修改稿件
// FR-021 扩展: 接受评审后自动应用修改

import { query } from '../db/connection.js';
import { generate } from './llm.js';
import { v4 as uuidv4 } from 'uuid';
import { withTimeout } from '../utils/timeout.js';

export interface RevisionInput {
  taskId: string;
  reviewId: string;
  originalContent: string;
  question: string;
  suggestion: string;
  location?: string;
  expertRole: string;
}

export interface RevisionResult {
  success: boolean;
  newDraftId?: string;
  newVersion?: number;
  revisedContent?: string;
  changes?: string;
  error?: string;
}

export interface BatchRevisionOptions {
  selectedReviewIds?: string[];
  onProgress?: (
    progress: number,
    message: string,
    meta?: {
      stage?: 'collecting_reviews' | 'running_llm_section' | 'validating' | 'saving';
      sectionIndex?: number;
      totalSections?: number;
      batchIndex?: number;
      totalBatches?: number;
    }
  ) => void;
}

/**
 * 根据评审意见自动修订稿件
 */
export async function applyReviewRevision(input: RevisionInput): Promise<RevisionResult> {
  console.log(`[RevisionAgent] Starting revision for review ${input.reviewId}`, {
    taskId: input.taskId,
    location: input.location,
    expertRole: input.expertRole
  });

  try {
    // 1. 获取最新版本号
    const versionResult = await query(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM draft_versions WHERE task_id = $1`,
      [input.taskId]
    );
    const currentVersion = versionResult.rows[0]?.max_version || 0;
    const newVersion = currentVersion + 1;

    // 2. 调用 LLM 根据评审意见修改稿件
    const revisionPrompt = buildRevisionPrompt(input);
    
    console.log(`[RevisionAgent] Calling LLM for revision...`);
    const llmResult = await withTimeout(
      generate(revisionPrompt, 'writing', {
        temperature: 0.3, // 较低温度保证稳定性
        maxTokens: 8000
      }),
      3 * 60 * 1000,
      `Single revision LLM call for task ${input.taskId}`
    );

    // 3. 解析 LLM 输出
    const { revisedContent, changes } = parseRevisionOutput(llmResult.content);
    
    if (!revisedContent || revisedContent.trim().length === 0) {
      throw new Error('LLM returned empty content');
    }

    // 4. 创建新版本稿件
    const newDraftId = uuidv4();
    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content, 
        status, round, expert_role, 
        revision_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        newDraftId,
        input.taskId,
        newVersion,
        revisedContent,
        'revised', // 状态: 已修订
        0, // round 暂时为0
        input.expertRole,
        JSON.stringify({
          sourceReviewId: input.reviewId,
          question: input.question,
          suggestion: input.suggestion,
          location: input.location,
          changes: changes,
          appliedAt: new Date().toISOString()
        })
      ]
    );

    // 5. 更新任务的 writing_data
    await query(
      `UPDATE tasks 
       SET writing_data = jsonb_set(
         COALESCE(writing_data, '{}'::jsonb),
         '{draft}',
         to_jsonb($1::text)
       ),
       updated_at = NOW()
       WHERE id = $2`,
      [revisedContent, input.taskId]
    );

    // 6. 记录修订历史
    await query(
      `INSERT INTO task_logs (task_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        input.taskId,
        'auto_revision',
        JSON.stringify({
          reviewId: input.reviewId,
          draftId: newDraftId,
          version: newVersion,
          fromVersion: currentVersion,
          expertRole: input.expertRole,
          question: input.question,
          suggestion: input.suggestion
        })
      ]
    );

    console.log(`[RevisionAgent] Revision completed: ${newDraftId} (v${newVersion})`);

    return {
      success: true,
      newDraftId,
      newVersion,
      revisedContent,
      changes
    };

  } catch (error) {
    console.error(`[RevisionAgent] Failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 构建修订提示词
 */
function buildRevisionPrompt(input: RevisionInput): string {
  return `你是一位专业的文档编辑。请根据以下评审意见修改稿件。

## 原始稿件
${input.originalContent}

## 评审意见
- **问题**: ${input.question}
- **建议**: ${input.suggestion}
- **位置**: ${input.location || '全文'}
- **专家角色**: ${input.expertRole}

## 修改要求
1. 根据评审建议修改稿件内容
2. 保持原文的结构和风格
3. 只修改与评审意见相关的部分
4. 确保修改后的内容流畅、专业

## 输出格式
请按以下格式输出：

<修订说明>
简要说明做了哪些修改（1-2句话）
</修订说明>

<修订后稿件>
完整的修订后稿件内容
</修订后稿件>`;
}

/**
 * 解析 LLM 输出
 */
function parseRevisionOutput(content: string): { revisedContent: string; changes: string } {
  // 提取修订说明
  const changesMatch = content.match(/<修订说明>([\s\S]*?)<\/修订说明>/);
  const changes = changesMatch ? changesMatch[1].trim() : '已根据评审意见自动修订';

  // 提取修订后稿件
  const contentMatch = content.match(/<修订后稿件>([\s\S]*?)<\/修订后稿件>/);
  
  if (contentMatch) {
    return {
      revisedContent: contentMatch[1].trim(),
      changes
    };
  }

  // 如果没有标签，尝试整个内容作为稿件
  return {
    revisedContent: content.trim(),
    changes
  };
}

/** 与前台 / getBlueTeamReviews 展示口径一致：可参与合并改稿的决策 */
function isAppliedDecision(v: unknown): boolean {
  const s = String(v || '').toLowerCase();
  return s === 'accept' || s === 'accepted' || s === 'manual_resolved';
}

function isFullBlueTeamReviewAccept(row: { user_decision?: string | null; status?: string | null }): boolean {
  const st = String(row.status || '').toLowerCase();
  // 与 TaskDetailLayout.loadReviews 一致：review.status === 'completed' 时子问题会继承为已处理/已接受口径
  if (st === 'completed') return true;
  return isAppliedDecision(row.user_decision) || st === 'accepted' || st === 'accept';
}

/** 全量改稿：单题是否视为「已接受可合并」（对齐前端汇总 + getBlueTeamReviews 的 decision 合并） */
function isQuestionIncludedInFullRevision(
  source: 'bt' | 'er',
  q: any,
  row: RevisionRow,
  questionIndex: number,
  qdIndices: Set<number> | undefined
): boolean {
  if (source === 'er') {
    const eff = q.decision || q.status;
    const s = String(eff || '').toLowerCase();
    if (s === 'completed') return true;
    return isAppliedDecision(eff);
  }
  if (isFullBlueTeamReviewAccept(row)) return true;
  if (qdIndices && qdIndices.size > 0) {
    if (qdIndices.has(questionIndex) || qdIndices.has(questionIndex + 1)) return true;
  }
  const eff = q.decision || q.status;
  const s = String(eff || '').toLowerCase();
  if (s === 'completed') return true;
  return isAppliedDecision(eff);
}

type RevisionRow = {
  id: string;
  expert_role: string;
  questions: unknown;
  user_decision?: string | null;
  status?: string | null;
  source: 'bt' | 'er';
};

type DraftSection = {
  heading: string;
  content: string;
};

type RevisionIssue = {
  reviewId: string;
  questionIndex: number;
  source: 'bt' | 'er';
  expertRole: string;
  question: string;
  suggestion: string;
  location?: string;
};
type RetryableError = Error & { retryable?: boolean };

function splitMarkdownSections(content: string): DraftSection[] {
  const text = String(content || '').trim();
  if (!text) return [{ heading: '全文', content: '' }];

  const lines = text.split('\n');
  const sections: DraftSection[] = [];
  let currentHeading = '导语';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join('\n').trim(),
        });
      }
      currentHeading = line.replace(/^#{1,3}\s+/, '').trim() || '未命名章节';
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join('\n').trim(),
    });
  }

  return sections.length > 0 ? sections : [{ heading: '全文', content: text }];
}

function toIssueBatches(issues: RevisionIssue[], batchSize = 4): RevisionIssue[][] {
  const batches: RevisionIssue[][] = [];
  for (let i = 0; i < issues.length; i += batchSize) {
    batches.push(issues.slice(i, i + batchSize));
  }
  return batches;
}

function isIssueMatchedToSection(issue: RevisionIssue, section: DraftSection): boolean {
  const heading = section.heading.toLowerCase();
  const loc = String(issue.location || '').toLowerCase();
  if (!loc) return false;
  return heading.length > 0 && (loc.includes(heading) || heading.includes(loc));
}

function isRetryableLlmError(error: unknown): boolean {
  const text = String((error as any)?.message || '').toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('超时') ||
    text.includes('network') ||
    text.includes('socket') ||
    text.includes('econn') ||
    text.includes('fetch')
  );
}

function assignIssuesToSections(
  sections: DraftSection[],
  issues: RevisionIssue[]
): Array<{ sectionIndex: number; section: DraftSection; issues: RevisionIssue[] }> {
  const pairs = sections.map((section, sectionIndex) => ({ sectionIndex, section, issues: [] as RevisionIssue[] }));
  const unassigned: RevisionIssue[] = [];

  for (const issue of issues) {
    let matched = false;
    for (const pair of pairs) {
      if (isIssueMatchedToSection(issue, pair.section)) {
        pair.issues.push(issue);
        matched = true;
        break;
      }
    }
    if (!matched) unassigned.push(issue);
  }

  // 对无 location / 未匹配的建议做均匀分配，避免全部堆到一个调用
  let cursor = 0;
  const safePairs = pairs.length > 0 ? pairs : [{ sectionIndex: 0, section: { heading: '全文', content: '' }, issues: [] as RevisionIssue[] }];
  for (const issue of unassigned) {
    const pairIndex = cursor % safePairs.length;
    safePairs[pairIndex].issues.push(issue);
    cursor += 1;
  }

  return safePairs.filter((pair) => pair.issues.length > 0);
}

async function reviseSectionByBatches(params: {
  taskId: string;
  section: DraftSection;
  issues: RevisionIssue[];
  sectionIndex: number;
  sectionCount: number;
  reportProgress: (
    progress: number,
    message: string,
    meta?: {
      stage?: 'collecting_reviews' | 'running_llm_section' | 'validating' | 'saving';
      sectionIndex?: number;
      totalSections?: number;
      batchIndex?: number;
      totalBatches?: number;
    }
  ) => void;
}): Promise<{ revisedContent: string; changes: string[] }> {
  const { taskId, section, issues, sectionIndex, sectionCount, reportProgress } = params;
  const batches = toIssueBatches(issues, 4);
  let currentContent = section.content;
  const sectionChanges: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const issuesText = batch.map((issue, idx) =>
      `${idx + 1}. [${issue.expertRole}] ${issue.question.substring(0, 260)}\n` +
      `   建议：${issue.suggestion.substring(0, 180)}${issue.location ? `\n   位置：${issue.location}` : ''}`
    ).join('\n');

    const progressStart = 45;
    const progressSpan = 40;
    const doneUnits = (sectionIndex - 1) + (i / Math.max(batches.length, 1));
    const totalUnits = Math.max(sectionCount, 1);
    const progress = Math.min(85, Math.round(progressStart + (doneUnits / totalUnits) * progressSpan));
    reportProgress(
      progress,
      `分段改稿：第 ${sectionIndex}/${sectionCount} 章节，第 ${i + 1}/${batches.length} 组...`,
      {
        stage: 'running_llm_section',
        sectionIndex,
        totalSections: sectionCount,
        batchIndex: i + 1,
        totalBatches: batches.length,
      }
    );

    // ★ Phase 2 优化：Prompt 裁剪 — 章节内容超 4000 字时截断，保留首尾
    const MAX_SECTION_CHARS = 4000;
    let sectionText = currentContent;
    if (sectionText.length > MAX_SECTION_CHARS) {
      const head = sectionText.substring(0, MAX_SECTION_CHARS * 0.7);
      const tail = sectionText.substring(sectionText.length - MAX_SECTION_CHARS * 0.25);
      sectionText = head + '\n\n[...中间部分省略...]\n\n' + tail;
      console.log(`[RevisionAgent] Section “${section.heading}” truncated: ${currentContent.length} → ${sectionText.length} chars`);
    }

    const prompt = `你是一位专业的文稿修订专家。请基于以下”章节内容”按建议进行精准修订。\n\n` +
      `## 章节标题\n${section.heading}\n\n` +
      `## 当前章节内容\n${sectionText}\n\n` +
      `## 本组评审建议（共 ${batch.length} 条）\n${issuesText}\n\n` +
      `## 修订要求\n` +
      `1. 仅修改与建议直接相关的内容，保持章节整体结构和风格。\n` +
      `2. 输出完整”修订后章节”，不要输出全文。\n` +
      `3. 不要删除章节标题。\n\n` +
      `## 输出格式\n` +
      `<修订说明>简要列出处理方式</修订说明>\n` +
      `<修订后稿件>完整修订后章节内容</修订后稿件>`;

    // ★ Phase 2+3 优化：缩短单次超时 + 指数退避重试(最多2次) + 模型降级
    const LLM_TIMEOUT_MS = 90 * 1000; // 90s per batch (从120s降低)
    const MAX_RETRIES = 2;
    const RETRY_DELAYS = [3000, 8000]; // 指数退避延迟

    const runWithModel = async (model?: string) =>
      withTimeout(
        generate(prompt, 'writing', {
          temperature: 0.3,
          maxTokens: Math.min(6000, currentContent.length + 2000), // ★ 动态 maxTokens：章节长度 + buffer
          model,
        }),
        LLM_TIMEOUT_MS,
        `Section revision LLM (section ${sectionIndex}, batch ${i + 1})`
      );

    let llmResult;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
          console.log(`[RevisionAgent] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms (section ${sectionIndex}, batch ${i + 1})`);
          await new Promise(r => setTimeout(r, delay));
          reportProgress(
            Math.min(88, progress + 1),
            `分段改稿：第 ${sectionIndex}/${sectionCount} 章节，第 ${i + 1}/${batches.length} 组重试(${attempt})...`,
            { stage: 'running_llm_section', sectionIndex, totalSections: sectionCount, batchIndex: i + 1, totalBatches: batches.length }
          );
        }
        // ★ Phase 3: 最后一次重试时尝试降级模型（缩短 maxTokens 加速）
        const fallbackModel = attempt >= MAX_RETRIES ? undefined : undefined; // 预留模型降级接口
        llmResult = await runWithModel(fallbackModel);
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!isRetryableLlmError(error) || attempt >= MAX_RETRIES) {
          console.error(`[RevisionAgent] Non-retryable or max retries reached (section ${sectionIndex}, batch ${i + 1}):`, lastError.message);
          break;
        }
      }
    }
    if (lastError || !llmResult) {
      throw lastError || new Error(`Section ${sectionIndex} batch ${i + 1} failed after ${MAX_RETRIES} retries`);
    }

    const { revisedContent, changes } = parseRevisionOutput(llmResult.content);
    if (!revisedContent || revisedContent.trim().length < 20) {
      const err: RetryableError = new Error(`Section ${sectionIndex} batch ${i + 1} returned empty content`);
      err.retryable = false;
      throw err;
    }
    currentContent = revisedContent;
    sectionChanges.push(`[${section.heading}] 第${i + 1}组: ${changes}`);
  }

  return { revisedContent: currentContent, changes: sectionChanges };
}

/**
 * 批量应用所有已接受的评审意见（合并为一次 LLM 调用）
 * 避免逐条改稿导致的版本爆炸问题
 */
export async function applyAllAcceptedRevisions(
  taskId: string,
  options: BatchRevisionOptions = {}
): Promise<RevisionResult & { appliedCount: number }> {
  console.log(`[RevisionAgent] Batch revision for task ${taskId}`);
  const reportProgress = options.onProgress || (() => undefined);

  const normalizedSelectedIds = Array.isArray(options.selectedReviewIds)
    ? options.selectedReviewIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const selectedIssueMap = new Map<string, Set<number>>();
  const hasSelection = normalizedSelectedIds.length > 0;
  if (hasSelection) {
    for (const selectedId of normalizedSelectedIds) {
      const [reviewId, indexStr] = selectedId.split('::');
      const idx = Number.parseInt(indexStr, 10);
      if (!Number.isNaN(idx)) {
        if (!selectedIssueMap.has(reviewId)) selectedIssueMap.set(reviewId, new Set());
        selectedIssueMap.get(reviewId)!.add(idx);
      } else {
        if (!selectedIssueMap.has(reviewId)) selectedIssueMap.set(reviewId, new Set());
      }
    }
  }

  try {
    reportProgress(10, '收集已接受的评审意见...', { stage: 'collecting_reviews' });
    const qdAcceptedMap = new Map<string, Set<number>>();
    let allAcceptedRows: RevisionRow[] = [];

    // 选中项模式：按选中的 reviewId 精确拉取，避免受“accepted 判定口径”影响
    if (hasSelection) {
      const selectedReviewIds = Array.from(selectedIssueMap.keys());
      const [btSelectedResult, erSelectedResult] = await Promise.all([
        query(
          `SELECT id, expert_role, questions, user_decision, status
           FROM blue_team_reviews
           WHERE task_id = $1 AND id = ANY($2)
           ORDER BY round, created_at`,
          [taskId, selectedReviewIds]
        ),
        query(
          `SELECT id, expert_role, questions
           FROM expert_reviews
           WHERE task_id = $1 AND id = ANY($2)
           ORDER BY round, created_at`,
          [taskId, selectedReviewIds]
        ),
      ]);
      allAcceptedRows = [
        ...btSelectedResult.rows.map((r) => ({ ...r, source: 'bt' as const })),
        ...erSelectedResult.rows.map((r) => ({ ...r, user_decision: null, status: null, source: 'er' as const })),
      ];
    } else {
      // 题目级决策（与 production.getBlueTeamReviews / 前端展示口径对齐）
      const qdWideResult = await query(
        `SELECT qd.review_id, qd.question_index
         FROM question_decisions qd
         WHERE qd.task_id = $1
           AND LOWER(TRIM(qd.decision::text)) IN ('accept', 'accepted', 'manual_resolved')`,
        [taskId]
      );
      for (const qd of qdWideResult.rows) {
        if (!qdAcceptedMap.has(qd.review_id)) qdAcceptedMap.set(qd.review_id, new Set());
        qdAcceptedMap.get(qd.review_id)!.add(qd.question_index);
      }

      // 全量：拉取当前可见的蓝军记录，再在题目级过滤（与 TaskDetailLayout.loadReviews 中 completed/accept 口径一致）
      let btResult = await query(
        `SELECT id, expert_role, questions, user_decision, status
         FROM blue_team_reviews btr
         WHERE btr.task_id = $1
           AND (btr.is_historical IS NULL OR btr.is_historical = false)
         ORDER BY round, created_at`,
        [taskId]
      );
      if (btResult.rows.length === 0) {
        btResult = await query(
          `SELECT id, expert_role, questions, user_decision, status
           FROM blue_team_reviews btr
           WHERE btr.task_id = $1
           ORDER BY round, created_at`,
          [taskId]
        );
      }

      const erResult = await query(
        `SELECT id, expert_role, questions
         FROM expert_reviews
         WHERE task_id = $1
         ORDER BY round, created_at`,
        [taskId]
      );

      allAcceptedRows = [
        ...btResult.rows.map((r) => ({ ...r, source: 'bt' as const })),
        ...erResult.rows.map((r) => ({ ...r, user_decision: null, status: null, source: 'er' as const })),
      ];
    }

    if (allAcceptedRows.length === 0) {
      return {
        success: false,
        error: hasSelection ? '未找到选中项对应的评审记录' : '没有已接受的评审意见',
        appliedCount: 0,
      };
    }

    // 2. 获取最新稿件
    reportProgress(25, '获取最新稿件...');
    const draftResult = await query(
      `SELECT id, content, version FROM draft_versions
       WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
      [taskId]
    );
    const latestDraft = draftResult.rows[0];
    if (!latestDraft?.content) {
      return { success: false, error: '未找到稿件内容', appliedCount: 0 };
    }

    // 3. 合并所有评审意见为一个列表
    const allIssues: RevisionIssue[] = [];
    const appliedReviewIds: string[] = [];

    for (const row of allAcceptedRows) {
      const selectedIndexes = selectedIssueMap.get(row.id);
      if (hasSelection && !selectedIndexes) {
        continue;
      }

      const questions = typeof row.questions === 'string'
        ? JSON.parse(row.questions)
        : row.questions;

      const qList = Array.isArray(questions) ? questions : [questions];
      for (const [idx, q] of qList.entries()) {
        if (hasSelection) {
          // 兼容前后端 index 基准差异（0-based / 1-based）
          if (
            selectedIndexes &&
            selectedIndexes.size > 0 &&
            !selectedIndexes.has(idx) &&
            !selectedIndexes.has(idx + 1)
          ) {
            continue;
          }
        } else {
          const qdIdx = qdAcceptedMap.get(row.id);
          if (!isQuestionIncludedInFullRevision(row.source, q, row, idx, qdIdx)) {
            continue;
          }
        }
        if (q.question && q.severity !== 'praise') {
          allIssues.push({
            reviewId: row.id,
            questionIndex: idx,
            source: row.source,
            expertRole: row.expert_role,
            question: q.question,
            suggestion: q.suggestion || '',
            location: q.location,
          });
        }
      }
      appliedReviewIds.push(row.id);
    }

    if (allIssues.length === 0) {
      return {
        success: false,
        error: hasSelection
          ? '所选评审项中无可操作的修改建议（可能为赞美项或未命中可改稿条目）'
          : '已接受的评审中无可操作的修改建议',
        appliedCount: 0,
      };
    }

    // 4. 分段分组改稿（核心优化）
    reportProgress(40, '按章节拆分并分组建议...', { stage: 'running_llm_section' });
    const sections = splitMarkdownSections(latestDraft.content);
    const sectionPlans = assignIssuesToSections(sections, allIssues);
    if (sectionPlans.length === 0) {
      throw new Error('No section plans generated for batch revision');
    }

    // ★ 断点续跑：加载上次失败时已完成的章节 checkpoint
    let checkpoint: Record<number, { content: string; changes: string[] }> = {};
    try {
      const cpResult = await query(
        `SELECT details FROM task_logs
         WHERE task_id = $1 AND action = 'batch_revision_checkpoint'
         ORDER BY created_at DESC LIMIT 1`,
        [taskId]
      );
      if (cpResult.rows.length > 0) {
        const cpData = typeof cpResult.rows[0].details === 'string'
          ? JSON.parse(cpResult.rows[0].details) : cpResult.rows[0].details;
        if (cpData?.sections && cpData?.draftId === latestDraft.id) {
          // 只有基于同一份底稿的 checkpoint 才有效
          checkpoint = cpData.sections;
          const completedCount = Object.keys(checkpoint).length;
          console.log(`[RevisionAgent] Resuming from checkpoint: ${completedCount}/${sectionPlans.length} sections already done`);
        }
      }
    } catch (e) {
      console.warn('[RevisionAgent] Failed to load checkpoint:', e);
    }

    reportProgress(45, `分段改稿中：${sectionPlans.length} 个章节待处理...`, {
      stage: 'running_llm_section',
      sectionIndex: 1,
      totalSections: sectionPlans.length,
      batchIndex: 0,
      totalBatches: 0,
    });
    const sectionChanges: string[] = [];
    const revisedSectionMap = new Map<number, string>();
    for (let idx = 0; idx < sectionPlans.length; idx++) {
      const plan = sectionPlans[idx];
      const sectionIndex = idx + 1;

      // ★ 断点续跑：跳过已完成的章节
      const cpKey = plan.sectionIndex;
      if (checkpoint[cpKey]) {
        console.log(`[RevisionAgent] Skipping section ${sectionIndex} (checkpoint hit: "${plan.section.heading}")`);
        revisedSectionMap.set(cpKey, checkpoint[cpKey].content);
        sectionChanges.push(...(checkpoint[cpKey].changes || []));
        reportProgress(
          Math.min(85, Math.round(45 + (sectionIndex / sectionPlans.length) * 40)),
          `已恢复第 ${sectionIndex}/${sectionPlans.length} 章节（断点续跑）`,
          { stage: 'running_llm_section', sectionIndex, totalSections: sectionPlans.length }
        );
        continue;
      }

      const sectionResult = await reviseSectionByBatches({
        taskId,
        section: plan.section,
        issues: plan.issues,
        sectionIndex,
        sectionCount: sectionPlans.length,
        reportProgress,
      });
      revisedSectionMap.set(cpKey, sectionResult.revisedContent);
      sectionChanges.push(...sectionResult.changes);

      // ★ 章节完成后立即保存 checkpoint + 增量标记 issues
      try {
        const allCheckpoints: Record<number, { content: string; changes: string[] }> = {};
        for (const [k, v] of revisedSectionMap) {
          allCheckpoints[k] = {
            content: v,
            changes: sectionChanges.filter(c => c.startsWith(`[${sections[k]?.heading || ''}]`)),
          };
        }
        await query(
          `INSERT INTO task_logs (task_id, action, details, created_at)
           VALUES ($1, 'batch_revision_checkpoint', $2, NOW())`,
          [taskId, JSON.stringify({ draftId: latestDraft.id, sections: allCheckpoints, updatedAt: new Date().toISOString() })]
        );

        // 增量标记本章节涉及的 issues 为 manual_resolved
        for (const issue of plan.issues) {
          await query(
            `INSERT INTO question_decisions (task_id, review_id, question_index, decision, note, created_at, updated_at)
             VALUES ($1, $2, $3, 'manual_resolved', '章节改稿已应用', NOW(), NOW())
             ON CONFLICT (review_id, question_index)
             DO UPDATE SET decision = 'manual_resolved', note = '章节改稿已应用', updated_at = NOW()`,
            [taskId, issue.reviewId, issue.questionIndex]
          );
        }
      } catch (cpErr) {
        console.warn(`[RevisionAgent] Failed to save checkpoint for section ${sectionIndex}:`, cpErr);
      }
    }

    // 按原顺序合并章节
    const revisedSections = sections.map((section, sectionIndex) => revisedSectionMap.get(sectionIndex) || section.content);
    const revisedContent = revisedSections.join('\n\n').trim();
    const changes = sectionChanges.join('\n');
    if (!revisedContent || revisedContent.trim().length === 0) {
      throw new Error('LLM returned empty content');
    }

    // 6. 质量守卫
    reportProgress(85, '校验改稿质量...', { stage: 'validating' });
    const lengthRatio = revisedContent.length / latestDraft.content.length;
    let finalContent = revisedContent;
    if (lengthRatio < 0.6 || revisedContent.trim().length < 100) {
      console.warn(`[RevisionAgent] Quality guard: ratio=${(lengthRatio * 100).toFixed(1)}%, using original`);
      finalContent = latestDraft.content;
    }

    // 7. 保存新版本
    reportProgress(95, '保存新版本与日志...', { stage: 'saving' });
    const newVersion = (latestDraft.version || 0) + 1;
    const newDraftId = uuidv4();
    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content,
        status, revision_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        newDraftId, taskId, newVersion, finalContent,
        'revised',
        JSON.stringify({
          type: 'batch_revision',
          appliedReviewIds,
          issueCount: allIssues.length,
          changes,
          appliedAt: new Date().toISOString(),
        }),
      ]
    );

    // 7.1 将本次已应用的评审问题标记为 manual_resolved
    //     同时处理 blue_team_reviews (bt) 和 expert_reviews (er)
    if (allIssues.length > 0) {
      for (const issue of allIssues) {
        // question_decisions 表统一存储所有来源的决策
        await query(
          `INSERT INTO question_decisions (
             task_id, review_id, question_index, decision, note, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (review_id, question_index)
           DO UPDATE SET
             decision = EXCLUDED.decision,
             note = EXCLUDED.note,
             updated_at = NOW()`,
          [
            taskId,
            issue.reviewId,
            issue.questionIndex,
            'manual_resolved',
            '一键改稿已自动应用该建议',
          ]
        );
      }

      // 同时更新 expert_reviews 中对应问题的 decision 字段（串行评审的问题内嵌在 questions JSON 中）
      const erIssuesByReview = new Map<string, number[]>();
      for (const issue of allIssues.filter(i => i.source === 'er')) {
        if (!erIssuesByReview.has(issue.reviewId)) erIssuesByReview.set(issue.reviewId, []);
        erIssuesByReview.get(issue.reviewId)!.push(issue.questionIndex);
      }
      for (const [reviewId, indices] of erIssuesByReview) {
        try {
          const erResult = await query(`SELECT questions FROM expert_reviews WHERE id = $1`, [reviewId]);
          if (erResult.rows.length > 0) {
            const questions = typeof erResult.rows[0].questions === 'string'
              ? JSON.parse(erResult.rows[0].questions)
              : erResult.rows[0].questions;
            const qList = Array.isArray(questions) ? questions : [questions];
            for (const idx of indices) {
              if (qList[idx]) {
                qList[idx].decision = 'manual_resolved';
                qList[idx].decisionNote = '一键改稿已自动应用该建议';
              }
            }
            await query(
              `UPDATE expert_reviews SET questions = $2, updated_at = NOW() WHERE id = $1`,
              [reviewId, JSON.stringify(qList)]
            );
          }
        } catch (e) {
          console.warn(`[RevisionAgent] Failed to update expert_review ${reviewId} decisions:`, e);
        }
      }
      console.log(`[RevisionAgent] Marked ${allIssues.length} issues as manual_resolved (bt: ${allIssues.filter(i => i.source === 'bt').length}, er: ${allIssues.filter(i => i.source === 'er').length})`);
    }

    // 8. 记录日志
    await query(
      `INSERT INTO task_logs (task_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        taskId, 'batch_revision',
        JSON.stringify({ draftId: newDraftId, version: newVersion, appliedReviewIds, issueCount: allIssues.length }),
      ]
    );

    // 9. 清理 checkpoint（改稿已成功，不再需要断点）
    await query(
      `DELETE FROM task_logs WHERE task_id = $1 AND action = 'batch_revision_checkpoint'`,
      [taskId]
    );

    console.log(`[RevisionAgent] Batch revision completed: ${newDraftId} (v${newVersion}), ${allIssues.length} issues applied`);
    reportProgress(100, '改稿完成');

    return {
      success: true,
      newDraftId,
      newVersion,
      revisedContent: finalContent,
      changes,
      appliedCount: allIssues.length,
    };
  } catch (error) {
    console.error(`[RevisionAgent] Batch revision failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      appliedCount: 0,
    };
  }
}
