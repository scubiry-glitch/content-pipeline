// Textarea + send button. Enter sends, Shift+Enter inserts newline.

import { useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  loading: boolean;
  placeholder?: string;
  /** Forwarded ref so parents can imperatively focus (e.g. after picking a suggested prompt). */
  inputRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
}

export function ChatInputBar({ value, onChange, onSend, loading, placeholder, inputRef }: Props) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const refSetter = (el: HTMLTextAreaElement | null) => {
    internalRef.current = el;
    if (inputRef) inputRef.current = el;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const disabled = loading || !value.trim();

  return (
    <div className="chat-input-area">
      <textarea
        ref={refSetter}
        className="chat-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? '输入消息... (Enter 发送，Shift+Enter 换行)'}
        rows={2}
        disabled={loading}
      />
      <button
        type="button"
        className={`send-btn ${disabled ? 'disabled' : ''}`}
        onClick={onSend}
        disabled={disabled}
        aria-label="发送"
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
  );
}
