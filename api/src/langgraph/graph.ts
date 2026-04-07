// LangGraph Content Pipeline Graph Definition
// 声明式工作流定义：选题 → 大纲确认 → 研究 → 写作 → 蓝军评审 → 人工审批 → 输出

import { StateGraph, START, END } from '@langchain/langgraph';
import { PipelineState, PipelineStateType, NODE_NAMES } from './state.js';
import {
  plannerNode,
  humanOutlineNode,
  researcherNode,
  writerNode,
  blueTeamNode,
  humanApproveNode,
  outputNode,
} from './nodes.js';
import { getCheckpointer } from './checkpointer.js';

/**
 * 构建内容生产流水线 StateGraph
 */
function buildGraph() {
  const graph = new StateGraph(PipelineState);

  // 添加节点
  graph.addNode(NODE_NAMES.PLANNER, plannerNode);
  graph.addNode(NODE_NAMES.HUMAN_OUTLINE, humanOutlineNode);
  graph.addNode(NODE_NAMES.RESEARCHER, researcherNode);
  graph.addNode(NODE_NAMES.WRITER, writerNode);
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
    // 拒绝后回到 planner 重新生成
    return NODE_NAMES.PLANNER;
  });

  // 边: researcher → writer
  graph.addEdge(NODE_NAMES.RESEARCHER, NODE_NAMES.WRITER);

  // 边: writer → blue_team
  graph.addEdge(NODE_NAMES.WRITER, NODE_NAMES.BLUE_TEAM);

  // 条件边: blue_team → writer (需要修改) | human_approve (通过)
  graph.addConditionalEdges(NODE_NAMES.BLUE_TEAM, (state: PipelineStateType) => {
    if (state.currentReviewRound < state.maxReviewRounds && !state.reviewPassed) {
      return NODE_NAMES.WRITER; // 回到写作修改
    }
    return NODE_NAMES.HUMAN_APPROVE;
  });

  // 条件边: human_approve → output (approved) | writer (revision needed)
  graph.addConditionalEdges(NODE_NAMES.HUMAN_APPROVE, (state: PipelineStateType) => {
    if (state.finalApproved) {
      return NODE_NAMES.OUTPUT;
    }
    return NODE_NAMES.WRITER; // 打回修改
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
