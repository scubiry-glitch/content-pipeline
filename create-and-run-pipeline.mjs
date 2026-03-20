import { config } from 'dotenv';
config({ path: './api/.env' });
import { PipelineService } from './api/src/services/pipeline.js';
import { query } from './api/src/db/connection.js';

const pipeline = new PipelineService();
const TOPIC = 'AI芯片产业投资分析';

console.log('=== 完整生产流水线演示 ===\n');
console.log('选题:', TOPIC);
console.log('');

// Step 1: 创建任务
console.log('Step 1: 创建任务并生成大纲...');
const task = await pipeline.createTask({
  topic: TOPIC,
  sourceMaterials: [],
  targetFormats: ['markdown']
});
console.log('✅ 任务创建:', task.id);
console.log('   大纲标题:', task.outline?.title);
console.log('   章节数:', task.outline?.sections?.length);
console.log('');

// 输出任务ID供后续使用
console.log('TASK_ID=' + task.id);
