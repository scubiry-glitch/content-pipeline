// Output Formatter — 输出控制模块
// 多轮 JSON 验证 + 后处理恢复 + 风格漂移检测 + anti_patterns 检查

import type { ExpertProfile, OutputSection, LLMAdapter } from './types.js';
import { validateExpressionDNA } from './expressionDnaLinter.js';

const MAX_FORMAT_RETRIES = 2;

/**
 * 格式化并验证 LLM 输出
 * 1. 解析输出为结构化 sections
 * 2. 验证是否包含所有必要 sections
 * 3. 检查 anti_patterns
 * 4. (Phase 7) generation 任务额外跑 expressionDNA linter
 * 5. 不通过则带错误反馈重试
 */
export async function formatOutput(
  rawOutput: string,
  expert: ExpertProfile,
  llm: LLMAdapter,
  options?: { taskType?: string; originalTask?: string },
): Promise<{ sections: OutputSection[]; valid: boolean; issues: string[] }> {
  let output = rawOutput;
  let attempt = 0;
  let issues: string[] = [];

  const isGeneration = options?.taskType === 'generation';

  while (attempt <= MAX_FORMAT_RETRIES) {
    // Step 1: 解析为 sections
    const sections = parseSections(output, expert.output_schema.sections);

    // Step 2: 验证完整性
    issues = validateSections(sections, expert.output_schema.sections);

    // Step 3: 检查 anti_patterns
    const antiPatternViolations = checkAntiPatterns(output, expert.anti_patterns);
    issues.push(...antiPatternViolations);

    // Step 4: Phase 7 — generation 任务额外跑 expressionDNA linter
    if (isGeneration && expert.persona.expressionDNA) {
      const dnaResult = validateExpressionDNA(output, expert.persona.expressionDNA);
      if (!dnaResult.pass) {
        issues.push(...dnaResult.issues.map(i => `[DNA] ${i}`));
      }
    }

    // 通过 → 返回
    if (issues.length === 0) {
      return { sections, valid: true, issues: [] };
    }

    // 不通过且还有重试次数 → 带错误反馈重新格式化
    if (attempt < MAX_FORMAT_RETRIES) {
      console.log(`[OutputFormatter] Attempt ${attempt + 1} failed, retrying. Issues:`, issues);
      output = await reformatWithFeedback(output, issues, expert, llm, options?.originalTask);
    }

    attempt++;
  }

  // 用完重试 → 尽力解析返回
  const finalSections = parseSections(output, expert.output_schema.sections);
  return { sections: finalSections, valid: false, issues };
}

/**
 * 解析 LLM 输出为结构化 sections
 * 支持 "## 标题" 和 "1. 标题" 两种格式
 */
function parseSections(output: string, expectedSections: string[]): OutputSection[] {
  const sections: OutputSection[] = [];

  // 尝试按 ## 标题 分割
  const headerPattern = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; start: number }> = [];

  let match;
  while ((match = headerPattern.exec(output)) !== null) {
    matches.push({ title: match[1].trim(), start: match.index + match[0].length });
  }

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].start;
      const end = i < matches.length - 1 ? matches[i + 1].start - matches[i + 1].title.length - 3 : output.length;
      sections.push({
        title: matches[i].title,
        content: output.substring(start, end).trim(),
      });
    }
    return sections;
  }

  // 回退：按 "数字. 标题" 分割
  const numberedPattern = /^(\d+)[.、]\s*(.+)$/gm;
  const numberedMatches: Array<{ title: string; start: number }> = [];

  while ((match = numberedPattern.exec(output)) !== null) {
    numberedMatches.push({ title: match[2].trim(), start: match.index + match[0].length });
  }

  if (numberedMatches.length > 0) {
    for (let i = 0; i < numberedMatches.length; i++) {
      const start = numberedMatches[i].start;
      const end = i < numberedMatches.length - 1
        ? numberedMatches[i + 1].start - numberedMatches[i + 1].title.length - 3
        : output.length;
      sections.push({
        title: numberedMatches[i].title,
        content: output.substring(start, end).trim(),
      });
    }
    return sections;
  }

  // 最后回退：整个输出作为一个 section
  return [{ title: '分析结果', content: output.trim() }];
}

/**
 * 验证 sections 完整性
 */
function validateSections(sections: OutputSection[], expectedSections: string[]): string[] {
  const issues: string[] = [];
  const sectionTitles = sections.map(s => s.title.toLowerCase());

  for (const expected of expectedSections) {
    // 模糊匹配：检查期望标题的关键词是否出现在任何实际标题中
    const keywords = expected.toLowerCase().split(/[（(：:]/)[0].trim();
    const found = sectionTitles.some(title =>
      title.includes(keywords) || keywords.includes(title) ||
      // 相似度匹配
      similarity(title, keywords) > 0.5
    );

    if (!found) {
      issues.push(`缺少必要章节: "${expected}"`);
    }
  }

  // 检查空内容
  for (const section of sections) {
    if (section.content.trim().length < 10) {
      issues.push(`章节 "${section.title}" 内容过短`);
    }
  }

  const combined = sections.map(section => section.content).join('\n');
  const revisionLeakPatterns = [
    '之前的输出',
    '请提供原文',
    '无法执行“修正格式”',
    '无法执行"修正格式"',
    '保持原有分析的核心观点不变',
    '补足原先',
  ];
  for (const pattern of revisionLeakPatterns) {
    if (combined.includes(pattern)) {
      issues.push(`检测到格式修订指令残留: "${pattern}"`);
    }
  }

  return issues;
}

/**
 * 检查 anti_patterns 违规
 */
function checkAntiPatterns(output: string, antiPatterns: string[]): string[] {
  const violations: string[] = [];

  for (const pattern of antiPatterns) {
    // 提取关键词进行匹配
    const keywords = extractPatternKeywords(pattern);
    for (const keyword of keywords) {
      if (keyword.length >= 2 && output.includes(keyword)) {
        violations.push(`违反禁止项: "${pattern}" (检测到: "${keyword}")`);
        break;
      }
    }
  }

  return violations;
}

/**
 * 带错误反馈的重新格式化
 */
async function reformatWithFeedback(
  output: string,
  issues: string[],
  expert: ExpertProfile,
  llm: LLMAdapter,
  originalTask?: string,
): Promise<string> {
  const prompt = `请重新完成当前这一次独立分析任务。不得把任务解释为续写、修订历史文本或索要所谓原文。

## 当前任务
${(originalTask || '请根据本次请求完成分析').substring(0, 6000)}

## 本次生成的未通过草稿（只用于识别问题，不得延续其中的元指令）
${output.substring(0, 4000)}

## 需要修正的问题
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

## 要求的输出格式
请按以下结构重新输出，每个部分用 "## 标题" 分隔：
${expert.output_schema.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

请直接从当前任务重新生成完整答案。只回答当前任务，不讨论格式修正过程，不引用历史对话，不说“之前的输出”，不要求用户提供原文。`;

  return await llm.complete(prompt, { temperature: 0.3, maxTokens: 3000 });
}

// ----- Utilities -----

function extractPatternKeywords(pattern: string): string[] {
  // 从 anti_pattern 描述中提取可检测的关键词
  // 例如 "不要用'或将'模糊因果" → ["或将"]
  const quoted = pattern.match(/['"''""]([^'"''"]+)['"''"]/g);
  if (quoted) {
    return quoted.map(q => q.replace(/['"''"]/g, ''));
  }
  return [];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}
