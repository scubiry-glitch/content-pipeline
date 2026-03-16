// Copilot AI助手页面 - v4.4 智能助手界面
import { useState, useRef, useEffect } from 'react';
import './Copilot.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

interface QuickAction {
  icon: string;
  label: string;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: '📝', label: '快速配置任务', prompt: '我想写一篇关于{topic}的深度研究报告，请帮我配置任务参数' },
  { icon: '🔍', label: '分析数据可靠性', prompt: '请分析当前任务中使用的数据来源是否可靠' },
  { icon: '✍️', label: '优化文章结构', prompt: '请帮我优化当前文章的结构和逻辑' },
  { icon: '🎯', label: '提升标题吸引力', prompt: '请为当前文章生成几个更有吸引力的标题' },
];

const WELCOME_MESSAGE = `你好！我是你的内容生产助手 🤖

我可以帮你：
• 📝 **自然语言配置** - 用一句话描述需求，我帮你配置完整参数
• 💡 **主动建议** - 在创作过程中提供实时优化建议
• ❓ **智能问答** - 解答关于数据、逻辑、选题的任何问题

试试下方的快捷操作，或者直接输入你的需求！`;

export function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage = generateResponse(inputValue);
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const generateResponse = (userInput: string): Message => {
    const lowerInput = userInput.toLowerCase();

    if (lowerInput.includes('配置') || lowerInput.includes('创建') || lowerInput.includes('写一篇')) {
      return {
        id: Date.now().toString(),
        role: 'assistant',
        content: `收到！让我为您配置任务参数：

**内容类型**: 深度研究报告
**目标读者**: 专业人士
**内容深度**: 深度
**术语密度**: 高
**推荐蓝军**: 技术专家 + 产业分析师
**预期长度**: 5000-8000字
**预计生产时间**: 1.5天

还需要调整什么吗？您可以告诉我：
• 调整目标读者（如"面向小白"）
• 修改内容长度（如"缩短到3000字"）
• 指定特定风格（如"轻松幽默"）`,
        timestamp: new Date(),
        suggestions: ['🚀 开始创作', '⚙️ 调整配置', '❌ 重新输入'],
      };
    }

    if (lowerInput.includes('数据') || lowerInput.includes('来源')) {
      return {
        id: Date.now().toString(),
        role: 'assistant',
        content: `当前任务数据来源分析：

✅ **可信来源** (80%)
• 国家统计局2024年Q1报告
• 住建部官方数据
• 中国指数研究院

⚠️ **需验证来源** (15%)
• 某自媒体平台行业分析
• 网友整理的对比表格

❌ **低可信度** (5%)
• 匿名论坛讨论

**建议**: 替换低可信度来源，建议补充《2024年REITs白皮书》数据`,
        timestamp: new Date(),
        suggestions: ['🔍 查找替代来源', '✅ 继续当前数据', '📝 添加免责声明'],
      };
    }

    if (lowerInput.includes('标题') || lowerInput.includes('优化')) {
      return {
        id: Date.now().toString(),
        role: 'assistant',
        content: `基于您的内容，我生成了以下几个标题方案：

**方案1 - 数字吸引**
《2024年保租房REITs：5大关键数据揭示投资新机遇》

**方案2 - 悬念引导**
《保租房REITs为何成为机构新宠？深度解析底层逻辑》

**方案3 - 痛点切入**
《保租房REITs投资避坑指南：这3个风险你必须知道》

**方案4 - 权威背书**
《重磅解读：保租房REITs政策红利下的配置策略》

您喜欢哪个方向？我可以进一步优化。`,
        timestamp: new Date(),
        suggestions: ['使用方案1', '使用方案2', '再生成几个'],
      };
    }

    return {
      id: Date.now().toString(),
      role: 'assistant',
      content: `我理解您的需求。这是一个很好的问题！

基于当前任务的状态，我建议：

1. **先确认研究方向** - 确保选题与您的专业领域匹配
2. **检查素材库** - 看看是否有相关的历史研报可以引用
3. **设置合理的预期** - 深度报告建议预留1-2天生产时间

您希望我帮您配置具体的任务参数，还是有其他问题？`,
      timestamp: new Date(),
      suggestions: ['配置任务', '查看素材库', '了解更多'],
    };
  };

  const handleQuickAction = (action: QuickAction) => {
    setInputValue(action.prompt.replace('{topic}', ''));
  };

  const handleSuggestionClick = (suggestion: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: suggestion,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '好的，正在为您处理...\n\n（此为演示，实际功能需要对接后端Copilot API）',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="copilot-page">
      <div className="copilot-header">
        <h1>🤖 Copilot 智能助手</h1>
        <p>自然语言配置 · 主动建议 · 智能问答</p>
      </div>

      <div className="copilot-container">
        {/* Messages Area */}
        <div className="messages-area">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-avatar">
                {message.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div className="message-content">
                <div className="message-text">{message.content}</div>
                {message.suggestions && (
                  <div className="message-suggestions">
                    {message.suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        className="suggestion-btn"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                <div className="message-time">
                  {message.timestamp.toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant loading">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          {QUICK_ACTIONS.map((action, idx) => (
            <button
              key={idx}
              className="quick-action-btn"
              onClick={() => handleQuickAction(action)}
            >
              <span className="quick-action-icon">{action.icon}</span>
              <span className="quick-action-label">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="input-area">
          <div className="input-container">
            <textarea
              className="message-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="输入您的问题或需求，例如：我想写一篇关于AI产业的深度分析..."
              rows={1}
            />
            <button
              className="send-btn"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? '...' : '➤'}
            </button>
          </div>
          <div className="input-hint">
            按 Enter 发送，Shift + Enter 换行
          </div>
        </div>
      </div>
    </div>
  );
}
