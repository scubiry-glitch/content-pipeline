import { config } from 'dotenv';
config({ path: './api/.env' });
import { query } from './api/src/db/connection.js';

await query(
  'UPDATE tasks SET status = $1, progress = $2, current_stage = $3, updated_at = NOW() WHERE id = $4',
  ['completed', 100, 'completed', 'task_1773715503898']
);
console.log('✅ 任务已完成');
