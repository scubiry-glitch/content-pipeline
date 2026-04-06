// Content Library Engine — 单例管理
// 与 Expert Library singleton.ts 模式一致

import { ContentLibraryEngine } from './ContentLibraryEngine.js';

let _engine: ContentLibraryEngine | null = null;

export function initContentLibraryEngineSingleton(engine: ContentLibraryEngine): void {
  _engine = engine;
  console.log('[ContentLibrary] Engine singleton initialized');
}

export function getContentLibraryEngine(): ContentLibraryEngine {
  if (!_engine) {
    throw new Error('[ContentLibrary] Engine not initialized. Call initContentLibraryEngineSingleton() first.');
  }
  return _engine;
}

export function isContentLibraryInitialized(): boolean {
  return _engine !== null;
}
