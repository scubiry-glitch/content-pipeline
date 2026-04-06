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
}

【硬性要求】仅输出上述结构的 JSON 对象本身：第一个字符必须是 {，最后一个字符必须是 }；禁止 markdown 代码块、禁止前后任何说明或「内容分析」类文字。`;

/** 取出第一个平衡的 {...}，避免 lastIndexOf 误切或多段文本干扰 */
function sliceFirstBalancedJsonObject(s: string): string {
  const start = s.indexOf('{');
  if (start < 0) throw new SyntaxError('No JSON object start');
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (c === '\\') escape = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new SyntaxError('Unbalanced braces in JSON');
}

/** 兼容模型在 JSON 外包 markdown、前后解说文字、尾部逗号等 */
function parseFactExtractionResponse(raw: string): { facts: unknown[]; entities: unknown[] } {
  let t = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = t.match(fence);
  if (m) t = m[1].trim();

  t = sliceFirstBalancedJsonObject(t);
  t = t.replace(/,\s*([\]}])/g, '$1');

  const parsed = JSON.parse(t) as { facts?: unknown[]; entities?: unknown[] };
  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
  };
}

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

    return this.parseAndMaybeRepair(request, response);
  }

  /** 解析 JSON；失败时对「解说型长文」再请求一次，压成合法 JSON（部分模型忽略 json 模式） */
  private async parseAndMaybeRepair(
    request: FactExtractionRequest,
    response: string
  ): Promise<FactExtractionResult> {
    const mapRows = (parsed: { facts: unknown[]; entities: unknown[] }) => {
      const facts: Omit<ContentFact, 'id' | 'createdAt'>[] = (parsed.facts || []).map((f: any) => ({
        assetId: request.assetId,
        subject: String(f.subject ?? ''),
        predicate: String(f.predicate ?? ''),
        object: String(f.object ?? ''),
        context: f.context || {},
        confidence: Number(f.confidence) || 0.5,
        isCurrent: true,
        sourceChunkIndex: request.sourceChunkIndex,
      }));

      const entities: Omit<ContentEntity, 'id' | 'createdAt' | 'updatedAt'>[] = (
        parsed.entities || []
      ).map((e: any) => ({
        canonicalName: String(e.canonicalName ?? e.canonical_name ?? ''),
        aliases: Array.isArray(e.aliases) ? e.aliases : [],
        entityType: (e.entityType || e.entity_type || 'concept') as EntityType,
        metadata: {},
      }));

      return {
        facts: facts.filter((x) => x.subject && x.predicate && x.object),
        entities: entities.filter((x) => x.canonicalName),
      };
    };

    try {
      const parsed = parseFactExtractionResponse(response);
      return mapRows(parsed);
    } catch (err) {
      const preview = response.length > 600 ? `${response.slice(0, 600)}…` : response;
      console.warn('[FactExtractor] First pass JSON parse failed, trying repair pass:', err);
      console.warn('[FactExtractor] Response preview:', preview);
    }

    const repairSystem = `你是 JSON 整理器。根据用户给出的「研报分析/事实罗列」文本，整理为唯一合法 JSON 对象。
顶层键必须为 "facts" 和 "entities"（均为数组）。
facts 每项: subject, predicate, object, context(对象), confidence(0-1 数字)。
entities 每项: canonicalName, aliases(字符串数组), entityType。
只输出 JSON，第一个字符是 {，最后是 }，禁止 markdown 与任何说明。`;

    const repairUser = `请把下面材料中的明确事实与实体整理成上述 JSON（归纳成至多 30 条事实、20 个实体即可，避免超长；不要编造无依据数据）：\n\n---\n\n${response.slice(0, 8000)}`;

    try {
      const fixed = await this.llm.completeWithSystem(repairSystem, repairUser, {
        temperature: 0.05,
        responseFormat: 'json',
        maxTokens: 16384,
      });
      const parsed = parseFactExtractionResponse(fixed);
      const out = mapRows(parsed);
      if (out.facts.length === 0 && out.entities.length === 0) {
        console.warn('[FactExtractor] Repair pass produced no facts/entities');
        return { facts: [], entities: [] };
      }
      console.log(
        `[FactExtractor] Repair pass OK: ${out.facts.length} facts, ${out.entities.length} entities`
      );
      return out;
    } catch (err2) {
      console.warn('[FactExtractor] Repair pass failed:', err2);
      return { facts: [], entities: [] };
    }
  }
}
