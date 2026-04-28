// runs/claudeSessionFiles.ts — read Claude Code CLI session jsonl files
//
// Claude CLI stores session transcripts at:
//   ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl
// where <sanitized-cwd> is the absolute cwd with '/' replaced by '-'.
//
// jsonl format (one JSON object per line):
//   { type: 'user'|'assistant'|'summary'|...,
//     uuid, parentUuid, sessionId, timestamp, cwd,
//     message: { role, content: string | Array<{type,text,...}>, ... },
//     ... }
//
// We export tiny helpers because both the existing claudeCliRunner (which
// just spawns and reads stdout) and the new meetingChat endpoint (which
// reads transcripts back from disk for /chat/history) need to agree on
// path resolution.

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function claudeProjectsDir(cwd: string = process.cwd()): string {
  const sanitized = cwd.replace(/\//g, '-');
  return join(homedir(), '.claude', 'projects', sanitized);
}

export function claudeSessionFilePath(sessionId: string, cwd: string = process.cwd()): string {
  return join(claudeProjectsDir(cwd), `${sessionId}.jsonl`);
}

export interface ClaudeSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  uuid?: string;
}

/**
 * Read a session's transcript and return user/assistant message pairs in order.
 * Filters out:
 *   - System / meta lines (summary, file-history-snapshot, etc.)
 *   - Tool use / tool result blocks (kept inline in assistant text via stringification)
 *   - Pure-meta entries with no message body
 *
 * Returns { available: false } if the file doesn't exist (caller decides what to do).
 */
export async function readClaudeSessionMessages(
  sessionId: string,
  cwd: string = process.cwd(),
): Promise<
  | { available: true; messages: ClaudeSessionMessage[] }
  | { available: false; reason: 'session-file-missing' | 'session-file-unreadable'; error?: string }
> {
  const path = claudeSessionFilePath(sessionId, cwd);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return { available: false, reason: 'session-file-missing' };
    return { available: false, reason: 'session-file-unreadable', error: err.message };
  }

  const messages: ClaudeSessionMessage[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;

    const t = entry.type;
    if (t !== 'user' && t !== 'assistant') continue;
    const msg = entry.message;
    if (!msg) continue;

    // 早期 user 消息可能是 meta（CLI 自己的 hook 触发），role 为 'user' 但 content 是工具事件 —— 跳过没文字的。
    const text = extractText(msg.content);
    if (!text) continue;

    messages.push({
      role: t,
      content: text,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
      uuid: typeof entry.uuid === 'string' ? entry.uuid : undefined,
    });
  }
  return { available: true, messages };
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as any;
      if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
      else if (b.type === 'thinking' && typeof b.thinking === 'string') {
        // 不展示 thinking 给前端 —— 隐含上下文
        continue;
      }
      // tool_use / tool_result 块跳过（聊天回放不需要）
    }
    return parts.join('').trim();
  }
  return '';
}
