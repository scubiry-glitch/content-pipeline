// 创建任务弹窗 - 恢复原版 HTML 的详细功能
import { useState, useEffect, useCallback } from 'react';
import { assetsApi, type Asset } from '../api/client';
import './CreateTaskModal.css';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (task: CreateTaskData) => void;
}

export interface CreateTaskData {
  topic: string;
  contentType: 'newsletter' | 'research' | 'infographic' | 'video';
  priority: 'high' | 'medium' | 'low';
  context: string;
  outputFormats: {
    markdown: boolean;
    summary: boolean;
    infographic: boolean;
    ppt: boolean;
  };
}

const CONTENT_TYPES = [
  { value: 'newsletter', label: '居住金融科技周报', desc: '周期性资讯汇总' },
  { value: 'research', label: '深度研究报告', desc: '产业分析与策略建议' },
  { value: 'infographic', label: '信息图', desc: '数据可视化展示' },
  { value: 'video', label: '视频脚本', desc: '短视频/长视频脚本' },
] as const;

const PRIORITIES = [
  { value: 'high', label: '高', color: '#ef4444' },
  { value: 'medium', label: '中', color: '#f59e0b' },
  { value: 'low', label: '低', color: '#22c55e' },
] as const;

const OUTPUT_FORMATS = [
  {
    key: 'markdown' as const,
    label: '完整版 Markdown',
    desc: '约18000字深度长文',
  },
  {
    key: 'summary' as const,
    label: '执行摘要',
    desc: '约3000字精简版',
  },
  {
    key: 'infographic' as const,
    label: '信息图',
    desc: '可视化图表（HTML/SVG）',
  },
  {
    key: 'ppt' as const,
    label: 'PPT',
    desc: '演示文稿格式',
  },
];

export function CreateTaskModal({ isOpen, onClose, onCreate }: CreateTaskModalProps) {
  const [formData, setFormData] = useState<CreateTaskData>({
    topic: '',
    contentType: 'research',
    priority: 'medium',
    context: '',
    outputFormats: {
      markdown: true,
      summary: true,
      infographic: false,
      ppt: false,
    },
  });

  const [showCopilotHint, setShowCopilotHint] = useState(false);

  const handleSubmit = () => {
    if (!formData.topic.trim()) return;
    onCreate(formData);
    // Reset form
    setFormData({
      topic: '',
      contentType: 'research',
      priority: 'medium',
      context: '',
      outputFormats: {
        markdown: true,
        summary: true,
        infographic: false,
        ppt: false,
      },
    });
  };

  const handleFormatChange = (key: keyof CreateTaskData['outputFormats'], checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      outputFormats: { ...prev.outputFormats, [key]: checked },
    }));
  };

  const handleCopilotClick = () => {
    setShowCopilotHint(true);
    setTimeout(() => setShowCopilotHint(false), 3000);
  };

  if (!isOpen) return null;

  const isValid = formData.topic.trim().length > 0;
  const selectedFormatsCount = Object.values(formData.outputFormats).filter(Boolean).length;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal create-task-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">新建内容生产任务</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Copilot 快速配置提示 */}
          {showCopilotHint && (
            <div className="copilot-hint">
              <span className="copilot-icon">🤖</span>
              <span>Copilot 智能助手即将上线，支持自然语言配置任务</span>
            </div>
          )}

          {/* 研究主题 */}
          <div className="form-group">
            <label className="form-label">
              研究主题 <span className="required">*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              placeholder="例如：保租房REITs市场分析与投资策略"
            />
          </div>

          {/* 内容类型与优先级 */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">内容类型</label>
              <select
                className="form-select"
                value={formData.contentType}
                onChange={(e) =>
                  setFormData({ ...formData, contentType: e.target.value as CreateTaskData['contentType'] })
                }
              >
                {CONTENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <span className="form-hint">
                {CONTENT_TYPES.find((t) => t.value === formData.contentType)?.desc}
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">优先级</label>
              <div className="priority-selector">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    className={`priority-btn ${formData.priority === p.value ? 'active' : ''}`}
                    style={{
                      '--priority-color': p.color,
                    } as React.CSSProperties}
                    onClick={() => setFormData({ ...formData, priority: p.value as CreateTaskData['priority'] })}
                  >
                    <span
                      className="priority-dot"
                      style={{ background: p.color }}
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 背景资料 */}
          <div className="form-group">
            <label className="form-label">背景资料（可选）</label>
            <textarea
              className="form-textarea"
              value={formData.context}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              placeholder="输入相关背景信息、数据来源要求或特殊需求..."
              rows={3}
            />
          </div>

          {/* 输出格式 */}
          <div className="form-group">
            <label className="form-label">
              输出格式
              <span className="format-count">已选 {selectedFormatsCount} 项</span>
            </label>
            <div className="checkbox-group">
              {OUTPUT_FORMATS.map((format) => (
                <label key={format.key} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.outputFormats[format.key]}
                    onChange={(e) => handleFormatChange(format.key, e.target.checked)}
                  />
                  <div className="checkbox-content">
                    <div className="checkbox-label">{format.label}</div>
                    <div className="checkbox-desc">{format.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-copilot"
            onClick={handleCopilotClick}
            title="使用 Copilot 智能配置"
          >
            <span>🤖</span> Copilot
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            开始生产
          </button>
        </div>
      </div>
    </div>
  );
}
