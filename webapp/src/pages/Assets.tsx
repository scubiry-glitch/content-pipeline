import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  assetsApi, 
  themesApi, 
  bindingsApi, 
  rssSourcesApi,
  reportsApi,
  type Asset, 
  type AssetTheme, 
  type DirectoryBinding,
  type Report,
} from '../api/client';
import { LazyImage } from '../components/LazyImage';
import { AssetExpertReviewModal } from '../components/AssetExpertReviewModal';
import { getAssetCompositeScore } from '../services/expertService';
import './Assets.css';

// 扩展 Asset 类型以兼容研报
type AssetType = 'file' | 'report' | 'quote' | 'data' | 'rss_item';
interface ExtendedAsset extends Asset {
  asset_type: AssetType;
  // 研报特有字段
  authors?: string[];
  institution?: string;
  publish_date?: string;
  page_count?: number;
  key_points?: string[];
  status?: 'pending' | 'parsed' | 'matched' | 'completed';
}

type FilterType = 'all' | 'pinned' | 'pdf' | 'txt' | 'image' | 'report';
type AssetTab = 'assets' | 'reports' | 'popular' | 'rss' | 'bindings';

export function Assets() {
  const navigate = useNavigate();

  // 数据状态
  const [assets, setAssets] = useState<ExtendedAsset[]>([]);
  const [themes, setThemes] = useState<AssetTheme[]>([]);
  const [bindings, setBindings] = useState<DirectoryBinding[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI状态
  const [activeTab, setActiveTab] = useState<AssetTab>('assets');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showReportUploadModal, setShowReportUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateThemeModal, setShowCreateThemeModal] = useState(false);
  const [showCreateBindingModal, setShowCreateBindingModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ExtendedAsset | null>(null);
  const [expertReviewAsset, setExpertReviewAsset] = useState<ExtendedAsset | null>(null);

  // 表单状态
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    title: '',
    source: '',
    themeId: '',
    tags: '',
  });
  const [reportUploadForm, setReportUploadForm] = useState({
    file: null as File | null,
    title: '',
    source: '',
    tags: '',
  });
  const [themeForm, setThemeForm] = useState({
    name: '',
    description: '',
    icon: '📁',
    color: '#6366f1',
  });
  const [bindingForm, setBindingForm] = useState({
    name: '',
    path: '',
    themeId: '',
    autoSync: true,
  });

  // 研报对比模式
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportFileInputRef = useRef<HTMLInputElement>(null);

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  // Tab 切换时加载对应数据
  useEffect(() => {
    if (activeTab === 'reports') {
      loadReports();
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsRes, themesRes, bindingsRes] = await Promise.all([
        assetsApi.getAll({ limit: 100 }),
        themesApi.getAll(),
        bindingsApi.getAll(),
      ]);
      // 将普通资产标记为 file 类型
      const extendedAssets: ExtendedAsset[] = (assetsRes.items || []).map(a => ({
        ...a,
        asset_type: 'file' as AssetType,
      }));
      setAssets(extendedAssets);
      setThemes(themesRes || []);
      setBindings(bindingsRes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await reportsApi.getAll({ limit: 50 });
      // 将 Report 转换为 ExtendedAsset 格式
      const reportAssets: ExtendedAsset[] = (response.items || []).map(r => ({
        id: r.id,
        title: r.title,
        content: r.content || '',
        content_type: 'application/pdf',
        source: r.institution || '未知来源',
        tags: r.tags || [],
        auto_tags: [],
        quality_score: r.qualityScore || 0,
        citation_count: 0,
        is_pinned: false,
        theme_id: undefined,
        asset_type: 'report',
        authors: r.authors,
        institution: r.institution,
        publish_date: r.publishDate,
        page_count: r.pageCount,
        key_points: r.keyPoints,
        status: r.status,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      }));
      setReports(response.items || []);
      // 合并到资产列表
      setAssets(prev => {
        const nonReportAssets = prev.filter(a => a.asset_type !== 'report');
        return [...nonReportAssets, ...reportAssets];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载研报失败');
    } finally {
      setLoading(false);
    }
  };

  // 筛选素材
  const filteredAssets = assets.filter((asset) => {
    // 类型筛选
    if (filter === 'pinned') return asset.is_pinned;
    if (filter === 'pdf') return asset.content_type?.includes('pdf');
    if (filter === 'txt') return asset.content_type?.includes('text') || asset.content_type?.includes('txt');
    if (filter === 'image') return asset.content_type?.startsWith('image/');
    if (filter === 'report') return asset.asset_type === 'report';

    // 主题筛选
    if (selectedTheme === 'uncategorized') return !asset.theme_id && asset.asset_type !== 'report';
    if (selectedTheme) return asset.theme_id === selectedTheme;

    // 根据 Tab 筛选
    if (activeTab === 'assets') return asset.asset_type !== 'report';
    if (activeTab === 'reports') return asset.asset_type === 'report';

    return true;
  }).filter((asset) => {
    // 搜索筛选
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      asset.title?.toLowerCase().includes(query) ||
      asset.tags?.some((t) => t.toLowerCase().includes(query)) ||
      asset.source?.toLowerCase().includes(query) ||
      (asset as ExtendedAsset).authors?.some(a => a.toLowerCase().includes(query)) ||
      (asset as ExtendedAsset).institution?.toLowerCase().includes(query)
    );
  });

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

  // 处理研报文件选择
  const handleReportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReportUploadForm((prev) => ({
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

    try {
      await assetsApi.create(formData);
      setShowUploadModal(false);
      setUploadForm({ file: null, title: '', source: '', themeId: '', tags: '' });
      loadData();
    } catch (err) {
      alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 上传研报
  const handleReportUpload = async () => {
    if (!reportUploadForm.file) return;

    try {
      await reportsApi.upload(reportUploadForm.file);
      setShowReportUploadModal(false);
      setReportUploadForm({ file: null, title: '', source: '', tags: '' });
      loadReports();
    } catch (err) {
      alert('上传研报失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 打开编辑弹窗
  const openEditModal = (asset: ExtendedAsset) => {
    setEditingAsset(asset);
    setShowEditModal(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingAsset) return;

    try {
      if (editingAsset.asset_type === 'report') {
        // 研报编辑逻辑
        await reportsApi.update(editingAsset.id, {
          title: editingAsset.title,
          tags: editingAsset.tags,
        });
      } else {
        // 普通素材编辑
        await assetsApi.update(editingAsset.id, {
          title: editingAsset.title,
          source: editingAsset.source,
          theme_id: editingAsset.theme_id,
          tags: editingAsset.tags,
          content: editingAsset.content,
        });
      }
      setShowEditModal(false);
      setEditingAsset(null);
      loadData();
    } catch (err) {
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 切换置顶
  const handleTogglePin = async (asset: ExtendedAsset) => {
    try {
      if (asset.asset_type === 'report') {
        // 研报暂不支持置顶
        return;
      }
      await assetsApi.togglePin(asset.id, !asset.is_pinned);
      loadData();
    } catch (err) {
      console.error('置顶失败:', err);
    }
  };

  // 删除素材
  const handleDelete = async (asset: ExtendedAsset) => {
    if (!confirm('确定要删除这个素材吗？')) return;
    try {
      if (asset.asset_type === 'report') {
        // 研报删除需要调用 reportsApi
        console.log('删除研报:', asset.id);
      } else {
        await assetsApi.delete(asset.id);
      }
      loadData();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 创建主题
  const handleCreateTheme = async () => {
    if (!themeForm.name.trim()) return;
    try {
      await themesApi.create(themeForm);
      setShowCreateThemeModal(false);
      setThemeForm({ name: '', description: '', icon: '📁', color: '#6366f1' });
      loadData();
    } catch (err) {
      alert('创建主题失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 创建目录绑定
  const handleCreateBinding = async () => {
    if (!bindingForm.name.trim() || !bindingForm.path.trim()) return;
    try {
      await bindingsApi.create({
        name: bindingForm.name,
        path: bindingForm.path,
        theme_id: bindingForm.themeId || undefined,
        autoSync: bindingForm.autoSync,
      });
      setShowCreateBindingModal(false);
      setBindingForm({ name: '', path: '', themeId: '', autoSync: true });
      loadData();
    } catch (err) {
      alert('创建绑定失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 扫描目录
  const handleScanBinding = async (id: string) => {
    try {
      const result = await bindingsApi.scan(id);
      alert(`扫描完成: 发现 ${result.scanned} 个文件，新增 ${result.added} 个素材`);
      loadData();
    } catch (err) {
      alert('扫描失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 删除目录绑定
  const handleDeleteBinding = async (id: string) => {
    if (!confirm('确定要删除这个目录绑定吗？')) return;
    try {
      await bindingsApi.delete(id);
      loadData();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 获取素材图标
  const getAssetIcon = (asset: ExtendedAsset) => {
    if (asset.asset_type === 'report') return '📊';
    if (asset.content_type?.startsWith('image/')) return '🖼️';
    if (asset.content_type?.includes('pdf')) return '📄';
    if (asset.content_type?.includes('word') || asset.content_type?.includes('document')) return '📝';
    if (asset.content_type?.includes('text') || asset.content_type?.includes('txt')) return '📃';
    if (asset.content_type?.includes('excel') || asset.content_type?.includes('sheet')) return '📈';
    return '📎';
  };

  // 获取主题名称
  const getThemeName = (themeId?: string) => {
    if (!themeId) return null;
    return themes.find((t) => t.id === themeId)?.name;
  };

  // 排序主题：置顶优先，然后按sort_order
  const sortedThemes = [...themes].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  // 研报对比功能
  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setSelectedForCompare([]);
  };

  const toggleSelectForCompare = (reportId: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(reportId)) {
        return prev.filter(id => id !== reportId);
      }
      if (prev.length >= 3) {
        alert('最多只能选择3篇研报进行对比');
        return prev;
      }
      return [...prev, reportId];
    });
  };

  const handleCompare = () => {
    if (selectedForCompare.length < 2) {
      alert('请至少选择2篇研报进行对比');
      return;
    }
    navigate(`/assets/reports/compare?ids=${selectedForCompare.join(',')}`);
  };

  // 获取研报状态标签
  const getReportStatusLabel = (status?: string) => {
    const labels: Record<string, string> = {
      pending: '待解析',
      parsed: '已解析',
      matched: '已关联',
      completed: '已完成',
    };
    return labels[status || ''] || status;
  };

  return (
    <div className="assets-page">
      {/* 页面标题 */}
      <div className="assets-header">
        <h1 className="page-title">📚 内容资产管理</h1>
        <div className="header-actions">
          {activeTab === 'reports' && (
            <button 
              className={`btn ${compareMode ? 'btn-warning' : 'btn-secondary'}`}
              onClick={toggleCompareMode}
            >
              {compareMode ? '❌ 取消对比' : '📊 对比模式'}
            </button>
          )}
          {activeTab === 'reports' && compareMode && (
            <button
              className="btn btn-primary"
              onClick={handleCompare}
              disabled={selectedForCompare.length < 2}
            >
              🔍 对比 ({selectedForCompare.length})
            </button>
          )}
          <button 
            className="btn btn-primary" 
            onClick={() => activeTab === 'reports' ? setShowReportUploadModal(true) : setShowUploadModal(true)}
          >
            <span>+</span> {activeTab === 'reports' ? '上传研报' : '添加素材'}
          </button>
        </div>
      </div>

      {/* 对比模式横幅 */}
      {activeTab === 'reports' && compareMode && (
        <div className="compare-banner">
          <span>📊 对比模式：请选择2-3篇研报进行对比</span>
          <span className="selected-count">已选择: {selectedForCompare.length}/3</span>
        </div>
      )}

      {/* Tab切换 */}
      <div className="assets-tabs">
        <button
          className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
          onClick={() => { setActiveTab('assets'); setFilter('all'); }}
        >
          <span className="tab-icon">📚</span>
          <span className="tab-label">素材库</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => { setActiveTab('reports'); setFilter('report'); }}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">研报</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'popular' ? 'active' : ''}`}
          onClick={() => setActiveTab('popular')}
        >
          <span className="tab-icon">🔥</span>
          <span className="tab-label">热门素材</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'rss' ? 'active' : ''}`}
          onClick={() => setActiveTab('rss')}
        >
          <span className="tab-icon">📡</span>
          <span className="tab-label">RSS订阅</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'bindings' ? 'active' : ''}`}
          onClick={() => setActiveTab('bindings')}
        >
          <span className="tab-icon">📁</span>
          <span className="tab-label">目录绑定</span>
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="search-filter-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder={activeTab === 'reports' ? "搜索研报标题、机构、作者..." : "搜索素材..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={() => {}}>
            🔍
          </button>
        </div>
      </div>

      {/* 研报列表 */}
      {activeTab === 'reports' && (
        <div className="reports-content">
          {loading ? (
            <div className="loading">加载研报...</div>
          ) : filteredAssets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <div className="empty-title">暂无研报</div>
              <p>点击"上传研报"添加您的第一篇研报</p>
            </div>
          ) : (
            <div className="reports-grid">
              {filteredAssets.map((report) => (
                <div 
                  key={report.id} 
                  className={`report-card ${compareMode ? 'selectable' : ''} ${selectedForCompare.includes(report.id) ? 'selected' : ''}`}
                  onClick={() => {
                    if (compareMode) {
                      toggleSelectForCompare(report.id);
                    } else {
                      navigate(`/assets/reports/${report.id}`);
                    }
                  }}
                >
                  {compareMode && (
                    <div className="select-indicator">
                      {selectedForCompare.includes(report.id) ? '✓' : ''}
                    </div>
                  )}
                  <div className="report-header">
                    <span className="report-icon">📊</span>
                    <span className={`report-status ${report.status}`}>
                      {getReportStatusLabel(report.status)}
                    </span>
                  </div>
                  <h3 className="report-title">{report.title}</h3>
                  <div className="report-meta">
                    {report.institution && (
                      <span className="institution">🏢 {report.institution}</span>
                    )}
                    {report.authors && report.authors.length > 0 && (
                      <span className="authors">👤 {report.authors.slice(0, 2).join(', ')}</span>
                    )}
                    {report.page_count && (
                      <span className="pages">📄 {report.page_count}页</span>
                    )}
                    {report.publish_date && (
                      <span className="date">📅 {new Date(report.publish_date).toLocaleDateString()}</span>
                    )}
                  </div>
                  {report.key_points && report.key_points.length > 0 && (
                    <div className="key-points">
                      {report.key_points.slice(0, 3).map((point, idx) => (
                        <span key={idx} className="key-point">• {point}</span>
                      ))}
                    </div>
                  )}
                  {report.quality_score > 0 && (
                    <div className="quality-score">
                      <span className="score-label">质量分</span>
                      <span className="score-value" style={{
                        color: report.quality_score >= 80 ? '#52c41a' : 
                               report.quality_score >= 60 ? '#faad14' : '#ff4d4f'
                      }}>
                        {report.quality_score}
                      </span>
                    </div>
                  )}
                  <div className="report-actions">
                    <button 
                      className="btn-sm"
                      onClick={(e) => { e.stopPropagation(); openEditModal(report); }}
                    >
                      编辑
                    </button>
                    <button 
                      className="btn-sm btn-danger" 
                      onClick={(e) => { e.stopPropagation(); handleDelete(report); }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 素材列表 */}
      {activeTab === 'assets' && (
        <div className="assets-layout">
          {/* 左侧主题导航 */}
          <div className="theme-sidebar">
            <div className="sidebar-header">
              <span>主题分类</span>
              <button className="btn-icon" onClick={() => setShowCreateThemeModal(true)}>
                +
              </button>
            </div>
            <div className="theme-list">
              <div
                className={`theme-item ${selectedTheme === null ? 'active' : ''}`}
                onClick={() => setSelectedTheme(null)}
              >
                <span>📋</span>
                <span className="theme-name">全部</span>
                <span className="theme-count">{assets.filter(a => a.asset_type !== 'report').length}</span>
              </div>
              <div
                className={`theme-item ${selectedTheme === 'uncategorized' ? 'active' : ''}`}
                onClick={() => setSelectedTheme('uncategorized')}
              >
                <span>📑</span>
                <span className="theme-name">未分类</span>
                <span className="theme-count">{assets.filter((a) => !a.theme_id && a.asset_type !== 'report').length}</span>
              </div>
              {sortedThemes.map((theme) => (
                <div
                  key={theme.id}
                  className={`theme-item ${selectedTheme === theme.id ? 'active' : ''}`}
                  onClick={() => setSelectedTheme(theme.id)}
                >
                  <span>{theme.is_pinned ? '📌' : theme.icon || '📁'}</span>
                  <span className="theme-name">{theme.name}</span>
                  <span className="theme-count">
                    {assets.filter((a) => a.theme_id === theme.id).length}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="assets-content">
            {/* 筛选栏 */}
            <div className="filter-bar">
              <div className="filter-buttons">
                <button
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  全部
                </button>
                <button
                  className={`filter-btn ${filter === 'pinned' ? 'active' : ''}`}
                  onClick={() => setFilter('pinned')}
                >
                  📌 置顶
                </button>
                <button
                  className={`filter-btn ${filter === 'pdf' ? 'active' : ''}`}
                  onClick={() => setFilter('pdf')}
                >
                  PDF
                </button>
                <button
                  className={`filter-btn ${filter === 'txt' ? 'active' : ''}`}
                  onClick={() => setFilter('txt')}
                >
                  文本
                </button>
                <button
                  className={`filter-btn ${filter === 'image' ? 'active' : ''}`}
                  onClick={() => setFilter('image')}
                >
                  图片
                </button>
              </div>
            </div>

            {/* 素材网格 */}
            {loading ? (
              <div className="loading">加载中...</div>
            ) : error ? (
              <div className="error">{error}</div>
            ) : filteredAssets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <div className="empty-title">
                  {searchQuery ? '未找到匹配的素材' : '暂无素材'}
                </div>
                <p>
                  {searchQuery
                    ? '请尝试其他搜索词'
                    : '点击"添加素材"按钮创建第一个素材'}
                </p>
              </div>
            ) : (
              <div className="assets-grid">
                {filteredAssets.map((asset) => (
                  <div key={asset.id} className="asset-card" onClick={() => navigate(`/assets/${asset.id}`)}>
                    {asset.is_pinned && <span className="pin-badge">📌</span>}
                    <div className="asset-preview">
                      {asset.content_type?.startsWith('image/') && asset.filename ? (
                        <LazyImage src={asset.filename} alt={asset.title} />
                      ) : (
                        <div className="asset-icon">{getAssetIcon(asset)}</div>
                      )}
                    </div>
                    <div className="asset-info">
                      <div className="asset-title" title={asset.title}>
                        {asset.title}
                      </div>
                      <div className="asset-meta">
                        <span>{asset.content_type?.toUpperCase()}</span>
                        <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                      </div>
                      {getThemeName(asset.theme_id) && (
                        <div className="asset-theme">{getThemeName(asset.theme_id)}</div>
                      )}
                      <div className="asset-stats-row">
                        <div className="stat-item">
                          <span className="stat-label">质量</span>
                          <span
                            className="stat-value"
                            style={{
                              color:
                                asset.quality_score >= 80
                                  ? '#52c41a'
                                  : asset.quality_score >= 60
                                  ? '#faad14'
                                  : '#ff4d4f',
                            }}
                          >
                            {asset.quality_score || '--'}
                          </span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">引用</span>
                          <span className="stat-value">{asset.citation_count || 0}</span>
                        </div>
                      </div>
                      {asset.auto_tags?.length > 0 && (
                        <div className="asset-tags">
                          {asset.auto_tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="tag">
                              {tag.tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="asset-content-preview">
                        {asset.content?.substring(0, 100) || '暂无预览内容'}
                        {asset.content?.length > 100 ? '...' : ''}
                      </div>
                      <div className="asset-actions">
                        <button className="btn-sm" onClick={(e) => { e.stopPropagation(); openEditModal(asset); }}>
                          编辑
                        </button>
                        <button className="btn-sm" onClick={(e) => { e.stopPropagation(); handleTogglePin(asset); }}>
                          {asset.is_pinned ? '取消置顶' : '置顶'}
                        </button>
                        <button className="btn-sm btn-expert" onClick={(e) => { e.stopPropagation(); setExpertReviewAsset(asset); }}>
                          🎯 专家评估
                        </button>
                        <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(asset); }}>
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 其他 Tabs 保持原有实现 */}
      {activeTab === 'popular' && (
        <PopularAssetsTab navigate={navigate} assets={assets.filter(a => a.asset_type !== 'report')} />
      )}

      {activeTab === 'rss' && (
        <RSSTab navigate={navigate} />
      )}

      {activeTab === 'bindings' && (
        <BindingsTab 
          bindings={bindings} 
          themes={themes} 
          getThemeName={getThemeName}
          onScan={handleScanBinding}
          onDelete={handleDeleteBinding}
          onCreate={() => setShowCreateBindingModal(true)}
        />
      )}

      {/* 上传素材弹窗 */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>上传素材</h3>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div
                className="upload-area"
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    setUploadForm((prev) => ({
                      ...prev,
                      file,
                      title: file.name.replace(/\.[^/.]+$/, ''),
                    }));
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                {uploadForm.file ? (
                  <div className="upload-preview">
                    <div className="upload-icon">📄</div>
                    <div className="upload-filename">{uploadForm.file.name}</div>
                    <div className="upload-size">
                      {(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="upload-icon">📤</div>
                    <p>点击或拖拽文件到此处上传</p>
                    <p className="upload-hint">支持 PDF、Word、图片、文本等格式</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
              </div>
              <div className="form-group">
                <label>标题</label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder="素材标题"
                />
              </div>
              <div className="form-group">
                <label>来源</label>
                <input
                  type="text"
                  value={uploadForm.source}
                  onChange={(e) => setUploadForm({ ...uploadForm, source: e.target.value })}
                  placeholder="素材来源（如网址、书籍等）"
                />
              </div>
              <div className="form-group">
                <label>所属主题</label>
                <select
                  value={uploadForm.themeId}
                  onChange={(e) => setUploadForm({ ...uploadForm, themeId: e.target.value })}
                >
                  <option value="">-- 选择主题 --</option>
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.icon || '📁'} {theme.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>标签（用逗号分隔）</label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                  placeholder="例如：投资, 房地产, 政策"
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

      {/* 上传研报弹窗 */}
      {showReportUploadModal && (
        <div className="modal-overlay" onClick={() => setShowReportUploadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📊 上传研报</h3>
              <button className="modal-close" onClick={() => setShowReportUploadModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div
                className="upload-area"
                onClick={() => reportFileInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    setReportUploadForm((prev) => ({
                      ...prev,
                      file,
                      title: file.name.replace(/\.[^/.]+$/, ''),
                    }));
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                {reportUploadForm.file ? (
                  <div className="upload-preview">
                    <div className="upload-icon">📊</div>
                    <div className="upload-filename">{reportUploadForm.file.name}</div>
                    <div className="upload-size">
                      {(reportUploadForm.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="upload-icon">📤</div>
                    <p>点击或拖拽研报文件到此处上传</p>
                    <p className="upload-hint">支持 PDF、Word 格式研报</p>
                  </>
                )}
                <input
                  ref={reportFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  style={{ display: 'none' }}
                  onChange={handleReportFileSelect}
                />
              </div>
              <div className="form-group">
                <label>研报标题</label>
                <input
                  type="text"
                  value={reportUploadForm.title}
                  onChange={(e) => setReportUploadForm({ ...reportUploadForm, title: e.target.value })}
                  placeholder="研报标题"
                />
              </div>
              <div className="form-group">
                <label>来源机构</label>
                <input
                  type="text"
                  value={reportUploadForm.source}
                  onChange={(e) => setReportUploadForm({ ...reportUploadForm, source: e.target.value })}
                  placeholder="如：中信证券、摩根士丹利"
                />
              </div>
              <div className="form-group">
                <label>标签（用逗号分隔）</label>
                <input
                  type="text"
                  value={reportUploadForm.tags}
                  onChange={(e) => setReportUploadForm({ ...reportUploadForm, tags: e.target.value })}
                  placeholder="例如：宏观经济, 投资策略, 年度展望"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowReportUploadModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleReportUpload}
                disabled={!reportUploadForm.file}
              >
                上传研报
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {showEditModal && editingAsset && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑{editingAsset.asset_type === 'report' ? '研报' : '素材'}</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>标题</label>
                <input
                  type="text"
                  value={editingAsset.title || ''}
                  onChange={(e) =>
                    setEditingAsset({ ...editingAsset, title: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>来源</label>
                <input
                  type="text"
                  value={editingAsset.source || ''}
                  onChange={(e) =>
                    setEditingAsset({ ...editingAsset, source: e.target.value })
                  }
                />
              </div>
              {editingAsset.asset_type !== 'report' && (
                <div className="form-group">
                  <label>所属主题</label>
                  <select
                    value={editingAsset.theme_id || ''}
                    onChange={(e) =>
                      setEditingAsset({ ...editingAsset, theme_id: e.target.value || undefined })
                    }
                  >
                    <option value="">-- 无主题 --</option>
                    {themes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.icon || '📁'} {theme.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>标签（用逗号分隔）</label>
                <input
                  type="text"
                  value={(editingAsset.tags || []).join(', ')}
                  onChange={(e) =>
                    setEditingAsset({
                      ...editingAsset,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>内容摘要</label>
                <textarea
                  rows={6}
                  value={editingAsset.content || ''}
                  onChange={(e) =>
                    setEditingAsset({ ...editingAsset, content: e.target.value })
                  }
                  placeholder="素材内容的摘要或关键信息..."
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
              <button className="modal-close" onClick={() => setShowCreateThemeModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>主题名称 *</label>
                <input
                  type="text"
                  value={themeForm.name}
                  onChange={(e) => setThemeForm({ ...themeForm, name: e.target.value })}
                  placeholder="例如：保租房研究"
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <input
                  type="text"
                  value={themeForm.description}
                  onChange={(e) =>
                    setThemeForm({ ...themeForm, description: e.target.value })
                  }
                  placeholder="主题描述（可选）"
                />
              </div>
              <div className="form-group">
                <label>图标</label>
                <select
                  value={themeForm.icon}
                  onChange={(e) => setThemeForm({ ...themeForm, icon: e.target.value })}
                >
                  <option value="📁">📁 文件夹</option>
                  <option value="📊">📊 图表</option>
                  <option value="📈">📈 趋势</option>
                  <option value="🏠">🏠 房产</option>
                  <option value="💰">💰 金融</option>
                  <option value="🔬">🔬 研究</option>
                  <option value="📰">📰 新闻</option>
                  <option value="📚">📚 书籍</option>
                </select>
              </div>
              <div className="form-group">
                <label>颜色</label>
                <select
                  value={themeForm.color}
                  onChange={(e) => setThemeForm({ ...themeForm, color: e.target.value })}
                >
                  <option value="#6366f1">紫色</option>
                  <option value="#22c55e">绿色</option>
                  <option value="#f59e0b">橙色</option>
                  <option value="#ec4899">粉色</option>
                  <option value="#06b6d4">青色</option>
                  <option value="#ef4444">红色</option>
                </select>
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

      {/* 创建目录绑定弹窗 */}
      {showCreateBindingModal && (
        <div className="modal-overlay" onClick={() => setShowCreateBindingModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加目录绑定</h3>
              <button className="modal-close" onClick={() => setShowCreateBindingModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>绑定名称 *</label>
                <input
                  type="text"
                  value={bindingForm.name}
                  onChange={(e) => setBindingForm({ ...bindingForm, name: e.target.value })}
                  placeholder="例如：研报目录"
                />
              </div>
              <div className="form-group">
                <label>目录路径 *</label>
                <input
                  type="text"
                  value={bindingForm.path}
                  onChange={(e) => setBindingForm({ ...bindingForm, path: e.target.value })}
                  placeholder="/path/to/directory 或 C:\\Documents\\Reports"
                />
              </div>
              <div className="form-group">
                <label>关联主题</label>
                <select
                  value={bindingForm.themeId}
                  onChange={(e) => setBindingForm({ ...bindingForm, themeId: e.target.value })}
                >
                  <option value="">-- 不关联主题 --</option>
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.icon || '📁'} {theme.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={bindingForm.autoSync}
                    onChange={(e) =>
                      setBindingForm({ ...bindingForm, autoSync: e.target.checked })
                    }
                  />
                  自动同步
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateBindingModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateBinding}
                disabled={!bindingForm.name.trim() || !bindingForm.path.trim()}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 专家标注弹窗 */}
      {expertReviewAsset && (
        <AssetExpertReviewModal
          assetId={expertReviewAsset.id}
          assetTitle={expertReviewAsset.title}
          isOpen={!!expertReviewAsset}
          onClose={() => setExpertReviewAsset(null)}
        />
      )}
    </div>
  );
}

// 热门素材子组件
function PopularAssetsTab({ navigate, assets }: { navigate: ReturnType<typeof useNavigate>; assets: ExtendedAsset[] }) {
  const sortedAssets = [...assets]
    .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0))
    .slice(0, 10);

  const getAssetTypeIcon = (contentType?: string) => {
    if (contentType?.startsWith('image/')) return '🖼️';
    if (contentType?.includes('pdf')) return '📄';
    if (contentType?.includes('text')) return '📃';
    return '📎';
  };

  return (
    <div className="popular-assets-tab">
      <div className="tab-header">
        <p className="tab-desc">按引用次数排序，发现最有价值的素材</p>
      </div>

      {sortedAssets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-title">暂无热门素材</div>
          <p>还没有素材被引用，快去使用素材吧！</p>
        </div>
      ) : (
        <div className="popular-list">
          {sortedAssets.map((item, index) => (
            <div
              key={item.id}
              className={`popular-item rank-${index + 1}`}
              onClick={() => navigate(`/assets/${item.id}`)}
            >
              <div className="rank-badge">
                {index < 3 ? (
                  <span className={`medal rank-${index + 1}`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                  </span>
                ) : (
                  <span className="rank-number">{index + 1}</span>
                )}
              </div>

              <div className="asset-icon">{getAssetTypeIcon(item.content_type)}</div>

              <div className="asset-info">
                <h3 className="asset-title" title={item.title}>
                  {item.title}
                </h3>
                <div className="asset-meta">
                  <span className="source">{item.source || '未知来源'}</span>
                  {item.tags && item.tags.length > 0 && (
                    <span className="tags">
                      {item.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="tag">#{tag}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>

              <div className="usage-stats">
                <div className="stat quote-count">
                  <span className="stat-value">{item.citation_count || 0}</span>
                  <span className="stat-label">次引用</span>
                </div>
                <div className="stat last-used">
                  <span className="stat-value">
                    {item.updated_at
                      ? new Date(item.updated_at).toLocaleDateString()
                      : '--'}
                  </span>
                  <span className="stat-label">最后使用</span>
                </div>
              </div>

              <div className="asset-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/assets/${item.id}`);
                  }}
                >
                  查看
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// RSS订阅子组件
function RSSTab({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [sources, setSources] = useState<Array<{id: string; name: string; url: string; category?: string; isActive: boolean; lastCrawledAt?: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'sources' | 'items'>('items');

  useEffect(() => {
    loadRSSData();
  }, []);

  const loadRSSData = async () => {
    setLoading(true);
    try {
      const sourcesRes = await rssSourcesApi.getAll();
      setSources(sourcesRes.items || []);
    } catch (err) {
      console.error('Failed to load RSS data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCrawl = async () => {
    try {
      await rssSourcesApi.triggerCrawl();
      alert('RSS抓取已触发');
      loadRSSData();
    } catch (error) {
      console.error('Failed to trigger crawl:', error);
    }
  };

  return (
    <div className="rss-tab">
      <div className="tab-header">
        <div className="rss-subtabs">
          <button
            className={`subtab-btn ${activeSubTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('items')}
          >
            📰 RSS文章
          </button>
          <button
            className={`subtab-btn ${activeSubTab === 'sources' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('sources')}
          >
            📡 源管理
          </button>
        </div>
        <button className="btn btn-primary" onClick={handleTriggerCrawl}>
          🔄 立即抓取
        </button>
      </div>

      {activeSubTab === 'sources' ? (
        <div className="rss-sources-section">
          {sources.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📡</div>
              <div className="empty-title">暂无RSS源</div>
              <p>请前往设置添加RSS源</p>
            </div>
          ) : (
            <div className="rss-sources-list">
              {sources.map((source) => (
                <div key={source.id} className="rss-source-card">
                  <div className="source-info">
                    <h4 className="source-name">{source.name}</h4>
                    <span className="source-category">{source.category || '未分类'}</span>
                    <span className={`source-status ${source.isActive ? 'active' : 'inactive'}`}>
                      {source.isActive ? '● 启用' : '○ 停用'}
                    </span>
                  </div>
                  <div className="source-url">{source.url}</div>
                  {source.lastCrawledAt && (
                    <div className="source-last-crawl">
                      上次抓取: {new Date(source.lastCrawledAt).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rss-items-section">
          <div className="empty-state">
            <div className="empty-icon">📰</div>
            <div className="empty-title">RSS文章</div>
            <p>点击"立即抓取"获取最新文章</p>
            <button className="btn btn-secondary" onClick={() => navigate('/rss-items')}>
              查看全部文章 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 目录绑定子组件
interface BindingsTabProps {
  bindings: DirectoryBinding[];
  themes: AssetTheme[];
  getThemeName: (themeId?: string) => string | null | undefined;
  onScan: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

function BindingsTab({ bindings, getThemeName, onScan, onDelete, onCreate }: BindingsTabProps) {
  return (
    <div className="bindings-content">
      <div className="bindings-header">
        <p className="bindings-desc">绑定本地目录，自动同步文件到素材库</p>
        <button className="btn btn-primary" onClick={onCreate}>
          + 添加目录绑定
        </button>
      </div>

      {bindings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <div className="empty-title">暂无目录绑定</div>
          <p>添加目录绑定，自动同步文件到素材库</p>
        </div>
      ) : (
        <div className="bindings-grid">
          {bindings.map((binding) => (
            <div key={binding.id} className="binding-card">
              <div className="binding-header">
                <h3>{binding.name}</h3>
                <span className={`sync-badge ${binding.autoSync ? 'auto' : 'manual'}`}>
                  {binding.autoSync ? '自动同步' : '手动同步'}
                </span>
              </div>
              <div className="binding-path">{binding.path}</div>
              {getThemeName(binding.theme_id) && (
                <div className="binding-theme">主题: {getThemeName(binding.theme_id)}</div>
              )}
              <div className="binding-stats">
                <span>文件数: {binding.fileCount}</span>
                {binding.lastScannedAt && (
                  <span>上次扫描: {new Date(binding.lastScannedAt).toLocaleString()}</span>
                )}
              </div>
              <div className="binding-actions">
                <button className="btn-sm" onClick={() => onScan(binding.id)}>
                  🔄 扫描
                </button>
                <button className="btn-sm btn-danger" onClick={() => onDelete(binding.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
