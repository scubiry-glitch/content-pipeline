#!/usr/bin/env npx tsx
/**
 * 6 Agent 并行调研 + 三重验证 + Profile 生成
 * 借鉴 nuwa-skill 的认知蒸馏方法论，在 LLM 生成 ExpertProfile 前
 * 先通过 6 维并行调研收集高质量输入，显著提升生成质量。
 *
 * 用法：cd api && npx tsx src/scripts/research-expert-profile.ts --name="马斯克" --domain="科技战略" [--depth=standard] [--out-dir=...]
 * --name:   专家姓名（必填）
 * --domain: 专家领域（必填）
 * --depth:  调研深度 quick | standard | deep（默认 standard）
 * --out-dir: 输出目录（默认 src/modules/expert-library/data/generated/pending-review/）
 * --expert-id: 指定 expert_id（不指定则自动生成）
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { generate } from '../services/llm.js';

const API_ROOT = process.cwd();
dotenv.config({ path: path.join(API_ROOT, '.env') });

// ============================================================
// Types
// ============================================================

interface ResearchInput {
  name: string;
  domain: string;
  expertId?: string;
  depth: 'quick' | 'standard' | 'deep';
}

interface ResearchDimension {
  key: string;
  label: string;
  prompt: (name: string, domain: string) => string;
}

interface DimensionResult {
  key: string;
  label: string;
  content: string;
  model: string;
}

interface SynthesisResult {
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

// ============================================================
// 6 Research Dimensions
// ============================================================

const RESEARCH_DIMENSIONS: ResearchDimension[] = [
  {
    key: 'publications',
    label: '著作与发表',
    prompt: (name, domain) => `你是一位研究${domain}领域的学术助手。请基于你的知识，分析 ${name} 的公开著作、文章、书籍和论文。

要求：
1. 列出此人最具影响力的 3-5 个核心思想框架/理论
2. 每个框架说明：名称、核心主张、在哪些场景被反复提及
3. 提取此人在写作中反复出现的关键术语和概念
4. 分析其论证风格（演绎/归纳/类比）

注意：如果你对此人了解有限，请诚实说明哪些是你确信的、哪些是推测的。
只输出分析内容，不要寒暄。`,
  },
  {
    key: 'interviews',
    label: '访谈与演讲',
    prompt: (name, domain) => `你是一位研究${domain}领域的传播分析师。请基于你的知识，分析 ${name} 在公开访谈、演讲、播客中展现的思维方式。

要求：
1. 此人在即兴回答中最常用的思维模式（如类比、反问、第一性原理推导）
2. 面对质疑时的典型应对方式
3. 表达风格特征：句式长度、确定性用语比例、常用口头禅
4. 公开场合的决策逻辑展示——如何解释自己的决策

注意：如果你对此人了解有限，请诚实说明。
只输出分析内容，不要寒暄。`,
  },
  {
    key: 'social_media',
    label: '社交媒体言论',
    prompt: (name, domain) => `你是一位社交媒体分析师。请基于你的知识，分析 ${name} 在社交媒体（Twitter/微博/公开信等）上的言论特征。

要求：
1. 此人在社交媒体上最关注的 3-5 个话题
2. 表态风格：是断言式还是讨论式？用数据还是用直觉？
3. 与人互动/争论时的特征
4. 是否存在公开立场与私下行为的矛盾

注意：如果你对此人社交媒体活动了解有限，请说明。
只输出分析内容，不要寒暄。`,
  },
  {
    key: 'external_perspectives',
    label: '外部评价与批评',
    prompt: (name, domain) => `你是一位${domain}领域的评论分析师。请基于你的知识，搜集和分析外部对 ${name} 思维方式和决策风格的评价。

要求：
1. 业内最常见的正面评价（此人被认为擅长什么）
2. 最常见的批评（此人被认为忽视或做错了什么）
3. 此人的已知盲点或系统性偏见（由他人指出）
4. 此人的决策在哪些场景被证明正确/错误

注意：只收集有据可查的评价，不要编造。
只输出分析内容，不要寒暄。`,
  },
  {
    key: 'decisions',
    label: '重大决策分析',
    prompt: (name, domain) => `你是一位${domain}领域的决策分析师。请基于你的知识，分析 ${name} 做过的 3-5 个最重要的公开决策。

每个决策请分析：
1. 决策背景和当时的主流看法
2. 此人选择了什么？为什么？
3. 决策中体现的思维模式
4. 结果如何？验证了还是否定了其思维模式？

最后总结：从这些决策中能提取出哪些可复用的决策启发式（heuristics）？

注意：只分析有据可查的公开决策。
只输出分析内容，不要寒暄。`,
  },
  {
    key: 'cognitive_evolution',
    label: '认知演变轨迹',
    prompt: (name, domain) => `你是一位思想史研究者。请基于你的知识，梳理 ${name} 思想观点的演变轨迹。

要求：
1. 此人早期和近期的核心观点有哪些变化？
2. 是否有过公开的"改变想法"的时刻？原因是什么？
3. 哪些观点保持了长期一致？（这可能是其最核心的心智模型）
4. 此人的思想受谁影响最大？（知识谱系）

注意：如果你对此人的思想演变了解有限，请诚实说明。
只输出分析内容，不要寒暄。`,
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
 * Phase 1: 6 Agent 并行调研
 */
async function runParallelResearch(
  input: ResearchInput
): Promise<DimensionResult[]> {
  const maxTokens = getMaxTokensByDepth(input.depth);

  console.log(`\n🔬 Phase 1: 6 维并行调研 [${input.name}] (depth=${input.depth})\n`);

  const promises = RESEARCH_DIMENSIONS.map(async (dim) => {
    const prompt = dim.prompt(input.name, input.domain);
    try {
      console.log(`  → 启动: ${dim.label}...`);
      const { content, model } = await generate(prompt, 'analysis', {
        maxTokens,
        temperature: 0.3,
      });
      console.log(`  ✓ 完成: ${dim.label} (${model}, ${content.length} chars)`);
      return { key: dim.key, label: dim.label, content, model };
    } catch (err: any) {
      console.warn(`  ✗ 失败: ${dim.label} — ${err.message}`);
      return { key: dim.key, label: dim.label, content: `[调研失败: ${err.message}]`, model: 'error' };
    }
  });

  return Promise.all(promises);
}

/**
 * Phase 2: 三重验证 + 合成
 * 从 6 维调研结果中提取结构化的心智模型、决策启发式、表达 DNA 和矛盾
 */
async function synthesizeResearch(
  name: string,
  domain: string,
  dimensionResults: DimensionResult[]
): Promise<SynthesisResult> {
  console.log(`\n🧬 Phase 2: 三重验证 + 合成\n`);

  const researchContext = dimensionResults
    .map(r => `### ${r.label}\n${r.content}`)
    .join('\n\n---\n\n');

  const synthesisPrompt = `你是认知框架蒸馏专家。基于以下对 ${name}（${domain}领域）的 6 维调研结果，提取结构化的认知框架。

## 6 维调研结果
${researchContext}

## 提取要求

请输出 JSON，结构如下：

{
  "mentalModels": [
    {
      "name": "模型名称",
      "summary": "一句话描述",
      "evidence": ["证据1（必须来自2+个不同调研维度）", "证据2"],
      "applicationContext": "适用场景",
      "failureCondition": "失效条件"
    }
  ],
  "heuristics": [
    {
      "trigger": "触发条件",
      "rule": "决策规则",
      "example": "实际案例（可选）"
    }
  ],
  "expressionDNA": {
    "sentencePattern": "句式偏好描述",
    "vocabularyPreference": "用词偏好描述",
    "certaintyCali": "确定性表达特征",
    "citationHabit": "引用习惯"
  },
  "contradictions": [
    {
      "tension": "矛盾描述",
      "context": "出现场景",
      "resolution": "如何共存"
    }
  ],
  "blindSpots": {
    "knownBias": ["已知偏见1"],
    "weakDomains": ["薄弱领域1"],
    "confidenceThreshold": "何时应表达不确定",
    "explicitLimitations": ["能力边界声明1"]
  }
}

## 三重验证规则
1. **跨域复现**：心智模型必须在 2+ 个调研维度中都有证据
2. **可预测性**：决策启发式必须能解释至少 1 个已知决策
3. **独特性**：表达 DNA 必须是该人独有的特征，不是泛泛的"专家风格"

如果某个维度的调研结果不足以支撑提取，宁可留空也不要编造。
只输出 JSON，不要其他内容。`;

  const { content } = await generate(synthesisPrompt, 'analysis', {
    maxTokens: 8192,
    temperature: 0.2,
  });

  try {
    const result = extractJsonObject(content) as SynthesisResult;
    console.log(`  ✓ 合成完成: ${result.mentalModels?.length || 0} 个心智模型, ${result.heuristics?.length || 0} 条启发式`);
    return result;
  } catch (err: any) {
    console.error('  ✗ 合成结果解析失败:', err.message);
    console.error('  原始输出:', content.slice(0, 500));
    throw new Error(`合成结果 JSON 解析失败: ${err.message}`);
  }
}

/**
 * Phase 3: 生成完整 ExpertProfile
 * 使用增强后的调研数据生成结构化的 ExpertProfile JSON
 */
async function generateEnhancedProfile(
  name: string,
  domain: string,
  expertId: string,
  synthesis: SynthesisResult
): Promise<unknown> {
  console.log(`\n📝 Phase 3: 生成增强版 ExpertProfile\n`);

  const profilePrompt = `你是专家库架构师。基于以下经过三重验证的认知框架数据，生成一个完整的 ExpertProfile JSON。

## 基本信息
- expert_id: "${expertId}"
- name: "${name}"
- domain: ["${domain}"]

## 经验证的认知框架
${JSON.stringify(synthesis, null, 2)}

## JSON Schema 要求
顶层字段（全部必填）：
- expert_id, name, domain(字符串数组)
- persona: { style, tone, bias[], cognition{ mentalModel, mentalModels[], decisionStyle, riskAttitude, timeHorizon, heuristics[] }, values{ excites[], irritates[], qualityBar, dealbreakers[] }, taste{ admires[], disdains[], benchmark }, voice{ disagreementStyle, praiseStyle }, blindSpots{ knownBias[], weakDomains[], selfAwareness, informationCutoff, confidenceThreshold, explicitLimitations[] }, expressionDNA{ sentencePattern, vocabularyPreference, certaintyCali, citationHabit }, contradictions[{ tension, context, resolution }] }
- method: { frameworks[], reasoning, analysis_steps[], reviewLens{ firstGlance, deepDive[], killShot, bonusPoints[] }, dataPreference, evidenceStandard, agenticProtocol{ requiresResearch, researchSteps[], noGuessPolicy } }
- emm: { critical_factors[], factor_hierarchy(权重和=1), veto_rules[], aggregation_logic }
- constraints: { must_conclude: true/false, allow_assumption: true/false }
- output_schema: { format, sections[], rubrics[{ dimension, levels[{ score, description }] }] }
- anti_patterns[]
- signature_phrases[]

关键要求：
1. mentalModels 直接使用上面验证过的数据（不要重新编造）
2. heuristics 直接使用上面验证过的数据
3. expressionDNA 直接使用上面验证过的数据
4. contradictions 直接使用上面验证过的数据
5. rubrics 至少 3 个维度，每个 3 级评分
6. aggregation_logic 用 "加权评分 + 一票否决"
7. constraints.must_conclude 与 constraints.allow_assumption 必须为布尔值

只输出一个 JSON 对象。`;

  const { content } = await generate(profilePrompt, 'analysis', {
    maxTokens: 12288,
    temperature: 0.25,
  });

  try {
    const profile = extractJsonObject(content);
    console.log('  ✓ ExpertProfile 生成成功');
    return profile;
  } catch (err: any) {
    console.error('  ✗ Profile JSON 解析失败:', err.message);
    throw new Error(`Profile JSON 解析失败: ${err.message}`);
  }
}

// ============================================================
// CLI
// ============================================================

function parseArgs(): ResearchInput & { outDir: string } {
  const args = process.argv.slice(2);
  let name = '';
  let domain = '';
  let depth: 'quick' | 'standard' | 'deep' = 'standard';
  let expertId: string | undefined;
  let outDir = path.join(API_ROOT, 'src/modules/expert-library/data/generated/pending-review');

  for (const arg of args) {
    if (arg.startsWith('--name=')) name = arg.slice('--name='.length);
    else if (arg.startsWith('--domain=')) domain = arg.slice('--domain='.length);
    else if (arg.startsWith('--depth=')) depth = arg.slice('--depth='.length) as any;
    else if (arg.startsWith('--expert-id=')) expertId = arg.slice('--expert-id='.length);
    else if (arg.startsWith('--out-dir=')) outDir = arg.slice('--out-dir='.length);
  }

  if (!name || !domain) {
    console.error('用法: npx tsx src/scripts/research-expert-profile.ts --name="马斯克" --domain="科技战略" [--depth=standard]');
    process.exit(1);
  }

  return { name, domain, depth, expertId, outDir };
}

async function main() {
  const args = parseArgs();
  const expertId = args.expertId || `R-${Date.now().toString(36).toUpperCase()}`;

  console.log('═══════════════════════════════════════════════');
  console.log(`  6 Agent 并行调研：${args.name} (${args.domain})`);
  console.log(`  深度: ${args.depth} | ID: ${expertId}`);
  console.log('═══════════════════════════════════════════════');

  // Phase 1: 并行调研
  const dimensionResults = await runParallelResearch({
    name: args.name,
    domain: args.domain,
    depth: args.depth,
  });

  // 保存调研原始结果
  fs.mkdirSync(args.outDir, { recursive: true });
  const researchFile = path.join(args.outDir, `${expertId}.research.json`);
  fs.writeFileSync(researchFile, JSON.stringify({
    expertId,
    name: args.name,
    domain: args.domain,
    depth: args.depth,
    researchedAt: new Date().toISOString(),
    dimensions: dimensionResults,
  }, null, 2));
  console.log(`\n📄 调研原始结果已保存: ${researchFile}`);

  // Phase 2: 合成
  const synthesis = await synthesizeResearch(args.name, args.domain, dimensionResults);

  const synthesisFile = path.join(args.outDir, `${expertId}.synthesis.json`);
  fs.writeFileSync(synthesisFile, JSON.stringify(synthesis, null, 2));
  console.log(`📄 合成结果已保存: ${synthesisFile}`);

  // Phase 3: 生成 Profile
  const profile = await generateEnhancedProfile(args.name, args.domain, expertId, synthesis);

  const profileFile = path.join(args.outDir, `${expertId}.json`);
  fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2));
  console.log(`📄 ExpertProfile 已保存: ${profileFile}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ 完成！后续步骤：');
  console.log(`  1. 审核: ${profileFile}`);
  console.log(`  2. 通过后移至 approved/ 目录`);
  console.log(`  3. 执行 npx tsx src/scripts/upsert-expert-profiles-from-files.ts`);
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ 调研脚本执行失败:', err);
  process.exit(1);
});
