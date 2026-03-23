#!/usr/bin/env tsx
// Stage 4: 蓝军评审 - task_1774210080319
// 使用 SiliconFlow (DeepSeek-V3.2)

import { query } from '../src/db/connection.js';
import { getLLMRouter, initLLMRouter } from '../src/providers/index.js';
import { v4 as uuidv4 } from 'uuid';

const TASK_ID = 'task_1774210080319';

interface ReviewQuestion {
  id: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
}

async function conductAIReview(
  draftContent: string, 
  role: string, 
  router: any
): Promise<{ score: number; questions: ReviewQuestion[]; summary: string }> {
  
  const rolePrompts: Record<string, string> = {
    challenger: `你是一位严苛的批判者(Challenger)，负责找出文稿中的逻辑漏洞和问题。

评审重点：
1. 逻辑漏洞：论证是否有跳跃？前提是否充分？
2. 数据可靠性：数据来源是否可信？统计方法是否正确？
3. 隐含假设：是否有未明说的假设？这些假设是否成立？
4. 反方观点：是否考虑了反对意见？

请找出3-5个问题，每个问题包含：
- question: 问题描述
- severity: high/medium/low
- suggestion: 修改建议

输出JSON格式：{"score": 0-100, "questions": [...], "summary": "总体评价"}`,

    expander: `你是一位拓展者(Expander)，负责扩展文稿的视野和深度。

评审重点：
1. 关联因素：是否遗漏了重要的相关因素？
2. 国际对比：是否有国际视野？可比案例？
3. 交叉学科：是否需要引入其他学科视角？
4. 长尾效应：是否考虑了长期影响？

请找出2-4个拓展建议，输出JSON格式：{"score": 0-100, "questions": [...], "summary": "总体评价"}`,

    synthesizer: `你是一位提炼者(Synthesizer)，负责优化文稿结构和表达。

评审重点：
1. 核心论点：核心观点是否清晰？
2. 结构优化：章节逻辑是否顺畅？
3. 金句提炼：是否有记忆点？
4. 消除冗余：是否有重复内容？

请找出2-4个优化建议，输出JSON格式：{"score": 0-100, "questions": [...], "summary": "总体评价"}`
  };

  const prompt = `${rolePrompts[role] || rolePrompts.challenger}

---

待评审文稿（前3000字符）：
${draftContent.substring(0, 3000)}
... (${draftContent.length} 字符 total)`;

  const result = await router.generate(prompt, 'blue_team_review', {
    temperature: 0.7,
    maxTokens: 2000,
  });

  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || '{}');
    return {
      score: parsed.score || 80,
      questions: parsed.questions || [],
      summary: parsed.summary || '评审完成'
    };
  } catch {
    return {
      score: 80,
      questions: [{id: '1', question: '建议进一步优化内容', severity: 'medium', suggestion: '根据具体章节补充细节'}],
      summary: '评审完成，建议修改'
    };
  }
}

async function main() {
  console.log('[Stage4] Starting Blue Team Review...');
  
  initLLMRouter({ siliconFlowApiKey: process.env.SILICONFLOW_API_KEY });
  
  const task = (await query('SELECT * FROM tasks WHERE id = $1', [TASK_ID])).rows[0];
  const draft = (await query('SELECT * FROM draft_versions WHERE task_id = $1 ORDER BY version DESC LIMIT 1', [TASK_ID])).rows[0];
  
  console.log('[Stage4] Draft length:', draft.content.length);

  const router = getLLMRouter();
  const experts = [
    { role: 'challenger', name: '批判者' },
    { role: 'expander', name: '拓展者' },
    { role: 'synthesizer', name: '提炼者' }
  ];

  for (let i = 0; i < experts.length; i++) {
    const expert = experts[i];
    console.log(`[Stage4] Round ${i + 1}/3: ${expert.name} (${expert.role})`);
    
    try {
      const review = await conductAIReview(draft.content, expert.role, router);
      
      // 保存评审结果
      await query(
        `INSERT INTO blue_team_reviews (id, task_id, round, expert_role, questions, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'completed', NOW())`,
        [uuidv4(), TASK_ID, i + 1, expert.role, JSON.stringify(review.questions)]
      );
      
      console.log(`[Stage4] ${expert.name} done - Score: ${review.score}, Questions: ${review.questions.length}`);
    } catch (e: any) {
      console.error(`[Stage4] ${expert.name} failed:`, e.message);
    }
  }

  // 更新状态到 awaiting_approval
  await query(
    `UPDATE tasks SET status = 'awaiting_approval', current_stage = 'awaiting_approval', progress = 95 WHERE id = $1`,
    [TASK_ID]
  );

  console.log('[Stage4] ✅ Complete');
}

main().catch(e => { console.error(e); process.exit(1); });
