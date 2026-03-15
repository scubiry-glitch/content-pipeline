/**
 * Integration Tests
 * Workstream D: Integration Testing and Health Checks
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool, checkHealth, closePool, withRetry } from './pool';

describe('Database Health', () => {
  it('should return healthy status when database is accessible', async () => {
    const result = await checkHealth();
    expect(result.healthy).toBe(true);
    expect(result.latency).toBeLessThan(1000);
  });

  it('should measure query latency', async () => {
    const start = Date.now();
    await pool.query('SELECT pg_sleep(0.1)');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});

describe('Connection Pool', () => {
  it('should handle concurrent connections', async () => {
    const promises = Array(5).fill(null).map(() =>
      pool.query('SELECT 1')
    );
    const results = await Promise.all(promises);
    expect(results).toHaveLength(5);
  });

  it('should retry failed operations', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Temporary error');
      }
      return 'success';
    });
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});

describe('Transactions', () => {
  it('should commit transactions successfully', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE test_table (id serial, name text)');
      await client.query("INSERT INTO test_table (name) VALUES ('test')");
      const result = await client.query('SELECT * FROM test_table');
      await client.query('COMMIT');
      expect(result.rows).toHaveLength(1);
    } finally {
      client.release();
    }
  });

  it('should rollback failed transactions', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE test_table2 (id serial)');
      await client.query('INSERT INTO test_table2 DEFAULT VALUES');
      await client.query('ROLLBACK');

      // Verify rollback
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM pg_tables
          WHERE tablename = 'test_table2'
        )
      `);
      expect(result.rows[0].exists).toBe(false);
    } finally {
      client.release();
    }
  });
});

// Cleanup
afterAll(async () => {
  await closePool();
});
