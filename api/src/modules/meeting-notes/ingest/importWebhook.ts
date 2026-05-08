import { createHmac } from 'node:crypto';
import { query } from '../../../db/connection.js';

// ============================================================
// Shared sender + URL helpers
// ============================================================

function isFeishuWebhook(url: string): boolean {
  return url.startsWith('https://open.feishu.cn/open-apis/bot/');
}

function baseUrl(): string {
  return (
    process.env.PUBLIC_API_BASE_URL
    || process.env.API_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || 'http://paper.morning.rocks'
  ).replace(/\/$/, '');
}

export async function makeSharedUrl(meetingId: string): Promise<string | null> {
  const b = baseUrl();
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return null;
  try {
    const r = await query<{ share_token: string }>(
      `INSERT INTO mn_meeting_shares (meeting_id, mode, targets, created_by, expires_at)
       VALUES ($1::uuid, 'link', '[]'::jsonb, NULL, NOW() + INTERVAL '7 days')
       RETURNING share_token::text`,
      [meetingId],
    );
    const token = r.rows[0]?.share_token;
    if (!token) return null;
    return `${b}/meeting/shared/${token}`;
  } catch {
    return null;
  }
}

interface SendOpts {
  callbackUrl: string;
  callbackSecret?: string | null;
  eventName: string; // 用于 X-CP-Event header
  body: string; // 已 stringify
  isFeishu: boolean;
}

async function sendWebhook(opts: SendOpts): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opts.isFeishu) {
    headers['X-CP-Event'] = opts.eventName;
    const secret = (opts.callbackSecret || '').trim();
    if (secret) {
      headers['X-CP-Signature'] = `sha256=${createHmac('sha256', secret).update(opts.body).digest('hex')}`;
    }
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
  try {
    const res = await fetch(opts.callbackUrl, { method: 'POST', headers, body: opts.body, signal: ac.signal });
    const resText = await res.text().catch(() => '');
    console.log(
      `[MeetingNoteWebhook] ${opts.isFeishu ? 'feishu' : 'generic'} ${opts.eventName} → HTTP ${res.status} ${resText.slice(0, 200)}`,
    );
  } catch (err) {
    console.warn(`[MeetingNoteWebhook] ${opts.eventName} failed:`, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Stage 1 — meeting_notes.uploaded (上传 + 入队)
// ============================================================

export interface UploadedWebhookInput {
  sourceId: string;
  sourceName?: string;
  triggeredBy: string;
  importResult: {
    id: string;
    status: string;
    itemsDiscovered: number;
    itemsImported: number;
    duplicates: number;
    errors: number;
    errorMessage: string | null;
    assetIds: string[];
    startedAt: Date | string | null;
    finishedAt: Date | string | null;
  };
  /** autoParse=true 时每个 asset 对应一条已排队的 run；autoParse=false 时 runId=null */
  assets: Array<{ assetId: string; runId: string | null; mode: string | null }>;
  callbackUrl?: string | null;
  callbackSecret?: string | null;
  context?: {
    workspaceId?: string | null;
    userId?: string | null;
    scopeKind?: string | null;
    scopeId?: string | null;
  };
}

function buildUploadedFeishuCard(input: UploadedWebhookInput): object {
  const r = input.importResult;
  const succeeded = r.status === 'succeeded';
  const headerColor = succeeded ? (r.errors > 0 ? 'orange' : 'blue') : 'red';
  const statusText = succeeded ? '✅ 已收到，分析任务排队中' : '❌ 上传失败';

  const queuedRuns = input.assets.filter((a) => a.runId).length;
  const duration = (() => {
    if (!r.startedAt || !r.finishedAt) return null;
    const ms = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  })();

  const metaLines = [
    `**来源：** ${input.sourceName ?? input.sourceId}`,
    `**状态：** ${statusText}`,
    r.duplicates > 0
      ? `**导入：** ${r.itemsImported} 条（重复跳过 ${r.duplicates} 条）`
      : `**导入：** ${r.itemsImported} 条`,
    queuedRuns > 0 ? `**分析任务：** ${queuedRuns} 个 run 已排队（分析完成后将再发一张卡片）` : null,
    duration ? `**耗时：** ${duration}` : null,
    input.context?.userId ? `**用户：** ${input.context.userId}` : null,
    input.context?.scopeKind && input.context?.scopeId
      ? `**关联：** ${input.context.scopeKind} / ${input.context.scopeId}`
      : null,
    r.errorMessage ? `**错误：** ${r.errorMessage}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '📋 会议纪要已上传' },
        template: headerColor,
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: metaLines } },
      ],
    },
  };
}

export async function emitUploadedWebhook(input: UploadedWebhookInput): Promise<void> {
  const callbackUrl = (input.callbackUrl || '').trim();
  if (!callbackUrl) return;

  const isFeishu = isFeishuWebhook(callbackUrl);
  const body = isFeishu
    ? JSON.stringify(buildUploadedFeishuCard(input))
    : JSON.stringify({
        event: 'meeting_notes.uploaded',
        at: new Date().toISOString(),
        source: { id: input.sourceId, name: input.sourceName ?? null },
        triggeredBy: input.triggeredBy,
        context: {
          workspaceId: input.context?.workspaceId ?? null,
          userId: input.context?.userId ?? null,
          scopeKind: input.context?.scopeKind ?? null,
          scopeId: input.context?.scopeId ?? null,
        },
        import: input.importResult,
        assets: input.assets,
      });

  await sendWebhook({
    callbackUrl,
    callbackSecret: input.callbackSecret,
    eventName: 'meeting_notes.uploaded',
    body,
    isFeishu,
  });
}

// ============================================================
// Stage 2 — meeting_notes.analysis.completed (16 轴 run 完成)
// ============================================================

export interface AnalysisCompletedWebhookInput {
  run: {
    id: string;
    state: 'succeeded' | 'failed';
    mode: string;
    assetId: string;
    scope: { kind: string; id: string | null };
    startedAt: string | null;
    finishedAt: string | null;
    costMs: number;
    costTokens: number;
    errorMessage: string | null;
    summary: {
      tldr?: string | null;
      decision?: string | null;
      actionItems?: any[];
      risks?: string[];
    } | null;
  };
  report: { assetId: string; sharedUrl: string | null };
  context?: {
    workspaceId?: string | null;
    userId?: string | null;
    scopeKind?: string | null;
    scopeId?: string | null;
  };
  callbackUrl: string;
  callbackSecret?: string | null;
}

function buildAnalysisCompletedFeishuCard(input: AnalysisCompletedWebhookInput): object {
  const succeeded = input.run.state === 'succeeded';
  const headerColor = succeeded ? 'green' : 'red';
  const headerTitle = succeeded ? '🧠 会议分析已完成' : '❌ 会议分析失败';

  const duration = (() => {
    if (!input.run.startedAt || !input.run.finishedAt) return null;
    const ms = new Date(input.run.finishedAt).getTime() - new Date(input.run.startedAt).getTime();
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  })();

  const summaryLines: string[] = [];
  if (succeeded && input.run.summary) {
    if (input.run.summary.tldr) summaryLines.push(`**摘要：** ${input.run.summary.tldr}`);
    if (input.run.summary.decision) summaryLines.push(`**决议：** ${input.run.summary.decision}`);
    const ai = (input.run.summary.actionItems ?? []).slice(0, 3);
    if (ai.length > 0) {
      const formatted = ai
        .map((item: any) => {
          if (typeof item === 'string') return item;
          return item?.text ?? item?.title ?? JSON.stringify(item);
        })
        .filter(Boolean)
        .join('；');
      if (formatted) summaryLines.push(`**待办：** ${formatted}`);
    }
  }

  const metaLines = [
    `**Run ID：** ${input.run.id}`,
    `**模式：** ${input.run.mode}`,
    duration ? `**耗时：** ${duration}` : null,
    input.run.costTokens > 0 ? `**Tokens：** ${input.run.costTokens}` : null,
    input.context?.userId ? `**用户：** ${input.context.userId}` : null,
    !succeeded && input.run.errorMessage ? `**错误：** ${input.run.errorMessage}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const elements: object[] = [];
  if (summaryLines.length > 0) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: summaryLines.join('\n') } });
    elements.push({ tag: 'hr' });
  }
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: metaLines } });

  if (succeeded && input.report.sharedUrl) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '查看会议纪要报告' },
          url: input.report.sharedUrl,
          type: 'primary',
        },
      ],
    });
  }

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: headerTitle },
        template: headerColor,
      },
      elements,
    },
  };
}

export async function emitAnalysisCompletedWebhook(input: AnalysisCompletedWebhookInput): Promise<void> {
  const callbackUrl = (input.callbackUrl || '').trim();
  if (!callbackUrl) return;

  const isFeishu = isFeishuWebhook(callbackUrl);
  const body = isFeishu
    ? JSON.stringify(buildAnalysisCompletedFeishuCard(input))
    : JSON.stringify({
        event: 'meeting_notes.analysis.completed',
        at: new Date().toISOString(),
        run: input.run,
        report: input.report,
        context: {
          workspaceId: input.context?.workspaceId ?? null,
          userId: input.context?.userId ?? null,
          scopeKind: input.context?.scopeKind ?? null,
          scopeId: input.context?.scopeId ?? null,
        },
      });

  await sendWebhook({
    callbackUrl,
    callbackSecret: input.callbackSecret,
    eventName: 'meeting_notes.analysis.completed',
    body,
    isFeishu,
  });
}

// ============================================================
// Legacy — emitImportWebhook (老 :id/upload 路由保持兼容)
// ============================================================

export interface ImportWebhookInput {
  sourceId: string;
  sourceName?: string;
  triggeredBy: string;
  importResult: {
    id: string;
    status: string;
    itemsDiscovered: number;
    itemsImported: number;
    duplicates: number;
    errors: number;
    errorMessage: string | null;
    assetIds: string[];
    startedAt: Date | string | null;
    finishedAt: Date | string | null;
  };
  callbackUrl?: string | null;
  callbackSecret?: string | null;
  context?: {
    workspaceId?: string | null;
    userId?: string | null;
    scopeKind?: string | null;
    scopeId?: string | null;
  };
}

function buildLegacyFeishuCard(
  input: ImportWebhookInput,
  reportLinks: Array<{ assetId: string; sharedUrl: string | null }>,
): object {
  const r = input.importResult;
  const succeeded = r.status === 'succeeded';
  const headerColor = succeeded ? (r.errors > 0 ? 'orange' : 'blue') : 'red';
  const statusText = succeeded ? '✅ 处理成功' : '❌ 处理失败';

  const duration = (() => {
    if (!r.startedAt || !r.finishedAt) return null;
    const ms = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  })();

  const metaLines = [
    `**来源：** ${input.sourceName ?? input.sourceId}`,
    `**状态：** ${statusText}`,
    r.duplicates > 0
      ? `**导入：** ${r.itemsImported} 条（重复跳过 ${r.duplicates} 条）`
      : `**导入：** ${r.itemsImported} 条`,
    duration ? `**耗时：** ${duration}` : null,
    input.context?.userId ? `**用户：** ${input.context.userId}` : null,
    input.context?.scopeKind && input.context?.scopeId
      ? `**关联：** ${input.context.scopeKind} / ${input.context.scopeId}`
      : null,
    r.errorMessage ? `**错误：** ${r.errorMessage}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const elements: object[] = [
    { tag: 'div', text: { tag: 'lark_md', content: metaLines } },
  ];

  const firstReport = reportLinks.find((l) => l.sharedUrl);
  if (firstReport?.sharedUrl) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '查看会议纪要报告' },
          url: firstReport.sharedUrl,
          type: 'primary',
        },
      ],
    });
  }

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '📋 会议纪要已处理' },
        template: headerColor,
      },
      elements,
    },
  };
}

export async function emitImportWebhook(input: ImportWebhookInput): Promise<void> {
  const callbackUrl = (input.callbackUrl || '').trim();
  if (!callbackUrl) return;

  const reportLinks: Array<{ assetId: string; sharedUrl: string | null }> = [];
  for (const assetId of input.importResult.assetIds || []) {
    reportLinks.push({ assetId, sharedUrl: await makeSharedUrl(assetId) });
  }

  const isFeishu = isFeishuWebhook(callbackUrl);
  const body = isFeishu
    ? JSON.stringify(buildLegacyFeishuCard(input, reportLinks))
    : JSON.stringify({
        event: 'meeting_notes.import.completed',
        at: new Date().toISOString(),
        source: { id: input.sourceId, name: input.sourceName ?? null },
        triggeredBy: input.triggeredBy,
        context: {
          workspaceId: input.context?.workspaceId ?? null,
          userId: input.context?.userId ?? null,
          scopeKind: input.context?.scopeKind ?? null,
          scopeId: input.context?.scopeId ?? null,
        },
        import: input.importResult,
        reports: reportLinks,
      });

  await sendWebhook({
    callbackUrl,
    callbackSecret: input.callbackSecret,
    eventName: 'meeting_notes.import.completed',
    body,
    isFeishu,
  });
}
