// EventBusAdapter — Redis Pub/Sub 实现
// 独立部署模式使用，跨进程事件通信

import type { EventBusAdapter } from '../types.js';

/**
 * Redis Pub/Sub EventBus 适配器
 *
 * 独立部署时使用，需注入 Redis 客户端。
 * 接口与 LocalEventBus 完全一致，通过构造函数注入切换。
 *
 * 使用方式:
 * ```typescript
 * import Redis from 'ioredis';
 * const pub = new Redis(redisUrl);
 * const sub = new Redis(redisUrl);
 * const eventBus = new RedisEventBus(pub, sub);
 * ```
 */
export class RedisEventBus implements EventBusAdapter {
  private publisher: any;
  private subscriber: any;
  private handlers: Map<string, (payload: any) => Promise<void>>;

  constructor(publisher: any, subscriber: any) {
    this.publisher = publisher;
    this.subscriber = subscriber;
    this.handlers = new Map();

    // 统一消息处理
    this.subscriber.on('message', (channel: string, message: string) => {
      const handler = this.handlers.get(channel);
      if (handler) {
        try {
          const payload = JSON.parse(message);
          handler(payload).catch(err => {
            console.error(`[RedisEventBus] Error handling event ${channel}:`, err);
          });
        } catch (err) {
          console.error(`[RedisEventBus] Failed to parse message on ${channel}:`, err);
        }
      }
    });
  }

  async publish(event: string, payload: any): Promise<void> {
    await this.publisher.publish(event, JSON.stringify(payload));
  }

  subscribe(event: string, handler: (payload: any) => Promise<void>): void {
    this.handlers.set(event, handler);
    this.subscriber.subscribe(event);
  }

  unsubscribe(event: string): void {
    this.handlers.delete(event);
    this.subscriber.unsubscribe(event);
  }
}
