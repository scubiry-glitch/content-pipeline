// Database initialization script
// Run: npx tsx src/scripts/init-db.ts

import { initDatabase } from '../db/connection.js';

async function main() {
  console.log('[InitDB] Initializing database...');

  try {
    await initDatabase();
    console.log('[InitDB] Database initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[InitDB] Failed to initialize database:', error);
    process.exit(1);
  }
}

main();
