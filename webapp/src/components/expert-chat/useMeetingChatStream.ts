// useMeetingChatStream — drawer's Resume mode hook.
// Hits the new /api/v1/meeting-notes/meetings/:id/chat/{history,stream} endpoints
// which spawn `claude --resume <sid> --output-format stream-json` server-side.
//
// Source of truth for messages is the server's jsonl file; we re-fetch /history
// every time the drawer mounts (or meetingId changes).

import { useCallback, useEffect, useRef, useState } from 'react';
import { SseStreamReader } from './sseParser.js';
import type { ChatMessage } from './types.js';

const API_BASE = '/api/v1/meeting-notes';
const API_KEY = (import.meta as any).env?.VITE_API_KEY || 'dev-api-key';

export type CacheStatus = 'unknown' | 'hit' | 'miss';

export interface UseMeetingChatStreamResult {
  /** True when we have a server-side claude session for this meeting. */
  available: boolean;
  /** When unavailable, why: 'no-session' | 'session-file-missing' | 'session-file-unreadable' | 'invalid-id' | 'fetch-failed' */
  reason: string | null;
  messages: ChatMessage[];
  send: (text: string, tensionScope?: { id: string; topic: string }) => Promise<void>;
  loading: boolean;
  /** True while initial /history fetch is in flight. */
  loadingHistory: boolean;
  error: string | null;
  cacheStatus: CacheStatus;
  sessionId: string | null;
  runCount: number | null;
  lastResumedAt: string | null;
}

interface ChatHistoryResponse {
  available: boolean;
  reason?: string;
  sessionId?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string; uuid?: string }>;
  runCount?: number | null;
  lastResumedAt?: string | null;
}

export function useMeetingChatStream(meetingId: string | null | undefined): UseMeetingChatStreamResult {
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>('unknown');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runCount, setRunCount] = useState<number | null>(null);
  const [lastResumedAt, setLastResumedAt] = useState<string | null>(null);

  const inflight = useRef(false);

  // 拉历史
  useEffect(() => {
    if (!meetingId) {
      setAvailable(false);
      setReason(null);
      setMessages([]);
      setSessionId(null);
      setRunCount(null);
      setLastResumedAt(null);
      setCacheStatus('unknown');
      setError(null);
      return;
    }
    let aborted = false;
    setLoadingHistory(true);
    setError(null);
    fetch(`${API_BASE}/meetings/${meetingId}/chat/history`, {
      headers: { 'X-API-Key': API_KEY },
    })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as ChatHistoryResponse;
        if (aborted) return;
        if (!body.available) {
          setAvailable(false);
          setReason(body.reason ?? 'no-session');
          setMessages([]);
          setSessionId(body.sessionId ?? null);
          return;
        }
        setAvailable(true);
        setReason(null);
        setSessionId(body.sessionId ?? null);
        setRunCount(body.runCount ?? null);
        setLastResumedAt(body.lastResumedAt ?? null);
        const hist: ChatMessage[] = (body.messages ?? []).map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp ?? new Date().toISOString(),
        }));
        setMessages(hist);
      })
      .catch((e) => {
        if (aborted) return;
        setAvailable(false);
        setReason('fetch-failed');
        setError((e as Error).message);
      })
      .finally(() => {
        if (!aborted) setLoadingHistory(false);
      });
    return () => { aborted = true; };
  }, [meetingId]);

  const send = useCallback(async (text: string, tensionScope?: { id: string; topic: string }) => {
    if (!meetingId || !available) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (inflight.current || loading) return;
    inflight.current = true;
    setError(null);
    setLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    const placeholderTs = new Date(Date.now() + 1).toISOString();
    const placeholder: ChatMessage = { role: 'assistant', content: '', reasoning: '', timestamp: placeholderTs };

    setMessages((prev) => [...prev, userMsg, placeholder]);

    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}/chat/stream`, {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: trimmed,
          tensionScope: tensionScope ?? undefined,
        }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body.message || '该会议正在被其他对话或分析占用');
      }
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

      const handleFrame = (f: { event: string; data: any }) => {
        if (f.event === 'content') appendDelta({ content: f.data?.delta });
        else if (f.event === 'reasoning') appendDelta({ reasoning: f.data?.delta });
        else if (f.event === 'meta') {
          const cr = Number(f.data?.cacheReadTokens ?? 0) || 0;
          if (cr > 0) setCacheStatus('hit');
          else if (f.data?.phase === 'final') setCacheStatus('miss');
          if (typeof f.data?.sessionId === 'string') setSessionId(f.data.sessionId);
        } else if (f.event === 'error') {
          appendDelta({ content: `\n\n[错误] ${f.data?.message ?? 'unknown'}` });
        } else if (f.event === 'done') {
          if (typeof f.data?.sessionId === 'string') setSessionId(f.data.sessionId);
        }
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const frames = sse.push(decoder.decode(value, { stream: true }));
        for (const f of frames) handleFrame(f);
      }
      for (const f of sse.flush()) handleFrame(f);
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
  }, [meetingId, available, loading]);

  return {
    available,
    reason,
    messages,
    send,
    loading,
    loadingHistory,
    error,
    cacheStatus,
    sessionId,
    runCount,
    lastResumedAt,
  };
}
