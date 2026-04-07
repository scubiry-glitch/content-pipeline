// Expert Library — 统一导出 + 工厂函数
// 嵌入式: import { createExpertEngine } from './modules/expert-library'
// 独立部署: import { createExpertEngine, createRouter } from 'expert-library'

import { ExpertEngine } from './ExpertEngine.js';
import { createRouter } from './router.js';
import { muskProfile } from './data/musk.js';
import { xiaohongshuProfile } from './data/xiaohongshu.js';
import { topExpertProfiles } from './data/topExperts.js';
import { yiMengProfile } from './data/yiMeng.js';
import { seedExpertsToDb } from './expertSeed.js';
import type { ExpertLibraryDeps, ExpertProfile } from './types.js';

// ===== 工厂函数 =====

/**
 * 创建 ExpertEngine 实例（异步：含 DB 播种）
 * @param deps 外部依赖（通过 Adapter 注入）
 * @param options 可选配置
 */
export async function createExpertEngine(
  deps: ExpertLibraryDeps,
  options?: {
    /** 是否自动注册内置专家 (默认 true) */
    registerBuiltinExperts?: boolean;
    /** 额外的专家 profiles */
    additionalExperts?: ExpertProfile[];
    /** 是否跳过 DB 播种 (默认 false) */
    skipSeed?: boolean;
  }
): Promise<ExpertEngine> {
  const engine = new ExpertEngine(deps);

  // 收集所有内置专家
  const builtinExperts: ExpertProfile[] = [];

  // 注册内置专家
  if (options?.registerBuiltinExperts !== false) {
    builtinExperts.push(muskProfile, xiaohongshuProfile, yiMengProfile);
    for (const profile of topExpertProfiles) {
      builtinExperts.push(profile);
    }
    for (const profile of builtinExperts) {
      engine.registerExpert(profile);
    }
  }

  // 注册额外专家
  if (options?.additionalExperts) {
    for (const expert of options.additionalExperts) {
      engine.registerExpert(expert);
      builtinExperts.push(expert);
    }
  }

  // DB 播种：将所有内置专家 + 前端展示专家写入数据库
  if (!options?.skipSeed) {
    try {
      let frontendExperts: any[] = [];
      try {
        const { frontendExpertsData } = await import('./data/frontendExperts.js');
        frontendExperts = frontendExpertsData;
      } catch {
        console.warn('[ExpertEngine] Frontend expert data not found, seeding backend experts only');
      }
      await seedExpertsToDb(deps, builtinExperts, frontendExperts);
    } catch (err) {
      console.warn('[ExpertEngine] DB seed failed (non-fatal):', err);
    }
  }

  return engine;
}

// ===== 导出 =====

// 核心
export { ExpertEngine } from './ExpertEngine.js';
export { createRouter } from './router.js';

// 子模块
export { buildSystemPrompt } from './promptBuilder.js';
export { addKnowledgeSource, retrieveKnowledge, listKnowledgeSources, deleteKnowledgeSource } from './knowledgeService.js';
export { submitFeedback, calibrateExpert } from './feedbackLoop.js';
export { processInput } from './inputProcessor.js';
export { emmGateCheck, emmGateWithRetry } from './emmGate.js';
export { analyzeThenJudge } from './analyzeThenJudge.js';
export { formatOutput } from './outputFormatter.js';

// 数据
export { muskProfile } from './data/musk.js';
export { xiaohongshuProfile } from './data/xiaohongshu.js';
export { topExpertProfiles } from './data/topExperts.js';
export { yiMengProfile } from './data/yiMeng.js';
export { CODEBASE_EXPERT_IDS, SKIP_GENERATE_IDS } from './builtinExpertIds.js';
export { assertExpertProfile, expertProfileToDbParams } from './expertProfileDb.js';

// 类型
export type {
  ExpertProfile,
  ExpertPersona,
  ExpertMethod,
  ExpertEMM,
  ExpertRequest,
  ExpertResponse,
  InputAnalysis,
  EMMGateResult,
  ViolationCost,
  AnalysisResult,
  ComparisonResult,
  ComparisonAxis,
  VerdictResult,
  ExtractionResult,
  OutputSection,
  KnowledgeSource,
  ExpertFeedback,
  ExpertPerformance,
  TaskType,
  InputType,
  DatabaseAdapter,
  LLMAdapter,
  FileParserAdapter,
  StorageAdapter,
  ExpertLibraryDeps,
} from './types.js';

// Adapters
export { createPipelineDeps, createPipelineDBAdapter, createPipelineLLMAdapter } from './adapters/pipeline.js';

// Singleton
export { initExpertEngineSingleton, getExpertEngine } from './singleton.js';
