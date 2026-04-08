// Expert Research Service — 6 Agent 并行调研 + 三重验证 + Profile 合成
// 借鉴 nuwa-skill 的认知蒸馏方法论

import type { ExpertLibraryDeps } from './types.js';

// ============================================================
// Types
// ============================================================

export interface ResearchInput {
  name: string;
  domain: string;
  expertId?: string;
  title?: string;
  background?: string;
  depth?: 'quick' | 'standard' | 'deep';
}

export interface DimensionResult {
  key: string;
  label: string;
  content: string;
}

export interface SynthesisResult {
  mentalModels: Array<{
    name: string;
    summary: string;
    evidence: string[];
    applicationContext: string;
    failureCondition: string;
  }>;
  heuristics: Array<{
    trigger: string;
    rule: string;
    example?: string;
  }>;
  expressionDNA: {
    sentencePattern: string;
    vocabularyPreference: string;
    certaintyCali: string;
    citationHabit: string;
  };
  contradictions: Array<{
    tension: string;
    context: string;
    resolution: string;
  }>;
  blindSpots: {
    knownBias: string[];
    weakDomains: string[];
    confidenceThreshold: string;
    explicitLimitations: string[];
  };
}

export interface ResearchGenerateResult {
  expertId: string;
  name: string;
  phase1_research: DimensionResult[];
  phase2_synthesis: SynthesisResult;
  phase3_profile: Record<string, unknown>;
}

// ============================================================
// Dimension Prompts
// ============================================================

interface ResearchDimension {
  key: string;
  label: string;
  prompt: (name: string, domain: string) => string;
}

const RESEARCH_DIMENSIONS: ResearchDimension[] = [
  {
    key: 'publications',
    label: '著作与发表',
    prompt: (name, domain) => `你是一位研究${domain}领域的学术助手。请分析 ${name} 的公开著作、文章和论文。
列出 3-5 个核心思想框架，每个说明名称、核心主张、在哪些场景被反复提及。
提取其论证风格和关键术语。如果你对此人了解有限，请诚实说明。只输出分析内容。`,
  },
  {
    key: 'interviews',
    label: '访谈与演讲',
    prompt: (name, domain) => `你是一位传播分析师。请分析 ${name} 在公开访谈、演讲中展现的思维方式。
分析其即兴回答中的思维模式、面对质疑时的应对方式、表达风格特征和决策逻辑。只输出分析内容。`,
  },
  {
    key: 'social_media',
    label: '社交媒体言论',
    prompt: (name, domain) => `请分析 ${name} 在社交媒体上的言论特征。
分析其最关注的话题、表态风格、互动/争论特征、公开立场与行为是否矛盾。只输出分析内容。`,
  },
  {
    key: 'external_perspectives',
    label: '外部评价',
    prompt: (name, domain) => `请搜集和分析外部对 ${name} 思维方式和决策风格的评价。
包括正面评价、批评、已知盲点和决策正确/错误案例。只收集有据可查的评价。只输出分析内容。`,
  },
  {
    key: 'decisions',
    label: '重大决策',
    prompt: (name, domain) => `请分析 ${name} 做过的 3-5 个最重要的公开决策。
每个决策分析背景、选择和原因、体现的思维模式、结果。总结可复用的决策启发式。只输出分析内容。`,
  },
  {
    key: 'cognitive_evolution',
    label: '认知演变',
    prompt: (name, domain) => `请梳理 ${name} 思想观点的演变轨迹。
分析早期和近期观点变化、是否有公开改变想法的时刻、哪些观点长期一致。只输出分析内容。`,
  },
];

// ============================================================
// Core Logic
// ============================================================

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/;
  const m = trimmed.match(fence);
  const body = m ? m[1].trim() : trimmed;
  return JSON.parse(body);
}

function getMaxTokensByDepth(depth: string): number {
  switch (depth) {
    case 'quick': return 2048;
    case 'deep': return 8192;
    default: return 4096;
  }
}

/**
 * 执行完整的 6 Agent 并行调研 + 合成 + Profile 生成流程
 */
export async function researchAndGenerateProfile(
  input: ResearchInput,
  deps: ExpertLibraryDeps
): Promise<ResearchGenerateResult> {
  const depth = input.depth || 'standard';
  const expertId = input.expertId || `R-${Date.now().toString(36).toUpperCase()}`;
  const maxTokens = getMaxTokensByDepth(depth);

  // Phase 1: 并行调研
  const researchPromises = RESEARCH_DIMENSIONS.map(async (dim): Promise<DimensionResult> => {
    const prompt = dim.prompt(input.name, input.domain);
    try {
      const result = await deps.llm.complete(prompt, { maxTokens, temperature: 0.3 });
      return { key: dim.key, label: dim.label, content: result };
    } catch (err: any) {
      return { key: dim.key, label: dim.label, content: `[调研失败: ${err.message}]` };
    }
  });

  const dimensionResults = await Promise.all(researchPromises);

  // Phase 2: 合成
  const researchContext = dimensionResults
    .map(r => `### ${r.label}\n${r.content}`)
    .join('\n\n---\n\n');

  const synthesisPrompt = `你是认知框架蒸馏专家。基于以下对 ${input.name}（${input.domain}领域）的 6 维调研结果，提取结构化的认知框架。

## 6 维调研结果
${researchContext}

## 提取要求
请输出 JSON：
{
  "mentalModels": [{ "name": "...", "summary": "...", "evidence": ["来自2+维度的证据"], "applicationContext": "...", "failureCondition": "..." }],
  "heuristics": [{ "trigger": "...", "rule": "...", "example": "..." }],
  "expressionDNA": { "sentencePattern": "...", "vocabularyPreference": "...", "certaintyCali": "...", "citationHabit": "..." },
  "contradictions": [{ "tension": "...", "context": "...", "resolution": "..." }],
  "blindSpots": { "knownBias": [], "weakDomains": [], "confidenceThreshold": "...", "explicitLimitations": [] }
}

三重验证：1.心智模型须跨域复现 2.启发式须能解释已知决策 3.表达DNA须独特而非泛化
只输出 JSON。`;

  const synthesisRaw = await deps.llm.complete(synthesisPrompt, { maxTokens: 8192, temperature: 0.2 });
  const synthesis = extractJsonObject(synthesisRaw) as SynthesisResult;

  // Phase 3: 生成 Profile
  const profilePrompt = `基于以下经验证的认知框架，生成完整 ExpertProfile JSON。
expert_id: "${expertId}", name: "${input.name}", domain: ["${input.domain}"]

认知框架：
${JSON.stringify(synthesis, null, 2)}

输出完整 ExpertProfile JSON（含 persona.mentalModels, heuristics, expressionDNA, contradictions, method.agenticProtocol, output_schema.rubrics）。
只输出 JSON。`;

  const profileRaw = await deps.llm.complete(profilePrompt, { maxTokens: 12288, temperature: 0.25 });
  const profile = extractJsonObject(profileRaw) as Record<string, unknown>;

  return {
    expertId,
    name: input.name,
    phase1_research: dimensionResults,
    phase2_synthesis: synthesis,
    phase3_profile: profile,
  };
}
