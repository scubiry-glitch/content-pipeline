// 专家库服务 - Expert Service
import type {
  Expert,
  ExpertReview,
  ExpertAssignment,
  ExpertMatchRequest,
} from '../types';
import {
  initExpertEmbeddings,
  semanticMatchExperts,
  updateExpertEmbedding,
  getMatchingExplanation,
} from './semanticMatchingService';

// 专家数据存储 (实际应从API获取)
let expertsCache: Expert[] = [];

// 初始化专家数据
export function initExperts(experts: Expert[]) {
  expertsCache = experts;
  // v5.1.1: 初始化语义向量嵌入
  initExpertEmbeddings(experts);
}

// 获取所有专家
export function getAllExperts(): Expert[] {
  return expertsCache.filter((e) => e.status === 'active');
}

// 根据ID获取专家
export function getExpertById(id: string): Expert | undefined {
  return expertsCache.find((e) => e.id === id);
}

// 根据领域获取专家
export function getExpertsByDomain(domainCode: string): Expert[] {
  return expertsCache.filter(
    (e) => e.domainCode === domainCode && e.status === 'active'
  );
}

// 获取特级专家
export function getSeniorExperts(): Expert[] {
  return expertsCache.filter((e) => e.level === 'senior' && e.status === 'active');
}

// 智能匹配专家（支持负载均衡和语义匹配）
export function matchExperts(
  request: ExpertMatchRequest,
  options?: { taskId?: string; useLoadBalancing?: boolean; useSemanticMatch?: boolean }
): ExpertAssignment {
  const { useSemanticMatch = true } = options || {};

  // v5.1.1: 优先使用语义向量匹配
  if (useSemanticMatch) {
    try {
      const semanticResult = semanticMatchExperts(request, { topK: 3 }, expertsCache);
      // 将语义匹配结果转换为完整ExpertAssignment
      return enrichSemanticResult(semanticResult, request, options);
    } catch (error) {
      console.warn('语义匹配失败，回退到关键词匹配:', error);
    }
  }

  // 回退到原有匹配逻辑
  const { topic, industry, importance = 0.5 } = request;
  const { taskId, useLoadBalancing = true } = options || {};

  // 1. 解析领域
  const domainCode = extractDomainFromTopic(topic, industry);

  // 2. 匹配领域专家 (2-3位)
  let domainExperts: Expert[];

  if (useLoadBalancing && taskId) {
    // 使用负载均衡分配
    domainExperts = assignExpertsWithLoadBalancing(domainCode, taskId, 3);
  } else {
    // 传统方式：按采纳率排序
    domainExperts = expertsCache
      .filter((e) => e.domainCode === domainCode && e.level === 'domain')
      .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
      .slice(0, 3);
  }

  // 3. 获取通用专家
  const universalExperts = {
    factChecker: getUniversalExpert('fact_checker'),
    logicChecker: getUniversalExpert('logic_checker'),
    readerRep: getUniversalExpert('reader_rep'),
  };

  // 4. 判断是否匹配特级专家 (重要性>0.8)
  let seniorExpert: Expert | undefined;
  let matchReasons: string[] = [];

  if (importance > 0.8) {
    if (useLoadBalancing && taskId) {
      // 负载均衡：选择最空闲的特级专家
      const seniorPool = expertsCache.filter(
        (e) => e.level === 'senior' && e.status === 'active'
      );
      const availableSeniors = seniorPool.filter((e) => {
        const workload = getExpertWorkload(e.id);
        return workload.availability !== 'unavailable';
      });

      if (availableSeniors.length > 0) {
        // 选择负载最轻的特级专家
        seniorExpert = availableSeniors.sort((a, b) => {
          const workloadA = getExpertWorkload(a.id).pendingReviews;
          const workloadB = getExpertWorkload(b.id).pendingReviews;
          return workloadA - workloadB;
        })[0];

        // 更新工作量
        if (seniorExpert) {
          workloadStore[seniorExpert.id].pendingReviews += 1;
          workloadStore[seniorExpert.id].assignedTasks.push(taskId);
        }
      }
    } else {
      seniorExpert = findBestSeniorExpert(domainCode, topic);
    }

    if (seniorExpert) {
      matchReasons.push(`任务重要性${(importance * 100).toFixed(0)}%，启用特级专家`);
    }
  }

  matchReasons.push(`主题"${topic}"匹配${domainExperts[0]?.domainName || '通用'}领域`);
  matchReasons.push(`分配${domainExperts.length}位领域专家进行深度评审`);

  return {
    domainExperts,
    universalExperts,
    seniorExpert,
    matchReasons,
  };
}

// v5.1.1: 将语义匹配结果转换为完整ExpertAssignment
function enrichSemanticResult(
  semanticResult: ExpertAssignment,
  request: ExpertMatchRequest,
  options?: { taskId?: string; useLoadBalancing?: boolean }
): ExpertAssignment {
  const { importance = 0.5 } = request;
  const { taskId, useLoadBalancing = true } = options || {};

  // 获取语义匹配的专家对象
  const matchedDomainExperts: Expert[] = [];
  semanticResult.experts?.forEach((assignment) => {
    const expert = expertsCache.find((e) => e.id === assignment.expertId);
    if (expert) {
      matchedDomainExperts.push(expert);
    }
  });

  // 获取通用专家
  const universalExperts = {
    factChecker: getUniversalExpert('fact_checker'),
    logicChecker: getUniversalExpert('logic_checker'),
    readerRep: getUniversalExpert('reader_rep'),
  };

  // 判断是否需要特级专家
  let seniorExpert: Expert | undefined;
  const matchReasons: string[] = [];

  if (importance > 0.8) {
    if (useLoadBalancing && taskId) {
      const seniorPool = expertsCache.filter(
        (e) => e.level === 'senior' && e.status === 'active'
      );
      const availableSeniors = seniorPool.filter((e) => {
        const workload = getExpertWorkload(e.id);
        return workload.availability !== 'unavailable';
      });

      if (availableSeniors.length > 0) {
        seniorExpert = availableSeniors.sort((a, b) => {
          const workloadA = getExpertWorkload(a.id).pendingReviews;
          const workloadB = getExpertWorkload(b.id).pendingReviews;
          return workloadA - workloadB;
        })[0];

        if (seniorExpert && taskId) {
          workloadStore[seniorExpert.id].pendingReviews += 1;
          workloadStore[seniorExpert.id].assignedTasks.push(taskId);
        }
      }
    } else {
      seniorExpert = findBestSeniorExpert(
        matchedDomainExperts[0]?.domainCode || 'E01',
        request.topic
      );
    }

    if (seniorExpert) {
      matchReasons.push(`任务重要性${(importance * 100).toFixed(0)}%，启用特级专家`);
    }
  }

  // 添加语义匹配说明
  if (semanticResult.confidence && semanticResult.confidence > 0) {
    matchReasons.push(`语义匹配置信度 ${(semanticResult.confidence * 100).toFixed(1)}%`);
  }
  matchReasons.push(`基于384维向量语义分析匹配${matchedDomainExperts.length}位专家`);

  return {
    domainExperts: matchedDomainExperts,
    universalExperts,
    seniorExpert,
    matchReasons,
    // v5.1.1 新增字段
    confidence: semanticResult.confidence,
    matchingMethod: 'semantic',
    domainScores: semanticResult.domainScores,
  };
}

// 从主题提取领域
function extractDomainFromTopic(topic: string, industry?: string): string {
  const domainKeywords: Record<string, string[]> = {
    E01: ['宏观', '经济', 'GDP', '通胀', '利率', '政策'],
    E02: ['金融', '科技', '支付', '银行', '保险', '区块链'],
    E03: ['新能源', '光伏', '电池', '储能', '电动车', '氢能'],
    E04: ['医疗', '医药', '器械', '健康', '临床', '医保'],
    E05: ['消费', '零售', '品牌', '电商', '新零售'],
    E06: ['芯片', '半导体', '集成电路', '晶圆', '光刻'],
    E07: ['人工智能', 'AI', '大模型', '算法', '机器学习'],
    E08: ['房地产', '地产', '住宅', '商业', '物业'],
    E09: ['文化', '传媒', '内容', '娱乐', '影视'],
    E10: ['制造', '工业', '自动化', '工艺', '质量'],
    E11: ['ESG', '可持续', '碳中和', '绿色', '环保'],
    E12: ['出海', '跨境', '国际化', '海外', '全球化'],
  };

  // 先检查industry
  if (industry) {
    for (const [code, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((k) => industry.includes(k))) {
        return code;
      }
    }
  }

  // 再检查topic
  for (const [code, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some((k) => topic.includes(k))) {
      return code;
    }
  }

  return 'E01'; // 默认宏观经济
}

// 获取通用专家
function getUniversalExpert(role: string): Expert {
  const universalExperts: Record<string, Expert> = {
    fact_checker: {
      id: 'UNI-01',
      name: '事实核查员',
      code: 'UNI-01',
      level: 'domain',
      domainCode: 'UNI',
      domainName: '通用',
      profile: {
        title: '事实核查专家',
        background: '专注数据准确性和来源可靠性验证',
        personality: '严谨、细致、追求真相',
      },
      philosophy: {
        core: ['数据说话', '来源可追溯', '交叉验证'],
        quotes: ['没有数据支撑的观点是危险的'],
      },
      achievements: [],
      reviewDimensions: ['数据准确性', '来源可靠性', '引用规范性'],
      status: 'active',
      totalReviews: 0,
      acceptanceRate: 0.9,
      avgResponseTime: 5,
    },
    logic_checker: {
      id: 'UNI-02',
      name: '逻辑检察官',
      code: 'UNI-02',
      level: 'domain',
      domainCode: 'UNI',
      domainName: '通用',
      profile: {
        title: '逻辑分析专家',
        background: '专注论证严密性和逻辑自洽性',
        personality: '理性、批判、追求严密',
      },
      philosophy: {
        core: ['逻辑自洽', '因果清晰', '论证充分'],
        quotes: ['逻辑断裂是内容的最大隐患'],
      },
      achievements: [],
      reviewDimensions: ['论证严密性', '逻辑自洽性', '因果合理性'],
      status: 'active',
      totalReviews: 0,
      acceptanceRate: 0.85,
      avgResponseTime: 5,
    },
    reader_rep: {
      id: 'UNI-03',
      name: '读者代表',
      code: 'UNI-03',
      level: 'domain',
      domainCode: 'UNI',
      domainName: '通用',
      profile: {
        title: '可读性专家',
        background: '专注内容可读性和受众匹配度',
        personality: '亲和、直观、关注体验',
      },
      philosophy: {
        core: ['通俗易懂', '重点突出', '受众匹配'],
        quotes: ['好的内容是让读者轻松理解复杂问题'],
      },
      achievements: [],
      reviewDimensions: ['表达清晰度', '受众匹配度', '阅读流畅性'],
      status: 'active',
      totalReviews: 0,
      acceptanceRate: 0.88,
      avgResponseTime: 5,
    },
  };

  return universalExperts[role] || universalExperts.fact_checker;
}

// 寻找最佳特级专家
function findBestSeniorExpert(domainCode: string, topic: string): Expert | undefined {
  const seniorExperts = expertsCache.filter(
    (e) => e.level === 'senior' && e.status === 'active'
  );

  // 根据领域和主题匹配最合适的特级专家
  // 简单实现：随机选择一位
  if (seniorExperts.length > 0) {
    return seniorExperts[Math.floor(Math.random() * seniorExperts.length)];
  }

  return undefined;
}

// 生成专家观点
export function generateExpertOpinion(
  expert: Expert,
  content: string,
  contentType: 'outline' | 'draft' | 'research',
  options?: {
    usePersonalization?: boolean; // v5.1.2: 是否使用个性化生成
    importance?: number;
  }
): ExpertReview {
  const { usePersonalization = true, importance = 0.5 } = options || {};

  // v5.1.2: 使用个性化观点生成
  if (usePersonalization) {
    const personalizedOpinion = generatePersonalizedExpertOpinion(expert, content, {
      contentType,
      importance,
    });

    return {
      id: `review_${Date.now()}`,
      expertId: expert.id,
      expertName: expert.name,
      taskId: '',
      contentType,
      opinion: personalizedOpinion.opinion,
      focusAreas: personalizedOpinion.focusAreas,
      suggestions: personalizedOpinion.suggestions,
      confidence: personalizedOpinion.confidence,
      differentiationTags: expert.philosophy.core.slice(0, 3),
      personalizationMeta: personalizedOpinion.personalizationMeta, // v5.1.2
      createdAt: new Date().toISOString(),
    };
  }

  // 原有逻辑（兼容模式）
  const opinion = generateOpinionByExpertStyle(expert, content, contentType);
  const focusAreas = expert.reviewDimensions;
  const suggestions = generateSuggestionsByExpert(expert, content);

  return {
    id: `review_${Date.now()}`,
    expertId: expert.id,
    expertName: expert.name,
    taskId: '',
    contentType,
    opinion,
    focusAreas,
    suggestions,
    confidence: 0.8 + Math.random() * 0.15,
    differentiationTags: expert.philosophy.core.slice(0, 3),
    createdAt: new Date().toISOString(),
  };
}

// v5.1.2: 生成个性化专家观点
function generatePersonalizedExpertOpinion(
  expert: Expert,
  content: string,
  options: { contentType: string; importance: number }
): {
  opinion: string;
  focusAreas: string[];
  suggestions: string[];
  confidence: number;
  personalizationMeta: {
    angle: string;
    philosophyAligned: boolean;
    achievementReferenced: boolean;
  };
} {
  const { contentType, importance } = options;
  const typeLabel = contentType === 'outline' ? '大纲' : contentType === 'draft' ? '文稿' : '研究';

  // 根据专家角度选择差异化模板
  const angle = expert.angle || 'synthesizer';

  // 生成开场白（引用核心思想）
  const opening = generateExpertOpening(expert);

  // 生成分析框架
  const framework = generateExpertFramework(expert, content);

  // 关联成功案例
  const achievementRef = generateAchievementReference(expert);

  // 生成差异化核心观点
  const coreOpinion = generateAngleBasedOpinion(expert, angle, content, typeLabel);

  // 生成具体建议
  const suggestions = generateSuggestionsByExpert(expert, content);

  // 生成结尾（标志性句式）
  const closing = generateExpertClosing(expert);

  // 组装观点
  const sections = [opening, framework, achievementRef, coreOpinion, closing].filter(
    (s) => s && s.length > 0
  );

  const opinion = sections.join('\n\n');

  return {
    opinion,
    focusAreas: expert.reviewDimensions.slice(0, 3),
    suggestions,
    confidence: calculateExpertConfidence(expert, importance),
    personalizationMeta: {
      angle,
      philosophyAligned: opening.includes(expert.philosophy.core[0]?.slice(0, 5) || ''),
      achievementReferenced: !!achievementRef,
    },
  };
}

// v5.1.2: 生成专家开场白
function generateExpertOpening(expert: Expert): string {
  const coreIdeas = expert.philosophy.core;
  const quotes = expert.philosophy.quotes;

  // 50%概率引用名言
  if (quotes.length > 0 && Math.random() > 0.5) {
    return `${quotes[0]}`;
  }

  // 否则引用核心思想
  if (coreIdeas.length > 0) {
    return `正如我常提到的，${coreIdeas[0]}...`;
  }

  return `关于这个话题，${expert.name}有以下观点：`;
}

// v5.1.2: 生成专家分析框架
function generateExpertFramework(expert: Expert, content: string): string {
  const frameworks: Record<string, string> = {
    'S-01': '从第一性原理和数据驱动角度分析：',
    'S-02': '从终局思维和效率竞争角度审视：',
    'S-03': '从物理可行性和第一性原理出发：',
    'S-04': '从护城河和价值投资角度评估：',
    'S-05': '从长期愿景和技术革命角度思考：',
    'S-06': '从生存能力和危机管理角度分析：',
    default: `从${expert.domainName}专业角度分析：`,
  };

  return frameworks[expert.id] || frameworks.default;
}

// v5.1.2: 关联成功案例
function generateAchievementReference(expert: Expert): string {
  if (!expert.achievements || expert.achievements.length === 0) {
    return '';
  }

  const achievement = expert.achievements[0];
  return `这与我在${achievement.title}中的经验一致。当时的关键判断是：${achievement.impact.slice(0, 30)}...`;
}

// v5.1.2: 基于角度生成差异化观点
function generateAngleBasedOpinion(
  expert: Expert,
  angle: string,
  content: string,
  typeLabel: string
): string {
  const angleViews: Record<string, Record<string, string>> = {
    challenger: {
      'S-01': '这里有个被忽视的风险：短期数据可能会误导长期判断。',
      'S-02': '但是，大多数人忽视的结构性问题可能是致命的。',
      'S-03': '现有方案在物理上可能不可持续，需要重新思考。',
      'S-04': '估值可能过高，安全边际不足。',
      default: '需要注意潜在风险和挑战。',
    },
    expander: {
      'S-01': '更大的机会在于这个方向的信息效率提升。',
      'S-02': '延伸来看，这可能重塑整个行业的竞争格局。',
      'S-05': '这只是开始，AI革命将带来10倍的价值放大。',
      default: '延伸机会可能比当前更大的多。',
    },
    synthesizer: {
      'S-01': '综合来看，关键是找到长期价值的创造点。',
      'S-02': '本质上，这是效率提升的又一次迭代。',
      'S-04': '投资的核心还是护城河和估值的匹配。',
      default: '综合各方观点，核心在于执行和专注。',
    },
  };

  const view = angleViews[angle]?.[expert.id] || angleViews[angle]?.default || angleViews.synthesizer.default;

  return `\n${view}\n\n具体到这个${typeLabel}，建议关注：\n1. ${expert.reviewDimensions[0] || '战略定位'}\n2. ${expert.reviewDimensions[1] || '执行落地'}\n3. ${expert.reviewDimensions[2] || '长期价值'}`;
}

// v5.1.2: 生成专家结尾
function generateExpertClosing(expert: Expert): string {
  const closings: Record<string, string> = {
    'S-01': '保持耐心，延迟满足。',
    'S-02': '深度思考是无可替代的。',
    'S-03': '让我们把不可能变成可能。',
    'S-04': '安全边际永远重要。',
    'S-05': 'All in，没有退路。',
    'S-06': '活下去，才有未来。',
    default: expert.philosophy.quotes[0] || '',
  };

  return closings[expert.id] || closings.default;
}

// v5.1.2: 计算置信度
function calculateExpertConfidence(expert: Expert, importance: number): number {
  let baseConfidence = expert.acceptanceRate || 0.75;

  if (expert.level === 'senior') {
    baseConfidence += 0.05;
  }

  if (importance > 0.8) {
    baseConfidence += 0.03;
  }

  return Math.min(baseConfidence + Math.random() * 0.1, 0.98);
}

// 根据专家风格生成观点
function generateOpinionByExpertStyle(
  expert: Expert,
  content: string,
  contentType: string
): string {
  const style = expert.profile.personality;
  const typeLabel = contentType === 'outline' ? '大纲' : contentType === 'draft' ? '文稿' : '研究';

  // 张一鸣风格
  if (expert.name === '张一鸣') {
    return `从数据驱动的角度审视：\n1. 这个${typeLabel}的核心假设是否有A/B测试验证？\n2. 从长期视角看，这个策略10年后会怎样？\n3. 有没有更简单可执行的方案？\n4. 延迟满足感在这个方向如何体现？\n\n我的建议：先用最小成本验证核心假设，数据 positive 后再大力投入。`;
  }

  // 王兴风格
  if (expert.name === '王兴') {
    return `从战略角度分析：\n1. 这个方向的终局是什么？\n2. 供给侧效率是否有提升空间？\n3. 竞争格局会如何演变？\n4. 这是否是一场无限游戏？\n\n思考：大多数人为了逃避真正的思考愿意做任何事情。这个${typeLabel}是否经过了深度思考？`;
  }

  // 马斯克风格
  if (expert.name === '马斯克') {
    return `基于第一性原理分析：\n1. 从物理角度看，这个目标是否可行？\n2. 能否实现10倍改进而非10%优化？\n3. 时间表是否可以压缩到极致？\n4. 关键部件是否需要垂直整合？\n\n挑战：如果不能十倍改进，就不值得做。考虑突破常规思维。`;
  }

  // 任正非风格
  if (expert.name === '任正非') {
    return `从华为视角审视：\n1. 这个${typeLabel}是否考虑了"备胎"方案？\n2. 关键依赖是否可控？供应链韧性如何？\n3. 是否应用了"压强原则"——集中资源突破？\n4. 活下去是最高纲领，这个方向在寒冬中能否生存？\n\n提醒：华为的冬天随时可能到来，要做最坏的打算。`;
  }

  // 贝索斯风格
  if (expert.name === '贝索斯') {
    return `从Day 1视角分析：\n1. 这个${typeLabel}是否以客户为中心？解决了什么客户痛点？\n2. 是否专注于长期不变的事物？\n3. 能否构建飞轮效应，形成自我强化？\n4. 你的利润就是我的机会——这个模式的成本结构是否最优？\n\n思考：保持Day 1的活力，避免Day 2的僵化。`;
  }

  // 巴菲特风格
  if (expert.name === '巴菲特') {
    return `从价值投资角度审视：\n1. 这个${typeLabel}是否有足够宽的"护城河"？\n2. 是否在能力圈内？核心竞争优势是什么？\n3. 是否有安全边际？下行风险如何？\n4. 10年后这个投资/方向是否依然存在？\n\n提醒：价格是你付出的，价值是你得到的。确保有足够的安全边际。`;
  }

  // 孙正义风格
  if (expert.name === '孙正义') {
    return `从愿景投资视角分析：\n1. 这个${typeLabel}所在赛道是否有指数级增长潜力？\n2. 能否成为这个领域的"赢家通吃"者？\n3. 是否符合信息革命的300年大趋势？\n4. 如果成功，回报是否有100倍以上？\n\n思考：选择一个注定成功的赛道，比努力更重要。`;
  }

  // 黄峥风格
  if (expert.name === '黄峥') {
    return `从拼多多视角审视：\n1. 这个${typeLabel}是否考虑了五环外人群的需求？\n2. 是否追求多赢——消费者、平台、供应商都获益？\n3. 是否足够"本分"——聚焦本质而非表面功夫？\n4. 供给侧效率是否有大幅提升空间？\n\n思考：把资本主义倒过来，让价值分配更合理。`;
  }

  // 雷军风格
  if (expert.name === '雷军') {
    return `从铁人三项模式分析：\n1. 这个${typeLabel}是否有极致的产品体验？\n2. 是否有足够高的性价比？\n3. 是否考虑了和用户交朋友的长期运营？\n4. 能否形成软件+硬件+服务的生态协同？\n\n提醒：永远相信美好的事情即将发生，但要先站在风口上。`;
  }

  // 纳德拉风格
  if (expert.name === '纳德拉') {
    return `从云与AI转型视角审视：\n1. 这个${typeLabel}是否体现了"成长思维"？\n2. 是否以云优先、移动优先的理念设计？\n3. 是否构建了开放的合作生态？\n4. AI赋能能否带来10倍效率提升？\n\n思考：文化把战略当早餐吃。确保组织文化支撑这个方向。`;
  }

  // 通用专家风格
  return `作为${expert.domainName}领域的${expert.profile.title}，我认为：\n\n${expert.philosophy.quotes[0] || ''}\n\n针对这个${typeLabel}，我的核心关注点是：${expert.reviewDimensions.join('、')}。\n\n建议：${expert.philosophy.core.slice(0, 2).join('、')}是该领域成功的关键。`;
}

// 根据专家生成建议
function generateSuggestionsByExpert(expert: Expert, content: string): string[] {
  const baseSuggestions = [
    `建议从${expert.reviewDimensions[0] || '专业性'}角度深入分析`,
    `参考${expert.name}的成功实践：${expert.achievements[0]?.title || '持续创新'}`,
  ];

  return baseSuggestions;
}

// ==================== 专家工作量调度系统 ====================

// 工作量数据存储（实际应从后端API获取）
interface ExpertWorkloadData {
  pendingReviews: number;
  avgReviewTime: number;
  assignedTasks: string[];
  lastAssignedAt: string;
}

const workloadStore: Record<string, ExpertWorkloadData> = {};

// 初始化所有专家的工作量数据
function initWorkloadStore() {
  const experts = getAllExperts();
  experts.forEach(expert => {
    if (!workloadStore[expert.id]) {
      workloadStore[expert.id] = {
        pendingReviews: Math.floor(Math.random() * 4), // 随机0-3个待处理
        avgReviewTime: expert.avgResponseTime,
        assignedTasks: [],
        lastAssignedAt: new Date().toISOString(),
      };
    }
  });
}

// 获取专家工作量
export function getExpertWorkload(expertId: string): {
  pendingReviews: number;
  avgReviewTime: number;
  availability: 'available' | 'busy' | 'unavailable';
} {
  // 确保已初始化
  initWorkloadStore();

  const workload = workloadStore[expertId] || {
    pendingReviews: 0,
    avgReviewTime: 5,
    assignedTasks: [],
    lastAssignedAt: new Date().toISOString(),
  };

  // 根据待处理数量计算可用性
  let availability: 'available' | 'busy' | 'unavailable' = 'available';
  if (workload.pendingReviews > 5) {
    availability = 'unavailable';
  } else if (workload.pendingReviews > 2) {
    availability = 'busy';
  }

  return {
    pendingReviews: workload.pendingReviews,
    avgReviewTime: workload.avgReviewTime,
    availability,
  };
}

// 分配专家到任务（带负载均衡）
export function assignExpertWithLoadBalancing(
  domainCode: string,
  taskId: string
): Expert | null {
  initWorkloadStore();

  // 获取该领域所有可用专家
  const domainExperts = getExpertsByDomain(domainCode).filter(e => {
    const workload = getExpertWorkload(e.id);
    return workload.availability !== 'unavailable';
  });

  if (domainExperts.length === 0) {
    return null;
  }

  // 按待处理任务数排序，优先分配空闲专家
  const sortedExperts = domainExperts.sort((a, b) => {
    const workloadA = workloadStore[a.id]?.pendingReviews || 0;
    const workloadB = workloadStore[b.id]?.pendingReviews || 0;
    return workloadA - workloadB;
  });

  // 选择负载最轻的专家
  const selectedExpert = sortedExperts[0];

  // 更新工作量数据
  workloadStore[selectedExpert.id].pendingReviews += 1;
  workloadStore[selectedExpert.id].assignedTasks.push(taskId);
  workloadStore[selectedExpert.id].lastAssignedAt = new Date().toISOString();

  return selectedExpert;
}

// 释放专家（任务完成时调用）
export function releaseExpert(expertId: string, taskId: string): void {
  if (!workloadStore[expertId]) return;

  workloadStore[expertId].pendingReviews = Math.max(
    0,
    workloadStore[expertId].pendingReviews - 1
  );
  workloadStore[expertId].assignedTasks = workloadStore[expertId].assignedTasks.filter(
    id => id !== taskId
  );
}

// 获取所有专家工作量统计
export function getAllExpertWorkloads(): Record<
  string,
  ReturnType<typeof getExpertWorkload>
> {
  initWorkloadStore();

  const result: Record<string, ReturnType<typeof getExpertWorkload>> = {};
  const experts = getAllExperts();

  experts.forEach(expert => {
    result[expert.id] = getExpertWorkload(expert.id);
  });

  return result;
}

// 负载均衡分配多个专家
export function assignExpertsWithLoadBalancing(
  domainCode: string,
  taskId: string,
  count: number = 2
): Expert[] {
  const assigned: Expert[] = [];

  for (let i = 0; i < count; i++) {
    const expert = assignExpertWithLoadBalancing(domainCode, taskId);
    if (expert) {
      assigned.push(expert);
    }
  }

  return assigned;
}

// ==================== 用户反馈持久化系统 (Phase 1.3) ====================

// 专家反馈记录
interface ExpertFeedbackRecord {
  expertId: string;
  reviewId: string;
  taskId: string;
  action: 'accepted' | 'rejected' | 'ignored';
  timestamp: string;
  contentPreview?: string;
}

// 用户反馈存储
const expertFeedbackStore: ExpertFeedbackRecord[] = [];

// 专家采纳率统计缓存
const expertStatsCache: Record<string, {
  totalReviews: number;
  acceptedCount: number;
  rejectedCount: number;
  ignoredCount: number;
  lastUpdated: string;
}> = {};

/**
 * 记录用户对专家观点的反馈
 */
export function recordExpertFeedback(
  expertId: string,
  taskId: string,
  action: 'accepted' | 'rejected' | 'ignored',
  options?: {
    reviewId?: string;
    contentPreview?: string;
  }
): void {
  const record: ExpertFeedbackRecord = {
    expertId,
    reviewId: options?.reviewId || `${taskId}-${expertId}-${Date.now()}`,
    taskId,
    action,
    timestamp: new Date().toISOString(),
    contentPreview: options?.contentPreview,
  };

  expertFeedbackStore.push(record);

  // 更新统计缓存
  updateExpertStatsCache(expertId);

  // 更新专家的 totalReviews 和 acceptanceRate
  updateExpertAcceptanceRate(expertId);

  console.log(`[ExpertFeedback] 专家 ${expertId} 的观点被${action === 'accepted' ? '接受' : action === 'rejected' ? '拒绝' : '忽略'}`);
}

/**
 * 更新专家统计缓存
 */
function updateExpertStatsCache(expertId: string): void {
  const feedbacks = expertFeedbackStore.filter(f => f.expertId === expertId);

  expertStatsCache[expertId] = {
    totalReviews: feedbacks.length,
    acceptedCount: feedbacks.filter(f => f.action === 'accepted').length,
    rejectedCount: feedbacks.filter(f => f.action === 'rejected').length,
    ignoredCount: feedbacks.filter(f => f.action === 'ignored').length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 更新专家的采纳率
 */
function updateExpertAcceptanceRate(expertId: string): void {
  const stats = expertStatsCache[expertId];
  if (!stats || stats.totalReviews === 0) return;

  const expert = expertsCache.find(e => e.id === expertId);
  if (expert) {
    // 计算加权采纳率 (已接受 / (已接受 + 已拒绝))
    const validReviews = stats.acceptedCount + stats.rejectedCount;
    if (validReviews > 0) {
      expert.acceptanceRate = stats.acceptedCount / validReviews;
    }
    expert.totalReviews = stats.totalReviews;
  }
}

/**
 * 获取专家的反馈统计
 */
export function getExpertFeedbackStats(expertId: string): {
  totalReviews: number;
  acceptedCount: number;
  rejectedCount: number;
  ignoredCount: number;
  acceptanceRate: number;
} | null {
  // 确保缓存是最新的
  updateExpertStatsCache(expertId);

  const stats = expertStatsCache[expertId];
  if (!stats) return null;

  const validReviews = stats.acceptedCount + stats.rejectedCount;
  return {
    totalReviews: stats.totalReviews,
    acceptedCount: stats.acceptedCount,
    rejectedCount: stats.rejectedCount,
    ignoredCount: stats.ignoredCount,
    acceptanceRate: validReviews > 0 ? stats.acceptedCount / validReviews : 0,
  };
}

/**
 * 获取所有专家的反馈统计
 */
export function getAllExpertFeedbackStats(): Record<string, ReturnType<typeof getExpertFeedbackStats>> {
  const stats: Record<string, ReturnType<typeof getExpertFeedbackStats>> = {};
  const experts = getAllExperts();

  experts.forEach(expert => {
    stats[expert.id] = getExpertFeedbackStats(expert.id);
  });

  return stats;
}

/**
 * 获取用户的反馈历史
 */
export function getUserFeedbackHistory(
  options?: {
    expertId?: string;
    taskId?: string;
    action?: 'accepted' | 'rejected' | 'ignored';
    limit?: number;
  }
): ExpertFeedbackRecord[] {
  let results = [...expertFeedbackStore];

  if (options?.expertId) {
    results = results.filter(r => r.expertId === options.expertId);
  }

  if (options?.taskId) {
    results = results.filter(r => r.taskId === options.taskId);
  }

  if (options?.action) {
    results = results.filter(r => r.action === options.action);
  }

  // 按时间倒序
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (options?.limit) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * 获取个性化推荐权重
 * 基于用户历史反馈，为专家计算推荐权重
 */
export function getExpertRecommendationWeight(expertId: string): number {
  const stats = getExpertFeedbackStats(expertId);
  if (!stats || stats.totalReviews === 0) return 1.0;

  // 基础权重为 1.0
  let weight = 1.0;

  // 根据采纳率调整权重
  weight *= (0.5 + stats.acceptanceRate);

  // 根据总评审数进行微调（更多评审 = 更稳定的评价）
  const experienceBonus = Math.min(stats.totalReviews / 10, 0.2);
  weight *= (1 + experienceBonus);

  return Math.round(weight * 100) / 100;
}

/**
 * 批量接受专家观点（用于任务完成时）
 */
export function batchAcceptExpertReviews(
  expertIds: string[],
  taskId: string,
  options?: {
    contentPreview?: string;
  }
): void {
  expertIds.forEach(expertId => {
    recordExpertFeedback(expertId, taskId, 'accepted', {
      contentPreview: options?.contentPreview,
    });
  });
}

/**
 * 获取最受欢迎的专家（按采纳率排序）
 */
export function getTopExpertsByAcceptanceRate(limit: number = 10): Expert[] {
  const experts = getAllExperts();
  const expertsWithStats = experts.map(expert => ({
    expert,
    stats: getExpertFeedbackStats(expert.id),
    weight: getExpertRecommendationWeight(expert.id),
  }));

  return expertsWithStats
    .filter(item => item.stats && item.stats.totalReviews > 0)
    .sort((a, b) => b.stats!.acceptanceRate - a.stats!.acceptanceRate)
    .slice(0, limit)
    .map(item => item.expert);
}

// ==================== 专家历史评审记录 (Phase 2) ====================

// 历史评审记录接口
export interface ExpertReviewHistory {
  id: string;
  expertId: string;
  taskId: string;
  taskTitle: string;
  content: string;
  action: 'accepted' | 'rejected' | 'ignored';
  timestamp: string;
  feedback?: string;
}

// 模拟历史评审记录存储
const expertReviewHistoryStore: ExpertReviewHistory[] = [];

// 模拟评审内容模板
const reviewContentTemplates = [
  '从{dimension}角度分析，该内容存在{issue}问题，建议{improvement}。',
  '基于{expertise}经验，该主题需要重点关注{focus}，当前内容{assessment}。',
  '{expert}认为该内容在{aspect}方面表现{evaluation}，但{weakness}需要加强。',
];

const dimensions = ['战略', '市场', '产品', '运营', '技术', '财务'];
const issues = ['逻辑不够清晰', '数据支撑不足', '观点过于保守', '缺乏差异化'];
const improvements = ['补充更多案例', '深入分析底层逻辑', '增加数据论证', '调整结构层次'];
const expertiseAreas = ['行业研究', '投资分析', '企业管理', '产品规划'];
const focuses = ['竞争格局', '用户需求', '商业模式', '技术趋势'];
const assessments = ['较为全面', '略显薄弱', '有亮点但不够深入', '符合预期'];
const aspects = ['专业性', '洞察力', '可读性', '实用性'];
const evaluations = ['优秀', '良好', '一般', '有待提升'];
const weaknesses = ['论据部分', '结论推导', '案例选择', '逻辑链条'];

/**
 * 生成专家历史评审记录（模拟数据）
 */
export function generateExpertReviewHistory(expertId: string, count: number = 5): ExpertReviewHistory[] {
  const expert = expertsCache.find(e => e.id === expertId);
  if (!expert) return [];

  const history: ExpertReviewHistory[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 3 - Math.floor(Math.random() * 3));

    const template = reviewContentTemplates[Math.floor(Math.random() * reviewContentTemplates.length)];
    const content = template
      .replace('{dimension}', dimensions[Math.floor(Math.random() * dimensions.length)])
      .replace('{issue}', issues[Math.floor(Math.random() * issues.length)])
      .replace('{improvement}', improvements[Math.floor(Math.random() * improvements.length)])
      .replace('{expertise}', expertiseAreas[Math.floor(Math.random() * expertiseAreas.length)])
      .replace('{focus}', focuses[Math.floor(Math.random() * focuses.length)])
      .replace('{assessment}', assessments[Math.floor(Math.random() * assessments.length)])
      .replace('{expert}', expert.name)
      .replace('{aspect}', aspects[Math.floor(Math.random() * aspects.length)])
      .replace('{evaluation}', evaluations[Math.floor(Math.random() * evaluations.length)])
      .replace('{weakness}', weaknesses[Math.floor(Math.random() * weaknesses.length)]);

    const actions: Array<'accepted' | 'rejected' | 'ignored'> = ['accepted', 'accepted', 'accepted', 'rejected', 'ignored'];
    const action = actions[Math.floor(Math.random() * actions.length)];

    history.push({
      id: `review-${expertId}-${Date.now()}-${i}`,
      expertId,
      taskId: `task-${Date.now()}-${i}`,
      taskTitle: `${expert.domainName}研究报告 ${date.getMonth() + 1}月第${i + 1}期`,
      content,
      action,
      timestamp: date.toISOString(),
      feedback: action === 'accepted' ? '采纳了专家的建议' : action === 'rejected' ? '与内容方向不符' : '暂时保留意见',
    });
  }

  return history;
}

/**
 * 获取专家历史评审记录
 */
export function getExpertReviewHistory(
  expertId: string,
  options?: {
    limit?: number;
    action?: 'accepted' | 'rejected' | 'ignored';
  }
): ExpertReviewHistory[] {
  // 首先尝试从存储中获取
  let history = expertReviewHistoryStore.filter(r => r.expertId === expertId);

  // 如果没有记录，生成模拟数据
  if (history.length === 0) {
    history = generateExpertReviewHistory(expertId, 5);
    // 存储生成的记录
    expertReviewHistoryStore.push(...history);
  }

  // 过滤
  if (options?.action) {
    history = history.filter(r => r.action === options.action);
  }

  // 排序（按时间倒序）
  history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // 限制数量
  if (options?.limit) {
    history = history.slice(0, options.limit);
  }

  return history;
}

/**
 * 添加评审记录到历史
 */
export function addExpertReviewHistory(record: Omit<ExpertReviewHistory, 'id'>): ExpertReviewHistory {
  const newRecord: ExpertReviewHistory = {
    ...record,
    id: `review-${record.expertId}-${Date.now()}`,
  };
  expertReviewHistoryStore.push(newRecord);
  return newRecord;
}

// ==================== 素材专家标注 (Phase 3) ====================

// 素材专家评审接口
export interface AssetExpertReview {
  id: string;
  assetId: string;
  expertId: string;
  expertName: string;
  expertAvatar?: string;
  qualityScore: number; // 0-100 质量分
  credibilityScore: number; // 0-100 可信度
  relevanceScore: number; // 0-100 相关性
  tags: string[];
  comment: string;
  reviewedAt: string;
}

// 素材标注存储
const assetExpertReviewsStore: Map<string, AssetExpertReview[]> = new Map();

// 模拟评审评语模板
const assetReviewComments = [
  '该素材数据详实，来源可靠，具有很高的参考价值。',
  '内容较为全面，但部分数据需要进一步核实。',
  '观点独到，分析深入，是优质的行业参考资料。',
  '信息密度较高，但结构可以进一步优化。',
  '作为基础素材合格，建议结合其他资料使用。',
  '时效性较强，适合当前研究主题。',
  '专业度较高，适合深度分析引用。',
];

/**
 * 为素材生成专家标注（模拟）
 */
export function generateAssetExpertReviews(assetId: string, assetTitle: string): AssetExpertReview[] {
  // 根据assetId获取或生成评审
  if (assetExpertReviewsStore.has(assetId)) {
    return assetExpertReviewsStore.get(assetId)!;
  }

  // 匹配相关领域专家
  const matchResult = matchExperts({
    topic: assetTitle,
    importance: 0.7,
  });

  const experts = matchResult.seniorExpert
    ? [matchResult.seniorExpert, ...matchResult.domainExperts.slice(0, 2)]
    : matchResult.domainExperts.slice(0, 3);

  const reviews: AssetExpertReview[] = experts.map((expert, index) => {
    // 根据专家级别调整分数范围
    const baseScore = expert.level === 'senior' ? 85 : 75;
    const variance = Math.floor(Math.random() * 15);

    return {
      id: `asset-review-${assetId}-${expert.id}`,
      assetId,
      expertId: expert.id,
      expertName: expert.name,
      expertAvatar: expert.name.charAt(0),
      qualityScore: baseScore + variance - 5,
      credibilityScore: baseScore + variance,
      relevanceScore: baseScore + variance - Math.floor(Math.random() * 10),
      tags: expert.reviewDimensions.slice(0, 2),
      comment: assetReviewComments[Math.floor(Math.random() * assetReviewComments.length)],
      reviewedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  });

  assetExpertReviewsStore.set(assetId, reviews);
  return reviews;
}

/**
 * 获取素材的专家标注
 */
export function getAssetExpertReviews(assetId: string, assetTitle?: string): AssetExpertReview[] {
  if (assetExpertReviewsStore.has(assetId)) {
    return assetExpertReviewsStore.get(assetId)!;
  }

  if (assetTitle) {
    return generateAssetExpertReviews(assetId, assetTitle);
  }

  return [];
}

/**
 * 获取素材的综合评分
 */
export function getAssetCompositeScore(assetId: string): {
  overall: number;
  quality: number;
  credibility: number;
  relevance: number;
  reviewCount: number;
} | null {
  const reviews = assetExpertReviewsStore.get(assetId);
  if (!reviews || reviews.length === 0) return null;

  const avgQuality = reviews.reduce((sum, r) => sum + r.qualityScore, 0) / reviews.length;
  const avgCredibility = reviews.reduce((sum, r) => sum + r.credibilityScore, 0) / reviews.length;
  const avgRelevance = reviews.reduce((sum, r) => sum + r.relevanceScore, 0) / reviews.length;
  const overall = (avgQuality + avgCredibility + avgRelevance) / 3;

  return {
    overall: Math.round(overall),
    quality: Math.round(avgQuality),
    credibility: Math.round(avgCredibility),
    relevance: Math.round(avgRelevance),
    reviewCount: reviews.length,
  };
}

/**
 * 添加专家标注
 */
export function addAssetExpertReview(
  assetId: string,
  review: Omit<AssetExpertReview, 'id' | 'reviewedAt'>
): AssetExpertReview {
  const newReview: AssetExpertReview = {
    ...review,
    id: `asset-review-${assetId}-${Date.now()}`,
    reviewedAt: new Date().toISOString(),
  };

  const existing = assetExpertReviewsStore.get(assetId) || [];
  existing.push(newReview);
  assetExpertReviewsStore.set(assetId, existing);

  return newReview;
}

/**
 * 获取高评分素材推荐
 */
export function getTopRatedAssets(assetIds: string[], limit: number = 5): Array<{
  assetId: string;
  score: number;
  reviewCount: number;
}> {
  const scored = assetIds
    .map((id) => ({ id, score: getAssetCompositeScore(id) }))
    .filter((item): item is { id: string; score: NonNullable<ReturnType<typeof getAssetCompositeScore>> } =>
      item.score !== null
    )
    .sort((a, b) => b.score.overall - a.score.overall)
    .slice(0, limit);

  return scored.map((item) => ({
    assetId: item.id,
    score: item.score.overall,
    reviewCount: item.score.reviewCount,
  }));
}

// 加载专家数据 - 完整75位专家
export function loadExpertsData(): Expert[] {
  return [
    // ==================== 10位特级专家 ====================
    {
      id: 'S-01',
      name: '张一鸣',
      code: 'S-01',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '字节跳动创始人',
        background: '连续创业者，字节跳动创始人，今日头条、抖音、TikTok缔造者。算法推荐领域的革命者。',
        personality: '内敛，深度思考，相信数据和算法的理性力量',
      },
      philosophy: {
        core: ['延迟满足感', 'Context not Control', '大力出奇迹', '算法中立'],
        quotes: ['大多数问题的解决方案不是最优解，而是最简单可执行的解', '在矛盾中保持开放，在开放中保持专注'],
      },
      achievements: [
        { title: '今日头条日活过亿', description: '用推荐算法颠覆内容行业', date: '2016', impact: '重塑内容分发行业' },
        { title: 'TikTok全球化成功', description: '抖音/TikTok成为全球现象级产品', date: '2020', impact: '重塑全球社交娱乐' },
        { title: '算法推荐革命', description: '信息流产品全球领先', date: '2018', impact: '改变全球内容消费方式' },
      ],
      reviewDimensions: ['数据驱动', '长期价值', '执行效率', '简单可执行'],
      status: 'active',
      totalReviews: 128,
      acceptanceRate: 0.92,
      avgResponseTime: 8,
      angle: 'synthesizer',
    },
    {
      id: 'S-02',
      name: '王兴',
      code: 'S-02',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '美团创始人',
        background: '连续创业者，校内网、饭否、美团缔造者。从千团大战中杀出，构建本地生活超级平台。',
        personality: '沉稳，思考深邃，善于从第一性原理出发',
      },
      philosophy: {
        core: ['无限游戏', '供给侧改革', '竞争是常态', '做时间的朋友'],
        quotes: ['大多数人为了逃避真正的思考愿意做任何事情', '竞争的最高境界是不战而胜'],
      },
      achievements: [
        { title: '千团大战胜出', description: '成为本地生活超级平台', date: '2013', impact: '重塑本地生活服务行业' },
        { title: '外卖大战胜出', description: '击败饿了么成为行业第一', date: '2018', impact: '主导外卖行业格局' },
        { title: '美团上市', description: '港股最大IPO之一', date: '2018', impact: '市值突破千亿美金' },
      ],
      reviewDimensions: ['战略深远', '竞争格局', '供给侧效率', '终局思维'],
      status: 'active',
      totalReviews: 96,
      acceptanceRate: 0.89,
      avgResponseTime: 10,
      angle: 'synthesizer',
    },
    {
      id: 'S-03',
      name: '马斯克',
      code: 'S-03',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: 'Tesla/SpaceX CEO',
        background: '连续创业者，PayPal、Tesla、SpaceX、Neuralink、The Boring Company创始人。第一性原理践行者。',
        personality: '极致追求，第一性原理思考，敢于挑战不可能',
      },
      philosophy: {
        core: ['第一性原理', '十倍改进', '垂直整合', '物理思维'],
        quotes: ['如果不能十倍改进，就不值得做', '失败是一种选择，如果事情没有失败，说明你的创新不够'],
      },
      achievements: [
        { title: '特斯拉量产', description: '推动电动车普及', date: '2018', impact: '加速全球电动车转型' },
        { title: 'SpaceX火箭回收', description: '首次实现轨道火箭回收', date: '2015', impact: '革命性降低航天成本' },
        { title: '星舰项目', description: '人类移民火星计划', date: '2023', impact: '开启星际文明可能' },
      ],
      reviewDimensions: ['第一性原理', '十倍改进空间', '时间表可行性', '垂直整合度'],
      status: 'active',
      totalReviews: 156,
      acceptanceRate: 0.88,
      avgResponseTime: 7,
      angle: 'challenger',
    },
    {
      id: 'S-04',
      name: '任正非',
      code: 'S-04',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '华为创始人',
        background: '华为技术有限公司创始人，从2万元起家打造全球领先的ICT基础设施和智能终端提供商。',
        personality: '危机意识，长期主义，压强原则，开放包容',
      },
      philosophy: {
        core: ['压强原则', '备胎思维', '以客户为中心', '狼性文化'],
        quotes: ['华为的冬天', '活下去是最高纲领', '力出一孔，利出一孔'],
      },
      achievements: [
        { title: '5G领先', description: '全球5G专利第一', date: '2019', impact: '主导全球通信标准' },
        { title: '海思备胎转正', description: '芯片自主研发突破', date: '2019', impact: '保障供应链安全' },
        { title: '华为云崛起', description: '成为全球第五大云服务商', date: '2022', impact: '重塑中国云市场格局' },
      ],
      reviewDimensions: ['技术自主性', '供应链韧性', '压强投入比', '长期竞争力'],
      status: 'active',
      totalReviews: 142,
      acceptanceRate: 0.91,
      avgResponseTime: 9,
      angle: 'challenger',
    },
    {
      id: 'S-05',
      name: '贝索斯',
      code: 'S-05',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '亚马逊创始人',
        background: '亚马逊创始人，从线上书店到全球电商和云计算霸主。长期主义投资的典范。',
        personality: '极度长期主义，客户 obsession，系统化思维',
      },
      philosophy: {
        core: ['Day 1', '客户痴迷', '长期主义', '飞轮效应'],
        quotes: ['你的利润就是我的机会', '把所有资源all in在不变的事情上'],
      },
      achievements: [
        { title: 'AWS开创', description: '开创云计算行业', date: '2006', impact: '重塑全球IT基础设施' },
        { title: 'Prime会员', description: '订阅制商业模式创新', date: '2005', impact: '定义现代会员经济' },
        { title: '亚马逊上市', description: '股价增长千倍', date: '1997-2020', impact: '创造巨大股东价值' },
      ],
      reviewDimensions: ['客户价值', '长期投入', '飞轮效应', '运营效率'],
      status: 'active',
      totalReviews: 118,
      acceptanceRate: 0.90,
      avgResponseTime: 8,
      angle: 'expander',
    },
    {
      id: 'S-06',
      name: '巴菲特',
      code: 'S-06',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '伯克希尔哈撒韦CEO',
        background: '价值投资教父，伯克希尔哈撒韦董事长，从10万美元到千亿美元资产的传奇投资生涯。',
        personality: '理性，耐心，追求安全边际，终身学习',
      },
      philosophy: {
        core: ['安全边际', '能力圈', '护城河', '长期持有'],
        quotes: ['别人贪婪时我恐惧，别人恐惧时我贪婪', '价格是你付出的，价值是你得到的'],
      },
      achievements: [
        { title: '年化回报20%', description: '50年复合增长', date: '1965-2015', impact: '创造投资传奇' },
        { title: '投资苹果', description: '重仓苹果股票', date: '2016', impact: '获得巨额回报' },
        { title: '收购GEICO', description: '保险业务布局', date: '1996', impact: '构建保险帝国' },
      ],
      reviewDimensions: ['安全边际', '护城河深度', '估值合理性', '商业模式'],
      status: 'active',
      totalReviews: 186,
      acceptanceRate: 0.93,
      avgResponseTime: 11,
      angle: 'challenger',
    },
    {
      id: 'S-07',
      name: '孙正义',
      code: 'S-07',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '软银集团创始人',
        background: '软银集团创始人，愿景基金掌舵人，投资阿里获得超千倍回报，全球科技投资风向标。',
        personality: '宏大愿景，All-in策略，相信指数级增长',
      },
      philosophy: {
        core: ['信息革命', '300年愿景', '集群作战', '赢家通吃'],
        quotes: ['选择一个注定成功的赛道，比努力更重要', '我不是在投资公司，是在投资未来'],
      },
      achievements: [
        { title: '投资阿里巴巴', description: '2000万美元变700亿', date: '2000-2014', impact: '创造投资回报神话' },
        { title: '愿景基金', description: '全球最大科技基金', date: '2017', impact: '重塑全球科技投资' },
        { title: 'ARM收购', description: '收购芯片设计公司', date: '2016', impact: '布局AI芯片生态' },
      ],
      reviewDimensions: ['赛道空间', '指数增长', '网络效应', '市场规模'],
      status: 'active',
      totalReviews: 98,
      acceptanceRate: 0.85,
      avgResponseTime: 9,
      angle: 'expander',
    },
    {
      id: 'S-08',
      name: '黄峥',
      code: 'S-08',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '拼多多创始人',
        background: '拼多多创始人，从谷歌工程师到中国电商第三极。3年上市，5年GMV破万亿。',
        personality: '本分，追求多赢，关注下沉市场，算法和社交结合',
      },
      philosophy: {
        core: ['本分', '多赢', '普惠', '效率优先'],
        quotes: ['我们的核心就是五环内的人理解不了', '把资本主义倒过来'],
      },
      achievements: [
        { title: '拼多多上市', description: '创立3年即上市', date: '2018', impact: '创造电商奇迹' },
        { title: '百亿补贴', description: '正品低价策略', date: '2019', impact: '快速获取一二线城市用户' },
        { title: 'Temu出海', description: '跨境电商全球化', date: '2022', impact: '复制成功模式到海外' },
      ],
      reviewDimensions: ['下沉市场', '供需匹配', '性价比', '社交裂变'],
      status: 'active',
      totalReviews: 76,
      acceptanceRate: 0.88,
      avgResponseTime: 8,
      angle: 'expander',
    },
    {
      id: 'S-09',
      name: '雷军',
      code: 'S-09',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '小米集团创始人',
        background: '小米集团创始人，金山软件董事长。从程序员到企业家，铁人三项商业模式缔造者。',
        personality: '勤奋，追求卓越，感动人心，和用户交朋友',
      },
      philosophy: {
        core: ['铁人三项', '感动人心', '性价比', '和用户交朋友'],
        quotes: ['站在风口上，猪都能飞起来', '永远相信美好的事情即将发生'],
      },
      achievements: [
        { title: '小米手机', description: '颠覆中国手机市场', date: '2011', impact: '推动智能手机普及' },
        { title: '生态链布局', description: '投资百家生态链企业', date: '2014-2020', impact: '构建IoT帝国' },
        { title: '小米上市', description: '港股同股不同权第一股', date: '2018', impact: '市值破500亿美金' },
      ],
      reviewDimensions: ['产品体验', '性价比', '生态链协同', '用户运营'],
      status: 'active',
      totalReviews: 134,
      acceptanceRate: 0.87,
      avgResponseTime: 7,
      angle: 'synthesizer',
    },
    {
      id: 'S-10',
      name: '纳德拉',
      code: 'S-10',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '微软CEO',
        background: '微软第三任CEO，带领微软完成云转型，市值从3000亿到3万亿。同理心领导力的典范。',
        personality: '同理心，成长思维，开放合作，云优先',
      },
      philosophy: {
        core: ['成长思维', '云优先', '移动优先', '同理心'],
        quotes: ['我们的行业不尊重传统，只尊重创新', '文化 breakfast 午餐'],
      },
      achievements: [
        { title: 'Azure崛起', description: '云计算市场份额第二', date: '2014-2020', impact: '成功云转型' },
        { title: '收购LinkedIn', description: '262亿美元收购', date: '2016', impact: '完善企业生态' },
        { title: 'OpenAI合作', description: '投资ChatGPT', date: '2023', impact: '引领AI时代' },
      ],
      reviewDimensions: ['云转型', '开放生态', '组织文化', '企业级市场'],
      status: 'active',
      totalReviews: 112,
      acceptanceRate: 0.90,
      avgResponseTime: 8,
      angle: 'synthesizer',
    },

    // ==================== 20位中国头部顶级专家（补充）====================
    {
      id: 'S-11',
      name: '沈南鹏',
      code: 'S-11',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '红杉中国创始合伙人',
        background: '携程、如家创始人，红杉资本中国基金创始合伙人。中国顶级投资人，投资过阿里巴巴、京东、美团、拼多多等半数中国互联网巨头。',
        personality: '眼光独到，嗅觉敏锐，善于发现颠覆性机会',
      },
      philosophy: {
        core: ['赛道为王', '投早投小', '长期陪伴', '格局观'],
        quotes: ['投资最重要的是看赛道，其次才是看赛马', '好的投资人应该成为企业家的副驾驶'],
      },
      achievements: [
        { title: '红杉中国创立', description: '建立中国顶级VC基金', date: '2005', impact: '投资过半数中国互联网巨头' },
        { title: '投资美团', description: 'A轮投资并连续多轮加注', date: '2010', impact: '获得百倍回报' },
        { title: '投资拼多多', description: '早期投资并长期持有', date: '2015', impact: '创造投资传奇' },
      ],
      reviewDimensions: ['赛道规模', '团队执行力', '商业模式', '竞争壁垒'],
      status: 'active',
      totalReviews: 312,
      acceptanceRate: 0.94,
      avgResponseTime: 6,
      angle: 'expander',
    },
    {
      id: 'S-12',
      name: '张磊',
      code: 'S-12',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '高瓴资本创始人',
        background: '耶鲁大学毕业生，高瓴资本创始人。中国顶级价值投资者，腾讯、京东、美的、格力等重要股东。',
        personality: '长期主义，价值投资，做时间的朋友',
      },
      philosophy: {
        core: ['做时间的朋友', '守正用奇', '桃李不言下自成蹊', '弱水三千但取一瓢'],
        quotes: ['投资就是投人，找最好的公司长期持有', '时间是创新者的朋友，是守成者的敌人'],
      },
      achievements: [
        { title: '投资腾讯', description: '2005年投资腾讯并持有至今', date: '2005', impact: '获得千倍回报' },
        { title: '高瓴创立', description: '创立高瓴资本', date: '2005', impact: '管理规模超千亿美金' },
        { title: '投资京东', description: '3亿美元投资京东', date: '2010', impact: '帮助京东自建物流' },
      ],
      reviewDimensions: ['长期价值', '护城河', '企业家精神', '产业趋势'],
      status: 'active',
      totalReviews: 287,
      acceptanceRate: 0.93,
      avgResponseTime: 7,
      angle: 'synthesizer',
    },
    {
      id: 'S-13',
      name: '朱啸虎',
      code: 'S-13',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '金沙江创投主管合伙人',
        background: '金沙江创业投资基金主管合伙人。中国顶级天使投资人，滴滴、饿了么、小红书、ofo早期投资人。',
        personality: '眼光毒辣，出手果断，善于捕捉风口',
      },
      philosophy: {
        core: ['赛道第一', '流量为王', '闪电式扩张', '快速验证'],
        quotes: ['投资要投刚需高频', '商业模式必须跑得通'],
      },
      achievements: [
        { title: '投资滴滴', description: 'A轮投资滴滴打车', date: '2012', impact: '获得数百倍回报' },
        { title: '投资饿了么', description: '早期投资饿了么', date: '2011', impact: '外卖行业开创者' },
        { title: '投资小红书', description: 'A轮投资小红书', date: '2013', impact: '抓住内容社区红利' },
      ],
      reviewDimensions: ['商业模式', '市场空间', '流量获取', '执行速度'],
      status: 'active',
      totalReviews: 278,
      acceptanceRate: 0.89,
      avgResponseTime: 4,
      angle: 'challenger',
    },
    {
      id: 'S-14',
      name: '徐新',
      code: 'S-14',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '今日资本创始人',
        background: '今日资本创始人，中国顶级女性投资人。京东、网易、娃哈哈、美团、叮咚买菜等项目的早期投资人。',
        personality: '独具慧眼，长期持有，善于发现企业家精神',
      },
      philosophy: {
        core: ['投人第一', '长期持有', '消费品品牌', '企业家精神'],
        quotes: ['投资就是投人，找到具有杀手直觉的企业家', '伟大的公司值得长期持有'],
      },
      achievements: [
        { title: '投资网易', description: '投资网易并坚持持有', date: '1999', impact: '获得百倍回报' },
        { title: '投资京东', description: 'A轮投资京东', date: '2007', impact: '获得数十倍回报' },
        { title: '投资娃哈哈', description: '投资宗庆后', date: '1995', impact: '成就饮料帝国' },
      ],
      reviewDimensions: ['企业家素质', '品牌潜力', '市场规模', '执行力'],
      status: 'active',
      totalReviews: 234,
      acceptanceRate: 0.91,
      avgResponseTime: 6,
      angle: 'synthesizer',
    },
    {
      id: 'S-15',
      name: '林毅夫',
      code: 'S-15',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '著名经济学家',
        background: '北京大学新结构经济学研究院院长，原世界银行高级副行长兼首席经济学家。中国经济学界泰斗。',
        personality: '治学严谨，心系家国，理论与实际结合',
      },
      philosophy: {
        core: ['新结构经济学', '比较优势', '有为政府', '有效市场'],
        quotes: ['经济发展需要有效市场和有为政府的结合', '每个国家都应该按照自己的比较优势发展'],
      },
      achievements: [
        { title: '世行首席经济学家', description: '担任世界银行首席经济学家', date: '2008', impact: '首位中国人担任此职' },
        { title: '新结构经济学', description: '创立新结构经济学', date: '2012', impact: '中国经济理论创新' },
        { title: '中国经济预测', description: '准确预测中国经济发展', date: '1994', impact: '获得学术声誉' },
      ],
      reviewDimensions: ['宏观经济', '产业政策', '比较优势', '发展战略'],
      status: 'active',
      totalReviews: 156,
      acceptanceRate: 0.95,
      avgResponseTime: 12,
      angle: 'synthesizer',
    },
    {
      id: 'S-16',
      name: '周其仁',
      code: 'S-16',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '著名经济学家',
        background: '北京大学国家发展研究院教授，著名经济学家。中国改革开放研究专家，实地调研经济学家。',
        personality: '实事求是，注重调研，敢说真话',
      },
      philosophy: {
        core: ['产权改革', '市场制度', '实地调研', '改革逻辑'],
        quotes: ['真实世界的经济学', '改革就是让权利更加清晰'],
      },
      achievements: [
        { title: '产权研究', description: '农村土地制度研究', date: '1995', impact: '影响农村改革政策' },
        { title: '国企改革', description: '国有企业改革研究', date: '1998', impact: '推动国企改制' },
        { title: '医改研究', description: '医疗卫生体制改革', date: '2007', impact: '影响医改方向' },
      ],
      reviewDimensions: ['制度改革', '产权清晰', '市场机制', '实地调研'],
      status: 'active',
      totalReviews: 178,
      acceptanceRate: 0.93,
      avgResponseTime: 10,
      angle: 'challenger',
    },
    {
      id: 'S-17',
      name: '刘强东',
      code: 'S-17',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '京东集团创始人',
        background: '京东集团创始人、董事局主席。中国电商巨头之一，自建物流体系的开拓者。',
        personality: '执行力强，重视用户体验，坚持正道成功',
      },
      philosophy: {
        core: ['正道成功', '用户体验', '效率至上', '正品行货'],
        quotes: ['京东只做第一', '用户体验是我们存在的唯一理由'],
      },
      achievements: [
        { title: '京东创立', description: '创立京东公司', date: '2004', impact: '开创自营电商模式' },
        { title: '自建物流', description: '建立京东物流', date: '2007', impact: '颠覆电商物流体验' },
        { title: '京东上市', description: '京东美国上市', date: '2014', impact: '中国电商赴美上市' },
      ],
      reviewDimensions: ['供应链效率', '用户体验', '正品保障', '执行力'],
      status: 'active',
      totalReviews: 167,
      acceptanceRate: 0.88,
      avgResponseTime: 7,
      angle: 'synthesizer',
    },
    {
      id: 'S-18',
      name: '丁磊',
      code: 'S-18',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '网易创始人',
        background: '网易公司创始人、董事局主席兼CEO。中国互联网元老，从门户到游戏再到电商的跨界成功者。',
        personality: '产品情怀，追求品质，慢工出细活',
      },
      philosophy: {
        core: ['产品情怀', '品质至上', '稳扎稳打', '用户口碑'],
        quotes: ['做产品要有情怀', '赚钱只是顺便的事'],
      },
      achievements: [
        { title: '网易创立', description: '创立网易公司', date: '1997', impact: '中国互联网先驱' },
        { title: '网易游戏', description: '自主研发游戏', date: '2001', impact: '开创中国游戏黄金时代' },
        { title: '网易考拉', description: '进军跨境电商', date: '2015', impact: '品质电商标杆' },
      ],
      reviewDimensions: ['产品品质', '用户体验', '商业模式', '品牌口碑'],
      status: 'active',
      totalReviews: 145,
      acceptanceRate: 0.89,
      avgResponseTime: 9,
      angle: 'synthesizer',
    },
    {
      id: 'S-19',
      name: '熊晓鸽',
      code: 'S-19',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: 'IDG资本创始合伙人',
        background: 'IDG资本创始合伙人，中国风险投资行业开创者之一。最早将风险投资引入中国的投资人。',
        personality: '眼光长远，善于发现，陪伴成长',
      },
      philosophy: {
        core: ['早期投资', '长期陪伴', '赋能创业', '趋势判断'],
        quotes: ['投资最重要的是看人', '要投就投行业的第一'],
      },
      achievements: [
        { title: 'IDG中国', description: '将IDG引入中国', date: '1993', impact: '开创中国VC行业' },
        { title: '投资腾讯', description: '投资腾讯科技', date: '1999', impact: '获得巨大回报' },
        { title: '投资百度', description: '投资百度', date: '2000', impact: '成就搜索巨头' },
      ],
      reviewDimensions: ['团队素质', '市场空间', '趋势判断', '竞争格局'],
      status: 'active',
      totalReviews: 289,
      acceptanceRate: 0.87,
      avgResponseTime: 8,
      angle: 'expander',
    },
    {
      id: 'S-20',
      name: '刘炽平',
      code: 'S-20',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '腾讯总裁',
        background: '腾讯公司总裁， former高盛亚洲投资银行部执行董事。腾讯投资帝国的掌舵人，腾讯战略的制定者。',
        personality: '战略思维，投资眼光，生态布局',
      },
      philosophy: {
        core: ['生态投资', '战略协同', '长期价值', '开放共赢'],
        quotes: ['投资是腾讯生态的重要组成部分', '要做就做生态的连接器'],
      },
      achievements: [
        { title: '腾讯投资帝国', description: '建立腾讯投资体系', date: '2011', impact: '投资超800家公司' },
        { title: '战略合作', description: '主导腾讯战略投资', date: '2015', impact: '建立互联网生态' },
        { title: '海外扩张', description: '推动腾讯国际化', date: '2018', impact: '全球化战略布局' },
      ],
      reviewDimensions: ['战略协同', '生态价值', '投资价值', '长期收益'],
      status: 'active',
      totalReviews: 198,
      acceptanceRate: 0.91,
      avgResponseTime: 7,
      angle: 'expander',
    },
    {
      id: 'S-21',
      name: '樊纲',
      code: 'S-21',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '著名经济学家',
        background: '北京大学汇丰商学院教授，央行货币政策委员会委员。中国宏观经济学界著名学者，改革派经济学家代表。',
        personality: '观点鲜明，理性分析，关注改革',
      },
      philosophy: {
        core: ['市场经济', '体制改革', '宏观稳定', '结构调整'],
        quotes: ['改革是渐进的过程', '稳定是发展的前提'],
      },
      achievements: [
        { title: '国民经济研究', description: '创立国民经济研究所', date: '1995', impact: '经济政策研究机构' },
        { title: '货币政策', description: '参与货币政策制定', date: '2015', impact: '影响货币政策走向' },
        { title: '城镇化研究', description: '新型城镇化研究', date: '2013', impact: '影响城镇化政策' },
      ],
      reviewDimensions: ['宏观经济', '政策分析', '改革方向', '结构调整'],
      status: 'active',
      totalReviews: 167,
      acceptanceRate: 0.90,
      avgResponseTime: 9,
      angle: 'synthesizer',
    },
    {
      id: 'S-22',
      name: '李稻葵',
      code: 'S-22',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '著名经济学家',
        background: '清华大学经济管理学院教授，清华大学中国经济思想与实践研究院院长。原央行货币政策委员会委员，哈佛博士。',
        personality: '国际视野，政策影响力，学术研究',
      },
      philosophy: {
        core: ['大国博弈', '制度经济学', '宏观经济', '政策研究'],
        quotes: ['中国经济的根本在于制度优势', '大国竞争最终是制度竞争'],
      },
      achievements: [
        { title: '清华经管', description: '清华大学经济管理学院教授', date: '2004', impact: '培养经济管理人才' },
        { title: '货币政策', description: '央行货币政策委员会委员', date: '2010', impact: '参与货币政策制定' },
        { title: '大国战略', description: '中国经济战略研究', date: '2018', impact: '大国博弈研究'},
      ],
      reviewDimensions: ['国际宏观', '政策影响', '大国博弈', '制度优势'],
      status: 'active',
      totalReviews: 156,
      acceptanceRate: 0.89,
      avgResponseTime: 8,
      angle: 'expander',
    },
    {
      id: 'S-23',
      name: '程维',
      code: 'S-23',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '滴滴出行创始人',
        background: '滴滴出行创始人、董事长兼CEO。中国共享经济代表人物，从阿里销售到出行巨头缔造者。',
        personality: '狼性文化，执行力强，敢于战斗',
      },
      philosophy: {
        core: ['共享经济', '用户第一', '快速迭代', '战争思维'],
        quotes: ['出行市场的战争没有结束', '快速迭代才能活下去'],
      },
      achievements: [
        { title: '滴滴创立', description: '创立滴滴打车', date: '2012', impact: '开启共享出行时代' },
        { title: '并购快的', description: '击败快的打车', date: '2015', impact: '统一出行市场' },
        { title: '并购Uber中国', description: '收购Uber中国', date: '2016', impact: '成为行业绝对龙头' },
      ],
      reviewDimensions: ['市场规模', '网络效应', '执行速度', '资金效率'],
      status: 'active',
      totalReviews: 178,
      acceptanceRate: 0.86,
      avgResponseTime: 6,
      angle: 'challenger',
    },
    {
      id: 'S-24',
      name: '张小龙',
      code: 'S-24',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '微信创始人',
        background: '腾讯高级副总裁，微信创始人。Foxmail作者，中国顶级产品经理，微信生态缔造者。',
        personality: '极致产品，简约至上，人文关怀',
      },
      philosophy: {
        core: ['用户价值', '简约至上', '用完即走', '连接一切'],
        quotes: ['用户价值是第一位的', '好的产品是用完即走的'],
      },
      achievements: [
        { title: 'Foxmail', description: '开发Foxmail邮件客户端', date: '1997', impact: '中国软件经典之作' },
        { title: '微信诞生', description: '推出微信产品', date: '2011', impact: '改变中国人社交方式' },
        { title: '小程序', description: '推出微信小程序', date: '2017', impact: '开启轻应用时代' },
      ],
      reviewDimensions: ['产品体验', '用户价值', '简约设计', '生态构建'],
      status: 'active',
      totalReviews: 134,
      acceptanceRate: 0.95,
      avgResponseTime: 10,
      angle: 'synthesizer',
    },
    {
      id: 'S-25',
      name: '宿华',
      code: 'S-25',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '快手创始人',
        background: '快手科技联合创始人，前CEO。清华毕业，Google、百度工程师背景，短视频行业开创者。',
        personality: '技术驱动，普惠理念，关注普通人',
      },
      philosophy: {
        core: ['普惠算法', '记录生活', '技术驱动', '公平展示'],
        quotes: ['让每个人都能被看见', '算法应该是普惠的'],
      },
      achievements: [
        { title: '快手创立', description: '创立GIF快手', date: '2011', impact: '开创短视频行业' },
        { title: '快手上市', description: '快手港股上市', date: '2021', impact: '短视频第一股' },
        { title: '普惠算法', description: '坚持普惠推荐', date: '2018', impact: '让普通人被看见' },
      ],
      reviewDimensions: ['普惠价值', '内容生态', '技术算法', '用户体验'],
      status: 'active',
      totalReviews: 145,
      acceptanceRate: 0.87,
      avgResponseTime: 9,
      angle: 'synthesizer',
    },
    {
      id: 'S-26',
      name: '梁建章',
      code: 'S-26',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '携程联合创始人',
        background: '携程旅行网联合创始人、董事局主席，人口经济学家。斯坦福博士，从程序员到企业家到学者。',
        personality: '学术严谨，关注人口，跨界思考',
      },
      philosophy: {
        core: ['人口经济学', '创新活力', '长期趋势', '政策建议'],
        quotes: ['人口是中国最大的长期挑战', '创新需要年轻人的活力'],
      },
      achievements: [
        { title: '携程创立', description: '创立携程网', date: '1999', impact: '开创中国OTA行业' },
        { title: '携程上市', description: '携程纳斯达克上市', date: '2003', impact: '中国OTA第一股' },
        { title: '人口研究', description: '转向人口经济学研究', date: '2011', impact: '影响人口政策讨论' },
      ],
      reviewDimensions: ['人口趋势', '宏观经济', '长期影响', '政策建议'],
      status: 'active',
      totalReviews: 178,
      acceptanceRate: 0.91,
      avgResponseTime: 10,
      angle: 'expander',
    },
    {
      id: 'S-27',
      name: '李彦宏',
      code: 'S-27',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '百度创始人',
        background: '百度公司创始人、董事长兼CEO。中国搜索引擎之父，AI技术布道者，从搜索到AI的战略转型者。',
        personality: '技术理想主义，长期主义，AI信仰',
      },
      philosophy: {
        core: ['技术改变世界', 'AI驱动', '长期投入', '工程师文化'],
        quotes: ['技术可以让复杂的世界变得更简单', 'AI是百度未来的核心'],
      },
      achievements: [
        { title: '百度创立', description: '创立百度公司', date: '2000', impact: '中国搜索引擎领导者' },
        { title: '百度上市', description: '百度纳斯达克上市', date: '2005', impact: '中国科技第一股' },
        { title: 'AI转型', description: '全面转型人工智能', date: '2017', impact: '押注AI赛道' },
      ],
      reviewDimensions: ['技术壁垒', 'AI应用', '搜索体验', '长期投入'],
      status: 'active',
      totalReviews: 189,
      acceptanceRate: 0.88,
      avgResponseTime: 8,
      angle: 'synthesizer',
    },
    {
      id: 'S-28',
      name: '余承东',
      code: 'S-28',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '华为消费者BG CEO',
        background: '华为消费者业务CEO，终端BG CEO。从无线产品到消费者业务的战略转型操盘手，余大嘴。',
        personality: '敢想敢做，敢说敢做，执行力强',
      },
      philosophy: {
        core: ['极致产品', '高端突破', '敢为人先', '自我批判'],
        quotes: ['我们要做世界第一', '没有退路就是胜利之路'],
      },
      achievements: [
        { title: '华为手机', description: '带领华为手机崛起', date: '2012-2020', impact: '成为全球第二' },
        { title: ' Mate系列', description: '打造高端Mate系列', date: '2013', impact: '树立国产品牌' },
        { title: '鸿蒙系统', description: '推出鸿蒙OS', date: '2019', impact: '备胎计划转正' },
      ],
      reviewDimensions: ['产品竞争力', '品牌溢价', '技术突破', '执行力'],
      status: 'active',
      totalReviews: 167,
      acceptanceRate: 0.85,
      avgResponseTime: 6,
      angle: 'challenger',
    },
    {
      id: 'S-29',
      name: '董明珠',
      code: 'S-29',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '格力电器董事长',
        background: '珠海格力电器股份有限公司董事长。从销售员到总裁，中国制造代表人物，铁娘子。',
        personality: '强势果断，敢说敢做，质量至上',
      },
      philosophy: {
        core: ['质量至上', '自主创新', '中国制造', '股东回报'],
        quotes: ['好空调格力造', '让世界爱上中国造'],
      },
      achievements: [
        { title: '格力崛起', description: '带领格力成为空调龙头', date: '2001-2012', impact: '空调行业第一' },
        { title: '技术创新', description: '推动核心技术创新', date: '2012', impact: '掌握核心科技' },
        { title: '智能制造', description: '布局智能制造', date: '2015', impact: '产业升级标杆' },
      ],
      reviewDimensions: ['产品质量', '技术创新', '品牌价值', '股东回报'],
      status: 'active',
      totalReviews: 198,
      acceptanceRate: 0.87,
      avgResponseTime: 7,
      angle: 'challenger',
    },
    {
      id: 'S-30',
      name: '李开复',
      code: 'S-30',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '创新工场创始人',
        background: '创新工场董事长兼CEO，谷歌中国前总裁。卡内基梅隆博士，AI专家，中国创投教父。',
        personality: '技术创新，人文关怀，前瞻性思考',
      },
      philosophy: {
        core: ['技术趋势', '创业孵化', 'AI赋能', '人本主义'],
        quotes: ['世界因你不同', 'AI将改变一切'],
      },
      achievements: [
        { title: '谷歌中国', description: '创立谷歌中国', date: '2005', impact: '将谷歌引入中国' },
        { title: '创新工场', description: '创立创新工场', date: '2009', impact: '开创天使+孵化模式' },
        { title: 'AI投资', description: '布局AI投资', date: '2016', impact: '抓住AI浪潮' },
      ],
      reviewDimensions: ['技术趋势', '创业团队', 'AI应用', '市场前景'],
      status: 'active',
      totalReviews: 234,
      acceptanceRate: 0.90,
      avgResponseTime: 8,
      angle: 'expander',
    },
    // ==================== E01: 宏观经济 (6位) ====================
    {
      id: 'E01-01',
      name: '刘明远',
      code: 'E01-01',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: { title: '周期派宏观分析师', background: '15年宏观研究经验，曾任头部券商首席经济学家', personality: '沉稳，观点审慎，以数据说话' },
      philosophy: { core: ['经济周期论', '政策时滞论', '结构分化论'], quotes: ['掌握周期位置比预测拐点更重要'] },
      achievements: [{ title: '预判库存周期触底', description: '2019年Q2准确预判', date: '2019', impact: '帮助投资者把握机会' }],
      reviewDimensions: ['宏观逻辑一致性', '周期判断合理性', '政策敏感度'],
      status: 'active', totalReviews: 256, acceptanceRate: 0.85, avgResponseTime: 6,
    },
    {
      id: 'E01-02',
      name: '陈志华',
      code: 'E01-02',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: { title: '货币银行学家', background: '央行货币政策委员会成员，专注货币政策和流动性研究', personality: '严谨，关注政策传导机制' },
      philosophy: { core: ['流动性分析', '信用周期', '政策传导'], quotes: ['货币不是万能的，但没有货币是万万不能的'] },
      achievements: [{ title: '预判降准周期', description: '连续3次准确预测降准时点', date: '2022', impact: '把握货币政策节奏' }],
      reviewDimensions: ['货币政策', '流动性分析', '利率趋势'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.83, avgResponseTime: 7,
    },
    {
      id: 'E01-03',
      name: '王海涛',
      code: 'E01-03',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: { title: '国际宏观分析师', background: '专注中美关系和全球资本流动，曾任 IMF 经济学家', personality: '国际视野，跨市场分析' },
      philosophy: { core: ['全球宏观', '资本流动', '汇率分析'], quotes: ['在全球化时代，没有孤岛'] },
      achievements: [{ title: '预判美元周期', description: '准确预判美元走强周期', date: '2021', impact: '指导外汇投资策略' }],
      reviewDimensions: ['国际比较', '汇率影响', '资本流动'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.81, avgResponseTime: 8,
    },
    {
      id: 'E01-04',
      name: '李雪琴',
      code: 'E01-04',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: { title: '产业经济专家', background: '专注产业结构变迁和区域经济，社科院研究员', personality: '关注结构变化，产业视角' },
      philosophy: { core: ['产业结构', '区域分化', '转型升级'], quotes: ['结构比总量更重要'] },
      achievements: [{ title: '预判产业升级', description: '准确预判制造业升级路径', date: '2020', impact: '指导产业政策制定' }],
      reviewDimensions: ['产业结构', '区域差异', '转型进度'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.84, avgResponseTime: 7,
    },
    {
      id: 'E01-05',
      name: '张伟强',
      code: 'E01-05',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: { title: '通胀研究专家', background: '专注通胀和利率研究，曾任央行研究局', personality: '数据敏感，关注价格信号' },
      philosophy: { core: ['通胀预期', '成本推动', '需求拉动'], quotes: ['通胀是一种货币现象，但远不止于此'] },
      achievements: [{ title: '预判PPI拐点', description: '准确预判工业品价格走势', date: '2021', impact: '把握通胀节奏' }],
      reviewDimensions: ['通胀分析', '价格传导', '成本压力'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.82, avgResponseTime: 6,
    },
    {
      id: 'E01-06',
      name: '赵敏',
      code: 'E01-06',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: { title: '房地产周期专家', background: '专注房地产周期和土地财政，清华大学教授', personality: '系统思维，关注长期趋势' },
      philosophy: { core: ['房地产周期', '土地财政', '人口结构'], quotes: ['房地产短期看金融，中期看土地，长期看人口'] },
      achievements: [{ title: '预判地产下行', description: '提前预判房地产调整周期', date: '2022', impact: '预警行业风险' }],
      reviewDimensions: ['地产周期', '政策效果', '金融风险'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.86, avgResponseTime: 7,
    },

    // ==================== E02: 金融科技 (6位) ====================
    {
      id: 'E02-01',
      name: '孙浩然',
      code: 'E02-01',
      level: 'domain',
      domainCode: 'E02',
      domainName: '金融科技',
      profile: { title: '数字支付专家', background: '支付宝早期成员，专注移动支付和数字钱包', personality: '用户导向，关注体验' },
      philosophy: { core: ['支付即服务', '普惠金融', '技术驱动'], quotes: ['支付是金融的基础设施'] },
      achievements: [{ title: '扫码支付普及', description: '推动移动支付普及', date: '2015', impact: '改变支付方式' }],
      reviewDimensions: ['用户体验', '支付效率', '风控安全'],
      status: 'active', totalReviews: 234, acceptanceRate: 0.88, avgResponseTime: 6,
    },
    {
      id: 'E02-02',
      name: '周婷婷',
      code: 'E02-02',
      level: 'domain',
      domainCode: 'E02',
      domainName: '金融科技',
      profile: { title: '区块链金融专家', background: '专注DeFi和数字资产，华尔街背景', personality: '技术信仰，金融创新' },
      philosophy: { core: ['去中心化', '智能合约', '代币经济'], quotes: ['区块链将重塑金融基础设施'] },
      achievements: [{ title: 'DeFi协议设计', description: '主导多个DeFi项目设计', date: '2021', impact: '推动金融创新' }],
      reviewDimensions: ['技术可行性', '合规风险', '商业模式'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.84, avgResponseTime: 8,
    },
    {
      id: 'E02-03',
      name: '李明辉',
      code: 'E02-03',
      level: 'domain',
      domainCode: 'E02',
      domainName: '金融科技',
      profile: { title: '智能投顾专家', background: '专注AI理财和量化投资，CFA持证人', personality: '数据驱动，理性分析' },
      philosophy: { core: ['算法投资', '资产配置', '风险管理'], quotes: ['让每个人都能享受专业的财富管理'] },
      achievements: [{ title: '智能投顾产品', description: '管理规模破百亿', date: '2020', impact: '推动智能理财普及' }],
      reviewDimensions: ['算法有效性', '风险收益比', '用户适配'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.86, avgResponseTime: 7,
    },
    {
      id: 'E02-04',
      name: '王芳',
      code: 'E02-04',
      level: 'domain',
      domainCode: 'E02',
      domainName: '金融科技',
      profile: { title: '监管科技专家', background: '专注RegTech和合规科技，央行背景', personality: '合规第一，风险意识强' },
      philosophy: { core: ['合规科技', '风险防控', '数据安全'], quotes: ['金融创新的底线是风险可控'] },
      achievements: [{ title: '反洗钱系统', description: '设计智能风控系统', date: '2019', impact: '提升合规效率' }],
      reviewDimensions: ['合规性', '风险控制', '数据安全'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.89, avgResponseTime: 8,
    },
    {
      id: 'E02-05',
      name: '张建国',
      code: 'E02-05',
      level: 'domain',
      domainCode: 'E02',
      domainName: '金融科技',
      profile: { title: '开放银行专家', background: '专注银行数字化转型和开放银行', personality: '平台思维，生态视角' },
      philosophy: { core: ['开放银行', 'API经济', '生态共建'], quotes: ['银行即服务，金融服务无处不在'] },
      achievements: [{ title: '开放银行平台', description: '连接千家企业', date: '2021', impact: '推动银行业开放' }],
      reviewDimensions: ['开放度', '生态协同', 'API设计'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.85, avgResponseTime: 7,
    },
    {
      id: 'E02-06',
      name: '陈小雨',
      code: 'E02-06',
      level: 'domain',
      domainCode: 'E02',
      domainName: '金融科技',
      profile: { title: '保险科技专家', background: '专注互联网保险和智能核保', personality: '场景化思维，用户洞察' },
      philosophy: { core: ['场景保险', '智能核保', '用户体验'], quotes: ['保险应该像水电一样自然'] },
      achievements: [{ title: '百万医疗险', description: '开创低价高保额模式', date: '2018', impact: '普及健康保险' }],
      reviewDimensions: ['产品创新', '风控定价', '用户获取'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.87, avgResponseTime: 6,
    },

    // ==================== E03: 新能源 (6位) ====================
    {
      id: 'E03-01',
      name: '王鹏',
      code: 'E03-01',
      level: 'domain',
      domainCode: 'E03',
      domainName: '新能源',
      profile: { title: '动力电池专家', background: '20年电池研发经验，宁德时代前技术总监', personality: '技术深耕，追求能量密度' },
      philosophy: { core: ['能量密度', '安全优先', '成本下降'], quotes: ['电池是新能源的心脏'] },
      achievements: [{ title: 'CTP技术', description: '开创无模组技术', date: '2019', impact: '提升电池包能量密度' }],
      reviewDimensions: ['技术路线', '成本趋势', '安全性'],
      status: 'active', totalReviews: 267, acceptanceRate: 0.90, avgResponseTime: 7,
    },
    {
      id: 'E03-02',
      name: '李婷',
      code: 'E03-02',
      level: 'domain',
      domainCode: 'E03',
      domainName: '新能源',
      profile: { title: '光伏产业专家', background: '专注光伏产业链，通威股份顾问', personality: '产业视角，关注成本曲线' },
      philosophy: { core: ['度电成本', '技术迭代', '规模效应'], quotes: ['光伏是最便宜的电力来源'] },
      achievements: [{ title: 'HJT技术推广', description: '推动异质结技术发展', date: '2021', impact: '提升转换效率' }],
      reviewDimensions: ['技术路线', '成本竞争力', '产能周期'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.86, avgResponseTime: 6,
    },
    {
      id: 'E03-03',
      name: '张浩',
      code: 'E03-03',
      level: 'domain',
      domainCode: 'E03',
      domainName: '新能源',
      profile: { title: '储能系统专家', background: '专注电化学储能，特斯拉能源背景', personality: '系统集成思维，关注商业模式' },
      philosophy: { core: ['储能配套', '电网调节', '商业模式'], quotes: ['储能是新能源的神经系统'] },
      achievements: [{ title: '大型储能项目', description: '设计GW级储能系统', date: '2022', impact: '推动储能应用' }],
      reviewDimensions: ['技术方案', '经济性', '政策依赖'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.84, avgResponseTime: 8,
    },
    {
      id: 'E03-04',
      name: '刘洋',
      code: 'E03-04',
      level: 'domain',
      domainCode: 'E03',
      domainName: '新能源',
      profile: { title: '氢能专家', background: '专注氢燃料电池，丰田背景', personality: '长期主义，看好氢能未来' },
      philosophy: { core: ['氢能社会', '燃料电池', '绿氢制取'], quotes: ['氢能是终极能源解决方案'] },
      achievements: [{ title: '燃料电池推广', description: '推动商用车应用', date: '2020', impact: '拓展氢能场景' }],
      reviewDimensions: ['技术成熟度', '成本路径', '基础设施'],
      status: 'active', totalReviews: 134, acceptanceRate: 0.82, avgResponseTime: 9,
    },
    {
      id: 'E03-05',
      name: '陈静',
      code: 'E03-05',
      level: 'domain',
      domainCode: 'E03',
      domainName: '新能源',
      profile: { title: '电动车分析师', background: '专注电动车市场和产业链，曾任多家车企顾问', personality: '市场敏感，关注消费者需求' },
      philosophy: { core: ['电动化', '智能化', '用户体验'], quotes: ['电动车不只是能源变革，更是体验革命'] },
      achievements: [{ title: '市场预测', description: '准确预判渗透率拐点', date: '2021', impact: '把握投资节奏' }],
      reviewDimensions: ['市场渗透率', '竞争格局', '产品力'],
      status: 'active', totalReviews: 223, acceptanceRate: 0.88, avgResponseTime: 6,
    },
    {
      id: 'E03-06',
      name: '周明',
      code: 'E03-06',
      level: 'domain',
      domainCode: 'E03',
      domainName: '新能源',
      profile: { title: '充电桩运营专家', background: '专注充电基础设施，特来电前高管', personality: '运营导向，关注网络效应' },
      philosophy: { core: ['充电网络', '运营效率', '用户粘性'], quotes: ['充电便利性决定电动车普及速度'] },
      achievements: [{ title: '充电网络布局', description: '主导城市充电网络规划', date: '2019', impact: '提升充电便利性' }],
      reviewDimensions: ['网络布局', '运营效率', '盈利模式'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.85, avgResponseTime: 7,
    },

    // ==================== E04: 医疗健康 (6位) ====================
    {
      id: 'E04-01',
      name: '吴建华',
      code: 'E04-01',
      level: 'domain',
      domainCode: 'E04',
      domainName: '医疗健康',
      profile: { title: '创新药研发专家', background: '30年药物研发经验，主导多个重磅药物上市', personality: '科学严谨，追求突破' },
      philosophy: { core: ['靶点验证', '临床设计', '未满足需求'], quotes: ['好药是设计出来的，不是筛选出来的'] },
      achievements: [{ title: '新药上市', description: '主导PD-1药物研发', date: '2018', impact: '改变肿瘤治疗格局' }],
      reviewDimensions: ['科学机制', '临床设计', '商业化潜力'],
      status: 'active', totalReviews: 289, acceptanceRate: 0.91, avgResponseTime: 8,
    },
    {
      id: 'E04-02',
      name: '林小红',
      code: 'E04-02',
      level: 'domain',
      domainCode: 'E04',
      domainName: '医疗健康',
      profile: { title: '医疗器械专家', background: '专注高端医疗器械，迈瑞医疗背景', personality: '工程思维，关注临床需求' },
      philosophy: { core: ['临床导向', '国产替代', '技术迭代'], quotes: ['医疗器械的价值在临床应用中体现'] },
      achievements: [{ title: '高端影像设备', description: '突破CT核心技术', date: '2020', impact: '实现国产替代' }],
      reviewDimensions: ['技术壁垒', '临床价值', '市场准入'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.87, avgResponseTime: 7,
    },
    {
      id: 'E04-03',
      name: '郑强',
      code: 'E04-03',
      level: 'domain',
      domainCode: 'E04',
      domainName: '医疗健康',
      profile: { title: '医疗服务专家', background: '专注民营医疗和专科连锁，爱尔眼科顾问', personality: '运营思维，关注服务品质' },
      philosophy: { core: ['标准化', '连锁化', '品牌信任'], quotes: ['医疗的本质是信任和疗效'] },
      achievements: [{ title: '连锁扩张', description: '指导千家门店扩张', date: '2019', impact: '提升医疗服务可及性' }],
      reviewDimensions: ['扩张模式', '医疗质量', '品牌力'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.85, avgResponseTime: 7,
    },
    {
      id: 'E04-04',
      name: '王雪',
      code: 'E04-04',
      level: 'domain',
      domainCode: 'E04',
      domainName: '医疗健康',
      profile: { title: '医保政策专家', background: '专注医保支付和药物经济学', personality: '政策敏感，关注支付端' },
      philosophy: { core: ['医保谈判', '药物经济学', '准入策略'], quotes: ['医保支付是创新药的生死线'] },
      achievements: [{ title: '医保谈判', description: '参与多轮国家医保谈判', date: '2021', impact: '提升药物可及性' }],
      reviewDimensions: ['医保策略', '定价合理性', '市场准入'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.88, avgResponseTime: 8,
    },
    {
      id: 'E04-05',
      name: '李明',
      code: 'E04-05',
      level: 'domain',
      domainCode: 'E04',
      domainName: '医疗健康',
      profile: { title: 'CXO产业专家', background: '专注医药外包产业，药明康德背景', personality: '产业视角，关注全球分工' },
      philosophy: { core: ['全球分工', '效率优先', '质量合规'], quotes: ['CXO是全球医药创新的基础设施'] },
      achievements: [{ title: '产能扩张', description: '主导多个生产基地建设', date: '2020', impact: '提升全球份额' }],
      reviewDimensions: ['产能布局', '客户结构', '技术平台'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.86, avgResponseTime: 7,
    },
    {
      id: 'E04-06',
      name: '赵芳',
      code: 'E04-06',
      level: 'domain',
      domainCode: 'E04',
      domainName: '医疗健康',
      profile: { title: '数字医疗专家', background: '专注医疗AI和互联网医疗', personality: '技术乐观，关注医疗可及性' },
      philosophy: { core: ['AI赋能', '远程医疗', '数据驱动'], quotes: ['数字技术让优质医疗触手可及'] },
      achievements: [{ title: 'AI辅助诊断', description: '推动影像AI落地', date: '2021', impact: '提升诊断效率' }],
      reviewDimensions: ['技术成熟度', '临床验证', '商业模式'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.84, avgResponseTime: 6,
    },

    // ==================== E05: 消费零售 (5位) ====================
    {
      id: 'E05-01',
      name: '周华',
      code: 'E05-01',
      level: 'domain',
      domainCode: 'E05',
      domainName: '消费零售',
      profile: { title: '品牌打造专家', background: '专注消费品品牌建设，曾任宝洁、联合利华高管', personality: '消费者洞察，品牌思维' },
      philosophy: { core: ['品牌资产', '消费者洞察', '全渠道'], quotes: ['品牌是最持久的竞争优势'] },
      achievements: [{ title: '新品牌孵化', description: '孵化多个十亿级新品牌', date: '2020', impact: '重塑品类格局' }],
      reviewDimensions: ['品牌定位', '产品力', '渠道力'],
      status: 'active', totalReviews: 234, acceptanceRate: 0.88, avgResponseTime: 7,
    },
    {
      id: 'E05-02',
      name: '孙丽',
      code: 'E05-02',
      level: 'domain',
      domainCode: 'E05',
      domainName: '消费零售',
      profile: { title: '新零售专家', background: '专注线上线下融合，盒马鲜生顾问', personality: '数据驱动，关注效率' },
      philosophy: { core: ['人货场重构', '数据驱动', '即时零售'], quotes: ['新零售的本质是效率提升'] },
      achievements: [{ title: '门店数字化', description: '设计智能门店系统', date: '2019', impact: '提升运营效率' }],
      reviewDimensions: ['数字化程度', '供应链效率', '用户体验'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.86, avgResponseTime: 6,
    },
    {
      id: 'E05-03',
      name: '张明',
      code: 'E05-03',
      level: 'domain',
      domainCode: 'E05',
      domainName: '消费零售',
      profile: { title: '直播电商专家', background: '专注直播带货和达人经济', personality: '流量思维，内容敏感' },
      philosophy: { core: ['内容电商', '信任经济', '私域运营'], quotes: ['直播电商重构人货场'] },
      achievements: [{ title: '直播间打造', description: '孵化多个头部主播', date: '2021', impact: '创造销售奇迹' }],
      reviewDimensions: ['流量获取', '转化率', '供应链'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.84, avgResponseTime: 7,
    },
    {
      id: 'E05-04',
      name: '李艳',
      code: 'E05-04',
      level: 'domain',
      domainCode: 'E05',
      domainName: '消费零售',
      profile: { title: '餐饮连锁专家', background: '专注餐饮标准化和连锁扩张，海底捞顾问', personality: '运营细节，服务至上' },
      philosophy: { core: ['标准化', '服务体验', '组织力'], quotes: ['餐饮的本质是好吃和服务'] },
      achievements: [{ title: '连锁扩张', description: '指导千家门店扩张', date: '2018', impact: '建立行业标杆' }],
      reviewDimensions: ['单店模型', '扩张节奏', '食品安全'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.87, avgResponseTime: 7,
    },
    {
      id: 'E05-05',
      name: '王建国',
      code: 'E05-05',
      level: 'domain',
      domainCode: 'E05',
      domainName: '消费零售',
      profile: { title: '会员运营专家', background: '专注会员体系和私域运营，Costco研究专家', personality: '长期主义，关注LTV' },
      philosophy: { core: ['会员价值', '私域沉淀', '复购率'], quotes: ['会员是企业最宝贵的资产'] },
      achievements: [{ title: '会员体系设计', description: '设计千万级会员体系', date: '2020', impact: '提升用户粘性' }],
      reviewDimensions: ['会员价值', '复购率', '获客成本'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.85, avgResponseTime: 6,
    },

    // ==================== E06: 半导体 (6位) ====================
    {
      id: 'E06-01',
      name: '陈军',
      code: 'E06-01',
      level: 'domain',
      domainCode: 'E06',
      domainName: '半导体',
      profile: { title: '晶圆制造专家', background: '20年晶圆厂经验，台积电背景', personality: '工艺极致，良率至上' },
      philosophy: { core: ['工艺迭代', '良率提升', '产能扩张'], quotes: ['半导体是工艺+设备的艺术'] },
      achievements: [{ title: '先进制程', description: '参与7nm工艺研发', date: '2018', impact: '突破技术壁垒' }],
      reviewDimensions: ['技术节点', '良率水平', '产能利用率'],
      status: 'active', totalReviews: 278, acceptanceRate: 0.91, avgResponseTime: 8,
    },
    {
      id: 'E06-02',
      name: '刘洋',
      code: 'E06-02',
      level: 'domain',
      domainCode: 'E06',
      domainName: '半导体',
      profile: { title: '芯片设计专家', background: '专注芯片架构设计，高通背景', personality: '架构思维，性能优先' },
      philosophy: { core: ['架构创新', '性能功耗比', 'IP积累'], quotes: ['芯片设计的核心是架构创新'] },
      achievements: [{ title: 'AI芯片设计', description: '主导AI加速芯片架构', date: '2020', impact: '提升算力效率' }],
      reviewDimensions: ['架构先进性', '性能指标', '功耗控制'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.88, avgResponseTime: 7,
    },
    {
      id: 'E06-03',
      name: '张敏',
      code: 'E06-03',
      level: 'domain',
      domainCode: 'E06',
      domainName: '半导体',
      profile: { title: '半导体设备专家', background: '专注光刻机和刻蚀设备，ASML背景', personality: '精密工程，系统思维' },
      philosophy: { core: ['精密制造', '供应链', '国产替代'], quotes: ['设备是半导体制造的命脉'] },
      achievements: [{ title: '设备国产化', description: '推动刻蚀设备突破', date: '2021', impact: '提升自主率' }],
      reviewDimensions: ['技术成熟度', '供应链安全', '客户验证'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.86, avgResponseTime: 9,
    },
    {
      id: 'E06-04',
      name: '王强',
      code: 'E06-04',
      level: 'domain',
      domainCode: 'E06',
      domainName: '半导体',
      profile: { title: '封装测试专家', background: '专注先进封装，日月光背景', personality: '系统集成，成本敏感' },
      philosophy: { core: ['先进封装', '异构集成', '成本优化'], quotes: ['封装是摩尔定律的延续'] },
      achievements: [{ title: 'Chiplet技术', description: '推动小芯片架构', date: '2022', impact: '突破制程限制' }],
      reviewDimensions: ['封装技术', '成本控制', '可靠性'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.85, avgResponseTime: 7,
    },
    {
      id: 'E06-05',
      name: '李芳',
      code: 'E06-05',
      level: 'domain',
      domainCode: 'E06',
      domainName: '半导体',
      profile: { title: '半导体材料专家', background: '专注硅片和光刻胶，信越化学背景', personality: '材料科学，纯度和工艺' },
      philosophy: { core: ['材料纯度', '工艺匹配', '供应链'], quotes: ['材料是半导体制造的基石'] },
      achievements: [{ title: '大硅片突破', description: '推动12寸硅片量产', date: '2020', impact: '降低进口依赖' }],
      reviewDimensions: ['材料纯度', '工艺适配', '供应稳定性'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.84, avgResponseTime: 8,
    },
    {
      id: 'E06-06',
      name: '赵刚',
      code: 'E06-06',
      level: 'domain',
      domainCode: 'E06',
      domainName: '半导体',
      profile: { title: '功率半导体专家', background: '专注IGBT和SiC，英飞凌背景', personality: '应用导向，可靠性第一' },
      philosophy: { core: ['功率密度', '可靠性', '新能源应用'], quotes: ['功率半导体是能源转换的核心'] },
      achievements: [{ title: 'SiC模块', description: '推动车规级SiC应用', date: '2021', impact: '提升电动车性能' }],
      reviewDimensions: ['技术性能', '可靠性', '成本下降'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.87, avgResponseTime: 7,
    },

    // ==================== E07: 人工智能 (6位) ====================
    {
      id: 'E07-01',
      name: '杨强',
      code: 'E07-01',
      level: 'domain',
      domainCode: 'E07',
      domainName: '人工智能',
      profile: { title: '机器学习专家', background: '专注深度学习和大模型，Google Brain背景', personality: '算法创新，关注泛化能力' },
      philosophy: { core: ['模型架构', '数据质量', '计算效率'], quotes: ['数据是AI的燃料，算法是引擎'] },
      achievements: [{ title: 'Transformer优化', description: '提升大模型训练效率', date: '2021', impact: '降低训练成本' }],
      reviewDimensions: ['算法先进性', '数据质量', '算力效率'],
      status: 'active', totalReviews: 267, acceptanceRate: 0.90, avgResponseTime: 7,
    },
    {
      id: 'E07-02',
      name: '林小红',
      code: 'E07-02',
      level: 'domain',
      domainCode: 'E07',
      domainName: '人工智能',
      profile: { title: 'NLP专家', background: '专注自然语言处理，OpenAI背景', personality: '语言理解，关注应用场景' },
      philosophy: { core: ['语言理解', '知识融合', '多模态'], quotes: ['语言是智能的边界'] },
      achievements: [{ title: '大语言模型', description: '参与GPT系列研发', date: '2022', impact: '推动AGI发展' }],
      reviewDimensions: ['模型能力', '应用场景', '安全性'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.88, avgResponseTime: 8,
    },
    {
      id: 'E07-03',
      name: '王鹏',
      code: 'E07-03',
      level: 'domain',
      domainCode: 'E07',
      domainName: '人工智能',
      profile: { title: '计算机视觉专家', background: '专注CV和自动驾驶，特斯拉Autopilot背景', personality: '工程导向，关注落地' },
      philosophy: { core: ['感知智能', '端到端', '数据闭环'], quotes: ['视觉是机器理解世界的窗口'] },
      achievements: [{ title: '自动驾驶算法', description: '提升感知精度', date: '2021', impact: '推动无人驾驶' }],
      reviewDimensions: ['算法精度', '工程落地', '安全性'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.87, avgResponseTime: 7,
    },
    {
      id: 'E07-04',
      name: '陈静',
      code: 'E07-04',
      level: 'domain',
      domainCode: 'E07',
      domainName: '人工智能',
      profile: { title: 'AI芯片专家', background: '专注AI加速器设计，NVIDIA背景', personality: '软硬件协同，性能至上' },
      philosophy: { core: ['算力提升', '能效比', '软件生态'], quotes: ['AI计算需要专用架构'] },
      achievements: [{ title: 'AI芯片架构', description: '设计高效AI加速器', date: '2020', impact: '提升算力密度' }],
      reviewDimensions: ['算力性能', '能效比', '软件栈'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.86, avgResponseTime: 8,
    },
    {
      id: 'E07-05',
      name: '张华',
      code: 'E07-05',
      level: 'domain',
      domainCode: 'E07',
      domainName: '人工智能',
      profile: { title: 'AI应用专家', background: '专注AI商业化，微软AI产品背景', personality: '产品思维，关注用户价值' },
      philosophy: { core: ['产品化', '用户价值', '商业化'], quotes: ['AI的价值在应用中体现'] },
      achievements: [{ title: 'AI产品落地', description: '推动多个AI产品商业化', date: '2021', impact: '创造商业价值' }],
      reviewDimensions: ['产品体验', '商业价值', '技术可行性'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.85, avgResponseTime: 6,
    },
    {
      id: 'E07-06',
      name: '李明',
      code: 'E07-06',
      level: 'domain',
      domainCode: 'E07',
      domainName: '人工智能',
      profile: { title: 'AI安全专家', background: '专注AI伦理和安全，DeepMind背景', personality: '审慎，关注长期风险' },
      philosophy: { core: ['AI安全', '可控性', '价值观对齐'], quotes: ['安全是AI发展的前提'] },
      achievements: [{ title: '安全框架', description: '设计AI安全评估体系', date: '2022', impact: '提升AI安全性' }],
      reviewDimensions: ['安全性', '可控性', '伦理合规'],
      status: 'active', totalReviews: 134, acceptanceRate: 0.84, avgResponseTime: 9,
    },

    // ==================== E08: 房地产 (5位) ====================
    {
      id: 'E08-01',
      name: '王建国',
      code: 'E08-01',
      level: 'domain',
      domainCode: 'E08',
      domainName: '房地产',
      profile: { title: '住宅开发专家', background: '20年住宅开发经验，万科背景', personality: '稳健经营，产品主义' },
      philosophy: { core: ['产品为王', '财务稳健', '周转效率'], quotes: ['住宅的本质是居住'] },
      achievements: [{ title: '产品线打造', description: '打造多个标杆产品线', date: '2018', impact: '树立行业标准' }],
      reviewDimensions: ['产品力', '财务健康', '土储质量'],
      status: 'active', totalReviews: 234, acceptanceRate: 0.86, avgResponseTime: 7,
    },
    {
      id: 'E08-02',
      name: '李芳',
      code: 'E08-02',
      level: 'domain',
      domainCode: 'E08',
      domainName: '房地产',
      profile: { title: '商业地产专家', background: '专注购物中心和写字楼，凯德背景', personality: '资产运营，现金流导向' },
      philosophy: { core: ['资产管理', '运营能力', '资本化'], quotes: ['商业地产是资产管理生意'] },
      achievements: [{ title: 'REITs发行', description: '参与首批REITs发行', date: '2021', impact: '打通退出渠道' }],
      reviewDimensions: ['租金收益', '运营效率', '资产价值'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.85, avgResponseTime: 8,
    },
    {
      id: 'E08-03',
      name: '张明',
      code: 'E08-03',
      level: 'domain',
      domainCode: 'E08',
      domainName: '房地产',
      profile: { title: '物业管理专家', background: '专注物业服务和社区运营，碧桂园服务背景', personality: '服务思维，长期主义' },
      philosophy: { core: ['服务品质', '社区运营', '增值业务'], quotes: ['物业是终身服务的开始'] },
      achievements: [{ title: '物业拆分', description: '推动物业板块独立上市', date: '2019', impact: '重塑估值体系' }],
      reviewDimensions: ['服务品质', '收缴率', '增值潜力'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.87, avgResponseTime: 6,
    },
    {
      id: 'E08-04',
      name: '陈华',
      code: 'E08-04',
      level: 'domain',
      domainCode: 'E08',
      domainName: '房地产',
      profile: { title: '城市更新专家', background: '专注旧城改造和产业地产，招商蛇口背景', personality: '城市规划，产城融合' },
      philosophy: { core: ['产城融合', '城市运营', '长期持有'], quotes: ['城市更新是房地产的未来'] },
      achievements: [{ title: '产业园运营', description: '打造多个标杆产业园', date: '2020', impact: '推动产业升级' }],
      reviewDimensions: ['产业导入', '运营能力', '政策依赖'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.84, avgResponseTime: 7,
    },
    {
      id: 'E08-05',
      name: '刘洋',
      code: 'E08-05',
      level: 'domain',
      domainCode: 'E08',
      domainName: '房地产',
      profile: { title: '房地产金融专家', background: '专注房地产投融资和CMBS', personality: '金融思维，风险敏感' },
      philosophy: { core: ['资本结构', '风险定价', '退出通道'], quotes: ['房地产本质是金融'] },
      achievements: [{ title: 'CMBS设计', description: '设计多个资产证券化产品', date: '2021', impact: '拓宽融资渠道' }],
      reviewDimensions: ['融资成本', '杠杆水平', '流动性'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.85, avgResponseTime: 8,
    },

    // ==================== E09: 文化传媒 (5位) ====================
    {
      id: 'E09-01',
      name: '张晓明',
      code: 'E09-01',
      level: 'domain',
      domainCode: 'E09',
      domainName: '文化传媒',
      profile: { title: '内容制作专家', background: '专注影视剧制作，出品多部爆款剧集', personality: '故事思维，用户洞察' },
      philosophy: { core: ['好故事', '用户共鸣', '工业化'], quotes: ['内容是王道，故事是核心'] },
      achievements: [{ title: '爆款剧集', description: '出品现象级网剧', date: '2020', impact: '引领内容潮流' }],
      reviewDimensions: ['内容质量', '受众匹配', '商业化'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.86, avgResponseTime: 7,
    },
    {
      id: 'E09-02',
      name: '李芳',
      code: 'E09-02',
      level: 'domain',
      domainCode: 'E09',
      domainName: '文化传媒',
      profile: { title: '短视频运营专家', background: '专注短视频内容运营，抖音早期成员', personality: '算法思维，流量敏感' },
      philosophy: { core: ['算法推荐', '内容效率', '用户时长'], quotes: ['短视频重构内容消费'] },
      achievements: [{ title: 'MCN孵化', description: '孵化多个千万粉账号', date: '2021', impact: '打造内容生态' }],
      reviewDimensions: ['内容效率', '粉丝粘性', '变现能力'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.87, avgResponseTime: 6,
    },
    {
      id: 'E09-03',
      name: '王强',
      code: 'E09-03',
      level: 'domain',
      domainCode: 'E09',
      domainName: '文化传媒',
      profile: { title: 'IP运营专家', background: '专注IP开发和衍生品，迪士尼背景', personality: '长期主义，品牌思维' },
      philosophy: { core: ['IP沉淀', '跨媒介', '粉丝经济'], quotes: ['好IP可以跨越时代'] },
      achievements: [{ title: 'IP矩阵打造', description: '构建跨媒介IP生态', date: '2020', impact: '提升IP价值' }],
      reviewDimensions: ['IP价值', '跨媒介能力', '衍生品'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.85, avgResponseTime: 8,
    },
    {
      id: 'E09-04',
      name: '陈静',
      code: 'E09-04',
      level: 'domain',
      domainCode: 'E09',
      domainName: '文化传媒',
      profile: { title: '游戏产业专家', background: '专注游戏开发和发行，腾讯游戏背景', personality: '玩法创新，数据驱动' },
      philosophy: { core: ['玩法创新', '社交属性', '长线运营'], quotes: ['好游戏是玩法+社交的结合'] },
      achievements: [{ title: '爆款游戏', description: '发行多个现象级游戏', date: '2021', impact: '引领游戏潮流' }],
      reviewDimensions: ['玩法创新', '留存率', '商业化'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.88, avgResponseTime: 7,
    },
    {
      id: 'E09-05',
      name: '刘芳',
      code: 'E09-05',
      level: 'domain',
      domainCode: 'E09',
      domainName: '文化传媒',
      profile: { title: '广告营销专家', background: '专注品牌营销和效果广告，WPP背景', personality: '效果导向，创意驱动' },
      philosophy: { core: ['品效合一', '数据驱动', '创意内容'], quotes: ['好广告是艺术+科学的结合'] },
      achievements: [{ title: '营销案例', description: '打造多个出圈营销案例', date: '2022', impact: '提升品牌影响力' }],
      reviewDimensions: ['创意质量', '投放效率', '品牌提升'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.86, avgResponseTime: 6,
    },

    // ==================== E10: 先进制造 (5位) ====================
    {
      id: 'E10-01',
      name: '王强',
      code: 'E10-01',
      level: 'domain',
      domainCode: 'E10',
      domainName: '先进制造',
      profile: { title: '工业机器人专家', background: '专注工业机器人，ABB背景', personality: '自动化思维，效率至上' },
      philosophy: { core: ['自动化', '精度控制', '柔性制造'], quotes: ['机器人是制造业的的未来'] },
      achievements: [{ title: '智能工厂', description: '设计多个黑灯工厂', date: '2021', impact: '提升制造效率' }],
      reviewDimensions: ['自动化率', '精度水平', '柔性能力'],
      status: 'active', totalReviews: 198, acceptanceRate: 0.87, avgResponseTime: 8,
    },
    {
      id: 'E10-02',
      name: '李明',
      code: 'E10-02',
      level: 'domain',
      domainCode: 'E10',
      domainName: '先进制造',
      profile: { title: '航空制造专家', background: '专注航空零部件，中航工业背景', personality: '质量第一，安全至上' },
      philosophy: { core: ['精密制造', '质量体系', '供应链'], quotes: ['航空制造是工业的皇冠'] },
      achievements: [{ title: 'C919配套', description: '参与大飞机零部件制造', date: '2020', impact: '实现国产替代' }],
      reviewDimensions: ['质量标准', '交付能力', '技术壁垒'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.86, avgResponseTime: 9,
    },
    {
      id: 'E10-03',
      name: '张芳',
      code: 'E10-03',
      level: 'domain',
      domainCode: 'E10',
      domainName: '先进制造',
      profile: { title: '智能制造专家', background: '专注工业互联网和数字孪生，西门子背景', personality: '数字化转型，系统思维' },
      philosophy: { core: ['数字孪生', '预测性维护', '柔性生产'], quotes: ['智能制造是制造业的数字化转型'] },
      achievements: [{ title: '工业软件', description: '推动MES系统普及', date: '2021', impact: '提升数字化水平' }],
      reviewDimensions: ['数字化程度', '系统集成', 'ROI'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.85, avgResponseTime: 7,
    },
    {
      id: 'E10-04',
      name: '陈华',
      code: 'E10-04',
      level: 'domain',
      domainCode: 'E10',
      domainName: '先进制造',
      profile: { title: '新材料专家', background: '专注先进材料研发，3M背景', personality: '材料创新，应用导向' },
      philosophy: { core: ['材料创新', '性能突破', '成本控制'], quotes: ['材料是制造业的基础'] },
      achievements: [{ title: '碳纤维应用', description: '推动碳纤维大规模应用', date: '2020', impact: '轻量化突破' }],
      reviewDimensions: ['材料性能', '成本控制', '产业化'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.84, avgResponseTime: 8,
    },
    {
      id: 'E10-05',
      name: '刘洋',
      code: 'E10-05',
      level: 'domain',
      domainCode: 'E10',
      domainName: '先进制造',
      profile: { title: '精密模具专家', background: '专注模具设计和制造', personality: '精度追求，工艺专家' },
      philosophy: { core: ['精密加工', '模具设计', '工艺积累'], quotes: ['模具是工业之母'] },
      achievements: [{ title: '精密模具', description: '突破微米级加工精度', date: '2021', impact: '提升制造水平' }],
      reviewDimensions: ['加工精度', '模具寿命', '交付周期'],
      status: 'active', totalReviews: 134, acceptanceRate: 0.83, avgResponseTime: 7,
    },

    // ==================== E11: ESG可持续 (5位) ====================
    {
      id: 'E11-01',
      name: '王芳',
      code: 'E11-01',
      level: 'domain',
      domainCode: 'E11',
      domainName: 'ESG可持续',
      profile: { title: '碳中和专家', background: '专注碳核算和碳交易，联合国气候专家', personality: '科学严谨，政策敏感' },
      philosophy: { core: ['碳核算', '碳定价', '低碳转型'], quotes: ['碳中和是新的发展范式'] },
      achievements: [{ title: '碳中和路径', description: '设计企业碳中和方案', date: '2021', impact: '推动低碳转型' }],
      reviewDimensions: ['碳排放核算', '减排路径', '碳资产'],
      status: 'active', totalReviews: 178, acceptanceRate: 0.87, avgResponseTime: 8,
    },
    {
      id: 'E11-02',
      name: '李明',
      code: 'E11-02',
      level: 'domain',
      domainCode: 'E11',
      domainName: 'ESG可持续',
      profile: { title: 'ESG投资专家', background: '专注ESG投资，MSCI背景', personality: '投资视角，长期主义' },
      philosophy: { core: ['ESG整合', '长期价值', '影响力投资'], quotes: ['ESG是风险管理的工具'] },
      achievements: [{ title: 'ESG评级', description: '建立ESG评价体系', date: '2020', impact: '推动ESG投资' }],
      reviewDimensions: ['ESG评级', '投资整合', '信息披露'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.86, avgResponseTime: 7,
    },
    {
      id: 'E11-03',
      name: '张华',
      code: 'E11-03',
      level: 'domain',
      domainCode: 'E11',
      domainName: 'ESG可持续',
      profile: { title: '绿色金融专家', background: '专注绿色债券和可持续金融', personality: '金融创新，环境导向' },
      philosophy: { core: ['绿色金融', '环境效益', '可持续'], quotes: ['金融是绿色转型的催化剂'] },
      achievements: [{ title: '绿色债券', description: '发行首单碳中和债券', date: '2021', impact: '创新融资工具' }],
      reviewDimensions: ['绿色认证', '资金用途', '环境效益'],
      status: 'active', totalReviews: 134, acceptanceRate: 0.85, avgResponseTime: 8,
    },
    {
      id: 'E11-04',
      name: '陈静',
      code: 'E11-04',
      level: 'domain',
      domainCode: 'E11',
      domainName: 'ESG可持续',
      profile: { title: '循环经济专家', background: '专注废弃物资源化，循环经济背景', personality: '系统思维，资源效率' },
      philosophy: { core: ['资源循环', '零废弃', '生态设计'], quotes: ['垃圾是放错位置的资源'] },
      achievements: [{ title: '循环产业园', description: '设计零废弃产业园', date: '2022', impact: '推动循环经济' }],
      reviewDimensions: ['资源效率', '循环利用率', '经济效益'],
      status: 'active', totalReviews: 123, acceptanceRate: 0.84, avgResponseTime: 7,
    },
    {
      id: 'E11-05',
      name: '刘洋',
      code: 'E11-05',
      level: 'domain',
      domainCode: 'E11',
      domainName: 'ESG可持续',
      profile: { title: '社会责任专家', background: '专注企业社会责任和影响力评估', personality: '社会影响，利益相关方' },
      philosophy: { core: ['利益相关方', '社会价值', '包容性'], quotes: ['企业的价值在于创造社会价值'] },
      achievements: [{ title: '社会责任报告', description: '编写行业标杆CSR报告', date: '2021', impact: '提升ESG披露' }],
      reviewDimensions: ['社会影响', '员工权益', '社区关系'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.85, avgResponseTime: 6,
    },

    // ==================== E12: 跨境出海 (5位) ====================
    {
      id: 'E12-01',
      name: '张明',
      code: 'E12-01',
      level: 'domain',
      domainCode: 'E12',
      domainName: '跨境出海',
      profile: { title: '跨境电商专家', background: '专注亚马逊和独立站运营，年销过亿卖家', personality: '流量思维，供应链优势' },
      philosophy: { core: ['供应链优势', '流量运营', '本地化'], quotes: ['出海是把中国供应链优势全球化'] },
      achievements: [{ title: '品牌出海', description: '打造多个出海品牌', date: '2021', impact: '实现品牌升级' }],
      reviewDimensions: ['选品策略', '流量获取', '本地化'],
      status: 'active', totalReviews: 234, acceptanceRate: 0.88, avgResponseTime: 7,
    },
    {
      id: 'E12-02',
      name: '王芳',
      code: 'E12-02',
      level: 'domain',
      domainCode: 'E12',
      domainName: '跨境出海',
      profile: { title: '出海支付专家', background: '专注跨境支付和外汇管理，PayPal背景', personality: '合规第一，风险意识' },
      philosophy: { core: ['合规优先', '资金安全', '本地支付'], quotes: ['支付是出海的最后一公里'] },
      achievements: [{ title: '支付网络', description: '搭建全球支付网络', date: '2020', impact: '降低支付成本' }],
      reviewDimensions: ['合规性', '支付成功率', '成本控制'],
      status: 'active', totalReviews: 167, acceptanceRate: 0.86, avgResponseTime: 8,
    },
    {
      id: 'E12-03',
      name: '李强',
      code: 'E12-03',
      level: 'domain',
      domainCode: 'E12',
      domainName: '跨境出海',
      profile: { title: '海外营销专家', background: '专注Facebook和TikTok营销', personality: '创意驱动，数据优化' },
      philosophy: { core: ['内容营销', 'KOL合作', '数据驱动'], quotes: ['海外营销是文化+创意的输出'] },
      achievements: [{ title: '病毒营销', description: '打造多个 viral 案例', date: '2022', impact: '低成本获取用户' }],
      reviewDimensions: ['创意质量', '投放效率', '品牌认知'],
      status: 'active', totalReviews: 189, acceptanceRate: 0.87, avgResponseTime: 6,
    },
    {
      id: 'E12-04',
      name: '陈华',
      code: 'E12-04',
      level: 'domain',
      domainCode: 'E12',
      domainName: '跨境出海',
      profile: { title: '海外合规专家', background: '专注海外法律和税务合规，四大会计师背景', personality: '合规严谨，风险规避' },
      philosophy: { core: ['合规优先', '税务筹划', '知识产权'], quotes: ['合规是出海的底线'] },
      achievements: [{ title: '合规体系', description: '建立多国合规体系', date: '2021', impact: '规避法律风险' }],
      reviewDimensions: ['法律合规', '税务优化', '知识产权'],
      status: 'active', totalReviews: 156, acceptanceRate: 0.88, avgResponseTime: 9,
    },
    {
      id: 'E12-05',
      name: '刘静',
      code: 'E12-05',
      level: 'domain',
      domainCode: 'E12',
      domainName: '跨境出海',
      profile: { title: '海外供应链专家', background: '专注海外仓和物流，菜鸟网络背景', personality: '效率导向，成本控制' },
      philosophy: { core: ['海外仓布局', '物流效率', '成本优化'], quotes: ['物流是出海的血脉'] },
      achievements: [{ title: '海外仓网络', description: '搭建全球仓配网络', date: '2021', impact: '提升交付速度' }],
      reviewDimensions: ['仓配网络', '物流成本', '交付时效'],
      status: 'active', totalReviews: 145, acceptanceRate: 0.85, avgResponseTime: 7,
    },
  ];
}

// 初始化
initExperts(loadExpertsData());
