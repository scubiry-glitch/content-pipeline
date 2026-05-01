// RunProgressPanel · 嵌入式进度面板
// 轮询 /api/v1/ceo/brain/tasks?ids=runId 直到 succeeded/failed/cancelled
// 1s 间隔；显示 progress / currentStep / llmCalls / tokens / duration

import { useEffect, useState } from 'react';

interface RunRow {
  id: string;
  module: string;
  axis: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | string;
  progress_pct: number | null;
  cost_tokens: number | null;
  cost_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  metadata: {
    currentStep?: string;
    llmCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    ceoResult?: unknown;
  } | null;
}

interface Props {
  runId: string;
  tone?: string;
  onCompleted?: (run: RunRow) => void;
  /** 是否在完成 3 秒后自动隐藏 */
  autoHide?: boolean;
}

const STATE_TONE: Record<string, { ink: string; bg: string; label: string }> = {
  queued: { ink: 'rgba(232,227,216,0.7)', bg: 'rgba(232,227,216,0.06)', label: '排队中' },
  running: { ink: '#D9B88E', bg: 'rgba(217,184,142,0.12)', label: '运行中' },
  succeeded: { ink: '#A6CC9A', bg: 'rgba(106,154,92,0.12)', label: '完成' },
  failed: { ink: '#FFB89A', bg: 'rgba(196,106,80,0.12)', label: '失败' },
  cancelled: { ink: 'rgba(232,227,216,0.5)', bg: 'rgba(232,227,216,0.04)', label: '取消' },
};

export function RunProgressPanel({ runId, tone = '#D9B88E', onCompleted, autoHide = true }: Props) {
  const [run, setRun] = useState<RunRow | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [transport, setTransport] = useState<'sse' | 'poll'>('sse');

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let stopAfter: NodeJS.Timeout | null = null;
    let es: EventSource | null = null;
    let pollTimer: NodeJS.Timeout | null = null;

    const handleRow = (row: RunRow) => {
      if (cancelled) return;
      setRun(row);
      setPollCount((c) => c + 1);
      if (['succeeded', 'failed', 'cancelled'].includes(row.state)) {
        onCompleted?.(row);
        if (autoHide) {
          stopAfter = setTimeout(() => !cancelled && setHidden(true), 3000);
        }
        return true;
      }
      return false;
    };

    const startPolling = () => {
      setTransport('poll');
      const poll = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/v1/ceo/brain/tasks?ids=${encodeURIComponent(runId)}&limit=1`);
          if (res.ok) {
            const d = (await res.json()) as { items: RunRow[] };
            const item = d.items?.[0];
            if (item && !cancelled) {
              if (handleRow(item)) return;
            }
          }
        } catch {
          /* 继续 poll */
        }
        if (!cancelled) {
          pollTimer = setTimeout(poll, 1000);
        }
      };
      poll();
    };

    // 优先 SSE
    try {
      es = new EventSource(`/api/v1/ceo/runs/${encodeURIComponent(runId)}/stream`);

      es.addEventListener('progress', (ev: MessageEvent) => {
        try {
          const row = JSON.parse(ev.data) as RunRow;
          if (handleRow(row)) {
            es?.close();
          }
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('done', () => {
        es?.close();
      });
      es.addEventListener('not-found', () => {
        es?.close();
        if (!cancelled) startPolling(); // 切到轮询，可能 run 还没写库
      });
      es.addEventListener('timeout', () => {
        es?.close();
        if (!cancelled) startPolling();
      });
      es.onerror = () => {
        // SSE 失败 → 退到轮询
        es?.close();
        if (!cancelled && transport === 'sse') startPolling();
      };
    } catch {
      // EventSource 不可用 → 直接轮询
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
      if (stopAfter) clearTimeout(stopAfter);
    };
  }, [runId, onCompleted, autoHide]);

  if (hidden || !runId) return null;

  if (!run) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: `${tone}10`,
          border: `1px solid ${tone}40`,
          borderRadius: 4,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: tone,
        }}
      >
        ⏳ 等待任务出现…
      </div>
    );
  }

  const stateTone = STATE_TONE[run.state] ?? STATE_TONE.queued;
  const meta = run.metadata ?? {};
  const progress = run.progress_pct ?? (run.state === 'succeeded' ? 100 : run.state === 'running' ? 30 : 0);

  const durationMs = run.finished_at && run.started_at
    ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
    : run.started_at
    ? Date.now() - new Date(run.started_at).getTime()
    : 0;

  return (
    <div
      style={{
        marginTop: 10,
        padding: '12px 14px',
        background: stateTone.bg,
        border: `1px solid ${stateTone.ink}55`,
        borderLeft: `3px solid ${stateTone.ink}`,
        borderRadius: '0 4px 4px 0',
        fontFamily: 'var(--sans)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: stateTone.ink,
            letterSpacing: 0.3,
            fontWeight: 600,
          }}
        >
          {run.module} · {run.axis} · {stateTone.label}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'rgba(232,227,216,0.5)' }}>
          run {run.id.slice(0, 8)} · {transport === 'sse' ? 'SSE' : 'poll'} #{pollCount}
        </span>
      </div>

      {/* 进度条 */}
      <div
        style={{
          height: 4,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 99,
          overflow: 'hidden',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: stateTone.ink,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* 当前步骤 + 详情 */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'rgba(232,227,216,0.7)',
          flexWrap: 'wrap',
        }}
      >
        {meta.currentStep && <span>· {meta.currentStep}</span>}
        {meta.llmCalls != null && <span>· LLM {meta.llmCalls}</span>}
        {(meta.inputTokens || meta.outputTokens) && (
          <span>
            · in {meta.inputTokens ?? 0} / out {meta.outputTokens ?? 0}
          </span>
        )}
        {durationMs > 0 && <span>· {Math.round(durationMs / 100) / 10}s</span>}
      </div>

      {run.error_message && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: '#FFB89A',
            fontFamily: 'var(--mono)',
          }}
        >
          ⚠ {run.error_message}
        </div>
      )}

      {run.state === 'succeeded' && meta.ceoResult != null && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            background: 'rgba(106,154,92,0.1)',
            borderLeft: '2px solid #A6CC9A',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'rgba(166,204,154,0.9)',
            whiteSpace: 'pre-wrap',
            maxHeight: 80,
            overflowY: 'auto',
          }}
        >
          {JSON.stringify(meta.ceoResult, null, 2)}
        </div>
      )}
    </div>
  );
}
