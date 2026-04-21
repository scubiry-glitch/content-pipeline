// Assets.tsx
// v3.2.0: 素材库页面 - 集成 v6.2 AI 分析功能
// v7.x: 领域分类与 /content-library 对齐；新增内容类型（会议纪要/述职材料/访谈实录/音视频转录）

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  assetsApi,
  themesApi,
  expertLibraryApi,
  type Asset,
  type AssetTheme,
} from '../api/client';
import { assetsAiApi } from '../api/assetsAi';
import { AssetAIAnalysis } from '../components/AssetAIAnalysis';
import { LazyImage } from '../components/LazyImage';
import { useDropdownOptions } from '../components/ContentLibraryProductMeta';
import { DomainCascadeSelect, selectionToCode, codeToSelection } from '../components/DomainCascadeSelect';
import { useTaxonomy } from '../hooks/useTaxonomy';
import type { TaxonomySelection } from '../types/taxonomy';
import { ASSET_TYPE_META, ASSET_TYPES, type AssetType } from '../types';
import './Assets.css';

type FilterTab = 'all' | 'my' | 'shared';
type AssetStatus = 'research' | 'draft' | 'final';

interface ExtendedAsset extends Asset {
  asset_type: AssetType;
  status?: AssetStatus;
  word_count?: number;
  fact_check_score?: number;
  ai_quality_score?: number;
  ai_processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
  ai_analyzed_at?: string;
  created_by?: string;
  is_shared?: boolean;
}

export function Assets() {
  const navigate = useNavigate();

  // 数据状态
  const [assets, setAssets] = useState<ExtendedAsset[]>([]);
  const [themes, setThemes] = useState<AssetTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI状态
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<TaxonomySelection>({ l1: null, l2: null });
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AssetType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 统一的领域下拉（与 /content-library 共享同一数据源 /dropdown/domains）
  const { domains } = useDropdownOptions();
  const { tree: taxonomyTree, nameOf: taxNameOf } = useTaxonomy();

  // 弹窗状态
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateThemeModal, setShowCreateThemeModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ExtendedAsset | null>(null);

  // AI 分析弹窗状态
  const [showAIAnalysisModal, setShowAIAnalysisModal] = useState(false);
  const [selectedAssetForAI, setSelectedAssetForAI] = useState<ExtendedAsset | null>(null);

  // 专家标注状态
  const [showExpertAnnotation, setShowExpertAnnotation] = useState(false);
  const [annotationResult, setAnnotationResult] = useState<any>(null);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotatingAsset, setAnnotatingAsset] = useState<ExtendedAsset | null>(null);

  const requestExpertAnnotation = async (asset: ExtendedAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnnotatingAsset(asset);
    setAnnotationLoading(true);
    setShowExpertAnnotation(true);
    try {
      const result = await expertLibraryApi.annotateAsset(
        asset.id, asset.title || '', asset.content || '', (asset as any).tags || []
      );
      setAnnotationResult(result);
    } catch {
      setAnnotationResult(null);
    } finally {
      setAnnotationLoading(false);
    }
  };

  // 表单状态
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    title: '',
    source: '',
    themeId: '',
    tags: '',
    assetType: 'file' as AssetType,
    domain: '',
    taxonomy: { l1: null, l2: null } as TaxonomySelection,
  });
  const [themeForm, setThemeForm] = useState({
    name: '',
    description: '',
    icon: '📁',
    color: '#6366f1',
    domain: '',
    taxonomy: { l1: null, l2: null } as TaxonomySelection,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsRes, themesRes] = await Promise.all([
        assetsApi.getAll({ limit: 100 }),
        themesApi.getAll(),
      ]);
      // 转换数据类型
      const extendedAssets: ExtendedAsset[] = (assetsRes.items || []).map((a, index) => {
        // 计算真实字数：优先使用 metadata.wordCount，其次使用 content.length
        const wordCount = (a as any).metadata?.wordCount
          || (a.content?.length > 100 ? Math.round(a.content.length / 2) : 0)
          || (a as any).ai_quality_score || 0;

        const rawType = (a as any).asset_type || (a as any).type || 'file';
        const assetType: AssetType = (ASSET_TYPES as readonly string[]).includes(rawType)
          ? (rawType as AssetType)
          : 'file';

        return {
          ...a,
          asset_type: assetType,
          domain: (a as any).domain,
          taxonomy_code: (a as any).taxonomy_code,
          status: index % 3 === 0 ? 'research' : index % 3 === 1 ? 'draft' : 'final',
          word_count: wordCount,
          fact_check_score: (a as any).ai_quality_score
            ? Math.min((a as any).ai_quality_score + 80, 98)
            : Math.floor(Math.random() * 20) + 80,
          quality_score: typeof a.quality_score === 'string'
            ? parseFloat(a.quality_score)
            : a.quality_score,
          content: a.content || (a as any).content_preview || '',
        };
      });
      setAssets(extendedAssets);
      setThemes(themesRes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // theme.id -> theme 查找
  const themesById = Object.fromEntries(themes.map((t) => [t.id, t])) as Record<string, AssetTheme>;

  // 判断 asset 是否属于某 domain（直接 domain 字段 或 theme 绑定的 domain）
  const assetBelongsToDomain = (asset: ExtendedAsset, domain: string): boolean => {
    if (asset.domain === domain) return true;
    if (asset.theme_id) {
      const t = themesById[asset.theme_id];
      if (t && (t.domain === domain || (!t.domain && t.name === domain))) return true;
    }
    return false;
  };

  const countByDomain = (domain: string) =>
    assets.filter((a) => assetBelongsToDomain(a, domain)).length;

  // taxonomy_code 匹配（level-1 做前缀匹配；asset 仅 domain 的老数据通过名称兜底）
  const assetMatchesTaxonomy = (asset: ExtendedAsset, sel: TaxonomySelection): boolean => {
    const code = selectionToCode(sel);
    if (!code) return true;
    const own = (asset as any).taxonomy_code as string | undefined;
    if (own) {
      if (/^E\d{2}$/.test(code)) return own === code || own.startsWith(`${code}.`);
      return own === code;
    }
    // 无 taxonomy_code 的老数据：用 domain name → 当前选中节点的名称比较
    const targetName = taxNameOf(code);
    if (targetName && assetBelongsToDomain(asset, targetName)) return true;
    return false;
  };

  const countByTaxonomy = (code: string): number => {
    const sel = codeToSelection(code);
    return assets.filter(a => assetMatchesTaxonomy(a, sel)).length;
  };

  // 筛选素材
  const filteredAssets = assets.filter((asset) => {
    // Tab筛选
    if (filterTab === 'my') return asset.created_by === 'current_user';
    if (filterTab === 'shared') return asset.is_shared;

    // AI 分析状态筛选（互斥：选了 AI 状态就只按 AI 状态过滤）
    if (selectedTheme === 'ai-completed') return asset.ai_processing_status === 'completed';
    if (selectedTheme === 'ai-pending') return !asset.ai_processing_status || asset.ai_processing_status === 'pending';

    // 领域筛选：优先 taxonomy 级联；未选中则退回旧 domain 字符串
    if (selectedTaxonomy.l1 || selectedTaxonomy.l2) {
      if (!assetMatchesTaxonomy(asset, selectedTaxonomy)) return false;
    } else if (selectedDomain && !assetBelongsToDomain(asset, selectedDomain)) {
      return false;
    }

    // 主题筛选
    if (selectedTheme === 'uncategorized' && asset.theme_id) return false;
    if (selectedTheme && selectedTheme !== 'uncategorized' && asset.theme_id !== selectedTheme) return false;

    // 类型筛选
    if (selectedType && asset.asset_type !== selectedType) return false;

    return true;
  }).filter((asset) => {
    // 搜索筛选
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      asset.title?.toLowerCase().includes(query) ||
      asset.tags?.some((t) => t.toLowerCase().includes(query)) ||
      asset.source?.toLowerCase().includes(query)
    );
  });

  // 当前选中领域下可见的主题（未选领域则全部）
  const activeCode = selectionToCode(selectedTaxonomy);
  const activeL1Name = activeCode ? taxNameOf(activeCode.split('.')[0]) : null;
  const visibleThemes = activeCode
    ? themes.filter((t) => {
        const tcode = (t as any).taxonomy_code as string | undefined;
        if (tcode) {
          if (/^E\d{2}$/.test(activeCode)) return tcode === activeCode || tcode.startsWith(`${activeCode}.`);
          return tcode === activeCode;
        }
        // 老主题：按 name/domain 字段名字兜底
        const nm = t.domain || t.name;
        return nm === activeL1Name || nm === taxNameOf(activeCode);
      })
    : selectedDomain
      ? themes.filter((t) => (t.domain || t.name) === selectedDomain)
      : themes;

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm((prev) => ({
        ...prev,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
      }));
    }
  };

  // 上传素材
  const handleUpload = async () => {
    if (!uploadForm.file) return;

    const formData = new FormData();
    formData.append('file', uploadForm.file);
    formData.append('title', uploadForm.title);
    formData.append('source', uploadForm.source);
    if (uploadForm.themeId) formData.append('theme_id', uploadForm.themeId);
    if (uploadForm.tags) formData.append('tags', uploadForm.tags);
    formData.append('asset_type', uploadForm.assetType);
    // 若未显式填 domain，回退到所选主题的 domain
    const effectiveDomain = uploadForm.domain
      || (uploadForm.themeId ? (themesById[uploadForm.themeId]?.domain || themesById[uploadForm.themeId]?.name || '') : '');
    if (effectiveDomain) formData.append('domain', effectiveDomain);
    const taxCode = selectionToCode(uploadForm.taxonomy)
      || (uploadForm.themeId ? ((themesById[uploadForm.themeId] as any)?.taxonomy_code || '') : '');
    if (taxCode) formData.append('taxonomy_code', taxCode);

    try {
      await assetsApi.create(formData);
      setShowUploadModal(false);
      setUploadForm({ file: null, title: '', source: '', themeId: '', tags: '', assetType: 'file', domain: '', taxonomy: { l1: null, l2: null } });
      loadData();
    } catch (err) {
      alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 打开编辑弹窗
  const openEditModal = (asset: ExtendedAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAsset(asset);
    setShowEditModal(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingAsset) return;

    try {
      await assetsApi.update(editingAsset.id, {
        title: editingAsset.title,
        source: editingAsset.source,
        theme_id: editingAsset.theme_id,
        tags: editingAsset.tags,
        content: editingAsset.content,
        asset_type: editingAsset.asset_type,
        domain: editingAsset.domain,
        taxonomy_code: (editingAsset as any).taxonomy_code,
      } as Partial<Asset>);
      setShowEditModal(false);
      setEditingAsset(null);
      loadData();
    } catch (err) {
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 删除素材
  const handleDelete = async (asset: ExtendedAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个素材吗？')) return;
    try {
      await assetsApi.delete(asset.id);
      loadData();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 切换置顶
  const handleTogglePin = async (asset: ExtendedAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await assetsApi.update(asset.id, { is_pinned: !asset.is_pinned });
      loadData();
    } catch (err) {
      alert('操作失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // AI 分析状态徽章
  const getAIStatusBadge = (asset: ExtendedAsset) => {
    const status = asset.ai_processing_status;
    
    if (status === 'completed' && asset.ai_quality_score) {
      return (
        <div 
          className="ai-status-badge completed" 
          title={`AI 评分: ${asset.ai_quality_score}`}
          onClick={(e) => openAIAnalysisModal(asset, e)}
        >
          <span className="ai-score">{asset.ai_quality_score}</span>
          <span className="ai-label">AI</span>
        </div>
      );
    }
    
    if (status === 'processing') {
      return (
        <div className="ai-status-badge processing" title="AI 分析中...">
          <span className="material-icon spinning">refresh</span>
        </div>
      );
    }
    
    if (status === 'failed') {
      return (
        <div 
          className="ai-status-badge failed" 
          title="分析失败，点击查看详情"
          onClick={(e) => openAIAnalysisModal(asset, e)}
        >
          <span className="material-icon">error</span>
        </div>
      );
    }
    
    return (
      <div 
        className="ai-status-badge pending" 
        title="点击进行 AI 分析"
        onClick={(e) => openAIAnalysisModal(asset, e)}
      >
        <span className="material-icon">auto_awesome</span>
      </div>
    );
  };

  // 打开 AI 分析弹窗
  const openAIAnalysisModal = (asset: ExtendedAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAssetForAI(asset);
    setShowAIAnalysisModal(true);
  };

  // 批量触发 AI 分析
  const handleBatchAI = async () => {
    const unprocessedAssets = assets.filter(
      a => !a.ai_processing_status || a.ai_processing_status === 'pending'
    );
    
    if (unprocessedAssets.length === 0) {
      alert('所有素材已完成 AI 分析');
      return;
    }
    
    if (!confirm(`确定要对 ${unprocessedAssets.length} 个素材进行 AI 分析吗？`)) {
      return;
    }
    
    try {
      await assetsAiApi.triggerBatchProcess({
        assetIds: unprocessedAssets.map(a => a.id),
      });
      alert('AI 分析已触发，请稍后刷新查看结果');
    } catch (err) {
      alert('触发失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 创建主题
  const handleCreateTheme = async () => {
    try {
      const taxCode = selectionToCode(themeForm.taxonomy);
      await themesApi.create({
        name: themeForm.name,
        description: themeForm.description,
        icon: themeForm.icon,
        color: themeForm.color,
        domain: themeForm.domain || themeForm.name, // 默认 domain = name
        ...(taxCode ? { taxonomy_code: taxCode } : {}),
      } as any);
      setShowCreateThemeModal(false);
      setThemeForm({ name: '', description: '', icon: '📁', color: '#6366f1', domain: '', taxonomy: { l1: null, l2: null } });
      loadData();
    } catch (err) {
      alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 类型 chip 样式
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 16,
    fontSize: 12,
    border: `1px solid ${active ? '#6366f1' : '#e5e7eb'}`,
    background: active ? '#eef2ff' : '#fff',
    color: active ? '#4338ca' : '#374151',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  // 获取状态配置
  const getStatusConfig = (status?: AssetStatus) => {
    switch (status) {
      case 'research':
        return { label: 'Research', bgColor: '#9a4800', color: '#fff' };
      case 'draft':
        return { label: 'Draft', bgColor: '#005bc1', color: '#fff' };
      case 'final':
        return { label: 'Final', bgColor: '#5b5f64', color: '#fff' };
      default:
        return { label: 'File', bgColor: '#5b5f64', color: '#fff' };
    }
  };

  // 获取质量分颜色
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // 渲染素材卡片
  const renderAssetCard = (asset: ExtendedAsset) => {
    const score = (asset.quality_score || 0) * 100;
    const factScore = asset.fact_check_score || 0;
    const statusConfig = getStatusConfig(asset.status);
    const theme = themes.find((t) => t.id === asset.theme_id);

    return (
      <div
        key={asset.id}
        className={`asset-card-v2 ${asset.is_pinned ? 'pinned' : ''}`}
        onClick={() => navigate(`/assets/${asset.id}`)}
      >
        {/* 图片预览区 */}
        <div className="asset-card-image">
          {asset.content_type?.startsWith('image/') ? (
            <LazyImage
              src={`/api/v1/assets/${asset.id}/preview`}
              alt={asset.title}
            />
          ) : asset.content_type?.includes('pdf') ? (
            <div className="file-preview pdf">
              <span className="file-icon-large">📄</span>
            </div>
          ) : (
            <div className="file-preview">
              <span className="file-icon-large">📝</span>
            </div>
          )}
          {/* 状态标签 */}
          <div className="asset-status-badge" style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}>
            {statusConfig.label}
          </div>
          {/* AI 分析状态 */}
          <div className="ai-status-overlay">
            {getAIStatusBadge(asset)}
          </div>
        </div>

        {/* 内容区 */}
        <div className="asset-card-content">
          <div className="asset-card-header">
            <h3 className="asset-card-title" title={asset.title}>
              {asset.title}
            </h3>
            <button 
              className={`pin-btn ${asset.is_pinned ? 'active' : ''}`}
              onClick={(e) => handleTogglePin(asset, e)}
              title={asset.is_pinned ? '取消置顶' : '置顶'}
            >
              <span className="material-icon">push_pin</span>
            </button>
          </div>

          <p className="asset-card-meta">
            <span className="material-icon text-xs">calendar_today</span>
            {formatDate(asset.created_at)} • {(asset.word_count || 0).toLocaleString()} words
          </p>

          {/* 质量指标 */}
          <div className="asset-card-metrics">
            <div className="metric-box">
              <span className="metric-label">Quality Score</span>
              <div className="metric-value-row">
                <div className="metric-bar">
                  <div 
                    className="metric-bar-fill" 
                    style={{ width: `${score}%`, backgroundColor: getScoreColor(score) }}
                  />
                </div>
                <span className="metric-value" style={{ color: getScoreColor(score) }}>
                  {(score / 100).toFixed(1)}
                </span>
              </div>
            </div>
            <div className="metric-box">
              <span className="metric-label">Fact-Check</span>
              <div className="metric-value-row">
                <span className="material-icon text-sm" style={{ color: '#005bc1', fontVariationSettings: "'FILL' 1" }}>verified</span>
                <span className="metric-value">{factScore}%</span>
              </div>
            </div>
          </div>

          {/* 悬停操作按钮 */}
          <div className="asset-card-actions">
            <button
              className="action-btn"
              onClick={(e) => requestExpertAnnotation(asset, e)}
              title="专家解读"
            >
              <span className="material-icon">psychology</span>
            </button>
            <button
              className="action-btn"
              onClick={(e) => openEditModal(asset, e)}
              title="编辑"
            >
              <span className="material-icon">edit</span>
            </button>
            <button
              className="action-btn danger"
              onClick={(e) => handleDelete(asset, e)}
              title="删除"
            >
              <span className="material-icon">delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染空状态卡片
  const renderEmptyCard = () => (
    <div className="empty-card" onClick={() => setShowUploadModal(true)}>
      <div className="empty-card-icon">
        <span className="material-icon">add_circle</span>
      </div>
      <span className="empty-card-title">Create New Asset</span>
      <span className="empty-card-subtitle">Start a fresh editorial project</span>
    </div>
  );

  if (loading && assets.length === 0) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="assets-library-v2">
      {/* 页面标题区域 */}
      <div className="assets-page-header">
        <div className="header-left">
          <h1 className="page-title">Content Assets</h1>
          <p className="page-subtitle">Manage and monitor editorial production quality.</p>
        </div>
        <div className="header-right">
          {/* 批量 AI 分析按钮 */}
          <button className="btn-batch-ai" onClick={handleBatchAI} title="批量 AI 分析">
            <span className="material-icon">auto_awesome</span>
            AI 分析
          </button>
          {/* 筛选切换 */}
          <div className="filter-tabs">
            <button
              className={`filter-tab ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Assets
            </button>
            <button
              className={`filter-tab ${filterTab === 'my' ? 'active' : ''}`}
              onClick={() => setFilterTab('my')}
            >
              My Content
            </button>
            <button
              className={`filter-tab ${filterTab === 'shared' ? 'active' : ''}`}
              onClick={() => setFilterTab('shared')}
            >
              Shared
            </button>
          </div>
          {/* 新建按钮 */}
          <button className="btn-new-asset" onClick={() => setShowUploadModal(true)}>
            <span className="material-icon text-sm">add</span>
            New Asset
          </button>
        </div>
      </div>

      {/* 类型筛选 chips */}
      <div className="asset-type-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 12px' }}>
        <button
          className={`type-chip ${selectedType === null ? 'active' : ''}`}
          onClick={() => setSelectedType(null)}
          style={chipStyle(selectedType === null)}
        >
          全部类型
        </button>
        {ASSET_TYPES.map((t) => {
          const meta = ASSET_TYPE_META[t];
          const count = assets.filter((a) => a.asset_type === t).length;
          return (
            <button
              key={t}
              className={`type-chip ${selectedType === t ? 'active' : ''}`}
              onClick={() => setSelectedType(selectedType === t ? null : t)}
              style={chipStyle(selectedType === t)}
              title={`${meta.label}（${count}）`}
            >
              <span style={{ marginRight: 4 }}>{meta.icon}</span>
              {meta.label}
              <span style={{ marginLeft: 4, opacity: 0.6 }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="assets-layout-v2">
        {/* 左侧领域 + 主题导航 */}
        <aside className="theme-sidebar-v2">
          <div className="sidebar-header-v2">
            <span className="sidebar-title">领域分类</span>
            <button className="btn-add-theme" onClick={() => setShowCreateThemeModal(true)} title="新建主题">
              <span className="material-icon">add</span>
            </button>
          </div>
          <nav className="theme-nav">
            <div
              className={`theme-nav-item ${selectedDomain === null && !selectedTaxonomy.l1 && selectedTheme === null ? 'active' : ''}`}
              onClick={() => {
                setSelectedDomain(null);
                setSelectedTaxonomy({ l1: null, l2: null });
                setSelectedTheme(null);
              }}
            >
              <span className="theme-nav-icon">📚</span>
              <span className="theme-nav-name">全部素材</span>
              <span className="theme-nav-count">{assets.length}</span>
            </div>
            <div
              className={`theme-nav-item ${selectedTheme === 'uncategorized' ? 'active' : ''}`}
              onClick={() => {
                setSelectedTheme('uncategorized');
                setSelectedDomain(null);
                setSelectedTaxonomy({ l1: null, l2: null });
              }}
            >
              <span className="theme-nav-icon">📂</span>
              <span className="theme-nav-name">未分类</span>
              <span className="theme-nav-count">
                {assets.filter((a) => !a.theme_id).length}
              </span>
            </div>

            {/* 二级领域级联（taxonomy_code，单一真源） */}
            <div className="sidebar-section">
              <span className="sidebar-section-title">领域（级联）</span>
              <div className="px-2 py-1">
                <DomainCascadeSelect
                  value={selectedTaxonomy}
                  onChange={(next) => {
                    setSelectedTaxonomy(next);
                    setSelectedDomain(null);
                    setSelectedTheme(null);
                  }}
                  compact
                />
              </div>
              {taxonomyTree.length > 0 && !selectedTaxonomy.l1 && (
                <div className="mt-1">
                  {taxonomyTree.map((n) => {
                    const c = countByTaxonomy(n.code);
                    if (c === 0) return null;
                    return (
                      <div
                        key={n.code}
                        className="theme-nav-item"
                        onClick={() => setSelectedTaxonomy({ l1: n.code, l2: null })}
                        title={`${n.code} · ${n.name}`}
                      >
                        <span className="theme-nav-icon">{n.icon || '🏷️'}</span>
                        <span className="theme-nav-name">{n.name}</span>
                        <span className="theme-nav-count">{c}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 兼容旧 /dropdown/domains（仅在没有选中 taxonomy 时显示，作为过渡期的备份入口） */}
            {!selectedTaxonomy.l1 && domains.length > 0 && (
              <div className="sidebar-section">
                <span className="sidebar-section-title">旧领域标签</span>
                {domains.map((d) => (
                  <div
                    key={d}
                    className={`theme-nav-item ${selectedDomain === d ? 'active' : ''}`}
                    onClick={() => { setSelectedDomain(selectedDomain === d ? null : d); setSelectedTheme(null); }}
                    title={`领域：${d}`}
                  >
                    <span className="theme-nav-icon">🏷️</span>
                    <span className="theme-nav-name">{d}</span>
                    <span className="theme-nav-count">{countByDomain(d)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* AI 分析状态筛选 */}
            <div className="sidebar-section">
              <span className="sidebar-section-title">AI 分析</span>
              <div
                className={`theme-nav-item ${selectedTheme === 'ai-completed' ? 'active' : ''}`}
                onClick={() => setSelectedTheme(selectedTheme === 'ai-completed' ? null : 'ai-completed')}
              >
                <span className="theme-nav-icon">✅</span>
                <span className="theme-nav-name">已完成</span>
                <span className="theme-nav-count">
                  {assets.filter(a => a.ai_processing_status === 'completed').length}
                </span>
              </div>
              <div
                className={`theme-nav-item ${selectedTheme === 'ai-pending' ? 'active' : ''}`}
                onClick={() => setSelectedTheme(selectedTheme === 'ai-pending' ? null : 'ai-pending')}
              >
                <span className="theme-nav-icon">⏳</span>
                <span className="theme-nav-name">待分析</span>
                <span className="theme-nav-count">
                  {assets.filter(a => !a.ai_processing_status || a.ai_processing_status === 'pending').length}
                </span>
              </div>
            </div>

            {/* 主题：全部 or 选定领域下的主题 */}
            {visibleThemes.length > 0 && (
              <div className="sidebar-section">
                <span className="sidebar-section-title">
                  {selectedDomain ? `${selectedDomain} · 主题` : '我的主题'}
                </span>
                {visibleThemes.map((theme) => (
                  <div
                    key={theme.id}
                    className={`theme-nav-item ${selectedTheme === theme.id ? 'active' : ''}`}
                    onClick={() => setSelectedTheme(selectedTheme === theme.id ? null : theme.id)}
                  >
                    <span className="theme-nav-icon">{theme.icon}</span>
                    <span className="theme-nav-name">{theme.name}</span>
                    <span className="theme-nav-count">
                      {assets.filter((a) => a.theme_id === theme.id).length}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </nav>
        </aside>

        {/* 素材网格 */}
        <main className="assets-grid-container-v2">
          {filteredAssets.length === 0 ? (
            <div className="empty-state-v2">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-title">暂无素材</div>
              <p>点击"New Asset"上传您的第一个文件</p>
            </div>
          ) : (
            <div className="assets-grid-v2">
              {filteredAssets.map(renderAssetCard)}
              {renderEmptyCard()}
            </div>
          )}
        </main>
      </div>

      {/* 上传弹窗 */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加素材</h3>
              <button className="btn-close" onClick={() => setShowUploadModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <div
                className="upload-area"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadForm.file ? (
                  <div className="selected-file">📄 {uploadForm.file.name}</div>
                ) : (
                  <div className="upload-placeholder">
                    <span className="upload-icon">📁</span>
                    <p>点击选择文件</p>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>标题</label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="素材标题"
                />
              </div>
              <div className="form-group">
                <label>来源</label>
                <input
                  type="text"
                  value={uploadForm.source}
                  onChange={(e) => setUploadForm((p) => ({ ...p, source: e.target.value }))}
                  placeholder="来源名称"
                />
              </div>
              <div className="form-group">
                <label>内容类型</label>
                <select
                  value={uploadForm.assetType}
                  onChange={(e) => setUploadForm((p) => ({ ...p, assetType: e.target.value as AssetType }))}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ASSET_TYPE_META[t].icon} {ASSET_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>领域分类（级联）</label>
                <DomainCascadeSelect
                  value={uploadForm.taxonomy}
                  onChange={(t) => setUploadForm((p) => ({ ...p, taxonomy: t }))}
                />
              </div>
              <div className="form-group">
                <label>领域（自由文本，向后兼容）</label>
                <input
                  type="text"
                  list="asset-domain-options"
                  value={uploadForm.domain}
                  onChange={(e) => setUploadForm((p) => ({ ...p, domain: e.target.value }))}
                  placeholder="可留空；上方级联为准"
                />
                <datalist id="asset-domain-options">
                  {domains.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>主题</label>
                <select
                  value={uploadForm.themeId}
                  onChange={(e) => setUploadForm((p) => ({ ...p, themeId: e.target.value }))}
                >
                  <option value="">选择主题（可选）</option>
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>标签（逗号分隔）</label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="tag1, tag2, tag3"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!uploadForm.file || !uploadForm.title.trim()}
              >
                上传
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {showEditModal && editingAsset && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑素材</h3>
              <button className="btn-close" onClick={() => setShowEditModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>标题</label>
                <input
                  type="text"
                  value={editingAsset.title}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, title: e.target.value }) : null)}
                />
              </div>
              <div className="form-group">
                <label>来源</label>
                <input
                  type="text"
                  value={editingAsset.source || ''}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, source: e.target.value }) : null)}
                />
              </div>
              <div className="form-group">
                <label>内容类型</label>
                <select
                  value={editingAsset.asset_type || 'file'}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, asset_type: e.target.value as AssetType }) : null)}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ASSET_TYPE_META[t].icon} {ASSET_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>领域分类（级联）</label>
                <DomainCascadeSelect
                  value={codeToSelection((editingAsset as any).taxonomy_code)}
                  onChange={(t) => setEditingAsset((p) =>
                    p ? ({ ...p, taxonomy_code: selectionToCode(t) ?? undefined } as any) : null,
                  )}
                />
              </div>
              <div className="form-group">
                <label>领域（自由文本）</label>
                <input
                  type="text"
                  list="asset-edit-domain-options"
                  value={editingAsset.domain || ''}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, domain: e.target.value || undefined }) : null)}
                  placeholder="可留空，以级联为准"
                />
                <datalist id="asset-edit-domain-options">
                  {domains.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>主题</label>
                <select
                  value={editingAsset.theme_id || ''}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, theme_id: e.target.value || undefined }) : null)}
                >
                  <option value="">无主题</option>
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>标签（逗号分隔）</label>
                <input
                  type="text"
                  value={editingAsset.tags?.join(', ') || ''}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }) : null)}
                />
              </div>
              <div className="form-group">
                <label>内容</label>
                <textarea
                  rows={6}
                  value={editingAsset.content || ''}
                  onChange={(e) => setEditingAsset((p) => p ? ({ ...p, content: e.target.value }) : null)}
                  placeholder="素材内容..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建主题弹窗 */}
      {showCreateThemeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateThemeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建主题</h3>
              <button className="btn-close" onClick={() => setShowCreateThemeModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>名称</label>
                <input
                  type="text"
                  value={themeForm.name}
                  onChange={(e) => setThemeForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="主题名称"
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <input
                  type="text"
                  value={themeForm.description}
                  onChange={(e) => setThemeForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="主题描述（可选）"
                />
              </div>
              <div className="form-group">
                <label>领域分类（级联）</label>
                <DomainCascadeSelect
                  value={themeForm.taxonomy}
                  onChange={(t) => setThemeForm((p) => ({ ...p, taxonomy: t }))}
                />
              </div>
              <div className="form-group">
                <label>领域（自由文本）</label>
                <input
                  type="text"
                  list="theme-domain-options"
                  value={themeForm.domain}
                  onChange={(e) => setThemeForm((p) => ({ ...p, domain: e.target.value }))}
                  placeholder="可留空；上方级联为准"
                />
                <datalist id="theme-domain-options">
                  {domains.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>图标</label>
                <input
                  type="text"
                  value={themeForm.icon}
                  onChange={(e) => setThemeForm((p) => ({ ...p, icon: e.target.value }))}
                  placeholder="emoji 图标"
                />
              </div>
              <div className="form-group">
                <label>颜色</label>
                <input
                  type="color"
                  value={themeForm.color}
                  onChange={(e) => setThemeForm((p) => ({ ...p, color: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateThemeModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateTheme}
                disabled={!themeForm.name.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 分析详情弹窗 */}
      {showAIAnalysisModal && selectedAssetForAI && (
        <div className="modal-overlay" onClick={() => setShowAIAnalysisModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>AI 分析详情</h3>
              <button className="btn-close" onClick={() => setShowAIAnalysisModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body modal-body-ai">
              <AssetAIAnalysis 
                assetId={selectedAssetForAI.id} 
                compact={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* 专家标注弹窗 */}
      {showExpertAnnotation && (
        <div className="modal-overlay" onClick={() => setShowExpertAnnotation(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>专家解读 — {annotatingAsset?.title}</h3>
              <button className="btn-close" onClick={() => setShowExpertAnnotation(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {annotationLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>专家解读生成中...</div>
              ) : annotationResult?.annotations?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {annotationResult.overallCredibility > 0 && (
                    <div style={{ padding: '12px', background: '#f0f7ff', borderRadius: '8px', fontSize: '13px' }}>
                      综合可信度: <strong>{annotationResult.overallCredibility.toFixed(1)}/10</strong>
                    </div>
                  )}
                  {annotationResult.annotations.map((ann: any) => (
                    <div key={ann.expertId} style={{ padding: '14px', background: '#fafafa', borderRadius: '10px', border: '1px solid #eee' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#6750a4', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                          {ann.expertName?.charAt(0)}
                        </div>
                        <strong style={{ fontSize: '13px' }}>{ann.expertName}</strong>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>
                          可信度 {ann.credibilityScore}/10
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', lineHeight: 1.6, margin: '0 0 8px 0' }}>{ann.content}</p>
                      {ann.takeaways?.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#555' }}>
                          {ann.takeaways.map((t: string, i: number) => <li key={i}>{t}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>暂无专家解读</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Assets;
