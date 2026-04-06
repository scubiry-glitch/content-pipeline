// Layer 1: 事实三元组提取 (← Mem0 自动事实提取)
// 从内容中提取结构化事实 (subject, predicate, object)

import type {
  LLMAdapter,
  ContentLibraryOptions,
  FactExtractionRequest,
  FactExtractionResult,
  ContentFact,
  ContentEntity,
  EntityType,
} from '../types.js';

const EXTRACTION_SYSTEM_PROMPT = `你是一个事实提取引擎。从给定内容中提取结构化事实三元组。

要求:
1. 每个事实必须包含: subject(主体), predicate(谓词), object(客体)
2. 提取时间、领域等上下文信息
3. 对每个事实给出置信度 (0-1)
4. 同时识别内容中的实体 (公司/人物/概念/指标/事件/产品/组织/地点)
5. 只提取明确陈述的事实，不要推测

输出 JSON 格式:
{
  "facts": [
    {
      "subject": "主体",
      "predicate": "谓词(如: 市值/收入/占比/发布/收购)",
      "object": "客体(具体数值或描述)",
      "context": { "time": "时间", "domain": "领域", "source": "来源" },
      "confidence": 0.9
    }
  ],
  "entities": [
    {
      "canonicalName": "规范名称",
      "aliases": ["别名1", "别名2"],
      "entityType": "company|person|concept|metric|event|product|organization|location"
    }
  ]
}`;

export class FactExtractor {
  private llm: LLMAdapter;
  private options: Required<ContentLibraryOptions>;

  constructor(llm: LLMAdapter, options: Required<ContentLibraryOptions>) {
    this.llm = llm;
    this.options = options;
  }

  async extract(request: FactExtractionRequest): Promise<FactExtractionResult> {
    const userPrompt = `从以下内容中提取事实三元组和实体:\n\n${request.content}`;

    const response = await this.llm.completeWithSystem(
      EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.1, responseFormat: 'json', maxTokens: 4096 }
    );

    try {
      const parsed = JSON.parse(response);

      const facts: Omit<ContentFact, 'id' | 'createdAt'>[] = (parsed.facts || []).map((f: any) => ({
        assetId: request.assetId,
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        context: f.context || {},
        confidence: Number(f.confidence) || 0.5,
        isCurrent: true,
        sourceChunkIndex: request.sourceChunkIndex,
      }));

      const entities: Omit<ContentEntity, 'id' | 'createdAt' | 'updatedAt'>[] = (parsed.entities || []).map((e: any) => ({
        canonicalName: e.canonicalName,
        aliases: e.aliases || [],
        entityType: (e.entityType || 'concept') as EntityType,
        metadata: {},
      }));

      return { facts, entities };
    } catch {
      console.warn('[FactExtractor] Failed to parse LLM response, returning empty result');
      return { facts: [], entities: [] };
    }
  }
}
