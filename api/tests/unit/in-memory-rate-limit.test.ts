import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../src/utils/inMemoryRateLimit.js';

describe('createRateLimiter', () => {
  it('allows up to max within window', () => {
    const rl = createRateLimiter({ max: 3, windowMs: 1000 });
    const t0 = 1_000_000;
    expect(rl.tryConsume('u1', t0).allowed).toBe(true);
    expect(rl.tryConsume('u1', t0 + 100).allowed).toBe(true);
    expect(rl.tryConsume('u1', t0 + 200).allowed).toBe(true);
    expect(rl.tryConsume('u1', t0 + 300).allowed).toBe(false);
  });

  it('returns retry-after seconds when blocked', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 });
    const t0 = 0;
    rl.tryConsume('u1', t0);
    const r = rl.tryConsume('u1', t0 + 5000);
    expect(r.allowed).toBe(false);
    // window 60s, 5s 已过 → 还需要 ~55s
    expect(r.retryAfterSec).toBeGreaterThan(50);
    expect(r.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('resets after window elapses', () => {
    const rl = createRateLimiter({ max: 2, windowMs: 1000 });
    const t0 = 0;
    rl.tryConsume('u1', t0);
    rl.tryConsume('u1', t0 + 100);
    expect(rl.tryConsume('u1', t0 + 200).allowed).toBe(false);
    // 跨过窗口
    expect(rl.tryConsume('u1', t0 + 1100).allowed).toBe(true);
  });

  it('isolates buckets by key', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    const t0 = 0;
    expect(rl.tryConsume('u1', t0).allowed).toBe(true);
    expect(rl.tryConsume('u2', t0).allowed).toBe(true);
    expect(rl.tryConsume('u1', t0).allowed).toBe(false);
    expect(rl.tryConsume('u2', t0).allowed).toBe(false);
  });

  it('reset(key) clears that bucket only', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    const t0 = 0;
    rl.tryConsume('u1', t0);
    rl.tryConsume('u2', t0);
    rl.reset('u1');
    expect(rl.tryConsume('u1', t0).allowed).toBe(true);
    expect(rl.tryConsume('u2', t0).allowed).toBe(false);
  });

  it('throws on invalid options', () => {
    expect(() => createRateLimiter({ max: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ max: 1, windowMs: 0 })).toThrow();
  });
});
