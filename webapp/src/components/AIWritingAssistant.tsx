import { useState } from 'react';
import './AIWritingAssistant.css';

interface AIWritingAssistantProps {
  content: string;
  onContentChange: (content: string) => void;
}

export function AIWritingAssistant({ content, onContentChange }: AIWritingAssistantProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  const actions = [
    { key: 'expand', label: '✨ 扩写', description: '扩展当前段落' },
    { key: 'polish', label: '💎 润色', description: '优化表达方式' },
    { key: 'simplify', label: '📝 简化', description: '精简文字内容' },
    { key: 'formal', label: '👔 正式', description: '转为正式风格' },
    { key: 'casual', label: '😊 轻松', description: '转为轻松风格' },
  ];

  const handleAction = (action: string) => {
    setLoading(true);
    setTimeout(() => {
      const enhancements: Record<string, string> = {
        expand: content + '\n\n【扩展内容】基于以上分析，我们可以进一步探讨其深层含义和长远影响...',
        polish: content.replace(/./g, c => c).replace(/。/g, '；').replace(/；/g, '。'),
        simplify: content.substring(0, Math.floor(content.length * 0.7)) + '...',
        formal: '【正式版】\n\n' + content.replace(/你/g, '贵方').replace(/我/g, '本人'),
        casual: '【轻松版】\n\n' + content + '\n\n简单来说，就是这么回事 😊',
      };
      onContentChange(enhancements[action] || content);
      setLoading(false);
      setShowPanel(false);
    }, 1000);
  };

  return (
    <div className="ai-writing-assistant">
      <button
        className="ai-assistant-toggle"
        onClick={() => setShowPanel(!showPanel)}
      >
        🤖 AI助手
      </button>

      {showPanel && (
        <div className="ai-assistant-panel">
          <div className="panel-header">
            <h4>AI写作助手</h4>
            <button onClick={() => setShowPanel(false)}>×</button>
          </div>
          {loading ? (
            <div className="ai-loading">
              <div className="ai-pulse"></div>
              <span>AI处理中...</span>
            </div>
          ) : (
            <div className="ai-actions">
              {actions.map((action) => (
                <button
                  key={action.key}
                  className="ai-action-btn"
                  onClick={() => handleAction(action.key)}
                >
                  <span className="action-label">{action.label}</span>
                  <span className="action-desc">{action.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
