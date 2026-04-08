// Expert Library — 统一导出 + 工厂函数
// 嵌入式: import { createExpertEngine } from './modules/expert-library'
// 独立部署: import { createExpertEngine, createRouter } from 'expert-library'

import { ExpertEngine } from './ExpertEngine.js';
import { createRouter } from './router.js';
import { muskProfile } from './data/musk.js';
import { xiaohongshuProfile } from './data/xiaohongshu.js';
import { topExpertProfiles } from './data/topExperts.js';
import { weiHangkongProfile } from './data/weiHangkong.js';
import { jobsProfile } from './data/jobs.js';
import { mungerProfile } from './data/munger.js';
import { talebProfile } from './data/taleb.js';
import { feynmanProfile } from './data/feynman.js';
import { karpathyProfile } from './data/karpathy.js';
import { paulGrahamProfile } from './data/paulgraham.js';
import { buffettProfile } from './data/buffett.js';
import { bezosProfile } from './data/bezos.js';
import { zhangXiaolongProfile } from './data/zhangxiaolong.js';
import { huangZhengProfile } from './data/huangzheng.js';
import { liKaifuProfile } from './data/likaifu.js';
import { seedDefaultBuiltinExpertsToDb } from './expertSeed.js';
import type { ExpertLibraryDeps, ExpertProfile } from './types.js';

export { seedDefaultBuiltinExpertsToDb as seedDefaultExpertsToDb } from './expertSeed.js';

// ===== 工厂函数 =====

/**
 * 创建 ExpertEngine 实例（异步：含 DB 播种）
 * @param deps 外部依赖（通过 Adapter 注入）
 * @param options 可选配置；默认不写入 DB，请使用 POST /expert-library/admin/sync-builtins 或 `npm run expert:seed-builtins`
 */
export async function createExpertEngine(
  deps: ExpertLibraryDeps,
  options?: {
    /** 是否自动注册内置专家 (默认 true) */
    registerBuiltinExperts?: boolean;
    /** 额外的专家 profiles */
    additionalExperts?: ExpertProfile[];
    /** 传 `false` 时在后台自动播种；默认 `undefined`/不传则不写库，请用手动 API 或 CLI */
    skipSeed?: boolean;
  }
): Promise<ExpertEngine> {
  const engine = new ExpertEngine(deps);

  // 收集所有内置专家
  const builtinExperts: ExpertProfile[] = [];

  // 注册内置专家
  if (options?.registerBuiltinExperts !== false) {
    builtinExperts.push(
      muskProfile, xiaohongshuProfile, weiHangkongProfile,
      jobsProfile, mungerProfile, talebProfile, feynmanProfile, karpathyProfile, paulGrahamProfile,
      buffettProfile, bezosProfile, zhangXiaolongProfile, huangZhengProfile, liKaifuProfile,
    );
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

  // 仅在显式 skipSeed: false 时后台播种（兼容旧行为；默认请用手动同步）
  if (options?.skipSeed === false) {
    void seedDefaultBuiltinExpertsToDb(deps).catch((err) =>
      console.warn('[ExpertEngine] Async seed failed (non-fatal):', err)
    );
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
export { weiHangkongProfile } from './data/weiHangkong.js';
export { jobsProfile } from './data/jobs.js';
export { mungerProfile } from './data/munger.js';
export { talebProfile } from './data/taleb.js';
export { feynmanProfile } from './data/feynman.js';
export { karpathyProfile } from './data/karpathy.js';
export { paulGrahamProfile } from './data/paulgraham.js';
export { buffettProfile } from './data/buffett.js';
export { bezosProfile } from './data/bezos.js';
export { zhangXiaolongProfile } from './data/zhangxiaolong.js';
export { huangZhengProfile } from './data/huangzheng.js';
export { liKaifuProfile } from './data/likaifu.js';
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
