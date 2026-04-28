// Shared types for expert-chat / meeting-chat UI.
// Kept tiny on purpose — only what crosses component boundaries.

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  /** Optional model reasoning (DeepSeek R1) — collapsed by default. */
  reasoning?: string;
  timestamp: string;
  /** Marker for the system-injected context bubble (rendered differently from a real assistant message). */
  kind?: 'context';
}
