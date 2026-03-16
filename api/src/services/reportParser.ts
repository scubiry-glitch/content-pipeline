// v3.4 研报解析器 - 使用LLM解析PDF研报
import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import { reportService } from './reportService.js';
import { getLLMProvider } from '../providers/index.js';

export interface ParsedReport {
  title: string;
  authors: string[];
  institution: string;
  publishDate?: Date;
  pageCount: number;
  abstract: string;
  keyPoints: string[];
  tags: string[];
  qualityScore: {
    overall: number;
    authority: number;
    completeness: number;
    logic: number;
    freshness: number;
    citations: number;
  };
  sections: Array<{
    title: string;
    level: number;
    content?: string;
  }>;
}

// 解析PDF文件
export async function parsePDF(filePath: string): Promise<{
  text: string;
  pageCount: number;
  info: any;
}> {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    info: data.info
  };
}

// 使用LLM解析研报
export async function parseReportWithLLM(
  reportId: string,
  fileUrl: string
): Promise<void> {
  try {
    console.log(`[ReportParser] Starting to parse report ${reportId}`);

    // 1. 提取PDF文本
    const pdfData = await parsePDF(fileUrl);
    const { text, pageCount } = pdfData;

    // 截断文本以避免超出token限制
    const truncatedText = text.slice(0, 15000);

    // 2. 构建LLM提示
    const prompt = buildParsePrompt(truncatedText);

    // 3. 调用LLM
    const provider = getLLMProvider();
    const response = await provider.complete({
      prompt,
      maxTokens: 2000,
      temperature: 0.3
    });

    // 4. 解析LLM响应
    const parsedData = parseLLMResponse(response.content);
    parsedData.pageCount = pageCount;

    // 5. 更新数据库
    await reportService.updateParseResult(reportId, {
      ...parsedData,
      parsedContent: text,
      status: 'parsed'
    });

    console.log(`[ReportParser] Successfully parsed report ${reportId}`);
  } catch (error) {
    console.error(`[ReportParser] Failed to parse report ${reportId}:`, error);

    // 更新为错误状态
    await reportService.updateParseResult(reportId, {
      status: 'error'
    });
  }
}

// 构建解析提示
function buildParsePrompt(text: string): string {
  return `请解析以下研报内容，提取关键信息并以JSON格式返回。

研报内容：
${text}

请提取以下信息并返回JSON：
{
  "title": "研报标题",
  "authors": ["作者1", "作者2"],
  "institution": "发布机构",
  "publishDate": "YYYY-MM-DD",
  "abstract": "摘要",
  "keyPoints": ["核心观点1", "核心观点2", "核心观点3"],
  "tags": ["标签1", "标签2", "标签3"],
  "qualityScore": {
    "overall": 85,
    "authority": 90,
    "completeness": 80,
    "logic": 85,
    "freshness": 75,
    "citations": 80
  },
  "sections": [
    {"title": "章节标题", "level": 1}
  ]
}

注意：
1. 质量评分范围0-100，基于机构权威性、内容完整度、逻辑严谨性、时效性、引用规范性
2. 标签应为行业/主题关键词，3-5个
3. 核心观点应简明扼要，3-5条
4. 只返回JSON，不要有其他文字`;
}

// 解析LLM响应
function parseLLMResponse(content: string): ParsedReport {
  try {
    // 尝试提取JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const data = JSON.parse(jsonMatch[0]);

    return {
      title: data.title || '未命名研报',
      authors: Array.isArray(data.authors) ? data.authors : [],
      institution: data.institution || '未知机构',
      publishDate: data.publishDate ? new Date(data.publishDate) : undefined,
      pageCount: data.pageCount || 0,
      abstract: data.abstract || '',
      keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      qualityScore: {
        overall: data.qualityScore?.overall || 60,
        authority: data.qualityScore?.authority || 60,
        completeness: data.qualityScore?.completeness || 60,
        logic: data.qualityScore?.logic || 60,
        freshness: data.qualityScore?.freshness || 60,
        citations: data.qualityScore?.citations || 60
      },
      sections: Array.isArray(data.sections) ? data.sections : []
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);

    // 返回默认值
    return {
      title: '解析失败',
      authors: [],
      institution: '未知',
      pageCount: 0,
      abstract: '',
      keyPoints: [],
      tags: [],
      qualityScore: {
        overall: 60,
        authority: 60,
        completeness: 60,
        logic: 60,
        freshness: 60,
        citations: 60
      },
      sections: []
    };
  }
}
