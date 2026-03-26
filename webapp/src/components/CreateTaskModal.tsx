// 创建任务弹窗 - 恢复原版 HTML 的详细功能
import { useState, useEffect, useCallback } from 'react';
import { assetsApi, type Asset } from '../api/client';
import { matchExperts, getAllExperts, getExpertWorkload } from '../services/expertService';
import type { Expert, ExpertAssignment } from '../types';
import './CreateTaskModal.css';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (task: CreateTaskData) => void;
  isCreating?: boolean;
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

export function CreateTaskModal({ isOpen, onClose, onCreate, isCreating = false }: CreateTaskModalProps) {
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

  // 专家推荐相关状态
  const [suggestedExperts, setSuggestedExperts] = useState<Expert[]>([]);
  const [expertMatchResult, setExpertMatchResult] = useState<ExpertAssignment | null>(null);
  const [isMatchingExperts, setIsMatchingExperts] = useState(false);
  const [expertWorkloads, setExpertWorkloads] = useState<Record<string, { pendingReviews: number; availability: 'available' | 'busy' | 'unavailable' }>>({});

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
          allAssets.push(...results.items);
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

  // 监听主题变化，自动搜索素材和匹配专家
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.topic) {
        searchRelatedAssets(formData.topic);
        matchExpertsForTopic(formData.topic);
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

  // 根据主题匹配专家
  const matchExpertsForTopic = useCallback(async (topic: string) => {
    if (!topic || topic.length < 3) {
      setSuggestedExperts([]);
      setExpertMatchResult(null);
      return;
    }

    setIsMatchingExperts(true);
    try {
      // 根据优先级判断重要性
      const importance = formData.priority === 'high' ? 0.9 : formData.priority === 'medium' ? 0.7 : 0.5;

      const result = matchExperts({
        topic,
        importance,
      });

      setExpertMatchResult(result);

      // 合并所有专家用于展示
      const allExperts: Expert[] = [...result.domainExperts];
      if (result.seniorExpert) {
        allExperts.unshift(result.seniorExpert);
      }
      setSuggestedExperts(allExperts);

      // 获取专家工作量信息
      const workloads: Record<string, { pendingReviews: number; availability: 'available' | 'busy' | 'unavailable' }> = {};
      allExperts.forEach(expert => {
        const workload = getExpertWorkload(expert.id);
        workloads[expert.id] = {
          pendingReviews: workload.pendingReviews,
          availability: workload.availability,
        };
      });
      setExpertWorkloads(workloads);
    } catch (error) {
      console.error('匹配专家失败:', error);
    } finally {
      setIsMatchingExperts(false);
    }
  }, [formData.priority]);

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

          {/* 专家推荐 */}
          {formData.topic && formData.topic.length >= 3 && (
            <div className="form-group expert-recommendations">
              <label className="form-label">
                <span className="label-icon">🎯</span> 智能匹配专家
                {isMatchingExperts && <span className="searching-indicator">匹配中...</span>}
              </label>

              {expertMatchResult && expertMatchResult.matchReasons.length > 0 && (
                <div className="match-reasons">
                  {expertMatchResult.matchReasons.map((reason, idx) => (
                    <span key={idx} className="match-reason-tag">{reason}</span>
                  ))}
                </div>
              )}

              {suggestedExperts.length > 0 ? (
                <div className="suggested-experts-list">
                  {suggestedExperts
                    .sort((a, b) => (a.level === 'senior' ? -1 : b.level === 'senior' ? 1 : 0))
                    .map((expert) => (
                    <div key={expert.id} className={`suggested-expert-item ${expert.level}`}>
                      <div
                        className="expert-avatar"
                        style={{
                          background: expert.level === 'senior'
                            ? 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
                            : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        }}
                      >
                        {expert.name.charAt(0)}
                      </div>
                      <div className="expert-info">
                        <div className="expert-header">
                          <span className="expert-name">{expert.name}</span>
                          <span className={`expert-level ${expert.level}`}>
                            {expert.level === 'senior' ? '特级专家' : '领域专家'}
                          </span>
                        </div>
                        <div className="expert-title">{expert.profile.title}</div>
                        <div className="expert-domain">{expert.domainName}</div>
                        <div className="expert-philosophy-preview">
                          {expert.philosophy.core.slice(0, 2).join(' · ')}
                        </div>
                      </div>
                      <div className="expert-stats">
                        <div className="stat">
                          <span className="stat-value">{(expert.acceptanceRate * 100).toFixed(0)}%</span>
                          <span className="stat-label">采纳率</span>
                        </div>
                        {expertWorkloads[expert.id] && (
                          <div className={`stat workload-stat ${expertWorkloads[expert.id].availability}`}>
                            <span className="stat-value">
                              {expertWorkloads[expert.id].availability === 'available'
                                ? '空闲'
                                : expertWorkloads[expert.id].availability === 'busy'
                                  ? '忙碌'
                                  : '满载'}
                            </span>
                            <span className="stat-label">
                              待评审: {expertWorkloads[expert.id].pendingReviews}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !isMatchingExperts && (
                  <div className="no-experts-hint">
                    <span>💡</span> 输入主题后将自动匹配相关领域专家
                  </div>
                )
              )}

              {expertMatchResult?.seniorExpert && (
                <div className="senior-expert-notice">
                  <span className="notice-icon">⭐</span>
                  <span className="notice-text">
                    检测到高优先级任务，已启用特级专家 <strong>{expertMatchResult.seniorExpert.name}</strong> 参与评审
                  </span>
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
            disabled={!isValid || isCreating}
          >
            {isCreating ? (
              <>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '16px', verticalAlign: 'middle' }}>refresh</span>
                创建中...
              </>
            ) : (
              '开始生产'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
