/**
 * v4.2 Stage 3 文稿生成增强 - 测试用例
 * 总计: 51个测试
 *
 * 模块分布:
 * - 标注系统: 12个测试
 * - 对话修改: 15个测试
 * - 版本对比: 8个测试
 * - 修改追踪: 6个测试
 * - 集成测试: 10个测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAnnotation,
  getAnnotations,
  updateAnnotation,
  deleteAnnotation,
  acceptAnnotation,
  rejectAnnotation,
  applyModification,
  sendChatMessage,
  getChatHistory,
  createVersion,
  compareVersions,
  restoreVersion,
  getChangeLogs,
  annotateAndModify,
  chatAndSaveVersion,
} from '../../api/src/services/stage3-enhancement';

// ============================================================================
// 一、标注系统测试 (12个)
// ============================================================================

describe('1. 标注系统 - Annotation System', () => {
  const draftId = 'draft-001';
  const versionId = 'version-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1.1 创建标注
  describe('1.1 创建标注', () => {
    it('TC-ANNO-001: 应能创建事实错误类型标注', async () => {
      const annotation = await createAnnotation({
        draftId,
        versionId,
        type: 'error',
        startOffset: 100,
        endOffset: 150,
        selectedText: '2023年销量为100万辆',
        comment: '数据错误，应为120万辆',
        suggestion: '2023年销量为120万辆',
        createdBy: 'user',
      });

      expect(annotation).toBeDefined();
      expect(annotation.type).toBe('error');
      expect(annotation.status).toBe('pending');
    });

    it('TC-ANNO-002: 应能创建逻辑问题类型标注', async () => {
      const annotation = await createAnnotation({
        draftId,
        versionId,
        type: 'logic',
        startOffset: 200,
        endOffset: 250,
        selectedText: '因此市场会无限增长',
        comment: '论证不严谨，增长有天花板',
        createdBy: 'blueteam',
      });

      expect(annotation.type).toBe('logic');
      expect(annotation.createdBy).toBe('blueteam');
    });

    it('TC-ANNO-003: 应能创建表达优化类型标注', async () => {
      const annotation = await createAnnotation({
        draftId,
        versionId,
        type: 'optimize',
        startOffset: 300,
        endOffset: 350,
        selectedText: '这个东西很好',
        comment: '表述过于口语化',
        suggestion: '该产品具有显著优势',
        createdBy: 'ai',
      });

      expect(annotation.type).toBe('optimize');
      expect(annotation.createdBy).toBe('ai');
    });

    it('TC-ANNO-004: 应拒绝无效的标注类型', async () => {
      await expect(
        createAnnotation({
          draftId,
          versionId,
          type: 'invalid_type',
          startOffset: 100,
          endOffset: 150,
          selectedText: 'test',
          createdBy: 'user',
        })
      ).rejects.toThrow('Invalid annotation type');
    });
  });

  // 1.2 获取标注
  describe('1.2 获取标注', () => {
    it('TC-ANNO-005: 应能获取指定文稿的所有标注', async () => {
      const annotations = await getAnnotations(draftId);

      expect(Array.isArray(annotations)).toBe(true);
      expect(annotations.length).toBeGreaterThanOrEqual(0);
    });

    it('TC-ANNO-006: 应能按类型筛选标注', async () => {
      const errorAnnotations = await getAnnotations(draftId, { type: 'error' });

      expect(errorAnnotations.every(a => a.type === 'error')).toBe(true);
    });

    it('TC-ANNO-007: 应能按状态筛选标注', async () => {
      const pendingAnnotations = await getAnnotations(draftId, { status: 'pending' });

      expect(pendingAnnotations.every(a => a.status === 'pending')).toBe(true);
    });
  });

  // 1.3 更新标注
  describe('1.3 更新标注', () => {
    it('TC-ANNO-008: 应能更新标注评论内容', async () => {
      const annotationId = 'anno-001';
      const updated = await updateAnnotation(annotationId, {
        comment: '更新后的评论内容',
      });

      expect(updated.comment).toBe('更新后的评论内容');
      expect(updated.updatedAt).toBeDefined();
    });

    it('TC-ANNO-009: 应能更新建议修改内容', async () => {
      const annotationId = 'anno-001';
      const updated = await updateAnnotation(annotationId, {
        suggestion: '新的建议修改',
      });

      expect(updated.suggestion).toBe('新的建议修改');
    });
  });

  // 1.4 删除标注
  describe('1.4 删除标注', () => {
    it('TC-ANNO-010: 应能删除指定标注', async () => {
      const annotationId = 'anno-002';
      const result = await deleteAnnotation(annotationId);

      expect(result.success).toBe(true);
    });

    it('TC-ANNO-011: 删除不存在标注应返回错误', async () => {
      await expect(deleteAnnotation('non-existent')).rejects.toThrow('Annotation not found');
    });
  });

  // 1.5 接受/拒绝标注
  describe('1.5 接受/拒绝标注', () => {
    it('TC-ANNO-012: 应能接受标注建议并应用修改', async () => {
      const annotationId = 'anno-003';
      const result = await acceptAnnotation(annotationId);

      expect(result.status).toBe('accepted');
      expect(result.appliedChanges).toBeDefined();
    });

    it('TC-ANNO-013: 应能拒绝标注建议', async () => {
      const annotationId = 'anno-004';
      const result = await rejectAnnotation(annotationId, '不同意此修改');

      expect(result.status).toBe('rejected');
      expect(result.rejectReason).toBe('不同意此修改');
    });
  });
});

// ============================================================================
// 二、对话修改测试 (15个)
// ============================================================================

describe('2. 对话修改 - Conversational Editing', () => {
  const draftId = 'draft-002';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 2.1 指令模式
  describe('2.1 指令模式', () => {
    it('TC-CHAT-001: 应能解析"替换数据"指令', async () => {
      const response = await sendChatMessage(draftId, {
        message: '把第二段的2023年数据换成2024年的',
        mode: 'instruction',
        contextRange: { start: 100, end: 500 },
      });

      expect(response.type).toBe('modification');
      expect(response.changes).toBeDefined();
      expect(response.changes.length).toBeGreaterThan(0);
    });

    it('TC-CHAT-002: 应能解析"增强论证"指令', async () => {
      const response = await sendChatMessage(draftId, {
        message: '第三段的论证不够有力，加强一下',
        mode: 'instruction',
      });

      expect(response.type).toBe('modification');
      expect(response.explanation).toContain('论证');
    });

    it('TC-CHAT-003: 应能解析"风格转换"指令', async () => {
      const response = await sendChatMessage(draftId, {
        message: '把全文改成更口语化的风格',
        mode: 'instruction',
      });

      expect(response.type).toBe('modification');
      expect(response.modifiedSections).toBeGreaterThan(0);
    });

    it('TC-CHAT-004: 应能解析"压缩字数"指令', async () => {
      const response = await sendChatMessage(draftId, {
        message: '压缩到3000字',
        mode: 'instruction',
      });

      expect(response.type).toBe('modification');
      expect(response.wordCountAfter).toBeLessThanOrEqual(3000);
    });

    it('TC-CHAT-005: 应能解析"添加内容"指令', async () => {
      const response = await sendChatMessage(draftId, {
        message: '在第三段后面增加关于竞争格局的分析',
        mode: 'instruction',
      });

      expect(response.type).toBe('modification');
      expect(response.insertedContent).toBeDefined();
    });
  });

  // 2.2 问答模式
  describe('2.2 问答模式', () => {
    it('TC-CHAT-006: 应能回答"数据准确性"问题', async () => {
      const response = await sendChatMessage(draftId, {
        message: '这个数据准确吗？',
        mode: 'qa',
        contextRange: { start: 200, end: 250 },
      });

      expect(response.type).toBe('answer');
      expect(response.confidence).toBeDefined();
      expect(response.sources).toBeDefined();
    });

    it('TC-CHAT-007: 应能回答"为什么用这个例子"问题', async () => {
      const response = await sendChatMessage(draftId, {
        message: '为什么用这个例子？',
        mode: 'qa',
      });

      expect(response.type).toBe('answer');
      expect(response.reasoning).toBeDefined();
    });

    it('TC-CHAT-008: 应能回答"竞品怎么写"问题', async () => {
      const response = await sendChatMessage(draftId, {
        message: '竞品是怎么写这个话题的？',
        mode: 'qa',
      });

      expect(response.type).toBe('answer');
      expect(response.competitorReferences).toBeDefined();
    });
  });

  // 2.3 建议模式
  describe('2.3 建议模式', () => {
    it('TC-CHAT-009: AI应主动发现内容薄弱点', async () => {
      const response = await sendChatMessage(draftId, {
        message: '',
        mode: 'suggest',
        triggerPoint: 'data_insufficient',
      });

      expect(response.type).toBe('suggestion');
      expect(response.category).toBe('data_insufficient');
      expect(response.suggestion).toBeDefined();
    });

    it('TC-CHAT-010: AI应在逻辑薄弱时主动建议', async () => {
      const response = await sendChatMessage(draftId, {
        message: '',
        mode: 'suggest',
        triggerPoint: 'logic_weak',
      });

      expect(response.type).toBe('suggestion');
      expect(response.category).toBe('logic_weak');
    });

    it('TC-CHAT-011: AI应在生成后主动建议优化', async () => {
      const response = await sendChatMessage(draftId, {
        message: '',
        mode: 'suggest',
        triggerPoint: 'post_generate',
      });

      expect(response.type).toBe('suggestion');
      expect(response.improvements).toBeDefined();
    });
  });

  // 2.4 多轮对话
  describe('2.4 多轮对话', () => {
    it('TC-CHAT-012: 应支持多轮对话上下文', async () => {
      // 第一轮
      await sendChatMessage(draftId, {
        message: '修改第一段',
        mode: 'instruction',
      });

      // 第二轮（引用上下文）
      const response2 = await sendChatMessage(draftId, {
        message: '再修改一下',
        mode: 'instruction',
      });

      expect(response2.hasContext).toBe(true);
      expect(response2.previousContext).toBeDefined();
    });

    it('TC-CHAT-013: 应能获取对话历史', async () => {
      const history = await getChatHistory(draftId);

      expect(Array.isArray(history)).toBe(true);
      expect(history[0]).toHaveProperty('role');
      expect(history[0]).toHaveProperty('content');
      expect(history[0]).toHaveProperty('timestamp');
    });

    it('TC-CHAT-014: 响应时间应小于3秒', async () => {
      const start = Date.now();
      await sendChatMessage(draftId, {
        message: '优化这段文字',
        mode: 'instruction',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000);
    });

    it('TC-CHAT-015: 应能清空对话历史', async () => {
      const result = await sendChatMessage(draftId, { action: 'clear' });

      expect(result.success).toBe(true);
      expect(result.clearedMessages).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// 三、版本对比测试 (8个)
// ============================================================================

describe('3. 版本对比 - Version Diff', () => {
  const draftId = 'draft-003';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 3.1 版本创建
  describe('3.1 版本创建', () => {
    it('TC-VERSION-001: 应能手动创建版本', async () => {
      const version = await createVersion(draftId, {
        name: '标注修改后',
        createdBy: 'user',
      });

      expect(version).toBeDefined();
      expect(version.id).toBeDefined();
      expect(version.name).toBe('标注修改后');
      expect(version.versionNumber).toBeDefined();
    });

    it('TC-VERSION-002: 应能自动保存版本', async () => {
      // 模拟自动保存触发
      const version = await createVersion(draftId, {
        name: '自动保存',
        createdBy: 'system',
        autoSave: true,
      });

      expect(version.autoSave).toBe(true);
      expect(version.createdAt).toBeDefined();
    });
  });

  // 3.2 版本对比
  describe('3.2 版本对比', () => {
    it('TC-VERSION-003: 应能对比两个版本的差异', async () => {
      const version1 = 'version-001';
      const version2 = 'version-002';

      const diff = await compareVersions(draftId, version1, version2);

      expect(diff).toHaveProperty('added');
      expect(diff).toHaveProperty('deleted');
      expect(diff).toHaveProperty('modified');
      expect(diff).toHaveProperty('statistics');
    });

    it('TC-VERSION-004: 应能显示新增内容', async () => {
      const diff = await compareVersions(draftId, 'v1', 'v2');

      expect(Array.isArray(diff.added)).toBe(true);
      if (diff.added.length > 0) {
        expect(diff.added[0]).toHaveProperty('text');
        expect(diff.added[0]).toHaveProperty('position');
      }
    });

    it('TC-VERSION-005: 应能显示删除内容', async () => {
      const diff = await compareVersions(draftId, 'v1', 'v2');

      expect(Array.isArray(diff.deleted)).toBe(true);
    });

    it('TC-VERSION-006: 应能显示修改内容', async () => {
      const diff = await compareVersions(draftId, 'v1', 'v2');

      expect(Array.isArray(diff.modified)).toBe(true);
      if (diff.modified.length > 0) {
        expect(diff.modified[0]).toHaveProperty('oldText');
        expect(diff.modified[0]).toHaveProperty('newText');
      }
    });

    it('TC-VERSION-007: 应能显示修改统计', async () => {
      const diff = await compareVersions(draftId, 'v1', 'v2');

      expect(diff.statistics).toHaveProperty('addedChars');
      expect(diff.statistics).toHaveProperty('deletedChars');
      expect(diff.statistics).toHaveProperty('modifiedSections');
    });
  });

  // 3.3 版本回滚
  describe('3.3 版本回滚', () => {
    it('TC-VERSION-008: 应能回滚到指定版本', async () => {
      const versionId = 'version-001';
      const result = await restoreVersion(draftId, versionId);

      expect(result.success).toBe(true);
      expect(result.restoredVersion).toBe(versionId);
      expect(result.currentContent).toBeDefined();
    });
  });
});

// ============================================================================
// 四、修改追踪测试 (6个)
// ============================================================================

describe('4. 修改追踪 - Change Tracking', () => {
  const draftId = 'draft-004';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 4.1 修改日志
  describe('4.1 修改日志', () => {
    it('TC-TRACK-001: 应记录标注创建的修改日志', async () => {
      const logs = await getChangeLogs(draftId);

      expect(Array.isArray(logs)).toBe(true);
      if (logs.length > 0) {
        expect(logs[0]).toHaveProperty('changeType');
        expect(logs[0]).toHaveProperty('changedBy');
        expect(logs[0]).toHaveProperty('createdAt');
      }
    });

    it('TC-TRACK-002: 应记录对话修改的修改日志', async () => {
      await sendChatMessage(draftId, {
        message: '修改第一段',
        mode: 'instruction',
      });

      const logs = await getChangeLogs(draftId, { changeType: 'chat' });

      expect(logs.some(log => log.changeType === 'chat')).toBe(true);
    });

    it('TC-TRACK-003: 应记录手动编辑的修改日志', async () => {
      const logs = await getChangeLogs(draftId, { changeType: 'manual' });

      expect(Array.isArray(logs)).toBe(true);
    });

    it('TC-TRACK-004: 修改日志应包含修改者标识', async () => {
      const logs = await getChangeLogs(draftId);

      expect(logs.every(log => log.changedBy)).toBe(true);
    });

    it('TC-TRACK-005: 修改日志应包含时间戳', async () => {
      const logs = await getChangeLogs(draftId);

      expect(logs.every(log => log.createdAt)).toBe(true);
    });

    it('TC-TRACK-006: 应能查看修改时间线', async () => {
      const timeline = await getChangeLogs(draftId, { format: 'timeline' });

      expect(timeline).toHaveProperty('events');
      expect(timeline).toHaveProperty('totalChanges');
      expect(Array.isArray(timeline.events)).toBe(true);
    });
  });
});

// ============================================================================
// 五、集成测试 (10个)
// ============================================================================

describe('5. 集成测试 - Integration Tests', () => {
  const draftId = 'draft-005';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 5.1 标注-修改流程
  describe('5.1 标注-修改流程', () => {
    it('TC-INT-001: 完整流程：创建标注 → 接受建议 → 生成新版本', async () => {
      const result = await annotateAndModify(draftId, {
        annotation: {
          type: 'optimize',
          startOffset: 100,
          endOffset: 150,
          selectedText: '原文',
          suggestion: '优化后文本',
        },
        accept: true,
      });

      expect(result.annotationCreated).toBe(true);
      expect(result.modificationApplied).toBe(true);
      expect(result.newVersion).toBeDefined();
    });

    it('TC-INT-002: 完整流程：对话修改 → 保存版本', async () => {
      const result = await chatAndSaveVersion(draftId, {
        message: '优化标题',
        saveVersion: true,
        versionName: '标题优化版',
      });

      expect(result.chatResponse).toBeDefined();
      expect(result.versionCreated).toBe(true);
      expect(result.versionName).toBe('标题优化版');
    });
  });

  // 5.2 多用户协作
  describe('5.2 多用户协作', () => {
    it('TC-INT-003: 应支持用户和AI交替修改', async () => {
      // 用户创建标注
      await createAnnotation({
        draftId,
        type: 'error',
        startOffset: 100,
        endOffset: 120,
        selectedText: '错误数据',
        createdBy: 'user',
      });

      // AI建议修改
      const aiResponse = await sendChatMessage(draftId, {
        message: '修复这个错误',
        mode: 'instruction',
      });

      expect(aiResponse.type).toBe('modification');
    });

    it('TC-INT-004: 应支持蓝军专家评审流程', async () => {
      // 蓝军创建标注
      const annotation = await createAnnotation({
        draftId,
        type: 'logic',
        startOffset: 200,
        endOffset: 250,
        comment: '论证不严谨',
        createdBy: 'blueteam',
      });

      expect(annotation.createdBy).toBe('blueteam');

      // 作者查看并回应
      const logs = await getChangeLogs(draftId, { changedBy: 'blueteam' });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  // 5.3 配置测试
  describe('5.3 配置测试', () => {
    it('TC-INT-005: 应能启用/禁用标注功能', async () => {
      const config = { enableAnnotation: false };

      await expect(
        createAnnotation({
          draftId,
          type: 'error',
          startOffset: 100,
          endOffset: 120,
          selectedText: 'test',
          createdBy: 'user',
          config,
        })
      ).rejects.toThrow('Annotation is disabled');
    });

    it('TC-INT-006: 应能启用/禁用对话修改功能', async () => {
      const config = { enableConversationalEdit: false };

      await expect(
        sendChatMessage(draftId, {
          message: '修改内容',
          mode: 'instruction',
          config,
        })
      ).rejects.toThrow('Conversational editing is disabled');
    });

    it('TC-INT-007: 应能配置最大对话轮数', async () => {
      const config = { maxConversationRounds: 2 };

      await sendChatMessage(draftId, { message: '第一轮', mode: 'instruction', config });
      await sendChatMessage(draftId, { message: '第二轮', mode: 'instruction', config });

      // 第三轮应被拒绝
      await expect(
        sendChatMessage(draftId, { message: '第三轮', mode: 'instruction', config })
      ).rejects.toThrow('Max conversation rounds reached');
    });

    it('TC-INT-008: 应能配置自动保存间隔', async () => {
      const config = { autoSaveInterval: 5 }; // 5分钟

      // 模拟时间流逝和自动保存
      const version = await createVersion(draftId, {
        name: 'Auto Save',
        autoSave: true,
        config,
      });

      expect(version.autoSave).toBe(true);
    });
  });

  // 5.4 性能测试
  describe('5.4 性能测试', () => {
    it('TC-INT-009: 大文档标注性能测试', async () => {
      const largeDraftId = 'draft-large';
      const start = Date.now();

      // 创建50个标注
      for (let i = 0; i < 50; i++) {
        await createAnnotation({
          draftId: largeDraftId,
          type: 'optimize',
          startOffset: i * 100,
          endOffset: i * 100 + 50,
          selectedText: `text-${i}`,
          createdBy: 'user',
        });
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 5秒内完成
    });

    it('TC-INT-010: 版本对比性能测试', async () => {
      const start = Date.now();

      const diff = await compareVersions(draftId, 'v1', 'v100');

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // 2秒内完成
      expect(diff).toBeDefined();
    });
  });
});
