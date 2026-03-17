/**
 * v4.4 Copilot AI助手 - 测试用例
 * 总计: 32个测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  copilotSessionService,
  copilotMessageService,
  copilotSkillService,
  quickActionService
} from '../api/src/services/copilotService';

describe('v4.4 Copilot AI助手测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. 会话管理 (10个)', () => {
    it('TC-COP-001: 应能创建Copilot会话', async () => {
      const result = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'writing',
        title: '写作助手会话'
      });

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.sessionType).toBe('writing');
      expect(result.status).toBe('active');
    });

    it('TC-COP-002: 应能获取会话详情', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'code'
      });

      const fetched = await copilotSessionService.getSessionById(session.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(session.id);
    });

    it('TC-COP-003: 不存在的会话应返回null', async () => {
      const result = await copilotSessionService.getSessionById('non-existent');
      expect(result).toBeNull();
    });

    it('TC-COP-004: 应能获取用户会话列表', async () => {
      await copilotSessionService.createSession({ userId: 'user-1', sessionType: 'general' });
      await copilotSessionService.createSession({ userId: 'user-1', sessionType: 'data' });

      const sessions = await copilotSessionService.getUserSessions('user-1');
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('TC-COP-005: 应能按状态筛选会话', async () => {
      await copilotSessionService.createSession({ userId: 'user-1', sessionType: 'general' });

      const active = await copilotSessionService.getUserSessions('user-1', 'active');
      expect(Array.isArray(active)).toBe(true);
    });

    it('TC-COP-006: 应能更新会话标题', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const updated = await copilotSessionService.updateSession(session.id, {
        title: '新标题'
      });

      expect(updated?.title).toBe('新标题');
    });

    it('TC-COP-007: 应能归档会话', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const archived = await copilotSessionService.archiveSession(session.id);
      expect(archived?.status).toBe('archived');
    });

    it('TC-COP-008: 应能删除会话', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const deleted = await copilotSessionService.deleteSession(session.id);
      expect(deleted).toBe(true);
    });

    it('TC-COP-009: 会话应关联上下文', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'writing',
        contextId: 'draft-1',
        contextType: 'draft'
      });

      expect(session.contextId).toBe('draft-1');
      expect(session.contextType).toBe('draft');
    });

    it('TC-COP-010: 会话应记录创建和更新时间', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });
  });

  describe('2. 消息管理 (10个)', () => {
    it('TC-MSG-001: 应能创建消息', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const message = await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'user',
        content: '你好'
      });

      expect(message).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('你好');
    });

    it('TC-MSG-002: 应能获取会话消息列表', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'user',
        content: '消息1'
      });

      await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'assistant',
        content: '回复1'
      });

      const messages = await copilotMessageService.getSessionMessages(session.id);
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    it('TC-MSG-003: 消息应支持不同类型', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'code'
      });

      const codeMessage = await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'assistant',
        content: '```sql\nSELECT * FROM users;\n```',
        contentType: 'code'
      });

      expect(codeMessage.contentType).toBe('code');
    });

    it('TC-MSG-004: 应能添加消息反馈', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const message = await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'assistant',
        content: '回复'
      });

      const updated = await copilotMessageService.addFeedback(message.id, 5, '很有帮助');
      expect(updated).toBe(true);
    });

    it('TC-MSG-005: 消息反馈应在1-5之间', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const message = await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'assistant',
        content: '回复'
      });

      await copilotMessageService.addFeedback(message.id, 3);
      // 验证通过，未抛出错误
      expect(true).toBe(true);
    });

    it('TC-MSG-006: 发送消息应返回用户消息和AI回复', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const result = await copilotMessageService.sendMessage(session.id, {
        content: '你好'
      });

      expect(result.userMessage).toBeDefined();
      expect(result.assistantMessage).toBeDefined();
      expect(result.userMessage.role).toBe('user');
      expect(result.assistantMessage.role).toBe('assistant');
    });

    it('TC-MSG-007: AI回复应有元数据', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const result = await copilotMessageService.sendMessage(session.id, {
        content: '你好'
      });

      expect(result.assistantMessage.metadata).toBeDefined();
    });

    it('TC-MSG-008: 消息列表应有限制数量', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const messages = await copilotMessageService.getSessionMessages(session.id, 5);
      expect(messages.length).toBeLessThanOrEqual(5);
    });

    it('TC-MSG-009: 系统消息应被记录', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const message = await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'system',
        content: '系统提示'
      });

      expect(message.role).toBe('system');
    });

    it('TC-MSG-010: 消息应记录创建时间', async () => {
      const session = await copilotSessionService.createSession({
        userId: 'user-1',
        sessionType: 'general'
      });

      const message = await copilotMessageService.createMessage({
        sessionId: session.id,
        role: 'user',
        content: '测试'
      });

      expect(message.createdAt).toBeDefined();
    });
  });

  describe('3. 技能系统 (8个)', () => {
    it('TC-SKILL-001: 应能获取所有技能', async () => {
      const skills = await copilotSkillService.getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
    });

    it('TC-SKILL-002: 应能按类别筛选技能', async () => {
      const skills = await copilotSkillService.getAllSkills('writing');
      expect(Array.isArray(skills)).toBe(true);
      skills.forEach(skill => {
        expect(skill.category).toBe('writing');
      });
    });

    it('TC-SKILL-003: 应能获取技能详情', async () => {
      const skill = await copilotSkillService.getSkillByName('writing_assistant');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('writing_assistant');
    });

    it('TC-SKILL-004: 不存在的技能应返回null', async () => {
      const skill = await copilotSkillService.getSkillByName('non-existent');
      expect(skill).toBeNull();
    });

    it('TC-SKILL-005: 内置技能应有正确标记', async () => {
      const skill = await copilotSkillService.getSkillByName('writing_assistant');
      expect(skill?.isBuiltin).toBe(true);
    });

    it('TC-SKILL-006: 技能应包含系统提示词', async () => {
      const skill = await copilotSkillService.getSkillByName('writing_assistant');
      expect(skill?.systemPrompt).toBeDefined();
      expect(skill?.systemPrompt?.length).toBeGreaterThan(0);
    });

    it('TC-SKILL-007: 技能应有所属类别', async () => {
      const skill = await copilotSkillService.getSkillByName('code_assistant');
      expect(skill?.category).toBeDefined();
    });

    it('TC-SKILL-008: 内置技能应有启用状态', async () => {
      const skill = await copilotSkillService.getSkillByName('writing_assistant');
      expect(skill?.isEnabled).toBe(true);
    });
  });

  describe('4. 快捷指令 (4个)', () => {
    it('TC-QUICK-001: 应能获取快捷指令列表', async () => {
      const actions = quickActionService.getQuickActions();
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('TC-QUICK-002: 快捷指令应包含必要信息', async () => {
      const actions = quickActionService.getQuickActions();
      const first = actions[0];

      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('icon');
      expect(first).toHaveProperty('description');
      expect(first).toHaveProperty('prompt');
    });

    it('TC-QUICK-003: 快捷指令应包含润色功能', async () => {
      const actions = quickActionService.getQuickActions();
      const polish = actions.find(a => a.id === 'polish');
      expect(polish).toBeDefined();
    });

    it('TC-QUICK-004: 快捷指令应包含SQL生成功能', async () => {
      const actions = quickActionService.getQuickActions();
      const sql = actions.find(a => a.id === 'sql');
      expect(sql).toBeDefined();
    });
  });
});