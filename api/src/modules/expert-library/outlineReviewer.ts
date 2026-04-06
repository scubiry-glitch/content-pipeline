// Outline Expert Reviewer — 大纲专家评审模块
// 功能: 编排多专家对大纲进行评审 → 汇总共识 → 可选自动修订大纲

import type { ExpertEngine } from './ExpertEngine.js';
import type {
  ExpertProfile,
  ExpertOutlineReview,
  SectionReview,
  OutlineReviewResult,
  OutlineReviewRequest,
  ExpertLibraryDeps,
} from './types.js';

export class OutlineExpertReviewer {
  private engine: ExpertEngine;
  private deps: ExpertLibraryDeps;

  constructor(engine: ExpertEngine, deps: ExpertLibraryDeps) {
    this.engine = engine;
    this.deps = deps;
  }

  /**
   * 对大纲进行多专家评审
   */
  async reviewOutline(request: OutlineReviewRequest): Promise<OutlineReviewResult> {
    const { taskId, topic, outline, expertIds, autoRevise = false } = request;

    // 1. 选择评审专家（指定 or 自动匹配 2-3 位）
    const experts = await this.selectReviewers(topic, expertIds);
    if (experts.length === 0) {
      throw new Error('No experts available for outline review');
    }

    // 2. 序列化大纲为文本（供专家阅读）
    const outlineText = this.serializeOutline(outline);

    // 3. 并发请求所有专家评审
    const reviews = await Promise.all(
      experts.map(expert => this.getExpertReview(expert, topic, outlineText, outline.sections))
    );

    // 4. 汇总共识
    const consensus = this.buildConsensus(reviews);

    // 5. 可选：基于评审意见自动修订大纲
    let revisedOutline: OutlineReviewResult['revisedOutline'] | undefined;
    if (autoRevise && consensus.keyRecommendations.length > 0) {
      revisedOutline = await this.reviseOutline(topic, outline, reviews, consensus);
    }

    // 6. 异步记录评审（不阻塞返回）
    this.recordReview(taskId, reviews, consensus).catch(err =>
      console.warn('[OutlineReviewer] Failed to record review:', err)
    );

    return { taskId, reviews, consensus, revisedOutline };
  }

  /**
   * 选择评审专家
   */
  private async selectReviewers(topic: string, expertIds?: string[]): Promise<ExpertProfile[]> {
    if (expertIds && expertIds.length > 0) {
      const experts: ExpertProfile[] = [];
      for (const id of expertIds.slice(0, 4)) {
        const expert = await this.engine.loadExpert(id);
        if (expert) experts.push(expert);
      }
      return experts;
    }

    // 自动匹配：取前 3 位领域相关专家
    const allExperts = await this.engine.listExperts();
    if (allExperts.length === 0) return [];

    // 简单匹配：按领域关键词与主题的重叠度排序
    const scored = allExperts.map(expert => {
      const domains = expert.domain.join(' ').toLowerCase();
      const topicLower = topic.toLowerCase();
      const words = topicLower.split(/[\s,，、]+/).filter(w => w.length > 1);
      const matchCount = words.filter(w => domains.includes(w)).length;
      return { expert, score: matchCount };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(s => s.expert);
  }

  /**
   * 获取单个专家的大纲评审
   */
  private async getExpertReview(
    expert: ExpertProfile,
    topic: string,
    outlineText: string,
    sections: any[]
  ): Promise<ExpertOutlineReview> {
    const systemPrompt = `你是 ${expert.name}，${expert.domain.join('/')} 领域专家。
风格: ${expert.persona.style}
语气: ${expert.persona.tone}
分析框架: ${expert.method.frameworks.join('、')}

你需要以你的专业视角评审一份研究大纲，给出专业意见。

请严格按以下 JSON 格式输出，不要输出其他内容：
{
  "overallScore": <1-10的整数>,
  "overallComment": "<100字以内的总体评价>",
  "sectionReviews": [
    {
      "sectionTitle": "<章节标题>",
      "score": <1-10>,
      "comment": "<50字以内的评价>",
      "suggestedChange": "<建议修改，无则省略>"
    }
  ],
  "suggestions": ["<修改建议1>", "<修改建议2>"],
  "strengths": ["<亮点1>", "<亮点2>"],
  "risks": ["<风险1>"]
}`;

    const userPrompt = `请评审以下关于「${topic}」的研究大纲：

${outlineText}

请从你的专业角度，重点评审：
1. 大纲结构是否合理，逻辑是否清晰
2. 是否覆盖了关键议题，有无遗漏
3. 各章节的深度和广度是否合适
4. 研究角度是否有独到之处`;

    try {
      const rawOutput = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
        temperature: 0.4,
        maxTokens: 2000,
        responseFormat: 'json',
      });

      const parsed = this.parseReviewJSON(rawOutput, expert, sections);
      return parsed;
    } catch (error: any) {
      console.warn(`[OutlineReviewer] Expert ${expert.expert_id} review failed:`, error.message);
      return {
        expertId: expert.expert_id,
        expertName: expert.name,
        overallScore: 0,
        overallComment: `评审失败: ${error.message}`,
        sectionReviews: [],
        suggestions: [],
        strengths: [],
        risks: [],
      };
    }
  }

  /**
   * 解析专家评审 JSON 输出
   */
  private parseReviewJSON(raw: string, expert: ExpertProfile, sections: any[]): ExpertOutlineReview {
    // 尝试提取 JSON（可能包裹在 markdown code block 中）
    let jsonStr = raw.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    try {
      const data = JSON.parse(jsonStr);
      return {
        expertId: expert.expert_id,
        expertName: expert.name,
        overallScore: Math.min(10, Math.max(1, data.overallScore || 5)),
        overallComment: data.overallComment || '',
        sectionReviews: (data.sectionReviews || []).map((sr: any) => ({
          sectionTitle: sr.sectionTitle || '',
          score: Math.min(10, Math.max(1, sr.score || 5)),
          comment: sr.comment || '',
          suggestedChange: sr.suggestedChange,
        })),
        suggestions: data.suggestions || [],
        strengths: data.strengths || [],
        risks: data.risks || [],
      };
    } catch {
      // JSON 解析失败，从文本中提取关键信息
      return {
        expertId: expert.expert_id,
        expertName: expert.name,
        overallScore: 5,
        overallComment: raw.substring(0, 200),
        sectionReviews: [],
        suggestions: [raw.substring(0, 500)],
        strengths: [],
        risks: [],
      };
    }
  }

  /**
   * 汇总多位专家的共识
   */
  private buildConsensus(reviews: ExpertOutlineReview[]): OutlineReviewResult['consensus'] {
    const validReviews = reviews.filter(r => r.overallScore > 0);
    if (validReviews.length === 0) {
      return { avgScore: 0, commonStrengths: [], commonIssues: [], keyRecommendations: [] };
    }

    const avgScore = validReviews.reduce((sum, r) => sum + r.overallScore, 0) / validReviews.length;

    // 收集所有建议和亮点，按出现频率排序
    const allSuggestions = validReviews.flatMap(r => r.suggestions);
    const allStrengths = validReviews.flatMap(r => r.strengths);
    const allRisks = validReviews.flatMap(r => r.risks);

    // 去重并取前几项
    const commonStrengths = [...new Set(allStrengths)].slice(0, 5);
    const commonIssues = [...new Set(allRisks)].slice(0, 5);
    const keyRecommendations = [...new Set(allSuggestions)].slice(0, 8);

    return { avgScore: Math.round(avgScore * 10) / 10, commonStrengths, commonIssues, keyRecommendations };
  }

  /**
   * 基于评审意见自动修订大纲
   */
  private async reviseOutline(
    topic: string,
    original: OutlineReviewRequest['outline'],
    reviews: ExpertOutlineReview[],
    consensus: OutlineReviewResult['consensus']
  ): Promise<{ sections: any[] }> {
    const outlineText = this.serializeOutline(original);

    // 汇总评审意见
    const reviewSummary = reviews
      .filter(r => r.overallScore > 0)
      .map(r => `【${r.expertName}】(${r.overallScore}/10): ${r.overallComment}\n建议: ${r.suggestions.join('; ')}`)
      .join('\n\n');

    const prompt = `你是一位资深研究编辑。以下是关于「${topic}」的研究大纲及多位专家的评审意见。
请根据专家意见修订大纲，保持原有结构的优点，改进不足之处。

## 原始大纲
${outlineText}

## 专家评审意见
${reviewSummary}

## 关键建议
${consensus.keyRecommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

请输出修订后的大纲，格式为 JSON 数组：
[
  { "title": "章节标题", "description": "章节说明", "subsections": [{ "title": "子章节", "description": "说明" }] }
]

只输出 JSON，不要其他内容。`;

    try {
      const result = await this.deps.llm.complete(prompt, {
        temperature: 0.4,
        maxTokens: 3000,
        responseFormat: 'json',
      });

      let jsonStr = result.trim();
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) jsonStr = match[1].trim();

      const sections = JSON.parse(jsonStr);
      if (Array.isArray(sections)) {
        return { sections };
      }
    } catch (err) {
      console.warn('[OutlineReviewer] Failed to generate revised outline:', err);
    }

    // 修订失败，返回原始大纲
    return { sections: original.sections };
  }

  /**
   * 将大纲序列化为可读文本
   */
  private serializeOutline(outline: OutlineReviewRequest['outline']): string {
    const lines: string[] = [];

    if (outline.layers && outline.layers.length > 0) {
      // 三层穿透模型
      for (const layer of outline.layers) {
        lines.push(`### ${layer.title || layer.name}`);
        if (layer.sections) {
          for (const section of layer.sections) {
            lines.push(this.serializeSection(section, 1));
          }
        }
        lines.push('');
      }
    } else if (outline.sections) {
      for (const section of outline.sections) {
        lines.push(this.serializeSection(section, 1));
      }
    }

    return lines.join('\n');
  }

  private serializeSection(section: any, depth: number): string {
    const prefix = '#'.repeat(Math.min(depth + 1, 4));
    let text = `${prefix} ${section.title}`;
    if (section.description) {
      text += `\n${section.description}`;
    }
    if (section.subsections) {
      for (const sub of section.subsections) {
        text += '\n' + this.serializeSection(sub, depth + 1);
      }
    }
    return text;
  }

  /**
   * 记录评审到数据库
   */
  private async recordReview(
    taskId: string,
    reviews: ExpertOutlineReview[],
    consensus: OutlineReviewResult['consensus']
  ): Promise<void> {
    try {
      await this.deps.db.query(
        `INSERT INTO expert_invocations (id, expert_id, task_type, input_type, input_summary, output_sections, params)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `outline-review-${taskId}-${Date.now()}`,
          reviews.map(r => r.expertId).join(','),
          'outline_review',
          'text',
          `Outline review for task ${taskId}`,
          JSON.stringify(reviews),
          JSON.stringify({ consensus }),
        ]
      );
    } catch {
      // DB 不可用时静默失败
    }
  }
}
