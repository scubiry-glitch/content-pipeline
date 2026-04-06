// Content Pipeline API - Main exports

// Providers
export {
  LLMProvider, ClaudeProvider, OpenAIProvider, ClaudeCodeProvider,
  LLMRouter, getLLMRouter, initLLMRouter,
  isClaudeCodeEnvironment, getClaudeCodeModel, createClaudeProvider
} from './providers';

// Agents
export { BaseAgent, AgentContext, AgentResult, AgentLog } from './agents';
export { PlannerAgent, PlannerInput, PlannerOutput } from './agents';
export { ResearchAgent, ResearcherInput, ResearcherOutput } from './agents';
export { WriterAgent, WriterInput, WriterOutput, BlueTeamRound } from './agents';

// Services
export { AssetLibraryService, ImportAssetInput, ImportResult } from './services/assetLibrary';

// Content Library (v7.0)
export {
  createContentLibraryEngine,
  ContentLibraryEngine,
  createRouter as createContentLibraryRouter,
  createContentLibraryPipelineDeps,
  initContentLibraryEngineSingleton,
  getContentLibraryEngine,
  startContentLibraryScheduler,
  PostgresTextSearch,
  LocalEventBus,
  CONTENT_LIBRARY_EVENTS,
} from './modules/content-library';

// Pipeline
export { PipelineOrchestrator, PipelineConfig, PipelineInput, PipelineStatus } from './pipeline/orchestrator';

// Database
export { initDatabase, query, getClient, closePool, DBConfig } from './db/connection';
