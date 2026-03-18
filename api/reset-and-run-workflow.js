// 重置任务并执行完整工作流
import { query } from './src/db/connection.js';
import { initLLMRouter } from './src/providers/index.js';
import { PipelineService } from './src/services/pipeline.js';
import dotenv from 'dotenv';

const taskId = 'task_1773713521952';

async function resetAndRunWorkflow() {
  dotenv.config();

  // 初始化 LLM Router
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const kimiApiKey = process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);

  if (kimiApiKey) {
    initLLMRouter({ kimiApiKey, claudeApiKey: undefined, openaiApiKey, useClaudeCode: false });
    console.log('✓ LLM Router initialized with Kimi');
  } else {
    console.warn('⚠️ No Kimi API key found');
    const { MockProvider } = await import('./src/providers/mock.js');
    const router = initLLMRouter({});
    router.registerProvider(new MockProvider());
  }

  console.log(`[Workflow] Resetting task ${taskId}...`);

  // 1. 重置任务状态到 planning_completed（保留大纲）
  await query(
    `UPDATE tasks SET
      status = 'planning_completed',
      progress = 15,
      current_stage = 'planning_completed',
      research_data = NULL,
      final_draft = NULL,
      final_draft_edited = false,
      final_draft_edit_id = NULL,
      updated_at = NOW(),
      completed_at = NULL
    WHERE id = $1`,
    [taskId]
  );

  // 2. 清除之前的数据
  await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM research_reports WHERE topic_id = $1`, [taskId]);

  console.log('[Workflow] Task reset to planning_completed');

  const pipeline = new PipelineService();

  try {
    // Step 1: 深度研究
    console.log('\n[Step 1/4] Starting Research...');
    await pipeline.research(taskId);
    console.log('✓ Research completed');

    // Step 2: 文稿生成
    console.log('\n[Step 2/4] Starting Writing...');
    await pipeline.write(taskId);
    console.log('✓ Writing completed');

    // Step 3: BlueTeam评审
    console.log('\n[Step 3/4] Starting BlueTeam Review...');
    await pipeline.review(taskId);
    console.log('✓ BlueTeam Review completed');

    // Step 4: 生成输出
    console.log('\n[Step 4/4] Generating Output...');
    await pipeline.generateOutput(taskId);
    console.log('✓ Output generated');

    console.log('\n🎉 Workflow completed successfully!');

    // 获取最终状态
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

resetAndRunWorkflow();
