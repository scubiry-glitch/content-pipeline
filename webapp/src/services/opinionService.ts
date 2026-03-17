// 观点生成服务 - Opinion Service
// v5.1.2: 观点生成个性化 - 基于专家特性的差异化观点生成

import type { Expert, ExpertOpinion } from '../types';

// 个性化观点配置
export interface PersonalizedOpinionConfig {
  // 成功实践关联
  achievementReferences: {
    enabled: boolean;
    maxReferences: number;
    recencyWeight: number; // 近期案例权重更高
  };

  // 思想体系一致性
  philosophyAlignment: {
    enabled: boolean;
    corePrinciples: string[]; // 核心原则引用
    quoteProbability: number; // 引用名言概率
  };

  // 差异化表达
  differentiation: {
    enabled: boolean;
    angle: 'challenger' | 'expander' | 'synthesizer';
    contrarianThreshold: number; // 反向观点阈值
  };

  // 表达风格
  expressionStyle: {
    tone: 'formal' | 'conversational' | 'provocative';
    length: 'concise' | 'detailed' | 'comprehensive';
    useMetaphors: boolean;
  };
}

// 观点生成上下文
export interface OpinionContext {
  topic: string;
  content?: string;
  industry?: string;
  taskType?: string;
  importance?: number;
}

// 默认配置
const defaultConfig: PersonalizedOpinionConfig = {
  achievementReferences: {
    enabled: true,
    maxReferences: 2,
    recencyWeight: 0.7,
  },
  philosophyAlignment: {
    enabled: true,
    corePrinciples: [],
    quoteProbability: 0.5,
  },
  differentiation: {
    enabled: true,
    angle: 'synthesizer',
    contrarianThreshold: 0.3,
  },
  expressionStyle: {
    tone: 'conversational',
    length: 'detailed',
    useMetaphors: true,
  },
};

// 专家开场白模板
const openingTemplates: Record<string, string[]> = {
  'S-01': [
    // 张一鸣
    '正如我常说的，延迟满足感让人关注长期价值。',
    '从第一性原理出发，我们需要看到事物的本质。',
    '信息分发效率的提升是这个时代最大的机会。',
  ],
  'S-02': [
    // 王兴
    '大多数人为了逃避真正的思考愿意做任何事情。',
    '竞争的核心是效率的提升。',
    '用终局思维来倒推当下的决策。',
  ],
  'S-03': [
    // 马斯克
    '从物理学的第一性原理来看这个问题。',
    '我们要做的是让不可能变成可能。',
    '如果一件事情在物理上是可行的，那就一定可以实现。',
  ],
  'S-04': [
    // 巴菲特
    '在别人贪婪时恐惧，在别人恐惧时贪婪。',
    '投资的关键是找到有护城河的企业。',
    '能力圈很重要，只投自己能懂的东西。',
  ],
  'S-05': [
    // 孙正义
    '我有一个300年的愿景。',
    'All in on AI，这是人类历史上最大的革命。',
    '要么做大，要么不做。',
  ],
  'S-06': [
    // 任正非
    '华为的冬天随时可能到来。',
    '活下去是最高纲领。',
    '我们要向死而生，在危机中寻找机会。',
  ],
  'S-07': [
    // 纳德拉
    '我们要培养成长型思维。',
    '同理心是最核心的领导力。',
    '移动为先，云为先。',
  ],
  'S-08': [
    // 贝索斯
    '我们要永远保持第一天的心态。',
    '长期主义是亚马逊的核心。',
    '把资源投入到不变的事物上。',
  ],
  'S-09': [
    // 乔布斯
    '简单比复杂更难。',
    '用户不知道自己想要什么，直到你展示给他们。',
    'Stay hungry, stay foolish.',
  ],
  'S-10': [
    // 黄铮
    '消费升级不是品牌升级，是性价比升级。',
    '普惠是商业的本质。',
    '把复杂留给自己，把简单留给用户。',
  ],
};

// 专家分析框架模板
const frameworkTemplates: Record<
  string,
  { name: string; template: string }[]
> = {
  'S-01': [
    { name: '信息分发效率', template: '从信息分发效率角度看，{topic}的核心是...' },
    { name: '长期主义', template: '用长期主义的视角分析{topic}...' },
  ],
  'S-02': [
    { name: '终局思维', template: '从终局思维倒推，{topic}最终会...' },
    { name: '效率竞争', template: '竞争的本质是效率，{topic}的关键在于...' },
  ],
  'S-03': [
    { name: '第一性原理', template: '从第一性原理看{topic}...' },
    { name: '物理可行性', template: '从物理可行性分析{topic}...' },
  ],
  'S-04': [
    { name: '护城河', template: '分析{topic}需要关注护城河...' },
    { name: '价值投资', template: '从价值投资角度，{topic}...' },
  ],
};

// 专家结尾模板
const closingTemplates: Record<string, string[]> = {
  'S-01': ['保持耐心，延迟满足。', '相信时间的复利效应。', '做时间的朋友。'],
  'S-02': ['深度思考比广度更重要。', '真正的思考是无法替代的。', '效率决定成败。'],
  'S-03': ['让我们把不可能变成可能。', '物理定律是我们唯一的限制。', '未来已来，只是分布不均。'],
  'S-04': ['安全边际永远重要。', '投资是一场耐心的游戏。', '永远不要亏钱。'],
  'S-05': ['All in，没有退路。', '这是属于我们的时代。', '要么做大，要么回家。'],
  'S-06': ['活下去，才有未来。', '冬天是检验成色的时刻。', '危机中总有转机。'],
  'S-07': ['成长是永恒的主题。', '同理心驱动创新。', '每一天都是新的开始。'],
  'S-08': ['永远保持第一天。', '长期主义终将胜出。', '客户至上，永不改变。'],
  'S-09': ['简单是终极的复杂。', '追求极致的体验。', '不同凡想。'],
  'S-10': ['普惠才是正道。', '让用户得到真正的实惠。', '效率就是生命。'],
};

// 差异化角度模板
const angleTemplates: Record<string, Record<string, string>> = {
  challenger: {
    prefix: '但需要警惕的是，',
    pattern: '这里有个被忽视的风险...',
    suffix: '这可能会改变整个判断。',
  },
  expander: {
    prefix: '更值得关注的是，',
    pattern: '延伸机会可能更大...',
    suffix: '这打开了新的可能性。',
  },
  synthesizer: {
    prefix: '综合来看，',
    pattern: '各方观点的核心共识是...',
    suffix: '这是最关键的洞察。',
  },
};

/**
 * 生成个性化观点
 * @param expert 专家对象
 * @param context 观点生成上下文
 * @param config 个性化配置
 * @returns 个性化观点
 */
export function generatePersonalizedOpinion(
  expert: Expert,
  context: OpinionContext,
  config: Partial<PersonalizedOpinionConfig> = {}
): ExpertOpinion {
  const mergedConfig = { ...defaultConfig, ...config };
  const { topic, content, importance = 0.5 } = context;

  // 1. 生成开场白
  const opening = generateOpening(expert, mergedConfig);

  // 2. 使用专家框架分析
  const framework = generateFrameworkAnalysis(expert, topic, mergedConfig);

  // 3. 关联成功案例
  const achievementRef = generateAchievementReference(expert, topic, mergedConfig);

  // 4. 生成核心观点（差异化角度）
  const coreOpinion = generateCoreOpinion(expert, topic, context, mergedConfig);

  // 5. 生成结尾
  const closing = generateClosing(expert, mergedConfig);

  // 6. 组装完整观点
  const opinionText = assembleOpinion({
    opening,
    framework,
    achievementRef,
    coreOpinion,
    closing,
    config: mergedConfig,
  });

  // 7. 计算置信度和强度
  const confidence = calculateConfidence(expert, topic, importance);
  const intensity = calculateIntensity(expert, importance);

  return {
    id: `opinion-${expert.id}-${Date.now()}`,
    expertId: expert.id,
    expertName: expert.name,
    content: opinionText,
    timestamp: new Date().toISOString(),
    confidence,
    intensity,
    dimensions: selectRelevantDimensions(expert, topic),
    relatedAchievements: achievementRef
      ? [expert.achievements?.[0]?.title].filter(Boolean)
      : undefined,
    // v5.1.2 新增字段
    personalization: {
      angle: mergedConfig.differentiation.angle,
      philosophyAlignment: mergedConfig.philosophyAlignment.enabled,
      achievementReferences: mergedConfig.achievementReferences.enabled,
      tone: mergedConfig.expressionStyle.tone,
    },
  };
}

/**
 * 生成开场白
 */
function generateOpening(expert: Expert, config: PersonalizedOpinionConfig): string {
  if (!config.philosophyAlignment.enabled) {
    return `关于这个话题，${expert.name}认为：`;
  }

  const templates = openingTemplates[expert.id];
  if (templates && templates.length > 0) {
    // 随机选择一条（或使用核心思想匹配）
    const index = Math.floor(Math.random() * templates.length);
    return templates[index];
  }

  // 使用核心思想
  if (expert.philosophy.core.length > 0) {
    const principle = expert.philosophy.core[0];
    return `正如我常提到的${principle.slice(0, 15)}...`;
  }

  return `关于这个话题，${expert.name}有以下观点：`;
}

/**
 * 生成框架分析
 */
function generateFrameworkAnalysis(
  expert: Expert,
  topic: string,
  config: PersonalizedOpinionConfig
): string {
  const frameworks = frameworkTemplates[expert.id];
  if (!frameworks || frameworks.length === 0) {
    return `从${expert.domainName}角度分析，${topic}的核心问题在于...`;
  }

  const framework = frameworks[0];
  return framework.template.replace('{topic}', topic);
}

/**
 * 生成成功案例关联
 */
function generateAchievementReference(
  expert: Expert,
  topic: string,
  config: PersonalizedOpinionConfig
): string | null {
  if (!config.achievementReferences.enabled || !expert.achievements?.length) {
    return null;
  }

  // 选择最相关的成功案例（简化：选第一个）
  const achievement = expert.achievements[0];
  return `这与我在${achievement.title}中的观察一致。当时的关键判断是...`;
}

/**
 * 生成核心观点（差异化角度）
 */
function generateCoreOpinion(
  expert: Expert,
  topic: string,
  context: OpinionContext,
  config: PersonalizedOpinionConfig
): string {
  const angle = expert.angle || config.differentiation.angle;
  const template = angleTemplates[angle];

  let opinion = '';

  // 根据角度生成差异化观点
  switch (angle) {
    case 'challenger':
      opinion = `${template.prefix}${template.pattern}\n\n${generateContrarianView(expert, topic)}`;
      break;
    case 'expander':
      opinion = `${template.prefix}${template.pattern}\n\n${generateExpansionView(expert, topic)}`;
      break;
    case 'synthesizer':
    default:
      opinion = `${template.prefix}${template.pattern}\n\n${generateSynthesizedView(expert, topic)}`;
  }

  return opinion;
}

/**
 * 生成反向观点（挑战者角度）
 */
function generateContrarianView(expert: Expert, topic: string): string {
  const contrarianViews: Record<string, string[]> = {
    'S-01': ['当前市场过于乐观，忽视了长期风险。', '大家都在追逐短期热点，但真正的价值需要时间沉淀。'],
    'S-02': ['大多数人的共识往往是错误的。', '看似繁荣的背后，隐藏着结构性危机。'],
    'S-03': ['现有技术路径可能完全错误。', '我们需要重新思考基本假设。'],
    'S-04': ['估值已经脱离了基本面。', '安全边际几乎不存在。'],
    default: ['主流观点可能过于乐观。', '需要警惕潜在风险。'],
  };

  const views = contrarianViews[expert.id] || contrarianViews.default;
  return views[Math.floor(Math.random() * views.length)];
}

/**
 * 生成延伸观点（拓展者角度）
 */
function generateExpansionView(expert: Expert, topic: string): string {
  const expansionViews: Record<string, string[]> = {
    'S-01': ['更大的机会在于信息效率的全面提升。', '这只是一个起点，真正的变革还在后面。'],
    'S-02': ['如果能延伸到这个领域，价值会放大10倍。', '不应该局限在当前框架，要看到更广阔的可能性。'],
    'S-03': ['技术突破可能带来指数级变化。', '垂直整合可能是更好的路径。'],
    'S-05': ['这只是AI革命的第一波。', '真正的爆发期还未到来。'],
    default: ['延伸机会可能比表面更大。', '值得探索相关领域。'],
  };

  const views = expansionViews[expert.id] || expansionViews.default;
  return views[Math.floor(Math.random() * views.length)];
}

/**
 * 生成综合观点（整合者角度）
 */
function generateSynthesizedView(expert: Expert, topic: string): string {
  const synthesizedViews: Record<string, string[]> = {
    'S-01': ['综合各方观点，核心在于长期价值的创造。', '关键是在变化中找到不变的东西。'],
    'S-02': ['本质上是效率提升的问题。', '终局来看，只有效率最高的能活下来。'],
    'S-04': ['护城河和估值是核心。', '长期持有优质资产是关键。'],
    'S-06': ['活下去是第一要务。', '聚焦主航道，打深打透。'],
    default: ['综合来看，核心在于执行和专注。', '关键是找到差异化优势。'],
  };

  const views = synthesizedViews[expert.id] || synthesizedViews.default;
  return views[Math.floor(Math.random() * views.length)];
}

/**
 * 生成结尾
 */
function generateClosing(expert: Expert, config: PersonalizedOpinionConfig): string {
  const templates = closingTemplates[expert.id];
  if (templates && templates.length > 0) {
    const index = Math.floor(Math.random() * templates.length);
    return templates[index];
  }

  // 使用名言
  if (config.philosophyAlignment.enabled && expert.philosophy.quotes.length > 0) {
    return expert.philosophy.quotes[0];
  }

  return '';
}

/**
 * 组装完整观点
 */
function assembleOpinion(parts: {
  opening: string;
  framework: string;
  achievementRef: string | null;
  coreOpinion: string;
  closing: string;
  config: PersonalizedOpinionConfig;
}): string {
  const { opening, framework, achievementRef, coreOpinion, closing, config } = parts;
  const { length, tone } = config.expressionStyle;

  let sections: string[] = [];

  // 开场
  sections.push(opening);

  // 分析框架
  if (length !== 'concise') {
    sections.push(framework);
  }

  // 案例关联
  if (achievementRef && length !== 'concise') {
    sections.push(achievementRef);
  }

  // 核心观点
  sections.push(coreOpinion);

  // 结尾
  if (closing && length !== 'concise') {
    sections.push(closing);
  }

  let opinion = sections.join('\n\n');

  // 根据语气调整
  if (tone === 'formal') {
    opinion = opinion.replace(/我/g, '本人').replace(/你/g, '贵方');
  } else if (tone === 'provocative') {
    opinion = opinion.replace(/可能/g, '必然').replace(/也许/g, '绝对');
  }

  return opinion;
}

/**
 * 计算置信度
 */
function calculateConfidence(expert: Expert, topic: string, importance: number): number {
  // 基础置信度
  let confidence = expert.acceptanceRate || 0.5;

  // 根据专家级别调整
  if (expert.level === 'senior') {
    confidence = Math.min(confidence + 0.1, 1);
  }

  // 根据重要性调整
  if (importance > 0.8) {
    confidence = Math.min(confidence + 0.05, 1);
  }

  return confidence;
}

/**
 * 计算观点强度
 */
function calculateIntensity(expert: Expert, importance: number): 'strong' | 'moderate' | 'weak' {
  const acceptanceRate = expert.acceptanceRate || 0.5;
  const score = acceptanceRate * 0.6 + importance * 0.4;

  if (score > 0.7) return 'strong';
  if (score > 0.4) return 'moderate';
  return 'weak';
}

/**
 * 选择相关评审维度
 */
function selectRelevantDimensions(expert: Expert, topic: string): string[] {
  // 简化：返回前3个维度
  return expert.reviewDimensions.slice(0, 3);
}

/**
 * 批量生成观点（多位专家）
 */
export function generateMultiExpertOpinions(
  experts: Expert[],
  context: OpinionContext,
  config?: Partial<PersonalizedOpinionConfig>
): ExpertOpinion[] {
  return experts.map((expert) => generatePersonalizedOpinion(expert, context, config));
}

/**
 * 生成观点对比（用于协作模式）
 */
export function generateOpinionComparison(
  opinions: ExpertOpinion[]
): {
  consensus: string[];
  divergences: Array<{ dimension: string; opinions: string[] }>;
  summary: string;
} {
  // 提取观点关键词
  const keywords = opinions.map((o) => extractKeywords(o.content));

  // 寻找共识
  const consensus = findCommonElements(keywords);

  // 寻找分歧
  const divergences = findDifferences(keywords);

  // 生成总结
  const summary = `共${opinions.length}位专家参与评审，${
    consensus.length > 0 ? `在${consensus.join('、')}等方面达成共识` : '暂无明确共识'
  }。`;

  return {
    consensus,
    divergences: divergences.map((d) => ({
      dimension: d,
      opinions: opinions.map((o) => o.expertName + ': ' + o.content.slice(0, 50) + '...'),
    })),
    summary,
  };
}

/**
 * 提取关键词（简化版）
 */
function extractKeywords(text: string): string[] {
  // 简单分词和提取
  const words = text.split(/[\s,，。！？；：""''（）【】]+/);
  return words.filter((w) => w.length >= 4).slice(0, 5);
}

/**
 * 寻找共同元素
 */
function findCommonElements(arrays: string[][]): string[] {
  if (arrays.length === 0) return [];

  const first = arrays[0];
  return first.filter((item) => arrays.every((arr) => arr.includes(item)));
}

/**
 * 寻找差异
 */
function findDifferences(arrays: string[][]): string[] {
  const all = new Set(arrays.flat());
  const common = new Set(findCommonElements(arrays));
  return Array.from(all).filter((item) => !common.has(item)).slice(0, 3);
}
