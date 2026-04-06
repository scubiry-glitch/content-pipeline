// Knowledge Service — 专家知识源管理
// 功能: 上传/解析/检索 — 会议纪要、访谈记录、PDF、文章等
// 源码参考: expert-library-api.zip/api/src/modules/expert-library/knowledgeService.ts

import type { ExpertLibraryDeps, KnowledgeSource } from './types.js';

// ===== 添加知识源 =====

export async function addKnowledgeSource(
  expertId: string,
  source: {
    source_type: KnowledgeSource['source_type'];
    title: string;
    content: string;           // 原始文本内容
    original_file_url?: string;
    metadata?: Record<string, any>;
  },
  deps: ExpertLibraryDeps
): Promise<{ id: string; summary: string; key_insights: string[] }> {
  // 1. 用 LLM 提取摘要 + 关键洞察
  const { summary, key_insights } = await extractInsights(source.title, source.content, source.source_type, deps);

  // 2. 截断原始内容（DB 存储限制）
  const parsed_content = source.content.substring(0, 8000);

  // 3. 生成语义 embedding（摘要 + 标题 拼接，长度适中）
  const embedText = `${source.title}\n${summary}\n${key_insights.join(' ')}`.substring(0, 512);
  let embedding: number[] | null = null;
  if (deps.llm.embed) {
    try {
      embedding = await deps.llm.embed(embedText);
    } catch { /* embedding 失败不阻断写入 */ }
  }

  // 4. 写入 DB
  const result = await deps.db.query(
    `INSERT INTO expert_knowledge_sources
       (expert_id, source_type, title, original_file_url, parsed_content, summary, key_insights, metadata${embedding ? ', content_embedding' : ''})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8${embedding ? ', $9' : ''})
     RETURNING id`,
    [
      expertId,
      source.source_type,
      source.title,
      source.original_file_url ?? null,
      parsed_content,
      summary,
      JSON.stringify(key_insights),
      JSON.stringify(source.metadata ?? {}),
      ...(embedding ? [`[${embedding.join(',')}]`] : []),
    ]
  );

  return { id: result.rows[0]?.id, summary, key_insights };
}

// ===== 检索知识源 =====

export async function retrieveKnowledge(
  expertId: string,
  topic: string,
  deps: ExpertLibraryDeps,
  limit = 5
): Promise<string | null> {
  try {
    let rows: any[] = [];

    // 优先：语义向量检索（若 embed 可用）
    if (deps.llm.embed) {
      try {
        const topicEmbedding = await deps.llm.embed(topic.substring(0, 256));
        const vectorResult = await deps.db.query(
          `SELECT title, summary, key_insights
           FROM expert_knowledge_sources
           WHERE expert_id = $1
             AND is_active = true
             AND content_embedding IS NOT NULL
           ORDER BY content_embedding <=> $2::vector
           LIMIT $3`,
          [expertId, `[${topicEmbedding.join(',')}]`, limit]
        );
        rows = vectorResult.rows;
      } catch { /* pgvector 不可用，降级 ILIKE */ }
    }

    // 降级：全文检索（ILIKE）
    if (rows.length === 0) {
      const ilikeResult = await deps.db.query(
        `SELECT title, summary, key_insights
         FROM expert_knowledge_sources
         WHERE expert_id = $1
           AND is_active = true
           AND (
             summary ILIKE $2
             OR parsed_content ILIKE $2
             OR title ILIKE $2
           )
         ORDER BY created_at DESC
         LIMIT $3`,
        [expertId, `%${topic.substring(0, 50)}%`, limit]
      );
      rows = ilikeResult.rows;
    }

    // 最终 fallback: 最新记录
    if (rows.length === 0) {
      const fallback = await deps.db.query(
        `SELECT title, summary, key_insights
         FROM expert_knowledge_sources
         WHERE expert_id = $1 AND is_active = true
         ORDER BY created_at DESC LIMIT $2`,
        [expertId, limit]
      );
      rows = fallback.rows;
    }

    if (rows.length === 0) return null;

    return rows.map((row: any) => {
      const insights: string[] = Array.isArray(row.key_insights)
        ? row.key_insights
        : (JSON.parse(row.key_insights || '[]'));
      return `[${row.title}] ${row.summary || ''}${insights.length > 0 ? '\n关键洞察: ' + insights.join('; ') : ''}`;
    }).join('\n\n');
  } catch {
    return null;
  }
}

// ===== 列出知识源 =====

export async function listKnowledgeSources(
  expertId: string,
  deps: ExpertLibraryDeps
): Promise<Array<{
  id: string;
  source_type: string;
  title: string;
  summary: string;
  created_at: string;
}>> {
  try {
    const result = await deps.db.query(
      `SELECT id, source_type, title, summary, created_at
       FROM expert_knowledge_sources
       WHERE expert_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [expertId]
    );
    return result.rows;
  } catch {
    return [];
  }
}

// ===== 删除知识源 =====

export async function deleteKnowledgeSource(
  sourceId: string,
  deps: ExpertLibraryDeps
): Promise<void> {
  await deps.db.query(
    `UPDATE expert_knowledge_sources SET is_active = false WHERE id = $1`,
    [sourceId]
  );
}

// ===== 内部: LLM 提取摘要 + 关键洞察 =====

async function extractInsights(
  title: string,
  content: string,
  sourceType: string,
  deps: ExpertLibraryDeps
): Promise<{ summary: string; key_insights: string[] }> {
  const typeLabel: Record<string, string> = {
    meeting_minutes: '会议纪要',
    interview: '访谈记录',
    conference: '演讲/会议发言',
    publication: '文章/论文',
    link: '网页内容',
  };

  const prompt = `请分析以下${typeLabel[sourceType] || '文档'}（标题: ${title}）：

${content.substring(0, 4000)}

请输出 JSON 格式（只输出 JSON，不要其他内容）:
{
  "summary": "100字以内的核心摘要",
  "key_insights": ["关键洞察1", "关键洞察2", "关键洞察3"]
}`;

  try {
    const raw = await deps.llm.complete(prompt, { temperature: 0.2, maxTokens: 500 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary: parsed.summary || title,
        key_insights: Array.isArray(parsed.key_insights) ? parsed.key_insights.slice(0, 5) : [],
      };
    }
  } catch { /* LLM or parse error, fallback */ }

  return {
    summary: `${title} (${content.substring(0, 100)}...)`,
    key_insights: [],
  };
}
