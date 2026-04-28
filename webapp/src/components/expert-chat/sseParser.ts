// SSE chunk parser shared by useExpertChatStream / useMeetingChatStream.
//
// Both backends emit the same wire shape:
//   event: <name>\n
//   data:  <json>\n
//   \n          ← terminator
// Concatenated chunks may split across reads, so we buffer and only emit
// when we see a blank-line block.
//
// Recognised events (any other name is ignored by callers):
//   reasoning  { delta: string }
//   content    { delta: string }
//   meta       { conversation_id?: string, sessionId?: string,
//                cacheReadTokens?: number, ... }
//   error      { message: string }
//   done       { ... }

export interface SseFrame {
  event: string;
  data: unknown;
}

export class SseStreamReader {
  private buf = '';

  /** Feed a UTF-8 chunk; returns zero-or-more complete frames. */
  push(chunk: string): SseFrame[] {
    this.buf += chunk;
    const frames: SseFrame[] = [];
    let idx = this.buf.indexOf('\n\n');
    while (idx >= 0) {
      const block = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      const f = parseBlock(block);
      if (f) frames.push(f);
      idx = this.buf.indexOf('\n\n');
    }
    return frames;
  }

  /** Flush any remaining buffer (call on stream close in case server didn't end with \n\n). */
  flush(): SseFrame[] {
    if (!this.buf.trim()) return [];
    const f = parseBlock(this.buf);
    this.buf = '';
    return f ? [f] : [];
  }
}

function parseBlock(block: string): SseFrame | null {
  let event = 'message';
  let dataStr = '';
  for (const ln of block.split('\n')) {
    if (ln.startsWith('event:')) event = ln.slice(6).trim();
    else if (ln.startsWith('data:')) dataStr += ln.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}
