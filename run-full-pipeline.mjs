// 完整跑通生产流水线
import { config } from 'dotenv';
config({ path: './api/.env' });

import { PipelineService } from './api/src/services/pipeline.js';
import { query } from './api/src/db/connection.js';

const TOPIC = '保租房REITs市场深度分析';
const pipeline = new PipelineService();

console.log('=== 开始完整生产流水线 ===\n');
console.log('选题:', TOPIC);
console.log('');

// Step 1: 创建任务并生成大纲
console.log('Step 1: 创建任务并生成大纲...');
const createResult = await pipeline.createTask({
  topic: TOPIC,
  sourceMaterials: [],
  targetFormats: ['markdown']
});
console.log('✅ 任务创建成功:', createResult.id);
console.log('   状态:', createResult.status);
console.log('   大纲标题:', createResult.outline?.title);
console.log('   大纲章节数:', createResult.outline?.sections?.length);
console.log('');

const taskId = createResult.id;

// Step 2: 确认大纲并执行研究
console.log('Step 2: 执行深度研究...');
await pipeline.confirmOutline(taskId);
console.log('   大纲已确认，研究进行中...');

// 等待研究完成
await new Promise(r => setTimeout(r, 5000));
const taskAfterResearch = await pipeline.getTask(taskId);
console.log('✅ 研究完成');
console.log('   研究洞察数:', taskAfterResearch.research_data?.insights?.length || 0);
console.log('   数据点数:', taskAfterResearch.research_data?.dataPoints?.length || 0);
console.log('');

// Step 3: 生成文稿
console.log('Step 3: 生成文稿...');
const draft = await pipeline.write(taskId);
console.log('✅ 初稿生成完成');
console.log('   初稿长度:', draft.length, '字符');
console.log('   前200字符:', draft.substring(0, 200));
console.log('');

// Step 4: 蓝军评审
console.log('Step 4: 执行蓝军评审...');
const reviewResult = await pipeline.review(taskId);
console.log('✅ 蓝军评审完成');
console.log('   评审轮数:', reviewResult.blueTeamHistory?.length);
console.log('   最终版本:', reviewResult.finalVersion);
console.log('');

// 检查最终状态
const finalTask = await pipeline.getTask(taskId);
const draftsResult = await query(
  'SELECT version, LENGTH(content) as len FROM draft_versions WHERE task_id = $1 ORDER BY version',
  [taskId]
);
const reviewsResult = await query(
  'SELECT round, expert_role, questions FROM blue_team_reviews WHERE task_id = $1',
  [taskId]
);

console.log('=== 流水线完成总结 ===');
console.log('任务ID:', taskId);
console.log('状态:', finalTask.status);
console.log('稿件版本:', draftsResult.rows.length);
draftsResult.rows.forEach(d => console.log(`  - v${d.version}: ${d.len} 字符`));
console.log('评审记录:', reviewsResult.rows.length);
reviewsResult.rows.forEach(r => {
  const qCount = Array.isArray(r.questions) ? r.questions.length : 0;
  console.log(`  - ${r.expert_role} (轮次${r.round}): ${qCount} 个问题`);
});

console.log('\n访问地址:');
console.log('  前端:', `http://localhost:5173/tasks/${taskId}`);
console.log('  API:', `http://localhost:3000/api/v1/production/${taskId}`);
