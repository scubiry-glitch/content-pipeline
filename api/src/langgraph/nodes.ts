// LangGraph Node Functions
// 包装现有 Agent，适配 LangGraph state 接口
// 不修改任何现有 Agent 代码

import { interrupt } from '@langchain/langgraph';
import { PipelineStateType, NODE_NAMES } from './state.js';
import { PlannerAgent } from '../agents/planner.js';
import { ResearchAgent } from '../agents/researcher.js';
import { getLLMRouter } from '../providers/index.js';
import { evaluateTopic } from '../services/topicEvaluation.js';
import { analyzeCompetitors } from '../services/competitorAnalysis.js';
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Planner Node — 选题策划 + 大纲生成
 * 包装: PlannerAgent.execute() + evaluateTopic() + analyzeCompetitors()
 */
export async function plannerNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:planner] Starting planning for: ${state.topic}`);

  const llmRouter = getLLMRouter();
  const planner = new PlannerAgent(llmRouter);

  // 先确定 taskId，传给 PlannerAgent 避免它再创建重复 task
  const taskId = state.taskId || `task_${uuidv4().slice(0, 8)}`;

  // 并行执行: 大纲生成 + 选题评估 + 竞品分析
  const [planResult, evaluation, competitorAnalysis] = await Promise.all([
    planner.execute({
      topic: state.topic,
      context: state.context,
      comments: state.outlineFeedback ? [state.outlineFeedback] : undefined,
      existingTaskId: taskId, // 传入 taskId，savePlan() 会 UPDATE 而非 INSERT
    }),
    evaluateTopic({ topic: state.topic, context: state.context }),
    analyzeCompetitors(state.topic, state.context),
  ]);

  if (!planResult.success || !planResult.data) {
    return {
      status: 'planning_failed',
      errors: [`Planning failed: ${planResult.error || 'Unknown error'}`],
      currentNode: NODE_NAMES.PLANNER,
    };
  }

  // 统一 outline 格式为 {sections, title, ...}，与旧版系统兼容
  const outlineObj = {
    sections: planResult.data.outline,
    title: planResult.data.plan.title,
    knowledgeInsights: planResult.data.knowledgeInsights || [],
    novelAngles: planResult.data.novelAngles || [],
    dataRequirements: planResult.data.dataRequirements || [],
    generatedAt: new Date().toISOString(),
  };

  // 创建/更新数据库任务记录（plannerAgent.savePlan 可能已 INSERT/UPDATE，这里用 UPSERT 确保完整性）
  await query(
    `INSERT INTO tasks (id, topic, status, progress, outline, evaluation, competitor_analysis, search_config, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       outline = EXCLUDED.outline,
       evaluation = EXCLUDED.evaluation,
       competitor_analysis = EXCLUDED.competitor_analysis,
       status = EXCLUDED.status,
       progress = EXCLUDED.progress,
       updated_at = NOW()`,
    [
      taskId,
      state.topic,
      'outline_pending',
      10,
      JSON.stringify(outlineObj),
      JSON.stringify(evaluation),
      JSON.stringify(competitorAnalysis),
      JSON.stringify(state.searchConfig || {}),
    ]
  );

  return {
    taskId,
    outline: outlineObj,
    evaluation,
    competitorAnalysis,
    status: 'outline_pending',
    progress: 10,
    currentNode: NODE_NAMES.PLANNER,
  };
}

/**
 * Human Outline Review Node — 等待人工确认大纲
 * 使用 LangGraph interrupt() 原语暂停执行
 */
export async function humanOutlineNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:human_outline] Waiting for outline confirmation for task: ${state.taskId}`);

  // interrupt 暂停 graph 执行，等待人工输入
  const humanInput = interrupt({
    type: 'outline_review',
    taskId: state.taskId,
    outline: state.outline,
    evaluation: state.evaluation,
    message: state.evaluation?.passed
      ? '大纲已生成，请确认后继续'
      : `⚠️ 选题评分 ${state.evaluation?.score} 分，建议调整角度后再继续`,
  });

  // humanInput 来自 resume 调用
  const approved = humanInput?.approved ?? false;
  const feedback = humanInput?.feedback;
  const updatedOutline = humanInput?.outline;

  if (approved) {
    await query(
      `UPDATE tasks SET status = 'pending', progress = 15, current_stage = 'outline_confirmed', updated_at = NOW() WHERE id = $1`,
      [state.taskId]
    );
  }

  return {
    outlineApproved: approved,
    outlineFeedback: feedback,
    outline: updatedOutline || state.outline,
    status: approved ? 'outline_confirmed' : 'outline_rejected',
    progress: approved ? 15 : 10,
    currentNode: NODE_NAMES.HUMAN_OUTLINE,
  };
}

/**
 * Researcher Node — 数据研究与分析
 * 包装: ResearchAgent.execute()
 */
export async function researcherNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:researcher] Starting research for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'researching', progress = 30, current_stage = 'researching', updated_at = NOW() WHERE id = $1`,
    [state.taskId]
  );

  const llmRouter = getLLMRouter();
  const researcher = new ResearchAgent(llmRouter);

  const result = await researcher.execute({
    topicId: state.taskId,
    topic: state.topic,
    outline: state.outline?.sections || [],
    dataRequirements: [],
    useAssetLibrary: true,
    searchConfig: state.searchConfig as any,
  });

  if (!result.success || !result.data) {
    return {
      status: 'research_failed',
      progress: 30,
      errors: [`Research failed: ${result.error || 'Unknown error'}`],
      currentNode: NODE_NAMES.RESEARCHER,
    };
  }

  await query(
    `UPDATE tasks SET research_data = $1, progress = 50, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(result.data), state.taskId]
  );

  return {
    researchData: {
      dataPackage: (result.data.dataPackage || []).map((d: any) => ({
        source: d.source || '',
        type: d.metadata?.type || 'unknown',
        content: d.content || '',
        reliability: d.quality,
      })),
      analysis: {
        summary: JSON.stringify(result.data.analysis?.statistics || {}),
        keyFindings: (result.data.analysis?.trends || []).map((t: any) => `${t.metric}: ${t.direction}`),
        gaps: (result.data.coverageReport?.gaps || []).map((g: any) => g.section),
      },
      insights: (result.data.insights || []).map((i: any) => ({
        type: i.type || 'trend',
        content: i.content || '',
        confidence: i.confidence || 0,
      })),
    },
    status: 'researching_complete',
    progress: 50,
    currentNode: NODE_NAMES.RESEARCHER,
  };
}

/**
 * Writer Node — 流式分段生成
 * 接入 streamingDraft.ts，逐章节生成，带上下文传递
 * 如果 streamingDraft 不可用则 fallback 到直接 LLM 调用
 */
export async function writerNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:writer] Starting writing for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'writing', progress = 55, current_stage = 'writing', updated_at = NOW() WHERE id = $1`,
    [state.taskId]
  );

  try {
    let draftContent: string;

    // 优先使用流式分段生成
    try {
      const { generateDraftStreaming } = await import('../services/streamingDraft.js');
      const result = await generateDraftStreaming(
        {
          taskId: state.taskId,
          topic: state.topic,
          outline: state.outline,
          researchData: {
            dataPackage: state.researchData?.dataPackage || [],
            analysis: state.researchData?.analysis,
            insights: state.researchData?.insights || [],
          },
          style: 'formal',
          options: { includeContext: true, saveProgress: true },
        },
        async (progress) => {
          const pct = 55 + Math.floor((progress.currentIndex / Math.max(progress.total, 1)) * 15);
          await query(`UPDATE tasks SET progress = $1, updated_at = NOW() WHERE id = $2`, [pct, state.taskId]);
        }
      );
      draftContent = result.content;
      console.log(`[LangGraph:writer] Streaming draft generated: ${draftContent.length} chars, ${result.sections.length} sections`);
    } catch (streamErr) {
      // Fallback: 直接 LLM 生成
      console.warn(`[LangGraph:writer] streamingDraft unavailable, falling back to direct LLM`, streamErr);
      const llmRouter = getLLMRouter();
      const outlineSections = state.outline?.sections || [];
      const dataPackage = state.researchData?.dataPackage || [];
      const insights = state.researchData?.insights || [];

      const prompt = `你是一位资深产业研究撰稿人。请基于以下信息撰写深度研究报告。

## 研究话题
${state.topic}

## 大纲结构
${outlineSections.map((s: any, i: number) => `${i + 1}. ${s.title}${s.coreQuestion ? ` — ${s.coreQuestion}` : ''}
   分析方法: ${s.analysisApproach || '综合分析'}
   要点: ${s.content || ''}`).join('\n')}

## 研究数据
${dataPackage.slice(0, 15).map((d: any, i: number) => `[${i + 1}] ${d.source || '来源'}: ${(d.content || '').substring(0, 400)}`).join('\n')}

## 关键洞察
${insights.map((ins: any, i: number) => `${i + 1}. [${ins.type}] ${ins.content}`).join('\n')}

## 写作要求
1. 按大纲结构组织，每章回答对应的核心问题
2. 每节遵循 What(现象) → Why(原因) → So What(启示) 叙事链
3. 每个观点必须有数据支撑，标注来源
4. 总字数 5000-8000 字
5. 包含执行摘要和风险提示

请直接输出完整报告正文。`;

      const result = await llmRouter.generate(prompt, 'writing', { temperature: 0.7, maxTokens: 8000 });
      draftContent = result.content || '';
    }

    if (!draftContent || draftContent.trim().length < 100) {
      return {
        status: 'writing_failed',
        progress: 55,
        errors: [`Draft too short (${(draftContent || '').length} chars)`],
        currentNode: NODE_NAMES.WRITER,
      };
    }

    // 双写: tasks + draft_versions
    const draftVersion = (state.currentReviewRound || 0) + 1;
    await Promise.all([
      query(
        `UPDATE tasks SET draft_content = $1, progress = 70, status = 'writing', updated_at = NOW() WHERE id = $2`,
        [draftContent, state.taskId]
      ),
      query(
        `INSERT INTO draft_versions (task_id, version, content, change_summary, status, word_count, round)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (task_id, version) DO UPDATE SET
           content = EXCLUDED.content, change_summary = EXCLUDED.change_summary,
           word_count = EXCLUDED.word_count, status = EXCLUDED.status`,
        [state.taskId, draftVersion, draftContent,
         draftVersion === 1 ? '初稿生成' : `第${draftVersion}版（基于评审修订）`,
         'draft', draftContent.length, state.currentReviewRound || 0]
      ),
    ]);

    return {
      draftContent,
      status: 'writing_complete',
      progress: 70,
      currentNode: NODE_NAMES.WRITER,
    };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LangGraph:writer] Writing failed:`, errorMsg);
    return { status: 'writing_failed', progress: 55, errors: [`Writing failed: ${errorMsg}`], currentNode: NODE_NAMES.WRITER };
  }
}

/**
 * Polish Node — 润色 + 事实核查
 * 接入 draftGenerator.ts (polish 模式) + LLM 事实核查
 */
export async function polishNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:polish] Starting polish + fact-check for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'polishing', progress = 72, current_stage = 'polishing', updated_at = NOW() WHERE id = $1`,
    [state.taskId]
  );

  let polishedContent = state.draftContent || '';

  // Step A: 润色（尝试用 draftGenerator 的 polish 模式）
  try {
    const { generateFinalDraft } = await import('../services/draftGenerator.js');
    const polishResult = await generateFinalDraft(state.taskId, undefined, false, 'polish');
    if (polishResult.success && polishResult.content) {
      polishedContent = polishResult.content;
      console.log(`[LangGraph:polish] Polish completed via draftGenerator`);
    }
  } catch (polishErr) {
    console.warn(`[LangGraph:polish] draftGenerator unavailable, skipping polish step`, polishErr);
  }

  // Step B: 事实核查 — 提取数据点并与研究数据交叉验证
  let factCheckReport: any[] = [];
  try {
    const llmRouter = getLLMRouter();
    const dataPackage = state.researchData?.dataPackage || [];
    const realData = dataPackage.filter((d: any) => !d.metadata?.isMissing);

    if (polishedContent.length > 200 && realData.length > 0) {
      const prompt = `从以下文稿中提取所有数据点（数字、百分比、排名、引用），并检查是否能在研究数据中找到支撑。

## 文稿（前 4000 字）
${polishedContent.substring(0, 4000)}

## 可用研究数据
${realData.slice(0, 10).map((d: any, i: number) => `[${i + 1}] ${d.source}: ${(d.content || '').substring(0, 200)}`).join('\n')}

## 输出 JSON 数组
[{
  "claim": "原文中的数据点",
  "location": "所在章节标题",
  "verified": true/false,
  "credibility": "A|B|C|D",
  "sources": ["验证来源"]
}]

只输出 JSON 数组，不要其他内容。`;

      const result = await llmRouter.generate(prompt, 'analysis', { temperature: 0.3, maxTokens: 3000 });
      const match = result.content.match(/\[[\s\S]*\]/);
      if (match) {
        factCheckReport = JSON.parse(match[0]);
      }
    }
    console.log(`[LangGraph:polish] Fact-check: ${factCheckReport.length} claims checked, ${factCheckReport.filter((f: any) => !f.verified).length} unverified`);
  } catch (factErr) {
    console.warn(`[LangGraph:polish] Fact-check failed`, factErr);
  }

  // 保存润色后稿件
  await query(
    `UPDATE tasks SET draft_content = $1, progress = 75, updated_at = NOW() WHERE id = $2`,
    [polishedContent, state.taskId]
  );

  return {
    draftContent: polishedContent,
    factCheckReport,
    status: 'polished',
    progress: 75,
    currentNode: NODE_NAMES.POLISH,
  };
}

/**
 * Blue Team Node — 蓝军评审（串行/并行双模式）
 * 优先接入 sequentialReview.ts（串行专家链），fallback 到 LLM 直调
 * 支持: 用户配置专家、段落级定位、事实核查融合
 */
export async function blueTeamNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const round = state.currentReviewRound + 1;
  console.log(`[LangGraph:blue_team] Starting review round ${round} for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'reviewing', progress = $1, current_stage = $2, updated_at = NOW() WHERE id = $3`,
    [75 + round * 3, `reviewing_round_${round}`, state.taskId]
  );

  try {
    // 读取用户配置的评审方案（前端通过 save-review-config 保存）
    const taskRow = await query(`SELECT blue_team_config FROM tasks WHERE id = $1`, [state.taskId]);
    const userConfig = taskRow.rows[0]?.blue_team_config;

    // 尝试接入 sequentialReview.ts
    let questions: any[] = [];
    let revisedDraft = state.draftContent || '';
    let revisionSummary = '';
    let completedRounds = round;

    try {
      const { configureSequentialReview, startSequentialReview, getSequentialReviewProgress } =
        await import('../services/sequentialReview.js');

      // 配置专家队列（用户选择 或 自动匹配）
      await configureSequentialReview(
        state.taskId,
        state.topic,
        userConfig?.selectedExperts
      );

      // 获取最新草稿 ID 和内容
      const draftRow = await query(
        `SELECT id, content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
        [state.taskId]
      );
      const draftId = draftRow.rows[0]?.id || state.taskId;
      const draftContent = draftRow.rows[0]?.content || state.draftContent || '';

      // 启动串行评审（内部自动 SSE 推送）
      await startSequentialReview(state.taskId, draftId, draftContent);

      // 获取结果
      const progress = await getSequentialReviewProgress(state.taskId);
      completedRounds = progress.completedRounds || round;

      // 汇总所有轮次的评审意见
      if (progress.reviewChain) {
        for (const item of progress.reviewChain) {
          if (item.questions) {
            questions.push(...item.questions.map((q: any) => ({
              ...q,
              expertName: item.expertName,
              expertRole: item.expertRole,
            })));
          }
        }
      }

      // 获取最新修订稿
      const latestDraft = await query(
        `SELECT content FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1`,
        [state.taskId]
      );
      if (latestDraft.rows[0]?.content) {
        revisedDraft = latestDraft.rows[0].content;
      }
      revisionSummary = `串行评审 ${completedRounds} 轮完成，${questions.length} 条意见`;
      console.log(`[LangGraph:blue_team] Sequential review completed: ${completedRounds} rounds, ${questions.length} questions`);

    } catch (seqErr) {
      // Fallback: LLM 直调评审
      console.warn(`[LangGraph:blue_team] sequentialReview unavailable, falling back to LLM`, seqErr);

      const llmRouter = getLLMRouter();
      const draftPreview = (state.draftContent || '').substring(0, 6000);

      // 事实核查上下文
      const factCheckCtx = (state.factCheckReport || [])
        .filter((f: any) => !f.verified)
        .map((f: any) => `⚠️ "${f.claim}" (${f.location}) — 未验证`)
        .join('\n');

      const reviewPrompt = `你是一个由三位专家组成的蓝军评审团。

## 专家角色
1. **批判者(Challenger)**: 逻辑漏洞、论证跳跃、数据可靠性
2. **拓展者(Expander)**: 遗漏视角、关联因素、国际对比
3. **提炼者(Synthesizer)**: 核心观点清晰度、结论可靠性

## 第${round}轮评审

${factCheckCtx ? `## 事实核查发现\n${factCheckCtx}\n` : ''}

## 研究报告
${draftPreview}

## 输出 JSON 数组，每个问题包含:
{
  "expertId": "challenger|expander|synthesizer",
  "expertName": "批判者|拓展者|提炼者",
  "question": "问题描述",
  "severity": "high|medium|low|praise",
  "suggestion": "改进建议",
  "location": "问题所在位置（如: 第二章第一段）"
}

每位专家提出 3-5 个问题。只输出 JSON 数组。`;

      const reviewResult = await llmRouter.generate(reviewPrompt, 'blue_team_review', {
        temperature: 0.8,
        maxTokens: 4000,
      });

      try {
        const jsonMatch = reviewResult.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                          reviewResult.content.match(/(\[[\s\S]*\])/);
        if (jsonMatch) {
          questions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
      } catch {
        questions = [{ expertId: 'synthesizer', expertName: '提炼者', question: reviewResult.content.substring(0, 500), severity: 'medium', suggestion: '请查看评审意见' }];
      }

      // 有 high severity 则修订
      const highCount = questions.filter((q: any) => q.severity === 'high').length;
      if (highCount > 0) {
        const revisionPrompt = `基于蓝军评审反馈修订报告。

## 评审意见
${questions.filter((q: any) => q.severity === 'high' || q.severity === 'medium').map((q: any, i: number) =>
  `${i + 1}. [${q.severity}] ${q.expertName}: ${q.question}${q.location ? ` (位置: ${q.location})` : ''}\n   建议: ${q.suggestion || '无'}`
).join('\n\n')}

## 当前报告
${draftPreview}

## 要求: 逐条回应高优先级问题，保持结构和风格。输出完整报告。`;

        const revisionResult = await llmRouter.generate(revisionPrompt, 'writing', { temperature: 0.7, maxTokens: 8000 });
        if (revisionResult.content?.trim().length > 100) {
          revisedDraft = revisionResult.content;
        }
      }
      revisionSummary = `第${round}轮评审：${questions.length} 条意见，${questions.filter((q: any) => q.severity === 'high').length} 条高优`;
    }

    // 判断是否通过
    const highSeverityCount = questions.filter((q: any) => q.severity === 'high').length;
    const passed = highSeverityCount === 0;

    // 保存修订稿
    const revisionVersion = round + 1;
    await Promise.all([
      query(`UPDATE tasks SET draft_content = $1, updated_at = NOW() WHERE id = $2`, [revisedDraft, state.taskId]),
      revisedDraft !== state.draftContent
        ? query(
            `INSERT INTO draft_versions (task_id, version, content, change_summary, status, word_count, round, expert_role)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (task_id, version) DO UPDATE SET
               content = EXCLUDED.content, change_summary = EXCLUDED.change_summary, word_count = EXCLUDED.word_count, status = EXCLUDED.status`,
            [state.taskId, revisionVersion, revisedDraft, revisionSummary, 'revised', revisedDraft.length, round, 'blue_team']
          )
        : Promise.resolve(),
    ]);

    return {
      blueTeamRounds: [{ round, questions, revisionContent: revisedDraft, revisionSummary }],
      currentReviewRound: round,
      reviewPassed: passed,
      draftContent: revisedDraft,
      status: passed ? 'review_passed' : 'review_needs_revision',
      progress: Math.min(75 + round * 5, 90),
      currentNode: NODE_NAMES.BLUE_TEAM,
    };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LangGraph:blue_team] Review failed:`, errorMsg);
    return { status: 'review_failed', errors: [`Blue team review failed: ${errorMsg}`], currentNode: NODE_NAMES.BLUE_TEAM };
  }
}

/**
 * Human Approval Node — 最终人工审批
 * 使用 LangGraph interrupt() 原语暂停执行
 */
export async function humanApproveNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:human_approve] Waiting for final approval for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'awaiting_approval', progress = 90, current_stage = 'awaiting_approval', updated_at = NOW() WHERE id = $1`,
    [state.taskId]
  );

  const humanInput = interrupt({
    type: 'final_approval',
    taskId: state.taskId,
    draftContent: state.draftContent,
    blueTeamSummary: state.blueTeamRounds.map(r => r.revisionSummary),
    message: '内容已通过蓝军评审，请最终确认',
  });

  const approved = humanInput?.approved ?? false;
  const feedback = humanInput?.feedback;

  return {
    finalApproved: approved,
    approvalFeedback: feedback,
    status: approved ? 'approved' : 'revision_needed',
    progress: approved ? 95 : 85,
    currentNode: NODE_NAMES.HUMAN_APPROVE,
  };
}

/**
 * Output Node — 多格式输出（Markdown + HTML + PDF）
 * 按 target_formats 生成对应格式，写入 outputs 表
 */
export async function outputNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:output] Generating output for task: ${state.taskId}`);

  const content = state.draftContent || '';
  if (!content || content.trim().length < 100) {
    return { status: 'output_failed', errors: ['No draft content'], currentNode: NODE_NAMES.OUTPUT };
  }

  // 读取 target_formats
  const taskResult = await query(
    `SELECT target_formats, topic FROM tasks WHERE id = $1`,
    [state.taskId]
  );
  const targetFormats: string[] = taskResult.rows[0]?.target_formats || ['markdown'];
  const topic = taskResult.rows[0]?.topic || state.topic;
  const outputFiles: Array<{ id: string; format: string }> = [];

  // 1. Markdown（始终生成）
  const mdId = `output_${uuidv4().slice(0, 8)}`;
  await query(
    `INSERT INTO outputs (id, task_id, format, content, created_at) VALUES ($1, $2, 'markdown', $3, NOW())`,
    [mdId, state.taskId, content]
  );
  outputFiles.push({ id: mdId, format: 'markdown' });

  // 2. HTML（按需 — 或 PDF 也需要先生成 HTML）
  if (targetFormats.includes('html') || targetFormats.includes('pdf')) {
    try {
      const { renderMarkdownToHtml } = await import('../services/htmlRenderer.js');
      const htmlContent = renderMarkdownToHtml(content, {
        title: topic,
        includeTableOfContents: true,
        includeCoverPage: true,
      });

      const htmlId = `output_${uuidv4().slice(0, 8)}`;
      await query(
        `INSERT INTO outputs (id, task_id, format, content, created_at) VALUES ($1, $2, 'html', $3, NOW())`,
        [htmlId, state.taskId, htmlContent]
      );
      outputFiles.push({ id: htmlId, format: 'html' });
      console.log(`[LangGraph:output] HTML generated: ${htmlContent.length} chars`);
    } catch (htmlErr) {
      console.warn(`[LangGraph:output] HTML generation failed`, htmlErr);
    }
  }

  // 3. PDF — 通过 HTML 在浏览器端 Print-to-PDF（CSS 已做打印优化）
  // 后续可接入 Puppeteer 实现服务端 PDF

  // 更新任务状态
  await query(
    `UPDATE tasks SET status = 'completed', progress = 100, current_stage = 'completed',
     output_ids = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(outputFiles.map(f => f.id)), state.taskId]
  );

  return {
    outputFiles,
    status: 'completed',
    progress: 100,
    currentNode: NODE_NAMES.OUTPUT,
  };
}
