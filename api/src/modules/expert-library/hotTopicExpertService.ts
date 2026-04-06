// Hot Topic Expert Service — 热点话题专家观点生成
// 功能: 为热点话题匹配专家 → 生成专家解读 → 缓存结果

import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertLibraryDeps } from './types.js';
import { ExpertMatcher } from './expertMatcher.js';

export interface ExpertPerspective {
  expertId: string;
  expertName: string;
  domain: string[];
  opinion: string;
  keyInsights: string[];
  confidence: number;
  generatedAt: string;
}

export interface TopicPerspectivesResult {
  topicId: string;
  topicTitle: string;
  perspectives: ExpertPerspective[];
  summary: string;
}

export class HotTopicExpertService {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 为热点话题生成专家观点
   */
  async generatePerspectives(
    topicId: string,
    topicTitle: string,
    topicContent?: string,
    expertIds?: string[]
  ): Promise<TopicPerspectivesResult> {
    // 1. 选择专家
    const experts = expertIds?.length
      ? await Promise.all(expertIds.map(id => this.engine.loadExpert(id)))
      : await this.autoMatchExperts(topicTitle);

    const validExperts = experts.filter(Boolean) as any[];
    if (validExperts.length === 0) {
      return { topicId, topicTitle, perspectives: [], summary: '暂无匹配专家' };
    }

    // 2. 并发生成观点
    const perspectives = await Promise.all(
      validExperts.slice(0, 4).map(expert => this.generateSinglePerspective(expert, topicTitle, topicContent))
    );

    // 3. 生成汇总
    const validPerspectives = perspectives.filter(p => p.opinion.length > 0);
    const summary = validPerspectives.length > 0
      ? `${validPerspectives.length}位专家对「${topicTitle}」发表了观点。`
      : '专家观点生成失败。';

    // 4. 缓存结果
    this.cachePerspectives(topicId, validPerspectives).catch(() => {});

    return { topicId, topicTitle, perspectives: validPerspectives, summary };
  }

  /**
   * 获取已缓存的专家观点
   */
  async getPerspectives(topicId: string): Promise<TopicPerspectivesResult | null> {
    try {
      const result = await this.deps.db.query(
        `SELECT * FROM expert_invocations
         WHERE task_type = 'hot_topic_perspective' AND params::jsonb->>'topicId' = $1
         ORDER BY created_at DESC LIMIT 1`,
        [topicId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const cached = JSON.parse(row.output_sections || '[]');
      return {
        topicId,
        topicTitle: row.input_summary || '',
        perspectives: cached,
        summary: `缓存于 ${row.created_at}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * 自动匹配热点相关专家
   */
  private async autoMatchExperts(topicTitle: string) {
    const matcher = new ExpertMatcher(this.engine, this.deps);
    const matchResult = await matcher.match({ topic: topicTitle, importance: 0.6 });

    const experts = matchResult.domainExperts.map(e => e.expert);
    if (matchResult.seniorExpert) {
      experts.unshift(matchResult.seniorExpert.expert);
    }
    return experts;
  }

  /**
   * 生成单个专家的观点
   */
  private async generateSinglePerspective(
    expert: any,
    topicTitle: string,
    topicContent?: string
  ): Promise<ExpertPerspective> {
    const systemPrompt = `你是 ${expert.name}，${expert.domain.join('/')} 领域专家。
风格: ${expert.persona.style}
语气: ${expert.persona.tone}
分析框架: ${expert.method.frameworks.join('、')}

请对以下热点话题发表你的专业观点。

输出 JSON 格式:
{
  "opinion": "<150字以内的核心观点>",
  "keyInsights": ["<洞察1>", "<洞察2>", "<洞察3>"],
  "confidence": <0.1-1.0的置信度>
}
只输出 JSON。`;

    const userPrompt = `热点话题: ${topicTitle}${topicContent ? `\n详情: ${topicContent}` : ''}

请发表你的专业观点:`;

    try {
      const raw = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
        temperature: 0.5,
        maxTokens: 800,
        responseFormat: 'json',
      });

      let jsonStr = raw.trim();
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) jsonStr = match[1].trim();

      const parsed = JSON.parse(jsonStr);
      return {
        expertId: expert.expert_id,
        expertName: expert.name,
        domain: expert.domain,
        opinion: parsed.opinion || '',
        keyInsights: parsed.keyInsights || [],
        confidence: Math.min(1, Math.max(0.1, parsed.confidence || 0.5)),
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        expertId: expert.expert_id,
        expertName: expert.name,
        domain: expert.domain,
        opinion: '',
        keyInsights: [],
        confidence: 0,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 缓存观点到数据库
   */
  private async cachePerspectives(topicId: string, perspectives: ExpertPerspective[]): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO expert_invocations (id, expert_id, task_type, input_type, input_summary, output_sections, params)
       VALUES ($1, $2, 'hot_topic_perspective', 'text', $3, $4, $5)`,
      [
        `htp-${topicId}-${Date.now()}`,
        perspectives.map(p => p.expertId).join(','),
        `Hot topic perspectives for ${topicId}`,
        JSON.stringify(perspectives),
        JSON.stringify({ topicId }),
      ]
    );
  }
}
