# Stage 5 优化方案：多格式输出

> **核心问题**：`outputNode` 只更新 status=completed，不生成任何文件。`target_formats` 前端可选 `['markdown','html','ppt']`，但后端全部忽略。

---

## 当前 outputNode 实现

```typescript
// nodes.ts:501-515 — 仅状态更新
export async function outputNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  await query(
    `UPDATE tasks SET status = 'completed', progress = 100, current_stage = 'completed',
     draft_content = $1, updated_at = NOW() WHERE id = $2`,
    [state.draftContent, state.taskId]
  );
  return { status: 'completed', progress: 100 };
}
```

**问题**：
1. 不读取 `target_formats`——不管用户选什么格式，都不生成
2. 不写入 `outputs` 表——下载端点找不到输出文件
3. 无 HTML 渲染能力
4. 无 PDF 导出能力

## 已有可复用服务

| 服务 | 文件 | 关键函数 | 状态 |
|------|------|---------|------|
| 输出下载 | `output.ts` | `download(outputId)` — 支持 md/html | ✅ 基础就绪 |
| 异步终结 | `asyncFinalize.ts` | `startAsyncFinalize(taskId)` | ✅ 生产就绪 |
| 质量门控 | `pipeline.ts:328-346` | 检查 review_reports decision | ✅ 已有 |

**缺失组件**：
- Markdown → HTML 渲染器（需要 `marked` 库 + CSS 模板）
- HTML → PDF 转换器（需要 `puppeteer` 或浏览器端方案）

---

## 优化方案

### 改造 1: 安装依赖

```bash
cd api && npm install marked
npm install -D @types/marked
# PDF 可选方案（较重）:
# npm install puppeteer
```

### 改造 2: 新建 HTML 渲染服务

```typescript
// api/src/services/htmlRenderer.ts — 新建

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

  // 从 h2 标签提取目录
  const tocEntries: { level: number; text: string; id: string }[] = [];
  const bodyWithIds = htmlBody.replace(/<h([23])[^>]*>(.*?)<\/h\1>/g, (match, level, text) => {
    const id = text.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    tocEntries.push({ level: parseInt(level), text: text.replace(/<[^>]*>/g, ''), id });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });

  const toc = options.includeTableOfContents !== false
    ? `<nav class="toc">
        <h2>目录</h2>
        <ul>${tocEntries.map(e =>
          `<li class="toc-${e.level}"><a href="#${e.id}">${e.text}</a></li>`
        ).join('\n')}</ul>
       </nav>`
    : '';

  const cover = options.includeCoverPage !== false
    ? `<div class="cover">
        <h1>${options.title}</h1>
        <p class="cover-meta">${options.date || new Date().toISOString().slice(0, 10)} | ${options.audience || '产业研究'}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
  <style>
    /* 咨询报告样式 — 打印优化 */
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
    .cover h1 { font-size: 28pt; color: #1a365d; border: none; margin-bottom: 0.5em; }
    .cover-meta { font-size: 12pt; color: #718096; }
    .toc { page-break-after: always; }
    .toc h2 { font-size: 16pt; color: #1a365d; }
    .toc ul { list-style: none; padding: 0; }
    .toc li { margin: 0.3em 0; }
    .toc .toc-3 { padding-left: 2em; }
    .toc a { text-decoration: none; color: #2d3748; }
    .toc a:hover { color: #3182ce; }
    h1 { font-size: 22pt; color: #1a365d; border-bottom: 3px solid #1a365d; padding-bottom: 0.3em; }
    h2 { font-size: 16pt; color: #1a365d; margin-top: 2em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
    h3 { font-size: 13pt; color: #2d3748; margin-top: 1.5em; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 10pt; }
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
    .missing-data { background: #fff5f5; border-left: 4px solid #e53e3e; padding: 0.5em 1em; margin: 0.5em 0; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      a { color: #1a202c; text-decoration: none; }
    }
  </style>
</head>
<body>
  ${cover}
  ${toc}
  <div class="content">${bodyWithIds}</div>
</body>
</html>`;
}
```

### 改造 3: outputNode 多格式输出

```typescript
// nodes.ts — outputNode 改造
import { renderMarkdownToHtml } from '../services/htmlRenderer.js';

export async function outputNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const content = state.draftContent || '';
  if (!content || content.trim().length < 100) {
    return { status: 'output_failed', errors: ['No draft content available'] };
  }

  // 读取 target_formats
  const taskResult = await query(
    `SELECT target_formats, topic FROM tasks WHERE id = $1`, [state.taskId]
  );
  const targetFormats: string[] = taskResult.rows[0]?.target_formats || ['markdown'];
  const topic = taskResult.rows[0]?.topic || state.topic;
  const outputIds: string[] = [];

  // 1. Markdown 输出（始终生成）
  const mdOutputId = `output_${uuidv4().slice(0, 8)}`;
  await query(
    `INSERT INTO outputs (id, task_id, format, content, created_at)
     VALUES ($1, $2, 'markdown', $3, NOW())`,
    [mdOutputId, state.taskId, content]
  );
  outputIds.push(mdOutputId);

  // 2. HTML 输出（按需）
  if (targetFormats.includes('html') || targetFormats.includes('pdf')) {
    const htmlContent = renderMarkdownToHtml(content, {
      title: topic,
      includeTableOfContents: true,
      includeCoverPage: true,
    });

    const htmlOutputId = `output_${uuidv4().slice(0, 8)}`;
    await query(
      `INSERT INTO outputs (id, task_id, format, content, created_at)
       VALUES ($1, $2, 'html', $3, NOW())`,
      [htmlOutputId, state.taskId, htmlContent]
    );
    outputIds.push(htmlOutputId);
  }

  // 3. PDF 输出（按需 — 两种方案）
  // 方案 A: 后端 Puppeteer（需安装）
  // 方案 B: 前端通过 HTML 页面 window.print() 导出（零后端成本）
  // 当前采用方案 B: 不在节点内生成 PDF，提供 HTML 下载端点，用户浏览器打印为 PDF

  // 更新任务
  await query(
    `UPDATE tasks SET status = 'completed', progress = 100, current_stage = 'completed',
     output_ids = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(outputIds), state.taskId]
  );

  return {
    status: 'completed',
    progress: 100,
  };
}
```

### 改造 4: output.ts 补充 PDF 下载端点

```typescript
// output.ts — 扩展 download 方法
const extensions: Record<string, string> = {
  markdown: 'md',
  html: 'html',
  pdf: 'pdf',
};

const contentTypes: Record<string, string> = {
  markdown: 'text/markdown; charset=utf-8',
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
};
```

如果后续选择 Puppeteer 方案，新增 `/api/v1/outputs/:id/pdf` 端点：
```typescript
// routes 新增
app.get('/api/v1/outputs/:id/pdf', async (req, reply) => {
  const output = await outputService.getById(req.params.id);
  if (!output || output.format !== 'html') return reply.status(404).send();

  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(output.content, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '2.5cm', bottom: '2.5cm', left: '2cm', right: '2cm' },
    printBackground: true,
  });
  await browser.close();

  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `attachment; filename="report_${output.task_id}.pdf"`);
  return reply.send(pdf);
});
```

---

## 改造范围

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `services/htmlRenderer.ts` | 新建 — Markdown→HTML 渲染器 + CSS 模板 | 中 |
| `langgraph/nodes.ts` | outputNode 多格式生成逻辑 | 中 |
| `services/output.ts` | 补充 pdf contentType | 小 |
| `package.json` | 安装 `marked`，可选 `puppeteer` | 小 |

## PDF 方案选型

| 方案 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| **浏览器端 Print** | 零后端成本，用户可微调 | 需手动操作 | MVP / 用户量少 |
| **Puppeteer** | 全自动，高保真 | 依赖重（~400MB） | 自动化 / API 调用 |
| **wkhtmltopdf** | 轻量 | 渲染能力弱于 Chrome | 服务器资源受限 |

**建议**: MVP 阶段先用浏览器端方案，后续按需加 Puppeteer。
