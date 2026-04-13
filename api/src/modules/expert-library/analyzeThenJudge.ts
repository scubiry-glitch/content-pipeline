// Analyze-then-Judge — 多模态评估引擎
// 强制三步: 提取(Extract) → 比对(Compare) → 裁决(Verdict)
// 比对阶段解耦为: 忠实度(Faithfulness) + 事实性(Factuality)

import type {
  AnalysisResult, ExtractionResult, ComparisonResult, ComparisonAxis,
  VerdictResult, OutputSection, InputType, LLMAdapter, ExpertProfile, RubricScore
} from './types.js';

/**
 * Analyze-then-Judge 评估流程
 * 仅用于 task_type === 'evaluation'
 */
export async function analyzeThenJudge(
  inputContent: string,
  inputType: InputType,
  expert: ExpertProfile,
  llm: LLMAdapter,
  context?: string
): Promise<AnalysisResult> {
  // Step 1: 显性特征提取
  const extraction = await extract(inputContent, inputType, llm);

  // Step 2: 证据交叉比对（忠实度 + 事实性 双轴独立）
  const comparison = await compare(extraction, inputContent, expert, llm, context);

  // Step 3: 推导最终裁决
  const verdict = await judge(extraction, comparison, expert, llm);

  return { extraction, comparison, verdict };
}

// ----- Step 1: 显性特征提取 -----

async function extract(
  content: string,
  inputType: InputType,
  llm: LLMAdapter
): Promise<ExtractionResult> {
  const typeInstructions: Record<string, string> = {
    text: '请穷尽式列出文章的所有核心元素：论点、论据、数据来源、逻辑结构、引用',
    ppt: '请逐页列出PPT的所有元素：每页标题、核心文字、数据图表描述、布局特征、视觉层次',
    image: '请详细描述图片的所有视觉元素：构图、色彩、文字内容、信息层次、情绪基调',
    video: '请列出视频转录文本中的所有核心元素：主题结构、关键时间点、论点序列、CTA',
    pdf: '请穷尽式列出文档的所有核心元素：章节结构、论点、数据、图表、参考来源',
    meeting_minutes: '请列出会议纪要的所有核心元素：参与者观点、决议、分歧点、行动项',
  };

  const instruction = typeInstructions[inputType] || typeInstructions.text;

  const prompt = `## 任务：客观特征提取
你是一个绝对客观的观察者。在这一步，你绝不进行任何评价，只做记录。

${instruction}

## 输入内容
${content.substring(0, 6000)}

## 要求
以 JSON 格式返回：
{
  "elements": ["元素1", "元素2", ...],
  "structure": {}
}

elements 数组：列出所有观察到的元素（至少10项）
structure 对象：如果有层级结构（如PPT页码、文章章节），用键值对表示

只返回 JSON。`;

  try {
    const response = await llm.complete(prompt, { temperature: 0.1, maxTokens: 2000 });
    const parsed = JSON.parse(extractJSON(response));
    return {
      elements: ensureArray(parsed.elements),
      structure: parsed.structure || {},
    };
  } catch {
    return { elements: [content.substring(0, 200)], structure: {} };
  }
}

// ----- Step 2: 证据交叉比对 -----

async function compare(
  extraction: ExtractionResult,
  originalContent: string,
  expert: ExpertProfile,
  llm: LLMAdapter,
  context?: string
): Promise<ComparisonResult> {
  // 两条校验链路独立执行

  const [faithfulness, factuality] = await Promise.all([
    checkFaithfulness(extraction, originalContent, llm),
    checkFactuality(extraction, expert, llm, context),
  ]);

  return { faithfulness, factuality };
}

/**
 * 忠实度校验：内容描述是否契合实际输入
 * 捕捉多模态幻觉（如声称有数据支撑但实际没有）
 */
async function checkFaithfulness(
  extraction: ExtractionResult,
  originalContent: string,
  llm: LLMAdapter
): Promise<ComparisonAxis> {
  const prompt = `## 忠实度校验
请逐条核实以下提取的元素是否确实出现在原始内容中。

## 提取的元素
${extraction.elements.slice(0, 15).map((e, i) => `${i + 1}. ${e}`).join('\n')}

## 原始内容
${originalContent.substring(0, 4000)}

## 要求
以 JSON 返回：
{
  "matches": ["确实出现的元素"],
  "contradictions": ["声称存在但实际不存在的元素"],
  "gaps": ["原始内容中有但未被提取的重要元素"]
}
只返回 JSON。`;

  try {
    const response = await llm.complete(prompt, { temperature: 0.1, maxTokens: 1500 });
    const parsed = JSON.parse(extractJSON(response));
    return {
      matches: ensureArray(parsed.matches),
      contradictions: ensureArray(parsed.contradictions),
      gaps: ensureArray(parsed.gaps),
    };
  } catch {
    return { matches: [], contradictions: [], gaps: [] };
  }
}

/**
 * 事实性校验：内容是否符合客观常识和专家标准
 * 捕捉知识幻觉（如违反物理定律、数据明显错误）
 */
async function checkFactuality(
  extraction: ExtractionResult,
  expert: ExpertProfile,
  llm: LLMAdapter,
  context?: string
): Promise<ComparisonAxis> {
  const expertCriteria = [
    ...(expert.emm?.veto_rules || []),
    ...(expert.persona.values?.dealbreakers || []),
  ];

  const prompt = `## 事实性校验
请检查以下内容元素是否符合客观事实和专业常识。

## 内容元素
${extraction.elements.slice(0, 15).map((e, i) => `${i + 1}. ${e}`).join('\n')}

${expertCriteria.length > 0 ? `## 专家标准\n${expertCriteria.map(c => `- ${c}`).join('\n')}` : ''}
${context ? `## 额外上下文\n${context}` : ''}

## 要求
以 JSON 返回：
{
  "matches": ["符合事实和专家标准的元素"],
  "contradictions": ["违反客观事实或专家标准的元素"],
  "gaps": ["应该提到但缺失的关键事实"]
}
只返回 JSON。`;

  try {
    const response = await llm.complete(prompt, { temperature: 0.2, maxTokens: 1500 });
    const parsed = JSON.parse(extractJSON(response));
    return {
      matches: ensureArray(parsed.matches),
      contradictions: ensureArray(parsed.contradictions),
      gaps: ensureArray(parsed.gaps),
    };
  } catch {
    return { matches: [], contradictions: [], gaps: [] };
  }
}

// ----- Step 3: 推导最终裁决 -----

async function judge(
  extraction: ExtractionResult,
  comparison: ComparisonResult,
  expert: ExpertProfile,
  llm: LLMAdapter
): Promise<VerdictResult> {
  const allContradictions = [
    ...comparison.faithfulness.contradictions,
    ...comparison.factuality.contradictions,
  ];
  const allGaps = [
    ...comparison.faithfulness.gaps,
    ...comparison.factuality.gaps,
  ];

  const rubrics = expert.output_schema.rubrics || [];
  const hasRubrics = rubrics.length > 0;

  const rubricInstruction = hasRubrics
    ? `\n\n## 结构化评分（必须按以下维度独立打分）
${rubrics
  .map(
    (r, i) =>
      `${i + 1}. **${r.dimension}**\n` +
      r.levels
        .map(l => `   - ${l.score} 分：${l.description}`)
        .join('\n')
  )
  .join('\n')}

在文字评估之后，**额外输出一段 \`\`\`json ... \`\`\` 代码块**，格式如下：
\`\`\`json
{
  "rubric_scores": [
${rubrics.map(r => `    { "dimension": "${r.dimension}", "score": <1-5整数>, "rationale": "<一句话评分依据>" }`).join(',\n')}
  ]
}
\`\`\`

每个维度必须给出整数分数和一句话 rationale，不得省略。`
    : '';

  const prompt = `## 最终裁决
基于以下分析证据，以 ${expert.name} 的视角给出最终评估。

## 发现的问题
矛盾点：
${allContradictions.length > 0 ? allContradictions.map(c => `- ❌ ${c}`).join('\n') : '- 无明显矛盾'}

缺失项：
${allGaps.length > 0 ? allGaps.map(g => `- ⚠️ ${g}`).join('\n') : '- 无明显缺失'}

## 输出要求
请按以下结构给出评估（每个部分用 ## 分隔）：
${expert.output_schema.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

每个判断必须附带来自上述分析的证据链。${rubricInstruction}`;

  const response = await llm.completeWithSystem(
    `你是 ${expert.name}。${expert.persona.style}。${expert.persona.tone}。`,
    prompt,
    { temperature: 0.5, maxTokens: 3000 }
  );

  // 解析结构化 rubric 评分（如有）
  const rubricScores = hasRubrics ? parseRubricScores(response, rubrics) : undefined;

  return {
    sections: [{ title: '评估结果', content: response }],
    evidence_chain: [...allContradictions, ...allGaps],
    rubric_scores: rubricScores,
  };
}

/**
 * 从 LLM 输出中解析 rubric_scores JSON 块
 * 返回 undefined 表示解析失败（不会抛错，下游当做无评分处理）
 */
function parseRubricScores(
  output: string,
  rubrics: ExpertProfile['output_schema']['rubrics']
): RubricScore[] | undefined {
  if (!rubrics || rubrics.length === 0) return undefined;

  // 优先匹配 ```json ... ``` 代码块
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates: string[] = [];
  if (codeBlockMatch) candidates.push(codeBlockMatch[1]);
  // fallback：找文末最后一个 { ... } 作为 JSON
  const lastBrace = output.lastIndexOf('{');
  if (lastBrace >= 0) candidates.push(output.substring(lastBrace));

  for (const cand of candidates) {
    try {
      const parsed = JSON.parse(cand.trim());
      const arr = parsed?.rubric_scores;
      if (!Array.isArray(arr)) continue;
      const validDimensions = new Set(rubrics.map(r => r.dimension));
      const cleaned: RubricScore[] = arr
        .filter((x: any) => x && typeof x === 'object' && validDimensions.has(x.dimension))
        .map((x: any) => ({
          dimension: String(x.dimension),
          score: Number.isFinite(Number(x.score)) ? Math.max(1, Math.min(5, Math.round(Number(x.score)))) : 3,
          rationale: typeof x.rationale === 'string' ? x.rationale : '',
        }));
      if (cleaned.length > 0) return cleaned;
    } catch {
      // continue to next candidate
    }
  }
  return undefined;
}

// ----- Utilities -----

function extractJSON(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : '{}';
}

function ensureArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string');
  return [];
}
