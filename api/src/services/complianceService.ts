// v4.0 智能审核与合规服务
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface ComplianceRule {
  id: string;
  category: 'sensitive' | 'ad_law' | 'copyright' | 'privacy';
  ruleType: 'keyword' | 'regex' | 'semantic';
  pattern: string;
  level: 'strict' | 'warning' | 'info';
  suggestion?: string;
  description?: string;
  examples?: string[];
  isEnabled: boolean;
}

export interface ComplianceIssue {
  ruleId: string;
  category: string;
  level: 'strict' | 'warning' | 'info';
  message: string;
  position?: { start: number; end: number };
  matchedText: string;
  suggestion?: string;
}

export interface ComplianceResult {
  contentId: string;
  overallScore: number;
  passed: boolean;
  issues: ComplianceIssue[];
  categoryScores: {
    sensitive: number;
    adLaw: number;
    copyright: number;
    privacy: number;
  };
  checkedAt: Date;
}

export interface ComplianceConfig {
  enableComplianceCheck: boolean;
  sensitiveWordsLevel: 'strict' | 'standard' | 'relaxed';
  adLawCheck: boolean;
  copyrightCheck: boolean;
  privacyCheck: boolean;
  autoBlockOnFail: boolean;
  minScoreToPass: number;
}

// 敏感词检测引擎（AC自动机）
class SensitiveWordEngine {
  private patterns: Map<string, ComplianceRule> = new Map();

  async loadRules(category?: string): Promise<void> {
    const result = await query(
      `SELECT * FROM compliance_rules
       WHERE is_enabled = true ${category ? 'AND category = $1' : ''}`,
      category ? [category] : []
    );

    this.patterns.clear();
    for (const row of result.rows) {
      this.patterns.set(row.pattern, this.formatRule(row));
    }
  }

  detect(content: string): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];

    for (const [pattern, rule] of this.patterns) {
      const matches = this.findMatches(content, pattern, rule.ruleType);
      for (const match of matches) {
        issues.push({
          ruleId: rule.id,
          category: rule.category,
          level: rule.level,
          message: rule.description || `${rule.category} 违规`,
          position: match.position,
          matchedText: match.text,
          suggestion: rule.suggestion
        });
      }
    }

    return issues;
  }

  private findMatches(content: string, pattern: string, type: string): Array<{ text: string; position: { start: number; end: number } }> {
    const matches: Array<{ text: string; position: { start: number; end: number } }> = [];

    if (type === 'keyword') {
      // 关键词匹配
      const keywords = pattern.split('|');
      for (const keyword of keywords) {
        let pos = 0;
        while ((pos = content.indexOf(keyword, pos)) !== -1) {
          matches.push({
            text: keyword,
            position: { start: pos, end: pos + keyword.length }
          });
          pos += keyword.length;
        }
      }
    } else if (type === 'regex') {
      // 正则匹配
      try {
        const regex = new RegExp(pattern, 'gi');
        let match;
        while ((match = regex.exec(content)) !== null) {
          matches.push({
            text: match[0],
            position: { start: match.index, end: match.index + match[0].length }
          });
        }
      } catch (e) {
        console.error('Invalid regex pattern:', pattern);
      }
    }

    return matches;
  }

  private formatRule(row: any): ComplianceRule {
    return {
      id: row.id,
      category: row.category,
      ruleType: row.rule_type,
      pattern: row.pattern,
      level: row.level,
      suggestion: row.suggestion,
      description: row.description,
      examples: typeof row.examples === 'string' ? JSON.parse(row.examples) : row.examples,
      isEnabled: row.is_enabled
    };
  }
}

// 合规服务
export class ComplianceService {
  private engine: SensitiveWordEngine;

  constructor() {
    this.engine = new SensitiveWordEngine();
  }

  // 执行完整合规检查
  async checkContent(
    contentId: string,
    content: string,
    config: Partial<ComplianceConfig> = {}
  ): Promise<ComplianceResult> {
    const fullConfig: ComplianceConfig = {
      enableComplianceCheck: true,
      sensitiveWordsLevel: 'strict',
      adLawCheck: true,
      copyrightCheck: true,
      privacyCheck: true,
      autoBlockOnFail: false,
      minScoreToPass: 70,
      ...config
    };

    if (!fullConfig.enableComplianceCheck) {
      return {
        contentId,
        overallScore: 100,
        passed: true,
        issues: [],
        categoryScores: { sensitive: 100, adLaw: 100, copyright: 100, privacy: 100 },
        checkedAt: new Date()
      };
    }

    // 加载规则
    await this.engine.loadRules();

    // 检测问题
    const issues = this.engine.detect(content);

    // 计算分数
    const categoryScores = this.calculateCategoryScores(issues, content.length);
    const overallScore = Math.round(
      (categoryScores.sensitive + categoryScores.adLaw +
       categoryScores.copyright + categoryScores.privacy) / 4
    );

    // 判断是否通过
    const strictIssues = issues.filter(i => i.level === 'strict');
    const passed = overallScore >= fullConfig.minScoreToPass &&
                   (!fullConfig.autoBlockOnFail || strictIssues.length === 0);

    // 记录日志
    await this.logCheck(contentId, 'draft', issues, overallScore, passed);

    return {
      contentId,
      overallScore,
      passed,
      issues,
      categoryScores,
      checkedAt: new Date()
    };
  }

  // 快速检查（不记录日志）
  async quickCheck(content: string): Promise<ComplianceResult> {
    await this.engine.loadRules();
    const issues = this.engine.detect(content);
    const categoryScores = this.calculateCategoryScores(issues, content.length);
    const overallScore = Math.round(
      (categoryScores.sensitive + categoryScores.adLaw +
       categoryScores.copyright + categoryScores.privacy) / 4
    );

    return {
      contentId: 'quick-check',
      overallScore,
      passed: overallScore >= 70,
      issues,
      categoryScores,
      checkedAt: new Date()
    };
  }

  // 自动修复建议
  async suggestFixes(content: string, issues: ComplianceIssue[]): Promise<string> {
    let fixed = content;

    // 按位置倒序排序，避免替换后位置变化
    const sortedIssues = [...issues].sort((a, b) =>
      (b.position?.start || 0) - (a.position?.start || 0)
    );

    for (const issue of sortedIssues) {
      if (issue.position && issue.suggestion) {
        const before = fixed.slice(0, issue.position.start);
        const after = fixed.slice(issue.position.end);
        fixed = before + issue.suggestion + after;
      }
    }

    return fixed;
  }

  // 获取规则列表
  async getRules(category?: string): Promise<ComplianceRule[]> {
    const result = await query(
      `SELECT * FROM compliance_rules
       ${category ? 'WHERE category = $1' : ''}
       ORDER BY category, created_at`,
      category ? [category] : []
    );

    return result.rows.map(row => ({
      id: row.id,
      category: row.category,
      ruleType: row.rule_type,
      pattern: row.pattern,
      level: row.level,
      suggestion: row.suggestion,
      description: row.description,
      examples: typeof row.examples === 'string' ? JSON.parse(row.examples) : row.examples,
      isEnabled: row.is_enabled
    }));
  }

  // 添加规则
  async addRule(rule: Omit<ComplianceRule, 'id'>): Promise<ComplianceRule> {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO compliance_rules
       (id, category, rule_type, pattern, level, suggestion, description, examples, is_enabled, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [id, rule.category, rule.ruleType, rule.pattern, rule.level,
       rule.suggestion, rule.description, JSON.stringify(rule.examples || []), rule.isEnabled]
    );

    return this.formatRule(result.rows[0]);
  }

  // 更新规则
  async updateRule(id: string, updates: Partial<ComplianceRule>): Promise<ComplianceRule | null> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.pattern) {
      sets.push(`pattern = $${values.length + 1}`);
      values.push(updates.pattern);
    }
    if (updates.level) {
      sets.push(`level = $${values.length + 1}`);
      values.push(updates.level);
    }
    if (updates.suggestion !== undefined) {
      sets.push(`suggestion = $${values.length + 1}`);
      values.push(updates.suggestion);
    }
    if (updates.isEnabled !== undefined) {
      sets.push(`is_enabled = $${values.length + 1}`);
      values.push(updates.isEnabled);
    }

    if (sets.length === 0) return this.getRule(id);

    values.push(id);
    const result = await query(
      `UPDATE compliance_rules SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING *`,
      values
    );

    return result.rows[0] ? this.formatRule(result.rows[0]) : null;
  }

  // 获取单条规则
  async getRule(id: string): Promise<ComplianceRule | null> {
    const result = await query(`SELECT * FROM compliance_rules WHERE id = $1`, [id]);
    return result.rows[0] ? this.formatRule(result.rows[0]) : null;
  }

  // 删除规则
  async deleteRule(id: string): Promise<boolean> {
    const result = await query(`DELETE FROM compliance_rules WHERE id = $1 RETURNING id`, [id]);
    return result.rows.length > 0;
  }

  // 获取检测历史
  async getCheckHistory(contentId?: string, limit: number = 50): Promise<any[]> {
    const result = await query(
      `SELECT * FROM compliance_logs
       ${contentId ? 'WHERE content_id = $1' : ''}
       ORDER BY checked_at DESC
       LIMIT $${contentId ? 2 : 1}`,
      contentId ? [contentId, limit] : [limit]
    );

    return result.rows;
  }

  // 计算分类分数
  private calculateCategoryScores(issues: ComplianceIssue[], contentLength: number): {
    sensitive: number;
    adLaw: number;
    copyright: number;
    privacy: number;
  } {
    const baseScore = 100;
    const categories = ['sensitive', 'ad_law', 'copyright', 'privacy'];
    const scores: any = {};

    for (const cat of categories) {
      const catIssues = issues.filter(i => i.category === cat);
      const strictCount = catIssues.filter(i => i.level === 'strict').length;
      const warningCount = catIssues.filter(i => i.level === 'warning').length;

      // 严重问题扣20分，警告扣5分
      scores[cat === 'ad_law' ? 'adLaw' : cat] = Math.max(0,
        baseScore - strictCount * 20 - warningCount * 5
      );
    }

    return scores;
  }

  // 记录检测日志
  private async logCheck(
    contentId: string,
    contentType: string,
    issues: ComplianceIssue[],
    overallScore: number,
    passed: boolean
  ): Promise<void> {
    await query(
      `INSERT INTO compliance_logs
       (id, content_id, content_type, check_type, result, overall_score, passed, issues_count, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [uuidv4(), contentId, contentType, 'full', JSON.stringify(issues), overallScore, passed, issues.length]
    );
  }

  private formatRule(row: any): ComplianceRule {
    return {
      id: row.id,
      category: row.category,
      ruleType: row.rule_type,
      pattern: row.pattern,
      level: row.level,
      suggestion: row.suggestion,
      description: row.description,
      examples: typeof row.examples === 'string' ? JSON.parse(row.examples) : row.examples,
      isEnabled: row.is_enabled
    };
  }
}

export const complianceService = new ComplianceService();
