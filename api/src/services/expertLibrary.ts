// Expert Library Service - 专家库管理 v2.0
// 支持: 四位专家评审体系、动态专家匹配、领域推荐

import { query } from '../db/connection.js';

export type ExpertRole = 'fact_checker' | 'logic_checker' | 'domain_expert' | 'reader_rep';

export interface Expert {
  id: string;
  name: string;
  title: string;
  role: ExpertRole;
  domains: string[];
  expertise_level: number;
  system_prompt: string;
  bio?: string;
}

// 四位专家评审角色定义
export const EXPERT_ROLES: ExpertRole[] = [
  'fact_checker',    // 事实核查员 - 专注准确性
  'logic_checker',   // 逻辑检察官 - 专注严密性
  'domain_expert',   // 行业专家 - 专注专业度
  'reader_rep'       // 读者代表 - 专注可读性
];

// 角色中文名映射
export const ROLE_NAMES: Record<ExpertRole, string> = {
  fact_checker: '事实核查员',
  logic_checker: '逻辑检察官',
  domain_expert: '行业专家',
  reader_rep: '读者代表'
};

// 角色描述映射
export const ROLE_DESCRIPTIONS: Record<ExpertRole, string> = {
  fact_checker: '专注准确性检查（数字、日期、来源、单位）',
  logic_checker: '专注严密性检查（因果推理、归因逻辑、论证跳跃）',
  domain_expert: '专注专业度检查（术语使用、趋势判断、洞察深度）',
  reader_rep: '专注可读性检查（流畅度、晦涩程度、段落长度）'
};

export class ExpertLibraryService {
  /**
   * 匹配四位专家评审
   * 根据主题关键词，为每个角色匹配最合适的专家
   */
  async matchFourExperts(topic: string): Promise<Expert[]> {
    // 提取主题关键词
    const keywords = this.extractKeywords(topic);
    console.log('[ExpertLibrary] Matching 4 experts for topic:', topic);
    console.log('[ExpertLibrary] Extracted keywords:', keywords);

    // 为每个角色匹配专家
    const experts: Expert[] = [];

    for (const role of EXPERT_ROLES) {
      const expert = await this.findBestExpert(keywords, role);
      if (expert) {
        experts.push(expert);
        console.log(`[ExpertLibrary] Matched ${role}: ${expert.name}`);
      }
    }

    // 如果某个角色没有匹配到，使用通用专家补充
    for (const role of EXPERT_ROLES) {
      if (!experts.some(e => e.role === role)) {
        const defaultExpert = await this.getDefaultExpert(role);
        if (defaultExpert) {
          experts.push(defaultExpert);
          console.log(`[ExpertLibrary] Using default ${role}: ${defaultExpert.name}`);
        }
      }
    }

    return experts;
  }

  /**
   * 根据主题匹配专家（兼容旧接口）
   * @deprecated 使用 matchFourExperts 替代
   */
  async matchExperts(topic: string, count: number = 4): Promise<Expert[]> {
    return this.matchFourExperts(topic);
  }

  /**
   * 获取所有专家列表
   */
  async listExperts(options?: { role?: ExpertRole; domain?: string }): Promise<Expert[]> {
    let sql = `
      SELECT id, name, title, role, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true
    `;
    const params: any[] = [];

    if (options?.role) {
      sql += ` AND role = $${params.length + 1}`;
      params.push(options.role);
    }

    if (options?.domain) {
      sql += ` AND domains && ARRAY[$${params.length + 1}]`;
      params.push(options.domain);
    }

    sql += ` ORDER BY expertise_level DESC, name`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * 获取特定角色的专家
   */
  async getExpertsByRole(role: ExpertRole, limit: number = 10): Promise<Expert[]> {
    const sql = `
      SELECT id, name, title, role, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true AND role = $1
      ORDER BY expertise_level DESC
      LIMIT $2
    `;
    const result = await query(sql, [role, limit]);
    return result.rows;
  }

  /**
   * 提取主题关键词
   */
  private extractKeywords(topic: string): string[] {
    // 预定义的领域关键词库（扩展版）
    const domainKeywords: Record<string, string[]> = {
      '房地产': ['房地产', '房产', '住房', '住宅', '楼宇', '物业', 'REITs', 'reits', '保租房'],
      '保租房': ['保租房', '保障性租赁住房', '租赁住房', '公租房', '保障房', '长租'],
      '金融科技': ['金融科技', '智能理财', '财富管理', '数字化', '科技金融', '区块链', '支付'],
      '新能源': ['新能源', '电池', '储能', '锂电', '光伏', '风电', '电动汽车', '充电桩', '能源'],
      '人工智能': ['人工智能', 'AI', '大模型', '机器学习', '深度学习', '算法', '智能', 'GPT', 'AIGC'],
      '半导体': ['半导体', '芯片', '集成电路', '晶圆', '制程', '光刻', 'EDA', 'GPU'],
      '生物医药': ['生物医药', '医药', '医疗', '器械', '药品', '疫苗', '基因', 'CRO'],
      '消费品': ['消费品', '零售', '品牌', '营销', '渠道', '电商', '新消费'],
      'TMT': ['TMT', '互联网', '软件', 'SaaS', '云计算', '大数据', '5G', '物联网'],
      '政策': ['政策', '监管', '法规', '意见', '通知', '办法', '规范'],
      '资本市场': ['资本', '证券', '上市', 'IPO', '股市', '基金', '投资', '融资'],
      '宏观经济': ['宏观', '经济', 'GDP', '增长', '周期', '通胀', '利率', '汇率']
    };

    const keywords: string[] = [];
    const topicLower = topic.toLowerCase();

    for (const [domain, words] of Object.entries(domainKeywords)) {
      if (words.some(w => topicLower.includes(w.toLowerCase()))) {
        keywords.push(domain);
        keywords.push(...words.filter(w => topicLower.includes(w.toLowerCase())));
      }
    }

    // 去重并返回
    return [...new Set(keywords)];
  }

  /**
   * 查找最佳匹配专家
   */
  private async findBestExpert(keywords: string[], role: ExpertRole): Promise<Expert | null> {
    if (keywords.length === 0) {
      return this.getDefaultExpert(role);
    }

    // 优先匹配领域专家，如果没有则匹配通用专家
    const sql = `
      SELECT id, name, title, role, domains, expertise_level, system_prompt, bio,
             (
               SELECT COUNT(*) FROM unnest(domains) d
               WHERE d = ANY($2)
             ) as match_count
      FROM expert_library
      WHERE is_active = true
        AND role = $1
        AND domains && $2
      ORDER BY
        CASE WHEN id LIKE 'expert_general_%' THEN 0 ELSE 1 END DESC,
        expertise_level DESC,
        match_count DESC
      LIMIT 1
    `;

    const result = await query(sql, [role, keywords]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // 回退到默认专家
    return this.getDefaultExpert(role);
  }

  /**
   * 获取默认专家（通用专家）
   */
  private async getDefaultExpert(role: ExpertRole): Promise<Expert | null> {
    const sql = `
      SELECT id, name, title, role, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true
        AND role = $1
        AND id LIKE 'expert_%_${role.substring(0, 4)}%'
      ORDER BY expertise_level DESC
      LIMIT 1
    `;

    const result = await query(sql, [role]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // 如果找不到特定默认专家，找该角色的任何专家
    const fallbackSql = `
      SELECT id, name, title, role, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true AND role = $1
      ORDER BY expertise_level DESC
      LIMIT 1
    `;

    const fallbackResult = await query(fallbackSql, [role]);
    return fallbackResult.rows[0] || null;
  }

  /**
   * 获取通用专家
   */
  private async getGeneralExperts(roles: ExpertRole[]): Promise<Expert[]> {
    const sql = `
      SELECT id, name, title, role, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true
        AND id LIKE 'expert_general_%'
        AND role = ANY($1)
      ORDER BY role, expertise_level DESC
    `;

    const result = await query(sql, [roles]);
    return result.rows;
  }

  /**
   * 获取专家统计信息
   */
  async getExpertStats(): Promise<{
    total: number;
    byRole: Record<ExpertRole, number>;
    byDomain: Record<string, number>;
  }> {
    const totalSql = `SELECT COUNT(*) as count FROM expert_library WHERE is_active = true`;
    const totalResult = await query(totalSql);

    const byRoleSql = `
      SELECT role, COUNT(*) as count
      FROM expert_library
      WHERE is_active = true
      GROUP BY role
    `;
    const byRoleResult = await query(byRoleSql);

    const byDomainSql = `
      SELECT unnest(domains) as domain, COUNT(*) as count
      FROM expert_library
      WHERE is_active = true
      GROUP BY unnest(domains)
      ORDER BY count DESC
      LIMIT 10
    `;
    const byDomainResult = await query(byDomainSql);

    return {
      total: parseInt(totalResult.rows[0].count),
      byRole: byRoleResult.rows.reduce((acc, row) => {
        acc[row.role] = parseInt(row.count);
        return acc;
      }, {} as Record<ExpertRole, number>),
      byDomain: byDomainResult.rows.reduce((acc, row) => {
        acc[row.domain] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

// 单例导出
export const expertLibrary = new ExpertLibraryService();

// ===== 10种典型读者画像 (Reader Personas) =====
// 用于读者测试功能，模拟不同背景的读者群体

export interface ReaderPersona extends Expert {
  persona_type: string;      // 读者类型标签
  reading_habits: string;    // 阅读习惯
  pain_points: string[];     // 常见痛点
  preferences: string[];     // 内容偏好
}

export const READER_PERSONAS: ReaderPersona[] = [
  {
    id: 'reader_general_01',
    name: '快速浏览者',
    title: '上班族白领',
    role: 'reader_rep',
    persona_type: 'skimmer',
    domains: ['通用', '商业', '职场'],
    expertise_level: 3,
    reading_habits: '只读标题和首段，扫描式阅读',
    pain_points: ['文章太长', '开头不吸引人', '没有小标题'],
    preferences: ['列表式内容', '清晰的标题', '段落短小'],
    system_prompt: '你是一个时间紧张的上班族，习惯快速浏览文章。你只关注核心观点，如果开头30秒没有吸引到你，你就会放弃阅读。你偏好简洁、结构清晰的内容。',
    bio: '每天通勤时间阅读，注意力有限，需要快速获取信息'
  },
  {
    id: 'reader_general_02',
    name: '深度思考者',
    title: '研究者',
    role: 'reader_rep',
    persona_type: 'deep_reader',
    domains: ['学术', '研究', '分析'],
    expertise_level: 8,
    reading_habits: '仔细阅读每个段落，做笔记，查证数据',
    pain_points: ['数据来源不明', '论证不严谨', '缺乏深度'],
    preferences: ['数据支撑', '逻辑严密', '参考文献'],
    system_prompt: '你是一个严谨的学者型读者，对内容质量要求很高。你会仔细检查数据来源、论证逻辑，不能容忍事实错误和逻辑漏洞。你希望看到深入的分析和充分的证据。',
    bio: '注重内容的准确性和深度，愿意花时间仔细阅读'
  },
  {
    id: 'reader_general_03',
    name: '行业新人',
    title: '应届毕业生',
    role: 'reader_rep',
    persona_type: 'beginner',
    domains: ['职场', '入门', '教育'],
    expertise_level: 2,
    reading_habits: '慢慢读，遇到不懂的词会查，需要解释',
    pain_points: ['专业术语太多', '假设读者已懂', '没有基础解释'],
    preferences: ['术语解释', '案例说明', '循序渐进'],
    system_prompt: '你是一个刚入行的行业新人，对专业术语和背景知识不太熟悉。你需要作者解释基本概念，不喜欢被假设已经知道某些知识。你喜欢有案例、有示例的内容。',
    bio: '行业知识有限，需要更多背景信息和解释'
  },
  {
    id: 'reader_general_04',
    name: '实战派管理者',
    title: '中层管理者',
    role: 'reader_rep',
    persona_type: 'practitioner',
    domains: ['管理', '商业', '执行力'],
    expertise_level: 6,
    reading_habits: '寻找可执行的建议，跳过理论部分',
    pain_points: ['太理论化', '没有实操建议', '脱离实际'],
    preferences: ['行动清单', '案例研究', '最佳实践'],
    system_prompt: '你是一个注重执行的管理者，读文章的目的是获取可落地的建议。你不喜欢空洞的理论，希望看到具体的操作步骤、真实案例和可执行的行动计划。',
    bio: '关注内容的实用性，希望获得可落地的建议'
  },
  {
    id: 'reader_general_05',
    name: '资深从业者',
    title: '行业老兵',
    role: 'reader_rep',
    persona_type: 'expert_reader',
    domains: ['行业', '专业', '深度'],
    expertise_level: 9,
    reading_habits: '快速判断内容价值，挑剔但有建设性',
    pain_points: ['内容太浅', '陈词滥调', '缺乏新见解'],
    preferences: ['独到见解', '行业洞察', '前沿趋势'],
    system_prompt: '你是一个行业资深人士，读过大量相关内容，眼光挑剔。你能快速识别内容的原创性和价值，讨厌重复别人说过的话。你期待看到新颖的观点和深入的洞察。',
    bio: '行业经验丰富，对内容质量要求高，追求独到见解'
  },
  {
    id: 'reader_general_06',
    name: '投资决策人',
    title: '投资人',
    role: 'reader_rep',
    persona_type: 'investor',
    domains: ['投资', '金融', '商业'],
    expertise_level: 7,
    reading_habits: '关注风险和机会，重视数据和分析',
    pain_points: ['夸大收益', '忽视风险', '数据不完整'],
    preferences: ['风险评估', '市场数据', '趋势分析'],
    system_prompt: '你是一个投资人，读文章是为了评估机会和风险。你关注数据的真实性和完整性，讨厌夸大其词。你希望看到平衡的分析，包括机遇和挑战。',
    bio: '以投资视角阅读，关注风险和回报，重视数据支撑'
  },
  {
    id: 'reader_general_07',
    name: '跨界学习者',
    title: '多领域关注者',
    role: 'reader_rep',
    persona_type: 'cross_domain',
    domains: ['跨领域', '创新', '趋势'],
    expertise_level: 5,
    reading_habits: '寻找跨领域连接，类比理解',
    pain_points: ['过于专业封闭', '缺乏横向联系', '术语壁垒'],
    preferences: ['跨界案例', '类比解释', '通俗表达'],
    system_prompt: '你是一个喜欢跨领域学习的读者，经常将不同领域的知识联系起来。你需要作者用通俗的语言解释专业概念，喜欢类比和跨领域的案例。你讨厌过于封闭的专业术语。',
    bio: '喜欢跨领域学习，需要通俗易懂的解释'
  },
  {
    id: 'reader_general_08',
    name: '数据敏感者',
    title: '数据分析师',
    role: 'reader_rep',
    persona_type: 'data_driven',
    domains: ['数据', '分析', '量化'],
    expertise_level: 7,
    reading_habits: '先看图表和数据，验证逻辑',
    pain_points: ['没有数据支撑', '统计方法存疑', '数字不准确'],
    preferences: ['可视化', '数据完整', '方法论透明'],
    system_prompt: '你是一个数据驱动的读者，对数字特别敏感。你会仔细检查数据的来源、统计方法和呈现方式。没有数据支撑的观点很难说服你。你喜欢清晰的可视化和透明的分析方法。',
    bio: '数据敏感，重视统计和证据，喜欢可视化呈现'
  },
  {
    id: 'reader_general_09',
    name: '批判质疑者',
    title: '审慎观察者',
    role: 'reader_rep',
    persona_type: 'skeptic',
    domains: ['批判', '逻辑', '验证'],
    expertise_level: 6,
    reading_habits: '质疑作者动机，寻找漏洞和偏见',
    pain_points: ['一面之词', '选择性呈现', '利益冲突不明'],
    preferences: ['平衡观点', '反方论证', '透明立场'],
    system_prompt: '你是一个天生的怀疑论者，对任何观点都持保留态度。你会寻找作者的潜在偏见和逻辑漏洞，不喜欢一面之词的内容。你欣赏作者能呈现反方观点和承认局限性。',
    bio: '持怀疑态度，喜欢寻找漏洞，欣赏平衡的观点'
  },
  {
    id: 'reader_general_10',
    name: '故事爱好者',
    title: '叙事偏好读者',
    role: 'reader_rep',
    persona_type: 'story_lover',
    domains: ['故事', '人文', '叙事'],
    expertise_level: 4,
    reading_habits: '通过故事理解概念，喜欢人物和情节',
    pain_points: ['干巴巴的理论', '缺乏人情味', '没有案例'],
    preferences: ['人物故事', '叙事结构', '情感连接'],
    system_prompt: '你是一个喜欢通过故事学习的读者。抽象的概念很难打动你，但一个好故事能让你记住一辈子。你需要作者用具体的案例、人物和情节来说明观点，讨厌干巴巴的理论堆砌。',
    bio: '通过故事理解世界，喜欢有人情味的内容'
  }
];

/**
 * 获取读者画像列表
 */
export function getReaderPersonas(): ReaderPersona[] {
  return READER_PERSONAS;
}

/**
 * 根据ID获取读者画像
 */
export function getReaderPersonaById(id: string): ReaderPersona | undefined {
  return READER_PERSONAS.find(p => p.id === id);
}

/**
 * 随机选择N个读者画像用于测试
 */
export function selectRandomReaders(count: number): ReaderPersona[] {
  const shuffled = [...READER_PERSONAS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
