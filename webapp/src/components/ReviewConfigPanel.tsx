// ReviewConfigPanel - 评审配置面板
// 支持配置评审模式、专家选择、修订策略等

import { useState, useEffect } from 'react';
import { expertsApi } from '../api/client';
import { getAllExperts, matchExperts } from '../services/expertService';
import type { ReviewConfig, Expert } from '../types';

export interface ReviewConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: ReviewConfig) => void;
  /** 仅保存配置（不启动评审） */
  onSave?: (config: ReviewConfig) => Promise<void> | void;
  /** 任务主题，用于自动推荐专家 */
  topic?: string;
  /** 已持久化的评审配置，用于回显上次选择 */
  savedConfig?: any;
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
  { role: 'logic_checker' as const, name: '逻辑检察官', icon: '🧩', desc: '论证严密性与逻辑链完整性' },
  { role: 'domain_expert' as const, name: '行业专家', icon: '🏢', desc: '专业深度与行业趋势洞察' },
  { role: 'reader_rep' as const, name: '读者代表', icon: '👤', desc: '可读性与受众适配度评估' },
];

// 10种典型读者画像（模拟数据，实际应从API获取）
const MOCK_READER_PERSONAS: Expert[] = [
  { id: 'reader_01', name: '快速浏览者', code: 'reader_01', title: '上班族白领', domain: '通用阅读', domainCode: 'general', domainName: '通用阅读', status: 'active', angle: 'reader', bio: '每天通勤时间阅读，注意力有限，需要快速获取信息', level: 'domain', profile: { title: '上班族白领', background: '通用阅读', personality: '快速浏览' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_02', name: '深度思考者', code: 'reader_02', title: '研究者', domain: '学术研究', domainCode: 'academic', domainName: '学术研究', status: 'active', angle: 'reader', bio: '注重内容的准确性和深度，愿意花时间仔细阅读', level: 'senior', profile: { title: '研究者', background: '学术研究', personality: '深度思考' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_03', name: '行业新人', code: 'reader_03', title: '应届毕业生', domain: '职场入门', domainCode: 'career', domainName: '职场入门', status: 'active', angle: 'reader', bio: '行业知识有限，需要更多背景信息和解释', level: 'domain', profile: { title: '应届毕业生', background: '职场入门', personality: '学习导向' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_04', name: '实战派管理者', code: 'reader_04', title: '中层管理者', domain: '管理实践', domainCode: 'management', domainName: '管理实践', status: 'active', angle: 'reader', bio: '关注内容的实用性，希望获得可落地的建议', level: 'senior', profile: { title: '中层管理者', background: '管理实践', personality: '实用导向' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_05', name: '资深从业者', code: 'reader_05', title: '行业老兵', domain: '行业深度', domainCode: 'industry', domainName: '行业深度', status: 'active', angle: 'reader', bio: '行业经验丰富，对内容质量要求高，追求独到见解', level: 'senior', profile: { title: '行业老兵', background: '行业深度', personality: '经验丰富' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_06', name: '投资决策人', code: 'reader_06', title: '投资人', domain: '投资分析', domainCode: 'investment', domainName: '投资分析', status: 'active', angle: 'reader', bio: '以投资视角阅读，关注风险和回报，重视数据支撑', level: 'senior', profile: { title: '投资人', background: '投资分析', personality: '决策导向' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_07', name: '跨界学习者', code: 'reader_07', title: '多领域关注者', domain: '跨界创新', domainCode: 'crossover', domainName: '跨界创新', status: 'active', angle: 'reader', bio: '喜欢跨领域学习，需要通俗易懂的解释', level: 'domain', profile: { title: '多领域关注者', background: '跨界创新', personality: '好奇探索' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_08', name: '数据敏感者', code: 'reader_08', title: '数据分析师', domain: '数据科学', domainCode: 'data', domainName: '数据科学', status: 'active', angle: 'reader', bio: '数据敏感，重视统计和证据，喜欢可视化呈现', level: 'senior', profile: { title: '数据分析师', background: '数据科学', personality: '数据驱动' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_09', name: '批判质疑者', code: 'reader_09', title: '审慎观察者', domain: '批判思维', domainCode: 'critical', domainName: '批判思维', status: 'active', angle: 'reader', bio: '持怀疑态度，喜欢寻找漏洞，欣赏平衡的观点', level: 'senior', profile: { title: '审慎观察者', background: '批判思维', personality: '批判思考' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
  { id: 'reader_10', name: '故事爱好者', code: 'reader_10', title: '叙事偏好读者', domain: '人文故事', domainCode: 'humanities', domainName: '人文故事', status: 'active', angle: 'reader', bio: '通过故事理解世界，喜欢有人情味的内容', level: 'domain', profile: { title: '叙事偏好读者', background: '人文故事', personality: '感性理解' }, philosophy: { core: [], quotes: [] }, achievements: [], reviewDimensions: [], totalReviews: 0, acceptanceRate: 0, avgResponseTime: 0 },
];

/**
 * 根据任务主题/领域自动推荐 AI 专家组合
 * 规则：
 *  - 默认总是包含 challenger + synthesizer（基础组合）
 *  - 涉及数据/统计/房产/金融 → 加 fact_checker
 *  - 涉及投资/市场/策略 → 加 domain_expert
 *  - 涉及科技/学术/研究 → 加 logic_checker
 *  - 面向大众/科普 → 加 reader_rep
 *  - 其他 → 加 expander
 */
function getRecommendedAIExperts(topic?: string): string[] {
  const base = ['challenger', 'synthesizer'];
  if (!topic) return [...base, 'expander']; // 无主题时用默认三件套

  const t = topic.toLowerCase();

  // 数据密集型领域
  if (/数据|统计|房[产地]|金融|经济|财务|投资回报|收益|利率|价格|市场.*数[据字]/.test(t)) {
    base.push('fact_checker');
  }
  // 行业深度领域
  if (/投资|市场|战略|策略|产业|行业|商业|竞争|机会|趋势/.test(t)) {
    base.push('domain_expert');
  }
  // 逻辑严谨型领域
  if (/科技|技术|学术|研究|分析|论证|政策|法规|合规/.test(t)) {
    base.push('logic_checker');
  }
  // 面向大众/可读性
  if (/科普|入门|指南|教程|生活|消费|健康|文化|旅[行游]/.test(t)) {
    base.push('reader_rep');
  }

  // 如果没有命中任何特殊领域，补充 expander
  if (base.length === 2) {
    base.push('expander');
  }

  return [...new Set(base)];
}

export function ReviewConfigPanel({ isOpen, onClose, onConfirm, onSave, topic, savedConfig }: ReviewConfigPanelProps) {
  const [config, setConfig] = useState<ReviewConfig>(DEFAULT_CONFIG);
  const [libraryExperts, setLibraryExperts] = useState<Expert[]>([]);
  const [filteredExperts, setFilteredExperts] = useState<Expert[]>([]);
  const [expertSearchQuery, setExpertSearchQuery] = useState('');
  const [readerExperts, setReaderExperts] = useState<Expert[]>([]);
  const [loadingExperts, setLoadingExperts] = useState(false);
  const [loadingReaders, setLoadingReaders] = useState(false);
  const [recommendedExpertIds, setRecommendedExpertIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 从持久化配置恢复 & 基于主题推荐专家
  useEffect(() => {
    if (isOpen) {
      // 1. 恢复持久化配置
      if (savedConfig) {
        // 从持久化的 experts (string[]) 或 aiExperts 恢复选中状态
        // 始终基于完整 AI_EXPERT_OPTIONS 重建，确保新增角色也能正确显示
        const enabledRoles = new Set<string>(
          savedConfig.experts ||
          (savedConfig.aiExperts || []).filter((e: any) => e.enabled !== false).map((e: any) => e.role) ||
          []
        );
        const restored: ReviewConfig = {
          mode: savedConfig.mode || DEFAULT_CONFIG.mode,
          aiExperts: AI_EXPERT_OPTIONS.map(opt => ({
            role: opt.role,
            enabled: enabledRoles.has(opt.role),
          })),
          humanExperts: savedConfig.humanExperts || [],
          autoRevise: savedConfig.autoRevise || DEFAULT_CONFIG.autoRevise,
          maxRounds: savedConfig.maxRounds || DEFAULT_CONFIG.maxRounds,
          readerTest: savedConfig.readerTest || DEFAULT_CONFIG.readerTest,
        };
        setConfig(restored);
        console.log('[ReviewConfigPanel] Restored saved config:', restored);
      } else {
        // 没有 savedConfig 时，根据 topic 自动推荐 AI 专家
        const recommended = getRecommendedAIExperts(topic);
        setConfig({
          ...DEFAULT_CONFIG,
          aiExperts: AI_EXPERT_OPTIONS.map(opt => ({
            role: opt.role,
            enabled: recommended.includes(opt.role),
          })),
        });
        console.log('[ReviewConfigPanel] Auto-recommended AI experts for topic:', topic, recommended);
      }

      loadLibraryExperts();
      loadReaderExperts();
    }
  }, [isOpen, savedConfig]);

  // 搜索过滤专家列表
  useEffect(() => {
    if (!expertSearchQuery.trim()) {
      setFilteredExperts(libraryExperts);
      return;
    }
    const query = expertSearchQuery.toLowerCase();
    const filtered = libraryExperts.filter(expert =>
      expert.name.toLowerCase().includes(query) ||
      expert.title?.toLowerCase().includes(query) ||
      expert.domain?.toLowerCase().includes(query) ||
      expert.bio?.toLowerCase().includes(query)
    );
    setFilteredExperts(filtered);
  }, [expertSearchQuery, libraryExperts]);

  const loadLibraryExperts = async () => {
    setLoadingExperts(true);
    try {
      // 使用 expertService（已支持 API 优先 + 本地 fallback）
      const localExperts = getAllExperts();
      const activeExperts = localExperts.filter(e =>
        e.status === 'active' && e.angle !== 'reader'
      );

      // 2. 基于 topic 智能推荐专家
      let recommended: string[] = [];
      if (topic && activeExperts.length > 0) {
        try {
          const matchResult = matchExperts(
            { topic, importance: 0.7 },
            { useSemanticMatch: true }
          );
          // 收集所有被推荐的专家ID
          const recIds = new Set<string>();
          if (matchResult.domainExperts) {
            matchResult.domainExperts.forEach(e => recIds.add(e.id));
          }
          if (matchResult.seniorExpert) {
            recIds.add(matchResult.seniorExpert.id);
          }
          recommended = Array.from(recIds);
          console.log(`[ReviewConfigPanel] Topic "${topic}" recommended experts:`, recommended);
        } catch (e) {
          console.warn('[ReviewConfigPanel] Expert matching failed:', e);
        }
      }
      setRecommendedExpertIds(recommended);

      // 3. 排序：推荐的排前面
      const recSet = new Set(recommended);
      const sorted = [
        ...activeExperts.filter(e => recSet.has(e.id)),
        ...activeExperts.filter(e => !recSet.has(e.id)),
      ];

      setLibraryExperts(sorted);
      setFilteredExperts(sorted);

      // 4. 如果没有已保存配置且有推荐，自动预选推荐专家
      if (!savedConfig && recommended.length > 0) {
        setConfig(prev => ({
          ...prev,
          humanExperts: [...new Set([...(prev.humanExperts || []), ...recommended.slice(0, 3)])],
        }));
      }
    } catch (error) {
      console.error('Failed to load experts:', error);
      const localExperts = getAllExperts();
      const activeExperts = localExperts.filter(e =>
        e.status === 'active' && e.angle !== 'reader'
      );
      setLibraryExperts(activeExperts);
      setFilteredExperts(activeExperts);
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

  // 为配置附带专家详情（name + profile），让后端不依赖硬编码映射
  const enrichConfigWithDetails = (cfg: ReviewConfig) => {
    const humanExpertsDetail = (cfg.humanExperts || []).map(id => {
      const expert = libraryExperts.find(e => e.id === id);
      return expert
        ? { id, name: expert.name, profile: expert.profile?.background || expert.profile?.title || '领域专家' }
        : { id, name: `专家${id}`, profile: '领域专家' };
    });
    const readerExpertsDetail = (cfg.readerTest?.selectedReaders || []).map(id => {
      const reader = readerExperts.find(r => r.id === id);
      return reader
        ? { id, name: reader.name, profile: reader.profile?.background || reader.profile?.title || '读者代表' }
        : { id, name: `读者${id}`, profile: '读者代表' };
    });
    return { ...cfg, humanExpertsDetail, readerExpertsDetail };
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
              {recommendedExpertIds.length > 0 && !expertSearchQuery && (
                <span className="text-xs font-normal text-amber-500">
                  {recommendedExpertIds.length} recommended
                </span>
              )}
              {expertSearchQuery && (
                <span className="text-xs font-normal text-slate-400">
                  {filteredExperts.length}/{libraryExperts.length}
                </span>
              )}
            </h4>
            {/* 搜索框 */}
            <div className="relative mb-3">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
              <input
                type="text"
                placeholder="搜索专家名称、职称、领域..."
                value={expertSearchQuery}
                onChange={(e) => setExpertSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {expertSearchQuery && (
                <button
                  onClick={() => setExpertSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {loadingExperts ? (
                <div className="flex items-center justify-center py-4">
                  <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                </div>
              ) : filteredExperts.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-2">
                  {expertSearchQuery ? '没有找到匹配的专家' : 'No experts available in library'}
                </p>
              ) : (
                filteredExperts.map(expert => {
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
                      <div className="flex items-center gap-1">
                        {recommendedExpertIds.includes(expert.id) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            recommended
                          </span>
                        )}
                        {expert.angle && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            expert.angle === 'challenger' ? 'bg-red-100 text-red-700' :
                            expert.angle === 'expander' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {expert.angle}
                          </span>
                        )}
                      </div>
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
        <div className="flex items-center justify-between p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50">
          <div>
            {onSave && (
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(enrichConfigWithDetails(config));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">save</span>
                {saving ? 'Saving...' : 'Save Config'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(enrichConfigWithDetails(config))}
              disabled={enabledCount === 0}
              className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Start Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
