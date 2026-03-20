import { config } from 'dotenv';
config({ path: './api/.env' });
import { query } from './api/src/db/connection.js';

const result = await query(
  'SELECT research_data FROM tasks WHERE id = $1',
  ['task_1773715503898']
);

console.log('数据库中的研究数据:');
console.log(JSON.stringify(result.rows[0]?.research_data, null, 2));
