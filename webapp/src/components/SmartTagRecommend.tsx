import { useState } from 'react';
import './SmartTagRecommend.css';

interface SmartTagRecommendProps {
  content?: string;
  title?: string;
  existingTags: string[];
  onAddTag: (tag: string) => void;
}

// 模拟智能标签推荐
function generateRecommendedTags(title?: string, content?: string): string[] {
  const tags: string[] = [];
  const text = `${title || ''} ${content || ''}`.toLowerCase();

  // 关键词映射
  const keywordMap: Record<string, string[]> = {
    'AI': ['人工智能', 'AI', '机器学习', '深度学习'],
    '新能源': ['新能源', '电动车', '光伏', '储能', '锂电池'],
    '半导体': ['半导体', '芯片', '集成电路', '晶圆', '台积电'],
    '医疗': ['医疗', '医药', '生物医药', '医疗器械', '创新药'],
    '金融': ['金融', '银行', '保险', '证券', '投资'],
    '房地产': ['房地产', '地产', '保租房', 'REITs', '楼市'],
    '消费': ['消费', '零售', '电商', '新零售', '消费升级'],
    '报告': ['研报', '深度报告', '行业分析', '投资策略'],
    '数据': ['数据分析', '大数据', '数据可视化', '统计'],
    '政策': ['政策', '监管', '法规', '政策解读'],
  };

  Object.entries(keywordMap).forEach(([category, keywords]) => {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      tags.push(category);
    }
  });

  // 如果没有匹配，返回一些通用标签
  if (tags.length === 0) {
    return ['行业研究', '市场分析'];
  }

  return tags.slice(0, 5);
}

export function SmartTagRecommend({
  content,
  title,
  existingTags,
  onAddTag,
}: SmartTagRecommendProps) {
  const [showRecommendations, setShowRecommendations] = useState(false);

  const recommendedTags = generateRecommendedTags(title, content);
  const filteredTags = recommendedTags.filter(tag => !existingTags.includes(tag));

  if (filteredTags.length === 0) return null;

  return (
    <div className="smart-tag-recommend">
      <button
        className="recommend-toggle"
        onClick={() => setShowRecommendations(!showRecommendations)}
      >
        💡 智能推荐标签 {showRecommendations ? '▲' : '▼'}
      </button>

      {showRecommendations && (
        <div className="recommended-tags">
          {filteredTags.map(tag => (
            <button
              key={tag}
              className="recommended-tag"
              onClick={() => onAddTag(tag)}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 标签云组件
interface TagCloudProps {
  tags: { name: string; count: number }[];
  onTagClick?: (tag: string) => void;
}

export function TagCloud({ tags, onTagClick }: TagCloudProps) {
  const maxCount = Math.max(...tags.map(t => t.count), 1);

  return (
    <div className="tag-cloud">
      {tags.map(({ name, count }) => {
        const size = 0.8 + (count / maxCount) * 0.7;
        const opacity = 0.6 + (count / maxCount) * 0.4;

        return (
          <button
            key={name}
            className="tag-cloud-item"
            style={{
              fontSize: `${size}rem`,
              opacity,
            }}
            onClick={() => onTagClick?.(name)}
          >
            {name}
            <span className="tag-count">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
