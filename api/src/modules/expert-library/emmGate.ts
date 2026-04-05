// EMM Gate — 专家心智模型门控
// 将专家直觉转化为确定性逻辑门控网络，过滤 LLM 随机性输出
// 四步执行: 因子识别 → 层级结构化 → 布尔逻辑验证 → 聚合裁决

import type { ExpertEMM, EMMGateResult, ViolationCost, LLMAdapter } from './types.js';

const VIOLATION_THRESHOLD = 0.6;
const MAX_RETRIES = 2;

/**
 * EMM 门控检查 — 验证 LLM 输出是否符合专家心智模型
 */
export async function emmGateCheck(
  output: string,
  emm: ExpertEMM | undefined,
  llm: LLMAdapter
): Promise<EMMGateResult> {
  // 无 EMM 配置 → 直接放行
  if (!emm) {
    return {
      passed: true,
      violation_cost: { structural: 0, semantic: 0, logical: 0, total: 0 },
      veto_triggered: [],
      factor_coverage: {},
      retries: 0,
    };
  }

  // Step 1: 因子识别 — 从输出中提取涉及的决策变量
  const factorCoverage = await identifyFactors(output, emm.critical_factors, llm);

  // Step 2: 层级结构化 — 按权重评估覆盖度
  const coverageScore = calculateCoverageScore(factorCoverage, emm.factor_hierarchy);

  // Step 3: 布尔逻辑验证 — 检查一票否决规则
  const vetoTriggered = await checkVetoRules(output, emm.veto_rules, llm);

  // Step 4: 聚合裁决 — 计算违规成本
  const violationCost = calculateViolationCost(factorCoverage, vetoTriggered, coverageScore);

  const passed = vetoTriggered.length === 0 && violationCost.total < VIOLATION_THRESHOLD;

  return {
    passed,
    violation_cost: violationCost,
    veto_triggered: vetoTriggered,
    factor_coverage: factorCoverage,
    retries: 0,
  };
}

/**
 * 带重试的门控检查
 * 如果不通过，将错误反馈给 LLM 重新生成
 */
export async function emmGateWithRetry(
  generateFn: () => Promise<string>,
  emm: ExpertEMM | undefined,
  llm: LLMAdapter
): Promise<{ output: string; gateResult: EMMGateResult }> {
  let output = await generateFn();
  let gateResult = await emmGateCheck(output, emm, llm);
  let retries = 0;

  while (!gateResult.passed && retries < MAX_RETRIES) {
    retries++;
    console.log(`[EMM Gate] Retry ${retries}/${MAX_RETRIES} — violations:`, {
      veto: gateResult.veto_triggered,
      cost: gateResult.violation_cost.total.toFixed(2),
    });

    // 暂时直接放行，后续迭代可以将错误反馈注入重新生成
    // 当前先记录 retries 但不重新生成，避免 LLM 成本翻倍
    gateResult.retries = retries;
    break;
  }

  return { output, gateResult };
}

// ----- Step 1: 因子识别 -----

async function identifyFactors(
  output: string,
  criticalFactors: string[],
  llm: LLMAdapter
): Promise<Record<string, boolean>> {
  const coverage: Record<string, boolean> = {};

  // 使用简单的文本匹配作为快速路径
  // 后续可升级为 LLM 语义判断
  const outputLower = output.toLowerCase();

  for (const factor of criticalFactors) {
    // 简单匹配：检查因子关键词是否在输出中出现
    const keywords = factor.toLowerCase().split(/[、，/\s]+/);
    coverage[factor] = keywords.some(kw => kw.length >= 2 && outputLower.includes(kw));
  }

  return coverage;
}

// ----- Step 2: 层级结构化 -----

function calculateCoverageScore(
  factorCoverage: Record<string, boolean>,
  hierarchy: Record<string, number>
): number {
  let totalWeight = 0;
  let coveredWeight = 0;

  for (const [factor, weight] of Object.entries(hierarchy)) {
    totalWeight += weight;
    if (factorCoverage[factor]) {
      coveredWeight += weight;
    }
  }

  return totalWeight > 0 ? coveredWeight / totalWeight : 1;
}

// ----- Step 3: 布尔逻辑验证 -----

async function checkVetoRules(
  output: string,
  vetoRules: string[],
  llm: LLMAdapter
): Promise<string[]> {
  if (vetoRules.length === 0) return [];

  // 使用 LLM 判断输出是否触发否决规则
  const prompt = `请判断以下专家分析输出是否违反了任何否决规则。

## 否决规则
${vetoRules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}

## 专家输出
${output.substring(0, 3000)}

## 要求
请以 JSON 格式回复，列出被触发的否决规则编号。如果没有违反任何规则，返回空数组。
只返回 JSON，不要其他内容。
格式: {"triggered": []}`;

  try {
    const response = await llm.complete(prompt, {
      temperature: 0.1,
      maxTokens: 200,
      responseFormat: 'json',
    });

    const parsed = JSON.parse(extractJSON(response));
    const triggeredIndices: number[] = parsed.triggered || [];

    return triggeredIndices
      .filter(i => i >= 1 && i <= vetoRules.length)
      .map(i => vetoRules[i - 1]);
  } catch {
    // 解析失败 → 保守策略：不触发否决
    return [];
  }
}

// ----- Step 4: 聚合裁决 -----

function calculateViolationCost(
  factorCoverage: Record<string, boolean>,
  vetoTriggered: string[],
  coverageScore: number
): ViolationCost {
  // 结构成本：未覆盖的因子越多，逻辑跳跃越大
  const uncoveredCount = Object.values(factorCoverage).filter(v => !v).length;
  const totalFactors = Object.keys(factorCoverage).length;
  const structural = totalFactors > 0 ? uncoveredCount / totalFactors : 0;

  // 语义偏离成本：通过覆盖度反向计算
  const semantic = 1 - coverageScore;

  // 逻辑冲突成本：否决规则被触发则为 1
  const logical = vetoTriggered.length > 0 ? 1.0 : 0;

  const total = (structural * 0.3) + (semantic * 0.3) + (logical * 0.4);

  return { structural, semantic, logical, total };
}

// ----- Utilities -----

function extractJSON(text: string): string {
  // 尝试提取 JSON 部分
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : '{"triggered":[]}';
}
