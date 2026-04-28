// Collapsible context card shown at top of MeetingChatDrawer (both modes).
// Pure presentational — caller composes the labels.

import { useState } from 'react';

interface Props {
  meetingTitle: string;
  meetingId?: string;
  /** Optional tension scope (when drawer was opened from a tension card). */
  tension?: {
    id: string;
    topic: string;
    summary?: string;
    /** Names already resolved by caller (so we don't re-import P()). */
    sideALabel?: string;
    sideAStance?: string;
    sideBLabel?: string;
    sideBStance?: string;
    moments?: string[];
  } | null;
  /** Default open if true; toggle by user. */
  initialOpen?: boolean;
}

export function ContextCard({ meetingTitle, meetingId, tension, initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);

  const summary = tension
    ? `📌 会议《${meetingTitle}》· ${tension.id}「${tension.topic}」`
    : `📌 会议《${meetingTitle}》（未选张力）`;

  return (
    <div className="meeting-chat-context-card">
      <button
        type="button"
        className="meeting-chat-context-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="meeting-chat-context-summary">{summary}</span>
        <span className="meeting-chat-context-caret" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="meeting-chat-context-body">
          {meetingId && (
            <div className="meeting-chat-context-row">
              <span className="meeting-chat-context-label">Meeting ID</span>
              <code>{meetingId}</code>
            </div>
          )}
          {tension && (
            <>
              <div className="meeting-chat-context-row">
                <span className="meeting-chat-context-label">主题</span>
                <span>{tension.topic}</span>
              </div>
              {tension.summary && (
                <div className="meeting-chat-context-row meeting-chat-context-row--block">
                  <span className="meeting-chat-context-label">概要</span>
                  <span>{tension.summary}</span>
                </div>
              )}
              {(tension.sideALabel || tension.sideBLabel) && (
                <div className="meeting-chat-context-row meeting-chat-context-row--block">
                  <span className="meeting-chat-context-label">立场</span>
                  <span>
                    {tension.sideALabel && (
                      <>
                        <strong>{tension.sideALabel}</strong>：{tension.sideAStance || '（无对应引用）'}
                      </>
                    )}
                    {tension.sideALabel && tension.sideBLabel && <br />}
                    {tension.sideBLabel && (
                      <>
                        <strong>{tension.sideBLabel}</strong>：{tension.sideBStance || '（无对应引用）'}
                      </>
                    )}
                  </span>
                </div>
              )}
              {tension.moments && tension.moments.length > 0 && (
                <div className="meeting-chat-context-row meeting-chat-context-row--block">
                  <span className="meeting-chat-context-label">关键摘录</span>
                  <ul>
                    {tension.moments.slice(0, 3).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
