// Scrollable message list with typing indicator and empty state.
// Caller owns messages array; we just render + auto-scroll on change.

import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble.js';
import type { ChatMessage } from './types.js';

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  assistantInitial?: string;
  /** Slot for empty-state content (e.g. suggested prompts). Rendered when messages is empty. */
  emptyState?: React.ReactNode;
}

export function ChatMessagesView({ messages, loading, assistantInitial = 'A', emptyState }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="chat-messages">
      {messages.length === 0 ? (
        emptyState ?? null
      ) : (
        messages.map((m, i) => (
          <MessageBubble
            key={`${m.timestamp}-${i}`}
            message={m}
            assistantInitial={assistantInitial}
          />
        ))
      )}
      {loading && (
        <div className="message-wrapper expert-side">
          <div className="message-avatar expert-avatar-sm">{assistantInitial}</div>
          <div className="message-bubble expert-bubble typing-bubble">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
