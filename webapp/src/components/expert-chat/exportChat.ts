// 导出工具：把 ChatMessage[] 序列化成 markdown / 下载、走 html2pdf 出 pdf。
//
// 共用约定：
//   - 文件名形如 chat-<meetingId8>-<unix>.{md,pdf}
//   - markdown 顶部有 YAML frontmatter，方便 wiki / 第三方解析
//   - pdf 由调用方先 render <PrintableChat/> 到一个隐藏 DOM 节点，再传给 exportChatToPdf
//
// 不引依赖 utils/export.ts（其 downloadBlob 是 private），就地内联一个小函数。

import type { ChatMessage } from './types.js';

export interface ExportMeta {
  meetingId: string;
  meetingTitle: string;
  /** 'resume'（claude --resume）或 'expert'（expert-library） */
  mode: 'resume' | 'expert';
  /** Resume 模式下的 sessionId；Expert 模式下可为 expertId */
  sessionId?: string | null;
  expertId?: string | null;
  expertName?: string | null;
  runCount?: number | null;
  /** 张力作用域（如果对话发起时绑定了某条张力） */
  tension?: { id: string; topic: string } | null;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

export function formatExportTimestamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function defaultExportFilename(meta: ExportMeta, ext: 'md' | 'pdf'): string {
  const idShort = (meta.meetingId || 'meeting').slice(0, 8);
  const ts = formatExportTimestamp().replace(/[T:]/g, '-');
  return `chat-${idShort}-${ts}.${ext}`;
}

// ============================================================
// Markdown 序列化
// ============================================================

function escapeYaml(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  // YAML 中带特殊字符的字符串用双引号 + 转义
  return JSON.stringify(String(v));
}

export function messagesToMarkdown(messages: ChatMessage[], meta: ExportMeta): string {
  const exportedAt = new Date().toISOString();
  const fm: Array<[string, string]> = [
    ['type', escapeYaml('source')],
    ['subtype', escapeYaml('meeting-chat-transcript')],
    ['app', escapeYaml('meeting-notes')],
    ['via', escapeYaml('meeting-chat-drawer')],
    ['mode', escapeYaml(meta.mode)],
    ['meetingId', escapeYaml(meta.meetingId)],
    ['meetingTitle', escapeYaml(meta.meetingTitle)],
  ];
  if (meta.sessionId) fm.push(['sessionId', escapeYaml(meta.sessionId)]);
  if (meta.expertId) fm.push(['expertId', escapeYaml(meta.expertId)]);
  if (meta.expertName) fm.push(['expertName', escapeYaml(meta.expertName)]);
  if (typeof meta.runCount === 'number') fm.push(['runCount', escapeYaml(meta.runCount)]);
  if (meta.tension) {
    fm.push(['tensionId', escapeYaml(meta.tension.id)]);
    fm.push(['tensionTopic', escapeYaml(meta.tension.topic)]);
  }
  fm.push(['messageCount', escapeYaml(messages.filter((m) => m.kind !== 'context').length)]);
  fm.push(['exportedAt', escapeYaml(exportedAt)]);

  const frontmatter = ['---', ...fm.map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n');

  const headerLines: string[] = [];
  headerLines.push(`# 会议追问 · ${meta.meetingTitle}`);
  headerLines.push('');
  const metaLine: string[] = [];
  metaLine.push(`模式: **${meta.mode === 'resume' ? 'Resume' : 'Expert'}**`);
  if (meta.mode === 'resume' && meta.sessionId) metaLine.push(`session ${meta.sessionId.slice(0, 6)}…${meta.sessionId.slice(-4)}`);
  if (meta.mode === 'expert' && meta.expertName) metaLine.push(`专家 ${meta.expertName}`);
  if (meta.tension) metaLine.push(`张力 ${meta.tension.id}「${meta.tension.topic}」`);
  metaLine.push(`导出时间 ${exportedAt}`);
  headerLines.push('> ' + metaLine.join(' · '));
  headerLines.push('');
  headerLines.push('---');
  headerLines.push('');

  const bodyLines: string[] = [];
  for (const m of messages) {
    if (m.kind === 'context') {
      bodyLines.push(`### 📌 上下文`);
      bodyLines.push('');
      for (const ln of m.content.split('\n')) bodyLines.push(`> ${ln}`);
      bodyLines.push('');
      continue;
    }
    const tsLabel = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN') : '';
    if (m.role === 'user') {
      bodyLines.push(`### 🧑 用户 · ${tsLabel}`);
    } else if (m.role === 'assistant') {
      bodyLines.push(`### 🤖 助手 · ${tsLabel}`);
    } else {
      bodyLines.push(`### ⚙ ${m.role} · ${tsLabel}`);
    }
    bodyLines.push('');
    if (m.reasoning && m.reasoning.trim()) {
      bodyLines.push('<details><summary>💭 思考过程</summary>');
      bodyLines.push('');
      for (const ln of m.reasoning.split('\n')) bodyLines.push(`> ${ln}`);
      bodyLines.push('');
      bodyLines.push('</details>');
      bodyLines.push('');
    }
    bodyLines.push(m.content || '_（空）_');
    bodyLines.push('');
  }

  return frontmatter + headerLines.join('\n') + '\n' + bodyLines.join('\n');
}

// ============================================================
// 下载 helpers
// ============================================================

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 让浏览器有机会触发下载，再撤销
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadChatMarkdown(messages: ChatMessage[], meta: ExportMeta): void {
  const md = messagesToMarkdown(messages, meta);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, defaultExportFilename(meta, 'md'));
}

// ============================================================
// PDF：调用方先把 PrintableChat 渲染到一个 DOM 节点，再调下面这个
// ============================================================

export async function exportChatToPdf(node: HTMLElement, meta: ExportMeta): Promise<void> {
  // 动态 import 减少首屏体积
  const html2pdf = (await import('html2pdf.js')).default;
  const filename = defaultExportFilename(meta, 'pdf');
  await html2pdf()
    .from(node)
    .set({
      margin: [12, 12, 12, 12], // mm
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    } as Record<string, unknown>)
    .save();
}
