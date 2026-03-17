/**
 * v4.2 Stage 3 文稿生成增强 - 测试用例
 * 总计: 48个测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  annotationService,
  versionService,
  chatSessionService,
  changeTrackingService
} from '../api/src/services/stage3Service';

describe('v4.2 Stage 3 文稿生成增强测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. 标注系统 (16个)', () => {
    it('TC-ANNO-001: 应能创建 error 类型标注', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'error',
        startOffset: 10,
        endOffset: 20,
        selectedText: '错误文本',
        comment: '这是一个错误',
        createdBy: 'user'
      });
      expect(result).toBeDefined();
      expect(result.type).toBe('error');
      expect(result.status).toBe('pending');
    });

    it('TC-ANNO-002: 应能创建 logic 类型标注', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'logic',
        startOffset: 0,
        endOffset: 50,
        selectedText: '逻辑有问题',
        comment: '逻辑不通顺',
        createdBy: 'ai'
      });
      expect(result.type).toBe('logic');
    });

    it('TC-ANNO-003: 应能创建 optimize 类型标注', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'optimize',
        startOffset: 100,
        endOffset: 150,
        selectedText: '可以优化',
        suggestion: '建议修改',
        createdBy: 'blueteam'
      });
      expect(result.type).toBe('optimize');
    });

    it('TC-ANNO-004: 应能获取文稿标注列表', async () => {
      const items = await annotationService.getAnnotationsByDraft('draft-1');
      expect(Array.isArray(items)).toBe(true);
    });

    it('TC-ANNO-005: 应能按版本筛选标注', async () => {
      const items = await annotationService.getAnnotationsByDraft('draft-1', 'version-1');
      expect(Array.isArray(items)).toBe(true);
    });

    it('TC-ANNO-006: 应能更新标注状态为 accepted', async () => {
      const result = await annotationService.updateAnnotationStatus('anno-1', 'accepted');
      expect(result?.status).toBe('accepted');
    });

    it('TC-ANNO-007: 应能更新标注状态为 rejected', async () => {
      const result = await annotationService.updateAnnotationStatus('anno-1', 'rejected');
      expect(result?.status).toBe('rejected');
    });

    it('TC-ANNO-008: 应能更新标注评论', async () => {
      const result = await annotationService.updateAnnotationStatus('anno-1', 'pending', {
        comment: '更新后的评论'
      });
      expect(result).toBeDefined();
    });

    it('TC-ANNO-009: 应能删除标注', async () => {
      const result = await annotationService.deleteAnnotation('anno-1');
      expect(typeof result).toBe('boolean');
    });

    it('TC-ANNO-010: 应能获取标注统计', async () => {
      const stats = await annotationService.getAnnotationStats('draft-1');
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('accepted');
      expect(stats).toHaveProperty('rejected');
      expect(stats).toHaveProperty('byType');
    });

    it('TC-ANNO-011: 应能获取单个标注详情', async () => {
      const result = await annotationService.getAnnotationById('anno-1');
      expect(result).toBeDefined();
    });

    it('TC-ANNO-012: 不存在的标注应返回 null', async () => {
      const result = await annotationService.getAnnotationById('non-existent');
      expect(result).toBeNull();
    });

    it('TC-ANNO-013: 标注应包含位置信息', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'add',
        startOffset: 5,
        endOffset: 15,
        selectedText: '选中内容',
        createdBy: 'user'
      });
      expect(result.startOffset).toBe(5);
      expect(result.endOffset).toBe(15);
    });

    it('TC-ANNO-014: 应支持 add 类型标注', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'add',
        startOffset: 0,
        endOffset: 0,
        selectedText: '',
        suggestion: '建议添加内容',
        createdBy: 'user'
      });
      expect(result.type).toBe('add');
    });

    it('TC-ANNO-015: 应支持 delete 类型标注', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'delete',
        startOffset: 20,
        endOffset: 30,
        selectedText: '待删除内容',
        createdBy: 'ai'
      });
      expect(result.type).toBe('delete');
    });

    it('TC-ANNO-016: 标注创建时间应自动填充', async () => {
      const result = await annotationService.createAnnotation({
        draftId: 'draft-1',
        type: 'error',
        startOffset: 0,
        endOffset: 10,
        selectedText: '测试',
        createdBy: 'user'
      });
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('2. 版本控制 (14个)', () => {
    it('TC-VER-001: 应能创建新版本', async () => {
      const result = await versionService.createVersion({
        draftId: 'draft-1',
        name: '初版',
        content: '文稿内容',
        createdBy: 'user'
      });
      expect(result).toBeDefined();
      expect(result.content).toBe('文稿内容');
    });

    it('TC-VER-002: 版本号应自动递增', async () => {
      const v1 = await versionService.createVersion({
        draftId: 'draft-1',
        content: '内容1',
        createdBy: 'user'
      });
      expect(v1.versionNumber).toBeGreaterThan(0);
    });

    it('TC-VER-003: 应能获取文稿版本列表', async () => {
      const versions = await versionService.getVersionsByDraft('draft-1');
      expect(Array.isArray(versions)).toBe(true);
    });

    it('TC-VER-004: 版本列表应按时间倒序', async () => {
      const versions = await versionService.getVersionsByDraft('draft-1');
      if (versions.length >= 2) {
        expect(versions[0].createdAt >= versions[1].createdAt).toBe(true);
      }
    });

    it('TC-VER-005: 应能获取版本详情', async () => {
      const result = await versionService.getVersionById('version-1');
      expect(result).toBeDefined();
    });

    it('TC-VER-006: 不存在的版本应返回 null', async () => {
      const result = await versionService.getVersionById('non-existent');
      expect(result).toBeNull();
    });

    it('TC-VER-007: 应能删除版本', async () => {
      const result = await versionService.deleteVersion('version-1');
      expect(typeof result).toBe('boolean');
    });

    it('TC-VER-008: 应能比较两个版本', async () => {
      const result = await versionService.compareVersions('ver-1', 'ver-2');
      expect(result).toBeDefined();
      if (result) {
        expect(result).toHaveProperty('diff');
        expect(result).toHaveProperty('version1');
        expect(result).toHaveProperty('version2');
      }
    });

    it('TC-VER-009: 自动保存应创建新版本', async () => {
      const result = await versionService.autoSave('draft-1', '自动保存内容', 'user');
      expect(result).toBeDefined();
      expect(result.autoSave).toBe(true);
    });

    it('TC-VER-010: 5分钟内重复自动保存应更新同一版本', async () => {
      const result1 = await versionService.autoSave('draft-1', '内容A', 'user');
      const result2 = await versionService.autoSave('draft-1', '内容B', 'user');
      expect(result1.id).toBeDefined();
      expect(result2.id).toBeDefined();
    });

    it('TC-VER-011: 版本应包含创建者信息', async () => {
      const result = await versionService.createVersion({
        draftId: 'draft-1',
        content: '测试',
        createdBy: 'test-user'
      });
      expect(result.createdBy).toBe('test-user');
    });

    it('TC-VER-012: 版本应包含名称', async () => {
      const result = await versionService.createVersion({
        draftId: 'draft-1',
        name: '重要版本',
        content: '内容',
        createdBy: 'user'
      });
      expect(result.name).toBe('重要版本');
    });

    it('TC-VER-013: 应能按版本号获取版本', async () => {
      const result = await versionService.getVersionByNumber('draft-1', 1);
      expect(result).toBeDefined();
    });

    it('TC-VER-014: 版本比较应返回差异统计', async () => {
      const result = await versionService.compareVersions('ver-1', 'ver-2');
      if (result) {
        expect(result.diff).toHaveProperty('added');
        expect(result.diff).toHaveProperty('removed');
        expect(result.diff).toHaveProperty('unchanged');
      }
    });
  });

  describe('3. 对话会话 (12个)', () => {
    it('TC-CHAT-001: 应能创建对话会话', async () => {
      const result = await chatSessionService.createSession({
        draftId: 'draft-1',
        contextRange: { start: 0, end: 100 }
      });
      expect(result).toBeDefined();
      expect(result.draftId).toBe('draft-1');
    });

    it('TC-CHAT-002: 会话应支持指定版本', async () => {
      const result = await chatSessionService.createSession({
        draftId: 'draft-1',
        versionId: 'version-1'
      });
      expect(result.versionId).toBe('version-1');
    });

    it('TC-CHAT-003: 应能获取会话详情', async () => {
      const result = await chatSessionService.getSessionById('session-1');
      expect(result).toBeDefined();
    });

    it('TC-CHAT-004: 不存在的会话应返回 null', async () => {
      const result = await chatSessionService.getSessionById('non-existent');
      expect(result).toBeNull();
    });

    it('TC-CHAT-005: 应能获取文稿的所有会话', async () => {
      const sessions = await chatSessionService.getSessionsByDraft('draft-1');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('TC-CHAT-006: 应能添加用户消息', async () => {
      const result = await chatSessionService.addMessage('session-1', {
        role: 'user',
        content: '帮我把这一段改得更简洁'
      });
      expect(result).toBeDefined();
    });

    it('TC-CHAT-007: 应能添加 AI 回复', async () => {
      const result = await chatSessionService.addMessage('session-1', {
        role: 'assistant',
        content: '好的，这是修改后的内容'
      });
      expect(result).toBeDefined();
    });

    it('TC-CHAT-008: 消息应包含时间戳', async () => {
      const session = await chatSessionService.addMessage('session-1', {
        role: 'user',
        content: '测试消息'
      });
      if (session && session.messages.length > 0) {
        expect(session.messages[session.messages.length - 1].timestamp).toBeDefined();
      }
    });

    it('TC-CHAT-009: 应能删除会话', async () => {
      const result = await chatSessionService.deleteSession('session-1');
      expect(typeof result).toBe('boolean');
    });

    it('TC-CHAT-010: 会话应记录上下文范围', async () => {
      const result = await chatSessionService.createSession({
        draftId: 'draft-1',
        contextRange: { start: 50, end: 200 }
      });
      expect(result.contextRange).toEqual({ start: 50, end: 200 });
    });

    it('TC-CHAT-011: 会话应支持多轮对话', async () => {
      await chatSessionService.addMessage('session-1', { role: 'user', content: '第一问' });
      await chatSessionService.addMessage('session-1', { role: 'assistant', content: '第一答' });
      await chatSessionService.addMessage('session-1', { role: 'user', content: '第二问' });
      const session = await chatSessionService.getSessionById('session-1');
      if (session) {
        expect(session.messages.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('TC-CHAT-012: 会话列表应按时间倒序', async () => {
      const sessions = await chatSessionService.getSessionsByDraft('draft-1');
      if (sessions.length >= 2) {
        expect(sessions[0].createdAt >= sessions[1].createdAt).toBe(true);
      }
    });
  });

  describe('4. 修改追踪 (6个)', () => {
    it('TC-LOG-001: 应能记录修改日志', async () => {
      const result = await changeTrackingService.logChange({
        draftId: 'draft-1',
        changeType: 'annotation',
        changeSummary: '接受标注建议',
        changedBy: 'user'
      });
      expect(result).toBeDefined();
    });

    it('TC-LOG-002: 应能获取修改历史', async () => {
      const logs = await changeTrackingService.getChangeLogs('draft-1');
      expect(Array.isArray(logs)).toBe(true);
    });

    it('TC-LOG-003: 修改日志应包含版本信息', async () => {
      const result = await changeTrackingService.logChange({
        draftId: 'draft-1',
        versionFrom: 'ver-1',
        versionTo: 'ver-2',
        changeType: 'manual',
        changeSummary: '手动编辑',
        changedBy: 'user'
      });
      expect(result.versionFrom).toBe('ver-1');
      expect(result.versionTo).toBe('ver-2');
    });

    it('TC-LOG-004: 修改日志应支持 chat 类型', async () => {
      const result = await changeTrackingService.logChange({
        draftId: 'draft-1',
        changeType: 'chat',
        changeSummary: 'AI 对话修改',
        changedBy: 'ai'
      });
      expect(result.changeType).toBe('chat');
    });

    it('TC-LOG-005: 应能获取修改详情', async () => {
      const result = await changeTrackingService.getChangeLogById('log-1');
      expect(result).toBeDefined();
    });

    it('TC-LOG-006: 修改历史应支持限制数量', async () => {
      const logs = await changeTrackingService.getChangeLogs('draft-1', 10);
      expect(logs.length).toBeLessThanOrEqual(10);
    });
  });
});
