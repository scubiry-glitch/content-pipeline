// v4.4 Copilot AI助手 - 聊天界面
import { useState, useEffect, useRef } from 'react';
import { copilotApi, type CopilotSession, type CopilotMessage, type CopilotSkill } from '../api/copilot';
import './CopilotChat.css';

const USER_ID = 'user'; // 实际应从认证系统获取

export function CopilotChat() {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [skills, setSkills] = useState<CopilotSkill[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
    loadSkills();
  }, []);

  useEffect(() => {
    if (activeSession) {
      loadMessages(activeSession.id);
    }
  }, [activeSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSessions = async () => {
    try {
      const data = await copilotApi.getSessions(USER_ID, 'active');
      setSessions(data.items || []);
      // 自动选择第一个会话
      if (data.items?.length > 0 && !activeSession) {
        setActiveSession(data.items[0]);
      }
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const data = await copilotApi.getMessages(sessionId, 50);
      setMessages(data.items || []);
    } catch (error) {
      console.error('加载消息失败:', error);
    }
  };

  const loadSkills = async () => {
    try {
      const data = await copilotApi.getSkills();
      setSkills(data.items || []);
    } catch (error) {
      console.error('加载技能失败:', error);
    }
  };

  const createSession = async (type: string, title: string) => {
    try {
      setCreating(true);
      const session = await copilotApi.createSession({
        userId: USER_ID,
        sessionType: type as any,
        title,
      });
      setSessions([session, ...sessions]);
      setActiveSession(session);
    } catch (error) {
      console.error('创建会话失败:', error);
    } finally {
      setCreating(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || loading) return;

    try {
      setLoading(true);
      // 乐观更新UI
      const tempMessage: CopilotMessage = {
        id: 'temp',
        sessionId: activeSession.id,
        role: 'user',
        content: input,
        contentType: 'text',
        createdAt: new Date().toISOString(),
      };
      setMessages([...messages, tempMessage]);
      setInput('');

      // 发送消息
      const response = await copilotApi.sendMessage(activeSession.id, input);

      // 重新加载消息
      await loadMessages(activeSession.id);

      // 更新会话消息数
      setActiveSession({
        ...activeSession,
        messageCount: activeSession.messageCount + 2,
      });
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSessionTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      chat: '💬',
      writing: '✍️',
      research: '🔍',
      review: '👀',
    };
    return icons[type] || '🤖';
  };

  const getSkillCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      writing: '✍️',
      research: '🔍',
      analysis: '📊',
      review: '👀',
    };
    return icons[category] || '🛠️';
  };

  return (
    <div className="copilot-chat">
      {/* 侧边栏 - 会话列表 */}
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">🤖 Copilot 助手</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setCreating(true)}
          >
            + 新会话
          </button>
        </div>

        {/* 新建会话弹窗 */}
        {creating && (
          <div className="create-session-modal">
            <h4>选择会话类型</h4>
            <div className="session-types">
              <button
                className="type-btn"
                onClick={() => createSession('chat', '新对话')}
              >
                <span className="type-icon">💬</span>
                <span className="type-name">自由对话</span>
              </button>
              <button
                className="type-btn"
                onClick={() => createSession('writing', '写作辅助')}
              >
                <span className="type-icon">✍️</span>
                <span className="type-name">写作辅助</span>
              </button>
              <button
                className="type-btn"
                onClick={() => createSession('research', '研究助手')}
              >
                <span className="type-icon">🔍</span>
                <span className="type-name">研究助手</span>
              </button>
              <button
                className="type-btn"
                onClick={() => createSession('review', '内容评审')}
              >
                <span className="type-icon">👀</span>
                <span className="type-name">内容评审</span>
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>
              取消
            </button>
          </div>
        )}

        <div className="sessions-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${activeSession?.id === session.id ? 'active' : ''}`}
              onClick={() => setActiveSession(session)}
            >
              <span className="session-icon">{getSessionTypeIcon(session.sessionType)}</span>
              <div className="session-info">
                <span className="session-title">{session.title}</span>
                <span className="session-meta">
                  {session.messageCount} 条消息 · {formatTime(session.updatedAt)}
                </span>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="empty-sessions">
              <span className="empty-icon">📝</span>
              <p>点击"新会话"开始对话</p>
            </div>
          )}
        </div>
      </div>

      {/* 主聊天区 */}
      <div className="chat-main">
        {activeSession ? (
          <>
            {/* 聊天头部 */}
            <div className="chat-header">
              <div className="header-info">
                <span className="header-icon">
                  {getSessionTypeIcon(activeSession.sessionType)}
                </span>
                <div className="header-text">
                  <h3 className="header-title">{activeSession.title}</h3>
                  <span className="header-type">
                    {activeSession.sessionType === 'chat' && '自由对话'}
                    {activeSession.sessionType === 'writing' && '写作辅助'}
                    {activeSession.sessionType === 'research' && '研究助手'}
                    {activeSession.sessionType === 'review' && '内容评审'}
                  </span>
                </div>
              </div>
              <div className="header-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowSkills(!showSkills)}
                >
                  🛠️ 技能
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (confirm('确定要归档此会话吗？')) {
                      copilotApi.archiveSession(activeSession.id).then(() => {
                        loadSessions();
                        setActiveSession(null);
                      });
                    }
                  }}
                >
                  归档
                </button>
              </div>
            </div>

            {/* 技能面板 */}
            {showSkills && (
              <div className="skills-panel">
                <h4>可用技能</h4>
                <div className="skills-grid">
                  {skills.map((skill) => (
                    <div key={skill.name} className="skill-card">
                      <span className="skill-icon">{getSkillCategoryIcon(skill.category)}</span>
                      <span className="skill-name">{skill.displayName}</span>
                      <span className="skill-desc">{skill.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 消息列表 */}
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="welcome-message">
                  <span className="welcome-icon">👋</span>
                  <h4>开始对话</h4>
                  <p>我是你的AI助手，可以帮助你写作、研究和评审内容。</p>
                  <div className="quick-prompts">
                    <button className="prompt-btn" onClick={() => setInput('帮我分析这个选题的质量')}>
                      💡 分析选题质量
                    </button>
                    <button className="prompt-btn" onClick={() => setInput('帮我优化这段文字')}>
                      ✍️ 优化文字表达
                    </button>
                    <button className="prompt-btn" onClick={() => setInput('帮我搜索相关资料')}>
                      🔍 搜索相关资料
                    </button>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`message ${msg.role}`}>
                    <div className="message-avatar">
                      {msg.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-role">
                          {msg.role === 'user' ? '我' : 'Copilot'}
                        </span>
                        <span className="message-time">{formatTime(msg.createdAt)}</span>
                      </div>
                      <div className="message-body">
                        {msg.contentType === 'code' ? (
                          <pre className="code-block">
                            <code>{msg.content}</code>
                          </pre>
                        ) : (
                          <p>{msg.content}</p>
                        )}

                        {/* 快捷操作按钮 */}
                        {msg.metadata?.actions && (
                          <div className="quick-actions">
                            {msg.metadata.actions.map((action) => (
                              <button
                                key={action.id}
                                className="quick-action-btn"
                                onClick={() => {
                                  copilotApi.executeQuickAction(action.action, action.params);
                                }}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 反馈按钮 */}
                      {msg.role === 'assistant' && msg.id !== 'temp' && (
                        <div className="message-feedback">
                          <button
                            className="feedback-btn"
                            onClick={() => copilotApi.addFeedback(msg.id, 5)}
                            title="有帮助"
                          >
                            👍
                          </button>
                          <button
                            className="feedback-btn"
                            onClick={() => copilotApi.addFeedback(msg.id, 1)}
                            title="没帮助"
                          >
                            👎
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区 */}
            <div className="chat-input-area">
              <div className="input-wrapper">
                <textarea
                  className="chat-input"
                  placeholder="输入消息..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                >
                  {loading ? '⏳' : '➤'}
                </button>
              </div>
              <p className="input-hint">按 Enter 发送，Shift + Enter 换行</p>
            </div>
          </>
        ) : (
          <div className="empty-chat">
            <span className="empty-icon">🤖</span>
            <h3>Copilot AI助手</h3>
            <p>选择一个会话或创建新会话开始对话</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              创建新会话
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
