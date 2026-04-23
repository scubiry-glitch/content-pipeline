// MeetingNotesEngine — 单例管理
// 与 content-library / expert-library singleton 模式一致

import { MeetingNotesEngine } from './MeetingNotesEngine.js';

let _engine: MeetingNotesEngine | null = null;

export function initMeetingNotesEngineSingleton(engine: MeetingNotesEngine): void {
  _engine = engine;
  console.log('[MeetingNotes] Engine singleton initialized');
}

export function getMeetingNotesEngine(): MeetingNotesEngine {
  if (!_engine) {
    throw new Error('[MeetingNotes] Engine not initialized. Call initMeetingNotesEngineSingleton() first.');
  }
  return _engine;
}

export function isMeetingNotesInitialized(): boolean {
  return _engine !== null;
}
