#!/usr/bin/env tsx
// Stage 4: 蓝军评审 - task_344e35af
// 严格使用 DASHBOARD_LLM_MODEL (k2p5)

import { query } from '../src/db/connection.js';
import { getLLMRouter, initLLMRouter } from '../src/providers/index.js';
import { startSequentialReview } from '../src/services/sequentialReview.js';

const TASK_ID = 'task_344e35af';

async function main() {
  console.log('[Stage4] Starting Blue Team Review for task:', TASK_ID);
  
  // 1. 初始化 LLM Router（强制使用 DashboardLLM）
  console.log('[Stage4] Initializing LLM Router with DashboardLLM (k2p5)...');
  initLLMRouter({
    dashboardLlmToken: process.env.LLM_API_TOKEN,
    dashboardLlmBaseUrl: process.env.LLM_API_BASE_URL,
  });
  console.log('[Stage4] LLM Router initialized');

  // 2. 获取任务和稿件
  const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [TASK_ID]);
  if (taskResult.rows.length === 0) {
    throw new Error('Task not found');
  }
  const task = taskResult.rows[0];

  // 3. 获取最新稿件
  const draftResult = await query(
    'SELECT * FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1',
    [TASK_ID]
  );
  if (draftResult.rows.length === 0) {
    throw new Error('No draft found');
  }
  const draft = draftResult.rows[0];
  
  console.log('[Stage4] Draft version:', draft.version);
  console.log('[Stage4] Draft length:', draft.content?.length || 0, 'chars');

  // 4. 启动串行评审
  console.log('[Stage4] Starting sequential review...');
  console.log('[Stage4] Expert queue: 批判者 → 拓展者 → 提炼者');
  
  try {
    const result = await startSequentialReview(TASK_ID, draft.id, draft.content);
    
    if (result.success) {
      console.log('[Stage4] ✅ Review process started:', result.message);
      
      // 5. 轮询等待评审完成
      console.log('[Stage4] Waiting for review completion...');
      let completed = false;
      let attempts = 0;
      const maxAttempts = 30;
      
      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
        const progressResult = await query(
          'SELECT * FROM task_review_progress WHERE task_id = $1',
          [TASK_ID]
        );
        
        if (progressResult.rows.length > 0) {
          const progress = progressResult.rows[0];
          const status = progress.status;
          const currentRound = progress.current_round || 0;
          const totalRounds = progress.total_rounds;
          
          console.log(`[Stage4] Progress: Round ${currentRound}/${totalRounds}, Status: ${status}`);
          
          if (status === 'completed') {
            completed = true;
            console.log('[Stage4] ✅ All review rounds completed!');
          } else if (status === 'failed') {
            throw new Error('Review process failed');
          }
        }
      }
      
      if (!completed) {
        console.log('[Stage4] ⚠️ Review timeout, but process is running in background');
      }
      
      // 6. 更新任务状态到 awaiting_approval（等待人工确认）
      await query(
        `UPDATE tasks 
         SET status = 'awaiting_approval', 
             current_stage = 'awaiting_approval',
             progress = 95,
             updated_at = NOW()
         WHERE id = $1`,
        [TASK_ID]
      );
      console.log('[Stage4] Task status updated to awaiting_approval');
      
    } else {
      throw new Error(result.message);
    }

    process.exit(0);
  } catch (error) {
    console.error('[Stage4] ❌ Review failed:', error);
    process.exit(1);
  }
}

main();
