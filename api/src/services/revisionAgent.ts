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
 * 批量应用所有已接受的评审意见（合并为一次 LLM 调用）
 * 避免逐条改稿导致的版本爆炸问题
 */
export async function applyAllAcceptedRevisions(
  taskId: string
): Promise<RevisionResult & { appliedCount: number }> {
  console.log(`[RevisionAgent] Batch revision for task ${taskId}`);

  try {
    // 1. 收集所有 accepted 的评审意见
    const acceptedResult = await query(
      `SELECT id, expert_role, questions
       FROM blue_team_reviews
       WHERE task_id = $1
         AND (user_decision = 'accept' OR status = 'accepted')
       ORDER BY round, created_at`,
      [taskId]
    );

    if (acceptedResult.rows.length === 0) {
      return { success: false, error: '没有已接受的评审意见', appliedCount: 0 };
    }

    // 2. 获取最新稿件
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
    const allIssues: Array<{ expertRole: string; question: string; suggestion: string; location?: string }> = [];
    const appliedReviewIds: string[] = [];

    for (const row of acceptedResult.rows) {
      const questions = typeof row.questions === 'string'
        ? JSON.parse(row.questions)
        : row.questions;

      const qList = Array.isArray(questions) ? questions : [questions];
      for (const q of qList) {
        if (q.question && q.severity !== 'praise') {
          allIssues.push({
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
      return { success: false, error: '已接受的评审中无可操作的修改建议', appliedCount: 0 };
    }

    // 4. 构建合并 prompt
    const MAX_CONTENT_CHARS = 15000;
    const contentForPrompt = latestDraft.content.length > MAX_CONTENT_CHARS
      ? latestDraft.content.substring(0, MAX_CONTENT_CHARS) + '\n\n[... 后续内容省略，请保持原文后续部分不变 ...]'
      : latestDraft.content;

    const issuesText = allIssues.map((issue, i) =>
      `${i + 1}. [${issue.expertRole}] ${issue.question.substring(0, 300)}\n   建议：${issue.suggestion.substring(0, 200)}${issue.location ? `\n   位置：${issue.location}` : ''}`
    ).join('\n');

    const prompt = `你是一位专业的文稿修订专家。请根据以下 ${allIssues.length} 条评审意见，对文稿进行**一次性修订**。

## 重要规则
- 输出**完整的修订后文稿**，不能只输出摘要或部分内容
- 修订后文稿的总字数应与原文相当（原文约 ${latestDraft.content.length} 字符）
- 只修改评审意见指出的具体问题，**保留所有未被评审指出的段落和章节**
- 保持原文的 Markdown 标题层级结构

## 当前文稿（完整）

${contentForPrompt}

## 评审意见（共 ${allIssues.length} 条，已全部接受）

${issuesText}

## 修订要求

1. **逐条处理**上述评审意见，将所有修改合并到一份稿件中
2. 修订后文稿字数应≥原文字数的 80%
3. 保持所有 Markdown 标题（#/##/###）不变
4. 输出完整的修订后文稿（Markdown格式）

## 输出格式

<修订说明>
简要列出对每条评审意见的处理方式（1行1条）
</修订说明>

<修订后稿件>
完整的修订后稿件内容
</修订后稿件>`;

    // 5. 调用 LLM
    console.log(`[RevisionAgent] Batch revision: ${allIssues.length} issues, prompt ${prompt.length} chars`);
    const llmResult = await generate(prompt, 'writing', {
      temperature: 0.3,
      maxTokens: 16000,
    });

    const { revisedContent, changes } = parseRevisionOutput(llmResult.content);
    if (!revisedContent || revisedContent.trim().length === 0) {
      throw new Error('LLM returned empty content');
    }

    // 6. 质量守卫
    const lengthRatio = revisedContent.length / latestDraft.content.length;
    let finalContent = revisedContent;
    if (lengthRatio < 0.6 || revisedContent.trim().length < 100) {
      console.warn(`[RevisionAgent] Quality guard: ratio=${(lengthRatio * 100).toFixed(1)}%, using original`);
      finalContent = latestDraft.content;
    }

    // 7. 保存新版本
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

    // 8. 记录日志
    await query(
      `INSERT INTO task_logs (task_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        taskId, 'batch_revision',
        JSON.stringify({ draftId: newDraftId, version: newVersion, appliedReviewIds, issueCount: allIssues.length }),
      ]
    );

    console.log(`[RevisionAgent] Batch revision completed: ${newDraftId} (v${newVersion}), ${allIssues.length} issues applied`);

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
