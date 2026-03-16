// Worker - 异步任务处理器
// 处理: research -> writing -> blue_team -> generate_outputs

import { getQueue } from './utils/queue-manager.js';
import { PipelineService } from './services/pipeline.js';

console.log('[Worker] Starting task processor...');

const pipelineService = new PipelineService();

// Get global queue instances
const taskQueue = getQueue('production');
const outputQueue = getQueue('generate-outputs');

// Process production tasks
taskQueue.process(async (job) => {
  const { taskId, topic, sourceMaterials } = job.data;
  console.log(`[Worker] Processing task ${taskId}: ${topic}`);

  try {
    // Step 1: Research
    console.log(`[Worker] Step 1: Research`);
    await pipelineService.research(taskId);

    // Step 2: Writing
    console.log(`[Worker] Step 2: Writing`);
    await pipelineService.write(taskId);

    // Step 3: BlueTeam Review (3专家 × 3角度 × 2轮)
    console.log(`[Worker] Step 3: BlueTeam Review`);
    const reviewResult = await pipelineService.review(taskId);

    console.log(`[Worker] Task ${taskId} completed BlueTeam review`);
    console.log(`[Worker] Rounds: ${reviewResult?.rounds?.length}`);
    console.log(`[Worker] Status: ${reviewResult?.status}`);

    return {
      success: true,
      taskId,
      status: 'awaiting_approval',
      message: 'BlueTeam review completed, awaiting human approval'
    };

  } catch (error) {
    console.error(`[Worker] Task ${taskId} failed:`, error);

    // Update task status to failed
    const { query } = await import('./db/connection.js');
    await query(
      `UPDATE tasks SET status = 'failed', current_stage = 'error', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    throw error;
  }
});

// Process output generation tasks
outputQueue.process(async (job) => {
  const { taskId } = job.data;
  console.log(`[Worker] Generating output for task ${taskId}`);

  try {
    const result = await pipelineService.generateOutput(taskId);

    console.log(`[Worker] Output generated: ${result.outputId}`);

    return {
      success: true,
      taskId,
      outputId: result.outputId
    };
  } catch (error) {
    console.error(`[Worker] Output generation failed for task ${taskId}:`, error);
    throw error;
  }
});

console.log('[Worker] Ready to process jobs');
console.log('[Worker] Waiting for tasks...');

// Keep alive
setInterval(() => {
  // Heartbeat
}, 10000);
