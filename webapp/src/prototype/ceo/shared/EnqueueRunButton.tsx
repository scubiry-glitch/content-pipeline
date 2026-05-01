// 触发 CEO 加工任务入队的通用按钮
// 复用于 Boardroom ⑤ 反方演练 / Compass ⑤ 战略回响 / 等
// 点击 → POST /api/v1/ceo/runs/enqueue → 显示 toast + 自动跳到 brain/tasks

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  axis: 'g1' | 'g2' | 'g3' | 'g4' | 'g5';
  /** 按钮显示文案 */
  label: string;
  /** axis 对应的产物名 (用于 toast) */
  productName: string;
  /** 主题色 */
  tone?: string;
  scopeKind?: string;
  scopeId?: string | null;
  metadata?: Record<string, unknown>;
  /** 完成入队后回调 (可选) */
  onEnqueued?: (runId: string) => void;
}

export function EnqueueRunButton({
  axis,
  label,
  productName,
  tone = '#D9B88E',
  scopeKind,
  scopeId,
  metadata,
  onEnqueued,
}: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/ceo/runs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axis, scopeKind, scopeId, metadata }),
      });
      const data = (await res.json()) as { ok: boolean; runId?: string; error?: string };
      if (!data.ok || !data.runId) {
        showToast(`入队失败: ${data.error ?? '未知错误'}`, '#B05A4A');
        return;
      }
      setLastRunId(data.runId);
      showToast(
        `${productName} 入队 ✓ run=${data.runId.slice(0, 8)}…`,
        tone,
        () => navigate('/ceo/internal/brain/tasks'),
      );
      onEnqueued?.(data.runId);
    } catch (e) {
      showToast(`入队失败: ${(e as Error).message}`, '#B05A4A');
    } finally {
      setTimeout(() => setBusy(false), 800);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      style={{
        padding: '6px 12px',
        background: busy ? 'rgba(180,180,180,0.15)' : `${tone}15`,
        border: `1px solid ${tone}55`,
        color: busy ? 'rgba(180,180,180,0.8)' : tone,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: 0.2,
        borderRadius: 4,
        cursor: busy ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
      title={lastRunId ? `上次 run: ${lastRunId}` : `触发 ${axis} 加工任务`}
    >
      {busy ? '⏳ 入队中…' : label}
    </button>
  );
}

function showToast(text: string, tone: string, onClick?: () => void) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position:fixed; left:50%; bottom:40px; transform:translateX(-50%);
    background:#0F0E15; color:#F3ECDD;
    border:1px solid ${tone}; border-left:3px solid ${tone};
    padding:10px 18px; border-radius:4px;
    font-family:var(--serif); font-style:italic; font-size:13px;
    z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.4);
    cursor:${onClick ? 'pointer' : 'default'};
    transition:opacity 300ms ease;
  `;
  if (onClick) {
    el.title = '点击查看任务队列';
    el.addEventListener('click', () => {
      onClick();
      el.remove();
    });
  }
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}
