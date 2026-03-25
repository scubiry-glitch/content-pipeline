// Markdown 渲染组件 - 支持 GitHub Flavored Markdown 和文本高亮
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './MarkdownRenderer.css';

export interface HighlightItem {
  id: string;
  text: string;
  color: 'blue' | 'orange' | 'red';
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** 高亮文本列表 */
  highlights?: HighlightItem[];
}

// 高亮颜色配置
const highlightColorClasses: Record<string, string> = {
  blue: 'bg-blue-50 border-b-2 border-blue-400',
  orange: 'bg-orange-50 border-b-2 border-orange-400',
  red: 'bg-red-50 border-b-2 border-red-400',
};

/**
 * 处理带高亮的内容
 * 将高亮文本替换为带有样式的 span 标签
 * 使用非重叠匹配，避免重复嵌套
 */
function processHighlights(content: string, highlights: HighlightItem[]): string {
  if (!highlights.length) return content;
  
  // 去重并按文本长度降序排序（长的优先）
  const uniqueHighlights = highlights.filter((h, i, arr) => 
    arr.findIndex(t => t.text === h.text) === i
  );
  const sortedHighlights = uniqueHighlights.sort((a, b) => b.text.length - a.text.length);
  
  // 构建匹配模式：优先匹配长文本
  const patterns = sortedHighlights.map(h => ({
    ...h,
    escaped: h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }));
  
  // 使用分段处理，避免重叠匹配
  let result = '';
  let lastIndex = 0;
  
  // 找到所有匹配位置（非重叠）
  type Match = { start: number; end: number; highlight: typeof patterns[0] };
  const matches: Match[] = [];
  
  // 扫描内容，找到第一个匹配的 pattern
  let i = 0;
  while (i < content.length) {
    let matched = false;
    
    for (const pattern of patterns) {
      const regex = new RegExp(`^${pattern.escaped}`);
      const substr = content.slice(i);
      const match = substr.match(regex);
      
      if (match) {
        // 检查这个位置是否已经被覆盖
        const start = i;
        const end = i + match[0].length;
        
        // 检查是否与已有匹配重叠
        const overlaps = matches.some(m => !(end <= m.start || start >= m.end));
        
        if (!overlaps) {
          matches.push({ start, end, highlight: pattern });
          i = end;
          matched = true;
          break;
        }
      }
    }
    
    if (!matched) {
      i++;
    }
  }
  
  // 按位置排序
  matches.sort((a, b) => a.start - b.start);
  
  // 构建结果
  lastIndex = 0;
  for (const match of matches) {
    result += content.slice(lastIndex, match.start);
    const colorClass = highlightColorClasses[match.highlight.color];
    result += `<span class="${colorClass} px-1 rounded cursor-help transition-colors hover:brightness-95" data-highlight-id="${match.highlight.id}">${content.slice(match.start, match.end)}</span>`;
    lastIndex = match.end;
  }
  result += content.slice(lastIndex);
  
  return result;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ 
  content, 
  className = '',
  highlights = [],
}) => {
  // 处理带高亮的内容
  const processedContent = useMemo(() => {
    return processHighlights(content, highlights);
  }, [content, highlights]);

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // 自定义代码块渲染
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="code-block">
                <div className="code-header">
                  <span className="code-lang">{match[1]}</span>
                </div>
                <pre className={className}>
                  <code {...props}>{children}</code>
                </pre>
              </div>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // 自定义表格渲染
          table({ children }: any) {
            return (
              <div className="table-wrapper">
                <table>{children}</table>
              </div>
            );
          },
          // 自定义段落渲染，支持 HTML 高亮标签
          p({ children }: any) {
            // 如果 children 包含字符串且有高亮标记，使用 dangerouslySetInnerHTML
            const hasHtmlHighlight = typeof children === 'string' && 
              children.includes('data-highlight-id');
            
            if (hasHtmlHighlight) {
              return <p dangerouslySetInnerHTML={{ __html: children }} />;
            }
            
            // 处理数组类型的 children
            if (Array.isArray(children)) {
              const hasHighlightInArray = children.some(
                child => typeof child === 'string' && child.includes('data-highlight-id')
              );
              
              if (hasHighlightInArray) {
                // 将所有 children 拼接成字符串
                const htmlContent = children
                  .map(child => typeof child === 'string' ? child : '')
                  .join('');
                return <p dangerouslySetInnerHTML={{ __html: htmlContent }} />;
              }
            }
            
            return <p>{children}</p>;
          },
          // 自定义 span 渲染以支持高亮
          span({ node, className, children, ...props }: any) {
            // 检查是否是高亮 span
            if (className?.includes('bg-blue-50') || 
                className?.includes('bg-orange-50') || 
                className?.includes('bg-red-50')) {
              return (
                <span className={className} {...props}>
                  {children}
                </span>
              );
            }
            return <span {...props}>{children}</span>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
