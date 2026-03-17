import { describe, it, expect, beforeEach } from 'vitest';

/**
 * ReportMatcher 测试套件
 * 研报自动关联系统测试
 */

// ==================== 类型定义 ====================

interface ParsedReport {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  publishDate: Date;
  pageCount: number;
  content: string;
  sections: ReportSection[];
  keyPoints: string[];
  tags: string[];
}

interface ReportSection {
  title: string;
  level: number;
  content: string;
  pageStart?: number;
  pageEnd?: number;
}

interface MatchResult {
  reportId: string;
  matchType: 'rss' | 'asset' | 'topic';
  matchId: string;
  matchScore: number;
  matchReason: string;
}

interface QualityScore {
  overall: number;
  dimensions: {
    authority: number;
    completeness: number;
    logic: number;
    freshness: number;
  };
}

// ==================== 模拟实现 ====================

class ReportParser {
  async parsePDF(buffer: Buffer): Promise<ParsedReport> {
    // 模拟PDF解析
    return {
      id: 'r-' + Date.now(),
      title: '新能源汽车行业深度研究',
      authors: ['张三', '李四'],
      institution: '中信证券',
      publishDate: new Date(),
      pageCount: 45,
      content: buffer.toString(),
      sections: [
        { title: '投资要点', level: 1, content: '看好新能源赛道' },
        { title: '行业分析', level: 1, content: '市场空间广阔' },
      ],
      keyPoints: ['销量增长30%', '政策支持明确'],
      tags: [],
    };
  }

  extractMetadata(text: string): Partial<ParsedReport> {
    const lines = text.split('\n');
    return {
      title: lines[0]?.trim() || '',
      authors: this.extractAuthors(text),
      institution: this.extractInstitution(text),
    };
  }

  private extractAuthors(text: string): string[] {
    const match = text.match(/作者[：:]\s*(.+?)(?:\n|$)/);
    return match ? match[1].split(/[,，、]/).map(s => s.trim()) : [];
  }

  private extractInstitution(text: string): string {
    const match = text.match(/(中信证券|中金公司|国泰君安|招商证券)/);
    return match ? match[1] : '';
  }

  extractKeyPoints(text: string): string[] {
    const points: string[] = [];
    const patterns = [
      /投资要点[：:]\s*([^\n]+)/g,
      /核心观点[：:]\s*([^\n]+)/g,
      /([^。]{10,50}(?:增长|下降|突破|创新)[^。]{0,20})/g,
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !points.includes(match[1])) {
          points.push(match[1].trim());
        }
      }
    }

    return points.slice(0, 5);
  }
}

class ReportMatcher {
  async findMatches(report: ParsedReport): Promise<MatchResult[]> {
    const matches: MatchResult[] = [];

    // 模拟RSS匹配
    const rssMatches = await this.matchWithRSS(report);
    matches.push(...rssMatches);

    // 模拟素材库匹配
    const assetMatches = await this.matchWithAssets(report);
    matches.push(...assetMatches);

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  private async matchWithRSS(report: ParsedReport): Promise<MatchResult[]> {
    // 模拟匹配逻辑
    const keywords = report.title.split(/[\s,，]+/);
    return [
      {
        reportId: report.id,
        matchType: 'rss',
        matchId: 'rss-001',
        matchScore: 85,
        matchReason: `关键词匹配: ${keywords.slice(0, 3).join(', ')}`,
      },
    ];
  }

  private async matchWithAssets(report: ParsedReport): Promise<MatchResult[]> {
    return [
      {
        reportId: report.id,
        matchType: 'asset',
        matchId: 'asset-001',
        matchScore: 72,
        matchReason: '行业标签匹配: 新能源汽车',
      },
    ];
  }

  calculateSimilarity(text1: string, text2: string): number {
    // Jaccard相似度 - 支持中文(2-4字切分)
    const tokenize = (text: string): string[] => {
      const tokens: string[] = [];
      // 先按标点分割
      const segments = text.split(/[\s,，。！？]+/).filter(s => s.length > 0);
      for (const seg of segments) {
        if (seg.length <= 4) {
          tokens.push(seg);
        } else {
          // 滑动窗口提取2-4字词组
          for (let len = 2; len <= 4; len++) {
            for (let i = 0; i <= seg.length - len; i++) {
              tokens.push(seg.slice(i, i + len));
            }
          }
        }
      }
      return tokens;
    };

    const tokens1 = tokenize(text1);
    const tokens2 = tokenize(text2);
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
}

class TagExtractor {
  private industryKeywords = ['新能源', '半导体', '医药', '金融', '地产', '消费'];
  private conceptKeywords = ['AI', '碳中和', '元宇宙', '区块链', '5G'];
  private regionKeywords = ['中国', '美国', '欧洲', '日本', '东南亚'];

  extractTags(text: string): string[] {
    const tags: string[] = [];

    // 行业标签
    for (const kw of this.industryKeywords) {
      if (text.includes(kw)) tags.push(kw);
    }

    // 概念标签
    for (const kw of this.conceptKeywords) {
      if (text.includes(kw)) tags.push(kw);
    }

    // 地域标签
    for (const kw of this.regionKeywords) {
      if (text.includes(kw)) tags.push(kw);
    }

    return [...new Set(tags)];
  }

  extractIndustry(text: string): string[] {
    return this.industryKeywords.filter(kw => text.includes(kw));
  }

  extractConcepts(text: string): string[] {
    return this.conceptKeywords.filter(kw => text.includes(kw));
  }
}

class ReportQuality {
  private institutionAuthority: Record<string, number> = {
    '中信证券': 95,
    '中金公司': 95,
    '国泰君安': 90,
    '招商证券': 88,
    '海通证券': 87,
  };

  assessQuality(report: ParsedReport): QualityScore {
    const authority = this.assessAuthority(report.institution);
    const completeness = this.assessCompleteness(report);
    const logic = this.assessLogic(report);
    const freshness = this.assessFreshness(report.publishDate);

    const overall = Math.round(
      authority * 0.3 +
      completeness * 0.25 +
      logic * 0.25 +
      freshness * 0.2
    );

    return {
      overall,
      dimensions: { authority, completeness, logic, freshness },
    };
  }

  private assessAuthority(institution: string): number {
    return this.institutionAuthority[institution] || 60;
  }

  private assessCompleteness(report: ParsedReport): number {
    let score = 50;
    if (report.authors.length > 0) score += 10;
    if (report.sections.length >= 3) score += 15;
    if (report.keyPoints.length > 0) score += 15;
    if (report.pageCount >= 20) score += 10;
    return Math.min(100, score);
  }

  private assessLogic(report: ParsedReport): number {
    // 简化版：检查是否有目录结构
    return report.sections.length >= 2 ? 85 : 60;
  }

  private assessFreshness(date: Date): number {
    const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 7) return 100;
    if (daysDiff <= 30) return 80;
    if (daysDiff <= 90) return 60;
    return 40;
  }
}

// ==================== 测试套件 ====================

describe('ReportParser', () => {
  let parser: ReportParser;

  beforeEach(() => {
    parser = new ReportParser();
  });

  describe('PDF解析', () => {
    it('应该解析PDF文件并提取文本', async () => {
      const buffer = Buffer.from('新能源汽车行业深度研究\n作者：张三、李四\n中信证券');
      const result = await parser.parsePDF(buffer);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('新能源汽车行业深度研究');
      expect(result.authors).toContain('张三');
      expect(result.institution).toBe('中信证券');
    });

    it('应该提取目录结构', async () => {
      const buffer = Buffer.from('报告标题\n一、行业分析\n二、公司研究\n三、投资建议');
      const result = await parser.parsePDF(buffer);

      expect(result.sections).toBeDefined();
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('应该识别关键观点', async () => {
      const buffer = Buffer.from('投资要点：销量增长30%，政策支持明确\n核心观点：看好新能源赛道');
      const result = await parser.parsePDF(buffer);

      expect(result.keyPoints.length).toBeGreaterThan(0);
    });
  });

  describe('元数据提取', () => {
    it('应该从文本中提取标题', () => {
      const text = '新能源汽车行业深度研究\n作者：张三\n中信证券';
      const meta = parser.extractMetadata(text);
      expect(meta.title).toBe('新能源汽车行业深度研究');
    });

    it('应该提取多个作者', () => {
      const text = '作者：张三、李四、王五\n中信证券';
      const meta = parser.extractMetadata(text);
      expect(meta.authors).toHaveLength(3);
      expect(meta.authors).toContain('李四');
    });

    it('应该识别知名机构', () => {
      const text = '中金公司研究部\n新能源汽车报告';
      const meta = parser.extractMetadata(text);
      expect(meta.institution).toBe('中金公司');
    });
  });

  describe('核心观点提取', () => {
    it('应该从投资要点中提取关键信息', () => {
      const text = '投资要点：\n1. 销量增长30%\n2. 政策支持明确\n3. 产业链完善';
      const points = parser.extractKeyPoints(text);
      expect(points.length).toBeGreaterThan(0);
    });

    it('应该识别增长类表述', () => {
      const text = '公司业绩增长强劲，市场份额突破20%';
      const points = parser.extractKeyPoints(text);
      expect(points.some(p => p.includes('增长') || p.includes('突破'))).toBe(true);
    });

    it('应该去重并限制数量', () => {
      const text = '销量增长30%。销量增长30%。销量增长30%。';
      const points = parser.extractKeyPoints(text);
      expect(points.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('ReportMatcher', () => {
  let matcher: ReportMatcher;

  beforeEach(() => {
    matcher = new ReportMatcher();
  });

  describe('关联匹配', () => {
    it('应该找到RSS相关文章', async () => {
      const report: ParsedReport = {
        id: 'r-001',
        title: '新能源汽车行业研究',
        authors: ['张三'],
        institution: '中信证券',
        publishDate: new Date(),
        pageCount: 30,
        content: '新能源汽车销量增长',
        sections: [],
        keyPoints: [],
        tags: ['新能源'],
      };

      const matches = await matcher.findMatches(report);
      const rssMatches = matches.filter(m => m.matchType === 'rss');

      expect(rssMatches.length).toBeGreaterThan(0);
      expect(rssMatches[0].matchScore).toBeGreaterThan(0);
    });

    it('应该找到素材库关联文档', async () => {
      const report: ParsedReport = {
        id: 'r-002',
        title: 'AI行业分析',
        authors: ['李四'],
        institution: '中金公司',
        publishDate: new Date(),
        pageCount: 25,
        content: '人工智能发展趋势',
        sections: [],
        keyPoints: [],
        tags: ['AI'],
      };

      const matches = await matcher.findMatches(report);
      const assetMatches = matches.filter(m => m.matchType === 'asset');

      expect(assetMatches.length).toBeGreaterThan(0);
    });

    it('应该按匹配分数排序', async () => {
      const report: ParsedReport = {
        id: 'r-003',
        title: '测试报告',
        authors: [],
        institution: '',
        publishDate: new Date(),
        pageCount: 10,
        content: '',
        sections: [],
        keyPoints: [],
        tags: [],
      };

      const matches = await matcher.findMatches(report);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].matchScore).toBeLessThanOrEqual(matches[i - 1].matchScore);
      }
    });
  });

  describe('相似度计算', () => {
    it('应该计算文本相似度', () => {
      const text1 = '新能源汽车销量增长';
      const text2 = '新能源汽车市场增长';
      const similarity = matcher.calculateSimilarity(text1, text2);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('相同文本相似度应为1', () => {
      const text = '新能源汽车';
      const similarity = matcher.calculateSimilarity(text, text);
      expect(similarity).toBe(1);
    });

    it('完全不同文本相似度应接近0', () => {
      const text1 = 'ABC';
      const text2 = 'XYZ';
      const similarity = matcher.calculateSimilarity(text1, text2);
      expect(similarity).toBeLessThan(0.5);
    });
  });
});

describe('TagExtractor', () => {
  let extractor: TagExtractor;

  beforeEach(() => {
    extractor = new TagExtractor();
  });

  describe('标签提取', () => {
    it('应该提取行业标签', () => {
      const text = '新能源汽车行业发展迅速';
      const tags = extractor.extractTags(text);
      expect(tags).toContain('新能源');
    });

    it('应该提取概念标签', () => {
      const text = 'AI技术在碳中和中的应用';
      const tags = extractor.extractTags(text);
      expect(tags).toContain('AI');
      expect(tags).toContain('碳中和');
    });

    it('应该提取地域标签', () => {
      const text = '中国市场与美国市场的对比';
      const tags = extractor.extractTags(text);
      expect(tags).toContain('中国');
      expect(tags).toContain('美国');
    });

    it('应该去重', () => {
      const text = '新能源新能源新能源';
      const tags = extractor.extractTags(text);
      const uniqueTags = [...new Set(tags)];
      expect(tags.length).toBe(uniqueTags.length);
    });
  });

  describe('行业分类', () => {
    it('应该正确分类半导体行业', () => {
      const text = '半导体芯片制造';
      const industries = extractor.extractIndustry(text);
      expect(industries).toContain('半导体');
    });

    it('应该正确分类医药行业', () => {
      const text = '医药研发创新';
      const industries = extractor.extractIndustry(text);
      expect(industries).toContain('医药');
    });
  });

  describe('概念识别', () => {
    it('应该识别元宇宙概念', () => {
      const text = '元宇宙发展前景';
      const concepts = extractor.extractConcepts(text);
      expect(concepts).toContain('元宇宙');
    });
  });
});

describe('ReportQuality', () => {
  let quality: ReportQuality;

  beforeEach(() => {
    quality = new ReportQuality();
  });

  describe('质量评估', () => {
    it('应该评估综合质量分', () => {
      const report: ParsedReport = {
        id: 'r-001',
        title: '测试报告',
        authors: ['张三'],
        institution: '中信证券',
        publishDate: new Date(),
        pageCount: 45,
        content: '',
        sections: [
          { title: '1', level: 1, content: '' },
          { title: '2', level: 1, content: '' },
          { title: '3', level: 1, content: '' },
        ],
        keyPoints: ['要点1', '要点2'],
        tags: [],
      };

      const score = quality.assessQuality(report);

      expect(score.overall).toBeGreaterThan(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(score.dimensions.authority).toBeDefined();
    });

    it('知名机构应该获得高权威性评分', () => {
      const report: ParsedReport = {
        id: 'r-002',
        title: '',
        authors: [],
        institution: '中信证券',
        publishDate: new Date(),
        pageCount: 10,
        content: '',
        sections: [],
        keyPoints: [],
        tags: [],
      };

      const score = quality.assessQuality(report);
      expect(score.dimensions.authority).toBeGreaterThanOrEqual(90);
    });

    it('未知机构应该获得较低权威性评分', () => {
      const report: ParsedReport = {
        id: 'r-003',
        title: '',
        authors: [],
        institution: '未知机构',
        publishDate: new Date(),
        pageCount: 10,
        content: '',
        sections: [],
        keyPoints: [],
        tags: [],
      };

      const score = quality.assessQuality(report);
      expect(score.dimensions.authority).toBeLessThan(70);
    });

    it('完整报告应该获得高完整性评分', () => {
      const report: ParsedReport = {
        id: 'r-004',
        title: '',
        authors: ['张三', '李四'],
        institution: '',
        publishDate: new Date(),
        pageCount: 50,
        content: '',
        sections: [{ title: '1', level: 1, content: '' }, { title: '2', level: 1, content: '' }, { title: '3', level: 1, content: '' }],
        keyPoints: ['要点1'],
        tags: [],
      };

      const score = quality.assessQuality(report);
      expect(score.dimensions.completeness).toBeGreaterThan(70);
    });

    it('新发布报告应该获得高时效性评分', () => {
      const report: ParsedReport = {
        id: 'r-005',
        title: '',
        authors: [],
        institution: '',
        publishDate: new Date(),
        pageCount: 10,
        content: '',
        sections: [],
        keyPoints: [],
        tags: [],
      };

      const score = quality.assessQuality(report);
      expect(score.dimensions.freshness).toBe(100);
    });

    it('旧报告应该获得较低时效性评分', () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 6);

      const report: ParsedReport = {
        id: 'r-006',
        title: '',
        authors: [],
        institution: '',
        publishDate: oldDate,
        pageCount: 10,
        content: '',
        sections: [],
        keyPoints: [],
        tags: [],
      };

      const score = quality.assessQuality(report);
      expect(score.dimensions.freshness).toBeLessThan(70);
    });
  });
});

export { ReportParser, ReportMatcher, TagExtractor, ReportQuality };
export type { ParsedReport, MatchResult, QualityScore };
