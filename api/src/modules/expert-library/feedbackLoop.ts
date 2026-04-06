// Feedback Loop — 反馈收集 + 专家参数校准
// 源码参考: expert-library-api.zip/api/src/modules/expert-library/feedbackLoop.ts

import type { ExpertLibraryDeps, ExpertFeedback } from './types.js';

/**
 * 提交人工反馈 + 实际业务结果
 */
export async function submitFeedback(
  feedback: Partial<ExpertFeedback> & { expert_id: string; invoke_id: string },
  deps: ExpertLibraryDeps
): Promise<void> {
  await deps.db.query(
    `INSERT INTO expert_feedback (expert_id, invoke_id, human_score, human_notes, actual_outcome, comparison)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      feedback.expert_id,
      feedback.invoke_id,
      feedback.human_score ?? null,
      feedback.human_notes ?? null,
      feedback.actual_outcome ? JSON.stringify(feedback.actual_outcome) : null,
      feedback.comparison ? JSON.stringify(feedback.comparison) : null,
    ]
  );
}

/**
 * 分析近期反馈，生成参数校准建议
 * 用于后台定时任务或手动触发
 */
export async function calibrateExpert(
  expert_id: string,
  deps: ExpertLibraryDeps
): Promise<{ status: string; suggestions: string[] }> {
  // 1. 拉取最近 30 条反馈
  let feedbackRows: any[] = [];
  try {
    const res = await deps.db.query(
      `SELECT human_score, human_notes, actual_outcome
       FROM expert_feedback
       WHERE expert_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [expert_id]
    );
    feedbackRows = res.rows;
  } catch {
    return { status: 'db_unavailable', suggestions: [] };
  }

  if (feedbackRows.length === 0) {
    return { status: 'no_feedback', suggestions: [] };
  }

  const avgScore = feedbackRows.reduce((sum, r) => sum + (r.human_score || 0), 0) / feedbackRows.length;
  const notes = feedbackRows.map(r => r.human_notes).filter(Boolean).join('\n');

  // 2. 用 LLM 分析反馈并生成建议
  const prompt = `你是专家库校准助理。以下是关于专家 ${expert_id} 的近期用户反馈：

平均评分: ${avgScore.toFixed(2)}/5
用户备注:
${notes || '(无文字反馈)'}

请分析反馈，指出需要改进的1-3个具体方向（每条建议50字以内）。直接输出建议列表，不要废话。`;

  try {
    const suggestion = await deps.llm.complete(prompt, { temperature: 0.3, maxTokens: 300 });
    const suggestions = suggestion.split('\n').filter(s => s.trim().length > 0).slice(0, 3);
    return { status: 'calibration_completed', suggestions };
  } catch {
    return { status: 'llm_unavailable', suggestions: [] };
  }
}
