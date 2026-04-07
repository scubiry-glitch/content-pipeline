// LangGraph Node Functions
// 包装现有 Agent，适配 LangGraph state 接口
// 不修改任何现有 Agent 代码

import { interrupt } from '@langchain/langgraph';
import { PipelineStateType, NODE_NAMES } from './state.js';
import { PlannerAgent } from '../agents/planner.js';
import { ResearchAgent } from '../agents/researcher.js';
import { WriterAgent } from '../agents/writer.js';
import { BlueTeamAgent } from '../agents/blueTeam.js';
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

  // 并行执行: 大纲生成 + 选题评估 + 竞品分析
  const [planResult, evaluation, competitorAnalysis] = await Promise.all([
    planner.execute({
      topic: state.topic,
      context: state.context,
      comments: state.outlineFeedback ? [state.outlineFeedback] : undefined,
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

  // 创建/更新数据库任务记录
  const taskId = state.taskId || `task_${uuidv4().slice(0, 8)}`;
  if (!state.taskId) {
    await query(
      `INSERT INTO tasks (id, topic, status, progress, outline, evaluation, competitor_analysis, search_config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         outline = EXCLUDED.outline,
         evaluation = EXCLUDED.evaluation,
         competitor_analysis = EXCLUDED.competitor_analysis,
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
  }

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
 * 包装: WriterAgent.execute()
 */
export async function writerNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log(`[LangGraph:writer] Starting writing for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'writing', progress = 60, current_stage = 'writing', updated_at = NOW() WHERE id = $1`,
    [state.taskId]
  );

  const llmRouter = getLLMRouter();
  const writer = new WriterAgent(llmRouter);

  const result = await writer.execute({
    topicId: state.taskId,
    topic: state.topic,
    outline: state.outline?.sections || [],
    researchReport: {
      dataPackage: state.researchData?.dataPackage || [],
      analysis: state.researchData?.analysis || { summary: '', keyFindings: [] },
      insights: state.researchData?.insights || [],
    },
    blueTeamConfig: { expertCount: 0, questionsPerExpert: 0, rounds: 0 }, // BlueTeam 由独立节点处理
  });

  if (!result.success || !result.data) {
    return {
      status: 'writing_failed',
      progress: 60,
      errors: [`Writing failed: ${result.error || 'Unknown error'}`],
      currentNode: NODE_NAMES.WRITER,
    };
  }

  const draftContent = result.data.content;

  await query(
    `UPDATE tasks SET draft_content = $1, progress = 70, updated_at = NOW() WHERE id = $2`,
    [draftContent, state.taskId]
  );

  return {
    draftContent,
    status: 'writing_complete',
    progress: 70,
    currentNode: NODE_NAMES.WRITER,
  };
}

/**
 * Blue Team Node — 蓝军评审
 * 包装: BlueTeamAgent.execute()
 */
export async function blueTeamNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const round = state.currentReviewRound + 1;
  console.log(`[LangGraph:blue_team] Starting review round ${round} for task: ${state.taskId}`);

  await query(
    `UPDATE tasks SET status = 'reviewing', progress = $1, current_stage = $2, updated_at = NOW() WHERE id = $3`,
    [70 + round * 5, `reviewing_round_${round}`, state.taskId]
  );

  const blueTeam = new BlueTeamAgent();

  const result = await blueTeam.execute({
    taskId: state.taskId,
    draftContent: state.draftContent,
    topic: state.topic,
    outline: state.outline?.sections,
    config: { rounds: 1, mode: 'sequential', aiExpertCount: 3, humanExpertCount: 0, revisionMode: 'per_round' },
  });

  if (!result.success || !result.data) {
    return {
      status: 'review_failed',
      errors: [`Blue team review failed: ${result.error || 'Unknown error'}`],
      currentNode: NODE_NAMES.BLUE_TEAM,
    };
  }

  // 判断是否通过评审
  const allQuestions = result.data.rounds.flatMap((r: any) => r.questions || []);
  const highSeverityCount = allQuestions.filter((q: any) => q.severity === 'high').length;
  const passed = highSeverityCount === 0;

  const roundData = {
    round,
    questions: allQuestions,
    revisionContent: result.data.finalDraft,
    revisionSummary: `Round ${round}: ${allQuestions.length} questions, ${highSeverityCount} high severity`,
  };

  return {
    blueTeamRounds: [roundData],
    currentReviewRound: round,
    reviewPassed: passed,
    draftContent: result.data.finalDraft || state.draftContent,
    status: passed ? 'review_passed' : 'review_needs_revision',
    progress: Math.min(70 + round * 10, 90),
    currentNode: NODE_NAMES.BLUE_TEAM,
  };
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
