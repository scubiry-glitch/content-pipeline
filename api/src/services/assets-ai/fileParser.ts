// ============================================
// v6.2 Assets AI 批量处理 - 文件解析服务
// 支持 PDF, DOCX, TXT, MD, 图片 OCR
// ============================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { ParsedDocument } from './chunking.js';

// ============================================
// 文件解析配置
// ============================================
export interface FileParserConfig {
  ocrLanguage?: string;     // OCR 语言，默认 'chi_sim+eng'
  maxFileSize?: number;     // 最大文件大小（字节），默认 50MB
  enableOCR?: boolean;      // 是否启用 OCR，默认 true
  tempDir?: string;         // 临时目录
}

const DEFAULT_CONFIG: FileParserConfig = {
  ocrLanguage: 'chi_sim+eng',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  enableOCR: true,
  tempDir: '/tmp/assets-parser',
};

// ============================================
// 文件解析结果
// ============================================
export interface FileParseResult {
  success: boolean;
  document: ParsedDocument;
  metadata: {
    fileType: string;
    fileSize: number;
    pageCount?: number;
    wordCount: number;
    parseTimeMs: number;
  };
  error?: string;
}

// ============================================
// 文件解析服务
// ============================================
export class FileParserService {
  private config: FileParserConfig;
  private ocrWorker: Tesseract.Worker | null = null;

  constructor(config: Partial<FileParserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 解析文件
   */
  async parseFile(filePath: string, title?: string): Promise<FileParseResult> {
    const startTime = Date.now();

    try {
      // 检查文件是否存在
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      // 检查文件大小
      if (stats.size > (this.config.maxFileSize || 50 * 1024 * 1024)) {
        throw new Error(`File too large: ${stats.size} bytes`);
      }

      // 获取文件扩展名
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath, ext);

      // 根据文件类型选择解析器
      let result: ParsedDocument;
      switch (ext) {
        case '.pdf':
          result = await this.parsePDF(filePath, title || fileName);
          break;
        case '.docx':
        case '.doc':
          result = await this.parseDOCX(filePath, title || fileName);
          break;
        case '.txt':
        case '.md':
          result = await this.parseText(filePath, title || fileName);
          break;
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.webp':
        case '.gif':
          result = await this.parseImage(filePath, title || fileName);
          break;
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }

      const parseTimeMs = Date.now() - startTime;

      return {
        success: true,
        document: result,
        metadata: {
          fileType: ext,
          fileSize: stats.size,
          pageCount: result.metadata.pageCount,
          wordCount: result.metadata.wordCount || this.estimateWordCount(result),
          parseTimeMs,
        },
      };
    } catch (error) {
      console.error(`[FileParserService] Failed to parse ${filePath}:`, error);
      return {
        success: false,
        document: this.createEmptyDocument(title || path.basename(filePath)),
        metadata: {
          fileType: path.extname(filePath).toLowerCase(),
          fileSize: 0,
          wordCount: 0,
          parseTimeMs: Date.now() - startTime,
        },
        error: (error as Error).message,
      };
    }
  }

  /**
   * 解析 PDF 文件
   */
  private async parsePDF(filePath: string, title: string): Promise<ParsedDocument> {
    const buffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(buffer);

    // 尝试提取章节结构
    const chapters = this.extractChaptersFromText(pdfData.text);
    const abstract = this.extractAbstract(pdfData.text);
    const conclusion = this.extractConclusion(pdfData.text);

    return {
      title,
      abstract,
      chapters,
      conclusion,
      metadata: {
        pageCount: pdfData.numpages,
        wordCount: pdfData.text.split(/\s+/).length,
      },
    };
  }

  /**
   * 解析 DOCX 文件
   */
  private async parseDOCX(filePath: string, title: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;

    // 尝试提取章节结构
    const chapters = this.extractChaptersFromText(text);
    const abstract = this.extractAbstract(text);
    const conclusion = this.extractConclusion(text);

    return {
      title,
      abstract,
      chapters,
      conclusion,
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  }

  /**
   * 解析文本文件 (TXT/MD)
   */
  private async parseText(filePath: string, title: string): Promise<ParsedDocument> {
    const text = await fs.readFile(filePath, 'utf-8');

    // 尝试提取章节结构
    const chapters = this.extractChaptersFromText(text);
    const abstract = this.extractAbstract(text);
    const conclusion = this.extractConclusion(text);

    return {
      title,
      abstract,
      chapters,
      conclusion,
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  }

  /**
   * 解析图片文件 (OCR)
   */
  private async parseImage(filePath: string, title: string): Promise<ParsedDocument> {
    if (!this.config.enableOCR) {
      throw new Error('OCR is disabled');
    }

    // 初始化 OCR Worker（如果未初始化）
    if (!this.ocrWorker) {
      this.ocrWorker = await createWorker(this.config.ocrLanguage || 'chi_sim+eng');
    }

    const result = await this.ocrWorker.recognize(filePath);
    const text = result.data.text;

    return {
      title,
      abstract: text.slice(0, 500), // 取前 500 字符作为摘要
      chapters: [
        {
          title: 'OCR 识别内容',
          content: text,
          level: 1,
        },
      ],
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  }

  /**
   * 从 URL 下载并解析文件
   */
  async parseFromUrl(url: string, title?: string): Promise<FileParseResult> {
    try {
      // 下载文件
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // 确定文件扩展名
      const contentType = response.headers.get('content-type') || '';
      const ext = this.getExtensionFromContentType(contentType) || path.extname(url);
      
      // 保存到临时文件
      const tempFile = path.join(
        this.config.tempDir || '/tmp',
        `asset-${Date.now()}${ext}`
      );
      
      await fs.mkdir(path.dirname(tempFile), { recursive: true });
      await fs.writeFile(tempFile, buffer);

      // 解析文件
      const result = await this.parseFile(tempFile, title);

      // 清理临时文件
      await fs.unlink(tempFile).catch(() => {});

      return result;
    } catch (error) {
      console.error(`[FileParserService] Failed to parse from URL ${url}:`, error);
      return {
        success: false,
        document: this.createEmptyDocument(title || 'Unknown'),
        metadata: {
          fileType: 'unknown',
          fileSize: 0,
          wordCount: 0,
          parseTimeMs: 0,
        },
        error: (error as Error).message,
      };
    }
  }

  /**
   * 提取章节结构
   */
  private extractChaptersFromText(text: string): ParsedDocument['chapters'] {
    const chapters: ParsedDocument['chapters'] = [];
    const lines = text.split('\n');
    
    let currentChapter: { title: string; content: string[]; level: number } | null = null;
    
    // 章节标题正则匹配
    const chapterPatterns = [
      /^第[一二三四五六七八九十\d]+[章节篇]/,
      /^[\d.]+\s+.+/,  // 1. 标题
      /^第\d+章/,
      /^Chapter\s+\d+/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      // 检查是否是章节标题
      const isChapter = chapterPatterns.some(pattern => pattern.test(trimmed));
      
      if (isChapter && trimmed.length < 100) {
        // 保存上一个章节
        if (currentChapter) {
          chapters.push({
            title: currentChapter.title,
            content: currentChapter.content.join('\n'),
            level: currentChapter.level,
          });
        }
        
        // 计算章节级别
        const level = (trimmed.match(/\./g) || []).length + 1;
        
        currentChapter = {
          title: trimmed,
          content: [],
          level,
        };
      } else if (currentChapter) {
        currentChapter.content.push(trimmed);
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

    // 如果没有提取到章节，将整个文档作为一个章节
    if (chapters.length === 0) {
      chapters.push({
        title: '正文',
        content: text,
        level: 1,
      });
    }

    return chapters;
  }

  /**
   * 提取摘要
   */
  private extractAbstract(text: string): string | undefined {
    // 查找摘要部分
    const abstractMatch = text.match(/(?:摘要|Abstract)[：:]?\s*([\s\S]{100,1000}?)(?=\n\s*(?:关键词|Keywords|引言|Introduction|一、|1\.))/i);
    if (abstractMatch) {
      return abstractMatch[1].trim();
    }
    return undefined;
  }

  /**
   * 提取结论
   */
  private extractConclusion(text: string): string | undefined {
    // 查找结论部分
    const conclusionMatch = text.match(/(?:结论|总结|Conclusion)[：:]?\s*([\s\S]{100,2000}?)(?=\n\s*(?:参考|Reference|附录|Appendix|$))/i);
    if (conclusionMatch) {
      return conclusionMatch[1].trim();
    }
    return undefined;
  }

  /**
   * 估算字数
   */
  private estimateWordCount(doc: ParsedDocument): number {
    let count = 0;
    if (doc.abstract) count += doc.abstract.split(/\s+/).length;
    doc.chapters.forEach(c => {
      count += c.content.split(/\s+/).length;
    });
    if (doc.conclusion) count += doc.conclusion.split(/\s+/).length;
    return count;
  }

  /**
   * 从 Content-Type 获取扩展名
   */
  private getExtensionFromContentType(contentType: string): string | undefined {
    const mapping: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/msword': '.doc',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
    };
    return mapping[contentType.split(';')[0].trim()];
  }

  /**
   * 创建空文档
   */
  private createEmptyDocument(title: string): ParsedDocument {
    return {
      title,
      chapters: [],
      metadata: {
        wordCount: 0,
      },
    };
  }

  /**
   * 释放资源
   */
  async terminate(): Promise<void> {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }
  }
}

// ============================================
// 文件类型检测
// ============================================
export class FileTypeDetector {
  private static readonly MIME_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  static getMimeType(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    return this.MIME_TYPES[ext];
  }

  static isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext in this.MIME_TYPES;
  }

  static isImage(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
  }

  static isDocument(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.pdf', '.docx', '.doc', '.txt', '.md'].includes(ext);
  }
}

// ============================================
// 导出单例
// ============================================
export const fileParserService = new FileParserService();
