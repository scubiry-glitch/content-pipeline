// Expert Engine Singleton — 跨模块共享实例
// 用于 blueTeam.ts / sequentialReview.ts 等模块访问 CDT 能力

import type { ExpertEngine } from './ExpertEngine.js';

let _engine: ExpertEngine | null = null;

/**
 * 由 server.ts 在启动时注入（createExpertEngine 之后立即调用）
 */
export function initExpertEngineSingleton(engine: ExpertEngine): void {
  _engine = engine;
}

/**
 * 获取 ExpertEngine 实例；若未初始化返回 null（调用方负责 fallback）
 */
export function getExpertEngine(): ExpertEngine | null {
  return _engine;
}
