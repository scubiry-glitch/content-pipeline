#!/usr/bin/env tsx
// Stage 2: 深度研究 - task_1774210080319
// 严格使用 SiliconFlow (DeepSeek-V3.2)

import { query } from '../src/db/connection.js';
import { getLLMRouter, initLLMRouter } from '../src/providers/index.js';

const TASK_ID = 'task_1774210080319';

async function main() {
  console.log('[Stage2] Starting Deep Research for task:', TASK_ID);
  console.log('[Stage2] LLM Provider: SiliconFlow (DeepSeek-V3.2)');
  
  // 1. 初始化 LLM Router（强制使用 SiliconFlow）
  initLLMRouter({
    siliconFlowApiKey: process.env.SILICONFLOW_API_KEY,
  });
  
  const router = getLLMRouter();
  const providers = (router as any).providers;
  console.log('[Stage2] Registered providers:', Array.from(providers.keys()).join(', '));

  // 2. 获取任务数据
  const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [TASK_ID]);
  if (taskResult.rows.length === 0) {
    throw new Error('Task not found');
  }
  const task = taskResult.rows[0];
  
  console.log('[Stage2] Task topic:', task.topic);
  console.log('[Stage2] Outline sections:', task.outline?.sections?.length || 0);

  // 3. 更新任务状态为 researching
  await query(
    `UPDATE tasks SET status = 'researching', current_stage = 'collecting_data', progress = 20, updated_at = NOW() WHERE id = $1`,
    [TASK_ID]
  );
  console.log('[Stage2] Status updated: collecting_data');

  try {
    // 4. 使用 LLM 生成研究洞察（模拟数据采集和分析）
    console.log('[Stage2] Generating research insights with SiliconFlow...');
    
    const researchPrompt = `
你是一位资深的产业研究专家，正在为"${task.topic}"进行深度研究。

## 研究主题
${task.topic}

## 大纲结构
${JSON.stringify(task.outline?.sections?.map((s: any) => s.title) || [], null, 2)}

## 任务
基于以上主题和大纲，生成深度研究报告，包含：

1. **关键洞察 (insights)**: 5-8 个核心发现，每个包含：
   - type: "discovery" | "risk" | "opportunity" | "validation"
   - title: 洞察标题
   - description: 详细描述
   - confidence: 置信度 (0-1)

2. **数据点 (dataPoints)**: 8-10 个关键数据，每个包含：
   - source: 数据来源
   - content: 数据内容
   - metadata: { type: "web" | "rss" | "asset", isWebSource: boolean }

3. **关键发现 (keyFindings)**: 3-5 个简要结论

## 输出格式
输出 JSON 对象，格式如下：
{
  "insights": [...],
  "dataPoints": [...],
  "keyFindings": [...]
}
`;

    console.log('[Stage2] Calling SiliconFlow LLM...');
    const llmResult = await router.generate(researchPrompt, 'analysis', {
      temperature: 0.7,
      maxTokens: 4000,
    });
    console.log('[Stage2] LLM response received, length:', llmResult.content.length);

    // 5. 解析 LLM 输出
    let researchData: any;
    try {
      const jsonMatch = llmResult.content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       llmResult.content.match(/{[\s\S]*}/);
      if (jsonMatch) {
        researchData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        throw new Error('No JSON found in LLM response');
      }
    } catch (parseError) {
      console.error('[Stage2] Failed to parse LLM output:', parseError);
      console.log('[Stage2] Raw output:', llmResult.content.substring(0, 500));
      throw new Error('Research data parsing failed');
    }

    // 6. 添加元数据
    const finalResearchData = {
      ...researchData,
      searchStats: {
        webSources: researchData.dataPoints?.filter((d: any) => d.metadata?.isWebSource).length || 0,
        assetSources: researchData.dataPoints?.filter((d: any) => d.metadata?.type === 'asset').length || 0,
        generatedAt: new Date().toISOString(),
        llmProvider: 'siliconflow',
        llmModel: llmResult.model,
      },
      annotations: [],
      blue_team_experts: [],
    };

    console.log('[Stage2] Research data generated:');
    console.log('  - Insights:', finalResearchData.insights?.length || 0);
    console.log('  - DataPoints:', finalResearchData.dataPoints?.length || 0);
    console.log('  - KeyFindings:', finalResearchData.keyFindings?.length || 0);

    // 7. 更新任务状态到研究完成
    await query(
      `UPDATE tasks 
       SET status = 'writing', 
           current_stage = 'generating_draft',
           progress = 40,
           research_data = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(finalResearchData), TASK_ID]
    );
    console.log('[Stage2] ✅ Status updated: writing (Stage 3 ready)');

    process.exit(0);
  } catch (error) {
    console.error('[Stage2] ❌ Research failed:', error);
    
    await query(
      `UPDATE tasks SET status = 'failed', current_stage = 'research_failed', updated_at = NOW() WHERE id = $1`,
      [TASK_ID]
    );
    
    process.exit(1);
  }
}

main();
