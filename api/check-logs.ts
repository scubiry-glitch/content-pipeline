import { query } from './src/db/connection';

async function check() {
  const result = await query('SELECT * FROM rss_fetch_logs ORDER BY fetched_at DESC LIMIT 10');
  console.log('Fetch logs:');
  console.log(result.rows);

  const count = await query('SELECT COUNT(*) FROM rss_fetch_logs');
  console.log('\nTotal logs:', count.rows[0].count);
}

check();
