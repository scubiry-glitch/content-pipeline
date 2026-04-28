// meetingChat.ts — 「追问此会」抽屉的后端：在已有的 meeting-notes Claude CLI session 上 resume 聊天
//
// 端点（前缀由 router.ts 挂载时决定）：
//   GET  /meetings/:id/chat/history       读 ~/.claude/projects/<cwd>/<sessionId>.jsonl
//                                          过滤掉「分析期 turn」（用户 prompt 含 === ROLE === 标记 + 紧跟的 JSON 输出）
//                                          返回剩下的 user/assistant 对话历史
//   POST /meetings/:id/chat/stream        spawn `claude --resume <sid> --output-format stream-json
//                                          --include-partial-messages --verbose`
//                                          把 stream-json 翻译成 SSE 帧给前端：content / reasoning / meta / error
//   POST /meetings/:id/chat/save-to-wiki  把整段对话以 .md 落到
//                                          data/content-wiki/default/sources/meeting/meeting-chats/<meetingId8>-<unix>.md
//                                          frontmatter 走 wikiFrontmatter.renderFrontmatter
//
// Why this exists（与 expert-library 不同的两件事）：
//   - meeting-notes 用 Claude CLI 跑分析，session 文件本身就是真相源（jsonl 落盘）
//   - prompt cache 已经把整场会议的 system prompt + transcript 缓存下来；resume 命中即极便宜
//   一个 meeting 同一时刻只允许一条 chat spawn 排队，避免和 pipeline re-analysis 撞 session 文件。
//   并发 lock 是进程内的 Map<meetingId, Promise>，多 worker 部署不靠谱（先这么做，文档标注限制）。

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { authenticate } from '../../middleware/auth.js';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';
import { readClaudeSessionMessages } from './runs/claudeSessionFiles.js';
import { renderFrontmatter } from '../content-library/wiki/wikiFrontmatter.js';
import { resolveWikiSubPath, resolveWikiRoot } from '../../lib/wikiRoot.js';
import { relative } from 'node:path';

const CLAUDE_BIN = process.env.CLAUDE_CLI_BIN ?? 'claude';
const CLAUDE_MODEL = process.env.CLAUDE_CLI_MODEL ?? 'opus';
const CHAT_TIMEOUT_MS = Number(process.env.CLAUDE_CHAT_TIMEOUT_MS ?? 180_000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// === per-meeting lock ===
// 进程内 fast-fail lock：同一 meeting 同一时刻只允许一个 chat spawn；竞争者直接拿 409。
// pipeline runEngine 后续可读这个 set 防撞车（本期不接，只防自己）。多 worker 部署不靠谱（文档标注）。
const busyMeetings = new Set<string>();

// === 分析期 turn 过滤 ===
// 由 promptTemplates/claudeCliFullPipeline.buildFullPrompt 产出的 prompt 都带 `=== ROLE ===` 标记
// （scope 模板同此约定，详见 runs/promptTemplates/claudeCliFullPipeline.ts）。
// 匹配到这种 user 消息，把它和它之后紧邻的 assistant 消息一起跳过。
function isAnalysisPrompt(content: string): boolean {
  return content.includes('=== ROLE ===') || content.includes('JSON Schema');
}

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  uuid?: string;
}

function filterAnalysisTurns(
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string; uuid?: string }>,
): ChatHistoryMessage[] {
  const out: ChatHistoryMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user' && isAnalysisPrompt(m.content)) {
      // skip this user prompt + the next assistant reply (the JSON analysis output)
      if (i + 1 < messages.length && messages[i + 1].role === 'assistant') i++;
      continue;
    }
    out.push(m);
  }
  return out;
}

// === SSE helper ===
function sseEvent(reply: any, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

// === stream-json 行解析 → SSE 帧 ===
//
// 已确认（2026-04-28，claude 2.1.119）的 stream-json 关键事件：
//   {type:"system",subtype:"init",...}
//   {type:"system",subtype:"status",status:"requesting"}
//   {type:"stream_event",event:{type:"message_start",message:{usage:{cache_read_input_tokens,...}}}}
//   {type:"stream_event",event:{type:"content_block_start",content_block:{type:"text"|"thinking"...}}}
//   {type:"stream_event",event:{type:"content_block_delta",delta:{type:"text_delta",text}}}
//   {type:"stream_event",event:{type:"content_block_delta",delta:{type:"thinking_delta",thinking}}}
//   {type:"stream_event",event:{type:"content_block_stop"}}
//   {type:"stream_event",event:{type:"message_delta",usage:{...}}}
//   {type:"stream_event",event:{type:"message_stop"}}
//   {type:"assistant",message:{...}}            // 整段 assistant message 在 stream 结束后再来一次
//   {type:"result",subtype:"success"|"error_during_execution",result,session_id,usage,total_cost_usd}
//
// 注意：CLI 要求 --output-format=stream-json 同时配 --verbose
function dispatchStreamJsonLine(reply: any, line: string, state: { earlyMetaSent: boolean }): void {
  let entry: any;
  try { entry = JSON.parse(line); } catch { return; }
  if (!entry || typeof entry !== 'object') return;

  if (entry.type === 'stream_event' && entry.event?.type === 'content_block_delta') {
    const d = entry.event.delta;
    if (d?.type === 'text_delta' && typeof d.text === 'string' && d.text.length > 0) {
      sseEvent(reply, 'content', { delta: d.text });
    } else if (d?.type === 'thinking_delta' && typeof d.thinking === 'string' && d.thinking.length > 0) {
      sseEvent(reply, 'reasoning', { delta: d.thinking });
    }
    return;
  }

  if (entry.type === 'stream_event' && entry.event?.type === 'message_start' && !state.earlyMetaSent) {
    const usage = entry.event.message?.usage;
    if (usage) {
      sseEvent(reply, 'meta', {
        phase: 'start',
        cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0) || 0,
        cacheCreationTokens: Number(usage.cache_creation_input_tokens ?? 0) || 0,
      });
      state.earlyMetaSent = true;
    }
    return;
  }

  if (entry.type === 'result') {
    if (entry.subtype === 'error_during_execution' || entry.is_error) {
      sseEvent(reply, 'error', {
        message: entry.result || entry.api_error_status || 'unknown error',
      });
      return;
    }
    const usage = entry.usage ?? {};
    sseEvent(reply, 'meta', {
      phase: 'final',
      sessionId: entry.session_id ?? null,
      cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0) || 0,
      inputTokens: Number(usage.input_tokens ?? 0) || 0,
      outputTokens: Number(usage.output_tokens ?? 0) || 0,
      totalCostUsd: typeof entry.total_cost_usd === 'number' ? entry.total_cost_usd : null,
    });
    return;
  }
}

// === db 取 sessionId ===
async function getMeetingSession(
  engine: MeetingNotesEngine,
  meetingId: string,
): Promise<{ sessionId: string; lastResumedAt?: string; runCount?: number } | null> {
  const r = await engine.deps.db.query(
    `SELECT metadata->'claudeSession' AS cs FROM assets WHERE id = $1 LIMIT 1`,
    [meetingId],
  );
  const cs = r.rows[0]?.cs;
  if (!cs || typeof cs.sessionId !== 'string' || !cs.sessionId) return null;
  return {
    sessionId: cs.sessionId,
    lastResumedAt: typeof cs.lastResumedAt === 'string' ? cs.lastResumedAt : undefined,
    runCount: typeof cs.runCount === 'number' ? cs.runCount : undefined,
  };
}

// ============================================================
// Plugin
// ============================================================

export function createMeetingChatRoutes(engine: MeetingNotesEngine): FastifyPluginAsync {
  return async function meetingChatPlugin(fastify: FastifyInstance) {

    // ---- GET /meetings/:id/chat/history ----
    fastify.get('/meetings/:id/chat/history', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) {
        reply.status(400);
        return { available: false, reason: 'invalid-id' };
      }

      const session = await getMeetingSession(engine, id);
      if (!session) return { available: false, reason: 'no-session' };

      const read = await readClaudeSessionMessages(session.sessionId);
      if (!read.available) {
        return {
          available: false,
          reason: read.reason,
          sessionId: session.sessionId,
        };
      }

      const messages = filterAnalysisTurns(read.messages);
      return {
        available: true,
        sessionId: session.sessionId,
        runCount: session.runCount ?? null,
        lastResumedAt: session.lastResumedAt ?? null,
        messages,
      };
    });

    // ---- POST /meetings/:id/chat/stream ----
    fastify.post('/meetings/:id/chat/stream', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as any) ?? {};
      const userMessage: string = typeof body.message === 'string' ? body.message.trim() : '';
      const tensionScope: { id?: string; topic?: string } | undefined =
        body.tensionScope && typeof body.tensionScope === 'object' ? body.tensionScope : undefined;

      if (!UUID_RE.test(id)) {
        reply.status(400);
        return { error: 'invalid-id' };
      }
      if (!userMessage) {
        reply.status(400);
        return { error: 'message required' };
      }

      const session = await getMeetingSession(engine, id);
      if (!session) {
        reply.status(400);
        return { error: 'no claude session for this meeting' };
      }

      // 加锁：同一 meeting 同时刻只跑一个 chat（fast-fail）
      if (busyMeetings.has(id)) {
        reply.status(409);
        return { error: 'busy', message: '该会议正在被其他对话或分析占用，请稍候重试' };
      }
      busyMeetings.add(id);

      // 拼最终 prompt
      const finalPrompt = tensionScope?.id && tensionScope?.topic
        ? `请聚焦 ${tensionScope.id}「${tensionScope.topic}」回答以下问题：\n\n${userMessage}`
        : userMessage;

      // SSE headers（Fastify 原始 reply）
      reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders?.();

      try {
        const promptFile = join(tmpdir(), `mn-chat-${id}-${Date.now()}.txt`);
        await writeFile(promptFile, finalPrompt, 'utf8');

        const cliBinShell = CLAUDE_BIN.includes(' ') ? `"${CLAUDE_BIN}"` : CLAUDE_BIN;
        const modelFlag = CLAUDE_MODEL && CLAUDE_MODEL.trim() ? ` --model '${CLAUDE_MODEL.replace(/'/g, "'\\''")}'` : '';
        // session UUID shell-safe
        const cmd = `${cliBinShell} -p --resume '${session.sessionId}'${modelFlag} --output-format stream-json --include-partial-messages --verbose --max-turns 1 < '${promptFile}'`;

        const proc = spawn('sh', ['-c', cmd], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
        });

        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, CHAT_TIMEOUT_MS);

        const state = { earlyMetaSent: false };
        let stdoutBuf = '';
        let lastSessionId: string | null = session.sessionId;

        // 行缓冲解析 stdout
        proc.stdout.on('data', (chunk: Buffer) => {
          stdoutBuf += chunk.toString('utf8');
          let nl = stdoutBuf.indexOf('\n');
          while (nl >= 0) {
            const line = stdoutBuf.slice(0, nl).trim();
            stdoutBuf = stdoutBuf.slice(nl + 1);
            if (line) {
              dispatchStreamJsonLine(reply, line, state);
              // 抓 session_id 用来更新 lastResumedAt（resume 通常不变；但留个保险）
              try {
                const o = JSON.parse(line);
                if (typeof o?.session_id === 'string') lastSessionId = o.session_id;
              } catch { /* ignore */ }
            }
            nl = stdoutBuf.indexOf('\n');
          }
        });

        let stderrBuf = '';
        proc.stderr.on('data', (c: Buffer) => { stderrBuf += c.toString('utf8'); });

        const exitCode: number = await new Promise((res) => proc.on('close', (code) => res(code ?? -1)));
        clearTimeout(timer);
        await unlink(promptFile).catch(() => { /* swallow */ });

        if (exitCode !== 0) {
          sseEvent(reply, 'error', {
            message: `claude exit ${exitCode}${stderrBuf ? `: ${stderrBuf.slice(0, 500)}` : ''}`,
          });
        }

        // 写回 lastResumedAt + runCount（沿用 runEngine 的更新模式）
        try {
          await engine.deps.db.query(
            `UPDATE assets
                SET metadata = jsonb_set(
                  jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{claudeSession,lastResumedAt}',
                    to_jsonb($2::text)
                  ),
                  '{claudeSession,runCount}',
                  to_jsonb(COALESCE((metadata->'claudeSession'->>'runCount')::int, 0) + 1)
                )
              WHERE id = $1`,
            [id, new Date().toISOString()],
          );
        } catch (e) {
          request.log.warn({ id, err: (e as Error).message }, 'meetingChat: write claudeSession metadata failed');
        }

        sseEvent(reply, 'done', { sessionId: lastSessionId });
        reply.raw.end();
      } catch (e) {
        request.log.error({ id, err: (e as Error).message }, 'meetingChat stream spawn failed');
        try {
          sseEvent(reply, 'error', { message: (e as Error).message });
          reply.raw.end();
        } catch { /* swallow */ }
      } finally {
        busyMeetings.delete(id);
      }

      return reply;
    });

    // ---- POST /meetings/:id/chat/save-to-wiki ----
    // 把整段对话以 .md 文件落到 data/content-wiki/default/sources/meeting/meeting-chats/，
    // frontmatter 与现有 wiki 约定一致（type: source, app: meeting-notes）。
    fastify.post('/meetings/:id/chat/save-to-wiki', { preHandler: authenticate }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as any) ?? {};
      if (!UUID_RE.test(id)) {
        reply.status(400);
        return { error: 'invalid-id' };
      }

      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (messages.length === 0) {
        reply.status(400);
        return { error: 'empty-messages' };
      }

      const meta = {
        meetingTitle: typeof body.meetingTitle === 'string' ? body.meetingTitle : '会议',
        mode: body.mode === 'expert' ? 'expert' : 'resume' as 'resume' | 'expert',
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
        expertId: typeof body.expertId === 'string' ? body.expertId : null,
        expertName: typeof body.expertName === 'string' ? body.expertName : null,
        runCount: typeof body.runCount === 'number' ? body.runCount : null,
        tension: body.tension && typeof body.tension === 'object'
          ? { id: String(body.tension.id ?? ''), topic: String(body.tension.topic ?? '') }
          : null,
      };

      const now = new Date();
      const unix = Math.floor(now.getTime() / 1000);
      const idShort = id.slice(0, 8);
      const fileName = `${idShort}-${unix}.md`;
      const wikiDir = resolveWikiSubPath('sources/meeting/meeting-chats');
      const filePath = join(wikiDir, fileName);

      // frontmatter
      const frontmatter = renderFrontmatter({
        type: 'source',
        subtype: 'meeting-chat-transcript',
        app: 'meeting-notes',
        generatedBy: 'manual-edit',
        canonical_name: `会议追问 · ${meta.meetingTitle}`,
        slug: `meeting-chat-${idShort}-${unix}`,
        title: `会议追问 · ${meta.meetingTitle}`,
        meetingId: id,
        date: now.toISOString().slice(0, 10),
        updatedAt: now.toISOString(),
        autoGenerated: false,
        // 透传字段
        mode: meta.mode,
        sessionId: meta.sessionId ?? undefined,
        expertId: meta.expertId ?? undefined,
        expertName: meta.expertName ?? undefined,
        runCount: meta.runCount ?? undefined,
        tensionId: meta.tension?.id || undefined,
        tensionTopic: meta.tension?.topic || undefined,
        messageCount: messages.filter((m: any) => m && m.kind !== 'context').length,
        exportedAt: now.toISOString(),
      } as any);

      // body
      const lines: string[] = [];
      lines.push(`# 会议追问 · ${meta.meetingTitle}`);
      lines.push('');
      const metaParts: string[] = [];
      metaParts.push(`模式: **${meta.mode === 'resume' ? 'Resume' : 'Expert'}**`);
      if (meta.mode === 'resume' && meta.sessionId) {
        metaParts.push(`session ${meta.sessionId.slice(0, 6)}…${meta.sessionId.slice(-4)}`);
      }
      if (meta.mode === 'expert' && meta.expertName) metaParts.push(`专家 ${meta.expertName}`);
      if (meta.tension && meta.tension.id) {
        metaParts.push(`张力 ${meta.tension.id}「${meta.tension.topic}」`);
      }
      metaParts.push(`导出时间 ${now.toLocaleString('zh-CN')}`);
      lines.push(`> ${metaParts.join(' · ')}`);
      lines.push('');
      lines.push('---');
      lines.push('');

      for (const m of messages) {
        if (!m || typeof m !== 'object') continue;
        const role = m.role;
        const content = String(m.content ?? '');
        const ts = typeof m.timestamp === 'string' ? new Date(m.timestamp).toLocaleString('zh-CN') : '';
        if (m.kind === 'context') {
          lines.push(`### 📌 上下文`);
          lines.push('');
          for (const ln of content.split('\n')) lines.push(`> ${ln}`);
          lines.push('');
          continue;
        }
        const head = role === 'user' ? '🧑 用户' : role === 'assistant' ? '🤖 助手' : `⚙ ${String(role)}`;
        lines.push(`### ${head} · ${ts}`);
        lines.push('');
        if (m.reasoning && String(m.reasoning).trim()) {
          lines.push('<details><summary>💭 思考过程</summary>');
          lines.push('');
          for (const ln of String(m.reasoning).split('\n')) lines.push(`> ${ln}`);
          lines.push('');
          lines.push('</details>');
          lines.push('');
        }
        lines.push(content || '_（空）_');
        lines.push('');
      }

      const fileContent = `${frontmatter}\n\n${lines.join('\n')}`;

      try {
        await mkdir(wikiDir, { recursive: true });
        await writeFile(filePath, fileContent, 'utf8');
      } catch (e) {
        request.log.error({ id, filePath, err: (e as Error).message }, 'save-to-wiki failed');
        reply.status(500);
        return { error: 'write-failed', message: (e as Error).message };
      }

      // 给前端返回 vault 内相对路径 (e.g. "sources/meeting/meeting-chats/<file>.md")
      const wikiRoot = resolveWikiRoot();
      const relativePath = relative(wikiRoot, filePath);
      return { ok: true, path: relativePath, slug: `meeting-chat-${idShort}-${unix}` };
    });

  };
}
