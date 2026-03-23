// 自动修订服务 - 根据评审意见自动修改稿件
// FR-021 扩展: 接受评审后自动应用修改

import { query } from '../db/connection.js';
import { generate } from './llm.js';
import { v4 as uuidv4 } from 'uuid';

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
    const llmResult = await generate(revisionPrompt, 'writing', {
      temperature: 0.3, // 较低温度保证稳定性
      maxTokens: 8000
    });

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

/**
 * 批量应用多个评审意见的修订
 */
export async function applyBatchRevisions(
  taskId: string,
  reviewIds: string[]
): Promise<RevisionResult[]> {
  const results: RevisionResult[] = [];

  for (const reviewId of reviewIds) {
    // 获取评审详情
    const reviewResult = await query(
      `SELECT 
        btr.id as review_id,
        btr.task_id,
        btr.expert_role,
        btr.questions,
        btr.status,
        dv.content as current_content
       FROM blue_team_reviews btr
       LEFT JOIN draft_versions dv ON dv.task_id = btr.task_id
       WHERE btr.id = $1 
       AND btr.task_id = $2
       ORDER BY dv.version DESC
       LIMIT 1`,
      [reviewId, taskId]
    );

    if (reviewResult.rows.length === 0) {
      results.push({ success: false, error: `Review ${reviewId} not found` });
      continue;
    }

    const row = reviewResult.rows[0];
    const questions = typeof row.questions === 'string' 
      ? JSON.parse(row.questions) 
      : row.questions;

    // 对每个 question 应用修订（简化版：只处理第一个）
    const firstQuestion = Array.isArray(questions) ? questions[0] : questions;
    
    if (!firstQuestion) {
      results.push({ success: false, error: `No questions found in review ${reviewId}` });
      continue;
    }

    const result = await applyReviewRevision({
      taskId,
      reviewId,
      originalContent: row.current_content || '',
      question: firstQuestion.question,
      suggestion: firstQuestion.suggestion,
      location: firstQuestion.location,
      expertRole: row.expert_role
    });

    results.push(result);
  }

  return results;
}
