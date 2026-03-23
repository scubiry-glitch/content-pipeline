// ReviewConfigPanel - 评审配置面板
// 支持配置评审模式、专家选择、修订策略等

import { useState, useEffect } from 'react';
import { expertsApi } from '../api/client';
import type { ReviewConfig, Expert } from '../types';

interface ReviewConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: ReviewConfig) => void;
}

// 默认配置
const DEFAULT_CONFIG: ReviewConfig = {
  mode: 'serial',  // 串行模式
  aiExperts: [
    { role: 'challenger', enabled: true },
    { role: 'expander', enabled: true },
    { role: 'synthesizer', enabled: true },
  ],
  humanExperts: [],
  autoRevise: 'final',  // Final Revision Only
  maxRounds: 1,  // 1 Round
  readerTest: {
    enabled: false,
    selectedReaders: [],
  },
};

// AI 专家选项
const AI_EXPERT_OPTIONS = [
  { role: 'challenger' as const, name: '批判者', icon: '🔍', desc: '挑战逻辑漏洞与数据可靠性' },
  { role: 'expander' as const, name: '拓展者', icon: '⚖️', desc: '扩展关联因素与国际对比' },
  { role: 'synthesizer' as const, name: '提炼者', icon: '👔', desc: '归纳核心论点与结构优化' },
  { role: 'fact_checker' as const, name: '事实核查员', icon: '✓', desc: '专注数据准确性与来源验证' },
];

// 10种典型读者画像（模拟数据，实际应从API获取）
const MOCK_READER_PERSONAS: Expert[] = [
  { id: 'reader_01', name: '快速浏览者', title: '上班族白领', domain: '通用阅读', status: 'active', angle: 'reader', bio: '每天通勤时间阅读，注意力有限，需要快速获取信息' },
  { id: 'reader_02', name: '深度思考者', title: '研究者', domain: '学术研究', status: 'active', angle: 'reader', bio: '注重内容的准确性和深度，愿意花时间仔细阅读' },
  { id: 'reader_03', name: '行业新人', title: '应届毕业生', domain: '职场入门', status: 'active', angle: 'reader', bio: '行业知识有限，需要更多背景信息和解释' },
  { id: 'reader_04', name: '实战派管理者', title: '中层管理者', domain: '管理实践', status: 'active', angle: 'reader', bio: '关注内容的实用性，希望获得可落地的建议' },
  { id: 'reader_05', name: '资深从业者', title: '行业老兵', domain: '行业深度', status: 'active', angle: 'reader', bio: '行业经验丰富，对内容质量要求高，追求独到见解' },
  { id: 'reader_06', name: '投资决策人', title: '投资人', domain: '投资分析', status: 'active', angle: 'reader', bio: '以投资视角阅读，关注风险和回报，重视数据支撑' },
  { id: 'reader_07', name: '跨界学习者', title: '多领域关注者', domain: '跨界创新', status: 'active', angle: 'reader', bio: '喜欢跨领域学习，需要通俗易懂的解释' },
  { id: 'reader_08', name: '数据敏感者', title: '数据分析师', domain: '数据科学', status: 'active', angle: 'reader', bio: '数据敏感，重视统计和证据，喜欢可视化呈现' },
  { id: 'reader_09', name: '批判质疑者', title: '审慎观察者', domain: '批判思维', status: 'active', angle: 'reader', bio: '持怀疑态度，喜欢寻找漏洞，欣赏平衡的观点' },
  { id: 'reader_10', name: '故事爱好者', title: '叙事偏好读者', domain: '人文故事', status: 'active', angle: 'reader', bio: '通过故事理解世界，喜欢有人情味的内容' },
];

export function ReviewConfigPanel({ isOpen, onClose, onConfirm }: ReviewConfigPanelProps) {
  const [config, setConfig] = useState<ReviewConfig>(DEFAULT_CONFIG);
  const [libraryExperts, setLibraryExperts] = useState<Expert[]>([]);
  const [readerExperts, setReaderExperts] = useState<Expert[]>([]);
  const [loadingExperts, setLoadingExperts] = useState(false);
  const [loadingReaders, setLoadingReaders] = useState(false);

  // 从专家库加载专家列表
  useEffect(() => {
    if (isOpen) {
      loadLibraryExperts();
      loadReaderExperts();
    }
  }, [isOpen]);

  const loadLibraryExperts = async () => {
    setLoadingExperts(true);
    try {
      const result = await expertsApi.getAll();
      // 只显示活跃的专家，排除读者角色
      const activeExperts = result.items.filter(e => 
        e.status === 'active' && e.angle !== 'reader'
      );
      setLibraryExperts(activeExperts);
    } catch (error) {
      console.error('Failed to load experts:', error);
    } finally {
      setLoadingExperts(false);
    }
  };

  // 加载读者专家（reader_rep 角色）
  const loadReaderExperts = async () => {
    setLoadingReaders(true);
    try {
      const result = await expertsApi.getAll({ angle: 'reader' });
      // 如果没有专门的读者专家，使用模拟的读者画像
      if (result.items.length === 0) {
        setReaderExperts(MOCK_READER_PERSONAS);
      } else {
        setReaderExperts(result.items);
      }
    } catch (error) {
      console.error('Failed to load reader experts:', error);
      setReaderExperts(MOCK_READER_PERSONAS);
    } finally {
      setLoadingReaders(false);
    }
  };

  // 切换专家库专家选择
  const handleLibraryExpertToggle = (expertId: string, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      humanExperts: checked
        ? [...(prev.humanExperts || []), expertId]
        : (prev.humanExperts || []).filter(id => id !== expertId)
    }));
  };

  // 切换读者专家选择
  const handleReaderToggle = (readerId: string, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      readerTest: {
        enabled: true,
        selectedReaders: checked
          ? [...(prev.readerTest?.selectedReaders || []), readerId]
          : (prev.readerTest?.selectedReaders || []).filter(id => id !== readerId)
      }
    }));
  };

  if (!isOpen) return null;

  const handleModeChange = (mode: 'parallel' | 'serial') => {
    setConfig(prev => ({ ...prev, mode }));
  };

  const handleExpertToggle = (role: string, enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      aiExperts: prev.aiExperts.map(e => 
        e.role === role ? { ...e, enabled } : e
      ),
    }));
  };

  const handleReviseChange = (autoRevise: 'per-round' | 'final') => {
    setConfig(prev => ({ ...prev, autoRevise }));
  };

  const handleMaxRoundsChange = (maxRounds: number) => {
    setConfig(prev => ({ ...prev, maxRounds }));
  };

  const enabledCount = config.aiExperts.filter(e => e.enabled).length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">settings</span>
            </div>
            <div>
              <h3 className="text-lg font-bold font-headline text-slate-800 dark:text-slate-200">
                Review Configuration
              </h3>
              <p className="text-xs text-slate-500">Customize the Blue Team review process</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Section 1: Review Mode */}
          <section>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">route</span>
              Review Mode
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleModeChange('parallel')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  config.mode === 'parallel'
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary">sync_alt</span>
                  <span className="font-semibold text-sm">Parallel</span>
                </div>
                <p className="text-xs text-slate-500">All experts review simultaneously, then revise once</p>
              </button>
              <button
                onClick={() => handleModeChange('serial')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  config.mode === 'serial'
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-tertiary">arrow_forward</span>
                  <span className="font-semibold text-sm">Serial</span>
                </div>
                <p className="text-xs text-slate-500">Experts review sequentially with revision between each</p>
              </button>
            </div>
          </section>

          {/* Section 2: AI Experts */}
          <section>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">smart_toy</span>
              AI Experts ({enabledCount} selected)
            </h4>
            <div className="space-y-2">
              {AI_EXPERT_OPTIONS.map(expert => {
                const isEnabled = config.aiExperts.find(e => e.role === expert.role)?.enabled ?? false;
                return (
                  <label 
                    key={expert.role}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isEnabled
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-slate-200 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => handleExpertToggle(expert.role, e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-lg">{expert.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{expert.name}</div>
                      <div className="text-xs text-slate-500">{expert.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Section 3: Expert Library */}
          <section>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">group</span>
              Expert Library ({config.humanExperts?.length || 0} selected)
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {loadingExperts ? (
                <div className="flex items-center justify-center py-4">
                  <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                </div>
              ) : libraryExperts.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-2">No experts available in library</p>
              ) : (
                libraryExperts.map(expert => {
                  const isSelected = config.humanExperts?.includes(expert.id) ?? false;
                  return (
                    <label 
                      key={expert.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleLibraryExpertToggle(expert.id, e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm">
                        {expert.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{expert.name}</div>
                        <div className="text-xs text-slate-500">{expert.title} · {expert.domain}</div>
                      </div>
                      {expert.angle && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          expert.angle === 'challenger' ? 'bg-red-100 text-red-700' :
                          expert.angle === 'expander' ? 'bg-green-100 text-green-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {expert.angle}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </section>

          {/* Section 4: Reader Test */}
          <section>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">visibility</span>
              读者测试 (Reader Test)
            </h4>
            <div className="space-y-3">
              {/* 启用开关 */}
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                config.readerTest?.enabled
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-slate-200 dark:border-slate-700'
              }`}>
                <input
                  type="checkbox"
                  checked={config.readerTest?.enabled ?? false}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    readerTest: {
                      ...prev.readerTest,
                      enabled: e.target.checked,
                      count: prev.readerTest?.count ?? 3,
                    }
                  }))}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm text-slate-800 dark:text-slate-200">启用读者测试</div>
                  <div className="text-xs text-slate-500">模拟多名读者对文稿进行可读性测试</div>
                </div>
              </label>

              {/* 读者画像选择 */}
              {config.readerTest?.enabled && (
                <div className="pl-4 border-l-2 border-primary/20">
                  <div className="text-xs text-slate-500 mb-2">
                    选择测试读者 ({config.readerTest?.selectedReaders?.length || 0}/10)
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {loadingReaders ? (
                      <div className="flex items-center justify-center py-4">
                        <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                      </div>
                    ) : readerExperts.length === 0 ? (
                      <p className="text-xs text-slate-500 italic text-center py-2">暂无读者画像</p>
                    ) : (
                      readerExperts.map(reader => {
                        const isSelected = config.readerTest?.selectedReaders?.includes(reader.id) ?? false;
                        return (
                          <label 
                            key={reader.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleReaderToggle(reader.id, e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-sm text-white">
                              {reader.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{reader.name}</div>
                              <div className="text-xs text-slate-500">{reader.title} · {reader.domain}</div>
                              {reader.bio && (
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{reader.bio}</div>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 5: Max Rounds */}
          <section>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">repeat</span>
              Max Rounds
            </h4>
            <div className="flex gap-2">
              {[1, 2, 3].map(rounds => (
                <button
                  key={rounds}
                  onClick={() => handleMaxRoundsChange(rounds)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    config.maxRounds === rounds
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {rounds} Round{rounds > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </section>

          {/* Section 4: Revision Strategy */}
          <section>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">edit_note</span>
              Revision Strategy
            </h4>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                config.autoRevise === 'per-round'
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-slate-200 dark:border-slate-700'
              }`}>
                <input
                  type="radio"
                  name="revise"
                  checked={config.autoRevise === 'per-round'}
                  onChange={() => handleReviseChange('per-round')}
                  className="w-4 h-4 text-primary"
                />
                <div>
                  <div className="font-medium text-sm">Per-Round Revision</div>
                  <div className="text-xs text-slate-500">AI revises draft after each expert (serial mode recommended)</div>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                config.autoRevise === 'final'
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-slate-200 dark:border-slate-700'
                }`}>
                <input
                  type="radio"
                  name="revise"
                  checked={config.autoRevise === 'final'}
                  onChange={() => handleReviseChange('final')}
                  className="w-4 h-4 text-primary"
                />
                <div>
                  <div className="font-medium text-sm">Final Revision Only</div>
                  <div className="text-xs text-slate-500">Collect all feedback, revise once at the end</div>
                </div>
              </label>
            </div>
          </section>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-blue-500 text-sm">info</span>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Serial mode</strong> with <strong>per-round revision</strong> creates a revision chain 
                where each expert reviews the output of the previous one, potentially improving quality 
                but taking longer.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(config)}
            disabled={enabledCount === 0}
            className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Start Review with Config
          </button>
        </div>
      </div>
    </div>
  );
}
