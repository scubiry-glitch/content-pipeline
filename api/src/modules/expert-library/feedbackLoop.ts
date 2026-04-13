// Feedback Loop — 反馈收集 + 专家参数校准 + 权重更新
// 功能: 收集反馈 → LLM分析 → 生成建议 → 实际更新权重

import type { ExpertLibraryDeps, ExpertFeedback, CalibrationResult } from './types.js';
import { updateExpertWeights } from './expertProfileDb.js';

/**
 * 提交人工反馈 + 实际业务结果
 */
export async function submitFeedback(
  feedback: Partial<ExpertFeedback> & { expert_id: string; invoke_id: string },
  deps: ExpertLibraryDeps
): Promise<void> {
  await deps.db.query(
    `INSERT INTO expert_feedback (expert_id, invoke_id, human_score, human_notes, actual_outcome, comparison, rubric_scores)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      feedback.expert_id,
      feedback.invoke_id,
      feedback.human_score ?? null,
      feedback.human_notes ?? null,
      feedback.actual_outcome ? JSON.stringify(feedback.actual_outcome) : null,
      feedback.comparison ? JSON.stringify(feedback.comparison) : null,
      feedback.rubric_scores ? JSON.stringify(feedback.rubric_scores) : null,
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
): Promise<{ status: string; suggestions: string[]; dimensionAverages?: Record<string, { avg: number; count: number }> }> {
  // 1. 拉取最近 30 条反馈（Phase 6: 也拉 rubric_scores）
  let feedbackRows: any[] = [];
  try {
    const res = await deps.db.query(
      `SELECT human_score, human_notes, actual_outcome, rubric_scores
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

  // Phase 6: 按维度聚合 rubric_scores
  const dimensionAverages = aggregateRubricScores(feedbackRows);
  const weakDimensions = Object.entries(dimensionAverages)
    .filter(([, v]) => v.count >= 3 && v.avg < 3.0)
    .map(([dim, v]) => `${dim} (${v.avg.toFixed(2)}/5, n=${v.count})`);

  const dimensionSummary = Object.keys(dimensionAverages).length > 0
    ? '\n\n按维度评分:\n' +
      Object.entries(dimensionAverages)
        .map(([dim, v]) => `- ${dim}: ${v.avg.toFixed(2)}/5 (n=${v.count})`)
        .join('\n')
    : '';

  // 2. 用 LLM 分析反馈并生成建议
  const prompt = `你是专家库校准助理。以下是关于专家 ${expert_id} 的近期用户反馈：

平均评分: ${avgScore.toFixed(2)}/5${dimensionSummary}

${weakDimensions.length > 0 ? `持续偏弱的维度: ${weakDimensions.join('、')}\n` : ''}
用户备注:
${notes || '(无文字反馈)'}

请分析反馈，指出需要改进的1-3个具体方向（每条建议50字以内）。
${weakDimensions.length > 0 ? '重点关注上述偏弱维度。' : ''}直接输出建议列表，不要废话。`;

  try {
    const suggestion = await deps.llm.complete(prompt, { temperature: 0.3, maxTokens: 300 });
    const suggestions = suggestion.split('\n').filter(s => s.trim().length > 0).slice(0, 3);
    return { status: 'calibration_completed', suggestions, dimensionAverages };
  } catch {
    return { status: 'llm_unavailable', suggestions: [], dimensionAverages };
  }
}

/**
 * Phase 6: 按维度聚合 rubric_scores
 * 输入：feedback 行数组（含 rubric_scores JSONB 列）
 * 输出：{ dimensionName: { avg, count } }
 */
function aggregateRubricScores(
  rows: Array<{ rubric_scores?: any }>,
): Record<string, { avg: number; count: number }> {
  const sums: Record<string, { sum: number; count: number }> = {};
  for (const row of rows) {
    let scores: Record<string, number> | null = null;
    const raw = row.rubric_scores;
    if (!raw) continue;
    if (typeof raw === 'string') {
      try { scores = JSON.parse(raw); } catch { continue; }
    } else if (typeof raw === 'object' && !Array.isArray(raw)) {
      scores = raw as Record<string, number>;
    }
    if (!scores) continue;
    for (const [dim, val] of Object.entries(scores)) {
      const num = Number(val);
      if (!Number.isFinite(num)) continue;
      if (!sums[dim]) sums[dim] = { sum: 0, count: 0 };
      sums[dim].sum += num;
      sums[dim].count += 1;
    }
  }
  const result: Record<string, { avg: number; count: number }> = {};
  for (const [dim, s] of Object.entries(sums)) {
    result[dim] = { avg: s.sum / s.count, count: s.count };
  }
  return result;
}

/**
 * 应用校准 — 分析反馈后实际更新专家的 EMM 权重
 * 基于 acceptance rate 趋势和用户评分调整 factor_hierarchy
 */
export async function applyCalibration(
  expert_id: string,
  deps: ExpertLibraryDeps
): Promise<CalibrationResult> {
  // 1. 获取反馈数据 (Phase 6: 同时拉 rubric_scores)
  let feedbackRows: any[] = [];
  let currentProfile: any = null;
  try {
    const [fbRes, profileRes] = await Promise.all([
      deps.db.query(
        `SELECT human_score, human_notes, actual_outcome, comparison, rubric_scores
         FROM expert_feedback
         WHERE expert_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [expert_id]
      ),
      deps.db.query(
        `SELECT emm FROM expert_profiles WHERE expert_id = $1`,
        [expert_id]
      ),
    ]);
    feedbackRows = fbRes.rows;
    currentProfile = profileRes.rows[0];
  } catch {
    return { expertId: expert_id, status: 'db_unavailable', suggestions: [] };
  }

  if (feedbackRows.length < 3) {
    return { expertId: expert_id, status: 'no_feedback', suggestions: ['反馈数据不足（至少需要3条）'] };
  }

  const emm = currentProfile?.emm;
  if (!emm?.factor_hierarchy) {
    return { expertId: expert_id, status: 'no_feedback', suggestions: ['专家未配置 EMM 权重'] };
  }

  // 2. 计算反馈统计
  const avgScore = feedbackRows.reduce((sum, r) => sum + (r.human_score || 0), 0) / feedbackRows.length;
  const recentNotes = feedbackRows.map(r => r.human_notes).filter(Boolean).join('\n');

  // Phase 6: 按维度聚合并识别持续偏弱的维度
  const dimensionAverages = aggregateRubricScores(feedbackRows);
  const weakDimensions = Object.entries(dimensionAverages)
    .filter(([, v]) => v.count >= 3 && v.avg < 2.8)
    .map(([dim, v]) => ({ dim, avg: v.avg, count: v.count }));

  // 3. 用 LLM 分析应该如何调整权重
  const currentWeights = emm.factor_hierarchy as Record<string, number>;
  const weightStr = Object.entries(currentWeights)
    .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
    .join(', ');

  const prompt = `你是专家参数校准引擎。根据以下反馈数据，建议如何调整专家 ${expert_id} 的决策因子权重。

当前权重: ${weightStr}
平均评分: ${avgScore.toFixed(2)}/5 (基于 ${feedbackRows.length} 条反馈)
用户反馈摘要:
${recentNotes || '(无文字反馈)'}

规则：
- 权重总和必须为 1.0
- 单次调整幅度不超过 ±0.1
- 评分低时增加"事实准确"相关因子权重
- 评分高时保持当前权重

请输出 JSON 格式: { "factor_name": new_weight, ... }
只输出 JSON，不要其他内容。`;

  let newWeights: Record<string, number> = {};
  let suggestions: string[] = [];

  try {
    const result = await deps.llm.complete(prompt, { temperature: 0.2, maxTokens: 500, responseFormat: 'json' });
    let jsonStr = result.trim();
    const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) jsonStr = match[1].trim();

    const parsed = JSON.parse(jsonStr);
    newWeights = parsed;

    // 4. 验证：限制调整幅度 ±0.1，确保总和为 1
    const clampedWeights: Record<string, number> = {};
    for (const [key, oldVal] of Object.entries(currentWeights)) {
      const newVal = newWeights[key] ?? oldVal;
      const diff = Math.max(-0.1, Math.min(0.1, newVal - oldVal));
      clampedWeights[key] = Math.round((oldVal + diff) * 100) / 100;
    }

    // 归一化到 1.0
    const sum = Object.values(clampedWeights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const key of Object.keys(clampedWeights)) {
        clampedWeights[key] = Math.round((clampedWeights[key] / sum) * 100) / 100;
      }
    }

    // 5. 记录变化
    const weightChanges: Record<string, { before: number; after: number }> = {};
    for (const [key, newVal] of Object.entries(clampedWeights)) {
      const oldVal = currentWeights[key] ?? 0;
      if (Math.abs(newVal - oldVal) > 0.001) {
        weightChanges[key] = { before: oldVal, after: newVal };
        suggestions.push(`${key}: ${(oldVal * 100).toFixed(0)}% → ${(newVal * 100).toFixed(0)}%`);
      }
    }

    // Phase 6: 如果存在持续偏弱的维度，追加建议
    if (weakDimensions.length > 0) {
      for (const w of weakDimensions) {
        suggestions.unshift(
          `⚠️ 维度 "${w.dim}" 持续偏弱: ${w.avg.toFixed(2)}/5 (n=${w.count}) — 建议在 blindSpots.explicitLimitations 声明此局限`,
        );
      }
    }

    if (Object.keys(weightChanges).length === 0 && weakDimensions.length === 0) {
      return { expertId: expert_id, status: 'applied', suggestions: ['权重无需调整，当前状态良好'] };
    }

    // 6. 写入数据库
    if (Object.keys(weightChanges).length > 0) {
      await updateExpertWeights(expert_id, clampedWeights, deps);
    }

    return { expertId: expert_id, status: 'applied', suggestions, weightChanges };
  } catch (err) {
    return { expertId: expert_id, status: 'llm_unavailable', suggestions: ['校准分析失败'] };
  }
}
