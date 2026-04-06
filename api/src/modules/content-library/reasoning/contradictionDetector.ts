// Layer 4: 矛盾检测 (← Hindsight)
// 检测同一 subject+predicate 下 object 不同的事实对

import type { DatabaseAdapter, LLMAdapter, Contradiction, ContentFact } from '../types.js';

export class ContradictionDetector {
  private db: DatabaseAdapter;
  private llm: LLMAdapter;

  constructor(db: DatabaseAdapter, llm: LLMAdapter) {
    this.db = db;
    this.llm = llm;
  }

  /** 检测新事实与既有事实的矛盾 */
  async detectForFact(factId: string): Promise<Contradiction[]> {
    const factResult = await this.db.query(
      'SELECT * FROM content_facts WHERE id = $1', [factId]
    );
    if (factResult.rows.length === 0) return [];

    const fact = factResult.rows[0];

    // 找同 subject+predicate 但 object 不同的现有事实
    const conflicts = await this.db.query(
      `SELECT * FROM content_facts
       WHERE subject = $1 AND predicate = $2
       AND object != $3 AND is_current = true AND id != $4
       ORDER BY confidence DESC LIMIT 5`,
      [fact.subject, fact.predicate, fact.object, factId]
    );

    return conflicts.rows.map((row: any) => this.buildContradiction(fact, row));
  }

  /** 全局矛盾扫描 */
  async scanAll(options?: { domain?: string; limit?: number }): Promise<Contradiction[]> {
    const limit = options?.limit || 50;
    const domainFilter = options?.domain
      ? `AND (cf1.context->>'domain' = $2 OR cf2.context->>'domain' = $2)`
      : '';
    const params: any[] = [limit];
    if (options?.domain) params.push(options.domain);

    const result = await this.db.query(`
      SELECT
        cf1.id as id_a, cf1.asset_id as asset_a, cf1.subject, cf1.predicate,
        cf1.object as object_a, cf1.context as context_a,
        cf1.confidence as conf_a, cf1.created_at as created_a,
        cf2.id as id_b, cf2.asset_id as asset_b,
        cf2.object as object_b, cf2.context as context_b,
        cf2.confidence as conf_b, cf2.created_at as created_b
      FROM content_facts cf1
      JOIN content_facts cf2
        ON cf1.subject = cf2.subject
        AND cf1.predicate = cf2.predicate
        AND cf1.object != cf2.object
      WHERE cf1.is_current = true AND cf2.is_current = true
      AND cf1.id < cf2.id
      ${domainFilter}
      ORDER BY (cf1.confidence + cf2.confidence) DESC
      LIMIT $1
    `, params);

    return result.rows.map((row: any) => ({
      id: `${row.id_a}-${row.id_b}`,
      factA: this.mapFact(row, 'a'),
      factB: this.mapFact(row, 'b'),
      description: `"${row.subject}"的"${row.predicate}"存在矛盾: "${row.object_a}" vs "${row.object_b}"`,
      severity: this.assessSeverity(row.conf_a, row.conf_b),
      detectedAt: new Date(),
    }));
  }

  /** 使用 LLM 评估矛盾的严重程度和解释 */
  async analyzeContradiction(contradiction: Contradiction): Promise<{
    isReal: boolean;
    explanation: string;
    resolution?: string;
  }> {
    const prompt = `分析以下两个事实是否真的矛盾:

事实 A: ${contradiction.factA.subject} ${contradiction.factA.predicate} ${contradiction.factA.object}
  (上下文: ${JSON.stringify(contradiction.factA.context)})

事实 B: ${contradiction.factB.subject} ${contradiction.factB.predicate} ${contradiction.factB.object}
  (上下文: ${JSON.stringify(contradiction.factB.context)})

判断:
1. 这两个事实是否真的矛盾？(可能只是不同时间/条件下的不同数据)
2. 如果矛盾，哪个更可能是正确的？
3. 如何解决这个矛盾？

输出 JSON: {"isReal": true/false, "explanation": "解释", "resolution": "建议"}`;

    try {
      const response = await this.llm.complete(prompt, { temperature: 0.2, responseFormat: 'json' });
      return JSON.parse(response);
    } catch {
      return { isReal: true, explanation: '无法自动分析', resolution: undefined };
    }
  }

  private buildContradiction(factA: any, factB: any): Contradiction {
    return {
      id: `${factA.id}-${factB.id}`,
      factA: {
        id: factA.id, assetId: factA.asset_id, subject: factA.subject,
        predicate: factA.predicate, object: factA.object,
        context: factA.context || {}, confidence: Number(factA.confidence),
        isCurrent: true, createdAt: new Date(factA.created_at),
      },
      factB: {
        id: factB.id, assetId: factB.asset_id, subject: factB.subject,
        predicate: factB.predicate, object: factB.object,
        context: factB.context || {}, confidence: Number(factB.confidence),
        isCurrent: true, createdAt: new Date(factB.created_at),
      },
      description: `"${factA.subject}"的"${factA.predicate}"存在矛盾: "${factA.object}" vs "${factB.object}"`,
      severity: this.assessSeverity(factA.confidence, factB.confidence),
      detectedAt: new Date(),
    };
  }

  private assessSeverity(confA: number, confB: number): 'low' | 'medium' | 'high' {
    const total = Number(confA) + Number(confB);
    if (total > 1.6) return 'high';
    if (total > 1.2) return 'medium';
    return 'low';
  }

  private mapFact(row: any, suffix: 'a' | 'b'): ContentFact {
    return {
      id: row[`id_${suffix}`],
      assetId: row[`asset_${suffix}`] || '',
      subject: row.subject,
      predicate: row.predicate,
      object: row[`object_${suffix}`],
      context: row[`context_${suffix}`] || {},
      confidence: Number(row[`conf_${suffix}`]),
      isCurrent: true,
      createdAt: new Date(row[`created_${suffix}`]),
    };
  }
}
