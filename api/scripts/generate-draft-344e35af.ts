#!/usr/bin/env tsx
// Stage 3: 流式文稿生成 - task_344e35af
// 严格使用 DASHBOARD_LLM_MODEL (k2p5)

import { query } from '../src/db/connection.js';
import { getLLMRouter, initLLMRouter } from '../src/providers/index.js';
import { generateDraftStreaming } from '../src/services/streamingDraft.js';

const TASK_ID = 'task_344e35af';

async function main() {
  console.log('[Stage3] Starting draft generation for task:', TASK_ID);
  
  // 1. 初始化 LLM Router（强制使用 DashboardLLM）
  console.log('[Stage3] Initializing LLM Router with DashboardLLM (k2p5)...');
  initLLMRouter({
    dashboardLlmToken: process.env.LLM_API_TOKEN,
    dashboardLlmBaseUrl: process.env.LLM_API_BASE_URL,
  });
  console.log('[Stage3] LLM Router initialized');

  // 2. 获取任务数据
  const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [TASK_ID]);
  if (taskResult.rows.length === 0) {
    throw new Error('Task not found');
  }
  const task = taskResult.rows[0];
  
  console.log('[Stage3] Task topic:', task.topic);
  console.log('[Stage3] Outline sections:', task.outline?.sections?.length || 0);
  console.log('[Stage3] Research insights:', task.research_data?.insights?.length || 0);

  // 3. 执行流式文稿生成
  console.log('[Stage3] Starting streaming draft generation...');
  
  try {
    const result = await generateDraftStreaming(
      {
        taskId: TASK_ID,
        topic: task.topic,
        outline: task.outline,
        researchData: task.research_data,
        style: 'formal',
        options: {
          includeContext: true,
          realtimePreview: true,
          saveProgress: true,
        },
      },
      (progress) => {
        const percent = Math.round((progress.currentIndex / progress.total) * 100);
        console.log(
          `[Progress] ${percent}% - Section ${progress.currentIndex + 1}/${progress.total}: ${progress.currentTitle} (${progress.generatedWordCount} words)`
        );
      }
    );

    console.log('\n[Stage3] ✅ Draft generation completed!');
    console.log(`[Stage3] Total sections: ${result.sections.length}`);
    console.log(`[Stage3] Total word count: ${result.content.length}`);

    // 4. 保存到 draft_versions 表
    await query(
      `INSERT INTO draft_versions (id, task_id, version, content, change_summary, created_at)
       VALUES (gen_random_uuid(), $1, 1, $2, 'Initial draft generated via streaming', NOW())`,
      [TASK_ID, result.content]
    );
    console.log('[Stage3] Draft saved to draft_versions table');

    // 5. 更新任务状态到 Stage 4
    await query(
      `UPDATE tasks 
       SET status = 'reviewing', 
           current_stage = 'blue_team_review',
           progress = 60,
           updated_at = NOW()
       WHERE id = $1`,
      [TASK_ID]
    );
    console.log('[Stage3] Task status updated to reviewing (Stage 4)');

    process.exit(0);
  } catch (error) {
    console.error('[Stage3] ❌ Draft generation failed:', error);
    
    // 更新任务状态为失败
    await query(
      `UPDATE tasks 
       SET status = 'failed', 
           current_stage = 'draft_failed',
           updated_at = NOW()
       WHERE id = $1`,
      [TASK_ID]
    );
    
    process.exit(1);
  }
}

main();
