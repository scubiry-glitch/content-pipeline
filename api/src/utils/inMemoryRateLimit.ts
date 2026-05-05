// 简单的进程内滑动窗口限速器
// 用途:对低频敏感端点(如 import / share create)做 per-key 配额限制
//
// 适用范围:单实例 / 开发环境;生产多实例需要 redis 计数器才准确。
// 与 utils/queue-simple.ts 同样的"单进程内存"权宜,等需要再升级。
//
// 用法:
//   const limiter = createRateLimiter({ max: 60, windowMs: 60 * 60 * 1000 });
//   const r = limiter.tryConsume(userId);
//   if (!r.allowed) reply.code(429).header('Retry-After', r.retryAfterSec).send(...);

export interface RateLimitOptions {
  /** 窗口内允许的最大次数 */
  max: number;
  /** 窗口长度 (ms) */
  windowMs: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** 当前窗口内已消耗次数(成功的请求 + 当前这次,如果允许) */
  count: number;
  /** 距窗口重置还有多少秒 */
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimiter {
  tryConsume(key: string, now?: number): ConsumeResult;
  /** 重置某 key 的计数(测试 / admin 用) */
  reset(key: string): void;
  /** 仅供测试观察当前 buckets */
  _peek(): Map<string, Bucket>;
}

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const { max, windowMs } = opts;
  if (max < 1) throw new Error('max must be >= 1');
  if (windowMs < 1) throw new Error('windowMs must be >= 1');

  const buckets = new Map<string, Bucket>();

  function tryConsume(key: string, nowArg?: number): ConsumeResult {
    const now = nowArg ?? Date.now();
    let b = buckets.get(key);
    if (!b || now - b.windowStart >= windowMs) {
      b = { count: 0, windowStart: now };
      buckets.set(key, b);
    }
    if (b.count >= max) {
      const remaining = b.windowStart + windowMs - now;
      return {
        allowed: false,
        count: b.count,
        retryAfterSec: Math.max(1, Math.ceil(remaining / 1000)),
      };
    }
    b.count += 1;
    return {
      allowed: true,
      count: b.count,
      retryAfterSec: Math.max(0, Math.ceil((b.windowStart + windowMs - now) / 1000)),
    };
  }

  function reset(key: string) {
    buckets.delete(key);
  }

  return { tryConsume, reset, _peek: () => buckets };
}
