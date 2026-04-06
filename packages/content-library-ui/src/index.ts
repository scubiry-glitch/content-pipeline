// @content-library/ui — 统一导出
// 可插拔前端包，与后端完全解耦

// ===== 配置 =====
export { configure, getConfig } from './api-client.js';

// ===== 页面级组件 =====
export { ContentDashboard } from './pages/ContentDashboard.js';
export { FactExplorer } from './pages/FactExplorer.js';
export { EntityGraph } from './pages/EntityGraph.js';
export { TrendTimeline } from './pages/TrendTimeline.js';
export { TopicRecommender } from './pages/TopicRecommender.js';
export { ContradictionBoard } from './pages/ContradictionBoard.js';
export { KnowledgeCards } from './pages/KnowledgeCards.js';
export { OutputPanorama } from './pages/OutputPanorama.js';

// ===== 可嵌入组件 =====
export { FactCard } from './components/FactCard.js';
export { BeliefBadge } from './components/BeliefBadge.js';
export { TieredContentView } from './components/TieredContentView.js';
export { DeltaReport } from './components/DeltaReport.js';
export { ConsensusChart } from './components/ConsensusChart.js';

// ===== Hooks =====
export { useContentLibrary } from './hooks/useContentLibrary.js';
export { useTieredLoad } from './hooks/useTieredLoad.js';

// ===== Types =====
export type { ContentLibraryUIConfig } from './api-client.js';
