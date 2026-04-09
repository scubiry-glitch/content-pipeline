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
      JSON.stringify(planResult.data.outline),
      JSON.stringify(evaluation),
      JSON.stringify(competitorAnalysis),
      JSON.stringify(state.searchConfig || {}),
    ]
  );

  return {
    taskId,
    outline: { sections: planResult.data.outline, title: planResult.data.plan.title },
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
      dataPackage: result.data.dataPackage,
      analysis: result.data.analysis,
      insights: result.data.insights,
    },
    status: 'researching_complete',
    progress: 50,
    currentNode: NODE_NAMES.RESEARCHER,
  };
}

/**
 * Writer Node — 内容生成
 * 直接调用 LLMRouter 生成草稿，不经过 WriterAgent.execute()
 * 原因: WriterAgent.execute() 内部捆绑了 BlueTeam 评审 + saveDocument()，
 *       其中 saveDocument() 依赖不存在的 documents 表，导致整个执行失败，草稿丢失。
 *       LangGraph 已将 BlueTeam 和输出拆分为独立节点，此处只需生成初稿。
 */
export async function writerNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:writer] Starting writing for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'writing', progress = 60, current_stage = 'writing', updated_at = NOW() WHERE id = $1`,
    [state.taskId]
  );

  try {
    const llmRouter = getLLMRouter();

    const outlineSections = state.outline?.sections || [];
    const dataPackage = state.researchData?.dataPackage || [];
    const insights = state.researchData?.insights || [];

    const prompt = `你是一位资深财经产业研究撰稿人。请基于以下信息撰写深度研究报告。

## 研究话题
${state.topic}

## 大纲结构
${JSON.stringify(outlineSections, null, 2)}

## 研究数据
${dataPackage.map((d: any, i: number) => `
[${i + 1}] ${d.source || '来源'}: ${(d.content || '').substring(0, 500)}...
`).join('\n')}

## 关键洞察
${insights.map((insight: any, i: number) => `
${i + 1}. [${insight.type || 'insight'}] ${insight.content || ''} (置信度: ${insight.confidence || 0})
`).join('\n')}

## 写作要求
1. 采用"三层穿透"结构：宏观视野 → 中观解剖 → 微观行动
2. 每个观点必须有数据支撑，标注来源
3. 语言专业、客观、有洞察力
4. 总字数控制在5000-8000字
5. 包含以下部分：
   - 执行摘要
   - 宏观视野（政策、趋势）
   - 中观解剖（产业链、机制）
   - 微观行动（案例、建议）
   - 风险提示
   - 数据来源说明

请直接输出完整的报告正文。`;

    const result = await llmRouter.generate(prompt, 'writing', {
      temperature: 0.7,
      maxTokens: 8000,
    });

    const draftContent = result.content || '';

    if (!draftContent || draftContent.trim().length < 100) {
      console.warn(`[LangGraph:writer] Draft too short (${draftContent.length} chars), may indicate LLM issue`);
      return {
        status: 'writing_failed',
        progress: 60,
        errors: [`Draft generation returned insufficient content (${draftContent.length} chars)`],
        currentNode: NODE_NAMES.WRITER,
      };
    }

    // 保存草稿到 tasks 表（不依赖 documents 表）
    await query(
      `UPDATE tasks SET draft_content = $1, progress = 70, status = 'writing', updated_at = NOW() WHERE id = $2`,
      [draftContent, state.taskId]
    );

    console.log(`[LangGraph:writer] Draft generated successfully: ${draftContent.length} chars`);

    return {
      draftContent,
      status: 'writing_complete',
      progress: 70,
      currentNode: NODE_NAMES.WRITER,
    };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LangGraph:writer] Writing failed:`, errorMsg);
    return {
      status: 'writing_failed',
      progress: 60,
      errors: [`Writing failed: ${errorMsg}`],
      currentNode: NODE_NAMES.WRITER,
    };
  }
}

/**
 * Blue Team Node — 蓝军评审
 * 直接调用 LLMRouter 执行评审，不经过 BlueTeamAgent.execute()
 * 原因: BlueTeamAgent 内部依赖 expert_review_tasks / draft_versions 等不存在的表，
 *       会导致整轮评审失败。此处用轻量级 LLM 调用实现 3 专家评审 + 修订。
 */
export async function blueTeamNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const round = state.currentReviewRound + 1;
  console.log(`[LangGraph:blue_team] Starting review round ${round} for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'reviewing', progress = $1, current_stage = $2, updated_at = NOW() WHERE id = $3`,
    [70 + round * 5, `reviewing_round_${round}`, state.taskId]
  );

  try {
    const llmRouter = getLLMRouter();
    const draftPreview = (state.draftContent || '').substring(0, 6000);

    // 3 专家角色一次性评审
    const reviewPrompt = `你是一个由三位专家组成的蓝军评审团，负责审核研究报告。

## 专家角色
1. **批判者(Challenger)**: 找出逻辑漏洞、论证跳跃、数据可靠性问题
2. **拓展者(Expander)**: 指出遗漏的视角、未考虑的关联性
3. **提炼者(Synthesizer)**: 评估核心观点是否清晰、结论是否站得住脚

## 当前是第${round}轮评审

## 研究报告内容
${draftPreview}

## 输出要求
以JSON数组格式输出所有问题，每个问题包含:
{
  "expertId": "challenger|expander|synthesizer",
  "expertName": "批判者|拓展者|提炼者",
  "role": "challenger|expander|synthesizer",
  "question": "具体问题描述",
  "severity": "high|medium|low|praise",
  "suggestion": "改进建议"
}

每位专家提出3-5个问题，请以JSON数组格式直接输出。`;

    const reviewResult = await llmRouter.generate(reviewPrompt, 'blue_team_review', {
      temperature: 0.8,
      maxTokens: 4000,
    });

    // 解析评审结果
    let questions: any[] = [];
    try {
      const jsonMatch = reviewResult.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        reviewResult.content.match(/(\[[\s\S]*\])/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('[LangGraph:blue_team] Failed to parse review JSON, using raw text');
      questions = [{
        expertId: 'synthesizer',
        expertName: '提炼者',
        role: 'synthesizer',
        question: reviewResult.content.substring(0, 500),
        severity: 'medium' as const,
        suggestion: '请查看评审意见',
      }];
    }

    const highSeverityCount = questions.filter((q: any) => q.severity === 'high').length;
    const passed = highSeverityCount === 0;

    // 如果有 high severity 问题，执行修订
    let revisedDraft = state.draftContent;
    let revisionSummary = `Round ${round}: ${questions.length} questions, ${highSeverityCount} high severity`;

    if (!passed && questions.length > 0) {
      const revisionPrompt = `你是一位资深研究报告修订专家。请基于蓝军评审反馈修改报告。

## 第${round}轮评审意见
${questions.filter((q: any) => q.severity === 'high' || q.severity === 'medium').map((q: any, i: number) =>
  `${i + 1}. [${q.severity}] ${q.expertName}: ${q.question}\n   建议: ${q.suggestion || '无'}`
).join('\n\n')}

## 当前报告
${draftPreview}

## 修订要求
1. 逐条回应高优先级问题
2. 补充必要的数据支撑
3. 保持整体结构和风格
4. 在开头附上简短修订说明

请输出修订后的完整报告正文。`;

      const revisionResult = await llmRouter.generate(revisionPrompt, 'writing', {
        temperature: 0.7,
        maxTokens: 8000,
      });

      if (revisionResult.content && revisionResult.content.trim().length > 100) {
        revisedDraft = revisionResult.content;
        const summaryMatch = revisedDraft.match(/修订说明[:：]?\s*([\s\S]{0,300}?)\n\n/);
        revisionSummary = summaryMatch
          ? summaryMatch[1].trim()
          : `第${round}轮修订：处理了${questions.length}条专家意见`;
      }
    }

    // 更新 tasks 表
    await query(
      `UPDATE tasks SET draft_content = $1, updated_at = NOW() WHERE id = $2`,
      [revisedDraft, state.taskId]
    );

    console.log(`[LangGraph:blue_team] Round ${round} complete: ${questions.length} questions, ${highSeverityCount} high, passed=${passed}`);

    const roundData = {
      round,
      questions,
      revisionContent: revisedDraft,
      revisionSummary,
    };

    return {
      blueTeamRounds: [roundData],
      currentReviewRound: round,
      reviewPassed: passed,
      draftContent: revisedDraft,
      status: passed ? 'review_passed' : 'review_needs_revision',
      progress: Math.min(70 + round * 10, 90),
      currentNode: NODE_NAMES.BLUE_TEAM,
    };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LangGraph:blue_team] Review failed:`, errorMsg);
    return {
      status: 'review_failed',
      errors: [`Blue team review failed: ${errorMsg}`],
      currentNode: NODE_NAMES.BLUE_TEAM,
    };
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
 * Output Node — 生成最终输出
 */
export async function outputNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:output] Generating final output for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'completed', progress = 100, current_stage = 'completed',
     draft_content = $1, updated_at = NOW() WHERE id = $2`,
    [state.draftContent, state.taskId]
  );

  return {
    status: 'completed',
    progress: 100,
    currentNode: NODE_NAMES.OUTPUT,
  };
}
