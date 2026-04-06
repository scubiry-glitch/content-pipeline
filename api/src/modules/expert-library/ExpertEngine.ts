// Expert Engine — 核心调度中心
// 调度流程: 加载专家 → 输入增强 → 知识检索 → prompt组装 → LLM调用 → EMM门控 → 输出格式化

import { v4 as uuidv4 } from 'uuid';
import type {
  ExpertLibraryDeps, ExpertProfile, ExpertRequest, ExpertResponse,
  InputAnalysis, EMMGateResult, KnowledgeSource
} from './types.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { processInput } from './inputProcessor.js';
import { emmGateCheck } from './emmGate.js';
import { formatOutput } from './outputFormatter.js';
import { analyzeThenJudge } from './analyzeThenJudge.js';

export class ExpertEngine {
  private deps: ExpertLibraryDeps;
  private expertCache: Map<string, ExpertProfile> = new Map();

  constructor(deps: ExpertLibraryDeps) {
    this.deps = deps;
  }

  /**
   * 核心调用入口
   */
  async invoke(request: ExpertRequest): Promise<ExpertResponse> {
    const startTime = Date.now();
    const invokeId = uuidv4();

    // Step 1: 加载专家 profile
    const expert = await this.loadExpert(request.expert_id);
    if (!expert) {
      throw new Error(`Expert not found: ${request.expert_id}`);
    }

    // Step 2: 输入增强
    const inputAnalysis = await processInput(
      request.input_data,
      request.input_type,
      this.deps.llm,
      this.deps.fileParser
    );

    // Step 3: 检索相关知识源
    const knowledgeContext = await this.retrieveKnowledge(request.expert_id, request.input_data);

    // Step 4: 根据 task_type 选择执行路径
    let rawOutput: string;
    let emmResult: EMMGateResult;

    if (request.task_type === 'evaluation') {
      // Evaluation 使用 Analyze-then-Judge 范式
      const analysisResult = await analyzeThenJudge(
        request.input_data,
        request.input_type,
        expert,
        this.deps.llm,
        request.context
      );
      rawOutput = analysisResult.verdict.sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n');
      emmResult = await emmGateCheck(rawOutput, expert.emm, this.deps.llm);
    } else {
      // Analysis / Generation 使用标准 prompt 流程
      const systemPrompt = buildSystemPrompt(expert, {
        taskType: request.task_type,
        inputAnalysis,
        knowledgeContext: knowledgeContext || undefined,
        params: request.params,
      });

      const userPrompt = buildUserPrompt(request);

      rawOutput = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
        temperature: request.task_type === 'generation' ? 0.7 : 0.4,
        maxTokens: request.params?.depth === 'deep' ? 4000 : 2000,
      });

      // Step 5: EMM 门控验证
      emmResult = await emmGateCheck(rawOutput, expert.emm, this.deps.llm);
    }

    // Step 6: 输出格式化
    const formatted = await formatOutput(rawOutput, expert, this.deps.llm);

    // Step 7: 记录调用（异步，不阻塞返回）
    this.recordInvocation(invokeId, request, expert, inputAnalysis, emmResult, formatted.sections)
      .catch(err => console.warn('[ExpertEngine] Failed to record invocation:', err));

    return {
      expert_id: expert.expert_id,
      expert_name: expert.name,
      task_type: request.task_type,
      output: {
        sections: formatted.sections,
      },
      metadata: {
        input_analysis: inputAnalysis,
        emm_result: emmResult,
        confidence: calculateConfidence(emmResult, formatted.valid),
        processing_time_ms: Date.now() - startTime,
        invoke_id: invokeId,
      },
    };
  }

  /**
   * 加载专家 profile
   */
  async loadExpert(expertId: string): Promise<ExpertProfile | null> {
    // 先查缓存
    if (this.expertCache.has(expertId)) {
      return this.expertCache.get(expertId)!;
    }

    // 查 DB
    try {
      const result = await this.deps.db.query(
        `SELECT * FROM expert_profiles WHERE expert_id = $1 AND is_active = true`,
        [expertId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const profile = dbRowToProfile(row);
        this.expertCache.set(expertId, profile);
        return profile;
      }
    } catch (err) {
      console.warn('[ExpertEngine] DB query failed, trying in-memory data:', err);
    }

    return null;
  }

  /**
   * 注册内存中的专家 profile（用于测试和初始化）
   */
  registerExpert(profile: ExpertProfile): void {
    this.expertCache.set(profile.expert_id, profile);
  }

  /**
   * 更新内存中的专家 profile（会话级别，重启后重置）
   * 支持更新: signature_phrases, anti_patterns, constraints, persona.style/tone/bias
   */
  updateExpert(expertId: string, patch: Partial<Pick<ExpertProfile, 'signature_phrases' | 'anti_patterns' | 'constraints'>>): boolean {
    const existing = this.expertCache.get(expertId);
    if (!existing) return false;
    const updated = { ...existing, ...patch };
    this.expertCache.set(expertId, updated);
    return true;
  }

  /**
   * 列出所有专家
   */
  async listExperts(filter?: { domain?: string }): Promise<ExpertProfile[]> {
    // 先返回缓存中的
    const cached = Array.from(this.expertCache.values());
    if (cached.length > 0 && !filter?.domain) {
      return cached;
    }

    try {
      let sql = `SELECT * FROM expert_profiles WHERE is_active = true`;
      const params: any[] = [];

      if (filter?.domain) {
        sql += ` AND $1 = ANY(domain)`;
        params.push(filter.domain);
      }

      sql += ` ORDER BY name`;
      const result = await this.deps.db.query(sql, params);
      return result.rows.map(dbRowToProfile);
    } catch {
      return cached;
    }
  }

  /**
   * 检索专家的相关知识源
   */
  private async retrieveKnowledge(expertId: string, topic: string): Promise<string | null> {
    try {
      const result = await this.deps.db.query(
        `SELECT title, summary, key_insights
         FROM expert_knowledge_sources
         WHERE expert_id = $1 AND is_active = true
         ORDER BY created_at DESC
         LIMIT 5`,
        [expertId]
      );

      if (result.rows.length === 0) return null;

      return result.rows.map((row: any) => {
        const insights = row.key_insights || [];
        return `- [${row.title}]: ${row.summary || ''}${insights.length > 0 ? '\n  关键洞察: ' + insights.join('; ') : ''}`;
      }).join('\n');
    } catch {
      return null;
    }
  }

  /**
   * 1v1 对话接口 — 支持多轮会话
   */
  async chat(request: {
    expert_id: string;
    message: string;
    history?: Array<{ role: 'user' | 'expert'; content: string }>;
    conversation_id?: string;
  }): Promise<{ reply: string; expert_name: string; conversation_id: string }> {
    const expert = await this.loadExpert(request.expert_id);
    if (!expert) {
      throw new Error(`Expert not found: ${request.expert_id}`);
    }

    // 构建对话专用 system prompt（更精简，突出人格而非结构化输出）
    const systemPrompt = `你是 ${expert.name}。直接以 ${expert.name} 的身份回答，不要解释你的思路，不要说"作为AI"，不要重述问题。

风格: ${expert.persona.style}
语气: ${expert.persona.tone}
方法论: ${expert.method.frameworks.join('、')}

分析步骤:
${expert.method.analysis_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

规则:
- 直接输出 ${expert.name} 的回答内容，第一句话就是观点
${expert.anti_patterns.map(p => `- ${p}`).join('\n')}
${expert.signature_phrases.length > 0 ? `标志性句式: ${expert.signature_phrases.join(' / ')}` : ''}`;

    // 格式化历史记录
    const historyText = (request.history || [])
      .map(m => `${m.role === 'user' ? '用户' : expert.name}: ${m.content}`)
      .join('\n\n');

    const userPrompt = historyText
      ? `${historyText}\n\n用户: ${request.message}\n\n${expert.name}:`
      : `用户: ${request.message}\n\n${expert.name}:`;

    const reply = await this.deps.llm.completeWithSystem(systemPrompt, userPrompt, {
      temperature: 0.6,
      maxTokens: 1500,
    });

    const conversationId = request.conversation_id || `chat-${Date.now()}`;

    // 异步记录（不阻塞）
    this.deps.db.query(
      `INSERT INTO expert_invocations (id, expert_id, task_type, input_type, input_summary, params)
       VALUES ($1, $2, 'chat', 'text', $3, $4)`,
      [conversationId + '-' + Date.now(), expert.expert_id, request.message.substring(0, 200), JSON.stringify({ conversation_id: conversationId })]
    ).catch(() => {});

    return { reply, expert_name: expert.name, conversation_id: conversationId };
  }

  /**
   * 记录调用历史
   */
  private async recordInvocation(
    invokeId: string,
    request: ExpertRequest,
    expert: ExpertProfile,
    inputAnalysis: InputAnalysis,
    emmResult: EMMGateResult,
    sections: any[]
  ): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO expert_invocations
       (id, expert_id, task_type, input_type, input_summary, output_sections, input_analysis, emm_gates_passed, confidence, params)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        invokeId,
        request.expert_id,
        request.task_type,
        request.input_type,
        request.input_data.substring(0, 500),
        JSON.stringify(sections),
        JSON.stringify(inputAnalysis),
        emmResult.passed ? Object.keys(emmResult.factor_coverage) : [],
        calculateConfidence(emmResult, true),
        JSON.stringify(request.params || {}),
      ]
    );
  }
}

// ----- Helper Functions -----

function buildUserPrompt(request: ExpertRequest): string {
  const lines: string[] = [];

  lines.push(`请对以下${getInputTypeLabel(request.input_type)}进行${getTaskTypeLabel(request.task_type)}。`);

  if (request.context) {
    lines.push(`\n背景信息：${request.context}`);
  }

  lines.push(`\n## 待分析内容\n${request.input_data}`);

  return lines.join('\n');
}

function getInputTypeLabel(inputType: string): string {
  const labels: Record<string, string> = {
    text: '文本内容',
    ppt: '演示文稿(PPT)',
    image: '图片',
    pdf: 'PDF文档',
    video: '视频内容',
    meeting_minutes: '会议纪要',
  };
  return labels[inputType] || '内容';
}

function getTaskTypeLabel(taskType: string): string {
  const labels: Record<string, string> = {
    analysis: '深度分析',
    evaluation: '评估审查',
    generation: '内容生成',
  };
  return labels[taskType] || '分析';
}

function calculateConfidence(emmResult: EMMGateResult, formatValid: boolean): number {
  let confidence = 1.0;

  // EMM 门控降低置信度
  if (!emmResult.passed) {
    confidence -= 0.3;
  }
  confidence -= emmResult.violation_cost.total * 0.2;

  // 格式问题降低置信度
  if (!formatValid) {
    confidence -= 0.1;
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

function dbRowToProfile(row: any): ExpertProfile {
  return {
    expert_id: row.expert_id,
    name: row.name,
    domain: row.domain || [],
    persona: row.persona || { style: '', tone: '', bias: [] },
    method: row.method || { frameworks: [], reasoning: '', analysis_steps: [] },
    emm: row.emm || undefined,
    constraints: row.constraints_config || { must_conclude: true, allow_assumption: false },
    output_schema: row.output_schema || { format: 'structured_report', sections: [] },
    anti_patterns: row.anti_patterns || [],
    signature_phrases: row.signature_phrases || [],
  };
}
