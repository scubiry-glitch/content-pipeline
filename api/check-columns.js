import { query } from './src/db/connection.js';

async function checkColumns() {
  const r = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'expert_library' ORDER BY ordinal_position");
  console.log('Columns in expert_library:');
  r.rows.forEach(x => console.log('  - ' + x.column_name));
  process.exit(0);
}

checkColumns();
