import { useState } from 'react';
import './ReportQAModal.css';

interface ReportQAModalProps {
  reportTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportQAModal({ reportTitle, isOpen, onClose }: ReportQAModalProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!question.trim()) return;

    setMessages(prev => [...prev, { type: 'user', content: question }]);
    setLoading(true);

    // 模拟AI回答
    setTimeout(() => {
      const responses = [
        '根据研报内容，该行业预计未来三年将保持15%以上的复合增长率。',
        '从财务数据来看，公司毛利率稳定在30%左右，高于行业平均水平。',
        '研报提到的主要风险因素包括政策变化和市场竞争加剧。',
        '该研报建议投资者关注技术创新和市场份额变化。',
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setMessages(prev => [...prev, { type: 'ai', content: randomResponse }]);
      setLoading(false);
      setQuestion('');
    }, 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💬 研报智能问答 - {reportTitle}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="qa-messages">
          {messages.length === 0 ? (
            <div className="qa-empty">
              <span>💡</span>
              <p>输入问题，AI将基于研报内容为您解答</p>
              <div className="qa-examples">
                <button onClick={() => setQuestion('该行业的增长前景如何？')}>
                  该行业的增长前景如何？
                </button>
                <button onClick={() => setQuestion('主要风险因素有哪些？')}>
                  主要风险因素有哪些？
                </button>
                <button onClick={() => setQuestion('财务数据表现如何？')}>
                  财务数据表现如何？
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`qa-message ${msg.type}`}>
                <div className="message-avatar">{msg.type === 'user' ? '👤' : '🤖'}</div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))
          )}
          {loading && (
            <div className="qa-message ai loading">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="qa-input-area">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="输入您的问题..."
          />
          <button onClick={handleSend} disabled={loading || !question.trim()}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
