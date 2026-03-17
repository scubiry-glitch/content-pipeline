// 专家库服务 - Expert Service
import type {
  Expert,
  ExpertReview,
  ExpertAssignment,
  ExpertMatchRequest,
} from '../types';

// 专家数据存储 (实际应从API获取)
let expertsCache: Expert[] = [];

// 初始化专家数据
export function initExperts(experts: Expert[]) {
  expertsCache = experts;
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

// 智能匹配专家
export function matchExperts(request: ExpertMatchRequest): ExpertAssignment {
  const { topic, industry, importance = 0.5 } = request;

  // 1. 解析领域
  const domainCode = extractDomainFromTopic(topic, industry);

  // 2. 匹配领域专家 (2-3位)
  const domainExperts = expertsCache
    .filter((e) => e.domainCode === domainCode && e.level === 'domain')
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
    .slice(0, 3);

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
    seniorExpert = findBestSeniorExpert(domainCode, topic);
    matchReasons.push(`任务重要性${(importance * 100).toFixed(0)}%，启用特级专家`);
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
  contentType: 'outline' | 'draft' | 'research'
): ExpertReview {
  // 基于专家特点生成观点
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

// 根据专家风格生成观点
function generateOpinionByExpertStyle(
  expert: Expert,
  content: string,
  contentType: string
): string {
  const style = expert.profile.personality;

  // 张一鸣风格
  if (expert.name === '张一鸣') {
    return `从数据驱动的角度审视：\n1. 这个${contentType === 'outline' ? '大纲' : '内容'}的核心假设是否有A/B测试验证？\n2. 从长期视角看，这个策略10年后会怎样？\n3. 有没有更简单可执行的方案？\n4. 延迟满足感在这个方向如何体现？`;
  }

  // 王兴风格
  if (expert.name === '王兴') {
    return `从战略角度分析：\n1. 这个方向的终局是什么？\n2. 供给侧效率是否有提升空间？\n3. 竞争格局会如何演变？\n4. 这是否是一场无限游戏？`;
  }

  // 马斯克风格
  if (expert.name === '马斯克') {
    return `基于第一性原理分析：\n1. 从物理角度看，这个目标是否可行？\n2. 能否实现10倍改进而非10%优化？\n3. 时间表是否可以压缩到极致？\n4. 关键部件是否需要垂直整合？`;
  }

  // 通用专家风格
  return `作为${expert.domainName}领域的${expert.profile.title}，我认为：\n\n${expert.philosophy.quotes[0] || ''}\n\n核心关注点：${expert.reviewDimensions.join('、')}`;
}

// 根据专家生成建议
function generateSuggestionsByExpert(expert: Expert, content: string): string[] {
  const baseSuggestions = [
    `建议从${expert.reviewDimensions[0] || '专业性'}角度深入分析`,
    `参考${expert.name}的成功实践：${expert.achievements[0]?.title || '持续创新'}`,
  ];

  return baseSuggestions;
}

// 获取专家工作量
export function getExpertWorkload(expertId: string): {
  pendingReviews: number;
  avgReviewTime: number;
  availability: 'available' | 'busy' | 'unavailable';
} {
  // 模拟数据
  const workloads: Record<string, { pending: number; time: number }> = {
    'S-01': { pending: 2, time: 10 },
    'S-02': { pending: 1, time: 8 },
    'S-03': { pending: 3, time: 12 },
  };

  const workload = workloads[expertId] || { pending: 0, time: 5 };

  let availability: 'available' | 'busy' | 'unavailable' = 'available';
  if (workload.pending > 5) {
    availability = 'unavailable';
  } else if (workload.pending > 2) {
    availability = 'busy';
  }

  return {
    pendingReviews: workload.pending,
    avgReviewTime: workload.time,
    availability,
  };
}

// 加载专家数据
export function loadExpertsData(): Expert[] {
  // 这里可以加载完整的75位专家数据
  // 目前返回基础示例数据
  return [
    {
      id: 'S-01',
      name: '张一鸣',
      code: 'S-01',
      level: 'senior',
      domainCode: 'S',
      domainName: '特级专家',
      profile: {
        title: '字节跳动创始人',
        background:
          '连续创业者，字节跳动创始人，今日头条、抖音、TikTok缔造者。算法推荐领域的革命者。',
        personality: '内敛，深度思考，相信数据和算法的理性力量',
      },
      philosophy: {
        core: ['延迟满足感', 'Context not Control', '大力出奇迹', '算法中立'],
        quotes: ['大多数问题的解决方案不是最优解，而是最简单可执行的解'],
      },
      achievements: [
        {
          title: '今日头条日活过亿',
          description: '用推荐算法颠覆内容行业',
          date: '2016',
          impact: '重塑内容分发行业',
        },
        {
          title: 'TikTok全球化成功',
          description: '抖音/TikTok成为全球现象级产品',
          date: '2020',
          impact: '重塑全球社交娱乐',
        },
      ],
      reviewDimensions: ['数据驱动', '长期价值', '执行效率', '简单可执行'],
      status: 'active',
      totalReviews: 128,
      acceptanceRate: 0.92,
      avgResponseTime: 8,
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
        background: '连续创业者，校内网、饭否、美团缔造者。从千团大战中杀出，构建超级平台。',
        personality: '沉稳，思考深邃，善于从第一性原理出发',
      },
      philosophy: {
        core: ['无限游戏', '供给侧改革', '竞争是常态', '做时间的朋友'],
        quotes: ['大多数人为了逃避真正的思考愿意做任何事情'],
      },
      achievements: [
        {
          title: '千团大战胜出',
          description: '成为本地生活超级平台',
          date: '2013',
          impact: '重塑本地生活服务行业',
        },
      ],
      reviewDimensions: ['战略深远', '竞争格局', '供给侧效率', '终局思维'],
      status: 'active',
      totalReviews: 96,
      acceptanceRate: 0.89,
      avgResponseTime: 10,
    },
    {
      id: 'E01-01',
      name: '刘明远',
      code: 'E01-01',
      level: 'domain',
      domainCode: 'E01',
      domainName: '宏观经济',
      profile: {
        title: '周期派宏观分析师',
        background: '15年宏观研究经验，曾任头部券商首席经济学家',
        personality: '沉稳，观点审慎，以数据说话',
      },
      philosophy: {
        core: ['经济周期论', '政策时滞论', '结构分化论'],
        quotes: ['掌握周期位置比预测拐点更重要'],
      },
      achievements: [
        {
          title: '预判库存周期触底',
          description: '2019年Q2准确预判',
          date: '2019',
          impact: '帮助投资者把握机会',
        },
      ],
      reviewDimensions: ['宏观逻辑一致性', '周期判断合理性', '政策敏感度'],
      status: 'active',
      totalReviews: 256,
      acceptanceRate: 0.85,
      avgResponseTime: 6,
    },
  ];
}

// 初始化
initExperts(loadExpertsData());
