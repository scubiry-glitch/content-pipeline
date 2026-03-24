// Markdown 渲染组件 - 支持 GitHub Flavored Markdown 和文本高亮
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
 */
function processHighlights(content: string, highlights: HighlightItem[]): string {
  if (!highlights.length) return content;
  
  let processedContent = content;
  
  // 按文本长度降序排序，先替换长的文本，避免短文本匹配到长文本的一部分
  const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length);
  
  sortedHighlights.forEach(h => {
    const colorClass = highlightColorClasses[h.color];
    if (!colorClass) return;
    
    // 转义正则表达式特殊字符
    const escapedText = h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 使用正则表达式全局替换，但避免在 HTML 标签内替换
    const regex = new RegExp(`(${escapedText})(?![^<]*>)`, 'g');
    
    processedContent = processedContent.replace(
      regex,
      `<span class="${colorClass} px-1 rounded cursor-help transition-colors hover:brightness-95" data-highlight-id="${h.id}">$1</span>`
    );
  });
  
  return processedContent;
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
