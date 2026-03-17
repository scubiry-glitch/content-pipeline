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
  sourceMaterials?: Array<{
    type: 'asset';
    asset_id: string;
    title: string;
  }>;
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
    sourceMaterials: [],
  });

  const [showCopilotHint, setShowCopilotHint] = useState(false);
  const [recommendedAssets, setRecommendedAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isSearchingAssets, setIsSearchingAssets] = useState(false);

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

  // 根据主题搜索相关素材
  const searchRelatedAssets = useCallback(async (topic: string) => {
    if (!topic || topic.length < 2) {
      setRecommendedAssets([]);
      return;
    }

    setIsSearchingAssets(true);
    try {
      // 提取关键词进行搜索
      const keywords = topic.split(/[\s,，。]+/).filter(k => k.length >= 2);
      const allAssets: Asset[] = [];

      for (const keyword of keywords.slice(0, 3)) {
        try {
          const results = await assetsApi.search(keyword);
          allAssets.push(...results);
        } catch (e) {
          // 忽略单个搜索失败
        }
      }

      // 去重并排序（按质量分）
      const uniqueAssets = Array.from(new Map(allAssets.map(a => [a.id, a])).values());
      const sortedAssets = uniqueAssets.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

      setRecommendedAssets(sortedAssets.slice(0, 5));
    } catch (error) {
      console.error('搜索素材失败:', error);
    } finally {
      setIsSearchingAssets(false);
    }
  }, []);

  // 监听主题变化，自动搜索素材
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.topic) {
        searchRelatedAssets(formData.topic);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.topic, searchRelatedAssets]);

  // 切换素材选择
  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  // 添加选中的素材到表单
  const addSelectedAssets = () => {
    const selectedAssetList = recommendedAssets.filter(a => selectedAssets.has(a.id));
    const newMaterials = selectedAssetList.map(asset => ({
      type: 'asset' as const,
      asset_id: asset.id,
      title: asset.title,
    }));

    setFormData(prev => ({
      ...prev,
      sourceMaterials: [...(prev.sourceMaterials || []), ...newMaterials],
    }));

    // 清空选择
    setSelectedAssets(new Set());
  };

  const handleSubmit = () => {
    if (!formData.topic.trim()) return;

    // 确保选中的素材已添加到 sourceMaterials
    const selectedAssetList = recommendedAssets.filter(a => selectedAssets.has(a.id));
    const newMaterials = selectedAssetList.map(asset => ({
      type: 'asset' as const,
      asset_id: asset.id,
      title: asset.title,
    }));

    const finalData = {
      ...formData,
      sourceMaterials: [...(formData.sourceMaterials || []), ...newMaterials],
    };

    onCreate(finalData);

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
      sourceMaterials: [],
    });
    setSelectedAssets(new Set());
    setRecommendedAssets([]);
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

          {/* 相关素材推荐 */}
          {formData.topic && (
            <div className="form-group asset-recommendations">
              <label className="form-label">
                相关素材推荐
                {isSearchingAssets && <span className="searching-indicator">🔍 搜索中...</span>}
              </label>

              {recommendedAssets.length > 0 ? (
                <div className="recommended-assets-list">
                  {recommendedAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`recommended-asset-item ${selectedAssets.has(asset.id) ? 'selected' : ''}`}
                      onClick={() => toggleAssetSelection(asset.id)}
                    >
                      <div className="asset-select-indicator">
                        {selectedAssets.has(asset.id) ? '☑️' : '⭕'}
                      </div>
                      <div className="asset-info">
                        <div className="asset-title">{asset.title}</div>
                        <div className="asset-meta">
                          <span className="asset-type">{asset.content_type?.toUpperCase()}</span>
                          {asset.quality_score && (
                            <span className="asset-quality" style={{ color: asset.quality_score >= 80 ? '#52c41a' : '#faad14' }}>
                              质量分: {asset.quality_score}
                            </span>
                          )}
                          {asset.tags?.length > 0 && (
                            <span className="asset-tags">{asset.tags.slice(0, 2).join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {selectedAssets.size > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary add-assets-btn"
                      onClick={addSelectedAssets}
                    >
                      ➕ 添加选中的素材 ({selectedAssets.size})
                    </button>
                  )}
                </div>
              ) : (
                !isSearchingAssets && (
                  <div className="no-assets-hint">
                    <span>💡</span> 输入主题后自动搜索相关素材
                  </div>
                )
              )}

              {/* 已添加的素材 */}
              {formData.sourceMaterials && formData.sourceMaterials.length > 0 && (
                <div className="selected-assets-section">
                  <label className="subsection-label">已添加素材</label>
                  <div className="selected-assets-list">
                    {formData.sourceMaterials.map((material, index) => (
                      <div key={index} className="selected-asset-tag">
                        📎 {material.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
