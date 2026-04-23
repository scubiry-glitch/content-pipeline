// ============================================
// v7.4 深度争议分析
// 取 ContentLibraryEngine.getContradictions 的 top N 矛盾对，
// 让匹配到的专家 CDT 以多视角结构化 prompt 重新分析，
// 输出 stakeholders / steelman / contradictionType / evidenceChain 等。
// ============================================

import type { ExpertEngine } from '../../modules/expert-library/ExpertEngine.js';
import type { ExpertProfile } from '../../modules/expert-library/types.js';
import type { ContentLibraryEngine } from '../../modules/content-library/ContentLibraryEngine.js';
import type { Contradiction } from '../../modules/content-library/types.js';
import type { ControversyAnalysis, ExpertInvocationTrace } from './types.js';
import { createStrategyResolver, resolveSpecString } from '../expert-application/index.js';
import type { ExpertStrategySpec, ExpertApplicationStrategy } from '../expert-application/index.js';

export interface ControversyDeepAnalyzerDeps {
  contentEngine: ContentLibraryEngine;
  expertEngine: ExpertEngine;
}

export interface ControversyRunOptions {
  domain?: string;
  topN?: number;
  expert: ExpertProfile;
  /** 可选：同样跑一遍互补专家交叉分析 */
  complementaryExpert?: ExpertProfile;
  /** Round 2: 专家应用策略配置 */
  expertStrategy?: ExpertStrategySpec;
}

export class ControversyDeepAnalyzer {
  constructor(private deps: ControversyDeepAnalyzerDeps) {}

  async run(options: ControversyRunOptions): Promise<{
    controversies: ControversyAnalysis[];
    traces: ExpertInvocationTrace[];
  }> {
    const topN = options.topN ?? 3;
    const traces: ExpertInvocationTrace[] = [];

    const contradictions = await this.deps.contentEngine.getContradictions({
      domain: options.domain,
      limit: topN,
    });

    if (contradictions.length === 0) {
      return { controversies: [], traces };
    }

    const resolveStrategy = createStrategyResolver(options.expertStrategy);
    const specStr = resolveSpecString(options.expertStrategy, '⑬controversy');
    const expertsForStrategy = [options.expert, ...(options.complementaryExpert ? [options.complementaryExpert] : [])];

    const controversies: ControversyAnalysis[] = [];
    for (const c of contradictions) {
      // 300ms throttle（参考 synthesisJob.ts 的节流模式）
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        const result = await this.analyzeOne(c, options.expert, expertsForStrategy, resolveStrategy, specStr);
        controversies.push(result.analysis);
        traces.push(...result.traces);
      } catch (err) {
        console.warn(`[ControversyDeepAnalyzer] Analysis failed for ${c.id}:`, (err as Error).message);
      }
    }

    return { controversies, traces };
  }

  private async analyzeOne(
    contradiction: Contradiction,
    expert: ExpertProfile,
    expertsForStrategy: ExpertProfile[],
    resolveStrategy: (deliverable: string) => ExpertApplicationStrategy,
    specStr: string,
  ): Promise<{ analysis: ControversyAnalysis; traces: ExpertInvocationTrace[] }> {
    const inputData = this.buildContradictionNarrative(contradiction);

    const strategy = resolveStrategy('⑬controversy');
    const result = await strategy.apply({
      expertEngine: this.deps.expertEngine,
      deps: this.deps.expertEngine.getDeps(),
      experts: expertsForStrategy,
      inputData,
      taskType: 'analysis',
      deliverable: '⑬controversy',
      contextHint: '这是一次争议话题深度剖析任务。请以你作为领域专家的视角，按照指定 JSON 结构输出，不要 markdown 代码块。',
      params: {
        depth: 'deep',
        output_format: CONTROVERSY_OUTPUT_SCHEMA_HINT,
        focus_areas: [
          'stakeholder_mapping',
          'evidence_chain',
          'steelman_both_sides',
          'temporal_context',
          'source_credibility',
          'real_world_impact',
          'resolution',
        ],
      },
    });

    const rawText = result.output.sections.map((s) => s.content).join('\n');
    const parsed = this.parseControversyJson(rawText);

    // 从 traces 中找出主 invoke_id（第一条，通常是 base strategy 的主调用）
    const primaryInvokeId =
      result.traces.find((t) => !t.stage || t.stage === 'positionA' || t.stage === 'solo')?.invokeId ||
      result.traces[0]?.invokeId ||
      '';

    const analysis: ControversyAnalysis = {
      contradictionId: contradiction.id,
      factA: {
        subject: contradiction.factA.subject,
        predicate: contradiction.factA.predicate,
        object: contradiction.factA.object,
        confidence: contradiction.factA.confidence,
      },
      factB: {
        subject: contradiction.factB.subject,
        predicate: contradiction.factB.predicate,
        object: contradiction.factB.object,
        confidence: contradiction.factB.confidence,
      },
      contradictionType: parsed.contradictionType ?? 'unknown',
      stakeholders: parsed.stakeholders ?? [],
      evidenceChainA: parsed.evidenceChainA ?? [],
      evidenceChainB: parsed.evidenceChainB ?? [],
      steelmanA: parsed.steelmanA ?? '',
      steelmanB: parsed.steelmanB ?? '',
      temporalContext: parsed.temporalContext,
      sourceCredibilityGap: parsed.sourceCredibilityGap,
      realWorldImpact: parsed.realWorldImpact ?? { level: contradiction.severity, reasoning: '' },
      resolution: parsed.resolution ?? '',
      residualUncertainty: parsed.residualUncertainty,
      analyzedByExpertId: expert.expert_id,
      expertInvokeId: primaryInvokeId,
    };

    const traces: ExpertInvocationTrace[] = result.traces.map((t) => ({
      deliverable: '⑬controversy',
      expertId: t.expertId,
      invokeId: t.invokeId,
      emmPass: t.emmPass,
      confidence: t.confidence,
      durationMs: t.durationMs,
      strategy: specStr,
      stage: t.stage,
    }));

    return { analysis, traces };
  }

  private buildContradictionNarrative(c: Contradiction): string {
    // v7.5: 若上游 recall 层已经分类出 tensionType/divergenceAxis/parties,
    // 直接把这些结果"喂"给专家 —— 专家在已有分类上做深化,不重复分类
    const tensionHint =
      c.tensionType && c.tensionType !== 'unknown'
        ? `
【上游初判】
  张力类型: ${c.tensionType}
  分歧维度: ${c.divergenceAxis || '(未给出)'}
  对立方: ${
    Array.isArray(c.parties) && c.parties.length > 0
      ? c.parties.map((p) => `${p.name}(${p.stance})`).join(' vs ')
      : '(未给出)'
  }
  时间跨度: ${c.timeSlice || '(未给出)'}
  召回层: ${c.recallLayer || 'L1'}

请基于以上初判深化 stakeholders 和 steelman,不要重新分类 contradictionType
(优先采纳上游初判,除非你有强证据推翻)。`
        : '';

    return `请深度分析以下事实矛盾：

【事实 A】
  主体: ${c.factA.subject}
  谓词: ${c.factA.predicate}
  对象: ${c.factA.object}
  置信度: ${c.factA.confidence.toFixed(2)}
  上下文: ${safeJson(c.factA.context)}

【事实 B】
  主体: ${c.factB.subject}
  谓词: ${c.factB.predicate}
  对象: ${c.factB.object}
  置信度: ${c.factB.confidence.toFixed(2)}
  上下文: ${safeJson(c.factB.context)}
${tensionHint}
【分析任务】
请按下列严格 JSON schema 输出，不要 markdown 代码块、不要解释性文字：

${CONTROVERSY_OUTPUT_SCHEMA_HINT}

要求：
1. contradictionType：区分是「真分歧」(real_disagreement)、「数据取于不同时间」(time_shift)、「来源报错」(source_error)、「定义漂移」(definition_drift)。
2. stakeholders：至少识别 2-4 个利益相关方，每个说明其立场、利益、可信度。
3. steelmanA / steelmanB：给双方最强论证版本，而不是稻草人。
4. evidenceChain：列出每一方的证据链条（2-5 条）。
5. realWorldImpact：评估真实世界影响，不要只看 confidence。
6. resolution：说明是否可解、如何解、留有何种残余不确定性。`;
  }

  private parseControversyJson(text: string): Partial<ControversyAnalysis> {
    // 去掉可能的 markdown 围栏
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // 尝试在文本里找第一个 { ... }
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return {};
        }
      }
      return {};
    }
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

const CONTROVERSY_OUTPUT_SCHEMA_HINT = `{
  "contradictionType": "time_shift | source_error | real_disagreement | definition_drift",
  "stakeholders": [
    { "name": "...", "position": "...", "interest": "...", "credibility": "high|medium|low" }
  ],
  "evidenceChainA": ["...", "..."],
  "evidenceChainB": ["...", "..."],
  "steelmanA": "...",
  "steelmanB": "...",
  "temporalContext": "...",
  "sourceCredibilityGap": "...",
  "realWorldImpact": { "level": "high|medium|low", "reasoning": "..." },
  "resolution": "...",
  "residualUncertainty": "..."
}`;
