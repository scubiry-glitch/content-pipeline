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

  // 从内容提取标签 - v3.0.3: 简单频率统计（待优化）
  extractTagsFromContent(content: string): string[] {
    const tags: string[] = [];
    const words = content.split(/[\s,，。！？；：""''（）【】]+/);
    const wordCount = new Map<string, number>();

    words.forEach(word => {
      if (word.length >= 4 && word.length <= 10) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });

    // 简单频率排序
    const sortedWords = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    tags.push(...sortedWords.map(item => item.word));
    return [...new Set(tags)];
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
