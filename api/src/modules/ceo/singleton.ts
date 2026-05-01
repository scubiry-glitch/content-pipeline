// CEO Engine — 单例管理
// 与 expert-library / content-library / meeting-notes singleton.ts 模式一致

import type { CeoEngine } from './CeoEngine.js';

let _engine: CeoEngine | null = null;

export function initCeoEngineSingleton(engine: CeoEngine): void {
  _engine = engine;
  console.log('[CEO] Engine singleton initialized');
}

export function getCeoEngine(): CeoEngine {
  if (!_engine) {
    throw new Error('[CEO] Engine not initialized. Call initCeoEngineSingleton() first.');
  }
  return _engine;
}

export function isCeoInitialized(): boolean {
  return _engine !== null;
}
