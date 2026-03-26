// ============================================
// v6.2 Assets AI 批量处理 - 文档分块服务
// ============================================

import { DocumentChunk } from './types.js';

// ============================================
// 分块配置
// ============================================
export interface ChunkingConfig {
  maxChunkSize: number;     // 最大 token 数 (默认 512)
  overlap: number;          // 重叠 token 数 (默认 50)
  preserveStructure: boolean; // 是否保留文档结构
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxChunkSize: 512,
  overlap: 50,
  preserveStructure: true,
};

// ============================================
// 文档解析结果
// ============================================
export interface ParsedDocument {
  title: string;
  abstract?: string;
  tableOfContents?: string[];
  chapters: Array<{
    title: string;
    content: string;
    level: number;
  }>;
  charts?: Array<{
    id: string;
    caption: string;
    type: 'table' | 'image' | 'chart';
  }>;
  conclusion?: string;
  references?: string[];
  metadata: {
    pageCount?: number;
    wordCount?: number;
    language?: string;
  };
}

// ============================================
// 文档分块服务
// ============================================
export class DocumentChunkingService {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  }

  /**
   * 将解析后的文档分块
   */
  chunkDocument(document: ParsedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    // 1. 提取摘要块 (最高优先级)
    if (document.abstract) {
      chunks.push({
        chunkIndex: chunkIndex++,
        text: document.abstract,
        type: 'abstract',
        priority: 10,
      });
    }

    // 2. 处理目录
    if (document.tableOfContents && document.tableOfContents.length > 0) {
      const tocText = document.tableOfContents.join('\n');
      if (tocText.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          text: tocText,
          type: 'toc',
          priority: 9,
        });
      }
    }

    // 3. 处理章节
    if (document.chapters && document.chapters.length > 0) {
      for (const chapter of document.chapters) {
        // 章节标题单独成块
        chunks.push({
          chunkIndex: chunkIndex++,
          text: chapter.title,
          type: 'toc',
          chapterTitle: chapter.title,
          priority: 9,
        });

        // 章节内容分块
        const sectionChunks = this.semanticChunk(chapter.content, {
          maxSize: this.config.maxChunkSize,
          overlap: this.config.overlap,
        });

        for (const sectionText of sectionChunks) {
          chunks.push({
            chunkIndex: chunkIndex++,
            text: sectionText,
            type: 'body',
            chapterTitle: chapter.title,
            priority: 5,
          });
        }
      }
    }

    // 4. 提取图表说明
    if (document.charts && document.charts.length > 0) {
      for (const chart of document.charts) {
        if (chart.caption) {
          chunks.push({
            chunkIndex: chunkIndex++,
            text: chart.caption,
            type: 'chart',
            priority: 7,
          });
        }
      }
    }

    // 5. 提取结论
    if (document.conclusion) {
      chunks.push({
        chunkIndex: chunkIndex++,
        text: document.conclusion,
        type: 'conclusion',
        priority: 8,
      });
    }

    return chunks;
  }

  /**
   * 语义分块 - 尽量在段落边界处分割
   */
  private semanticChunk(
    text: string,
    options: { maxSize: number; overlap: number }
  ): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    let currentChunk = '';
    for (const paragraph of paragraphs) {
      // 如果当前段落太长，需要进一步分割
      if (paragraph.length > options.maxSize) {
        // 先保存当前块
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // 按句子分割长段落
        const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]+/g) || [paragraph];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > options.maxSize) {
            if (currentChunk.length > 0) {
              chunks.push(currentChunk.trim());
              // 保留重叠部分
              const words = currentChunk.split(/\s+/);
              const overlapWords = words.slice(-Math.floor(options.overlap / 5)); // 估算
              currentChunk = overlapWords.join(' ') + ' ';
            }
          }
          currentChunk += sentence + ' ';
        }
      } else {
        // 检查添加当前段落后是否超过限制
        if (currentChunk.length + paragraph.length > options.maxSize) {
          if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
        }
        currentChunk += paragraph + '\n\n';
      }
    }

    // 保存最后一块
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter((c) => c.length > 0);
  }

  /**
   * 简单分块 - 按固定大小分割
   */
  private fixedSizeChunk(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
      if (start >= end) break; // 防止死循环
    }

    return chunks;
  }

  /**
   * 估算 token 数量（简单估算：1 token ≈ 4 字符）
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ChunkingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// 简单文档解析器（基于文本）
// ============================================
export class SimpleDocumentParser {
  /**
   * 从纯文本解析文档结构
   */
  parseText(text: string, title: string = ''): ParsedDocument {
    const lines = text.split('\n');
    const chapters: ParsedDocument['chapters'] = [];
    let currentChapter: { title: string; content: string[]; level: number } | null = null;
    let abstract = '';
    let conclusion = '';
    let inAbstract = false;
    let inConclusion = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测摘要
      if (/^摘要[：:]?/i.test(line) || /^abstract[：:]?/i.test(line)) {
        inAbstract = true;
        inConclusion = false;
        continue;
      }

      // 检测结论
      if (/^结论[：:]?/i.test(line) || /^conclusion[：:]?/i.test(line) || /^总结[：:]?/i.test(line)) {
        inAbstract = false;
        inConclusion = true;
        if (currentChapter) {
          chapters.push({
            title: currentChapter.title,
            content: currentChapter.content.join('\n'),
            level: currentChapter.level,
          });
          currentChapter = null;
        }
        continue;
      }

      // 检测章节标题 (简单启发式：短行、以数字或特定词开头)
      const chapterMatch = line.match(/^(第[一二三四五六七八九十\d]+[章节篇]|[\d.]+\s+|Chapter\s+\d+[:\s])/i);
      if (chapterMatch && line.length < 100 && line.length > 0) {
        if (currentChapter) {
          chapters.push({
            title: currentChapter.title,
            content: currentChapter.content.join('\n'),
            level: currentChapter.level,
          });
        }
        currentChapter = {
          title: line,
          content: [],
          level: (line.match(/[.]/g) || []).length,
        };
        inAbstract = false;
        inConclusion = false;
        continue;
      }

      // 收集内容
      if (line.length > 0) {
        if (inAbstract) {
          abstract += line + ' ';
        } else if (inConclusion) {
          conclusion += line + ' ';
        } else if (currentChapter) {
          currentChapter.content.push(line);
        }
      }
    }

    // 保存最后一个章节
    if (currentChapter) {
      chapters.push({
        title: currentChapter.title,
        content: currentChapter.content.join('\n'),
        level: currentChapter.level,
      });
    }

    return {
      title,
      abstract: abstract.trim() || undefined,
      chapters,
      conclusion: conclusion.trim() || undefined,
      metadata: {
        wordCount: text.length,
        language: this.detectLanguage(text),
      },
    };
  }

  /**
   * 简单语言检测
   */
  private detectLanguage(text: string): string {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = text.length;
    return chineseChars / totalChars > 0.1 ? 'zh' : 'en';
  }
}

// ============================================
// 导出单例
// ============================================
export const documentChunkingService = new DocumentChunkingService();
export const simpleDocumentParser = new SimpleDocumentParser();
