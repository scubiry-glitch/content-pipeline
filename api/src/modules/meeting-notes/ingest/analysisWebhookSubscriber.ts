// Subscribes to mn.run.completed / mn.run.failed and emits the
// `meeting_notes.analysis.completed` external webhook (Stage 2 of the
// upload-task two-phase callback flow).
//
// 触发条件：mn_runs.metadata.callback 里有 callbackUrl 字段（即 run 是
// 通过 upload-task 入口 + autoParse=true 触发的）。其它来源的 run（手动
// /runs POST、scheduler 等）不会带 metadata.callback，订阅器对它们一律
// 跳过。

import type { MeetingNotesDeps, RunRecord } from '../types.js';
import { emitAnalysisCompletedWebhook, makeSharedUrl } from './importWebhook.js';

interface CallbackConfig {
  callbackUrl?: string;
  callbackSecret?: string | null;
  context?: {
    workspaceId?: string | null;
    userId?: string | null;
    scopeKind?: string | null;
    scopeId?: string | null;
  };
}

function readCallbackConfig(run: RunRecord): CallbackConfig | null {
  const cb = (run.metadata as any)?.callback;
  if (!cb || typeof cb !== 'object') return null;
  const url = typeof cb.callbackUrl === 'string' ? cb.callbackUrl.trim() : '';
  if (!url) return null;
  return {
    callbackUrl: url,
    callbackSecret: typeof cb.callbackSecret === 'string' ? cb.callbackSecret : null,
    context: cb.context && typeof cb.context === 'object' ? cb.context : undefined,
  };
}

async function readAssetContext(
  deps: MeetingNotesDeps,
  assetId: string,
): Promise<{
  title: string | null;
  summary: {
    tldr?: string | null;
    decision?: string | null;
    actionItems?: any[];
    risks?: string[];
  } | null;
}> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return { title: null, summary: null };
  try {
    const r = await deps.db.query(
      `SELECT title, metadata->'analysis'->'summary' AS summary
         FROM assets WHERE id = $1::uuid LIMIT 1`,
      [assetId],
    );
    const row = r.rows[0];
    if (!row) return { title: null, summary: null };
    const title = typeof row.title === 'string' && row.title.length > 0 ? row.title : null;
    const raw = row.summary;
    let summary: any = null;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object') {
          summary = {
            tldr: typeof parsed.tldr === 'string' ? parsed.tldr : null,
            decision: typeof parsed.decision === 'string' ? parsed.decision : null,
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
            risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          };
        }
      } catch { /* fall through with summary=null */ }
    }
    return { title, summary };
  } catch (e) {
    console.warn('[analysisWebhook] readAssetContext failed:', (e as Error).message);
    return { title: null, summary: null };
  }
}

async function dispatch(
  deps: MeetingNotesDeps,
  getRun: (runId: string) => Promise<RunRecord | null>,
  payload: { runId?: string; error?: string },
  state: 'succeeded' | 'failed',
): Promise<void> {
  const runId = payload?.runId;
  if (!runId) return;
  let run: RunRecord | null = null;
  try {
    run = await getRun(runId);
  } catch (e) {
    console.warn('[analysisWebhook] getRun failed:', (e as Error).message);
    return;
  }
  if (!run) return;
  const cb = readCallbackConfig(run);
  if (!cb || !cb.callbackUrl) return;

  const assetId = run.scope.kind === 'meeting' ? run.scope.id ?? '' : '';
  const assetCtx = assetId
    ? await readAssetContext(deps, assetId)
    : { title: null, summary: null };
  const summary = state === 'succeeded' ? assetCtx.summary : null;
  const sharedUrl = state === 'succeeded' && assetId ? await makeSharedUrl(assetId) : null;

  const mode =
    typeof (run.metadata as any)?.mode === 'string'
      ? ((run.metadata as any).mode as string)
      : 'multi-axis';
  const inputTokens = Number((run.metadata as any)?.inputTokens ?? 0);
  const outputTokens = Number((run.metadata as any)?.outputTokens ?? 0);
  const costTokens =
    run.costTokens && run.costTokens > 0 ? run.costTokens : inputTokens + outputTokens;

  await emitAnalysisCompletedWebhook({
    fileTitle: assetCtx.title,
    run: {
      id: run.id,
      state,
      mode,
      assetId,
      scope: { kind: run.scope.kind, id: run.scope.id ?? null },
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      costMs: run.costMs ?? 0,
      costTokens,
      errorMessage: state === 'failed' ? run.errorMessage ?? payload?.error ?? null : null,
      summary,
    },
    report: { assetId, sharedUrl },
    context: cb.context,
    callbackUrl: cb.callbackUrl,
    callbackSecret: cb.callbackSecret,
  });
}

export function registerAnalysisWebhookSubscriber(
  deps: MeetingNotesDeps,
  getRun: (runId: string) => Promise<RunRecord | null>,
): void {
  deps.eventBus.subscribe('mn.run.completed', async (payload: any) => {
    try {
      await dispatch(deps, getRun, payload, 'succeeded');
    } catch (e) {
      console.error('[analysisWebhook] succeeded handler failed:', (e as Error).message);
    }
  });

  deps.eventBus.subscribe('mn.run.failed', async (payload: any) => {
    try {
      await dispatch(deps, getRun, payload, 'failed');
    } catch (e) {
      console.error('[analysisWebhook] failed handler failed:', (e as Error).message);
    }
  });
}
