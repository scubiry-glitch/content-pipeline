import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetsApi, themesApi, bindingsApi, type Asset, type AssetTheme, type DirectoryBinding } from '../api/client';
import { LazyImage } from '../components/LazyImage';
import { AssetExpertReviewModal } from '../components/AssetExpertReviewModal';
import { getAssetCompositeScore } from '../services/expertService';
import './Assets.css';

type FilterType = 'all' | 'pinned' | 'pdf' | 'txt' | 'image';
type AssetTab = 'assets' | 'bindings';

export function Assets() {
  const navigate = useNavigate();

  // 数据状态
  const [assets, setAssets] = useState<Asset[]>([]);
  const [themes, setThemes] = useState<AssetTheme[]>([]);
  const [bindings, setBindings] = useState<DirectoryBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI状态
  const [activeTab, setActiveTab] = useState<AssetTab>('assets');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateThemeModal, setShowCreateThemeModal] = useState(false);
  const [showCreateBindingModal, setShowCreateBindingModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [expertReviewAsset, setExpertReviewAsset] = useState<Asset | null>(null);

  // 表单状态
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    title: '',
    source: '',
    themeId: '',
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsRes, themesRes, bindingsRes] = await Promise.all([
        assetsApi.getAll({ limit: 100 }),
        themesApi.getAll(),
        bindingsApi.getAll(),
      ]);
      setAssets(assetsRes.items || []);
      setThemes(themesRes || []);
      setBindings(bindingsRes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
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

    // 主题筛选
    if (selectedTheme === 'uncategorized') return !asset.theme_id;
    if (selectedTheme) return asset.theme_id === selectedTheme;

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

    try {
      await assetsApi.create(formData);
      setShowUploadModal(false);
      setUploadForm({ file: null, title: '', source: '', themeId: '', tags: '' });
      loadData();
    } catch (err) {
      alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 打开编辑弹窗
  const openEditModal = (asset: Asset) => {
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
      });
      setShowEditModal(false);
      setEditingAsset(null);
      loadData();
    } catch (err) {
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 切换置顶
  const handleTogglePin = async (asset: Asset) => {
    try {
      await assetsApi.togglePin(asset.id, !asset.is_pinned);
      loadData();
    } catch (err) {
      console.error('置顶失败:', err);
    }
  };

  // 删除素材
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个素材吗？')) return;
    try {
      await assetsApi.delete(id);
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
  const getAssetIcon = (contentType: string) => {
    if (contentType?.startsWith('image/')) return '🖼️';
    if (contentType?.includes('pdf')) return '📄';
    if (contentType?.includes('word') || contentType?.includes('document')) return '📝';
    if (contentType?.includes('text') || contentType?.includes('txt')) return '📃';
    if (contentType?.includes('excel') || contentType?.includes('sheet')) return '📊';
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

  return (
    <div className="assets-page">
      {/* 页面标题 */}
      <div className="assets-header">
        <h1 className="page-title">📚 素材库管理</h1>
        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
          <span>+</span> 添加素材
        </button>
      </div>

      {/* Tab切换 */}
      <div className="assets-tabs">
        <button
          className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
          onClick={() => setActiveTab('assets')}
        >
          📚 素材列表
        </button>
        <button
          className={`tab-btn ${activeTab === 'bindings' ? 'active' : ''}`}
          onClick={() => setActiveTab('bindings')}
        >
          📁 目录绑定
        </button>
      </div>

      {activeTab === 'assets' ? (
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
                <span className="theme-count">{assets.length}</span>
              </div>
              <div
                className={`theme-item ${selectedTheme === 'uncategorized' ? 'active' : ''}`}
                onClick={() => setSelectedTheme('uncategorized')}
              >
                <span>📑</span>
                <span className="theme-name">未分类</span>
                <span className="theme-count">{assets.filter((a) => !a.theme_id).length}</span>
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
              <div className="search-box">
                <input
                  type="text"
                  placeholder="搜索素材..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
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
                        <div className="asset-icon">{getAssetIcon(asset.content_type)}</div>
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
                        <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}>
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
      ) : (
        /* 目录绑定Tab */
        <div className="bindings-content">
          <div className="bindings-header">
            <p className="bindings-desc">绑定本地目录，自动同步文件到素材库</p>
            <button className="btn btn-primary" onClick={() => setShowCreateBindingModal(true)}>
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
                    <button className="btn-sm" onClick={() => handleScanBinding(binding.id)}>
                      🔄 扫描
                    </button>
                    <button className="btn-sm btn-danger" onClick={() => handleDeleteBinding(binding.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 上传弹窗 */}
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

      {/* 编辑弹窗 */}
      {showEditModal && editingAsset && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑素材</h3>
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
