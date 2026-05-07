import { createHmac } from 'node:crypto';
import { query } from '../../../db/connection.js';

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

function isFeishuWebhook(url: string): boolean {
  return url.startsWith('https://open.feishu.cn/open-apis/bot/');
}

function buildFeishuCard(
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

function baseUrl(): string {
  return (
    process.env.PUBLIC_API_BASE_URL
    || process.env.API_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || 'http://localhost:5173'
  ).replace(/\/$/, '');
}

async function makeSharedUrl(meetingId: string): Promise<string | null> {
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

async function buildReportLinks(assetIds: string[]): Promise<Array<{ assetId: string; sharedUrl: string | null }>> {
  const out: Array<{ assetId: string; sharedUrl: string | null }> = [];
  for (const assetId of assetIds) {
    out.push({
      assetId,
      sharedUrl: await makeSharedUrl(assetId),
    });
  }
  return out;
}

export async function emitImportWebhook(input: ImportWebhookInput): Promise<void> {
  const callbackUrl = (input.callbackUrl || '').trim();
  if (!callbackUrl) return;

  const reportLinks = await buildReportLinks(input.importResult.assetIds || []);

  let body: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (isFeishuWebhook(callbackUrl)) {
    body = JSON.stringify(buildFeishuCard(input, reportLinks));
  } else {
    const payload = {
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
    };
    body = JSON.stringify(payload);
    headers['X-CP-Event'] = 'meeting_notes.import.completed';
    const secret = (input.callbackSecret || '').trim();
    if (secret) {
      headers['X-CP-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    }
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
  try {
    const res = await fetch(callbackUrl, { method: 'POST', headers, body, signal: ac.signal });
    const resText = await res.text().catch(() => '');
    console.log(`[MeetingNoteWebhook] ${isFeishuWebhook(callbackUrl) ? 'feishu' : 'generic'} → HTTP ${res.status} ${resText.slice(0, 200)}`);
  } catch (err) {
    console.warn('[MeetingNoteWebhook] callback failed:', (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

