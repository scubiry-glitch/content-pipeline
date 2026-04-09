// HTML 渲染服务 — Markdown → 带样式咨询报告 HTML
// 支持: 封面页、自动目录、表格美化、打印优化、缺失数据高亮

import { marked } from 'marked';

export interface HtmlRenderOptions {
  title: string;
  date?: string;
  audience?: string;
  includeTableOfContents?: boolean;
  includeCoverPage?: boolean;
}

/**
 * Markdown → 带样式 HTML 报告
 */
export function renderMarkdownToHtml(markdown: string, options: HtmlRenderOptions): string {
  const htmlBody = marked.parse(markdown) as string;

  // 从 h2/h3 标签提取目录
  const tocEntries: { level: number; text: string; id: string }[] = [];
  const bodyWithIds = htmlBody.replace(/<h([23])[^>]*>(.*?)<\/h\1>/g, (_match, level, text) => {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    const id = cleanText.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '').toLowerCase();
    tocEntries.push({ level: parseInt(level), text: cleanText, id });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });

  const toc = options.includeTableOfContents !== false && tocEntries.length > 0
    ? `<nav class="toc">
        <h2>目录</h2>
        <ul>${tocEntries.map(e =>
          `<li class="toc-${e.level}"><a href="#${e.id}">${e.text}</a></li>`
        ).join('\n')}</ul>
       </nav>`
    : '';

  const cover = options.includeCoverPage !== false
    ? `<div class="cover">
        <h1>${escapeHtml(options.title)}</h1>
        <p class="cover-meta">${options.date || new Date().toISOString().slice(0, 10)}</p>
        <p class="cover-audience">${escapeHtml(options.audience || '产业研究报告')}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style>${CSS_TEMPLATE}</style>
</head>
<body>
  ${cover}
  ${toc}
  <div class="content">${bodyWithIds}</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS_TEMPLATE = `
  @page { size: A4; margin: 2.5cm 2cm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", serif;
    font-size: 11pt; line-height: 1.8; color: #1a202c;
    max-width: 210mm; margin: 0 auto; padding: 2cm;
  }
  .cover {
    text-align: center; page-break-after: always;
    padding-top: 35vh; min-height: 100vh;
  }
  .cover h1 {
    font-size: 28pt; color: #1a365d; border: none; margin-bottom: 0.3em;
    letter-spacing: 0.05em;
  }
  .cover-meta { font-size: 12pt; color: #718096; margin-top: 1em; }
  .cover-audience { font-size: 11pt; color: #a0aec0; }
  .toc { page-break-after: always; }
  .toc h2 { font-size: 16pt; color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 0.3em; }
  .toc ul { list-style: none; padding: 0; }
  .toc li { margin: 0.4em 0; font-size: 11pt; }
  .toc .toc-3 { padding-left: 2em; font-size: 10pt; color: #4a5568; }
  .toc a { text-decoration: none; color: #2d3748; }
  .toc a:hover { color: #3182ce; }
  h1 { font-size: 20pt; color: #1a365d; border-bottom: 3px solid #1a365d; padding-bottom: 0.3em; margin-top: 2.5em; }
  h2 { font-size: 15pt; color: #1a365d; margin-top: 2em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
  h3 { font-size: 12pt; color: #2d3748; margin-top: 1.5em; }
  p { margin: 0.8em 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 10pt; }
  th { background: #1a365d; color: white; padding: 10px 12px; text-align: left; font-weight: 600; }
  td { border: 1px solid #e2e8f0; padding: 8px 12px; }
  tr:nth-child(even) { background: #f7fafc; }
  blockquote {
    border-left: 4px solid #3182ce; margin: 1em 0; padding: 0.8em 1.2em;
    background: #ebf8ff; color: #2a4365; font-style: italic;
  }
  code { background: #edf2f7; padding: 2px 6px; border-radius: 3px; font-size: 10pt; }
  pre { background: #2d3748; color: #e2e8f0; padding: 1em; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  strong { color: #1a365d; }
  ul, ol { margin: 0.5em 0; padding-left: 2em; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    a { color: #1a202c; text-decoration: none; }
  }
`;
