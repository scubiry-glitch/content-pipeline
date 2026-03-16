// v4.4 Copilot AI助手服务
import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getRouter } from '../providers/index.js';

// ============ 类型定义 ============
export interface CopilotSession {
  id: string;
  userId: string;
  sessionType: 'writing' | 'code' | 'data' | 'general';
  title?: string;
  contextId?: string;
  contextType?: string;
  config: Record<string, any>;
  messageCount: number;
  tokenUsed: number;
  status: 'active' | 'archived' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
}

export interface CopilotMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  contentType: 'text' | 'code' | 'markdown' | 'json';
  metadata?: Record<string, any>;
  toolCalls?: any[];
  toolResults?: any[];
  feedbackRating?: number;
  feedbackComment?: string;
  createdAt: Date;
}

export interface CopilotSkill {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  skillType: 'builtin' | 'custom' | 'plugin';
  category: 'writing' | 'code' | 'data' | 'analysis' | 'utility';
  promptTemplate?: string;
  systemPrompt?: string;
  tools?: any[];
  triggers?: string[];
  isEnabled: boolean;
  isBuiltin: boolean;
}

export interface CreateSessionData {
  userId: string;
  sessionType: 'writing' | 'code' | 'data' | 'general';
  title?: string;
  contextId?: string;
  contextType?: string;
  config?: Record<string, any>;
}

export interface SendMessageData {
  content: string;
  contentType?: 'text' | 'code' | 'markdown';
  skillName?: string;
}

// ============ Copilot会话服务 ============
export class CopilotSessionService {
  // 创建会话
  async createSession(data: CreateSessionData): Promise<CopilotSession> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO copilot_sessions (
        id, user_id, session_type, title, context_id, context_type,
        config, message_count, token_used, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 'active', NOW(), NOW())
      RETURNING *`,
      [
        id, data.userId, data.sessionType, data.title,
        data.contextId, data.contextType,
        JSON.stringify(data.config || {})
      ]
    );

    return this.formatSession(result.rows[0]);
  }

  // 获取会话
  async getSessionById(id: string): Promise<CopilotSession | null> {
    const result = await query(
      `SELECT * FROM copilot_sessions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.formatSession(result.rows[0]);
  }

  // 获取用户的会话列表
  async getUserSessions(userId: string, status?: string): Promise<CopilotSession[]> {
    let sql = `SELECT * FROM copilot_sessions WHERE user_id = $1`;
    const params: any[] = [userId];

    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY last_message_at DESC NULLS LAST, created_at DESC`;

    const result = await query(sql, params);
    return result.rows.map(row => this.formatSession(row));
  }

  // 更新会话
  async updateSession(id: string, updates: Partial<CopilotSession>): Promise<CopilotSession | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      params.push(updates.title);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }

    if (updates.config !== undefined) {
      fields.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.config));
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE copilot_sessions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    return this.formatSession(result.rows[0]);
  }

  // 删除会话
  async deleteSession(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM copilot_sessions WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  // 归档会话
  async archiveSession(id: string): Promise<CopilotSession | null> {
    return this.updateSession(id, { status: 'archived' });
  }

  private formatSession(row: any): CopilotSession {
    return {
      id: row.id,
      userId: row.user_id,
      sessionType: row.session_type,
      title: row.title,
      contextId: row.context_id,
      contextType: row.context_type,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      messageCount: row.message_count,
      tokenUsed: row.token_used,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at
    };
  }
}

// ============ Copilot消息服务 ============
export class CopilotMessageService {
  // 发送消息并获取AI回复
  async sendMessage(
    sessionId: string,
    data: SendMessageData,
    context?: Record<string, any>
  ): Promise<{ userMessage: CopilotMessage; assistantMessage: CopilotMessage }> {
    // 1. 保存用户消息
    const userMessage = await this.createMessage({
      sessionId,
      role: 'user',
      content: data.content,
      contentType: data.contentType || 'text'
    });

    // 2. 获取会话历史
    const history = await this.getSessionMessages(sessionId, 20);

    // 3. 获取技能配置
    let systemPrompt = '你是一位AI助手，请帮助用户完成他们的任务。';
    if (data.skillName) {
      const skillResult = await query(
        `SELECT system_prompt FROM copilot_skills WHERE name = $1 AND is_enabled = true`,
        [data.skillName]
      );
      if (skillResult.rows.length > 0) {
        systemPrompt = skillResult.rows[0].system_prompt;
      }
    }

    // 4. 构建消息列表
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: data.content }
    ];

    // 5. 调用AI生成回复
    const startTime = Date.now();
    let aiContent = '';
    let metadata: Record<string, any> = {};

    try {
      const router = getRouter();
      if (router) {
        const response = await router.complete({
          messages,
          temperature: 0.7,
          max_tokens: 2000
        });
        aiContent = response.content;
        metadata = {
          model: response.model,
          tokens: response.usage?.total_tokens,
          latency: Date.now() - startTime
        };
      } else {
        aiContent = 'AI服务暂时不可用，请稍后重试。';
      }
    } catch (error) {
      aiContent = '生成回复时出错，请重试。';
      metadata = { error: true };
    }

    // 6. 保存AI回复
    const assistantMessage = await this.createMessage({
      sessionId,
      role: 'assistant',
      content: aiContent,
      contentType: 'markdown',
      metadata
    });

    // 7. 更新会话统计
    await query(
      `UPDATE copilot_sessions
       SET message_count = message_count + 2,
           token_used = token_used + $1,
           last_message_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [metadata.tokens || 0, sessionId]
    );

    return { userMessage, assistantMessage };
  }

  // 创建消息
  async createMessage(data: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    contentType?: 'text' | 'code' | 'markdown' | 'json';
    metadata?: Record<string, any>;
    toolCalls?: any[];
    toolResults?: any[];
  }): Promise<CopilotMessage> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO copilot_messages (
        id, session_id, role, content, content_type,
        metadata, tool_calls, tool_results, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        id, data.sessionId, data.role, data.content,
        data.contentType || 'text',
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.toolCalls ? JSON.stringify(data.toolCalls) : null,
        data.toolResults ? JSON.stringify(data.toolResults) : null
      ]
    );

    return this.formatMessage(result.rows[0]);
  }

  // 获取会话消息
  async getSessionMessages(sessionId: string, limit: number = 50): Promise<CopilotMessage[]> {
    const result = await query(
      `SELECT * FROM copilot_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [sessionId, limit]
    );

    return result.rows.map(row => this.formatMessage(row));
  }

  // 添加消息反馈
  async addFeedback(messageId: string, rating: number, comment?: string): Promise<boolean> {
    const result = await query(
      `UPDATE copilot_messages
       SET feedback_rating = $1, feedback_comment = $2
       WHERE id = $3
       RETURNING id`,
      [rating, comment, messageId]
    );

    return result.rows.length > 0;
  }

  private formatMessage(row: any): CopilotMessage {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      contentType: row.content_type,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      toolCalls: row.tool_calls ? (typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : row.tool_calls) : undefined,
      toolResults: row.tool_results ? (typeof row.tool_results === 'string' ? JSON.parse(row.tool_results) : row.tool_results) : undefined,
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      createdAt: row.created_at
    };
  }
}

// ============ Copilot技能服务 ============
export class CopilotSkillService {
  // 获取所有技能
  async getAllSkills(category?: string): Promise<CopilotSkill[]> {
    let sql = `SELECT * FROM copilot_skills WHERE is_enabled = true`;
    const params: any[] = [];

    if (category) {
      sql += ` AND category = $1`;
      params.push(category);
    }

    sql += ` ORDER BY is_builtin DESC, display_name ASC`;

    const result = await query(sql, params);
    return result.rows.map(row => this.formatSkill(row));
  }

  // 获取技能详情
  async getSkillByName(name: string): Promise<CopilotSkill | null> {
    const result = await query(
      `SELECT * FROM copilot_skills WHERE name = $1`,
      [name]
    );

    if (result.rows.length === 0) return null;
    return this.formatSkill(result.rows[0]);
  }

  // 创建技能
  async createSkill(data: {
    name: string;
    displayName: string;
    description?: string;
    category: string;
    systemPrompt: string;
    tools?: any[];
    triggers?: string[];
    createdBy: string;
  }): Promise<CopilotSkill> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO copilot_skills (
        id, name, display_name, description, skill_type, category,
        system_prompt, tools, triggers, is_enabled, is_builtin, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'custom', $5, $6, $7, $8, true, false, $9, NOW(), NOW())
      RETURNING *`,
      [
        id, data.name, data.displayName, data.description,
        data.category, data.systemPrompt,
        data.tools ? JSON.stringify(data.tools) : '[]',
        data.triggers ? JSON.stringify(data.triggers) : '[]',
        data.createdBy
      ]
    );

    return this.formatSkill(result.rows[0]);
  }

  // 更新技能
  async updateSkill(name: string, updates: Partial<CopilotSkill>): Promise<CopilotSkill | null> {
    if (updates.isBuiltin) {
      throw new Error('Cannot modify builtin skills');
    }

    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
      fields.push(`display_name = $${paramIndex++}`);
      params.push(updates.displayName);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.systemPrompt !== undefined) {
      fields.push(`system_prompt = $${paramIndex++}`);
      params.push(updates.systemPrompt);
    }

    if (updates.isEnabled !== undefined) {
      fields.push(`is_enabled = $${paramIndex++}`);
      params.push(updates.isEnabled);
    }

    fields.push(`updated_at = NOW()`);
    params.push(name);

    const result = await query(
      `UPDATE copilot_skills SET ${fields.join(', ')} WHERE name = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    return this.formatSkill(result.rows[0]);
  }

  // 删除技能
  async deleteSkill(name: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM copilot_skills WHERE name = $1 AND is_builtin = false RETURNING id`,
      [name]
    );
    return result.rows.length > 0;
  }

  // 根据内容检测适用的技能
  async detectSkills(content: string): Promise<CopilotSkill[]> {
    const skills = await this.getAllSkills();
    const matched: CopilotSkill[] = [];

    for (const skill of skills) {
      if (skill.triggers && skill.triggers.length > 0) {
        for (const trigger of skill.triggers) {
          if (content.toLowerCase().includes(trigger.toLowerCase())) {
            matched.push(skill);
            break;
          }
        }
      }
    }

    return matched;
  }

  private formatSkill(row: any): CopilotSkill {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      skillType: row.skill_type,
      category: row.category,
      promptTemplate: row.prompt_template,
      systemPrompt: row.system_prompt,
      tools: row.tools ? (typeof row.tools === 'string' ? JSON.parse(row.tools) : row.tools) : [],
      triggers: row.triggers ? (typeof row.triggers === 'string' ? JSON.parse(row.triggers) : row.triggers) : [],
      isEnabled: row.is_enabled,
      isBuiltin: row.is_builtin
    };
  }
}

// ============ 快捷指令服务 ============
export class QuickActionService {
  // 预定义的快捷指令
  private readonly quickActions = [
    {
      id: 'polish',
      name: '润色文字',
      icon: '✨',
      description: '改进文字表达，使其更加流畅',
      prompt: '请润色以下文字，保持原意的同时提升表达质量：\n\n{{content}}'
    },
    {
      id: 'expand',
      name: '扩写内容',
      icon: '📝',
      description: '扩展内容，增加深度和细节',
      prompt: '请扩写以下内容，增加更多细节和深度：\n\n{{content}}'
    },
    {
      id: 'summarize',
      name: '总结要点',
      icon: '📋',
      description: '提炼核心要点',
      prompt: '请总结以下内容的核心要点：\n\n{{content}}'
    },
    {
      id: 'sql',
      name: '生成SQL',
      icon: '🔍',
      description: '将自然语言转换为SQL查询',
      prompt: '请将以下需求转换为SQL查询：\n\n{{content}}\n\n假设有以下表结构：\n- drafts (id, title, content, status, created_at)\n- tasks (id, title, status, assignee, due_date)'
    },
    {
      id: 'analyze',
      name: '数据分析',
      icon: '📊',
      description: '分析数据并提供洞察',
      prompt: '请分析以下数据并提供洞察：\n\n{{content}}'
    },
    {
      id: 'check',
      name: '检查问题',
      icon: '🔍',
      description: '检查内容中的问题',
      prompt: '请检查以下内容，找出潜在的问题或改进空间：\n\n{{content}}'
    }
  ];

  // 获取所有快捷指令
  getQuickActions(): typeof this.quickActions {
    return this.quickActions;
  }

  // 执行快捷指令
  async executeQuickAction(
    actionId: string,
    content: string,
    sessionService: CopilotSessionService,
    messageService: CopilotMessageService,
    userId: string
  ): Promise<{ sessionId: string; response: string }> {
    const action = this.quickActions.find(a => a.id === actionId);
    if (!action) {
      throw new Error('Quick action not found');
    }

    // 创建会话
    const session = await sessionService.createSession({
      userId,
      sessionType: 'general',
      title: action.name
    });

    // 构建提示
    const prompt = action.prompt.replace('{{content}}', content);

    // 发送消息
    const { assistantMessage } = await messageService.sendMessage(
      session.id,
      { content: prompt }
    );

    return {
      sessionId: session.id,
      response: assistantMessage.content
    };
  }
}

// ============ 导出服务实例 ============
export const copilotSessionService = new CopilotSessionService();
export const copilotMessageService = new CopilotMessageService();
export const copilotSkillService = new CopilotSkillService();
export const quickActionService = new QuickActionService();
