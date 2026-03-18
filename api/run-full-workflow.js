// 重置任务并执行完整工作流 - task_1773713521952
import { query } from './src/db/connection.js';
import { initLLMRouter } from './src/providers/index.js';
import { PipelineService } from './src/services/pipeline.js';
import dotenv from 'dotenv';

const taskId = 'task_1773713521952';

async function resetAndRunFullWorkflow() {
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

  console.log(`\n========================================`);
  console.log(`[Workflow] Task: ${taskId}`);
  console.log(`========================================\n`);

  // 获取重置前状态
  const beforeResult = await query('SELECT status, current_stage, progress FROM tasks WHERE id = $1', [taskId]);
  console.log(`[Reset] Before: ${beforeResult.rows[0].status} / ${beforeResult.rows[0].current_stage} (${beforeResult.rows[0].progress}%)`);

  // 重置任务状态
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

  // 清除历史数据
  await query(`DELETE FROM blue_team_reviews WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM draft_versions WHERE task_id = $1`, [taskId]);
  await query(`DELETE FROM research_reports WHERE topic_id = $1`, [taskId]);

  console.log(`[Reset] Task reset to planning_completed\n`);

  const pipeline = new PipelineService();
  const steps = [];

  try {
    // Step 1: 深度研究
    console.log(`[Step 1/4] 🔍 深度研究...`);
    await pipeline.research(taskId);
    steps.push('✅ 深度研究');
    console.log(`[Step 1/4] ✅ 深度研究完成\n`);

    // Step 2: 文稿生成
    console.log(`[Step 2/4] ✍️ 文稿生成...`);
    await pipeline.write(taskId);
    steps.push('✅ 文稿生成');
    console.log(`[Step 2/4] ✅ 文稿生成完成\n`);

    // Step 3: BlueTeam评审
    console.log(`[Step 3/4] 👥 BlueTeam评审...`);
    await pipeline.review(taskId);
    steps.push('✅ BlueTeam评审');
    console.log(`[Step 3/4] ✅ BlueTeam评审完成\n`);

    // Step 4: 生成输出
    console.log(`[Step 4/4] 📄 生成最终输出...`);
    await pipeline.generateOutput(taskId);
    steps.push('✅ 生成输出');
    console.log(`[Step 4/4] ✅ 输出生成完成\n`);

    // 获取最终结果
    const finalResult = await query(
      `SELECT status, progress, current_stage, output_ids FROM tasks WHERE id = $1`,
      [taskId]
    );
    const task = finalResult.rows[0];

    console.log(`========================================`);
    console.log(`🎉 工作流执行成功！`);
    console.log(`========================================`);
    console.log(`最终状态: ${task.status}`);
    console.log(`进度: ${task.progress}%`);
    console.log(`阶段: ${task.current_stage}`);
    console.log(`输出ID: ${task.output_ids?.[0] || 'N/A'}`);
    console.log(`\n完成步骤:`);
    steps.forEach(s => console.log(`  ${s}`));
    console.log(`========================================`);

    return { success: true, outputId: task.output_ids?.[0] };

  } catch (error) {
    console.error(`\n❌ 工作流执行失败:`);
    console.error(`错误: ${error.message}`);
    console.error(`\n堆栈:`);
    console.error(error.stack);

    // 记录失败状态
    await query(
      `UPDATE tasks SET status = 'failed', current_stage = 'error', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    throw error;
  }
}

resetAndRunFullWorkflow()
  .then(result => {
    console.log(`\n✨ 流程完成: http://localhost:5173/tasks/${taskId}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 流程异常退出');
    process.exit(1);
  });
