// 终稿编辑服务 - Final Draft Editor Service
// FR-024 ~ FR-025: 富文本编辑与修改痕迹

import { query } from '../db/connection.js';

export interface DraftEdit {
  id: string;
  taskId: string;
  originalContent: string;
  editedContent: string;
  changes: TextChange[];
  editedAt: string;
  editedBy?: string;
}

export interface TextChange {
  type: 'add' | 'delete' | 'modify';
  position: number;
  oldText?: string;
  newText?: string;
  paragraphIndex?: number;
}

export interface EditDiff {
  paragraphIndex: number;
  original: string;
  edited: string;
  changes: {
    type: 'added' | 'removed' | 'unchanged';
    text: string;
  }[];
}

/**
 * 获取最终稿件内容
 */
export async function getFinalDraft(taskId: string): Promise<{
  content: string;
  version: number;
  createdAt: string;
} | null> {
  // 获取最新的稿件版本
  const result = await query(
    `SELECT content, version, created_at
     FROM draft_versions
     WHERE task_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [taskId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    content: result.rows[0].content,
    version: result.rows[0].version,
    createdAt: result.rows[0].created_at,
  };
}

/**
 * 保存编辑后的终稿
 */
export async function saveEditedDraft(
  taskId: string,
  editedContent: string,
  editedBy?: string
): Promise<{ success: boolean; editId: string }> {
  // 获取原始内容
  const original = await getFinalDraft(taskId);
  if (!original) {
    throw new Error('No draft found to edit');
  }

  // 计算变更
  const changes = calculateChanges(original.content, editedContent);

  // 保存编辑记录
  const { v4: uuidv4 } = await import('uuid');
  const editId = uuidv4();

  await query(
    `INSERT INTO draft_edits (
      id, task_id, original_content, edited_content,
      changes, edited_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      editId,
      taskId,
      original.content,
      editedContent,
      JSON.stringify(changes),
      editedBy || 'user',
    ]
  );

  // 更新任务的最终内容
  await query(
    `UPDATE tasks SET
      final_draft = $1,
      final_draft_edited = true,
      final_draft_edit_id = $2,
      updated_at = NOW()
    WHERE id = $3`,
    [editedContent, editId, taskId]
  );

  return { success: true, editId };
}

/**
 * 获取修改痕迹对比
 */
export async function getEditDiff(taskId: string): Promise<EditDiff[]> {
  // 获取最新编辑记录
  const result = await query(
    `SELECT original_content, edited_content
     FROM draft_edits
     WHERE task_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [taskId]
  );

  if (result.rows.length === 0) {
    // 没有编辑记录，返回空对比
    const draft = await getFinalDraft(taskId);
    if (!draft) return [];

    return draft.content.split('\n\n').map((para, idx) => ({
      paragraphIndex: idx,
      original: para,
      edited: para,
      changes: [{ type: 'unchanged' as const, text: para }],
    }));
  }

  const { original_content, edited_content } = result.rows[0];

  return generateParagraphDiff(original_content, edited_content);
}

/**
 * 计算文本变更（简单实现）
 */
function calculateChanges(original: string, edited: string): TextChange[] {
  const changes: TextChange[] = [];

  const originalParas = original.split('\n\n');
  const editedParas = edited.split('\n\n');

  const maxLen = Math.max(originalParas.length, editedParas.length);

  for (let i = 0; i < maxLen; i++) {
    const orig = originalParas[i];
    const edit = editedParas[i];

    if (orig === undefined && edit !== undefined) {
      // 新增段落
      changes.push({
        type: 'add',
        position: i,
        newText: edit,
        paragraphIndex: i,
      });
    } else if (orig !== undefined && edit === undefined) {
      // 删除段落
      changes.push({
        type: 'delete',
        position: i,
        oldText: orig,
        paragraphIndex: i,
      });
    } else if (orig !== edit) {
      // 修改段落
      changes.push({
        type: 'modify',
        position: i,
        oldText: orig,
        newText: edit,
        paragraphIndex: i,
      });
    }
  }

  return changes;
}

/**
 * 生成段落级对比
 */
function generateParagraphDiff(original: string, edited: string): EditDiff[] {
  const originalParas = original.split('\n\n').filter(p => p.trim());
  const editedParas = edited.split('\n\n').filter(p => p.trim());

  const diffs: EditDiff[] = [];
  const maxLen = Math.max(originalParas.length, editedParas.length);

  for (let i = 0; i < maxLen; i++) {
    const orig = originalParas[i] || '';
    const edit = editedParas[i] || '';

    diffs.push({
      paragraphIndex: i,
      original: orig,
      edited: edit,
      changes: computeInlineDiff(orig, edit),
    });
  }

  return diffs;
}

/**
 * 计算行内差异（简化版）
 */
function computeInlineDiff(
  original: string,
  edited: string
): { type: 'added' | 'removed' | 'unchanged'; text: string }[] {
  if (original === edited) {
    return [{ type: 'unchanged', text: original }];
  }

  // 简化实现：如果相似度较高，显示修改；否则显示删除+新增
  const similarity = calculateSimilarity(original, edited);

  if (similarity > 0.5) {
    // 显示为修改
    return [
      { type: 'removed', text: original },
      { type: 'added', text: edited },
    ];
  } else {
    // 显示为替换
    return [
      { type: 'removed', text: original },
      { type: 'added', text: edited },
    ];
  }
}

/**
 * 计算字符串相似度（简化版）
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  const longerLength = longer.length;
  if (longerLength === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return (longerLength - distance) / longerLength;
}

/**
 * 编辑距离
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 获取编辑历史
 */
export async function getEditHistory(taskId: string): Promise<
  {
    id: string;
    editedAt: string;
    editedBy: string;
    changeCount: number;
  }[]
> {
  const result = await query(
    `SELECT id, edited_by, created_at,
            jsonb_array_length(changes) as change_count
     FROM draft_edits
     WHERE task_id = $1
     ORDER BY created_at DESC`,
    [taskId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    editedAt: row.created_at,
    editedBy: row.edited_by,
    changeCount: parseInt(row.change_count) || 0,
  }));
}
