// LangGraph Content Pipeline Graph Definition
// 声明式工作流: 选题 → 大纲确认 → 研究 → 写作 → 润色 → 蓝军评审 → 人工审批 → 多格式输出

import { StateGraph, START, END } from '@langchain/langgraph';
import { PipelineState, PipelineStateType, NODE_NAMES } from './state.js';
import {
  plannerNode,
  humanOutlineNode,
  researcherNode,
  writerNode,
  polishNode,
  blueTeamNode,
  humanApproveNode,
  outputNode,
} from './nodes.js';
import { getCheckpointer } from './checkpointer.js';

/**
 * 构建内容生产流水线 StateGraph
 *
 * START → planner → human_outline → researcher → writer → polish → blue_team → human_approve → output → END
 *                   ↑ (rejected)                  ↑ (needs revision)           ↑ (打回)
 *                   └── planner                   └── writer                   └── writer
 */
function buildGraph() {
  const graph = new StateGraph(PipelineState);

  // 添加节点 (8 个)
  graph.addNode(NODE_NAMES.PLANNER, plannerNode);
  graph.addNode(NODE_NAMES.HUMAN_OUTLINE, humanOutlineNode);
  graph.addNode(NODE_NAMES.RESEARCHER, researcherNode);
  graph.addNode(NODE_NAMES.WRITER, writerNode);
  graph.addNode(NODE_NAMES.POLISH, polishNode);
  graph.addNode(NODE_NAMES.BLUE_TEAM, blueTeamNode);
  graph.addNode(NODE_NAMES.HUMAN_APPROVE, humanApproveNode);
  graph.addNode(NODE_NAMES.OUTPUT, outputNode);

  // 边: START → planner
  graph.addEdge(START, NODE_NAMES.PLANNER);

  // 边: planner → human_outline
  graph.addEdge(NODE_NAMES.PLANNER, NODE_NAMES.HUMAN_OUTLINE);

  // 条件边: human_outline → researcher (approved) | planner (rejected)
  graph.addConditionalEdges(NODE_NAMES.HUMAN_OUTLINE, (state: PipelineStateType) => {
    if (state.outlineApproved) {
      return NODE_NAMES.RESEARCHER;
    }
    return NODE_NAMES.PLANNER;
  });

  // 边: researcher → writer
  graph.addEdge(NODE_NAMES.RESEARCHER, NODE_NAMES.WRITER);

  // 边: writer → polish (润色+事实核查)
  graph.addEdge(NODE_NAMES.WRITER, NODE_NAMES.POLISH);

  // 边: polish → blue_team
  graph.addEdge(NODE_NAMES.POLISH, NODE_NAMES.BLUE_TEAM);

  // 条件边: blue_team → writer (需要修改) | human_approve (通过)
  graph.addConditionalEdges(NODE_NAMES.BLUE_TEAM, (state: PipelineStateType) => {
    if (state.currentReviewRound < state.maxReviewRounds && !state.reviewPassed) {
      return NODE_NAMES.WRITER;
    }
    return NODE_NAMES.HUMAN_APPROVE;
  });

  // 条件边: human_approve → output (approved) | writer (revision needed)
  graph.addConditionalEdges(NODE_NAMES.HUMAN_APPROVE, (state: PipelineStateType) => {
    if (state.finalApproved) {
      return NODE_NAMES.OUTPUT;
    }
    return NODE_NAMES.WRITER;
  });

  // 边: output → END
  graph.addEdge(NODE_NAMES.OUTPUT, END);

  return graph;
}

/**
 * 获取编译后的 graph（带 checkpointer）
 */
export async function getCompiledGraph() {
  const graph = buildGraph();
  const checkpointer = await getCheckpointer();

  return graph.compile({
    checkpointer,
  });
}

/**
 * 获取 graph 的 Mermaid 流程图
 */
export function getGraphMermaid(): string {
  const graph = buildGraph();
  const compiled = graph.compile();
  return compiled.getGraph().drawMermaid();
}

/**
 * 创建新的 pipeline 运行
 */
export async function createPipelineRun(input: {
  topic: string;
  context?: string;
  searchConfig?: Record<string, any>;
  maxReviewRounds?: number;
}) {
  const graph = await getCompiledGraph();
  const threadId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const config = {
    configurable: { thread_id: threadId },
  };

  // 启动 graph（会在 human_outline 处 interrupt）
  const result = await graph.invoke(
    {
      topic: input.topic,
      context: input.context,
      searchConfig: input.searchConfig || {},
      maxReviewRounds: input.maxReviewRounds || 2,
    },
    config,
  );

  return {
    threadId,
    state: result,
  };
}

/**
 * 恢复中断的 pipeline（human-in-the-loop）
 */
export async function resumePipelineRun(threadId: string, humanInput: {
  approved: boolean;
  feedback?: string;
  outline?: any;
}) {
  const graph = await getCompiledGraph();

  const config = {
    configurable: { thread_id: threadId },
  };

  // 使用 Command 恢复执行
  const { Command } = await import('@langchain/langgraph');
  const result = await graph.invoke(
    new Command({ resume: humanInput }),
    config,
  );

  return { threadId, state: result };
}

/**
 * 获取 pipeline 当前状态
 */
export async function getPipelineState(threadId: string) {
  const graph = await getCompiledGraph();

  const config = {
    configurable: { thread_id: threadId },
  };

  const state = await graph.getState(config);
  return {
    threadId,
    values: state.values,
    next: state.next,
    tasks: state.tasks,
    metadata: state.metadata,
  };
}

/**
 * 获取 pipeline 状态历史（checkpoint 快照列表）
 */
export async function getPipelineStateHistory(threadId: string, limit: number = 20) {
  const graph = await getCompiledGraph();

  const config = {
    configurable: { thread_id: threadId },
  };

  const history: any[] = [];
  try {
    for await (const snapshot of graph.getStateHistory(config)) {
      history.push({
        checkpoint_id: snapshot.config?.configurable?.checkpoint_id,
        checkpoint_ns: snapshot.config?.configurable?.checkpoint_ns,
        values: {
          taskId: snapshot.values?.taskId,
          topic: snapshot.values?.topic,
          status: snapshot.values?.status,
          progress: snapshot.values?.progress,
          currentNode: snapshot.values?.currentNode,
          outlineApproved: snapshot.values?.outlineApproved,
          reviewPassed: snapshot.values?.reviewPassed,
          // 轻量化：不返回完整的 draftContent / researchData
          hasOutline: !!snapshot.values?.outline,
          hasDraft: !!(snapshot.values?.draftContent && snapshot.values.draftContent.length > 0),
          blueTeamRoundsCount: snapshot.values?.blueTeamRounds?.length || 0,
        },
        next: snapshot.next,
        metadata: snapshot.metadata,
        createdAt: snapshot.createdAt,
        parentConfig: snapshot.parentConfig?.configurable?.checkpoint_id || null,
      });
      if (history.length >= limit) break;
    }
  } catch (err) {
    console.warn('[LangGraph] getStateHistory failed (may not be supported by checkpointer):', err);
  }

  return { threadId, history };
}
