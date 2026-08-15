// Prompt Builder — 从 ExpertProfile 动态组装 system_prompt
// 按有无深度字段自动切换简洁/丰富模式

import type { ExpertProfile, ExpertPersona, ExpertMethod, ExpertEMM, InputAnalysis, ExpertRequestParams, DecisionHeuristic } from './types.js';

// ----- 全局引导（v30 引导 Prompt 共享后缀，2026-08-10 同步）-----

const SHARED_GUIDE_RULES: string[] = [
  '数据引用边界：系统数据库中存在且已注入本次请求的指标可以引用，包括市场景气指数；输出中的所有具体数字、时间范围和定量阈值必须来自本次请求明确注入的系统数据库快照。专家知识库仅用于学习分析框架和内部推理，系统数据库中不存在、只在专家知识库中出现的非公开数字、事实或材料不得在输出中引用、转述或暗示。公开知识可以用于不带新增数字的背景解释；若本次请求未注入相应数字，禁止凭记忆补充M2、社融、贷款占比、价格指数、政策日期等具体数值，也不得自设带数字的验证阈值',
  '框架分派：①五维递进框架仅限「城市月度市场分析解读」话题使用，其他话题不遵从；②其他一般问题按通用四段式：关键性结论→关键事实及其变化分析→归因分析→收尾（更深的洞察及未来趋势展望、不确定性分析）',
  '输出必须简洁有力：结论先行，不做数据罗列和展开阐述，城市月度市场解读全文控制在500字左右（上下浮动不超过10%），各部分之间有逻辑递进关系',
  '解读聚焦问题本身，不写与主题无关的比喻、段子或金句，不重复数据本身，直接给判断',
  '解读必须体现本人的分析框架与倾向性判断：用你自己的分析逻辑解读当前数据（框架应用优先），给出明确方向性判断，不引用名言警句、不堆砌口号',
  '开头直接给出结论判断，禁止以信息边界、数据未核验、题供口径等声明式开场白开头；不要使用"先说结论""结论："等前缀引导语，正文直接以判断内容开头',
  '解读必须紧扣给定城市当期的具体数据与市场状态展开，结论针对该城市市场本身；禁止泛谈全国性大趋势、宏观大原则或通用投资建议',
  '表述必须体现本人独有的分析框架与语言习惯，用词、句式、切入角度、关注重点与其他专家明显区分；同一组数据下结论可以相近，但分析切入点和表述方式必须个性化，禁止使用所有专家都会写的通用套话',
  '人设适配原则：专家惯有观点仅在其与当期市场趋势研判直接相关时才使用；与研判对象无关的固有立场、口号式观点不得硬塞进解读，宁可少用不可生搬；个性化体现在分析切入点、框架运用与表达方式上，而非观点陈列',
  '用语专业化：正文使用专业书面语，避免口语化、随意化表述，关注指标部分用「重点跟踪」「先行指标」「核心观察对象」等规范措辞',
];

function buildSharedGuideSection(): string {
  const lines: string[] = [];
  lines.push('## 全局输出引导（共享后缀，最高优先级，所有专家一致）');
  SHARED_GUIDE_RULES.forEach(rule => {
    lines.push(`- ${rule}`);
  });
  lines.push('');
  lines.push('### 城市月度市场分析解读 · 五维细则（仅该话题适用，自上而下，不使用小标题）');
  lines.push('- 首行·结论句＝形势判断：总结式、定性的阶段判断，一句话，不用项目符号，直接开篇');
  lines.push('- 随后·指标解读＝项目符号带出：从【供应、成交、库存、房价、租金】中随机选取2-3项，每项一条（•），每条一句话左右做变化分析；数字引用硬约束：全文数字引用总数不超过5个（月份序数如「6月」不计入，含同环比引用），其余用趋势性语言描述');
  lines.push('- 结论段·趋势预测＝结论式陈述（不用项目符号）：先就选取指标项给出规律或趋势发现（落脚到成交量与价格方向），再单独一句话判断长期筑底可能及信心程度（确认/偏乐观/存疑），直接以「证据尚不足以确认」「判断宜偏谨慎」「偏乐观但需满足前提」等自然书面语表达预期/信心程度；并在定性研判中轻带一句：市场是否已稳住、预计何时稳住、稳住需要什么条件——点到为止，不展开，不单独成段');
  lines.push('- 结论段·不确定性＝结论式陈述（不用项目符号）：直接陈述1-2条可能导致市场变化不符合预期的因素，不使用「风险」「不确定性」等标签字眼');
  lines.push('- 末尾·关注指标：直接陈述当期未重点展开、值得关注的指标及关注理由，置于文末，不加「延展」等标签前缀');
  return lines.join('\n');
}

/**
 * 组装完整的 system prompt
 * 包含: 身份 + 决策DNA + 方法论 + EMM规则 + 知识上下文 + 输入分析 + 任务 + 输出格式 + 反模式 + 签名
 *
 * @param options.activeHeuristics 被 heuristicsMatcher 激活的高优先级启发式
 *        非空时插入"本次任务必须应用"区块，并从常规 heuristics 列表中去重
 */
export function buildSystemPrompt(
  expert: ExpertProfile,
  options?: {
    taskType?: string;
    inputAnalysis?: InputAnalysis;
    knowledgeContext?: string;
    params?: ExpertRequestParams;
    activeHeuristics?: DecisionHeuristic[];
  }
): string {
  const sections: string[] = [];

  // 0. 全局输出引导（v30 共享后缀）
  sections.push(buildSharedGuideSection());

  // 1. Identity — 人格层（接收 activeHeuristics 用于去重）
  sections.push(
    buildPersonaSection(expert.name, expert.persona, expert.domain, options?.activeHeuristics),
  );

  // 1b. Active Heuristics — 本次任务必须应用的启发式（最高优先级）
  if (options?.activeHeuristics && options.activeHeuristics.length > 0) {
    sections.push(buildActiveHeuristicsSection(options.activeHeuristics));
  }

  // 2. Decision DNA — 决策基因（个性化增强）
  sections.push(buildDecisionDNASection(expert));

  // 3. Method — 方法层
  sections.push(buildMethodSection(expert.method));

  // 4. EMM Rules — 门控规则
  if (expert.emm) {
    sections.push(buildEMMSection(expert.emm));
  }

  // 5. Knowledge Context — 知识源
  if (options?.knowledgeContext) {
    sections.push(buildKnowledgeSection(options.knowledgeContext));
  }

  // 6. Input Analysis — 输入增强结果
  if (options?.inputAnalysis) {
    sections.push(buildInputAnalysisSection(options.inputAnalysis));
  }

  // 7. Task — 任务指令（按任务类型个性化）
  if (options?.taskType || options?.params) {
    sections.push(buildTaskSection(options.taskType, options.params));
    sections.push(buildTaskPersonalization(expert, options?.taskType));
  }

  // 8. Output Schema — 输出格式
  sections.push(buildOutputSection(expert.output_schema, options?.params?.output_format));

  // 9. Anti-patterns — 禁止项
  if (expert.anti_patterns.length > 0) {
    sections.push(buildAntiPatternsSection(expert.anti_patterns));
  }

  // 10. Signature — 标志性表达
  if (expert.signature_phrases.length > 0) {
    sections.push(buildSignatureSection(expert.signature_phrases));
  }

  // 11. Constraints
  sections.push(buildConstraintsSection(expert.constraints));

  return sections.filter(Boolean).join('\n\n');
}

// ----- Section Builders -----

function buildPersonaSection(
  name: string,
  persona: ExpertPersona,
  domains: string[],
  activeHeuristics?: DecisionHeuristic[],
): string {
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
    // 结构化心智模型优先于单字符串
    if (c.mentalModels && c.mentalModels.length > 0) {
      lines.push('### 心智模型清单');
      c.mentalModels.forEach((m, i) => {
        lines.push(`${i + 1}. **${m.name}**：${m.summary}`);
        lines.push(`   适用：${m.applicationContext}`);
        lines.push(`   失效：${m.failureCondition}`);
      });
    } else {
      lines.push(`思维模型：${c.mentalModel}`);
    }
    lines.push(`决策风格：${c.decisionStyle}`);
    lines.push(`风险态度：${c.riskAttitude}`);
    lines.push(`时间视野：${c.timeHorizon}`);
    // 决策启发式（若有 activeHeuristics，此处仅展示未被激活的作为背景参考）
    if (c.heuristics && c.heuristics.length > 0) {
      const activeTriggers = new Set((activeHeuristics ?? []).map(h => h.trigger));
      const backgroundHeuristics = c.heuristics.filter(h => !activeTriggers.has(h.trigger));
      if (backgroundHeuristics.length > 0) {
        lines.push('');
        lines.push(activeHeuristics && activeHeuristics.length > 0 ? '### 决策启发式（背景参考）' : '### 决策启发式');
        backgroundHeuristics.forEach(h => {
          lines.push(`- 当${h.trigger}：${h.rule}${h.example ? `（如：${h.example}）` : ''}`);
        });
      }
    }
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

  // 表达 DNA（比 style/tone 更精细的语言特征）
  if (persona.expressionDNA) {
    const e = persona.expressionDNA;
    lines.push('');
    lines.push('### 表达 DNA');
    lines.push(`句式偏好：${e.sentencePattern}`);
    lines.push(`用词偏好：${e.vocabularyPreference}`);
    lines.push(`确定性表达：${e.certaintyCali}`);
    lines.push(`引用习惯：${e.citationHabit}`);
  }

  // 深度人格 — 盲区自知
  if (persona.blindSpots) {
    const b = persona.blindSpots;
    lines.push('');
    lines.push(`你的已知偏见：${b.knownBias.join('；')}`);
    lines.push(`你的薄弱领域：${b.weakDomains.join('；')}`);
    lines.push(`自我认知：${b.selfAwareness}`);
    if (b.informationCutoff) {
      lines.push(`信息边界：${b.informationCutoff}`);
    }
    if (b.confidenceThreshold) {
      lines.push(`不确定性标注标准：${b.confidenceThreshold}`);
    }
    if (b.explicitLimitations && b.explicitLimitations.length > 0) {
      lines.push(`能力边界：${b.explicitLimitations.join('；')}`);
    }
  }

  // 已知矛盾（让 LLM 知道何时该展现矛盾而非一致）
  if (persona.contradictions && persona.contradictions.length > 0) {
    lines.push('');
    lines.push('### 你的已知矛盾（真实存在，不要回避）');
    persona.contradictions.forEach(c => {
      lines.push(`- ${c.tension}`);
      lines.push(`  场景：${c.context}`);
      lines.push(`  调和：${c.resolution}`);
    });
  }

  return lines.join('\n');
}

/**
 * 构造高优先级启发式 section（Phase 3）
 * 被 heuristicsMatcher 激活的 heuristics 会放在这个最显著的位置，
 * 告诉 LLM：这几条是本次任务必须严格应用的规则，其他 heuristics 仅作背景参考。
 */
function buildActiveHeuristicsSection(activeHeuristics: DecisionHeuristic[]): string {
  const lines: string[] = [];
  lines.push('## 🎯 本次任务必须严格应用的决策启发式');
  lines.push('系统已根据输入内容匹配出以下与本任务最相关的启发式，请在推理和结论中显式应用：');
  activeHeuristics.forEach((h, i) => {
    lines.push('');
    lines.push(`**${i + 1}. 触发：${h.trigger}**`);
    lines.push(`   规则：${h.rule}`);
    if (h.example) {
      lines.push(`   案例：${h.example}`);
    }
  });
  lines.push('');
  lines.push('请在输出中明确体现这些启发式的应用——至少一条。');
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

  // Agentic 协议 — 先研究再回答
  if (method.agenticProtocol) {
    const ap = method.agenticProtocol;
    lines.push('');
    if (ap.requiresResearch && ap.researchSteps && ap.researchSteps.length > 0) {
      lines.push('### 调研协议（回答前必须执行）');
      ap.researchSteps.forEach((step, i) => {
        lines.push(`  ${i + 1}. ${step}`);
      });
    }
    if (ap.noGuessPolicy) {
      lines.push('【重要】对于需要事实支撑的问题，你必须先承认信息边界，再给出基于已知信息的分析。不要虚构数据或假装知道你不知道的事情。');
    }
  }

  return lines.join('\n');
}

function buildEMMSection(emm: ExpertEMM): string {
  const lines: string[] = [];
  const factorNames = emm.critical_factors.map(item =>
    typeof item === "string" ? item : item.factor,
  ).filter(Boolean);

  lines.push(`## 判断规则（必须严格遵守）`);
  lines.push(`核心决策变量：${factorNames.join('、')}`);

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

/**
 * 决策基因 — 将专家的核心思维模式、价值判断、品味标准提炼为简洁的决策指引
 * 这一段让专家的观点具有辨识度，而不是通用的"专家风格"
 */
function buildDecisionDNASection(expert: ExpertProfile): string {
  const lines: string[] = [];
  const { persona } = expert;

  lines.push(`## 你的决策基因`);

  // 核心思维模型 — 决策的第一推动力
  if (persona.cognition?.mentalModel) {
    lines.push(`你看问题的方式：${persona.cognition.mentalModel}`);
  }

  // 质量标杆 — 输出的评判标准
  if (persona.values?.qualityBar) {
    lines.push(`你的及格线：${persona.values.qualityBar}`);
  }

  // 审美品位 — 决定你会赞赏什么、批评什么
  if (persona.taste?.benchmark) {
    lines.push(`你心中的标杆：${persona.taste.benchmark}`);
  }

  // 一票否决 — 这些出现就必须指出
  if (persona.values?.dealbreakers && persona.values.dealbreakers.length > 0) {
    lines.push(`你绝对无法容忍：${persona.values.dealbreakers.join('；')}`);
  }

  // 时间视野 — 影响分析的深度和远见
  if (persona.cognition?.timeHorizon) {
    lines.push(`你的时间视野：${persona.cognition.timeHorizon}`);
  }

  // 如果没有深度人格数据，不输出空段落
  if (lines.length <= 1) return '';
  return lines.join('\n');
}

/**
 * 任务个性化 — 根据任务类型注入专家特有的分析偏好
 */
function buildTaskPersonalization(expert: ExpertProfile, taskType?: string): string {
  const { persona, method } = expert;
  const lines: string[] = [];

  if (taskType === 'analysis') {
    // 分析任务 — 强调决策风格和风险态度
    if (persona.cognition?.decisionStyle) {
      lines.push(`分析时请体现你的决策风格：${persona.cognition.decisionStyle}`);
    }
    if (persona.cognition?.riskAttitude) {
      lines.push(`你的风险态度：${persona.cognition.riskAttitude}`);
    }
    // Phase 5: 要求 LLM 按心智模型产出结构化骨架
    const mentalModels = persona.cognition?.mentalModels;
    if (mentalModels && mentalModels.length > 0) {
      lines.push('');
      lines.push('### 结构化输出要求（心智模型骨架）');
      lines.push('你必须从以下心智模型中挑选 2-3 个最适用的，分别应用于本主题：');
      mentalModels.slice(0, 5).forEach((m, i) => {
        lines.push(`${i + 1}. **${m.name}** — ${m.summary}`);
      });
      lines.push('');
      lines.push('完成文字分析之后，**额外输出一段 ```json ... ``` 代码块**，格式：');
      lines.push('```json');
      lines.push('{');
      lines.push('  "model_applications": [');
      lines.push('    { "modelName": "<所选模型名>", "application": "<具体如何应用到本主题的推理过程>", "conclusion": "<由该模型得出的子结论>" }');
      lines.push('  ]');
      lines.push('}');
      lines.push('```');
      lines.push('每个 modelName 必须严格从上述清单中选择，不得生造。');
    }
  } else if (taskType === 'evaluation') {
    // 评估任务 — 强调评审镜头和杀手锏
    if (method.reviewLens?.firstGlance) {
      lines.push(`你第一眼会看：${method.reviewLens.firstGlance}`);
    }
    if (method.reviewLens?.killShot) {
      lines.push(`你的一票否决标准：${method.reviewLens.killShot}`);
    }
  } else if (taskType === 'generation') {
    // 生成任务 — 强调让人眼前一亮的点和鄙视的套路
    if (persona.values?.excites && persona.values.excites.length > 0) {
      lines.push(`你追求的效果：${persona.values.excites.join('；')}`);
    }
    if (persona.taste?.disdains && persona.taste.disdains.length > 0) {
      lines.push(`绝不要写成：${persona.taste.disdains.join('；')}`);
    }
  }

  if (lines.length === 0) return '';
  return `## 本次任务个性化指引\n${lines.join('\n')}`;
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
