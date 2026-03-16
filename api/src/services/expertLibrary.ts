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
