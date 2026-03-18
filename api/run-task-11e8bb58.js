// 重置并执行 task_11e8bb58 完整工作流
import { query } from './src/db/connection.js';
import { initLLMRouter } from './src/providers/index.js';
import { PipelineService } from './src/services/pipeline.js';
import dotenv from 'dotenv';

const taskId = 'task_11e8bb58';

async function runWorkflow() {
  dotenv.config();

  // 初始化 LLM Router
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const kimiApiKey = process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);

  if (kimiApiKey) {
    initLLMRouter({ kimiApiKey, claudeApiKey: undefined, openaiApiKey: undefined, useClaudeCode: false });
    console.log('✓ LLM Router initialized with Kimi');
  } else {
    const { MockProvider } = await import('./src/providers/mock.js');
    const router = initLLMRouter({});
    router.registerProvider(new MockProvider());
    console.log('✓ LLM Router initialized with Mock');
  }

  console.log(`[Workflow] Processing task ${taskId}...`);

  // 检查当前状态
  const checkResult = await query('SELECT status, current_stage FROM tasks WHERE id = $1', [taskId]);
  const currentState = checkResult.rows[0];
  console.log(`[Workflow] Current state: ${currentState.status} / ${currentState.current_stage}`);

  const pipeline = new PipelineService();

  try {
    // 根据当前状态决定从哪一步开始
    let startFromStep = 1;
    if (currentState.status === 'planning_completed') startFromStep = 1;
    else if (currentState.status === 'researching') {
      console.log('[Workflow] Task is researching, waiting for it to complete or resetting...');
      // 重置到 planning_completed 重新开始
      await query(
        `UPDATE tasks SET status = 'planning_completed', progress = 15, current_stage = 'planning_completed',
         research_data = NULL, final_draft = NULL, completed_at = NULL WHERE id = $1`,
        [taskId]
      );
      await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
      await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);
      console.log('[Workflow] Reset to planning_completed');
    }
    else if (currentState.status === 'research_completed') startFromStep = 2;
    else if (currentState.status === 'writing') startFromStep = 2;
    else if (currentState.status === 'reviewing') startFromStep = 3;

    // Step 1: 深度研究
    if (startFromStep <= 1) {
      console.log('\n[Step 1/4] Starting Research...');
      await pipeline.research(taskId);
      console.log('✓ Research completed');
    }

    // Step 2: 文稿生成
    if (startFromStep <= 2) {
      console.log('\n[Step 2/4] Starting Writing...');
      await pipeline.write(taskId);
      console.log('✓ Writing completed');
    }

    // Step 3: BlueTeam评审
    if (startFromStep <= 3) {
      console.log('\n[Step 3/4] Starting BlueTeam Review...');
      await pipeline.review(taskId);
      console.log('✓ BlueTeam Review completed');
    }

    // Step 4: 生成输出
    console.log('\n[Step 4/4] Generating Output...');
    await pipeline.generateOutput(taskId);
    console.log('✓ Output generated');

    console.log('\n🎉 Workflow completed successfully!');

    const result = await query(
      `SELECT status, progress, current_stage, output_ids FROM tasks WHERE id = $1`,
      [taskId]
    );
    console.log('\nFinal Status:', result.rows[0]);

  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runWorkflow();
