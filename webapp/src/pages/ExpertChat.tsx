// 专家 1v1 对话 — 左侧专家列表，右侧对话记录
import { useState, useEffect, useRef, useCallback } from 'react';
import { useExperts } from '../hooks/useExpertApi';
import './ExpertChat.css';

interface Expert {
  expert_id: string;
  name: string;
  domain: string[];
  persona: { style: string; tone: string };
  method: { frameworks: string[] };
}

interface ChatMessage {
  role: 'user' | 'expert';
  content: string;
  timestamp: string;
}

interface Conversation {
  expert_id: string;
  conversation_id: string;
  messages: ChatMessage[];
}

const API_BASE = '/api/v1/expert-library';

export function ExpertChat() {
  const { experts: rawExperts, isLoading: expertsLoading } = useExperts();
  const experts = rawExperts as unknown as Expert[];
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatTemperature, setChatTemperature] = useState(0.6);
  const [historyLimit, setHistoryLimit] = useState(10);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 专家列表就绪时默认选中第一位
  useEffect(() => {
    if (!selectedExpert && experts.length > 0) setSelectedExpert(experts[0]);
  }, [experts, selectedExpert]);

  // 滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, selectedExpert]);

  const currentConv = selectedExpert ? conversations[selectedExpert.expert_id] : null;
  const messages = currentConv?.messages || [];

  const handleSelectExpert = (expert: Expert) => {
    setSelectedExpert(expert);
    setInput('');
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedExpert || loading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    // 乐观更新
    const expertId = selectedExpert.expert_id;
    setConversations(prev => {
      const conv = prev[expertId] || { expert_id: expertId, conversation_id: `conv-${Date.now()}`, messages: [] };
      return {
        ...prev,
        [expertId]: { ...conv, messages: [...conv.messages, userMessage] },
      };
    });
    setInput('');
    setLoading(true);

    try {
      const conv = conversations[expertId];
      const history = (conv?.messages || []).slice(-historyLimit);

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expert_id: expertId,
          message: userMessage.content,
          history: history.map(m => ({ role: m.role, content: m.content })),
          conversation_id: conv?.conversation_id,
          temperature: chatTemperature,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '请求失败');
      }

      const data = await res.json();
      const expertMessage: ChatMessage = {
        role: 'expert',
        content: data.reply,
        timestamp: new Date().toISOString(),
      };

      setConversations(prev => {
        const c = prev[expertId];
        return {
          ...prev,
          [expertId]: {
            ...c,
            conversation_id: data.conversation_id || c.conversation_id,
            messages: [...c.messages, expertMessage],
          },
        };
      });
    } catch (err: any) {
      // 显示错误消息
      setConversations(prev => {
        const c = prev[expertId];
        return {
          ...prev,
          [expertId]: {
            ...c,
            messages: [...c.messages, {
              role: 'expert',
              content: `[错误] ${err.message}`,
              timestamp: new Date().toISOString(),
            }],
          },
        };
      });
    } finally {
      setLoading(false);
    }
  }, [input, selectedExpert, loading, conversations]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearConv = () => {
    if (!selectedExpert) return;
    setConversations(prev => {
      const next = { ...prev };
      delete next[selectedExpert.expert_id];
      return next;
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="expert-chat-page">
      <div className="expert-chat-layout">
        {/* ===== 左侧：专家列表 ===== */}
        <aside className="expert-chat-sidebar">
          <div className="sidebar-header">
            <h2>选择专家</h2>
            <span className="expert-count">{experts.length}</span>
          </div>

          {expertsLoading ? (
            <div className="sidebar-loading">
              {[1, 2, 3].map(i => (
                <div key={i} className="expert-skeleton">
                  <div className="skeleton-name" />
                  <div className="skeleton-style" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="expert-list">
              {experts.map(expert => {
                const hasConv = !!(conversations[expert.expert_id]?.messages.length);
                const msgCount = conversations[expert.expert_id]?.messages.filter(m => m.role === 'expert').length || 0;
                const isActive = selectedExpert?.expert_id === expert.expert_id;

                return (
                  <li
                    key={expert.expert_id}
                    className={`expert-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectExpert(expert)}
                  >
                    <div className="expert-avatar">
                      {expert.name.charAt(0)}
                    </div>
                    <div className="expert-info">
                      <div className="expert-name-row">
                        <span className="expert-name">{expert.name}</span>
                        {hasConv && (
                          <span className="conv-badge">{msgCount}</span>
                        )}
                      </div>
                      <p className="expert-style">{expert.persona.style}</p>
                      <div className="expert-domains">
                        {expert.domain.slice(0, 2).map(d => (
                          <span key={d} className="domain-tag">{d}</span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ===== 右侧：对话区域 ===== */}
        <main className="expert-chat-main">
          {selectedExpert ? (
            <>
              {/* 对话头部 */}
              <div className="chat-header">
                <div className="chat-header-info">
                  <div className="chat-expert-avatar">{selectedExpert.name.charAt(0)}</div>
                  <div>
                    <h3>{selectedExpert.name}</h3>
                    <p className="chat-expert-tone">{selectedExpert.persona.tone}</p>
                  </div>
                </div>
                <div className="chat-header-actions">
                  {messages.length > 0 && (
                    <button className="clear-btn" onClick={handleClearConv} title="清除对话">
                      清除
                    </button>
                  )}
                  <button
                    className="clear-btn"
                    onClick={() => setShowSettings(!showSettings)}
                    title="对话设置"
                    style={{ fontSize: '16px' }}
                  >
                    ⚙
                  </button>
                  <div className="frameworks-pills">
                    {selectedExpert.method.frameworks.slice(0, 2).map(f => (
                      <span key={f} className="framework-pill">{f}</span>
                    ))}
                  </div>
                </div>
                {/* 对话设置面板 */}
                {showSettings && (
                  <div style={{
                    position: 'absolute', right: '16px', top: '60px', zIndex: 50,
                    background: 'var(--md-sys-color-surface-container-lowest, white)',
                    border: '1px solid var(--md-sys-color-outline-variant, #e0e0e0)',
                    borderRadius: '12px', padding: '16px', width: '280px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>对话设置</div>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                        历史上下文: {historyLimit} 轮
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {[5, 10, 20].map(n => (
                          <button
                            key={n}
                            onClick={() => setHistoryLimit(n)}
                            style={{
                              padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                              border: 'none', cursor: 'pointer',
                              background: historyLimit === n ? 'var(--md-sys-color-primary, #6750A4)' : '#f0f0f0',
                              color: historyLimit === n ? 'white' : '#333',
                            }}
                          >
                            {n}轮
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                        创造性: {chatTemperature.toFixed(1)}
                      </div>
                      <input
                        type="range"
                        min="0.1" max="1.0" step="0.1"
                        value={chatTemperature}
                        onChange={e => setChatTemperature(parseFloat(e.target.value))}
                        style={{ width: '100%' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#999' }}>
                        <span>精确</span><span>平衡</span><span>创造</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 消息列表 */}
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="chat-empty">
                    <div className="chat-empty-avatar">{selectedExpert.name.charAt(0)}</div>
                    <h4>{selectedExpert.name} 准备就绪</h4>
                    <p>{selectedExpert.persona.style}</p>
                    <div className="suggested-prompts">
                      {getPrompts(selectedExpert).map((prompt, i) => (
                        <button
                          key={i}
                          className="suggested-prompt"
                          onClick={() => {
                            setInput(prompt);
                            textareaRef.current?.focus();
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`message-wrapper ${msg.role === 'user' ? 'user-side' : 'expert-side'}`}
                    >
                      {msg.role === 'expert' && (
                        <div className="message-avatar expert-avatar-sm">
                          {selectedExpert.name.charAt(0)}
                        </div>
                      )}
                      <div className={`message-bubble ${msg.role === 'user' ? 'user-bubble' : 'expert-bubble'}`}>
                        <div className="message-content">{msg.content}</div>
                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  ))
                )}

                {/* loading 动画 */}
                {loading && (
                  <div className="message-wrapper expert-side">
                    <div className="message-avatar expert-avatar-sm">
                      {selectedExpert.name.charAt(0)}
                    </div>
                    <div className="message-bubble expert-bubble typing-bubble">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入框 */}
              <div className="chat-input-area">
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`向 ${selectedExpert.name} 提问... (Enter 发送，Shift+Enter 换行)`}
                  rows={2}
                  disabled={loading}
                />
                <button
                  className={`send-btn ${loading || !input.trim() ? 'disabled' : ''}`}
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                >
                  {loading ? (
                    <span className="send-spinner" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="no-expert-selected">
              <p>请从左侧选择一位专家开始对话</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const EXPERT_PROMPTS: Record<string, string[]> = {
  'S-01': [
    '字节跳动的增长飞轮是什么？为什么TikTok能复制这套逻辑？',
    '如何判断一个产品的增长是真实留存还是营销买来的？',
    '你怎么看AI时代内容推荐算法的下一个拐点？',
  ],
  'S-02': [
    '小米汽车的性价比策略能打赢特斯拉吗？',
    '如何判断一个新品类有没有"极致性价比"的机会？',
    '品牌高端化和极致性价比能同时做吗？',
  ],
  'S-03': [
    '特斯拉的Robotaxi商业模式真的可行吗？',
    '分析一下比亚迪和特斯拉在成本结构上的核心差异',
    '宁德时代的固态电池路线有没有物理上的瓶颈？',
  ],
  'S-04': [
    '美团的供给侧壁垒为什么那么难被复制？',
    '本地生活赛道还有哪些没被整合的千亿市场？',
    '抖音进攻外卖，美团的防御策略是什么？',
  ],
  'S-05': [
    '人形机器人什么时候能越过成本拐点进入大规模商用？',
    '马斯克说要把SpaceX星舰成本再降10倍，物理上可行吗？',
    '从第一性原理看，核聚变商业化的最大工程障碍是什么？',
  ],
  'S-06': [
    '华为在AI芯片上的技术储备能追上英伟达吗？',
    '技术自主和全球化效率之间怎么权衡？',
    '你怎么看"备胎战略"在中国科技企业中的普适性？',
  ],
  'S-07': [
    '阿里的组织架构拆分，是变强了还是变弱了？',
    '电商平台的下一个商业模式创新会在哪里出现？',
    '云计算和AI的结合，阿里云有没有机会反超？',
  ],
  'S-08': [
    '快手和抖音的用户心智有什么本质差异？',
    '下沉市场的内容生态如何建立可持续的创作者激励？',
    '你怎么看"普惠科技"和商业变现之间的张力？',
  ],
  'S-09': [
    '当下互联网格局里，还有哪个赛道竞争窗口没关闭？',
    '如何判断一家公司的执行力在行业里是什么水平？',
    '美团和拼多多，谁的竞争壁垒更难被攻破？',
  ],
  'S-10': [
    'AI Agent的商业落地，哪个方向最接近爆发？',
    '创业公司如何在大模型时代找到真正的技术壁垒？',
    '你认为中国AI创业和硅谷AI创业最核心的差异是什么？',
  ],
  'XHS-01': [
    '帮我诊断一下这条小红书帖子为什么没有流量',
    '什么样的封面设计最能提升点击率？',
    '教我如何写一个爆款标题',
  ],
};

function getPrompts(expert: Expert): string[] {
  return EXPERT_PROMPTS[expert.expert_id] ?? [
    `请介绍一下你的分析框架`,
    `你最关注的行业趋势是什么？`,
    `如何用你的视角分析当前市场机会？`,
  ];
}
