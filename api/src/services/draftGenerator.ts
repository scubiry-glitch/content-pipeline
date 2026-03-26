// draftGenerator.ts - 最终稿件生成服务

import { query } from '../db/connection.js';
import { generate } from './llm.js';

export interface DraftResult {
  success: boolean;
  draftId?: string;
  content?: string;
  outputPath?: string;
  error?: string;
}

/**
 * 生成最终稿件
 * 基于最新版本和已接受的评审意见生成最终版本
 * 
 * @param selectedReviewIds - 可选，只处理指定的评审意见ID
 */
export async function generateFinalDraft(
  taskId: string,
  selectedReviewIds?: string[],
  force?: boolean,
  mode: 'full' | 'polish' = 'full'
): Promise<DraftResult> {
  console.log(`[DraftGenerator] Generating final draft for task ${taskId}`, { selectedReviewIds, mode });

  try {
    // 1. 获取最新稿件版本
    const draftResult = await query(
      `SELECT id, content, version
       FROM draft_versions
       WHERE task_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [taskId]
    );

    if (draftResult.rows.length === 0) {
      return { success: false, error: 'No draft found for task' };
    }

    const latestDraft = draftResult.rows[0];
    let finalContent = latestDraft.content;

    if (mode === 'polish') {
      // 轻量润色模式：稿件已经过批量改稿，只做最终润色
      console.log(`[DraftGenerator] Polish mode: light editing on already-revised draft`);
      finalContent = await polishDraft(latestDraft.content);
    } else {
      // 完整模式：基于原稿 + 评审意见重新生成
      // 2. 获取已接受的评审意见
      let acceptedReviewsQuery = `
        SELECT id, expert_role, questions, decision_note
        FROM blue_team_reviews
        WHERE task_id = $1 AND user_decision = 'accept'
      `;
      const queryParams: any[] = [taskId];

      if (selectedReviewIds && selectedReviewIds.length > 0) {
        acceptedReviewsQuery += ` AND id = ANY($2)`;
        queryParams.push(selectedReviewIds);
      }

      const acceptedReviews = await query(acceptedReviewsQuery, queryParams);

      // 3. 如果有接受的评审，应用修订
      if (acceptedReviews.rows.length > 0) {
        console.log(`[DraftGenerator] Applying ${acceptedReviews.rows.length} accepted reviews`);

        const acceptedSuggestions = acceptedReviews.rows.flatMap(row => {
          const questions = typeof row.questions === 'string'
            ? JSON.parse(row.questions)
            : row.questions;
          return Array.isArray(questions) ? questions : [questions];
        }).filter((q: any) => q && q.suggestion);

        if (acceptedSuggestions.length > 0) {
          finalContent = await applyRevisionsWithLLM(
            latestDraft.content,
            acceptedSuggestions
          );
        }
      }
    }

    // 4. 保存最终版本
    const newVersion = latestDraft.version + 1;
    const saveResult = await query(
      `INSERT INTO draft_versions (task_id, version, content, change_summary, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [
        taskId,
        newVersion,
        finalContent,
        `Final draft (v${newVersion}) - Finalized with ${acceptedReviews.rows.length} accepted reviews`
      ]
    );

    const finalDraftId = saveResult.rows[0].id;

    console.log(`[DraftGenerator] Final draft created: ${finalDraftId}`);

    return {
      success: true,
      draftId: finalDraftId,
      content: finalContent,
      outputPath: `/api/v1/outputs/${finalDraftId}/download`
    };

  } catch (error) {
    console.error(`[DraftGenerator] Error:`, error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 使用 LLM 应用所有接受的修订
 */
async function applyRevisionsWithLLM(
  originalContent: string,
  suggestions: any[]
): Promise<string> {
  try {
    const suggestionsText = suggestions
      .map((s, i) => `${i + 1}. ${s.question}\n   建议: ${s.suggestion}`)
      .join('\n\n');

    const prompt = `你是一位专业的文稿编辑。请根据以下评审意见，修订原文稿。

原文稿：
${originalContent}

接受的评审意见：
${suggestionsText}

请输出修订后的完整文稿。保持原有结构和风格，只修改评审意见中指出的问题。直接输出修订后的内容，不需要解释。`;

    const response = await generate(prompt, 'blue_team', {
      temperature: 0.3,
      maxTokens: 8000
    });

    return response.content || originalContent;

  } catch (error) {
    console.error('[DraftGenerator] LLM revision failed:', error);
    return originalContent;
  }
}

/**
 * 轻量润色模式：稿件已经过批量改稿，只做语言和格式润色
 */
async function polishDraft(content: string): Promise<string> {
  try {
    const prompt = `你是一位专业的文稿编辑。以下稿件已经过内容修订，请做最终润色：

1. 检查语言流畅度，修正不通顺的表述
2. 统一术语和格式
3. 修正标点符号和排版问题
4. **不要**改变内容实质、删除段落或调整结构

原文稿：
${content}

请直接输出润色后的完整文稿，不需要解释。`;

    const response = await generate(prompt, 'blue_team', {
      temperature: 0.2,
      maxTokens: 16000,
    });

    const polished = response.content;
    // 质量守卫
    if (!polished || polished.length < content.length * 0.7) {
      console.warn('[DraftGenerator] Polish output too short, using original');
      return content;
    }
    return polished;
  } catch (error) {
    console.error('[DraftGenerator] Polish failed:', error);
    return content;
  }
}
