// AssetRecommendPanel.tsx
// v3.0.1: 写作场景素材推荐面板 - Initial Version

import { useState, useEffect, useCallback } from 'react';
import { assetsApi, type Asset } from '../../api/client';
import './AssetRecommendPanel.css';

interface AssetRecommendPanelProps {
  inputText: string;
  onAssetSelect: (asset: Asset) => void;
  maxRecommendations?: number;
}

export function AssetRecommendPanel({
  inputText,
  onAssetSelect,
  maxRecommendations = 5,
}: AssetRecommendPanelProps) {
  const [recommendations, setRecommendations] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 提取关键词 - v3.0.1: 简单实现
  const extractKeywords = useCallback((text: string): string[] => {
    const words = text.split(/[\s,，。！？；：""''（）【】]+/);
    return words.filter(w => w.length >= 4).slice(-10);
  }, []);

  // 语义匹配计算 - v3.0.1-fix: 优化匹配算法提高准确率
  const calculateRelevance = useCallback((asset: Asset, keywords: string[]): number => {
    if (!asset.tags || keywords.length === 0) return 0;

    const assetTags = asset.tags.map(t => t.toLowerCase());
    const assetTitle = asset.title?.toLowerCase() || '';
    const assetContent = asset.content?.toLowerCase() || '';

    // BUG-301 FIX: 增加同义词映射表
    const synonymMap: Record<string, string[]> = {
      '新能源': ['电动车', '光伏', '储能', '锂电池', '清洁能源'],
      'ai': ['人工智能', '大模型', '机器学习', '深度学习'],
      '芯片': ['半导体', '集成电路', '晶圆', '代工'],
      '房地产': ['地产', '楼市', '房价', '商品房'],
    };

    let totalScore = 0;
    let maxPossibleScore = 0;

    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      let keywordScore = 0;
      maxPossibleScore += 1;

      // 1. 标签完全匹配 (权重: 1.0)
      if (assetTags.some(tag => tag.includes(keywordLower))) {
        keywordScore = Math.max(keywordScore, 1.0);
      }

      // 2. 标题匹配 (权重: 0.8)
      if (assetTitle.includes(keywordLower)) {
        keywordScore = Math.max(keywordScore, 0.8);
      }

      // 3. 内容匹配 (权重: 0.5) - BUG-301 FIX
      if (assetContent.includes(keywordLower)) {
        keywordScore = Math.max(keywordScore, 0.5);
      }

      // 4. 同义词匹配 (权重: 0.7) - BUG-301 FIX
      const synonyms = synonymMap[keyword] || synonymMap[keywordLower];
      if (synonyms) {
        for (const syn of synonyms) {
          if (assetTags.some(tag => tag.includes(syn)) ||
              assetTitle.includes(syn) ||
              assetContent.includes(syn)) {
            keywordScore = Math.max(keywordScore, 0.7);
            break;
          }
        }
      }

      // 5. 反向查找：关键词是否是某个标签的同义词 - BUG-301 FIX
      assetTags.forEach(tag => {
        const tagSynonyms = synonymMap[tag];
        if (tagSynonyms?.some(syn => keywordLower.includes(syn) || syn.includes(keywordLower))) {
          keywordScore = Math.max(keywordScore, 0.6);
        }
      });

      totalScore += keywordScore;
    });

    // 归一化到0-1
    return maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
  }, []);

  // 获取推荐素材
  useEffect(() => {
    if (!inputText || inputText.length < 10) {
      setRecommendations([]);
      return;
    }

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const keywords = extractKeywords(inputText);
        if (keywords.length === 0) {
          setRecommendations([]);
          return;
        }

        const allAssets = await assetsApi.getAll();

        const scoredAssets = allAssets.map(asset => ({
          asset,
          score: calculateRelevance(asset, keywords),
        }));

        const filtered = scoredAssets
          .filter(item => item.score > 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, maxRecommendations)
          .map(item => item.asset);

        setRecommendations(filtered);
      } catch (err) {
        setError('获取推荐失败');
        console.error('Failed to fetch recommendations:', err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchRecommendations, 500);
    return () => clearTimeout(timer);
  }, [inputText, maxRecommendations, extractKeywords, calculateRelevance]);

  if (!inputText || inputText.length < 10) {
    return null;
  }

  return (
    <div className="asset-recommend-panel">
      <div className="panel-header">
        <span className="panel-icon">📎</span>
        <span className="panel-title">相关素材</span>
        {loading && <span className="loading-indicator">...</span>}
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {!loading && recommendations.length === 0 && (
        <div className="empty-message">暂无相关素材</div>
      )}

      <ul className="recommend-list">
        {recommendations.map(asset => (
          <li key={asset.id} className="recommend-item">
            <div className="item-content">
              <span className="item-type">{getAssetTypeIcon(asset.type)}</span>
              <div className="item-info">
                <span className="item-title" title={asset.title}>
                  {truncate(asset.title, 30)}
                </span>
                {asset.tags && (
                  <span className="item-tags">
                    {asset.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="tag">#{tag}</span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <button
              className="insert-btn"
              onClick={() => onAssetSelect(asset)}
              title="插入引用"
            >
              + 引用
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getAssetTypeIcon(type?: string): string {
  switch (type) {
    case 'report': return '📄';
    case 'data': return '📊';
    case 'quote': return '💬';
    case 'news': return '📰';
    default: return '📎';
  }
}

function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export default AssetRecommendPanel;
