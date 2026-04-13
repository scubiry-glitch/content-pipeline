// Expression DNA Linter — 后置校验 LLM 输出是否符合专家的表达 DNA
// 纯本地启发式检查，无 LLM 调用
// 用于 Phase 7: generation 任务的风格一致性保障

import type { ExpressionDNA } from './types.js';

export interface LinterResult {
  pass: boolean;
  issues: string[];
  /** 每项启发式检查的详细结果（用于调试/展示）*/
  checks: Array<{
    rule: string;
    passed: boolean;
    detail?: string;
  }>;
}

/**
 * 校验 LLM 输出是否符合专家的 expressionDNA 特征
 *
 * 当前实现的启发式检查：
 * 1. 句长分布：如果 sentencePattern 提到"极简"/"短句"，则平均句长应 <= 30 中文字符/20 英文词
 *    反之"长句嵌套"则应 > 30
 * 2. 确定性词汇：如果 certaintyCali 提到"不说'我认为'"/"结论式"，则输出中 "我认为/可能/或许/大概" 等词频应 < 5%
 * 3. 引用习惯：如果 citationHabit 提到"物理定律"/"工程实例"，则输出应至少包含一个数字或量化表述
 * 4. 用词偏好：如果 vocabularyPreference 描述了特定术语偏好（如"工程术语"），检查关键字是否出现
 *
 * 注意：所有检查都是启发式的、宽松的——目的是捕捉"明显风格偏离"而非追求精确。
 * 无法覆盖的字段自动跳过，降级为 pass=true。
 */
export function validateExpressionDNA(
  output: string,
  expressionDNA: ExpressionDNA | undefined,
): LinterResult {
  const checks: LinterResult['checks'] = [];
  const issues: string[] = [];

  if (!expressionDNA) {
    return { pass: true, issues: [], checks: [] };
  }

  // ===== Check 1: 句长分布 =====
  if (expressionDNA.sentencePattern) {
    const pattern = expressionDNA.sentencePattern.toLowerCase();
    const avgLen = computeAvgSentenceLength(output);
    const prefersShort = /极简|短句|简短|断言|[1-9]\s*-?\s*[1-9]\s*字|简洁/.test(pattern);
    const prefersLong = /长句|嵌套|层层|复合|学术/.test(pattern);

    if (prefersShort) {
      const passed = avgLen <= 40; // 允许一定宽松
      checks.push({
        rule: '句式偏好: 短句',
        passed,
        detail: `平均句长=${avgLen.toFixed(1)}, 预期 <= 40`,
      });
      if (!passed) {
        issues.push(`句长偏离：预期短句(<=40字)，实际平均 ${avgLen.toFixed(1)} 字`);
      }
    } else if (prefersLong) {
      const passed = avgLen >= 25;
      checks.push({
        rule: '句式偏好: 长句',
        passed,
        detail: `平均句长=${avgLen.toFixed(1)}, 预期 >= 25`,
      });
      if (!passed) {
        issues.push(`句长偏离：预期长句(>=25字)，实际平均 ${avgLen.toFixed(1)} 字`);
      }
    }
  }

  // ===== Check 2: 确定性词汇 =====
  if (expressionDNA.certaintyCali) {
    const certainty = expressionDNA.certaintyCali.toLowerCase();
    const forbidsHedging = /不说.*我认为|结论式|极度确信|不说.*可能/.test(certainty);

    if (forbidsHedging) {
      const hedgingMatches = output.match(/我认为|可能|或许|大概|也许|似乎|应该/g) ?? [];
      const totalChars = output.length;
      const ratio = totalChars > 0 ? hedgingMatches.length / (totalChars / 100) : 0;
      const passed = ratio < 0.5; // 每 100 字少于 0.5 个对冲词
      checks.push({
        rule: '确定性: 拒绝对冲语',
        passed,
        detail: `对冲词 ${hedgingMatches.length} 个/${totalChars} 字 (ratio=${ratio.toFixed(2)})`,
      });
      if (!passed) {
        issues.push(`确定性偏离：出现 ${hedgingMatches.length} 个对冲词(我认为/可能/或许等)，违反 certaintyCali`);
      }
    }
  }

  // ===== Check 3: 引用习惯 =====
  if (expressionDNA.citationHabit) {
    const citation = expressionDNA.citationHabit.toLowerCase();
    const expectsQuantitative = /物理|工程|数据|实测|benchmark|财务|数字/.test(citation);

    if (expectsQuantitative) {
      const hasNumbers = /\d+(?:\.\d+)?(%|元|美元|亿|万|倍|%|kwh|\$)/i.test(output) ||
        /\d{2,}/.test(output);
      checks.push({
        rule: '引用: 需量化数据',
        passed: hasNumbers,
        detail: hasNumbers ? '出现数字/单位' : '未发现量化表述',
      });
      if (!hasNumbers) {
        issues.push(`引用习惯偏离：该专家偏好量化数据，但输出中未发现数字或单位`);
      }
    }
  }

  // ===== Check 4: 用词偏好 =====
  if (expressionDNA.vocabularyPreference) {
    const vocab = expressionDNA.vocabularyPreference.toLowerCase();
    // 提取 vocab 描述中的关键术语（连续汉字或引号内词）
    const termMatches = vocab.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
    const keyTerms = termMatches.filter(t => !['术语', '用词', '偏好', '描述', '例如', '常用', '经常'].includes(t)).slice(0, 4);

    if (keyTerms.length >= 2) {
      const hits = keyTerms.filter(t => output.includes(t));
      const passed = hits.length >= 1;
      checks.push({
        rule: '用词: 关键术语出现',
        passed,
        detail: `${hits.length}/${keyTerms.length} 命中 (期望术语: ${keyTerms.join('、')})`,
      });
      if (!passed) {
        issues.push(`用词偏离：预期出现 ${keyTerms.join('/')} 等术语，但未命中任一`);
      }
    }
  }

  return {
    pass: issues.length === 0,
    issues,
    checks,
  };
}

/**
 * 计算输出的平均句长（中文字符数 + 英文词数）
 * 按中英文句末标点切分
 */
function computeAvgSentenceLength(text: string): number {
  const sentences = text.split(/[。！？.!?；;]+/).filter(s => s.trim().length >= 3);
  if (sentences.length === 0) return 0;
  const totalLen = sentences.reduce((sum, s) => sum + s.trim().length, 0);
  return totalLen / sentences.length;
}
