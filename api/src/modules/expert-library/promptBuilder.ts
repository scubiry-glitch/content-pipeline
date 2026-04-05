// Prompt Builder — 从 ExpertProfile 动态组装 system_prompt
// 按有无深度字段自动切换简洁/丰富模式

import type { ExpertProfile, ExpertPersona, ExpertMethod, ExpertEMM, InputAnalysis, ExpertRequestParams } from './types.js';

/**
 * 组装完整的 system prompt
 * 包含: 身份 + 方法论 + EMM规则 + 知识上下文 + 输入分析 + 任务 + 输出格式 + 反模式 + 签名
 */
export function buildSystemPrompt(
  expert: ExpertProfile,
  options?: {
    taskType?: string;
    inputAnalysis?: InputAnalysis;
    knowledgeContext?: string;
    params?: ExpertRequestParams;
  }
): string {
  const sections: string[] = [];

  // 1. Identity — 人格层
  sections.push(buildPersonaSection(expert.name, expert.persona, expert.domain));

  // 2. Method — 方法层
  sections.push(buildMethodSection(expert.method));

  // 3. EMM Rules — 门控规则
  if (expert.emm) {
    sections.push(buildEMMSection(expert.emm));
  }

  // 4. Knowledge Context — 知识源
  if (options?.knowledgeContext) {
    sections.push(buildKnowledgeSection(options.knowledgeContext));
  }

  // 5. Input Analysis — 输入增强结果
  if (options?.inputAnalysis) {
    sections.push(buildInputAnalysisSection(options.inputAnalysis));
  }

  // 6. Task — 任务指令
  if (options?.taskType || options?.params) {
    sections.push(buildTaskSection(options.taskType, options.params));
  }

  // 7. Output Schema — 输出格式
  sections.push(buildOutputSection(expert.output_schema, options?.params?.output_format));

  // 8. Anti-patterns — 禁止项
  if (expert.anti_patterns.length > 0) {
    sections.push(buildAntiPatternsSection(expert.anti_patterns));
  }

  // 9. Signature — 标志性表达
  if (expert.signature_phrases.length > 0) {
    sections.push(buildSignatureSection(expert.signature_phrases));
  }

  // 10. Constraints
  sections.push(buildConstraintsSection(expert.constraints));

  return sections.filter(Boolean).join('\n\n');
}

// ----- Section Builders -----

function buildPersonaSection(name: string, persona: ExpertPersona, domains: string[]): string {
  const lines: string[] = [];

  lines.push(`## 身份`);
  lines.push(`你是 ${name}，${domains.join('/')}`);
  lines.push(`风格：${persona.style}`);
  lines.push(`语气：${persona.tone}`);
  lines.push(`核心偏好：${persona.bias.join('、')}`);

  // 深度人格 — 认知底色
  if (persona.cognition) {
    const c = persona.cognition;
    lines.push('');
    lines.push(`思维模型：${c.mentalModel}`);
    lines.push(`决策风格：${c.decisionStyle}`);
    lines.push(`风险态度：${c.riskAttitude}`);
    lines.push(`时间视野：${c.timeHorizon}`);
  }

  // 深度人格 — 价值标尺
  if (persona.values) {
    const v = persona.values;
    lines.push('');
    lines.push(`让你眼前一亮的：${v.excites.join('；')}`);
    lines.push(`让你皱眉的：${v.irritates.join('；')}`);
    lines.push(`你的及格线：${v.qualityBar}`);
    if (v.dealbreakers.length > 0) {
      lines.push(`绝对不能容忍：${v.dealbreakers.join('；')}`);
    }
  }

  // 深度人格 — 审美品位
  if (persona.taste) {
    const t = persona.taste;
    lines.push('');
    lines.push(`你欣赏的：${t.admires.join('；')}`);
    lines.push(`你鄙视的：${t.disdains.join('；')}`);
    lines.push(`品质标杆：${t.benchmark}`);
  }

  // 深度人格 — 表达风格
  if (persona.voice) {
    lines.push('');
    lines.push(`反对时：${persona.voice.disagreementStyle}`);
    lines.push(`赞赏时：${persona.voice.praiseStyle}`);
  }

  // 深度人格 — 盲区自知
  if (persona.blindSpots) {
    const b = persona.blindSpots;
    lines.push('');
    lines.push(`你的已知偏见：${b.knownBias.join('；')}`);
    lines.push(`你的薄弱领域：${b.weakDomains.join('；')}`);
    lines.push(`自我认知：${b.selfAwareness}`);
  }

  return lines.join('\n');
}

function buildMethodSection(method: ExpertMethod): string {
  const lines: string[] = [];

  lines.push(`## 分析方法`);
  lines.push(`分析框架：${method.frameworks.join('、')}`);
  lines.push(`推理方式：${method.reasoning}`);
  lines.push(`分析步骤：`);
  method.analysis_steps.forEach((step, i) => {
    lines.push(`  ${i + 1}. ${step}`);
  });

  // 深度方法论 — 评审镜头
  if (method.reviewLens) {
    const r = method.reviewLens;
    lines.push('');
    lines.push(`第一眼看：${r.firstGlance}`);
    lines.push(`深入看：${r.deepDive.join('；')}`);
    lines.push(`一票否决：${r.killShot}`);
    lines.push(`加分项：${r.bonusPoints.join('；')}`);
  }

  if (method.dataPreference) {
    lines.push(`数据偏好：${method.dataPreference}`);
  }

  if (method.evidenceStandard) {
    lines.push(`证据标准：${method.evidenceStandard}`);
  }

  return lines.join('\n');
}

function buildEMMSection(emm: ExpertEMM): string {
  const lines: string[] = [];

  lines.push(`## 判断规则（必须严格遵守）`);
  lines.push(`核心决策变量：${emm.critical_factors.join('、')}`);

  // 权重
  const weightEntries = Object.entries(emm.factor_hierarchy)
    .sort(([, a], [, b]) => b - a);
  lines.push(`变量权重：`);
  weightEntries.forEach(([factor, weight]) => {
    lines.push(`  - ${factor}: ${(weight * 100).toFixed(0)}%`);
  });

  // 一票否决
  if (emm.veto_rules.length > 0) {
    lines.push(`\n一票否决规则（遇到以下情况必须明确指出）：`);
    emm.veto_rules.forEach(rule => {
      lines.push(`  ❌ ${rule}`);
    });
  }

  lines.push(`聚合逻辑：${emm.aggregation_logic}`);

  return lines.join('\n');
}

function buildKnowledgeSection(knowledgeContext: string): string {
  return `## 你近期研究的参考资料\n${knowledgeContext}`;
}

function buildInputAnalysisSection(analysis: InputAnalysis): string {
  const lines: string[] = [];

  lines.push(`## 输入内容的预分析结果`);

  if (analysis.facts.length > 0) {
    lines.push(`事实陈述：`);
    analysis.facts.forEach(f => lines.push(`  - ${f}`));
  }

  if (analysis.opinions.length > 0) {
    lines.push(`观点/判断：`);
    analysis.opinions.forEach(o => lines.push(`  - ${o}`));
  }

  if (analysis.conflicts.length > 0) {
    lines.push(`发现的矛盾：`);
    analysis.conflicts.forEach(c => lines.push(`  ⚠️ ${c}`));
  }

  if (analysis.hidden_assumptions.length > 0) {
    lines.push(`隐含假设：`);
    analysis.hidden_assumptions.forEach(h => lines.push(`  💡 ${h}`));
  }

  if (analysis.data_points.length > 0) {
    lines.push(`关键数据点：`);
    analysis.data_points.forEach(d => lines.push(`  📊 ${d}`));
  }

  if (analysis.sentiment_shifts && analysis.sentiment_shifts.length > 0) {
    lines.push(`立场/信心变化：`);
    analysis.sentiment_shifts.forEach(s => lines.push(`  🔄 ${s}`));
  }

  lines.push(`来源质量评估：${analysis.source_quality}`);

  return lines.join('\n');
}

function buildTaskSection(taskType?: string, params?: ExpertRequestParams): string {
  const lines: string[] = [];

  lines.push(`## 任务要求`);

  if (taskType) {
    const taskLabels: Record<string, string> = {
      analysis: '深度分析 — 给出结论和判断依据',
      evaluation: '优劣评估 — 指出问题、给出修改建议',
      generation: '内容生成 — 按要求产出内容',
    };
    lines.push(`任务类型：${taskLabels[taskType] || taskType}`);
  }

  if (params?.depth) {
    const depthLabels: Record<string, string> = {
      quick: '快速扫描，聚焦最关键的1-2个问题',
      standard: '标准深度，覆盖主要维度',
      deep: '深度分析，不遗漏任何细节',
    };
    lines.push(`分析深度：${depthLabels[params.depth] || params.depth}`);
  }

  if (params?.methodology) {
    lines.push(`指定方法论：${params.methodology}（覆盖默认分析框架）`);
  }

  if (params?.focus_areas && params.focus_areas.length > 0) {
    lines.push(`重点关注：${params.focus_areas.join('、')}`);
  }

  return lines.join('\n');
}

function buildOutputSection(
  schema: ExpertProfile['output_schema'],
  formatOverride?: string
): string {
  const lines: string[] = [];

  lines.push(`## 输出格式（必须严格遵守）`);
  lines.push(`格式：${formatOverride || schema.format}`);
  lines.push(`请按以下结构输出，每个部分用 "## 标题" 分隔：`);
  schema.sections.forEach((section, i) => {
    lines.push(`  ${i + 1}. ${section}`);
  });

  // 透明评估量表
  if (schema.rubrics && schema.rubrics.length > 0) {
    lines.push('');
    lines.push('评估量表（请参考以下标准打分）：');
    schema.rubrics.forEach(rubric => {
      lines.push(`  ${rubric.dimension}：`);
      rubric.levels.forEach(level => {
        lines.push(`    ${level.score}分 — ${level.description}`);
      });
    });
  }

  return lines.join('\n');
}

function buildAntiPatternsSection(antiPatterns: string[]): string {
  const lines: string[] = [];
  lines.push(`## 绝对禁止`);
  antiPatterns.forEach(pattern => {
    lines.push(`  ❌ ${pattern}`);
  });
  return lines.join('\n');
}

function buildSignatureSection(phrases: string[]): string {
  return `## 你的标志性表达（自然融入，不要刻意）\n${phrases.map(p => `  「${p}」`).join('\n')}`;
}

function buildConstraintsSection(constraints: ExpertProfile['constraints']): string {
  const lines: string[] = [];
  lines.push(`## 约束`);
  if (constraints.must_conclude) {
    lines.push(`- 必须给出明确结论，不允许骑墙`);
  }
  if (!constraints.allow_assumption) {
    lines.push(`- 不允许做未经验证的假设，不确定时明确标注`);
  }
  return lines.join('\n');
}
