// Layer 1: 事实三元组提取 (← Mem0 自动事实提取)
// 从内容中提取结构化事实 (subject, predicate, object)
// v7.1: 两段式 ingest (受 nashsu/llm_wiki 启发)
//   Stage 1 analyze(): LLM 产出结构化"理解" (entities + keyClaims + contradictions + orgHints)
//   Stage 2 extract(): 用分析结果作为上下文，生成三元组 (比单次调用 F1 更高)

import type {
  LLMAdapter,
  ContentLibraryOptions,
  FactExtractionRequest,
  FactExtractionResult,
  ContentFact,
  ContentEntity,
  EntityType,
} from '../types.js';

/**
 * v7.1: Stage 1 分析结果。作为 Stage 2 的上下文输入，让三元组提取更有依据。
 */
export interface ContentAnalysisResult {
  /** 内容识别出的核心实体 (规范化后) */
  entities: Array<{ name: string; type: string; mentions: number }>;
  /** 关键主张 / 结论 (短句) */
  keyClaims: string[];
  /** 检测到的矛盾或并列观点 */
  contradictions: string[];
  /** 给 Stage 2 的组织提示 (哪些关系值得重点提取) */
  organizationHints: string[];
  /** 领域标签 */
  domain?: string;
}

const ANALYSIS_SYSTEM_PROMPT = `你是研报分析师。阅读给定内容，输出结构化分析摘要（非事实三元组本身），供下一阶段事实提取使用。

输出 JSON (UTF-8):
{
  "entities": [{"name": "规范名", "type": "company|person|product|technology|concept|metric|event|organization|location", "mentions": 整数}],
  "keyClaims": ["核心主张1（一句话）", "..."],
  "contradictions": ["与主流观点不同的地方，或内部对立的陈述", "..."],
  "organizationHints": ["建议下一阶段重点关注的关系/主题", "..."],
  "domain": "主要领域（AI/新能源/芯片/…）"
}

要求:
- entities 最多 20 个，只保留确有指代的实体
- keyClaims 最多 8 条，避免琐碎细节
- contradictions 为空就给空数组
- 输出必须是单一合法 JSON 对象 (第一个字符 {，最后一个字符 })，禁止 markdown 代码块与任何说明文字`;

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
    // v7.1: 两段式 ingest (默认启用)
    let analysisContext = '';
    if (this.options.useTwoStageExtraction) {
      try {
        const analysis = await this.analyze(request.content);
        if (analysis) {
          analysisContext = this.formatAnalysisAsContext(analysis);
          console.log(
            `[FactExtractor] Stage 1 analyze OK: ${analysis.entities.length} entities, ` +
            `${analysis.keyClaims.length} keyClaims, domain=${analysis.domain || 'unknown'}`
          );
        }
      } catch (err) {
        console.warn('[FactExtractor] Stage 1 analyze failed, falling back to single-stage:', err);
      }
    }

    const userPrompt = analysisContext
      ? `【上下文：前置分析结果】\n${analysisContext}\n\n【原始内容】\n${request.content}\n\n请基于上述分析，从原始内容中提取事实三元组和实体。`
      : `从以下内容中提取事实三元组和实体:\n\n${request.content}`;

    const response = await this.llm.completeWithSystem(
      EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.1, responseFormat: 'json', maxTokens: 4096 }
    );

    return this.parseAndMaybeRepair(request, response);
  }

  /**
   * v7.1 Stage 1: 对原始内容做分析，产出结构化理解，作为 Stage 2 的上下文。
   * 失败时返回 null (上层 fallback 到单次模式)。
   */
  async analyze(content: string): Promise<ContentAnalysisResult | null> {
    const userPrompt = `请分析下面的内容并输出结构化摘要 (不要输出事实三元组本身，只输出分析):\n\n${content.slice(0, 12000)}`;
    const response = await this.llm.completeWithSystem(
      ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.05, responseFormat: 'json', maxTokens: 2048 }
    );

    try {
      let t = response.trim();
      const fence = /```(?:json)?\s*([\s\S]*?)```/i;
      const m = t.match(fence);
      if (m) t = m[1].trim();
      t = sliceFirstBalancedJsonObject(t);
      t = t.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(t) as Partial<ContentAnalysisResult>;

      return {
        entities: Array.isArray(parsed.entities)
          ? parsed.entities.map((e: any) => ({
              name: String(e?.name ?? ''),
              type: String(e?.type ?? 'concept'),
              mentions: Number(e?.mentions) || 1,
            })).filter(e => e.name)
          : [],
        keyClaims: Array.isArray(parsed.keyClaims)
          ? parsed.keyClaims.map(String).filter(Boolean).slice(0, 10)
          : [],
        contradictions: Array.isArray(parsed.contradictions)
          ? parsed.contradictions.map(String).filter(Boolean).slice(0, 5)
          : [],
        organizationHints: Array.isArray(parsed.organizationHints)
          ? parsed.organizationHints.map(String).filter(Boolean).slice(0, 5)
          : [],
        domain: parsed.domain ? String(parsed.domain) : undefined,
      };
    } catch (err) {
      console.warn('[FactExtractor] analyze() JSON parse failed:', err);
      return null;
    }
  }

  /** 将分析结果格式化为给 Stage 2 的上下文字符串 */
  private formatAnalysisAsContext(a: ContentAnalysisResult): string {
    const lines: string[] = [];
    if (a.domain) lines.push(`领域: ${a.domain}`);
    if (a.entities.length > 0) {
      lines.push(`识别实体 (${a.entities.length}): ${a.entities.slice(0, 15).map(e => `${e.name}(${e.type})`).join('、')}`);
    }
    if (a.keyClaims.length > 0) {
      lines.push(`核心主张:\n${a.keyClaims.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`);
    }
    if (a.contradictions.length > 0) {
      lines.push(`内部矛盾/对立观点:\n${a.contradictions.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`);
    }
    if (a.organizationHints.length > 0) {
      lines.push(`提取重点:\n${a.organizationHints.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}`);
    }
    return lines.join('\n');
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
