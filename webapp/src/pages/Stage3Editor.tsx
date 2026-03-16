import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { stage3Api, type Annotation, type Version, type ChangeLog } from '../api/client';
import './Stage3Editor.css';

export function Stage3Editor() {
  const { id: draftId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'edit' | 'annotations' | 'versions' | 'history'>('edit');
  const [content, setContent] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotationForm, setAnnotationForm] = useState({
    type: 'comment',
    comment: '',
    suggestion: '',
  });
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (draftId) {
      loadData();
    }
  }, [draftId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [annotationsRes, versionsRes, logsRes] = await Promise.all([
        stage3Api.getAnnotations(draftId!),
        stage3Api.getVersions(draftId!),
        stage3Api.getChangeLogs(draftId!),
      ]);
      setAnnotations(annotationsRes.items || []);
      setVersions(versionsRes.items || []);
      setChangeLogs(logsRes.items || []);
      // Set content from latest version or default
      if (versionsRes.items && versionsRes.items.length > 0) {
        setContent(versionsRes.items[0].content);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSave = async () => {
    if (!draftId || !content.trim()) return;
    setSaving(true);
    try {
      await stage3Api.autoSave(draftId, content);
    } catch (error) {
      console.error('Auto save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTextSelection = () => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.substring(start, end);

    if (text.trim()) {
      setSelectedText(text);
      setSelectionRange({ start, end });
      setShowAnnotationForm(true);
    }
  };

  const handleCreateAnnotation = async () => {
    if (!draftId || !selectionRange || !selectedText) return;

    try {
      await stage3Api.createAnnotation({
        draftId,
        type: annotationForm.type,
        startOffset: selectionRange.start,
        endOffset: selectionRange.end,
        selectedText,
        comment: annotationForm.comment,
        suggestion: annotationForm.suggestion,
      });
      setShowAnnotationForm(false);
      setAnnotationForm({ type: 'comment', comment: '', suggestion: '' });
      setSelectedText('');
      setSelectionRange(null);
      // Reload annotations
      const res = await stage3Api.getAnnotations(draftId);
      setAnnotations(res.items || []);
    } catch (error) {
      console.error('Failed to create annotation:', error);
    }
  };

  const handleCreateVersion = async () => {
    if (!draftId || !content.trim()) return;

    const name = prompt('版本名称:');
    if (!name) return;

    try {
      await stage3Api.createVersion({
        draftId,
        name,
        content,
      });
      const res = await stage3Api.getVersions(draftId);
      setVersions(res.items || []);
    } catch (error) {
      console.error('Failed to create version:', error);
    }
  };

  const handleRestoreVersion = async (version: Version) => {
    if (!confirm(`确定要恢复到版本 "${version.name}" 吗?`)) return;
    setContent(version.content);
    await handleAutoSave();
  };

  const getAnnotationTypeText = (type: string) => {
    const map: Record<string, string> = {
      comment: '评论',
      suggestion: '建议',
      issue: '问题',
      praise: '赞赏',
    };
    return map[type] || type;
  };

  const getAnnotationTypeClass = (type: string) => {
    return `annotation-type-${type}`;
  };

  const getChangeTypeText = (type: string) => {
    const map: Record<string, string> = {
      edit: '编辑',
      rewrite: '重写',
      merge: '合并',
      split: '拆分',
      annotate: '标注',
    };
    return map[type] || type;
  };

  if (!draftId) {
    return <div className="stage3-editor">请选择一个文稿</div>;
  }

  return (
    <div className="stage3-editor">
      <div className="editor-header">
        <h1>📝 Stage 3 文稿编辑</h1>
        <div className="editor-actions">
          <span className={`save-status ${saving ? 'saving' : ''}`}>
            {saving ? '保存中...' : '已保存'}
          </span>
          <button className="btn btn-primary" onClick={handleAutoSave} disabled={saving}>
            保存
          </button>
          <button className="btn btn-secondary" onClick={handleCreateVersion}>
            创建版本
          </button>
        </div>
      </div>

      <div className="editor-tabs">
        <button className={`tab ${activeTab === 'edit' ? 'active' : ''}`} onClick={() => setActiveTab('edit')}>
          ✏️ 编辑
        </button>
        <button className={`tab ${activeTab === 'annotations' ? 'active' : ''}`} onClick={() => setActiveTab('annotations')}>
          💬 标注 ({annotations.length})
        </button>
        <button className={`tab ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>
          📚 版本 ({versions.length})
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📜 历史 ({changeLogs.length})
        </button>
      </div>

      <div className="editor-content">
        {activeTab === 'edit' && (
          <div className="edit-panel">
            <textarea
              ref={contentRef}
              className="content-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onMouseUp={handleTextSelection}
              onKeyUp={handleTextSelection}
              placeholder="开始撰写文稿..."
              rows={20}
            />
            <div className="editor-help">
              选中文字可添加标注 | 字数: {content.length}
            </div>
          </div>
        )}

        {activeTab === 'annotations' && (
          <div className="annotations-panel">
            {annotations.length === 0 ? (
              <div className="empty-state">暂无标注</div>
            ) : (
              <div className="annotations-list">
                {annotations.map((annotation) => (
                  <div key={annotation.id} className={`annotation-card ${getAnnotationTypeClass(annotation.type)}`}>
                    <div className="annotation-header">
                      <span className={`annotation-type ${getAnnotationTypeClass(annotation.type)}`}>
                        {getAnnotationTypeText(annotation.type)}
                      </span>
                      <span className="annotation-author">{annotation.createdBy}</span>
                      <span className="annotation-time">
                        {new Date(annotation.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="annotation-text">"{annotation.selectedText}"</div>
                    {annotation.comment && (
                      <div className="annotation-comment">{annotation.comment}</div>
                    )}
                    {annotation.suggestion && (
                      <div className="annotation-suggestion">
                        <span className="label">建议:</span> {annotation.suggestion}
                      </div>
                    )}
                    <div className="annotation-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          const newText = annotation.suggestion || annotation.selectedText;
                          if (newText && contentRef.current) {
                            const before = content.substring(0, annotation.startOffset);
                            const after = content.substring(annotation.endOffset);
                            setContent(before + newText + after);
                          }
                        }}
                      >
                        应用
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="versions-panel">
            {versions.length === 0 ? (
              <div className="empty-state">暂无版本</div>
            ) : (
              <div className="versions-list">
                {versions.map((version, index) => (
                  <div key={version.id} className="version-card">
                    <div className="version-header">
                      <span className="version-name">{version.name}</span>
                      {index === 0 && <span className="version-badge latest">最新</span>}
                      {version.autoSave && <span className="version-badge auto">自动保存</span>}
                    </div>
                    <div className="version-meta">
                      <span>{version.createdBy}</span>
                      <span>{new Date(version.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="version-actions">
                      <button className="btn btn-sm" onClick={() => handleRestoreVersion(version)}>
                        恢复此版本
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-panel">
            {changeLogs.length === 0 ? (
              <div className="empty-state">暂无修改历史</div>
            ) : (
              <div className="history-list">
                {changeLogs.map((log) => (
                  <div key={log.id} className="history-item">
                    <div className="history-icon">
                      {log.changeType === 'edit' ? '✏️' :
                       log.changeType === 'rewrite' ? '🔄' :
                       log.changeType === 'merge' ? '🔀' :
                       log.changeType === 'split' ? '✂️' : '📝'}
                    </div>
                    <div className="history-content">
                      <div className="history-header">
                        <span className="change-type">{getChangeTypeText(log.changeType)}</span>
                        <span className="change-author">{log.changedBy}</span>
                        <span className="change-time">
                          {new Date(log.changedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="history-summary">{log.changeSummary}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAnnotationForm && (
        <div className="annotation-modal-overlay" onClick={() => setShowAnnotationForm(false)}>
          <div className="annotation-modal" onClick={(e) => e.stopPropagation()}>
            <h3>添加标注</h3>
            <div className="selected-text-preview">"{selectedText}"</div>
            <div className="form-group">
              <label>类型</label>
              <select
                value={annotationForm.type}
                onChange={(e) => setAnnotationForm({ ...annotationForm, type: e.target.value })}
              >
                <option value="comment">评论</option>
                <option value="suggestion">建议</option>
                <option value="issue">问题</option>
                <option value="praise">赞赏</option>
              </select>
            </div>
            <div className="form-group">
              <label>评论</label>
              <textarea
                value={annotationForm.comment}
                onChange={(e) => setAnnotationForm({ ...annotationForm, comment: e.target.value })}
                placeholder="输入评论..."
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>修改建议</label>
              <textarea
                value={annotationForm.suggestion}
                onChange={(e) => setAnnotationForm({ ...annotationForm, suggestion: e.target.value })}
                placeholder="输入修改建议..."
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowAnnotationForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateAnnotation}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
