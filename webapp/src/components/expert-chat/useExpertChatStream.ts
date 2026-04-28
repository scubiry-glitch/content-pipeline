// useExpertChatStream — drawer-focused hook for chatting with a single
// expert via /api/v1/expert-library/chat/stream (Volcano DeepSeek R1).
//
// Designed for drawer-style usage where ONE expertId is active at a time.
// /expert-chat (the page) keeps its own inline streaming logic; this hook
// is intentionally NOT shared with that page — see EXPERT_LIBRARY_PLAN.md.
//
// Features:
//   - SSE streaming (reasoning + content phases)
//   - bootstrapSystemMessage: rendered as a visible "context" bubble AND
//     prepended to history[0] for the API call (only on the first send)
//   - persistKey: sync messages + conversation_id to localStorage
//
// On expertId change: messages reset (caller is responsible for caching
// across experts if needed).

import { useCallback, useEffect, useRef, useState } from 'react';
import { SseStreamReader } from './sseParser.js';
import type { ChatMessage } from './types.js';

const API_BASE = '/api/v1/expert-library';

export interface UseExpertChatStreamOptions {
  expertId: string | null;
  temperature: number;
  historyLimit: number;
  /** Visible context bubble + first-turn system message. Stable per expertId/scope. */
  bootstrapSystemMessage?: string;
  /** localStorage key for persisting messages + conversation_id. */
  persistKey?: string;
}

export interface UseExpertChatStreamResult {
  messages: ChatMessage[];
  conversationId: string | null;
  loading: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

interface PersistedConv {
  messages: ChatMessage[];
  conversationId: string | null;
}

function loadPersisted(key: string | undefined): PersistedConv | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed as PersistedConv;
  } catch {
    return null;
  }
}

function savePersisted(key: string | undefined, conv: PersistedConv): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(conv));
  } catch {
    /* quota / serialization — ignore */
  }
}

function removePersisted(key: string | undefined): void {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function useExpertChatStream(opts: UseExpertChatStreamOptions): UseExpertChatStreamResult {
  const { expertId, temperature, historyLimit, bootstrapSystemMessage, persistKey } = opts;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // expertId 切换时：先存当前 → 再加载新的（如果有 persistKey 的话）
  // 注意 persistKey 通常已经把 expertId 编进去了，所以 expertId 变会同时引发 persistKey 变。
  useEffect(() => {
    if (!expertId) {
      setMessages([]);
      setConversationId(null);
      setError(null);
      return;
    }
    const restored = loadPersisted(persistKey);
    if (restored) {
      setMessages(restored.messages);
      setConversationId(restored.conversationId ?? null);
    } else {
      setMessages([]);
      setConversationId(null);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertId, persistKey]);

  // messages / conversationId 变更 → 持久化
  useEffect(() => {
    if (!persistKey) return;
    if (messages.length === 0 && !conversationId) {
      removePersisted(persistKey);
      return;
    }
    savePersisted(persistKey, { messages, conversationId });
  }, [messages, conversationId, persistKey]);

  // 防止在 send 进行中再触发并发 send
  const inflight = useRef(false);

  const send = useCallback(async (text: string): Promise<void> => {
    if (!expertId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (inflight.current || loading) return;

    inflight.current = true;
    setError(null);
    setLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    const placeholderTs = new Date(Date.now() + 1).toISOString();
    const placeholder: ChatMessage = { role: 'assistant', content: '', reasoning: '', timestamp: placeholderTs };

    // 拿当前 messages 副本（来自最近渲染）以决定是否需要注入 system 上下文
    let snapshotMessages: ChatMessage[] = [];
    setMessages((prev) => {
      snapshotMessages = prev;
      // 首次发送 + 有 bootstrap → 先把可见 context 气泡塞进去
      const needsContextBubble =
        prev.length === 0 && !!bootstrapSystemMessage && bootstrapSystemMessage.trim().length > 0;
      const ctxBubble: ChatMessage | null = needsContextBubble ? {
        role: 'system',
        content: bootstrapSystemMessage!.trim(),
        timestamp: new Date(Date.now() - 1).toISOString(),
        kind: 'context',
      } : null;
      return [...prev, ...(ctxBubble ? [ctxBubble] : []), userMsg, placeholder];
    });

    // history 给 API：包括 bootstrapSystemMessage（如果是首次） + 历史 messages（裁剪到 historyLimit 轮）
    // 后端 expert-library 接受 role: 'system' | 'user' | 'assistant'
    const apiHistory: Array<{ role: string; content: string }> = [];
    if (snapshotMessages.length === 0 && bootstrapSystemMessage?.trim()) {
      apiHistory.push({ role: 'system', content: bootstrapSystemMessage.trim() });
    }
    for (const m of snapshotMessages.slice(-historyLimit)) {
      // 跳过自己渲染的 context bubble（避免重复）—— 它本来就是 system，且只在 first send 时存在
      if (m.kind === 'context') continue;
      apiHistory.push({ role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content });
    }

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          expert_id: expertId,
          message: trimmed,
          history: apiHistory,
          conversation_id: conversationId,
          temperature,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const sse = new SseStreamReader();

      const appendDelta = (patch: { content?: string; reasoning?: string }) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== 'assistant' || last.timestamp !== placeholderTs) return prev;
          const next = prev.slice(0, -1);
          next.push({
            ...last,
            content: last.content + (patch.content || ''),
            reasoning: (last.reasoning || '') + (patch.reasoning || ''),
          });
          return next;
        });
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const frames = sse.push(decoder.decode(value, { stream: true }));
        for (const f of frames) handleFrame(f);
      }
      for (const f of sse.flush()) handleFrame(f);

      function handleFrame(f: { event: string; data: any }) {
        if (f.event === 'reasoning') appendDelta({ reasoning: f.data?.delta });
        else if (f.event === 'content') appendDelta({ content: f.data?.delta });
        else if (f.event === 'meta') {
          if (typeof f.data?.conversation_id === 'string') setConversationId(f.data.conversation_id);
        } else if (f.event === 'error') {
          appendDelta({ content: `\n\n[错误] ${f.data?.message ?? 'unknown'}` });
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role !== 'assistant' || last.timestamp !== placeholderTs) return prev;
        const next = prev.slice(0, -1);
        next.push({ ...last, content: `[错误] ${msg}` });
        return next;
      });
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [expertId, temperature, historyLimit, bootstrapSystemMessage, conversationId, loading]);

  const clear = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    removePersisted(persistKey);
  }, [persistKey]);

  return { messages, conversationId, loading, error, send, clear };
}
