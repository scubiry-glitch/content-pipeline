#!/usr/bin/env tsx
// 直接执行大纲生成脚本 - 使用 DashboardLLM

import { getStreamingOutlineService } from '../src/services/streamingOutline.js';
import { query } from '../src/db/connection.js';
import { getLLMRouter, initLLMRouter } from '../src/providers/index.js';

const TASK_ID = 'task_ba147b83';

async function main() {
  console.log('[GenerateOutline] Starting outline generation...');
  console.log('[GenerateOutline] Task ID:', TASK_ID);
  
  // 初始化 LLM Router（注册 Dashboard LLM Provider）
  console.log('[GenerateOutline] Initializing LLM Router with DashboardLLM...');
  initLLMRouter({
    dashboardLlmToken: process.env.LLM_API_TOKEN,
    dashboardLlmBaseUrl: process.env.LLM_API_BASE_URL,
  });
  
  // 验证 Router 状态
  const router = getLLMRouter();
  console.log('[GenerateOutline] LLM Router initialized');

  const service = getStreamingOutlineService();

  const config = {
    taskId: TASK_ID,
    topic: '跨境电商Temu模式分析',
    context: '结合2024年最新出海数据和竞争格局',
    targetAudience: '产业研究人员和投资者',
    desiredDepth: 'comprehensive' as const,
    options: {
      enableStreaming: true,
      saveProgress: true,
    },
  };

  try {
    const result = await service.generateOutlineStreaming(
      config,
      (progress) => {
        console.log(`[Progress] ${progress.currentLayer}: ${progress.status}`);
        if (progress.layers) {
          progress.layers.forEach(layer => {
            if (layer.sections.length > 0) {
              console.log(`  - ${layer.title}: ${layer.sections.length} sections (${layer.status})`);
            }
          });
        }
      }
    );

    console.log('\n[GenerateOutline] ✅ Generation completed!');
    console.log(`[GenerateOutline] Total sections: ${result.outline.length}`);
    
    // 统计各层章节数
    result.layers.forEach(layer => {
      console.log(`[GenerateOutline] ${layer.title}: ${layer.sections.length} sections`);
    });

    // 保存到数据库
    await query(
      `UPDATE tasks SET outline = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({
        title: result.outline[0]?.title || config.topic,
        sections: result.outline,
      }), TASK_ID]
    );
    console.log('[GenerateOutline] Saved to database');

    process.exit(0);
  } catch (error) {
    console.error('[GenerateOutline] ❌ Generation failed:', error);
    process.exit(1);
  }
}

main();
