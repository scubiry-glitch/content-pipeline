// autoTagService.ts
// v3.0.3: 智能标签补全服务 - Initial Version

import { assetsApi } from '../api/client';
import type { Asset } from '../api/client';

export interface TagSuggestion {
  tag: string;
  confidence: number;
  source: 'title' | 'content' | 'source' | 'ml';
}

class AutoTagService {
  private static instance: AutoTagService;

  static getInstance(): AutoTagService {
    if (!AutoTagService.instance) {
      AutoTagService.instance = new AutoTagService();
    }
    return AutoTagService.instance;
  }

  // 自动提取标签（客户端备用方案）- v3.0.3: 简单实现
  extractTagsFromTitle(title: string): string[] {
    const tags: string[] = [];

    // 提取行业关键词
    const industryKeywords = [
      '新能源', '半导体', '人工智能', 'AI', '芯片', '电动车',
      '光伏', '储能', '电池', '医疗', '医药', '金融',
      '房地产', '消费', '零售', '制造', '科技', '互联网'
    ];

    industryKeywords.forEach(keyword => {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        tags.push(keyword);
      }
    });

    // 提取年份
    const yearMatch = title.match(/20\d{2}/g);
    if (yearMatch) {
      tags.push(...yearMatch);
    }

    // 提取季度
    const quarterMatch = title.match(/Q[1-4]|第[一二三四]季度/g);
    if (quarterMatch) {
      tags.push(...quarterMatch);
    }

    return [...new Set(tags)];
  }

  // BUG-302-迭代 FIX: 增加停用词列表
  private stopWords = new Set([
    '我们', '你们', '他们', '它们', '这个', '那个', '这些', '那些',
    '什么', '怎么', '为什么', '如何', '可以', '能够', '已经',
    '进行', '完成', '实现', '开展', '推进', '加强', '提升',
    '表示', '认为', '指出', '介绍', '分析', '研究', '报告',
    '随着', '通过', '根据', '关于', '对于', '以及', '而且'
  ]);

  // 从内容提取标签 - v3.0.3-fix: 优化算法提高准确率
  extractTagsFromContent(content: string): string[] {
    const tags: string[] = [];

    // 1. 提取高频词（排除停用词）- BUG-302-迭代 FIX
    const words = content.split(/[\s,，。！？；：""''（）【】]+/);
    const wordCount = new Map<string, number>();
    const totalWords = words.length;

    words.forEach(word => {
      // 过滤条件：长度4-10，不含数字，不是停用词 - BUG-302-迭代 FIX
      if (word.length >= 4 && word.length <= 10 &&
          !/\d/.test(word) &&
          !this.stopWords.has(word)) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });

    // 2. 计算TF-IDF-like分数（频率 * 独特性）- BUG-302-迭代 FIX
    const scoredWords = Array.from(wordCount.entries())
      .map(([word, count]) => {
        // 频率
        const tf = count / totalWords;
        // 独特性：出现次数越少越独特（简单模拟IDF）
        const idf = Math.log(totalWords / (count + 1));
        return { word, score: tf * idf * 1000 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    tags.push(...scoredWords.map(item => item.word));

    // 3. 提取关键短语（2-3个词的组合）- BUG-302-迭代 FIX
    const phrases = this.extractPhrases(content);
    tags.push(...phrases.slice(0, 3));

    return [...new Set(tags)];
  }

  // BUG-302-迭代 FIX: 提取关键短语
  private extractPhrases(content: string): string[] {
    const phrases: string[] = [];
    const industryPhrases = [
      '新能源汽车', '人工智能', '半导体芯片', '集成电路',
      '光伏产业', '储能技术', '锂电池', '智能制造'
    ];

    industryPhrases.forEach(phrase => {
      if (content.includes(phrase)) {
        phrases.push(phrase);
      }
    });

    return phrases;
  }

  // 获取自动标签建议
  async suggestTags(asset: Asset): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = [];

    try {
      // 尝试调用API获取智能标签
      const result = await assetsApi.autoTag(asset.id);

      if (result.suggestedTags && result.suggestedTags.length > 0) {
        result.suggestedTags.forEach(tag => {
          suggestions.push({
            tag,
            confidence: 0.9,
            source: 'ml'
          });
        });
      }
    } catch (err) {
      console.log('API auto-tag failed, using local extraction');
    }

    // 本地提取作为补充
    const titleTags = this.extractTagsFromTitle(asset.title || '');
    titleTags.forEach(tag => {
      if (!suggestions.some(s => s.tag === tag)) {
        suggestions.push({
          tag,
          confidence: 0.7,
          source: 'title'
        });
      }
    });

    if (asset.content) {
      const contentTags = this.extractTagsFromContent(asset.content);
      contentTags.forEach(tag => {
        if (!suggestions.some(s => s.tag === tag)) {
          suggestions.push({
            tag,
            confidence: 0.5,
            source: 'content'
          });
        }
      });
    }

    // 添加来源标签
    if (asset.source) {
      suggestions.push({
        tag: asset.source,
        confidence: 1.0,
        source: 'source'
      });
    }

    return suggestions;
  }

  // 应用标签到素材
  async applyTags(assetId: string, tags: string[]): Promise<boolean> {
    try {
      await assetsApi.updateTags(assetId, tags);
      return true;
    } catch (err) {
      console.error('Failed to apply tags:', err);
      return false;
    }
  }

  // 批量自动打标签
  async batchAutoTag(assets: Asset[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();

    await Promise.all(
      assets.map(async (asset) => {
        const suggestions = await this.suggestTags(asset);
        const tags = suggestions
          .filter(s => s.confidence >= 0.6)
          .map(s => s.tag);

        if (tags.length > 0) {
          const success = await this.applyTags(asset.id, tags);
          if (success) {
            results.set(asset.id, tags);
          }
        }
      })
    );

    return results;
  }
}

export const autoTagService = AutoTagService.getInstance();
export default autoTagService;
