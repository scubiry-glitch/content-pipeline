import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
});

const indexes = [
  ['idx_mn_open_questions_meetings', `CREATE INDEX IF NOT EXISTS idx_mn_open_questions_meetings ON mn_open_questions(first_raised_meeting_id, last_raised_meeting_id)`],
] as const;

for (const [name, q] of indexes) {
  try {
    await pool.query(q);
    console.log(`✓ ${name}`);
  } catch (e: any) {
    console.error(`✗ ${name}: ${(e as Error).message}`);
  }
}
await pool.end();
