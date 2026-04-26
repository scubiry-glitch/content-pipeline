// Meeting Notes Module — 统一导出 + 工厂函数
// 嵌入式: import { createMeetingNotesEngine } from './modules/meeting-notes'
// 独立部署: import { createStandaloneServer } from '@content-pipeline/meeting-notes'

import { MeetingNotesEngine } from './MeetingNotesEngine.js';
import { createRouter } from './router.js';
import type {
  MeetingNotesDeps,
  MeetingNotesOptions,
  StandaloneConfig,
} from './types.js';

// ===== 工厂函数 =====

export function createMeetingNotesEngine(
  deps: MeetingNotesDeps,
  options?: MeetingNotesOptions,
): MeetingNotesEngine {
  return new MeetingNotesEngine(deps, options);
}

export async function createStandaloneServer(config: StandaloneConfig): Promise<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
}> {
  const { createStandalone } = await import('./standalone.js');
  return createStandalone(config);
}

// ===== 导出 =====

export { MeetingNotesEngine } from './MeetingNotesEngine.js';
export { createRouter } from './router.js';

// Adapters
export { LocalEventBus } from './adapters/local-event-bus.js';
export { PostgresTextSearch } from './adapters/postgres-text-search.js';
export {
  createLocalAssetsAiAdapter,
  createNoopAssetsAiAdapter,
} from './adapters/pipeline.js';

// Types
export type {
  MeetingNotesDeps,
  MeetingNotesOptions,
  StandaloneConfig,
  DatabaseAdapter,
  LLMAdapter,
  EmbeddingAdapter,
  TextSearchAdapter,
  EventBusAdapter,
  ExpertsAdapter,
  ExpertApplicationAdapter,
  AssetsAiAdapter,
  ScopeKind,
  AxisName,
  Preset,
  RunState,
  RunTrigger,
  ScopeRef,
  EnqueueRunRequest,
  RunRecord,
  AxisVersionRef,
} from './types.js';

export { MEETING_NOTES_EVENTS } from './types.js';
