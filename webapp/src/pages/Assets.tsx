// Assets.tsx
// v3.0.3: 素材库页面（仅保留素材库功能，其他 tabs 已拆分为独立路由）

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  assetsApi, 
  themesApi, 
  type Asset, 
  type AssetTheme,
} from '../api/client';
import { LazyImage } from '../components/LazyImage';
import { getAssetCompositeScore } from '../services/expertService';
import './Assets.css';

// 扩展 Asset 类型
type AssetType = 'file' | 'report' | 'quote' | 'data' | 'rss_item';
interface ExtendedAsset extends Asset {
  asset_type: AssetType;
}

type FilterType = 'all' | 'pinned' | 'pdf' | 'txt' | 'image';

export function Assets() {
  const navigate = useNavigate();

  // 数据状态
  const [assets, setAssets] = useState<ExtendedAsset[]>([]);
  const [themes, setThemes] = useState<AssetTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI状态
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateThemeModal, setShowCreateThemeModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ExtendedAsset | null>(null);

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
      const extendedAssets: ExtendedAsset[] = (assetsRes.items || []).map(a => ({
        ...a,
        asset_type: 'file' as AssetType,
        quality_score: typeof a.quality_score === 'string' 
          ? parseFloat(a.quality_score) 
          : a.quality_score,
        content: a.content || (a as any).content_preview || '',
      }));
      setAssets(extendedAssets);
      setThemes(themesRes || []);
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
  const openEditModal = (asset: ExtendedAsset) => {
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

  // 删除素材
  const handleDelete = async (asset: ExtendedAsset) => {
    if (!confirm('确定要删除这个素材吗？')) return;
    try {
      await assetsApi.delete(asset.id);
      loadData();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 切换置顶
  const handleTogglePin = async (asset: ExtendedAsset) => {
    try {
      await assetsApi.update(asset.id, { is_pinned: !asset.is_pinned });
      loadData();
    } catch (err) {
      alert('操作失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 创建主题
  const handleCreateTheme = async () => {
    try {
      await themesApi.create({
        name: themeForm.name,
        description: themeForm.description,
        icon: themeForm.icon,
        color: themeForm.color,
      });
      setShowCreateThemeModal(false);
      setThemeForm({ name: '', description: '', icon: '📁', color: '#6366f1' });
      loadData();
    } catch (err) {
      alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 获取质量分颜色
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  // 渲染素材卡片
  const renderAssetCard = (asset: ExtendedAsset) => {
    const score = asset.quality_score || 0;
    const compositeScore = getAssetCompositeScore(asset);
    const theme = themes.find((t) => t.id === asset.theme_id);

    return (
      <div
        key={asset.id}
        className={`asset-card ${asset.is_pinned ? 'pinned' : ''}`}
        onClick={() => navigate(`/assets/${asset.id}`)}
      >
        {asset.is_pinned && <span className="pin-badge">📌</span>}
        
        <div className="asset-preview">
          {asset.content_type?.startsWith('image/') ? (
            <LazyImage
              src={`/api/v1/assets/${asset.id}/preview`}
              alt={asset.title}
            />
          ) : asset.content_type?.includes('pdf') ? (
            <div className="file-icon pdf">📄</div>
          ) : (
            <div className="file-icon">📄</div>
          )}
        </div>

        <div className="asset-info">
          <h3 className="asset-title" title={asset.title}>
            {asset.title}
          </h3>
          
          {theme && (
            <span
              className="theme-badge"
              style={{ backgroundColor: theme.color + '20', color: theme.color }}
            >
              {theme.icon} {theme.name}
            </span>
          )}

          <div className="asset-meta">
            <span className="source">{asset.source || '未知来源'}</span>
            <span className="date">
              {new Date(asset.created_at).toLocaleDateString()}
            </span>
          </div>

          {asset.tags && asset.tags.length > 0 && (
            <div className="asset-tags">
              {asset.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="tag">#{tag}</span>
              ))}
            </div>
          )}

          <div className="asset-footer">
            <div className="quality-score">
              <span className="score-label">质量分</span>
              <span
                className="score-value"
                style={{ color: getScoreColor(score) }}
              >
                {score.toFixed(1)}
              </span>
            </div>
            
            {compositeScore && (
              <div className="composite-score" title="专家综合评分">
                <span className="score-label">专家分</span>
                <span className="score-value" style={{ color: getScoreColor(compositeScore) }}>
                  {compositeScore}
                </span>
              </div>
            )}
            
            <div className="citations">
              <span>📎 {asset.citation_count || 0}</span>
            </div>
          </div>
        </div>

        <div className="asset-actions">
          <button
            className="btn-icon"
            onClick={(e) => { e.stopPropagation(); handleTogglePin(asset); }}
            title={asset.is_pinned ? '取消置顶' : '置顶'}
          >
            {asset.is_pinned ? '📌' : '📍'}
          </button>
          <button
            className="btn-icon"
            onClick={(e) => { e.stopPropagation(); openEditModal(asset); }}
            title="编辑"
          >
            ✏️
          </button>
          <button
            className="btn-icon btn-danger"
            onClick={(e) => { e.stopPropagation(); handleDelete(asset); }}
            title="删除"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  if (loading && assets.length === 0) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="assets-library">
      {/* 工具栏 - 优化布局 */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="toolbar-label">筛选:</span>
          <div className="filter-pills">
            <button
              className={`pill ${filter === 'all' && !selectedTheme ? 'active' : ''}`}
              onClick={() => { setFilter('all'); setSelectedTheme(null); }}
            >
              全部
            </button>
            <button
              className={`pill ${filter === 'pinned' ? 'active' : ''}`}
              onClick={() => setFilter('pinned')}
            >
              📌 置顶
            </button>
            <button
              className={`pill ${filter === 'pdf' ? 'active' : ''}`}
              onClick={() => setFilter('pdf')}
            >
              📄 PDF
            </button>
            <button
              className={`pill ${filter === 'image' ? 'active' : ''}`}
              onClick={() => setFilter('image')}
            >
              🖼️ 图片
            </button>
            <button
              className={`pill ${filter === 'txt' ? 'active' : ''}`}
              onClick={() => setFilter('txt')}
            >
              📃 文本
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="搜索素材..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            <span>+</span> 添加素材
          </button>
        </div>
      </div>

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
              <span className="theme-icon">📚</span>
              <span className="theme-name">全部素材</span>
              <span className="theme-count">{assets.length}</span>
            </div>
            <div
              className={`theme-item ${selectedTheme === 'uncategorized' ? 'active' : ''}`}
              onClick={() => setSelectedTheme('uncategorized')}
            >
              <span className="theme-icon">📂</span>
              <span className="theme-name">未分类</span>
              <span className="theme-count">
                {assets.filter((a) => !a.theme_id).length}
              </span>
            </div>
            {themes.map((theme) => (
              <div
                key={theme.id}
                className={`theme-item ${selectedTheme === theme.id ? 'active' : ''}`}
                onClick={() => setSelectedTheme(theme.id)}
              >
                <span className="theme-icon">{theme.icon}</span>
                <span className="theme-name">{theme.name}</span>
                <span className="theme-count">
                  {assets.filter((a) => a.theme_id === theme.id).length}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 素材网格 */}
        <div className="assets-grid-container">
          {filteredAssets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">暂无素材</div>
              <p>点击"添加素材"上传您的第一个文件</p>
            </div>
          ) : (
            <div className="assets-grid">
              {filteredAssets.map(renderAssetCard)}
            </div>
          )}
        </div>
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
    </div>
  );
}

export default Assets;
