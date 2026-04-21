// One-shot: apply migration 026 + upsert taxonomyData.ts into taxonomy_domains.
// Usage: npm run taxonomy:sync

import 'dotenv/config';
import { ensureDbPoolConnected, closePool } from '../db/connection.js';
import { ensureTaxonomySchema, sync } from '../services/taxonomyService.js';

async function main() {
  await ensureDbPoolConnected();
  await ensureTaxonomySchema();
  const { upserted } = await sync('cli');
  console.log(`[taxonomy] sync complete: ${upserted} nodes upserted`);
  await closePool();
}

main().catch(async (err) => {
  console.error('[taxonomy] sync failed:', err);
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
