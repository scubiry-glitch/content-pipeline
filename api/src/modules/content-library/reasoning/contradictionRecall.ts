// v7.5 三层矛盾召回 — 替代浅层 SQL 字面匹配
//
// L1: SQL 对冲 (保留现行 getContradictions 的 subject=subject AND predicate=predicate AND object≠object)
// L2: 语义对冲 (同 entity 下的 claims 生成 embedding，cosine 相近但 object 文本显著不同 → 语义相近结论分叉)
// L3: LLM 张力分类器 (L1+L2 候选，按 5 类矛盾分类 + 抽 divergence_axis/parties/time_slice)
//
// 输出：TensionCandidate[] —— 比 Contradiction 更肥，附带 tensionType/divergenceAxis/parties/timeSlice

import type { ContentLibraryDeps, Contradiction, ContentFact, TensionType } from '../types.js';

export interface TensionCandidate extends Contradiction {
  tensionType: TensionType;
  divergenceAxis?: string;
  parties?: Array<{ name: string; stance: string }>;
  timeSlice?: string;
  recallLayer: 'L1' | 'L2' | 'L3';
}

export interface RecallOptions {
  domain?: string;
  limit?: number;
  /** 是否执行 L3 LLM 分类（成本高；false 时 tensionType 全 unknown） */
  enableL3?: boolean;
  /** L2 cosine 相似度门槛（0-1），默认 0.75 */
  l2SimilarityThreshold?: number;
  /** L2 object 文本最大 Jaccard 相似度（用于"语义相近但文本不同"判定），默认 0.6 */
  l2ObjectDivergenceThreshold?: number;
}

/**
 * 三层召回入口。调用方：ContentLibraryEngine.getContradictions
 */
export async function recallTensions(
  deps: ContentLibraryDeps,
  opts: RecallOptions = {},
): Promise<TensionCandidate[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  const enableL3 = opts.enableL3 ?? true;

  const l1 = await recallL1(deps, limit);
  const l2 = await recallL2(
    deps,
    limit,
    opts.l2SimilarityThreshold ?? 0.75,
    opts.l2ObjectDivergenceThreshold ?? 0.6,
  );

  const merged = dedupCandidates([...l1, ...l2]);
  if (merged.length === 0) return [];

  if (!enableL3) {
    return merged.map(c => ({ ...c, tensionType: 'unknown' as TensionType }));
  }

  return await classifyL3(deps, merged);
}

// ============================================================
// L1: SQL 字面对冲（保留原行为作召回器）
// ============================================================

async function recallL1(deps: ContentLibraryDeps, limit: number): Promise<TensionCandidate[]> {
  const result = await deps.db.query(
    `SELECT
       cf1.id as fact_a_id, cf1.subject, cf1.predicate,
       cf1.object as object_a, cf1.context as context_a, cf1.confidence as conf_a, cf1.created_at as created_a,
       cf2.id as fact_b_id, cf2.object as object_b, cf2.context as context_b, cf2.confidence as conf_b, cf2.created_at as created_b
     FROM content_facts cf1
     JOIN content_facts cf2 ON cf1.subject = cf2.subject AND cf1.predicate = cf2.predicate
     WHERE cf1.is_current = true AND cf2.is_current = true
       AND cf1.id < cf2.id
       AND cf1.object != cf2.object
     ORDER BY (cf1.confidence + cf2.confidence) DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((row: any) => buildCandidate(row, 'L1'));
}

// ============================================================
// L2: 语义对冲（同 entity 下 cosine 相近 + object 文本分叉）
// ============================================================

async function recallL2(
  deps: ContentLibraryDeps,
  limit: number,
  simThreshold: number,
  objDivergenceThreshold: number,
): Promise<TensionCandidate[]> {
  // 只查有 embedding 的事实；未向量化的跳过（避免全表扫描）
  // 按 subject 分组，每组取最多 20 条，避免单一实体爆炸
  let rows: any[] = [];
  try {
    const result = await deps.db.query(
      `SELECT
         id, subject, predicate, object, context, confidence, created_at, content_embedding
       FROM content_facts
       WHERE is_current = true
         AND content_embedding IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 500`,
    );
    rows = result.rows;
  } catch (err) {
    // content_embedding 列不存在 / 扩展未启用 → L2 降级为空
    console.warn('[contradictionRecall] L2 semantic recall unavailable:', (err as Error).message);
    return [];
  }

  // 按 subject 分桶
  const bySubject = new Map<string, any[]>();
  for (const row of rows) {
    const key = row.subject;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(row);
  }

  const candidates: TensionCandidate[] = [];
  for (const [, facts] of bySubject) {
    if (facts.length < 2) continue;
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const a = facts[i];
        const b = facts[j];
        const embA = parseEmbedding(a.content_embedding);
        const embB = parseEmbedding(b.content_embedding);
        if (!embA || !embB) continue;

        const sim = cosineSimilarity(embA, embB);
        if (sim < simThreshold) continue;

        // 语义相近但 object 文本差别大 → 同一话题、不同结论
        const objSim = jaccardSimilarity(tokenize(a.object), tokenize(b.object));
        if (objSim >= objDivergenceThreshold) continue;

        // L1 已经覆盖的（主谓完全一致）跳过
        if (a.predicate === b.predicate) continue;

        candidates.push(buildCandidate({
          fact_a_id: a.id,
          fact_b_id: b.id,
          subject: a.subject,
          predicate: a.predicate,  // 用 A 的谓词做描述，parties 里再细分
          object_a: a.object,
          object_b: b.object,
          context_a: a.context,
          context_b: b.context,
          conf_a: a.confidence,
          conf_b: b.confidence,
          created_a: a.created_at,
          created_b: b.created_at,
        }, 'L2'));

        if (candidates.length >= limit) break;
      }
      if (candidates.length >= limit) break;
    }
    if (candidates.length >= limit) break;
  }

  return candidates;
}

// ============================================================
// L3: LLM 张力分类器
// ============================================================

const L3_SYSTEM_PROMPT = `你是矛盾分类专家。对每条矛盾候选,判断它属于以下 5 种张力类型中的哪一种,并抽取 divergence_axis / parties / time_slice。

5 种张力类型:
- 立场: 主谓宾一致,但评价标准或价值取向不同(例:"AI 创造了岗位" vs "AI 摧毁了岗位",统计口径不同)
- 叙事归因: 同一事实,两种因果解释(例:销量涨 = 产品力 vs 销量涨 = 补贴)
- 利益: 同一事实对不同群体利弊相反(例:房贷下行对刚需 vs 对持房者)
- 时序: 不同时期的事实被用来支撑同一主张(例:援引 2023 数据讨论 2026 情形)
- 定义漂移: 主谓相同但"主语/谓语"的定义实质不同(例:"国产大模型 SOTA" — 在 MMLU 上 vs 在 C-Eval 上)

输出严格 JSON 数组,顺序与输入一致,不要 markdown 围栏:
[
  {
    "index": 0,
    "tensionType": "立场|叙事归因|利益|时序|定义漂移",
    "divergenceAxis": "分歧的具体维度",
    "parties": [{"name":"...","stance":"..."}, {"name":"...","stance":"..."}],
    "timeSlice": "事实 A/B 的时间跨度描述"
  }
]`;

async function classifyL3(
  deps: ContentLibraryDeps,
  candidates: TensionCandidate[],
): Promise<TensionCandidate[]> {
  if (candidates.length === 0) return [];

  const userPrompt = buildL3Prompt(candidates);
  try {
    const raw = await deps.llm.completeWithSystem(L3_SYSTEM_PROMPT, userPrompt, {
      temperature: 0.2,
      maxTokens: 2048,
      responseFormat: 'json',
    });

    const parsed = parseJsonArray(raw);
    if (!Array.isArray(parsed)) {
      return candidates.map(c => ({ ...c, tensionType: 'unknown' as TensionType }));
    }

    return candidates.map((c, idx) => {
      const match = parsed.find((p: any) => p?.index === idx) ?? parsed[idx];
      if (!match) return { ...c, tensionType: 'unknown' as TensionType };
      return {
        ...c,
        tensionType: normalizeTensionType(match.tensionType),
        divergenceAxis: typeof match.divergenceAxis === 'string' ? match.divergenceAxis : undefined,
        parties: Array.isArray(match.parties)
          ? match.parties
              .filter((p: any) => p && typeof p.name === 'string')
              .map((p: any) => ({ name: String(p.name), stance: String(p.stance ?? '') }))
          : undefined,
        timeSlice: typeof match.timeSlice === 'string' ? match.timeSlice : undefined,
        recallLayer: 'L3',
      };
    });
  } catch (err) {
    console.warn('[contradictionRecall] L3 classify failed:', (err as Error).message);
    return candidates.map(c => ({ ...c, tensionType: 'unknown' as TensionType }));
  }
}

function buildL3Prompt(candidates: TensionCandidate[]): string {
  const lines = candidates.map((c, idx) => {
    const factA = `${c.factA.subject} | ${c.factA.predicate} | ${c.factA.object}`;
    const factB = `${c.factB.subject} | ${c.factB.predicate} | ${c.factB.object}`;
    const timeA = c.factA.createdAt ? new Date(c.factA.createdAt).toISOString().slice(0, 10) : '';
    const timeB = c.factB.createdAt ? new Date(c.factB.createdAt).toISOString().slice(0, 10) : '';
    return `[${idx}] 事实A(${timeA}): ${factA}\n    事实B(${timeB}): ${factB}`;
  });
  return `请对以下 ${candidates.length} 条矛盾候选逐条分类并抽取 divergence_axis / parties / time_slice:\n\n${lines.join('\n\n')}\n\n按索引输出 JSON 数组。`;
}

// ============================================================
// 工具函数
// ============================================================

function buildCandidate(row: any, layer: 'L1' | 'L2'): TensionCandidate {
  const factA: ContentFact = {
    id: row.fact_a_id,
    assetId: '',
    subject: row.subject,
    predicate: row.predicate,
    object: row.object_a,
    context: row.context_a || {},
    confidence: Number(row.conf_a) || 0,
    isCurrent: true,
    createdAt: row.created_a,
  };
  const factB: ContentFact = {
    id: row.fact_b_id,
    assetId: '',
    subject: row.subject,
    predicate: row.predicate,
    object: row.object_b,
    context: row.context_b || {},
    confidence: Number(row.conf_b) || 0,
    isCurrent: true,
    createdAt: row.created_b,
  };
  const confSum = factA.confidence + factB.confidence;
  const severity: 'low' | 'medium' | 'high' = confSum > 1.6 ? 'high' : confSum > 1.2 ? 'medium' : 'low';

  return {
    id: `${factA.id}-${factB.id}`,
    factA,
    factB,
    description: `"${row.subject}" 的 "${row.predicate}" 存在张力: "${row.object_a}" vs "${row.object_b}"`,
    severity,
    detectedAt: new Date(),
    tensionType: 'unknown',
    recallLayer: layer,
  };
}

function dedupCandidates(list: TensionCandidate[]): TensionCandidate[] {
  const seen = new Map<string, TensionCandidate>();
  for (const c of list) {
    const key = [c.factA.id, c.factB.id].sort().join('|');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, c);
    } else if (layerPriority(c.recallLayer) > layerPriority(existing.recallLayer)) {
      seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

function layerPriority(layer: 'L1' | 'L2' | 'L3'): number {
  return layer === 'L3' ? 3 : layer === 'L2' ? 2 : 1;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map(Number).filter(n => Number.isFinite(n));
  if (typeof raw === 'string') {
    try {
      // pgvector 字符串格式: "[0.1,0.2,...]"
      const trimmed = raw.replace(/^\[|\]$/g, '');
      const arr = trimmed.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
      return arr.length > 0 ? arr : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const cleaned = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return new Set(cleaned.split(/\s+/).filter(t => t.length > 0));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

const TENSION_TYPES: TensionType[] = ['立场', '叙事归因', '利益', '时序', '定义漂移', 'real_disagreement'];

function normalizeTensionType(raw: unknown): TensionType {
  if (typeof raw !== 'string') return 'unknown';
  const trimmed = raw.trim();
  for (const t of TENSION_TYPES) {
    if (trimmed === t) return t;
  }
  // 兼容英文回答
  const lower = trimmed.toLowerCase();
  if (lower.includes('stance') || lower.includes('position')) return '立场';
  if (lower.includes('causal') || lower.includes('attribution') || lower.includes('narrative')) return '叙事归因';
  if (lower.includes('interest') || lower.includes('stakeholder')) return '利益';
  if (lower.includes('time') || lower.includes('temporal')) return '时序';
  if (lower.includes('definition') || lower.includes('drift')) return '定义漂移';
  return 'unknown';
}

function parseJsonArray(raw: string): any[] | null {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
