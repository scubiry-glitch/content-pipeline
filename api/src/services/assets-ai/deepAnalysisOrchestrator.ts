// ============================================
// v7.4 深度分析编排器
// 在 batchProcessor.processSingleAsset 跑完 quality + classification 之后调用。
// 负责：
//   1. 调 ExpertMatcher 匹配领域/特级专家
//   2. 并发调用 ContentLibraryEngine 的 15 个 deliverable 方法
//   3. 用匹配到的专家 CDT 调 ExpertEngine.invoke 生成深度洞察 + 争议分析
//   4. 组装成 AssetDeepAnalysis
// ============================================

import { getContentLibraryEngine, isContentLibraryInitialized } from '../../modules/content-library/singleton.js';
import { getExpertEngine } from '../../modules/expert-library/singleton.js';
import { ExpertMatcher } from '../../modules/expert-library/expertMatcher.js';
import { ControversyDeepAnalyzer } from './controversyDeepAnalyzer.js';
import { createStrategyResolver, resolveSpecString } from '../expert-application/index.js';
import type { ExpertStrategySpec } from '../expert-application/index.js';
import type {
  Asset,
  AssetDeepAnalysis,
  AssetQualityScore,
  AssetThemeClassification,
  ExpertInvocationTrace,
} from './types.js';

/**
 * 单 asset 级深度分析入口。
 * 所有外部调用都加 try/catch — 任一 deliverable 失败不影响其他。
 */
export async function runDeepAnalysis(
  asset: Asset,
  quality: AssetQualityScore,
  classification: AssetThemeClassification,
  expertStrategy?: ExpertStrategySpec,
): Promise<AssetDeepAnalysis> {
  const started = Date.now();

  if (!isContentLibraryInitialized()) {
    throw new Error('ContentLibraryEngine not initialized');
  }
  const contentEngine = getContentLibraryEngine();
  const expertEngine = getExpertEngine();
  if (!expertEngine) {
    throw new Error('ExpertEngine not initialized');
  }

  const candidateSubjects = (classification.entities || [])
    .map((e) => e?.name?.trim())
    .filter((name): name is string => !!name);
  const primaryEntity = classification.entities?.[0];
  const primaryTheme = classification.primaryTheme?.themeName || classification.primaryTheme?.themeId || '';
  const primaryTaxonomyCode = classification.primaryTheme?.themeId || undefined;
  const industry = primaryTheme;
  const subjectForFacts = primaryEntity?.name || candidateSubjects[0] || asset.title;
  const entityIdForGraph = primaryEntity?.name || asset.title;

  const importance = Math.min(1, Math.max(0, (quality.overall || 0) / 100));

  // Step 1: 专家匹配
  const matcher = new ExpertMatcher(expertEngine, expertEngine.getDeps());
  let matchResult;
  try {
    matchResult = await matcher.match({
      topic: primaryTheme,
      industry,
      taskType: 'analysis',
      importance,
    });
  } catch (err) {
    console.warn('[DeepAnalysis] ExpertMatcher failed:', (err as Error).message);
    matchResult = { domainExperts: [], matchReasons: ['expert matching failed'] };
  }
  const domainExpertIds = matchResult.domainExperts.map((d) => d.expert.expert_id);
  const seniorExpertId = matchResult.seniorExpert?.expert.expert_id;
  const primaryExpert = matchResult.seniorExpert?.expert ?? matchResult.domainExperts[0]?.expert;
  const expertsForStrategy = [
    ...matchResult.domainExperts.map((d) => d.expert),
    ...(matchResult.seniorExpert ? [matchResult.seniorExpert.expert] : []),
  ];

  const traces: ExpertInvocationTrace[] = [];
  const resolveStrategy = createStrategyResolver(expertStrategy);

  // Step 2 — Parallel block A: asset-scoped 轻量查询
  const [keyFacts, entityGraph, knowledgeCard, beliefEvolution] = await Promise.all([
    safely('⑤keyFacts', () => contentEngine.getKeyFacts({ subject: subjectForFacts, limit: 20 })),
    safely('⑥entityGraph', () => contentEngine.getEntityGraph(entityIdForGraph)),
    safely('⑨knowledgeCard', () => contentEngine.getKnowledgeCard(entityIdForGraph)),
    safely('⑭beliefEvolution', () => contentEngine.getBeliefEvolution({ subject: subjectForFacts, limit: 10 })),
  ]);

  // Step 3 — Parallel block B: aggregate (跨素材)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 最近 7 天
  const [
    topicRecommendations,
    trendSignals,
    knowledgeGaps,
    deltaReport,
    staleFacts,
    materialRecommendations,
    crossDomainInsights,
  ] = await Promise.all([
    safely('①topics', () => contentEngine.getTopicRecommendations({ taxonomy_code: primaryTaxonomyCode, domain: industry, limit: 10 })),
    safely('②trends', () => contentEngine.getTrendSignals(entityIdForGraph)),
    safely('③④gaps', () => contentEngine.getKnowledgeGaps({ limit: 10 })),
    safely('⑦delta', () => contentEngine.getDeltaReport(since)),
    safely('⑧stale', () => contentEngine.getStaleFacts({ limit: 20 })),
    safely('⑪materials', () => contentEngine.recommendMaterials({ domain: industry, limit: 5 })),
    safely('⑮crossDomain', () => contentEngine.discoverCrossDomainInsights({ entityId: entityIdForGraph, domain: industry, limit: 10 })),
  ]);

  // Step 4 — Serial block C: 重 LLM 调用
  const insights = await safely('⑩insights', () =>
    contentEngine.synthesizeInsights({
      assetId: asset.id,
      subjects: candidateSubjects.length > 0 ? candidateSubjects.slice(0, 3) : [subjectForFacts],
      domain: industry || undefined,
      taxonomy_code: primaryTaxonomyCode,
      limit: 10,
    }),
  );

  const expertConsensus = await safely('⑫consensus', () =>
    contentEngine.getExpertConsensus({ assetId: asset.id, topic: primaryTheme, taxonomy_code: primaryTaxonomyCode, domain: industry, limit: 10 }),
  );

  // 如果有匹配到的专家，再让专家补一段"专家视角判断"，挂在 insights 上
  if (primaryExpert && insights) {
    try {
      const strategy = resolveStrategy('⑩insights');
      const specStr = resolveSpecString(expertStrategy, '⑩insights');
      const result = await strategy.apply({
        expertEngine,
        deps: expertEngine.getDeps(),
        experts: expertsForStrategy.length > 0 ? expertsForStrategy : [primaryExpert],
        inputData: buildInsightsNarrative(asset, classification, insights),
        taskType: 'analysis',
        deliverable: '⑩insights',
        contextHint: '请以你的专家视角，对以下自动综合出的洞察补充 1-3 条反驳点或深化判断。',
        params: { depth: 'standard' },
      });
      for (const t of result.traces) {
        traces.push({
          deliverable: '⑩insights-expert-supplement',
          expertId: t.expertId,
          invokeId: t.invokeId,
          emmPass: t.emmPass,
          confidence: t.confidence,
          durationMs: t.durationMs,
          strategy: specStr,
          stage: t.stage,
        });
      }
      (insights as Record<string, unknown>).expertSupplement = {
        expertId: primaryExpert.expert_id,
        strategy: specStr,
        sections: result.output.sections,
        meta: result.meta,
      };
    } catch (err) {
      console.warn('[DeepAnalysis] Expert supplement failed:', (err as Error).message);
    }
  }

  // Step 5: 深度争议分析
  let controversies: AssetDeepAnalysis['controversies'] = [];
  if (primaryExpert) {
    try {
      const analyzer = new ControversyDeepAnalyzer({ contentEngine, expertEngine });
      const result = await analyzer.run({
        domain: industry || undefined,
        topN: 3,
        expert: primaryExpert,
        complementaryExpert: matchResult.domainExperts[1]?.expert,
        expertStrategy,
      });
      controversies = result.controversies;
      traces.push(...result.traces);
    } catch (err) {
      console.warn('[DeepAnalysis] Controversy analysis failed:', (err as Error).message);
    }
  }

  return {
    assetId: asset.id,
    matchedDomainExpertIds: domainExpertIds,
    matchedSeniorExpertId: seniorExpertId,
    matchReasons: matchResult.matchReasons,
    topicRecommendations,
    trendSignals,
    differentiationGaps: Array.isArray(knowledgeGaps)
      ? knowledgeGaps.filter((g: any) => g?.mode !== 'blank')
      : knowledgeGaps,
    knowledgeBlanks: Array.isArray(knowledgeGaps)
      ? knowledgeGaps.filter((g: any) => g?.mode === 'blank')
      : undefined,
    keyFacts,
    entityGraph,
    deltaReport,
    staleFacts,
    knowledgeCard,
    insights,
    materialRecommendations,
    expertConsensus,
    controversies,
    beliefEvolution,
    crossDomainInsights,
    expertInvocations: traces,
    processingTimeMs: Date.now() - started,
    modelVersion: 'v2.0-deep',
  };
}

async function safely<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[DeepAnalysis] ${label} failed:`, (err as Error).message);
    return undefined;
  }
}

function buildInsightsNarrative(
  asset: Asset,
  classification: AssetThemeClassification,
  insights: unknown,
): string {
  const summary =
    (insights as { summary?: string; insights?: Array<{ text: string }> })?.summary ||
    '（无综合 summary）';
  const items =
    (insights as { insights?: Array<{ text: string }> })?.insights?.map((i) => `- ${i.text}`).join('\n') ||
    '（无洞察列表）';
  return `素材: ${asset.title}
主题: ${classification.primaryTheme?.themeName || ''}

自动综合 summary:
${summary}

自动综合洞察:
${items}

请以专家视角指出：
1. 哪些洞察过于泛化、需要更具体的条件？
2. 哪些判断忽略了你熟悉的反例？
3. 补充 1-3 条原本遗漏的深层洞察。`;
}
