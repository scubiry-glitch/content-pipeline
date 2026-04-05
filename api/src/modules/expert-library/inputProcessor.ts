// Input Processor — 输入增强模块
// 将原始输入（文本/PDF/PPT/会议纪要等）转化为结构化的 InputAnalysis
// 流程: 格式识别 → 内容提取 → 语义切分 → 信息抽取 → 结构化输出

import type { InputAnalysis, InputType, LLMAdapter, FileParserAdapter } from './types.js';

/**
 * 处理输入内容，生成结构化的 InputAnalysis
 */
export async function processInput(
  inputData: string,
  inputType: InputType,
  llm: LLMAdapter,
  fileParser?: FileParserAdapter
): Promise<InputAnalysis> {
  // Step 1: 内容提取（根据格式）
  let extractedText = inputData;
  let contentHint = '';

  switch (inputType) {
    case 'text':
      extractedText = inputData;
      contentHint = '纯文本内容';
      break;

    case 'pdf':
    case 'ppt':
      if (fileParser) {
        try {
          const parsed = await fileParser.parse(inputData);
          extractedText = parsed.text;

          if (inputType === 'ppt' && parsed.slides) {
            contentHint = `PPT演示文稿，共${parsed.slides.length}页`;
            // PPT 特殊处理：保留页面结构
            extractedText = parsed.slides
              .map(s => `[第${s.slideNumber}页]${s.notes ? ` (备注: ${s.notes})` : ''}\n${s.text}`)
              .join('\n\n');
          } else {
            contentHint = 'PDF文档';
          }
        } catch (error) {
          console.warn('[InputProcessor] File parsing failed, using raw input:', error);
        }
      }
      break;

    case 'meeting_minutes':
      contentHint = '会议纪要';
      break;

    case 'image':
      contentHint = '图片描述';
      break;

    case 'video':
      contentHint = '视频转录文本';
      break;

    default:
      contentHint = '内容';
  }

  // Step 2: 如果文本过长，进行语义切分和预摘要
  if (extractedText.length > 8000) {
    extractedText = await semanticChunkAndSummarize(extractedText, llm);
  }

  // Step 3: LLM 信息抽取
  return await extractStructuredAnalysis(extractedText, contentHint, inputType, llm);
}

/**
 * 语义切分 + 预摘要（防止"中间迷失"）
 */
async function semanticChunkAndSummarize(
  text: string,
  llm: LLMAdapter
): Promise<string> {
  // 按段落/逻辑断点切分
  const chunks = splitBySemanticBoundaries(text, 3000);

  if (chunks.length <= 2) {
    // 短文本直接截取
    return text.substring(0, 8000);
  }

  // 对每个 chunk 独立预摘要
  const summaries: string[] = [];
  for (const chunk of chunks.slice(0, 5)) { // 最多处理5个 chunk
    const summary = await llm.complete(
      `请用3-5句话高密度概括以下内容的核心信息，保留关键数据点和核心观点：\n\n${chunk}`,
      { temperature: 0.2, maxTokens: 500 }
    );
    summaries.push(summary);
  }

  return summaries.join('\n\n---\n\n');
}

/**
 * 按语义断点切分文本（非固定长度）
 */
function splitBySemanticBoundaries(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];

  // 优先按大段落分割
  const paragraphs = text.split(/\n{2,}/);
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += para + '\n\n';
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * LLM 结构化信息抽取
 */
async function extractStructuredAnalysis(
  text: string,
  contentHint: string,
  inputType: InputType,
  llm: LLMAdapter
): Promise<InputAnalysis> {
  const isInterviewOrMeeting = inputType === 'meeting_minutes' || text.includes('Q:') || text.includes('问：');

  const prompt = `请分析以下${contentHint}，提取结构化信息。

## 输入内容
${text.substring(0, 6000)}

## 要求
请以 JSON 格式返回以下结构（每个数组最多5项，选最重要的）：

{
  "facts": ["客观事实陈述，有数据支撑的"],
  "opinions": ["主观观点和判断"],
  "conflicts": ["内容中自相矛盾或存疑的地方"],
  "hidden_assumptions": ["作者暗含但未明确说明的假设"],
  "data_points": ["关键数字和数据"],
  ${isInterviewOrMeeting ? '"sentiment_shifts": ["发言人立场变化或信心波动的迹象"],' : ''}
  "source_quality": "high/medium/low"
}

只返回 JSON，不要其他内容。`;

  try {
    const response = await llm.complete(prompt, {
      temperature: 0.2,
      maxTokens: 1500,
      responseFormat: 'json',
    });

    const parsed = JSON.parse(extractJSON(response));

    return {
      facts: ensureArray(parsed.facts),
      opinions: ensureArray(parsed.opinions),
      conflicts: ensureArray(parsed.conflicts),
      hidden_assumptions: ensureArray(parsed.hidden_assumptions),
      data_points: ensureArray(parsed.data_points),
      sentiment_shifts: isInterviewOrMeeting ? ensureArray(parsed.sentiment_shifts) : undefined,
      source_quality: validateQuality(parsed.source_quality),
    };
  } catch (error) {
    console.warn('[InputProcessor] LLM extraction failed, returning minimal analysis:', error);
    return {
      facts: [],
      opinions: [],
      conflicts: [],
      hidden_assumptions: [],
      data_points: [],
      source_quality: 'medium',
    };
  }
}

// ----- Utilities -----

function extractJSON(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : '{}';
}

function ensureArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string');
  return [];
}

function validateQuality(value: any): 'high' | 'medium' | 'low' {
  if (['high', 'medium', 'low'].includes(value)) return value;
  return 'medium';
}
