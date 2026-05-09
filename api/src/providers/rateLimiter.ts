// providers/rateLimiter.ts — 全局共享的 token-bucket，控制每个 provider 的对外调用速率。
//
// 上下文：火山引擎 deepseek-v3-2 单账号 RPM 上限 60-120，多 axis × 多 chunks
// 并发起飞会瞬时打爆 → 大量 429 ModelAccountRpmRateLimitExceeded。
// 旧 retry 策略（_shared.ts:240）失败后立即 retry 一次、不带 backoff，
// 也救不回。
//
// 本模块是共享 singleton：同一进程里所有 axis（commitments / role_trajectory / ...）
// 走同一个 provider 时共用同一只桶，绝不会"轴 A 把桶打空，轴 B 不知道还在猛打"。
//
// 算法：每秒补 capacity 个 token；上限不超过 capacity（不积攒）。请求来时
// 等到有 token 就立刻消费 1 个。等待用 setTimeout 让出事件循环，不会阻塞。
//
// 配置：每个 provider 一个 bucket，由 getProviderBucket(name, capacity) lazy 创建。
// 默认 RPM 配置从 run-routing.json `providers[name].rps` 读，未配置则 60 RPS（不限速）。

const buckets = new Map<string, TokenBucket>();

interface ProviderRateConfig {
  /** 每秒补 token 数（也是 burst 上限） */
  rps?: number;
}

interface RoutingConfigShape {
  providers?: Record<string, ProviderRateConfig>;
}

let _routingConfig: RoutingConfigShape | null | undefined;

function loadRoutingConfig(): RoutingConfigShape {
  if (_routingConfig !== undefined) return _routingConfig ?? {};
  try {
    // 用 require 而非 import — 配置加载是运行时一次性，require cache 即可，
    // 避免顶层 await 把 module init 拖成异步。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolve } = require('node:path') as typeof import('node:path');
    const path = resolve(process.cwd(), 'config/run-routing.json');
    const txt = readFileSync(path, 'utf8');
    _routingConfig = JSON.parse(txt) as RoutingConfigShape;
  } catch {
    _routingConfig = null;
  }
  return _routingConfig ?? {};
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private waiters: Array<() => void> = [];

  constructor(public readonly capacity: number, public readonly rps: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    const add = elapsed * this.rps;
    this.tokens = Math.min(this.capacity, this.tokens + add);
    this.lastRefill = now;
  }

  /** 等待并消费 1 个 token；如果当前没有就排队，按 FIFO 补到就唤醒。 */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1 && this.waiters.length === 0) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.scheduleNext();
    });
  }

  private scheduleNext(): void {
    if (this.waiters.length === 0) return;
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      const next = this.waiters.shift()!;
      next();
      // 让出一帧再处理下一个，避免一次 refill 大量积压一次性放出去
      setImmediate(() => this.scheduleNext());
      return;
    }
    // 还差多少 token 才到 1，按 rps 倒推等待时间
    const need = 1 - this.tokens;
    const waitMs = Math.max(20, Math.ceil((need / this.rps) * 1000));
    setTimeout(() => this.scheduleNext(), waitMs);
  }
}

/**
 * 取一个 provider 的全局 token-bucket。
 * 第一次调用时按 run-routing.json 的 `providers[name].rps` lazy 建桶。
 * 配置不存在时返回 null（调用方跳过限流）。
 */
export function getProviderBucket(name: string): TokenBucket | null {
  let b = buckets.get(name);
  if (b) return b;
  const cfg = loadRoutingConfig();
  const rps = cfg.providers?.[name]?.rps;
  if (typeof rps !== 'number' || rps <= 0) return null;
  b = new TokenBucket(rps, rps);
  buckets.set(name, b);
  return b;
}

/** 测试 / 运维：手动注册一个 bucket（覆盖配置）。 */
export function registerProviderBucket(name: string, rps: number): TokenBucket {
  const b = new TokenBucket(rps, rps);
  buckets.set(name, b);
  return b;
}

/** 测试用：清空所有 bucket，便于 unit test 复位。 */
export function _resetBucketsForTest(): void {
  buckets.clear();
  _routingConfig = undefined;
}
