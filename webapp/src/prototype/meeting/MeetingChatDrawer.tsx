// MeetingChatDrawer — 「追问此会」抽屉，双模式（Resume + Expert）。
//
// Why dual-mode（详见 /Users/scubiry/.claude/plans/cached-sleeping-dragonfly.md）：
//   - Resume：会议有 claudeSession.sessionId 时，spawn `claude --resume <sid>` 在原 session 接着聊。
//             session 已经把 transcript + system prompt 缓存进 prompt cache，命中即极便宜。
//   - Expert：会议没 claudeSession（旧数据 / 非 Claude 生成）时，沿用 /expert-chat 后端
//             （expert-library + Volcano DeepSeek R1），客户端拼上下文 system 消息走首条 history。
//
// 抽屉壳一致；模式只决定 header 徽标 + 用哪条 hook + 是否显示 ExpertPicker/Settings/上下文气泡。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAvailableExperts } from '../../hooks/useExpertApi';
import { ContextCard } from '../../components/expert-chat/ContextCard';
import { ChatMessagesView } from '../../components/expert-chat/ChatMessagesView';
import { ChatInputBar } from '../../components/expert-chat/ChatInputBar';
import { ChatSettingsPopover } from '../../components/expert-chat/ChatSettingsPopover';
import { ExpertPicker } from '../../components/expert-chat/ExpertPicker';
import { useMeetingChatStream } from '../../components/expert-chat/useMeetingChatStream';
import { useExpertChatStream } from '../../components/expert-chat/useExpertChatStream';
import { downloadChatMarkdown, exportChatToPdf, type ExportMeta } from '../../components/expert-chat/exportChat';
import { PrintableChat } from '../../components/expert-chat/PrintableChat';
import type { Participant } from './_fixtures';
import { momentSpeaker, momentBody } from './_atoms';
// 复用 ExpertChat.css 的全局气泡/输入条样式（.message-bubble / .chat-input-area / .typing-* / 等）
import '../../pages/ExpertChat.css';
import './MeetingChatDrawer.css';

interface DrawerTension {
  id: string;
  topic: string;
  intensity?: number;
  summary?: string;
  between?: string[];
  moments?: any[];
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  meetingId: string | null | undefined;
  meetingTitle: string;
  /** Selected tension; null when launched from top toolbar (meeting-level). */
  tension: DrawerTension | null;
  /** Resolves participant id (e.g. 'p1') to a participant record (name etc). */
  resolveParticipant: (id: string) => Participant;
}

/** Build a one-shot system message string used as bootstrap for Expert mode. */
function buildExpertContextSystemMessage(
  meetingTitle: string,
  meetingId: string,
  tension: DrawerTension | null,
  resolveParticipant: (id: string) => Participant,
): string {
  const lines: string[] = [];
  lines.push(`本次咨询基于会议《${meetingTitle}》（id: ${meetingId}）。`);
  if (tension) {
    const between = tension.between ?? [];
    const p1 = between[0] ? resolveParticipant(between[0]) : null;
    const p2 = between[1] ? resolveParticipant(between[1]) : null;
    lines.push(`聚焦张力 ${tension.id}「${tension.topic}」。`);
    if (tension.summary) lines.push(`概要：${tension.summary}`);
    if (p1 || p2) {
      const sides: string[] = [];
      if (p1) sides.push(`${p1.name}`);
      if (p2) sides.push(`${p2.name}`);
      lines.push(`双方：${sides.join(' vs ')}`);
    }
    const moms = (tension.moments ?? []).slice(0, 3);
    if (moms.length > 0) {
      lines.push('关键摘录：');
      for (const m of moms) {
        const speaker = momentSpeaker(m) || '';
        const body = momentBody(m);
        if (body) lines.push(speaker ? `- ${speaker}：「${body}」` : `- 「${body}」`);
      }
    }
  }
  lines.push('请基于此上下文回答用户接下来的问题。');
  return lines.join('\n');
}

/** Build the ContextCard tension section (with names already resolved). */
function buildContextCardTension(
  tension: DrawerTension | null,
  resolveParticipant: (id: string) => Participant,
) {
  if (!tension) return null;
  const between = tension.between ?? [];
  const p1 = between[0] ? resolveParticipant(between[0]) : null;
  const p2 = between[1] ? resolveParticipant(between[1]) : null;
  // stance 文本：复用 VariantWorkbench 的拆分启发式（；/; 分隔，否则全文给 sideA）
  const summary = String(tension.summary ?? '');
  let sideAStance = summary;
  let sideBStance = '';
  const split = summary.split(/[；;]\s*/);
  if (split.length >= 2) {
    sideAStance = split[0];
    sideBStance = split.slice(1).join('；').trim();
  }
  const moments = (tension.moments ?? [])
    .map((m: any) => {
      const speaker = momentSpeaker(m) || '';
      const body = momentBody(m);
      if (!body) return '';
      return speaker ? `${speaker}：「${body}」` : `「${body}」`;
    })
    .filter(Boolean);
  return {
    id: tension.id,
    topic: tension.topic,
    summary: tension.summary,
    sideALabel: p1?.name,
    sideAStance,
    sideBLabel: p2?.name,
    sideBStance,
    moments,
  };
}

export function MeetingChatDrawer(props: DrawerProps) {
  const { open, onClose, meetingId, meetingTitle, tension, resolveParticipant } = props;

  // -------- Resume hook (Claude CLI session) --------
  // 始终订阅；available=false 时 caller 走 Expert 模式。
  const meetingChat = useMeetingChatStream(open ? (meetingId ?? null) : null);
  const mode: 'resume' | 'expert' | 'pending' = meetingChat.loadingHistory
    ? 'pending'
    : meetingChat.available
      ? 'resume'
      : 'expert';

  // -------- Expert hook (Volcano expert-library, only when mode==='expert') --------
  const { experts, isLoading: expertsLoading } = useAvailableExperts();
  const [activeExpertId, setActiveExpertId] = useState<string | null>(null);
  // 默认选首位
  useEffect(() => {
    if (mode !== 'expert') return;
    if (activeExpertId) return;
    const first = experts.find((e: any) => (e.expert_id ?? e.id))?.expert_id ?? experts[0]?.id ?? null;
    if (first) setActiveExpertId(String(first));
  }, [mode, experts, activeExpertId]);

  const [temperature, setTemperature] = useState(0.6);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [showSettings, setShowSettings] = useState(false);

  const expertBootstrap = useMemo(() => {
    if (mode !== 'expert' || !meetingId) return undefined;
    return buildExpertContextSystemMessage(meetingTitle, meetingId, tension, resolveParticipant);
  }, [mode, meetingId, meetingTitle, tension, resolveParticipant]);

  // localStorage 软 resume key（按 meeting + tension + expert 唯一）
  const persistKey = useMemo(() => {
    if (mode !== 'expert' || !meetingId || !activeExpertId) return undefined;
    const tKey = tension?.id ?? 'no-tension';
    return `meetingDrawer:${meetingId}:tension:${tKey}:expert:${activeExpertId}`;
  }, [mode, meetingId, tension?.id, activeExpertId]);

  const expertChat = useExpertChatStream({
    expertId: mode === 'expert' ? activeExpertId : null,
    temperature,
    historyLimit,
    bootstrapSystemMessage: expertBootstrap,
    persistKey,
  });

  // -------- 输入框 prefill --------
  const [input, setInput] = useState('');
  const lastPrefillRef = useRef<string>('');
  useEffect(() => {
    if (!open) return;
    const prefix = tension ? `关于 ${tension.id}「${tension.topic}」，` : '';
    if (prefix && lastPrefillRef.current !== prefix) {
      setInput(prefix);
      lastPrefillRef.current = prefix;
    } else if (!prefix) {
      lastPrefillRef.current = '';
    }
  }, [open, tension?.id]); // 故意只依赖 tension.id，topic 改了也不会再覆盖用户编辑

  // 关掉 / 切会议时清空 prefill 标记，下次打开能再预填
  useEffect(() => {
    if (!open) lastPrefillRef.current = '';
  }, [open]);

  // -------- 当前模式下的统一视图状态 --------
  const isResume = mode === 'resume';
  const isExpert = mode === 'expert';
  const messages = isResume ? meetingChat.messages : isExpert ? expertChat.messages : [];
  const loading = isResume ? meetingChat.loading : isExpert ? expertChat.loading : false;
  const errorMsg = isResume ? meetingChat.error : isExpert ? expertChat.error : null;

  const assistantInitial = isResume ? '🟣' : (experts.find((e: any) => (e.expert_id ?? e.id) === activeExpertId)?.name?.[0] ?? '🤖');

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (isResume) {
      void meetingChat.send(text, tension ? { id: tension.id, topic: tension.topic } : undefined);
    } else if (isExpert) {
      void expertChat.send(text);
    }
    setInput('');
  };

  const ctxCardTension = buildContextCardTension(tension, resolveParticipant);

  // -------- 导出：md / pdf / wiki --------
  const exportMeta: ExportMeta = useMemo(() => {
    const expertName = experts.find((e: any) => (e.expert_id ?? e.id) === activeExpertId)?.name ?? null;
    return {
      meetingId: meetingId ?? '',
      meetingTitle,
      mode: isResume ? 'resume' : 'expert',
      sessionId: isResume ? meetingChat.sessionId : null,
      expertId: isExpert ? activeExpertId : null,
      expertName: isExpert ? expertName : null,
      runCount: isResume ? meetingChat.runCount : null,
      tension: tension ? { id: tension.id, topic: tension.topic } : null,
    };
  }, [meetingId, meetingTitle, isResume, isExpert, meetingChat.sessionId, meetingChat.runCount, activeExpertId, experts, tension]);

  const printableContainerRef = useRef<HTMLDivElement | null>(null);
  const [exportStatus, setExportStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; text?: string }>({ kind: 'idle' });
  const hasMessages = messages.filter((m) => m.kind !== 'context').length > 0;

  const onExportMd = () => {
    if (!hasMessages) return;
    try {
      downloadChatMarkdown(messages, exportMeta);
      setExportStatus({ kind: 'ok', text: 'Markdown 已下载' });
      setTimeout(() => setExportStatus({ kind: 'idle' }), 2000);
    } catch (e) {
      setExportStatus({ kind: 'err', text: (e as Error).message });
    }
  };

  const onExportPdf = async () => {
    if (!hasMessages) return;
    if (!printableContainerRef.current) return;
    setExportStatus({ kind: 'busy', text: '生成 PDF...' });
    try {
      await exportChatToPdf(printableContainerRef.current, exportMeta);
      setExportStatus({ kind: 'ok', text: 'PDF 已下载' });
      setTimeout(() => setExportStatus({ kind: 'idle' }), 2000);
    } catch (e) {
      setExportStatus({ kind: 'err', text: (e as Error).message });
    }
  };

  const onSaveToWiki = async () => {
    if (!hasMessages || !meetingId) return;
    setExportStatus({ kind: 'busy', text: '保存到 Wiki...' });
    try {
      const apiKey = (import.meta as any).env?.VITE_API_KEY || 'dev-api-key';
      const res = await fetch(`/api/v1/meeting-notes/meetings/${meetingId}/chat/save-to-wiki`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTitle: exportMeta.meetingTitle,
          mode: exportMeta.mode,
          sessionId: exportMeta.sessionId,
          expertId: exportMeta.expertId,
          expertName: exportMeta.expertName,
          runCount: exportMeta.runCount,
          tension: exportMeta.tension,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            reasoning: m.reasoning,
            timestamp: m.timestamp,
            kind: m.kind,
          })),
        }),
      });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setExportStatus({ kind: 'ok', text: `已保存到 ${body.path}` });
      setTimeout(() => setExportStatus({ kind: 'idle' }), 3500);
    } catch (e) {
      setExportStatus({ kind: 'err', text: (e as Error).message });
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="meeting-chat-drawer-backdrop" onClick={onClose} />
      <aside className="meeting-chat-drawer" role="dialog" aria-label="追问此会">
        <div className="meeting-chat-drawer__header">
          <div className="meeting-chat-drawer__title-row">
            <h3>追问此会</h3>
            <div className="meeting-chat-drawer__title-actions">
              <button
                type="button"
                className="meeting-chat-drawer__export-btn"
                onClick={onExportMd}
                disabled={!hasMessages || exportStatus.kind === 'busy'}
                title="下载为 Markdown"
              >
                💾 MD
              </button>
              <button
                type="button"
                className="meeting-chat-drawer__export-btn"
                onClick={onExportPdf}
                disabled={!hasMessages || exportStatus.kind === 'busy'}
                title="下载为 PDF（固定模板）"
              >
                📄 PDF
              </button>
              <button
                type="button"
                className="meeting-chat-drawer__export-btn"
                onClick={onSaveToWiki}
                disabled={!hasMessages || exportStatus.kind === 'busy' || !meetingId}
                title="保存到 wiki sources/meeting/meeting-chats/"
              >
                📚 Wiki
              </button>
              <button type="button" className="meeting-chat-drawer__close" onClick={onClose} aria-label="关闭">
                ×
              </button>
            </div>
          </div>
          {exportStatus.kind !== 'idle' && (
            <div className={`meeting-chat-drawer__export-status meeting-chat-drawer__export-status--${exportStatus.kind}`}>
              {exportStatus.text}
            </div>
          )}

          <div className="meeting-chat-drawer__mode-row">
            {mode === 'pending' && (
              <span className="meeting-chat-drawer__mode-badge meeting-chat-drawer__mode-badge--pending">
                检测会议会话…
              </span>
            )}
            {mode === 'resume' && (
              <>
                <span className="meeting-chat-drawer__mode-badge meeting-chat-drawer__mode-badge--resume">
                  Resume
                </span>
                <span className="meeting-chat-drawer__mode-meta">
                  session {meetingChat.sessionId?.slice(0, 6)}…{meetingChat.sessionId?.slice(-4)}
                </span>
                {meetingChat.cacheStatus === 'hit' && (
                  <span className="meeting-chat-drawer__cache-hit" title="prompt cache 命中">
                    ✓ 缓存命中
                  </span>
                )}
                {meetingChat.cacheStatus === 'miss' && (
                  <span className="meeting-chat-drawer__cache-miss" title="本次未命中 prompt cache">
                    × 全量重算
                  </span>
                )}
                {typeof meetingChat.runCount === 'number' && (
                  <span className="meeting-chat-drawer__mode-meta">{meetingChat.runCount} 轮</span>
                )}
              </>
            )}
            {mode === 'expert' && (
              <>
                <span className="meeting-chat-drawer__mode-badge meeting-chat-drawer__mode-badge--expert">
                  Expert
                </span>
                <ExpertPicker
                  experts={experts as any}
                  selectedId={activeExpertId}
                  onSelect={setActiveExpertId}
                  loading={expertsLoading}
                />
                <button
                  type="button"
                  className="meeting-chat-drawer__settings-toggle"
                  data-chat-settings-toggle
                  onClick={() => setShowSettings((v) => !v)}
                  title="对话设置"
                  aria-expanded={showSettings}
                >
                  ⚙
                </button>
                <ChatSettingsPopover
                  open={showSettings}
                  onClose={() => setShowSettings(false)}
                  temperature={temperature}
                  onTemperatureChange={setTemperature}
                  historyLimit={historyLimit}
                  onHistoryLimitChange={setHistoryLimit}
                />
              </>
            )}
          </div>
        </div>

        {meetingId && (
          <ContextCard
            meetingTitle={meetingTitle}
            meetingId={meetingId}
            tension={ctxCardTension}
            initialOpen={false}
          />
        )}

        {mode === 'pending' ? (
          <div className="meeting-chat-drawer__placeholder">检测会议会话…</div>
        ) : (
          <div className="meeting-chat-drawer__body">
            <ChatMessagesView
              messages={messages}
              loading={loading}
              assistantInitial={assistantInitial}
              emptyState={
                <div className="meeting-chat-drawer__empty">
                  {isResume
                    ? '该会议的 Claude 分析会话已就绪，向它追问任何细节。'
                    : '这场会议没有原生 Claude 会话；将走通用专家通道，附带会议上下文。'}
                </div>
              }
            />
          </div>
        )}

        {errorMsg && <div className="meeting-chat-drawer__error">{errorMsg}</div>}

        {(isResume || isExpert) && (
          <ChatInputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            loading={loading}
            placeholder={
              isResume
                ? '问一个关于这场会的问题... (Enter 发送)'
                : `向 ${experts.find((e: any) => (e.expert_id ?? e.id) === activeExpertId)?.name ?? '专家'} 提问... (Enter 发送)`
            }
          />
        )}
      </aside>

      {/* 离屏 PrintableChat — html2pdf 需要节点存在 + 有可见尺寸；放视口外不影响交互 */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: 0,
          left: '-100000px',
          width: '720px',
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        <div ref={printableContainerRef}>
          <PrintableChat messages={messages} meta={exportMeta} />
        </div>
      </div>
    </>
  );
}
