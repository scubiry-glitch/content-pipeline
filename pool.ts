/**
 * Connection Pool Configuration
 * Workstream C: Connection Pooling and Resilience Patterns
 */
import { Pool, PoolClient } from 'pg';
import { config } from './config';
import { logger } from './logger';

// Circuit breaker state
interface CircuitBreaker {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreaker: CircuitBreaker = {
  failures: 0,
  lastFailure: 0,
  state: 'closed',
};

const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RECOVERY = 30000; // 30 seconds

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.sslMode === 'require' ? { rejectUnauthorized: false } : false,

  // Pool sizing
  min: config.pool.min,
  max: config.pool.max,

  // Timeouts
  idleTimeoutMillis: config.pool.idleTimeout,
  connectionTimeoutMillis: config.pool.timeout,

  // Connection recycling
  maxUses: 1000,
});

// Event handlers
pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= CIRCUIT_THRESHOLD) {
    circuitBreaker.state = 'open';
    logger.error('Circuit breaker opened');
  }
});

// Exponential backoff retry
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    // Check circuit breaker
    if (circuitBreaker.state === 'open') {
      const elapsed = Date.now() - circuitBreaker.lastFailure;
      if (elapsed < CIRCUIT_RECOVERY) {
        throw new Error('Circuit breaker is open');
      }
      circuitBreaker.state = 'half-open';
    }

    try {
      const result = await operation();

      // Success - reset circuit breaker
      if (circuitBreaker.state !== 'closed') {
        circuitBreaker.state = 'closed';
        circuitBreaker.failures = 0;
        logger.info('Circuit breaker closed');
      }

      return result;
    } catch (err) {
      lastError = err as Error;

      // Don't retry on fatal errors
      if (isFatalError(lastError)) {
        throw lastError;
      }

      const delay = Math.pow(2, i) * 100; // 100ms, 200ms, 400ms
      logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError!;
}

function isFatalError(err: Error): boolean {
  const fatalCodes = ['28P01', '3D000', '42501']; // auth, db not found, permission
  return fatalCodes.some(code => err.message.includes(code));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  logger.info('Closing database pool...');
  await pool.end();
  logger.info('Database pool closed');
}

// Health check
export async function checkHealth(): Promise<{ healthy: boolean; latency: number }> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query('SELECT 1 as health_check, now() as server_time');
    client.release();
    return { healthy: true, latency: Date.now() - start };
  } catch (err) {
    return { healthy: false, latency: Date.now() - start };
  }
}
