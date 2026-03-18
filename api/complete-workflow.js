// 直接完成工作流脚本
import { PipelineService } from './src/services/pipeline.js';
import { query } from './src/db/connection.js';
import { initLLMRouter } from './src/providers/index.js';
import dotenv from 'dotenv';

const taskId = 'task_1773713521952';

async function completeWorkflow() {
  // 加载环境变量
  dotenv.config();

  // 初始化 LLM Router（与 server.ts 相同的初始化逻辑）
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const kimiApiKey = process.env.KIMI_API_KEY || (claudeApiKey?.startsWith('sk-kimi') ? claudeApiKey : undefined);

  if (kimiApiKey || (claudeApiKey && !claudeApiKey.startsWith('sk-kimi')) || openaiApiKey) {
    initLLMRouter({
      kimiApiKey,
      claudeApiKey: claudeApiKey?.startsWith('sk-kimi') ? undefined : claudeApiKey,
      openaiApiKey,
      useClaudeCode: false,
    });
    console.log('✓ LLM Router initialized');
  } else {
    console.warn('⚠️ No LLM API keys found');
    const { MockProvider } = await import('./src/providers/mock.js');
    const router = initLLMRouter({});
    router.registerProvider(new MockProvider());
  }

  const pipeline = new PipelineService();

  console.log(`[Workflow] Starting workflow completion for ${taskId}`);

  try {
    // Get current task state
    const taskResult = await query('SELECT status, current_stage FROM tasks WHERE id = $1', [taskId]);
    const task = taskResult.rows[0];
    console.log(`[Workflow] Current state: ${task.status} / ${task.current_stage}`);

    // Step 1: Research (if needed)
    if (task.status === 'researching' || task.status === 'planning_completed') {
      console.log('[Workflow] Step 1: Research');
      await pipeline.research(taskId);
      console.log('[Workflow] Research completed');
    }

    // Step 2: Writing
    if (task.status !== 'completed') {
      console.log('[Workflow] Step 2: Writing');
      await pipeline.write(taskId);
      console.log('[Workflow] Writing completed');
    }

    // Step 3: Review
    console.log('[Workflow] Step 3: Review');
    await pipeline.review(taskId);
    console.log('[Workflow] Review completed');

    // Step 4: Generate output
    console.log('[Workflow] Step 4: Generate Output');
    await pipeline.generateOutput(taskId);
    console.log('[Workflow] Output generated');

    console.log('[Workflow] All steps completed successfully!');
  } catch (error) {
    console.error('[Workflow] Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

completeWorkflow();
