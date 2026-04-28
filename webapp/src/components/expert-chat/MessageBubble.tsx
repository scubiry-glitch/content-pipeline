// Single chat message bubble: user / assistant / system-context variants.
// Reuses the existing .message-bubble / .reasoning-* class rules from
// ExpertChat.css (loaded by the parent page or drawer).

import type { ChatMessage } from './types.js';

interface Props {
  message: ChatMessage;
  /** Avatar text for the assistant side (first char of expert name etc) */
  assistantInitial?: string;
}

export function MessageBubble({ message, assistantInitial = 'A' }: Props) {
  const time = formatTime(message.timestamp);

  if (message.kind === 'context') {
    return (
      <div className="message-wrapper expert-side meeting-chat-context-row">
        <div className="message-bubble meeting-chat-context-bubble">
          <div className="meeting-chat-context-label">📌 上下文</div>
          <div className="message-content">{message.content}</div>
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="message-wrapper user-side">
        <div className="message-bubble user-bubble">
          <div className="message-content">{message.content}</div>
          <span className="message-time">{time}</span>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="message-wrapper expert-side">
      <div className="message-avatar expert-avatar-sm">{assistantInitial}</div>
      <div className="message-bubble expert-bubble">
        {message.reasoning && (
          <details className="reasoning-details">
            <summary className="reasoning-summary">
              💭 思考过程 ({message.reasoning.length} 字)
            </summary>
            <div className="reasoning-content">{message.reasoning}</div>
          </details>
        )}
        <div className="message-content">{message.content || (message.reasoning ? '' : '…')}</div>
        <span className="message-time">{time}</span>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
