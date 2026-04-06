// Asset Expert Service — 素材专家标注与可信度评估
// 功能: 匹配专家 → 生成专业解读 → 评估可信度

import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertLibraryDeps } from './types.js';
import { ExpertMatcher } from './expertMatcher.js';

export interface AssetAnnotation {
  expertId: string;
  expertName: string;
  content: string;
  takeaways: string[];
  credibilityScore: number;
  generatedAt: string;
}

export interface AssetAnnotationResult {
  assetId: string;
  assetTitle: string;
  annotations: AssetAnnotation[];
  overallCredibility: number;
}

export class AssetExpertService {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 为素材生成专家标注
   */
  async annotateAsset(
    assetId: string,
    assetTitle: string,
    assetContent: string,
    assetTags?: string[],
    expertIds?: string[]
  ): Promise<AssetAnnotationResult> {
    // 1. 选择专家
    const experts = expertIds?.length
      ? await Promise.all(expertIds.map(id => this.engine.loadExpert(id)))
      : await this.autoMatchExperts(assetTitle, assetTags);

    const validExperts = (experts.filter(Boolean) as any[]).slice(0, 3);
    if (validExperts.length === 0) {
      return { assetId, assetTitle, annotations: [], overallCredibility: 0 };
    }

    // 2. 并发生成标注
    const annotations = await Promise.all(
      validExperts.map(expert => this.generateAnnotation(expert, assetTitle, assetContent))
    );

    const validAnnotations = annotations.filter(a => a.content.length > 0);

    // 3. 计算综合可信度
    const overallCredibility = validAnnotations.length > 0
      ? validAnnotations.reduce((sum, a) => sum + a.credibilityScore, 0) / validAnnotations.length
      : 0;

    // 4. 缓存
    this.cacheAnnotations(assetId, validAnnotations).catch(() => {});

    return { assetId, assetTitle, annotations: validAnnotations, overallCredibility };
  }

  /**
   * 获取已缓存的素材标注
   */
  async getAnnotations(assetId: string): Promise<AssetAnnotationResult | null> {
    try {
      const result = await this.deps.db.query(
        `SELECT * FROM expert_invocations
         WHERE task_type = 'asset_annotation' AND params::jsonb->>'assetId' = $1
         ORDER BY created_at DESC LIMIT 1`,
        [assetId]
      );

      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      const annotations = JSON.parse(row.output_sections || '[]');

      return {
        assetId,
        assetTitle: row.input_summary || '',
        annotations,
        overallCredibility: annotations.length > 0
          ? annotations.reduce((s: number, a: any) => s + (a.credibilityScore || 0), 0) / annotations.length
          : 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * 专家参与的素材可信度评估
   */
  async assessCredibility(
    assetId: string,
    assetTitle: string,
    assetContent: string,
    expertIds?: string[]
  ): Promise<{ assetId: string; scores: Array<{ expertId: string; expertName: string; score: number; comment: string }> ; overallScore: number }> {
    const experts = expertIds?.length
      ? await Promise.all(expertIds.map(id => this.engine.loadExpert(id)))
      : await this.autoMatchExperts(assetTitle);

    const validExperts = (experts.filter(Boolean) as any[]).slice(0, 3);
    if (validExperts.length === 0) {
      return { assetId, scores: [], overallScore: 0 };
    }

    const scores = await Promise.all(
      validExperts.map(async (expert) => {
        const systemPrompt = `你是 ${expert.name}，请评估以下素材的可信度。
输出 JSON: { "score": <1-10>, "comment": "<50字以内评价>" }
只输出 JSON。`;
        const userPrompt = `素材标题: ${assetTitle}\n内容摘要: ${assetContent.substring(0, 500)}`;

        try {
          const raw = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
            temperature: 0.3, maxTokens: 200, responseFormat: 'json',
          });
          let jsonStr = raw.trim();
          const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
          if (m) jsonStr = m[1].trim();
          const parsed = JSON.parse(jsonStr);
          return {
            expertId: expert.expert_id,
            expertName: expert.name,
            score: Math.min(10, Math.max(1, parsed.score || 5)),
            comment: parsed.comment || '',
          };
        } catch {
          return { expertId: expert.expert_id, expertName: expert.name, score: 5, comment: '评估失败' };
        }
      })
    );

    const overallScore = scores.reduce((s, sc) => s + sc.score, 0) / scores.length;
    return { assetId, scores, overallScore: Math.round(overallScore * 10) / 10 };
  }

  private async autoMatchExperts(title: string, tags?: string[]) {
    const matcher = new ExpertMatcher(this.engine, this.deps);
    const topic = tags?.length ? `${title} ${tags.join(' ')}` : title;
    const result = await matcher.match({ topic, importance: 0.5 });
    return result.domainExperts.map(e => e.expert);
  }

  private async generateAnnotation(expert: any, title: string, content: string): Promise<AssetAnnotation> {
    const systemPrompt = `你是 ${expert.name}，${expert.domain.join('/')} 领域专家。
请对以下素材进行专业解读。
输出 JSON:
{
  "content": "<200字以内的专业解读>",
  "takeaways": ["<要点1>", "<要点2>"],
  "credibilityScore": <1-10>
}
只输出 JSON。`;

    const userPrompt = `素材标题: ${title}\n内容: ${content.substring(0, 800)}`;

    try {
      const raw = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
        temperature: 0.4, maxTokens: 600, responseFormat: 'json',
      });
      let jsonStr = raw.trim();
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) jsonStr = match[1].trim();
      const parsed = JSON.parse(jsonStr);

      return {
        expertId: expert.expert_id,
        expertName: expert.name,
        content: parsed.content || '',
        takeaways: parsed.takeaways || [],
        credibilityScore: Math.min(10, Math.max(1, parsed.credibilityScore || 5)),
        generatedAt: new Date().toISOString(),
      };
    } catch {
      return { expertId: expert.expert_id, expertName: expert.name, content: '', takeaways: [], credibilityScore: 0, generatedAt: new Date().toISOString() };
    }
  }

  private async cacheAnnotations(assetId: string, annotations: AssetAnnotation[]): Promise<void> {
    const { randomUUID } = await import('crypto');
    const primaryExpertId = annotations[0]?.expertId || null;
    await this.deps.db.query(
      `INSERT INTO expert_invocations (id, expert_id, task_type, input_type, input_summary, output_sections, params)
       VALUES ($1, $2, 'asset_annotation', 'text', $3, $4, $5)`,
      [
        randomUUID(),
        primaryExpertId,
        `Asset annotation for ${assetId}`,
        JSON.stringify(annotations),
        JSON.stringify({ assetId }),
      ]
    );
  }
}
