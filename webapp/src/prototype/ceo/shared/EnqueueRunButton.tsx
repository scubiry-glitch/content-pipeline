// 触发 CEO 加工任务入队的通用按钮 + 内嵌进度面板
// 点击 → POST /api/v1/ceo/runs/enqueue → 内嵌 RunProgressPanel 轮询进度

import { useState } from 'react';
import { RunProgressPanel } from './RunProgressPanel';

interface Props {
  axis: 'g1' | 'g2' | 'g3' | 'g4' | 'g5';
  /** 按钮显示文案 */
  label: string;
  /** axis 对应的产物名 */
  productName: string;
  /** 主题色 */
  tone?: string;
  scopeKind?: string;
  scopeId?: string | null;
  metadata?: Record<string, unknown>;
  /** 完成入队后回调 (可选) */
  onEnqueued?: (runId: string) => void;
  /** 完成执行后回调 — 让上游 refetch 数据 */
  onCompleted?: () => void;
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
  onCompleted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/ceo/runs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axis, scopeKind, scopeId, metadata }),
      });
      const data = (await res.json()) as { ok: boolean; runId?: string; error?: string };
      if (!data.ok || !data.runId) {
        setError(data.error ?? '入队失败');
        return;
      }
      setActiveRunId(data.runId);
      onEnqueued?.(data.runId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTimeout(() => setBusy(false), 500);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
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
          alignSelf: 'flex-start',
        }}
        title={`触发 ${productName} (axis ${axis})`}
      >
        {busy ? '⏳ 入队中…' : label}
      </button>
      {error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: '#FFB89A',
            fontFamily: 'var(--mono)',
          }}
        >
          ⚠ {error}
        </div>
      )}
      {activeRunId && (
        <RunProgressPanel
          runId={activeRunId}
          tone={tone}
          onCompleted={() => onCompleted?.()}
        />
      )}
    </div>
  );
}
