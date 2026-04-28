// Temperature + history-window settings popover (used by Expert mode in drawer).
// Uses the existing .chat-settings-* class rules from ExpertChat.css.

import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  temperature: number;
  onTemperatureChange: (t: number) => void;
  historyLimit: number;
  onHistoryLimitChange: (n: number) => void;
}

export function ChatSettingsPopover({
  open,
  onClose,
  temperature,
  onTemperatureChange,
  historyLimit,
  onHistoryLimitChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ((e.target as HTMLElement).closest('[data-chat-settings-toggle]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="chat-settings-popover" role="dialog" aria-modal="false">
      <div className="chat-settings-popover-header">
        <div className="chat-settings-popover-title">对话设置</div>
        <button type="button" className="chat-settings-close" onClick={onClose} aria-label="关闭">×</button>
      </div>
      <p className="chat-settings-hint">修改后立即生效，无需单独保存。</p>

      <div className="chat-settings-section">
        <div className="chat-settings-label">历史上下文: {historyLimit} 轮</div>
        <div className="chat-settings-pills">
          {[5, 10, 20].map((n) => (
            <button
              type="button"
              key={n}
              className={`chat-settings-pill ${historyLimit === n ? 'active' : ''}`}
              onClick={() => onHistoryLimitChange(n)}
            >
              {n}轮
            </button>
          ))}
        </div>
      </div>

      <div className="chat-settings-section">
        <div className="chat-settings-label">创造性: {temperature.toFixed(1)}</div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          value={temperature}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          className="chat-settings-range"
        />
        <div className="chat-settings-range-labels">
          <span>精确</span>
          <span>平衡</span>
          <span>创造</span>
        </div>
      </div>

      <div className="chat-settings-footer">
        <button type="button" className="chat-settings-done" onClick={onClose}>完成</button>
      </div>
    </div>
  );
}
