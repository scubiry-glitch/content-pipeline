// Zep 可选增强模块 — 统一导出
// 设计: ZEP_API_KEY 存在时启用, 不存在时所有函数返回 null/0/false
// 零外部依赖: 不安装任何 npm 包, 直接用 fetch 调用 REST API

export { isZepEnabled } from './zepClient.js';
export { syncFactsToZep, syncEntitiesToZep } from './zepSync.js';
export {
  enhanceEntityGraph,
  enhanceContradictions,
  enhanceBeliefTimeline,
  enhanceCrossDomain,
  getZepStatus,
} from './zepAdapter.js';
