// Expert Library Service - 专家库管理
// 支持: 动态专家匹配、领域推荐

import { query } from '../db/connection.js';

export interface Expert {
  id: string;
  name: string;
  title: string;
  angle: 'challenger' | 'expander' | 'synthesizer';
  domains: string[];
  expertise_level: number;
  system_prompt: string;
  bio?: string;
}

export class ExpertLibraryService {
  // 根据主题匹配专家
  async matchExperts(topic: string, count: number = 3): Promise<Expert[]> {
    // 提取主题关键词
    const keywords = this.extractKeywords(topic);
    console.log('[ExpertLibrary] Matching experts for topic:', topic);
    console.log('[ExpertLibrary] Extracted keywords:', keywords);

    // 查询匹配的专家（每个角度选一个）
    const experts: Expert[] = [];
    const angles = ['challenger', 'expander', 'synthesizer'];

    for (const angle of angles) {
      const expert = await this.findBestExpert(keywords, angle);
      if (expert) {
        experts.push(expert);
      }
    }

    // 如果匹配不到足够专家，补充通用专家
    if (experts.length < count) {
      const generalExperts = await this.getGeneralExperts(
        angles.filter(a => !experts.some(e => e.angle === a))
      );
      experts.push(...generalExperts);
    }

    return experts.slice(0, count);
  }

  // 获取所有专家列表
  async listExperts(options?: { angle?: string; domain?: string }): Promise<Expert[]> {
    let sql = `
      SELECT id, name, title, angle, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true
    `;
    const params: any[] = [];

    if (options?.angle) {
      sql += ` AND angle = $${params.length + 1}`;
      params.push(options.angle);
    }

    if (options?.domain) {
      sql += ` AND domains && ARRAY[$${params.length + 1}]`;
      params.push(options.domain);
    }

    sql += ` ORDER BY expertise_level DESC, name`;

    const result = await query(sql, params);
    return result.rows;
  }

  // 提取主题关键词
  private extractKeywords(topic: string): string[] {
    // 预定义的领域关键词库
    const domainKeywords: Record<string, string[]> = {
      '房地产': ['房地产', '房产', '住房', '住宅', '楼宇', '物业', 'REITs', 'reits'],
      '保租房': ['保租房', '保障性租赁住房', '租赁住房', '公租房', '保障房'],
      '金融科技': ['金融科技', '智能理财', '财富管理', '数字化', '科技金融'],
      '政策': ['政策', '监管', '法规', '意见', '通知', '办法'],
      '资本市场': ['资本', '证券', '上市', 'IPO', '股市', '基金'],
      '宏观经济': ['宏观', '经济', 'GDP', '增长', '周期', '通胀']
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

  // 查找最佳匹配专家
  private async findBestExpert(keywords: string[], angle: string): Promise<Expert | null> {
    if (keywords.length === 0) {
      return this.getDefaultExpert(angle);
    }

    // 使用 overlap 操作符检查是否有共同元素
    const sql = `
      SELECT id, name, title, angle, domains, expertise_level, system_prompt, bio,
             (
               SELECT COUNT(*) FROM unnest(domains) d
               WHERE d = ANY($2)
             ) as match_count
      FROM expert_library
      WHERE is_active = true
        AND angle = $1
        AND domains && $2
      ORDER BY expertise_level DESC, match_count DESC
      LIMIT 1
    `;

    const result = await query(sql, [angle, keywords]);

    if (result.rows.length > 0) {
      console.log(`[ExpertLibrary] Matched ${angle}: ${result.rows[0].name}`);
      return result.rows[0];
    }

    // 回退到默认专家
    return this.getDefaultExpert(angle);
  }

  // 获取通用专家
  private async getGeneralExperts(angles: string[]): Promise<Expert[]> {
    const sql = `
      SELECT id, name, title, angle, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true
        AND id LIKE 'expert_general_%'
        AND angle = ANY($1)
      ORDER BY expertise_level DESC
    `;

    const result = await query(sql, [angles]);
    return result.rows;
  }

  // 获取默认专家
  private async getDefaultExpert(angle: string): Promise<Expert | null> {
    const sql = `
      SELECT id, name, title, angle, domains, expertise_level, system_prompt, bio
      FROM expert_library
      WHERE is_active = true
        AND id = $1
      LIMIT 1
    `;

    const defaultIds: Record<string, string> = {
      challenger: 'expert_general_challenger',
      expander: 'expert_general_expander',
      synthesizer: 'expert_general_synthesizer'
    };

    const result = await query(sql, [defaultIds[angle]]);
    return result.rows[0] || null;
  }
}

// 单例导出
export const expertLibrary = new ExpertLibraryService();
